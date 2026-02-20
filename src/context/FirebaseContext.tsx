import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  subscribeLiveState,
  sendCalmCommand,
  sendStopCommand,
  LiveState,
  getFcmToken,
  saveFcmToken,
} from "../firebase/firebase";
import auth, { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { getDeviceId } from "../storage/deviceId";

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

  useEffect(() => {
    if (!user?.uid) return;
    getFcmToken()
      .then((token) => {
        if (token) return saveFcmToken(user.uid, token);
      })
      .catch(() => {});
  }, [user?.uid]);

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

    (async () => {
      try {
        const id = await getDeviceId();
        if (!mounted) return;
        setDeviceIdState(id ?? null);

        if (id && typeof id === "string" && id.trim().length > 0) {
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
      try {
        unsub?.();
      } catch (_) {}
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
