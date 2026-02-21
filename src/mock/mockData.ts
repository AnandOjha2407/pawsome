/**
 * Mock data for development when device hardware is not available.
 * Use deviceId "MOCK_DEVICE" to enable (see FirebaseContext + loadHistory/loadAlerts).
 */
import type { LiveState } from "../firebase/firebase";

export const MOCK_DEVICE_ID = "MOCK_DEVICE";

const baseLiveState = {
  circuitTemp: 31.2,
  batteryPercent: 85,
  connectionType: "wifi" as const,
  therapyActive: "NONE",
  lastUpdated: Date.now() / 1000,
};

export const mockLiveState: LiveState = {
  state: "CALM",
  anxietyScore: 22,
  confidence: 88,
  activityLevel: 3,
  breathingRate: 18,
  ...baseLiveState,
};

export const mockStates: Array<Partial<LiveState>> = [
  { state: "SLEEPING", anxietyScore: 5, confidence: 95, activityLevel: 0, breathingRate: 12 },
  { state: "CALM", anxietyScore: 22, confidence: 88, activityLevel: 3, breathingRate: 18 },
  { state: "ALERT", anxietyScore: 38, confidence: 75, activityLevel: 5, breathingRate: 22 },
  { state: "ANXIOUS", anxietyScore: 72, confidence: 82, activityLevel: 7, breathingRate: 32 },
  { state: "ACTIVE", anxietyScore: 30, confidence: 70, activityLevel: 9, breathingRate: 28 },
];

const STATE_CYCLE = ["SLEEPING", "CALM", "CALM", "ALERT", "ANXIOUS", "CALM"] as const;

export function getMockLiveState(cycleIndex: number): LiveState {
  const i = cycleIndex % mockStates.length;
  const partial = mockStates[i];
  return {
    ...mockLiveState,
    ...partial,
    lastUpdated: Date.now() / 1000,
  } as LiveState;
}

export type MockHistoryRecord = {
  id: string;
  timestamp: Date;
  state: string;
  anxietyScore: number;
};

export function getMockHistory(): MockHistoryRecord[] {
  return Array.from({ length: 48 }, (_, i) => ({
    id: `mock-${i}`,
    timestamp: new Date(Date.now() - (48 - i) * 1800000),
    state: STATE_CYCLE[i % 6],
    anxietyScore: Math.floor(Math.random() * 80) + 5,
  }));
}

export function getMockAlerts(): Array<{ id: string; timestamp: Date; type: string; score?: number }> {
  const now = Date.now();
  return [
    { id: "mock-alert-1", timestamp: new Date(now - 3600000), type: "anxiety_peak", score: 72 },
    { id: "mock-alert-2", timestamp: new Date(now - 7200000), type: "calm_restored", score: 22 },
  ];
}
