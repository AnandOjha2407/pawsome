/**
 * Firebase service for PawsomeBond v1 — Pipeline Architecture
 *
 * Realtime Database (RTDB) paths (device nodes at root, e.g. PB-001):
 *   - READ  /{deviceId}/live                     — live harness state (subscribeLiveState)
 *   - WRITE /{deviceId}/commands/latest         — agreed firmware envelope (see COMMAND_TYPES_WHITELIST + buildCommandPayload)
 *   - WRITE /userDevices/{uid}                  — deviceId string per user (syncDeviceIdToBackend)
 *
 * Firestore paths:
 *   - devices/{deviceId}/history     — history records (loadHistory)
 *   - devices/{deviceId}/alerts      — alerts (loadAlerts)
 *   - devices/{deviceId}/config/autoCalm — auto-calm settings (loadDeviceConfig, writeDeviceConfig)
 *   - users/{uid}                    — user prefs, deviceId, FCM, profile (saveUserPreferences, loadDogProfile, etc.)
 *
 * Pipe 3: Command feedback via therapyActive in /{deviceId}/live (no separate subscription).
 *
 * Uses modular Firestore API (getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit, startAfter, serverTimestamp) to avoid deprecated namespaced API.
 */
import "@react-native-firebase/app";
import database from "@react-native-firebase/database";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
} from "@react-native-firebase/firestore";
import auth from "@react-native-firebase/auth";
import messaging from "@react-native-firebase/messaging";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MOCK_DEVICE_ID, getMockHistory, getMockAlerts } from "../mock/mockData";
import { DOG_PROFILE_LOCAL_KEY } from "../storage/constants";

const COLLECTIONS = { devices: "devices", users: "users", commands: "commands", history: "history", alerts: "alerts", config: "config", profile: "profile" } as const;
/** RTDB: device nodes are at root (e.g. PB-001/live), not under "devices/". */
const RTDB_PATHS = { userDevices: "userDevices", commandsLatest: "commands/latest" } as const;

const CALM_THROTTLE_MS = 5000;
const STOP_THROTTLE_MS = 2000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 800;

let lastCalmAt = 0;
let lastStopAt = 0;

/**
 * RTDB command `type` values accepted by app + firmware (firmware must whitelist the same set).
 * CONFIG carries auto-calm settings from Settings; confirm with hardware if firmware uses a different name.
 */
export const COMMAND_TYPES_WHITELIST = ["CALM", "STOP", "STATUS", "CONFIG"] as const;
export type CommandType = (typeof COMMAND_TYPES_WHITELIST)[number];

function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Required on every command: fresh timestamp (replay window) + owner UID. */
function getCommandEnvelope(): { timestamp: number; sentBy: string } {
  const u = auth().currentUser;
  if (!u) throw new Error("Sign in to control your harness.");
  return { timestamp: unixSeconds(), sentBy: u.uid };
}

function validateDeviceId(deviceId: string): void {
  const trimmed = deviceId?.trim?.();
  if (!trimmed || trimmed.length > 128) throw new Error("Invalid device ID");
  if (/[\x00-\x1f]/.test(trimmed)) throw new Error("Invalid device ID");
}

function validateCommandInputs(protocol: number, intensity: number, duration: number): void {
  if (!Number.isFinite(protocol) || protocol < 1 || protocol > 8) throw new Error("Protocol must be 1–8");
  if (!Number.isFinite(intensity) || intensity < 1 || intensity > 5) throw new Error("Intensity must be 1–5");
  if (!Number.isFinite(duration) || duration < 1 || duration > 7200) throw new Error("Duration must be 1–7200 seconds");
}

/** Ensures signed-in user and that this device is linked to their account (Firestore + RTDB). */
export async function assertRegisteredUserOwnsDevice(deviceId: string): Promise<void> {
  const user = auth().currentUser;
  if (!user) throw new Error("Sign in to control your harness.");
  const trimmed = deviceId.trim();
  const uid = user.uid;
  const db = getFirestore();
  const userRef = doc(collection(db, COLLECTIONS.users), uid);
  const userSnap = await getDoc(userRef);
  const data = userSnap.data() as { deviceId?: unknown } | undefined;
  const ud = data?.deviceId;
  const fromFs = typeof ud === "string" ? ud.trim() : "";
  if (fromFs === trimmed) return;
  const rtdbSnap = await database().ref(`${RTDB_PATHS.userDevices}/${uid}`).once("value");
  const rtdbVal = rtdbSnap.val();
  if (typeof rtdbVal === "string" && rtdbVal.trim() === trimmed) return;
  throw new Error("This harness is not linked to your account. Open Settings and save your Device ID.");
}

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
    }
  }
  throw lastErr;
}

export type LiveState = {
  state: "SLEEPING" | "CALM" | "ALERT" | "ANXIOUS" | "ACTIVE";
  anxietyScore: number;
  confidence: number;
  activityLevel: number;
  breathingRate: number;
  circuitTemp: number;
  batteryPercent: number;
  connectionType: string;
  therapyActive: string;
  lastUpdated: number;
  calibrationDay?: number;
  calibrationComplete?: boolean;
  firmwareVersion?: string;
  motionEnergy?: number | null;
  motionVariance?: number | null;
  [key: string]: unknown;
};

/** Handout: therapyActive value -> display name and protocol # */
export const THERAPY_ACTIVE_DISPLAY: Record<string, { name: string; protocol?: number }> = {
  NONE: { name: "None active" },
  HEARTBEAT: { name: "Heartbeat Rhythm", protocol: 1 },
  BREATHING: { name: "Breathing Pulse", protocol: 2 },
  BILATERAL: { name: "Bilateral Alternating", protocol: 3 },
  SPINE_WAVE: { name: "Spine Wave", protocol: 4 },
  COMFORT_HOLD: { name: "Comfort Hold", protocol: 5 },
  PROGRESSIVE: { name: "Progressive Calm", protocol: 6 },
  FOCUS: { name: "Focus Pattern", protocol: 7 },
  SLEEP_INDUCER: { name: "Sleep Inducer", protocol: 8 },
};

/** Normalize raw live JSON: every field uses ?? so app never crashes on missing/unknown. */
export function normalizeLiveState(raw: Record<string, unknown> | null): LiveState | null {
  if (!raw || typeof raw !== "object") return null;
  const state = (raw.state ?? "CALM") as LiveState["state"];
  const validStates: LiveState["state"][] = ["SLEEPING", "CALM", "ALERT", "ANXIOUS", "ACTIVE"];
  const safeState = validStates.includes(state) ? state : "CALM";
  return {
    state: safeState,
    anxietyScore: typeof raw.anxietyScore === "number" && Number.isFinite(raw.anxietyScore) ? raw.anxietyScore : 0,
    confidence: typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? raw.confidence : 0,
    activityLevel: typeof raw.activityLevel === "number" && Number.isFinite(raw.activityLevel) ? raw.activityLevel : 0,
    breathingRate: typeof raw.breathingRate === "number" && Number.isFinite(raw.breathingRate) ? raw.breathingRate : 0,
    circuitTemp: typeof raw.circuitTemp === "number" && Number.isFinite(raw.circuitTemp) ? raw.circuitTemp : 0,
    batteryPercent: typeof raw.batteryPercent === "number" && Number.isFinite(raw.batteryPercent) ? raw.batteryPercent : 0,
    connectionType: typeof raw.connectionType === "string" ? raw.connectionType : "wifi",
    therapyActive: typeof raw.therapyActive === "string" ? raw.therapyActive : "NONE",
    lastUpdated: typeof raw.lastUpdated === "number" && Number.isFinite(raw.lastUpdated) ? raw.lastUpdated : 0,
    calibrationDay: typeof raw.calibrationDay === "number" ? raw.calibrationDay : undefined,
    calibrationComplete: raw.calibrationComplete === true,
    firmwareVersion: typeof raw.firmwareVersion === "string" ? raw.firmwareVersion : undefined,
    motionEnergy: typeof raw.motionEnergy === "number" ? raw.motionEnergy : null,
    motionVariance: typeof raw.motionVariance === "number" ? raw.motionVariance : null,
  };
}

/** Shape written to RTDB commands/latest — matches firmware contract + CALM motor fields. */
export type RtdbCalmPayload = {
  type: "CALM";
  timestamp: number;
  sentBy: string;
  protocol: number;
  intensity: number;
  duration: number;
};

export type RtdbStopPayload = {
  type: "STOP";
  timestamp: number;
  sentBy: string;
};

export type RtdbStatusPayload = {
  type: "STATUS";
  timestamp: number;
  sentBy: string;
};

export type RtdbConfigPayload = {
  type: "CONFIG";
  timestamp: number;
  sentBy: string;
  autoCalmEnabled: boolean;
  autoCalmThreshold: number;
  defaultProtocol: number;
  defaultIntensity: number;
};

/** @deprecated Legacy names — prefer Rtdb*Payload */
export type CalmCommand = RtdbCalmPayload;
export type StopCommand = RtdbStopPayload;

/**
 * History and alerts are stored in Firestore and unique per user:
 * - Paths: /devices/{device_id}/history and /devices/{device_id}/alerts
 * - device_id is set per user in the app (Settings), so each user sees only their device's data.
 * - Backend/device should write history and alerts with userId when creating docs so each record is attributable to a user.
 */
export type HistoryRecord = {
  id?: string;
  timestamp: Date | import("@react-native-firebase/firestore").FirebaseFirestore.Timestamp;
  state?: "SLEEPING" | "CALM" | "ALERT" | "ANXIOUS" | "ACTIVE";
  anxietyScore?: number;
  /** Optional: set by backend so data is unique per user */
  userId?: string;
  [key: string]: any;
};

export type AlertRecord = {
  id?: string;
  timestamp: Date | import("@react-native-firebase/firestore").FirebaseFirestore.Timestamp;
  type?: string;
  score?: number;
  /** Optional: set by backend so data is unique per user */
  userId?: string;
  [key: string]: any;
};

export const PROTOCOLS = [
  { id: 1, name: "Heartbeat Rhythm", desc: "Gentle heartbeat-like pulses" },
  { id: 2, name: "Breathing Pulse", desc: "Slow rhythmic breathing sensation" },
  { id: 3, name: "Spine Wave", desc: "Wave traveling along the back" },
  { id: 4, name: "Comfort Hold", desc: "Steady gentle pressure, like a hug" },
  { id: 5, name: "Anxiety Wrap", desc: "Rhythmic squeeze-release" },
  { id: 6, name: "Progressive Calm", desc: "Starts strong, gradually softens" },
  { id: 7, name: "Focus Pattern", desc: "Alternating bilateral stimulation" },
  { id: 8, name: "Sleep Inducer", desc: "Ultra-slow breathing for sleep" },
];

/** Pipe 1: READ only. Path: /{deviceId}/live. Call onData with normalized live state (and optionally raw for debug). */
export function subscribeLiveState(
  deviceId: string,
  onData: (data: LiveState | null, raw?: Record<string, unknown> | null) => void
): () => void {
  validateDeviceId(deviceId);
  if (!auth().currentUser) {
    onData(null, null);
    return () => {};
  }
  const id = deviceId.trim();
  const path = `${id}/live`;
  const ref = database().ref(path);
  const callback = (snapshot: any) => {
    try {
      if (__DEV__) console.log("GOT DATA:", path, snapshot.val());
      const val = snapshot.val();
      if (!val || typeof val !== "object") {
        onData(null, null);
        return;
      }
      const raw = val as Record<string, unknown>;
      const normalized = normalizeLiveState(raw);
      onData(normalized, raw);
    } catch (e) {
      if (__DEV__) console.warn("[subscribeLiveState] callback error:", e);
      onData(null, null);
    }
  };
  ref.on("value", callback);
  return () => {
    try {
      ref.off("value", callback);
    } catch (_) {}
  };
}

/** Pipe 2: WRITE /{deviceId}/commands/latest. ESP32 polls, executes, deletes. Returns "ok". */
export async function sendCalmCommand(
  deviceId: string,
  protocol: number,
  intensity: number,
  duration: number
): Promise<string> {
  validateDeviceId(deviceId);
  validateCommandInputs(protocol, intensity, duration);
  await assertRegisteredUserOwnsDevice(deviceId);
  const id = deviceId.trim();
  const now = Date.now();
  if (now - lastCalmAt < CALM_THROTTLE_MS) throw new Error("Please wait a few seconds before sending another calm command");
  lastCalmAt = now;
  return withRetry(async () => {
    const ref = database().ref(`${id}/${RTDB_PATHS.commandsLatest}`);
    const env = getCommandEnvelope();
    const payload: RtdbCalmPayload = {
      type: "CALM",
      ...env,
      protocol,
      intensity,
      duration,
    };
    await ref.set(payload);
    return "ok";
  });
}

/** BLE data bridge: write telemetry JSON from BLE (beb54842) to RTDB /{deviceId}/live. */
export async function writeLiveTelemetry(
  deviceId: string,
  telemetry: Record<string, unknown>
): Promise<void> {
  if (!deviceId || !telemetry) return;
  const id = deviceId.trim();
  if (!id) return;
  try {
    const ref = database().ref(`${id}/live`);
    await ref.update(telemetry);
  } catch (e) {
    if (__DEV__) console.warn("[writeLiveTelemetry] error:", e);
  }
}

/** Pipe 3: Command feedback is via therapyActive in live state (no separate subscription). Kept for compat; no-op. */
export function subscribeCommandStatus(
  _deviceId: string,
  _commandId: string,
  _onStatus: (status: "pending" | "sent" | "delivered" | null) => void
): () => void {
  return () => {};
}

/** Pipe 2: WRITE stop to commands/latest. */
export async function sendStopCommand(deviceId: string): Promise<string> {
  validateDeviceId(deviceId);
  await assertRegisteredUserOwnsDevice(deviceId);
  const id = deviceId.trim();
  const now = Date.now();
  if (now - lastStopAt < STOP_THROTTLE_MS) throw new Error("Please wait a moment before sending stop again");
  lastStopAt = now;
  return withRetry(async () => {
    const ref = database().ref(`${id}/${RTDB_PATHS.commandsLatest}`);
    const env = getCommandEnvelope();
    const payload: RtdbStopPayload = { type: "STOP", ...env };
    await ref.set(payload);
    return "ok";
  });
}

/** Optional: request harness status (firmware must accept type STATUS). */
export async function sendStatusCommand(deviceId: string): Promise<string> {
  validateDeviceId(deviceId);
  await assertRegisteredUserOwnsDevice(deviceId);
  const id = deviceId.trim();
  return withRetry(async () => {
    const ref = database().ref(`${id}/${RTDB_PATHS.commandsLatest}`);
    const env = getCommandEnvelope();
    const payload: RtdbStatusPayload = { type: "STATUS", ...env };
    await ref.set(payload);
    return "ok";
  });
}

/** Config command per 5.5: write to /{deviceId}/commands/latest so device applies auto-calm settings */
export type ConfigCommandPayload = {
  autoCalmEnabled: boolean;
  autoCalmThreshold: number; // 0-100
  defaultProtocol: number;   // 1-8
  defaultIntensity: number; // 1-5
};

function validateConfigPayload(p: ConfigCommandPayload): void {
  if (typeof p.autoCalmEnabled !== "boolean") throw new Error("Invalid autoCalmEnabled");
  if (!Number.isFinite(p.autoCalmThreshold) || p.autoCalmThreshold < 0 || p.autoCalmThreshold > 100) throw new Error("Threshold must be 0–100");
  if (!Number.isFinite(p.defaultProtocol) || p.defaultProtocol < 1 || p.defaultProtocol > 8) throw new Error("Default protocol must be 1–8");
  if (!Number.isFinite(p.defaultIntensity) || p.defaultIntensity < 1 || p.defaultIntensity > 5) throw new Error("Default intensity must be 1–5");
}

/** Pipe 2: WRITE config to commands/latest. Handout: autoCalmEnabled, autoCalmThreshold; we also send defaultProtocol/defaultIntensity for Settings. */
export async function sendConfigCommand(
  deviceId: string,
  payload: ConfigCommandPayload
): Promise<string> {
  validateDeviceId(deviceId);
  validateConfigPayload(payload);
  await assertRegisteredUserOwnsDevice(deviceId);
  const id = deviceId.trim();
  return withRetry(async () => {
    const ref = database().ref(`${id}/${RTDB_PATHS.commandsLatest}`);
    const env = getCommandEnvelope();
    const body: RtdbConfigPayload = {
      type: "CONFIG",
      ...env,
      autoCalmEnabled: payload.autoCalmEnabled,
      autoCalmThreshold: payload.autoCalmThreshold,
      defaultProtocol: payload.defaultProtocol,
      defaultIntensity: payload.defaultIntensity,
    };
    await ref.set(body);
    return "ok";
  });
}

export async function loadHistory(
  deviceId: string,
  startDate: Date,
  endDate: Date,
  limit = 50,
  startAfterTimestamp?: Date | import("@react-native-firebase/firestore").FirebaseFirestore.Timestamp
) {
  if (deviceId === MOCK_DEVICE_ID) {
    const mock = getMockHistory();
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    let filtered = mock
      .filter((r) => r.timestamp.getTime() >= startMs && r.timestamp.getTime() <= endMs)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    if (startAfterTimestamp != null) {
      const afterMs = startAfterTimestamp instanceof Date ? startAfterTimestamp.getTime() : (startAfterTimestamp as any).toDate?.()?.getTime?.() ?? (startAfterTimestamp as any).seconds * 1000;
      filtered = filtered.filter((r) => r.timestamp.getTime() < afterMs);
    }
    return filtered.slice(0, limit).map((r) => ({
      id: r.id,
      timestamp: Timestamp.fromDate(r.timestamp),
      state: r.state,
      anxietyScore: r.anxietyScore,
    }));
  }
  try {
    const db = getFirestore();
    const historyRef = collection(doc(collection(db, "devices"), deviceId), "history");
    const q =
      startAfterTimestamp != null
        ? query(
            historyRef,
            where("timestamp", ">=", startDate),
            where("timestamp", "<=", endDate),
            orderBy("timestamp", "desc"),
            limit(limit),
            startAfter(startAfterTimestamp)
          )
        : query(
            historyRef,
            where("timestamp", ">=", startDate),
            where("timestamp", "<=", endDate),
            orderBy("timestamp", "desc"),
            limit(limit)
          );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    if (__DEV__) console.warn("[loadHistory] Firestore error:", e);
    return [];
  }
}

export async function loadAlerts(
  deviceId: string,
  startDate: Date,
  endDate: Date,
  limit = 50
) {
  if (deviceId === MOCK_DEVICE_ID) {
    const mock = getMockAlerts();
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    return mock
      .filter((r) => r.timestamp.getTime() >= startMs && r.timestamp.getTime() <= endMs)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        timestamp: Timestamp.fromDate(r.timestamp),
        type: r.type,
        score: r.score,
      }));
  }
  try {
    const db = getFirestore();
    const alertsRef = collection(doc(collection(db, "devices"), deviceId), "alerts");
    const q = query(
      alertsRef,
      where("timestamp", ">=", startDate),
      where("timestamp", "<=", endDate),
      orderBy("timestamp", "desc"),
      limit(limit)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    if (__DEV__) console.warn("[loadAlerts] Firestore error:", e);
    return [];
  }
}

/** Auto-calm config written to devices/{deviceId}/config */
export type AutoCalmConfig = {
  enabled: boolean;
  threshold: number; // 0-100
  defaultProtocol: number;
  defaultIntensity: number;
};

export async function writeDeviceConfig(
  deviceId: string,
  config: Partial<AutoCalmConfig>
): Promise<void> {
  await assertRegisteredUserOwnsDevice(deviceId);
  const db = getFirestore();
  const configRef = doc(collection(doc(collection(db, "devices"), deviceId), "config"), "autoCalm");
  await setDoc(configRef, { ...config, updatedAt: serverTimestamp() }, { merge: true });
}

export async function loadDeviceConfig(
  deviceId: string
): Promise<AutoCalmConfig | null> {
  const db = getFirestore();
  const configRef = doc(collection(doc(collection(db, "devices"), deviceId), "config"), "autoCalm");
  const snapshot = await getDoc(configRef);
  const data = snapshot.data();
  if (!data) return null;
  return {
    enabled: !!data.enabled,
    threshold: typeof data.threshold === "number" ? data.threshold : 60,
    defaultProtocol: typeof data.defaultProtocol === "number" ? data.defaultProtocol : 1,
    defaultIntensity: typeof data.defaultIntensity === "number" ? data.defaultIntensity : 3,
  };
}

/** Store FCM token at /users/{uid} (field fcmToken) — 7. Push Notifications. Refresh on app start and on token refresh. */
export async function saveFcmToken(uid: string, token: string): Promise<void> {
  const db = getFirestore();
  const userRef = doc(collection(db, COLLECTIONS.users), uid);
  await setDoc(userRef, { fcmToken: token, fcmTokenUpdatedAt: serverTimestamp() }, { merge: true });
}

/** Sync deviceId to backend so security rules can enforce device ownership. Call when user sets or clears device ID. */
export async function syncDeviceIdToBackend(uid: string, deviceId: string | null): Promise<void> {
  const db = getFirestore();
  const userRef = doc(collection(db, COLLECTIONS.users), uid);
  await setDoc(userRef, { deviceId: deviceId ?? null, deviceIdUpdatedAt: serverTimestamp() }, { merge: true });
  const rtdbRef = database().ref(`${RTDB_PATHS.userDevices}/${uid}`);
  if (deviceId != null && deviceId.trim().length > 0) {
    await rtdbRef.set(deviceId.trim());
  } else {
    await rtdbRef.remove();
  }
}

/** User notification preferences (5.5) — stored in Firestore users/{uid} */
export type UserNotificationPreferences = {
  anxietyAlerts: boolean;
  therapyUpdates: boolean;
  batteryWarnings: boolean;
  connectionAlerts: boolean;
};

const DEFAULT_NOTIFICATION_PREFS: UserNotificationPreferences = {
  anxietyAlerts: true,
  therapyUpdates: true,
  batteryWarnings: true,
  connectionAlerts: true,
};

export async function loadUserPreferences(uid: string): Promise<UserNotificationPreferences> {
  const db = getFirestore();
  const userRef = doc(collection(db, "users"), uid);
  const snapshot = await getDoc(userRef);
  const data = snapshot.data();
  const prefs = data?.notificationPreferences ?? data?.preferences;
  if (!prefs || typeof prefs !== "object") return DEFAULT_NOTIFICATION_PREFS;
  return {
    anxietyAlerts: prefs.anxietyAlerts ?? DEFAULT_NOTIFICATION_PREFS.anxietyAlerts,
    therapyUpdates: prefs.therapyUpdates ?? DEFAULT_NOTIFICATION_PREFS.therapyUpdates,
    batteryWarnings: prefs.batteryWarnings ?? DEFAULT_NOTIFICATION_PREFS.batteryWarnings,
    connectionAlerts: prefs.connectionAlerts ?? DEFAULT_NOTIFICATION_PREFS.connectionAlerts,
  };
}

export async function saveUserPreferences(
  uid: string,
  prefs: Partial<UserNotificationPreferences>
): Promise<void> {
  const db = getFirestore();
  const userRef = doc(collection(db, "users"), uid);
  await setDoc(
    userRef,
    {
      notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFS, ...prefs },
      preferencesUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Dog profile (5.5) — stored in Firestore users/{uid}/profile (single dog for v1) */
export type DogProfile = {
  name: string;
  breed?: string;
  age?: number;
  weight?: number; // lbs
};

export async function loadDogProfile(uid: string): Promise<DogProfile | null> {
  const db = getFirestore();
  const profileRef = doc(collection(doc(collection(db, "users"), uid), "profile"), "dog");
  const snapshot = await getDoc(profileRef);
  const data = snapshot.data();
  if (!data?.name) return null;
  return {
    name: String(data.name),
    breed: data.breed != null ? String(data.breed) : undefined,
    age: typeof data.age === "number" ? data.age : undefined,
    weight: typeof data.weight === "number" ? data.weight : undefined,
  };
}

export async function saveDogProfile(uid: string, profile: Partial<DogProfile>): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(profile)) {
    if (v !== undefined && v !== null && (typeof v !== "number" || Number.isFinite(v))) payload[k] = v;
  }
  const db = getFirestore();
  const profileRef = doc(collection(doc(collection(db, "users"), uid), "profile"), "dog");
  await setDoc(profileRef, payload, { merge: true });
}

/** Fallback: save dog profile to device when Firestore is unavailable (e.g. rules, network, DB not enabled). */
export async function saveDogProfileLocal(profile: Partial<DogProfile>): Promise<void> {
  await AsyncStorage.setItem(DOG_PROFILE_LOCAL_KEY, JSON.stringify(profile));
}

/** Load dog profile from local fallback (used when Firestore fails or returns null). */
export async function loadDogProfileLocal(): Promise<DogProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(DOG_PROFILE_LOCAL_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data?.name) return null;
    return {
      name: String(data.name),
      breed: data.breed != null ? String(data.breed) : undefined,
      age: typeof data.age === "number" ? data.age : undefined,
      weight: typeof data.weight === "number" ? data.weight : undefined,
    };
  } catch {
    return null;
  }
}

/** Request FCM permission and return token if granted. Returns null on any error. */
export async function getFcmToken(): Promise<string | null> {
  try {
    const authStatus = await messaging().requestPermission();
    if (authStatus !== messaging.AuthorizationStatus.AUTHORIZED && authStatus !== messaging.AuthorizationStatus.PROVISIONAL) {
      return null;
    }
    return await messaging().getToken();
  } catch {
    return null;
  }
}

/**
 * 7. Push Notifications — handle notification tap: anxiety -> Dashboard, therapy -> Calm Now.
 * Store FCM token at /users/{uid}/fcmToken (Firestore: users/{uid} doc, field fcmToken). Refresh on app start and onTokenRefresh.
 * Backend should send FCM with data.type for tap routing:
 *   anxiety_alert -> Dashboard | therapy_started, therapy_done -> Calm Now
 *   (low_battery, offline, back_online, calibration_done can use any or dashboard)
 */
export function setupFcmNotificationOpenHandler(navigate: (screen: "dashboard" | "calm") => void): () => void {
  const unsub = messaging().onNotificationOpenedApp((remoteMessage) => {
    const type = remoteMessage?.data?.type as string | undefined;
    if (type === "anxiety_alert") navigate("dashboard");
    else if (type === "therapy_started" || type === "therapy_done") navigate("calm");
    else navigate("dashboard");
  });

  messaging()
    .getInitialNotification()
    .then((remoteMessage) => {
      if (!remoteMessage) return;
      const type = remoteMessage?.data?.type as string | undefined;
      if (type === "anxiety_alert") navigate("dashboard");
      else if (type === "therapy_started" || type === "therapy_done") navigate("calm");
      else navigate("dashboard");
    })
    .catch(() => {});

  return () => unsub();
}
