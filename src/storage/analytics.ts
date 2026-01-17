import AsyncStorage from "@react-native-async-storage/async-storage";

const ANALYTICS_STORAGE_KEY = "@analytics_bond_scores_v1";

export type BondScoreRecord = {
  id: string;
  timestamp: number;
  date: string; // ISO string
  bondScore: number; // 0-100 (converted from 0-10 scale)
  recoveryScore: number; // 0-100
  strainScore: number; // 0-100
  durationMinutes: number;
  humanCoherence?: number;
  dogCoherence?: number;
  syncQuality?: number;
};

type AnalyticsData = {
  records: BondScoreRecord[];
  lastUpdated: number;
};

// Get all bond score records
export async function loadBondScoreRecords(): Promise<BondScoreRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (!raw) return [];
    
    try {
      const data: AnalyticsData = JSON.parse(raw);
      if (data && Array.isArray(data.records)) {
        // Sort by timestamp (newest first)
        return data.records.sort((a, b) => b.timestamp - a.timestamp);
      }
      return [];
    } catch (parseError) {
      console.warn("[analytics] corrupted JSON, starting fresh", parseError);
      return [];
    }
  } catch (e) {
    console.warn("[analytics] failed to load records", e);
    return [];
  }
}

// Save a new bond score record
export async function saveBondScoreRecord(record: BondScoreRecord): Promise<void> {
  try {
    const existing = await loadBondScoreRecords();
    
    // Check if record with same ID already exists (prevent duplicates)
    const exists = existing.some(r => r.id === record.id);
    if (exists) {
      console.warn(`[analytics] Record ${record.id} already exists, skipping`);
      return;
    }
    
    // Add new record
    const updated: AnalyticsData = {
      records: [record, ...existing],
      lastUpdated: Date.now(),
    };
    
    // Keep only last 1000 records to prevent storage bloat
    if (updated.records.length > 1000) {
      updated.records = updated.records.slice(0, 1000);
    }
    
    await AsyncStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(updated));
    console.log(`[analytics] Saved bond score record: ${record.id}, score: ${record.bondScore}`);
  } catch (e) {
    console.error("[analytics] failed to save record", e);
    throw e;
  }
}

// Calculate improvement trends
export function calculateImprovement(records: BondScoreRecord[]): {
  averageScore: number;
  recentAverage: number; // Last 7 records
  trend: "improving" | "declining" | "stable";
  improvementPercentage: number;
  bestScore: number;
  worstScore: number;
  totalSessions: number;
} {
  if (records.length === 0) {
    return {
      averageScore: 0,
      recentAverage: 0,
      trend: "stable",
      improvementPercentage: 0,
      bestScore: 0,
      worstScore: 0,
      totalSessions: 0,
    };
  }
  
  const scores = records.map(r => r.bondScore);
  const averageScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  
  // Calculate recent average (last 7 records)
  const recentRecords = records.slice(0, Math.min(7, records.length));
  const recentAverage = recentRecords.length > 0
    ? recentRecords.reduce((sum, r) => sum + r.bondScore, 0) / recentRecords.length
    : averageScore;
  
  // Determine trend
  let trend: "improving" | "declining" | "stable" = "stable";
  let improvementPercentage = 0;
  
  if (records.length >= 2) {
    const oldestRecords = records.slice(-Math.min(7, Math.floor(records.length / 2)));
    const oldestAverage = oldestRecords.length > 0
      ? oldestRecords.reduce((sum, r) => sum + r.bondScore, 0) / oldestRecords.length
      : averageScore;
    
    if (recentAverage > oldestAverage + 5) {
      trend = "improving";
      improvementPercentage = ((recentAverage - oldestAverage) / oldestAverage) * 100;
    } else if (recentAverage < oldestAverage - 5) {
      trend = "declining";
      improvementPercentage = ((recentAverage - oldestAverage) / oldestAverage) * 100;
    }
  }
  
  return {
    averageScore: Math.round(averageScore * 10) / 10,
    recentAverage: Math.round(recentAverage * 10) / 10,
    trend,
    improvementPercentage: Math.round(improvementPercentage * 10) / 10,
    bestScore: Math.max(...scores),
    worstScore: Math.min(...scores),
    totalSessions: records.length,
  };
}

// Clear all records (for testing/reset)
export async function clearAllRecords(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ANALYTICS_STORAGE_KEY);
    console.log("[analytics] Cleared all records");
  } catch (e) {
    console.error("[analytics] failed to clear records", e);
    throw e;
  }
}

