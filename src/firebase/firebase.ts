/**
 * Firebase service for PawsomeBond v1
 * Realtime DB: live state | Firestore: commands, history
 */
import database from "@react-native-firebase/database";
import firestore from "@react-native-firebase/firestore";
import auth from "@react-native-firebase/auth";
import messaging from "@react-native-firebase/messaging";

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

export async function loadHistory(
  deviceId: string,
  startDate: Date,
  endDate: Date,
  limit = 50,
  startAfterTimestamp?: Date | import("@react-native-firebase/firestore").FirebaseFirestore.Timestamp
) {
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
    threshold: typeof data.threshold === "number" ? data.threshold : 70,
    defaultProtocol: typeof data.defaultProtocol === "number" ? data.defaultProtocol : 1,
    defaultIntensity: typeof data.defaultIntensity === "number" ? data.defaultIntensity : 3,
  };
}

/** Store FCM token for push notifications (users/{uid}) */
export async function saveFcmToken(uid: string, token: string): Promise<void> {
  await firestore()
    .collection("users")
    .doc(uid)
    .set({ fcmToken: token, fcmTokenUpdatedAt: firestore.FieldValue.serverTimestamp() }, { merge: true });
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
