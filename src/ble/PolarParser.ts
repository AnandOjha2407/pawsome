// src/ble/PolarParser.ts
// Polar H10 Heart Rate data parser
// Based on PossumBond_Polar_H10_Integration_Guide.md
// Uses standard Bluetooth Heart Rate Profile (0x180D)

import { Buffer } from "buffer";

export interface PolarHRData {
  heartRate: number;      // BPM
  rrIntervals: number[];  // Array of RR intervals in ms (for HRV calculation)
  hasContact: boolean;    // Sensor contact status
  hrv?: number;           // Calculated HRV (RMSSD) in ms
}

export interface RealTimeData {
  heart_rate?: number;
  blood_oxygen?: number;
  hrv?: number;
  respiratory_rate?: number;
  battery?: number;
  timestamp?: number;
}

/**
 * Parse Polar H10 Heart Rate Measurement data
 * Data format per Bluetooth Heart Rate Profile specification:
 * 
 * Byte 0: Flags
 *   - Bit 0: 0 = HR is UINT8 (1 byte), 1 = HR is UINT16 (2 bytes)
 *   - Bit 1: Sensor contact status
 *   - Bit 2: Sensor contact supported
 *   - Bit 3: Energy expended present
 *   - Bit 4: RR-Interval present (for HRV!)
 * 
 * Byte 1: Heart Rate (if Flags bit 0 = 0)
 *   OR
 * Byte 1-2: Heart Rate (if Flags bit 0 = 1)
 * 
 * Remaining bytes: RR-Intervals (if Flags bit 4 = 1)
 *   - Each RR interval is 2 bytes (UINT16)
 *   - Value is in 1/1024 seconds
 */
export function parseHeartRate(data: Uint8Array): PolarHRData | null {
  try {
    if (data.length < 2) {
      return null;
    }

    const flags = data[0];
    const isUint16 = (flags & 0x01) === 1;
    const hasRRIntervals = (flags & 0x10) === 0x10;
    const hasContact = (flags & 0x02) === 0x02;

    let heartRate: number;
    let rrIntervalStart: number;

    if (isUint16) {
      // Heart rate is 2 bytes (UINT16)
      if (data.length < 3) {
        return null;
      }
      heartRate = data[1] | (data[2] << 8);
      rrIntervalStart = 3;
    } else {
      // Heart rate is 1 byte (UINT8)
      heartRate = data[1];
      rrIntervalStart = 2;
    }

    // Validate heart rate range
    if (heartRate < 30 || heartRate > 250) {
      return null;
    }

    // Parse RR intervals (for HRV calculation)
    const rrIntervals: number[] = [];
    if (hasRRIntervals) {
      // Safety: Ensure we have enough bytes for RR intervals
      for (let i = rrIntervalStart; i < data.length - 1; i += 2) {
        // Safety: Check bounds before accessing
        if (i + 1 >= data.length) {
          break; // Not enough bytes for this RR interval
        }
        try {
          // RR interval in 1/1024 seconds, convert to milliseconds
          const rrRaw = data[i] | (data[i + 1] << 8);
          if (rrRaw > 0 && rrRaw < 65535) { // Valid range check
            const rrMs = (rrRaw / 1024) * 1000;
            const rrMsRounded = Math.round(rrMs);
            // Validate reasonable RR interval (100ms to 2000ms)
            if (rrMsRounded >= 100 && rrMsRounded <= 2000) {
              rrIntervals.push(rrMsRounded);
            }
          }
        } catch (e) {
          // Skip invalid RR interval
          continue;
        }
      }
    }

    return {
      heartRate,
      rrIntervals,
      hasContact,
    };
  } catch (error) {
    console.warn("Polar parse error:", error);
    return null;
  }
}

/**
 * Calculate HRV (RMSSD) from RR intervals
 * RMSSD = sqrt(mean of squared differences between consecutive RR intervals)
 */
export function calculateHRV(rrIntervals: number[]): number | null {
  try {
    // Safety: Validate input
    if (!Array.isArray(rrIntervals) || rrIntervals.length < 2) {
      return null;
    }

    // Safety: Filter out invalid values
    const validIntervals = rrIntervals.filter(
      (val) => typeof val === 'number' && val > 0 && val < 5000 && !isNaN(val) && isFinite(val)
    );

    if (validIntervals.length < 2) {
      return null;
    }

    let sumSquaredDiffs = 0;
    for (let i = 1; i < validIntervals.length; i++) {
      const diff = validIntervals[i] - validIntervals[i - 1];
      // Safety: Check for NaN/Infinity
      if (isNaN(diff) || !isFinite(diff)) {
        continue;
      }
      sumSquaredDiffs += diff * diff;
    }

    // Safety: Prevent division by zero
    if (validIntervals.length - 1 === 0 || sumSquaredDiffs < 0) {
      return null;
    }

    const rmssd = Math.sqrt(sumSquaredDiffs / (validIntervals.length - 1));
    
    // Safety: Validate result
    if (isNaN(rmssd) || !isFinite(rmssd) || rmssd < 0 || rmssd > 1000) {
      return null;
    }

    return Math.round(rmssd);  // HRV in ms
  } catch (error) {
    console.warn("Error calculating HRV:", error);
    return null;
  }
}

/**
 * Convert parsed Polar data to RealTimeData format for compatibility
 */
export function polarToRealTimeData(
  parsed: PolarHRData | null,
  previousData?: RealTimeData
): RealTimeData | null {
  if (!parsed) {
    return previousData || null;
  }

  const data: RealTimeData = previousData ? { ...previousData } : {};
  data.timestamp = Date.now();
  data.heart_rate = parsed.heartRate;

  // Calculate HRV if RR intervals available
  if (parsed.rrIntervals.length > 1) {
    const hrv = calculateHRV(parsed.rrIntervals);
    if (hrv !== null) {
      data.hrv = hrv;
    }
  }

  return data;
}
