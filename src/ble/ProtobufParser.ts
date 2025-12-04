// src/ble/ProtobufParser.ts
// Protocol Buffer parser for Nordic UART Service packets
// Handles RealTimeData messages with HR, SpO2, HRV, Respiratory data

import { Buffer } from "buffer";

/**
 * Protocol Buffer wire format parser
 * Simplified parser for RealTimeData messages
 * 
 * Packet structure:
 * - Header (1-2 bytes): Message type/length
 * - Protobuf payload: RealTimeData fields
 * 
 * RealTimeData fields (varint encoded):
 * - heart_rate (field 1, varint)
 * - blood_oxygen (field 2, varint) 
 * - hrv (field 3, varint)
 * - respiratory_rate (field 4, varint) - for GTL1 only
 */

export interface RealTimeData {
  heart_rate?: number;
  blood_oxygen?: number;
  hrv?: number;
  respiratory_rate?: number;
  battery?: number;
  timestamp?: number;
}

/**
 * Parse varint (variable-length integer) from buffer
 */
function readVarint(buffer: Buffer, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;
  
  for (let i = offset; i < buffer.length; i++) {
    const byte = buffer[i];
    bytesRead++;
    value |= (byte & 0x7f) << shift;
    
    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7;
  }
  
  return { value, bytesRead };
}

/**
 * Parse field number and wire type from protobuf tag
 */
function parseTag(tag: number): { fieldNumber: number; wireType: number } {
  return {
    fieldNumber: tag >> 3,
    wireType: tag & 0x7,
  };
}

/**
 * Parse RealTimeData protobuf message from buffer
 * Supports basic protobuf wire format parsing
 */
export function parseRealTimeData(buffer: Buffer): RealTimeData | null {
  try {
    const data: RealTimeData = {};
    let offset = 0;
    
    // Skip header if present (first byte might be message type)
    // Common patterns: 0x01, 0x02, or length byte
    if (buffer.length < 2) {
      return null;
    }
    
    // Try to find start of protobuf data
    // Look for valid protobuf tags (field numbers 1-15 have tags 8-120)
    let startOffset = 0;
    if (buffer[0] > 0x7f || buffer[0] < 0x08) {
      // Might have header byte, skip it
      startOffset = 1;
    }
    
    offset = startOffset;
    
    while (offset < buffer.length) {
      if (offset >= buffer.length) break;
      
      // Read tag (field number + wire type)
      const tagResult = readVarint(buffer, offset);
      if (tagResult.bytesRead === 0 || offset + tagResult.bytesRead > buffer.length) break;
      
      const tag = tagResult.value;
      const { fieldNumber, wireType } = parseTag(tag);
      offset += tagResult.bytesRead;
      
      if (offset >= buffer.length) break;
      
      // Wire type 0 = Varint
      if (wireType === 0) {
        const valueResult = readVarint(buffer, offset);
        if (valueResult.bytesRead === 0 || offset + valueResult.bytesRead > buffer.length) break;
        
        const value = valueResult.value;
        offset += valueResult.bytesRead;
        
        // Map field numbers to RealTimeData fields
        switch (fieldNumber) {
          case 1: // heart_rate
            data.heart_rate = value;
            break;
          case 2: // blood_oxygen (SpO2)
            data.blood_oxygen = value;
            break;
          case 3: // hrv
            data.hrv = value;
            break;
          case 4: // respiratory_rate
            data.respiratory_rate = value;
            break;
          case 5: // battery
            data.battery = value;
            break;
          case 6: // timestamp
            data.timestamp = value;
            break;
        }
      } else if (wireType === 2) {
        // Length-delimited (skip for now)
        const lengthResult = readVarint(buffer, offset);
        if (lengthResult.bytesRead === 0 || offset + lengthResult.bytesRead > buffer.length) break;
        offset += lengthResult.bytesRead + lengthResult.value;
      } else {
        // Other wire types - skip
        break;
      }
    }
    
    // Return data if we extracted at least one field
    if (Object.keys(data).length > 0) {
      return data;
    }
    
    return null;
  } catch (error) {
    console.warn("Protobuf parse error:", error);
    return null;
  }
}

/**
 * Fallback parser for simple binary formats
 * Tries common packet layouts if protobuf parsing fails
 */
export function parseFallbackFormat(buffer: Buffer): RealTimeData | null {
  try {
    // Common formats:
    // Format 1: [HR(1)] [SpO2(1)] [HRV(1)] [Resp(1)]
    // Format 2: [Type(1)] [HR(2)] [SpO2(1)] [HRV(2)]
    
    if (buffer.length >= 4) {
      const data: RealTimeData = {};
      
      // Try format: [HR] [SpO2] [HRV] [Resp]
      if (buffer[0] >= 40 && buffer[0] <= 220) { // Valid HR range
        data.heart_rate = buffer[0];
        if (buffer[1] >= 70 && buffer[1] <= 100) { // Valid SpO2 range
          data.blood_oxygen = buffer[1];
        }
        if (buffer[2] >= 10 && buffer[2] <= 200) { // Valid HRV range
          data.hrv = buffer[2];
        }
        if (buffer[3] >= 10 && buffer[3] <= 60) { // Valid respiratory range
          data.respiratory_rate = buffer[3];
        }
        
        if (data.heart_rate) {
          return data;
        }
      }
      
      // Try format: [Type] [HR_L] [HR_H] [SpO2] [HRV_L] [HRV_H]
      if (buffer.length >= 6) {
        const hr = (buffer[2] << 8) | buffer[1];
        if (hr >= 40 && hr <= 220) {
          data.heart_rate = hr;
          if (buffer[3] >= 70 && buffer[3] <= 100) {
            data.blood_oxygen = buffer[3];
          }
          const hrv = (buffer[5] << 8) | buffer[4];
          if (hrv >= 10 && hrv <= 200) {
            data.hrv = hrv;
          }
          if (data.heart_rate) {
            return data;
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Main parser - tries protobuf first, then fallback
 */
export function parseDeviceData(buffer: Buffer): RealTimeData | null {
  // Try protobuf parsing first
  const protobufData = parseRealTimeData(buffer);
  if (protobufData && (protobufData.heart_rate || protobufData.blood_oxygen)) {
    return protobufData;
  }
  
  // Try fallback formats
  const fallbackData = parseFallbackFormat(buffer);
  if (fallbackData && fallbackData.heart_rate) {
    return fallbackData;
  }
  
  return null;
}

