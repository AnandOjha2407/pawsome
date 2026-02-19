import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  subscribeLiveState,
  sendCalmCommand,
  sendStopCommand,
  LiveState,
} from "../firebase/firebase";

const MOCK_LIVE: LiveState = {
  state: "CALM",
  anxietyScore: 22,
  confidence: 88,
  activityLevel: 3,
  breathingRate: 18,
  circuitTemp: 31.2,
  batteryPercent: 85,
  connectionType: "wifi",
  therapyActive: "NONE",
  lastUpdated: Math.floor(Date.now() / 1000),
};
import { getDeviceId } from "../storage/deviceId";

type FirebaseContextValue = {
  deviceId: string | null;
  setDeviceId: (id: string | null) => void;
  liveState: LiveState | null;
  loading: boolean;
  error: string | null;
  sendCalm: (protocol: number, intensity: number, duration: number) => Promise<string | null>;
  sendStop: () => Promise<string | null>;
};

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [deviceId, setDeviceIdState] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setDeviceId = useCallback(async (id: string | null) => {
    setDeviceIdState(id);
    const { setDeviceId: saveDeviceId } = await import("../storage/deviceId");
    await saveDeviceId(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsub: (() => void) | null = null;

    (async () => {
      try {
        const id = await getDeviceId();
        if (mounted) setDeviceIdState(id);

        if (id) {
          unsub = subscribeLiveState(id, (data) => {
            if (mounted) {
              setLiveState(data ?? MOCK_LIVE);
              setError(null);
            }
          });
        } else {
          if (mounted) setLiveState(null);
        }
      } catch (e: any) {
        if (mounted) {
          setError(e?.message ?? "Firebase error");
          setLiveState(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      unsub?.();
    };
  }, [deviceId]);

  const sendCalm = useCallback(
    async (protocol: number, intensity: number, duration: number) => {
      if (!deviceId) return null;
      try {
        return await sendCalmCommand(deviceId, protocol, intensity, duration);
      } catch (e: any) {
        console.warn("sendCalm failed", e);
        return null;
      }
    },
    [deviceId]
  );

  const sendStop = useCallback(async () => {
    if (!deviceId) return null;
    try {
      return await sendStopCommand(deviceId);
    } catch (e: any) {
      console.warn("sendStop failed", e);
      return null;
    }
  }, [deviceId]);

  const value: FirebaseContextValue = {
    deviceId,
    setDeviceId,
    liveState,
    loading,
    error,
    sendCalm,
    sendStop,
  };

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const ctx = useContext(FirebaseContext);
  return ctx;
}
