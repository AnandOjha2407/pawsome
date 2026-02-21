import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  subscribeLiveState,
  sendCalmCommand,
  sendStopCommand,
  LiveState,
} from "../firebase/firebase";
import auth, { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { getDeviceId } from "../storage/deviceId";
import { MOCK_DEVICE_ID, getMockLiveState } from "../mock/mockData";

type FirebaseContextValue = {
  user: FirebaseAuthTypes.User | null;
  authLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
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
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [deviceId, setDeviceIdState] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = auth().onAuthStateChanged((u) => {
        setUser(u ?? null);
        setAuthLoading(false);
      });
    } catch (e) {
      setAuthLoading(false);
    }
    return () => unsub?.();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await auth().signInWithEmailAndPassword(email, password);
  }, []);
  const signUp = useCallback(async (email: string, password: string) => {
    await auth().createUserWithEmailAndPassword(email, password);
  }, []);
  const signOut = useCallback(async () => {
    await auth().signOut();
  }, []);

  const setDeviceId = useCallback(async (id: string | null) => {
    setDeviceIdState(id);
    const { setDeviceId: saveDeviceId } = await import("../storage/deviceId");
    await saveDeviceId(id);
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsub: (() => void) | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const id = await getDeviceId();
        if (!mounted) return;
        setDeviceIdState(id ?? null);

        if (id && typeof id === "string" && id.trim().length > 0) {
          if (id === MOCK_DEVICE_ID) {
            let cycleIndex = 0;
            setLiveState(getMockLiveState(0));
            setError(null);
            intervalId = setInterval(() => {
              if (!mounted) return;
              cycleIndex += 1;
              setLiveState(getMockLiveState(cycleIndex));
            }, 4000);
          } else {
            try {
              unsub = subscribeLiveState(id, (data) => {
                if (mounted) {
                  setLiveState(data ?? null);
                  setError(null);
                }
              });
            } catch (subErr: any) {
              if (mounted) setLiveState(null);
            }
          }
        } else {
          setLiveState(null);
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
      if (intervalId != null) clearInterval(intervalId);
      try {
        unsub?.();
      } catch (_) {}
    };
  }, [deviceId]);

  const sendCalm = useCallback(
    async (protocol: number, intensity: number, duration: number) => {
      if (!deviceId) return null;
      if (deviceId === MOCK_DEVICE_ID) return "mock-calm-id";
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
    if (deviceId === MOCK_DEVICE_ID) return "mock-stop-id";
    try {
      return await sendStopCommand(deviceId);
    } catch (e: any) {
      console.warn("sendStop failed", e);
      return null;
    }
  }, [deviceId]);

  const value: FirebaseContextValue = {
    user,
    authLoading,
    signIn,
    signUp,
    signOut,
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
