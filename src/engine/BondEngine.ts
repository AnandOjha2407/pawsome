// src/engine/BondEngine.ts

// ------------------------------
// Human Coherence
// ------------------------------
export function calculateHumanCoherence(hrv: number, heartRate: number) {
  // Normalize HRV (typical: 20–100 ms)
  const normalizedHRV = Math.min(hrv / 100, 1) * 100;

  // Lower HR = calmer
  const restingScore = Math.max(0, ((100 - heartRate) / 40) * 100);

  return (normalizedHRV * 0.7) + (restingScore * 0.3);
}

// ------------------------------
// Dog Coherence
// ------------------------------
export function calculateDogCoherence(
  hrv: number,
  heartRate: number,
  respiratoryRate: number
) {
  // Normalize HRV (dog typical: 20–80 ms)
  const normalizedHRV = Math.min(hrv / 80, 1) * 100;

  // Lower HR = calmer
  const restingScore = Math.max(0, ((140 - heartRate) / 80) * 100);

  // Lower respiration = calmer
  const breathScore = Math.max(0, ((30 - respiratoryRate) / 20) * 100);

  return (normalizedHRV * 0.5) + (restingScore * 0.3) + (breathScore * 0.2);
}

// ------------------------------
// HRV Synchronization (Cross-Correlation)
// ------------------------------
export function calculateSynchronization(
  humanHRVArray: number[],
  dogHRVArray: number[]
) {
  // Need at least 12 data points (60 sec)
  if (humanHRVArray.length < 12 || dogHRVArray.length < 12) return 0;

  let maxCorrelation = 0;

  // Try time shifts from -1 to +1 step (±5 seconds)
  for (let shift = -1; shift <= 1; shift++) {
    let correlation = 0;
    let count = 0;

    for (let i = 0; i < humanHRVArray.length; i++) {
      const dogIndex = i + shift;
      if (dogIndex >= 0 && dogIndex < dogHRVArray.length) {
        const humanNorm = humanHRVArray[i] / 100;
        const dogNorm = dogHRVArray[dogIndex] / 80;

        correlation += (1 - Math.abs(humanNorm - dogNorm));
        count++;
      }
    }

    if (count > 0) {
      const avg = (correlation / count) * 100;
      maxCorrelation = Math.max(maxCorrelation, avg);
    }
  }

  return Math.min(maxCorrelation, 100);
}

// ------------------------------
// Final Bond Score (0–10)
// ------------------------------
export function calculateBondScore(
  humanCoherence: number,
  dogCoherence: number,
  syncQuality: number,
  sessionDurationSec: number
) {
  const coherenceScore =
    (humanCoherence * 0.3) + (dogCoherence * 0.3);

  const syncScore = syncQuality * 0.25;

  const durationMinutes = sessionDurationSec / 60;
  const durationBonus =
    Math.min(durationMinutes / 15, 1.0) * 15;

  const total = coherenceScore + syncScore + durationBonus;

  return Math.min(total / 10, 10);
}
