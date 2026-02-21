/**
 * Firebase service for PawsomeBond v1
 * Realtime DB: live state | Firestore: commands, history
 */
import "@react-native-firebase/app";
import database from "@react-native-firebase/database";
import firestore from "@react-native-firebase/firestore";
import auth from "@react-native-firebase/auth";
import messaging from "@react-native-firebase/messaging";
import { MOCK_DEVICE_ID, getMockHistory, getMockAlerts } from "../mock/mockData";

export type LiveState = {
  state: "SLEEPING" | "CALM" | "ALERT" | "ANXIOUS" | "ACTIVE";
  anxietyScore: number;
  confidence: number;
  activityLevel: number;
  breathingRate: number;
  circuitTemp: number;
  batteryPercent: number;
  connectionType: "wifi" | "ble";
  therapyActive: string;
  lastUpdated: number;
  /** Calibration: 1-5, from device */
  calibrationDay?: number;
  calibrationComplete?: boolean;
  /** Firmware version from device */
  firmwareVersion?: string;
};

export type CalmCommand = {
  cmd: "calm";
  protocol: number;
  intensity: number;
  duration: number;
  status: "pending" | "sent" | "delivered";
  createdAt: any;
  userId?: string;
};

export type StopCommand = {
  cmd: "stop";
  createdAt: any;
};

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

export function subscribeLiveState(
  deviceId: string,
  onData: (data: LiveState | null) => void
): () => void {
  const ref = database().ref(`devices/${deviceId}/live`);
  const callback = (snapshot: any) => {
    const val = snapshot.val();
    onData(val ? (val as LiveState) : null);
  };
  ref.on("value", callback);
  return () => ref.off("value", callback);
}

export async function sendCalmCommand(
  deviceId: string,
  protocol: number,
  intensity: number,
  duration: number
): Promise<string> {
  const uid = auth().currentUser?.uid;
  const docRef = await firestore()
    .collection("devices")
    .doc(deviceId)
    .collection("commands")
    .add({
      cmd: "calm",
      protocol,
      intensity,
      duration,
      status: "pending",
      createdAt: firestore.FieldValue.serverTimestamp(),
      userId: uid ?? null,
    });
  return docRef.id;
}

/** Subscribe to a command doc to watch status: pending -> sent -> delivered. Returns unsubscribe. */
export function subscribeCommandStatus(
  deviceId: string,
  commandId: string,
  onStatus: (status: "pending" | "sent" | "delivered" | null) => void
): () => void {
  const ref = firestore()
    .collection("devices")
    .doc(deviceId)
    .collection("commands")
    .doc(commandId);
  const unsub = ref.onSnapshot(
    (snap) => {
      const data = snap.data();
      const status = data?.status ?? null;
      onStatus(status as "pending" | "sent" | "delivered" | null);
    },
    () => onStatus(null)
  );
  return () => unsub();
}

export async function sendStopCommand(deviceId: string): Promise<string> {
  const docRef = await firestore()
    .collection("devices")
    .doc(deviceId)
    .collection("commands")
    .add({
      cmd: "stop",
      createdAt: firestore.FieldValue.serverTimestamp(),
    });
  return docRef.id;
}

/** Config command per 5.5: write to /devices/{device_id}/commands so device applies auto-calm settings */
export type ConfigCommandPayload = {
  autoCalmEnabled: boolean;
  autoCalmThreshold: number; // 0-100
  defaultProtocol: number;   // 1-8
  defaultIntensity: number; // 1-5
};

export async function sendConfigCommand(
  deviceId: string,
  payload: ConfigCommandPayload
): Promise<string> {
  const docRef = await firestore()
    .collection("devices")
    .doc(deviceId)
    .collection("commands")
    .add({
      cmd: "config",
      autoCalmEnabled: payload.autoCalmEnabled,
      autoCalmThreshold: payload.autoCalmThreshold,
      defaultProtocol: payload.defaultProtocol,
      defaultIntensity: payload.defaultIntensity,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  return docRef.id;
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
      timestamp: firestore.Timestamp.fromDate(r.timestamp),
      state: r.state,
      anxietyScore: r.anxietyScore,
    }));
  }
  let q = firestore()
    .collection("devices")
    .doc(deviceId)
    .collection("history")
    .where("timestamp", ">=", startDate)
    .where("timestamp", "<=", endDate)
    .orderBy("timestamp", "desc")
    .limit(limit);
  if (startAfterTimestamp != null) {
    q = q.startAfter(startAfterTimestamp) as any;
  }
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
        timestamp: firestore.Timestamp.fromDate(r.timestamp),
        type: r.type,
        score: r.score,
      }));
  }
  const snap = await firestore()
    .collection("devices")
    .doc(deviceId)
    .collection("alerts")
    .where("timestamp", ">=", startDate)
    .where("timestamp", "<=", endDate)
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  const ref = firestore()
    .collection("devices")
    .doc(deviceId)
    .collection("config")
    .doc("autoCalm");
  await ref.set({ ...config, updatedAt: firestore.FieldValue.serverTimestamp() }, { merge: true });
}

export async function loadDeviceConfig(
  deviceId: string
): Promise<AutoCalmConfig | null> {
  const doc = await firestore()
    .collection("devices")
    .doc(deviceId)
    .collection("config")
    .doc("autoCalm")
    .get();
  const data = doc.data();
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
  await firestore()
    .collection("users")
    .doc(uid)
    .set({ fcmToken: token, fcmTokenUpdatedAt: firestore.FieldValue.serverTimestamp() }, { merge: true });
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
  const doc = await firestore().collection("users").doc(uid).get();
  const data = doc.data();
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
  await firestore()
    .collection("users")
    .doc(uid)
    .set(
      {
        notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFS, ...prefs },
        preferencesUpdatedAt: firestore.FieldValue.serverTimestamp(),
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
  const doc = await firestore().collection("users").doc(uid).collection("profile").doc("dog").get();
  const data = doc.data();
  if (!data?.name) return null;
  return {
    name: String(data.name),
    breed: data.breed != null ? String(data.breed) : undefined,
    age: typeof data.age === "number" ? data.age : undefined,
    weight: typeof data.weight === "number" ? data.weight : undefined,
  };
}

export async function saveDogProfile(uid: string, profile: Partial<DogProfile>): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: firestore.FieldValue.serverTimestamp() };
  for (const [k, v] of Object.entries(profile)) {
    if (v !== undefined && v !== null && (typeof v !== "number" || Number.isFinite(v))) payload[k] = v;
  }
  await firestore()
    .collection("users")
    .doc(uid)
    .collection("profile")
    .doc("dog")
    .set(payload, { merge: true });
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
