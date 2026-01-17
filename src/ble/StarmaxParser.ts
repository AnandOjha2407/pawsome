// src/ble/StarmaxParser.ts
// Starmax SDK packet parser for GTS10/GTL1 devices
// Based on PossumBond Integration Guide

import { Buffer } from "buffer";

export interface StarmaxData {
  type: "HEART_RATE" | "BATTERY" | "SPO2" | "UNKNOWN";
  value: number;
  unit: string;
}

/**
 * Parse Starmax SDK packet
 * Packet structure: [0xAB, len, len, 0xFF, command, subCommand, data...]
 * 
 * Heart Rate: [0xAB, len, len, 0xFF, 0x31, type, HR_VALUE, ...]
 * Battery: [0xAB, len, len, 0xFF, 0x91, BATTERY%, ...]
 * SpO2: [0xAB, len, len, 0xFF, 0x32, type, SPO2%, ...]
 */
export function parseStarmaxData(buffer: Buffer): StarmaxData | null {
  try {
    if (buffer.length < 4) {
      return null;
    }

    const header = buffer[0]; // Should be 0xAB
    if (header !== 0xAB) {
      // Try to find 0xAB in the buffer (might have extra bytes at start)
      let found = false;
      for (let i = 0; i < Math.min(buffer.length - 4, 5); i++) {
        if (buffer[i] === 0xAB) {
          // Found header, adjust buffer
          const adjusted = buffer.slice(i);
          return parseStarmaxData(adjusted);
        }
      }
      return null;
    }

    const command = buffer[3]; // Command type (should be 0xFF)
    if (command !== 0xFF) {
      return null;
    }

    const subCommand = buffer[4]; // Sub command

    // Heart Rate Response (0xFF, 0x31)
    if (subCommand === 0x31 && buffer.length >= 7) {
      const heartRate = buffer[6]; // HR value in BPM
      if (heartRate >= 40 && heartRate <= 220) { // Valid HR range
        return {
          type: "HEART_RATE",
          value: heartRate,
          unit: "BPM",
        };
      }
    }

    // Battery Response (0xFF, 0x91)
    if (subCommand === 0x91 && buffer.length >= 6) {
      const battery = buffer[5];
      if (battery >= 0 && battery <= 100) { // Valid battery range
        return {
          type: "BATTERY",
          value: battery,
          unit: "%",
        };
      }
    }

    // SpO2 Response (0xFF, 0x32)
    if (subCommand === 0x32 && buffer.length >= 7) {
      const spo2 = buffer[6];
      if (spo2 >= 70 && spo2 <= 100) { // Valid SpO2 range
        return {
          type: "SPO2",
          value: spo2,
          unit: "%",
        };
      }
    }

    return null;
  } catch (error) {
    console.warn("Starmax parse error:", error);
    return null;
  }
}

/**
 * Convert parsed Starmax data to RealTimeData format for compatibility
 */
export interface RealTimeData {
  heart_rate?: number;
  blood_oxygen?: number;
  hrv?: number;
  respiratory_rate?: number;
  battery?: number;
  timestamp?: number;
}

export function starmaxToRealTimeData(
  parsed: StarmaxData | null,
  previousData?: RealTimeData
): RealTimeData | null {
  if (!parsed) {
    return previousData || null;
  }

  const data: RealTimeData = previousData ? { ...previousData } : {};
  data.timestamp = Date.now();

  switch (parsed.type) {
    case "HEART_RATE":
      data.heart_rate = parsed.value;
      break;
    case "BATTERY":
      data.battery = parsed.value;
      break;
    case "SPO2":
      data.blood_oxygen = parsed.value;
      break;
  }

  return data;
}








