// src/ble/BLEManager.ts
// Real BLE manager with Polar H10 support for Human/Dog HR and PossumBond-Vest
// Updated to match PossumBond_Polar_H10_Integration_Guide.md

import { BleManager, Device } from "react-native-ble-plx";
import { Buffer } from "buffer";
import { Alert, Platform, PermissionsAndroid } from "react-native";
import SimpleEmitter from "./SimpleEmitter";
import {
  calculateHumanCoherence,
  calculateDogCoherence,
  calculateSynchronization,
  calculateBondScore,
} from "../engine/BondEngine";
import { parseHeartRate, polarToRealTimeData, RealTimeData } from "./PolarParser";
import {
  loadPairedDevices,
  savePairedDevice,
  PairedDeviceMap,
} from "../storage/pairedDevices";
import * as AppLogger from "../utils/AppLogger";

export type Role = "human" | "dog" | "vest";

type Session = {
  id: string;
  date: string;
  durationMin: number;
  notes?: string;
};

export type DeviceDescriptor = {
  id: string;
  name?: string | null;
  mac?: string;
  rssi?: number | null;
};

// ============== POLAR H10 UUIDs (Standard Bluetooth Heart Rate Profile) ==============
// Based on PossumBond_Polar_H10_Integration_Guide.md
// Polar H10 uses standard Bluetooth Heart Rate Service (0x180D) - NO START COMMAND NEEDED!
const HEART_RATE_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
const HEART_RATE_MEASUREMENT_UUID = "00002a37-0000-1000-8000-00805f9b34fb";
const BODY_SENSOR_LOCATION_UUID = "00002a38-0000-1000-8000-00805f9b34fb";

// ============== BATTERY SERVICE UUIDs (Standard Bluetooth Battery Service) ==============
// Polar H10 reports battery level through standard Battery Service
const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
const BATTERY_LEVEL_UUID = "00002a19-0000-1000-8000-00805f9b34fb";

// ============== REMOVED HARDCODED MAC ADDRESSES ==============
// Devices are now detected by name pattern only - works with ANY Polar H10 or PossumBond-Vest
// User will assign role (Human/Dog/Vest) when connecting

// ============== PAWSOMEBOND HARNESS UUIDs — FIXED, NEVER CHANGE ==============
const VEST_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const VEST_CMD_RX_UUID = "beb54840-36e1-4688-b7f5-ea07361b26a8";       // WRITE - app writes "CALM:1:3:60" or "STOP" (UTF-8)
const VEST_STATUS_TX_UUID = "beb54841-36e1-4688-b7f5-ea07361b26a8";    // NOTIFY - ESP32 confirms: THERAPY:HEARTBEAT, STOPPED, COOLDOWN:180, CONNECTED
const VEST_TELEMETRY_TX_UUID = "beb54842-36e1-4688-b7f5-ea07361b26a8"; // NOTIFY - ESP32 sends JSON telemetry every 3s
const VEST_WIFI_PROVISION_UUID = "beb54843-36e1-4688-b7f5-ea07361b26a8"; // WRITE - app sends {ssid, password} once during setup

// ============== THERAPY COMMAND CODES ==============
// Based on NEW_REQUIREMENTS.md - Therapy Command Codes
export const THERAPY = {
  STOP: 0x00,        // Turn off everything
  CALM: 0x01,        // Breathing rhythm
  THUNDER: 0x02,     // Storm/firework calming
  SEPARATION: 0x03,  // When owner is away
  SLEEP: 0x04,       // Bedtime (20 min fade)
  TRAVEL: 0x05,      // Car rides
  VET_VISIT: 0x06,   // Medical stress
  REWARD: 0x07,      // Good boy! (5 sec)
  BOND_SYNC: 0x08,   // Sync to owner HR
  LIGHT_ONLY: 0x09,  // Red light therapy
  MASSAGE: 0x0A,     // Vibration only
  EMERGENCY: 0x0B,   // Strong immediate calm
  WAKE: 0x0C,        // Gentle wake up
  PLAY: 0x0D,        // Fun/energetic
};

// Legacy VEST_CMD for backward compatibility
const VEST_CMD = THERAPY;

// Device name patterns
// Polar H10: name includes "Polar H10" (case-insensitive)
// Harness advertises as PAWSOMEBOND-PB-001 (or similar PAWSOMEBOND-* pattern)
const DEVICE_NAME_PATTERNS = {
  human: [
    /polar\s*h10/i,
    /polar\s*h\s*10/i,
  ],
  dog: [
    /polar\s*h10/i,
    /polar\s*h\s*10/i,
  ],
  vest: [
    /^pawsomebond-pb-\d+$/i,  // "PAWSOMEBOND-PB-001" etc.
    /^pawsomebond-/i,          // Any "PAWSOMEBOND-*" variant
    /pawsomebond/i,            // Fallback: contains "pawsomebond"
  ],
};

/**
 * Auto-detect device type based on device name pattern only
 * Returns the detected role or null if no pattern matches
 * 
 * NO MAC ADDRESS MATCHING - works with ANY Polar H10 or PossumBond-Vest
 * User will assign role (Human/Dog/Vest) when connecting
 */
function detectDeviceType(
  deviceName: string | null | undefined,
  deviceId?: string | null
): Role | null {
  if (!deviceName) return null;

  const name = deviceName.toLowerCase();

  // Check vest patterns first (more specific)
  for (const pattern of DEVICE_NAME_PATTERNS.vest) {
    if (pattern.test(name)) {
      return "vest";
    }
  }

  // Check Polar H10 patterns (both human and dog use same name)
  // Return null so user can select role (Human or Dog)
  const isPolarH10 = DEVICE_NAME_PATTERNS.human.some(pattern => pattern.test(name)) ||
    DEVICE_NAME_PATTERNS.dog.some(pattern => pattern.test(name));
  if (isPolarH10) {
    // User will select role when connecting
    return null;
  }

  return null;
}

class BLEManagerReal extends SimpleEmitter {
  private manager = new BleManager();

  // Map role -> BLE device
  private devices: Partial<Record<Role, Device>> = {};

  // Map device.id -> assigned role
  private roles: Record<string, Role> = {};

  isConnected = false;
  rssi: number = -60;

  // For headers + UI compatibility (Home.tsx)
  assignedProfile: "human" | "dog" | null = null;

  connectedDevice: { name: string; mac: string; rssi: number } | null = null;

  // Bonding metrics (0–100)
  sleepScore = 0;
  recoveryScore = 0;
  strainScore = 0;

  // Device data storage - initialized with 0 values
  private humanData: {
    heartRate: number;
    spO2: number;
    hrv: number[];
    respiratoryRate: number;
    battery: number;
    lastUpdate: number;
  } = {
      heartRate: 0,
      spO2: 0,
      hrv: [],
      respiratoryRate: 0,
      battery: 0,
      lastUpdate: 0
    };

  private dogData: {
    heartRate: number;
    spO2: number;
    hrv: number[];
    respiratoryRate: number;
    battery: number;
    lastUpdate: number;
  } = {
      heartRate: 0,
      spO2: 0,
      hrv: [],
      respiratoryRate: 0,
      battery: 0,
      lastUpdate: 0
    };

  private sessions: Session[] = [];
  private sessionStart = Date.now();

  firmwareVersion = "ble-real-0.1";
  private logs: string[] = [];

  private scanning = false;
  private connectedRoles: Record<Role, boolean> = {
    human: false,
    dog: false,
    vest: false,
  };
  private pairedDescriptors: PairedDeviceMap = {};
  private comfortStatus: "idle" | "active" = "idle";
  private bondInterval?: ReturnType<typeof setInterval>;
  private batteryReadInterval?: ReturnType<typeof setInterval>;
  private bondSyncInterval?: ReturnType<typeof setInterval>; // For Bond Sync mode HR updates
  private currentTherapyMode: number | null = null; // Track current therapy mode (0x00-0x0D)
  private humanSyncWindow: number[] = [];
  private dogSyncWindow: number[] = [];
  private readonly SAMPLE_INTERVAL_MS = 5000;
  private readonly BATTERY_READ_INTERVAL_MS = 30000; // Read battery every 30 seconds
  private readonly BOND_SYNC_HR_INTERVAL_MS = 1000; // Send HR every second in Bond Sync mode
  private readonly MAX_SYNC_SAMPLES = 64;
  private readonly MIN_SYNC_SAMPLES = 12;
  private lastBondLogTime = 0;
  private readonly BOND_LOG_INTERVAL_MS = 30000; // Log bond score at most every 30s
  // CRITICAL: Track subscriptions per device role to prevent memory leaks
  private subscriptions: any[] = [];
  private deviceSubscriptions: Map<string, any[]> = new Map(); // Map deviceId -> subscriptions array

  constructor() {
    super();
    this.log("BLEManagerReal initialized");
    AppLogger.info("BLE manager initialized");
    this.bondInterval = setInterval(
      () => this.runBondingTick(),
      this.SAMPLE_INTERVAL_MS
    );
    loadPairedDevices().then((map) => {
      this.pairedDescriptors = map;
      this.emitConnections();
    });
  }

  // ----------------------------------------------------------
  // LOGGING
  // ----------------------------------------------------------
  private log(msg: string) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    this.logs.push(line);
    if (this.logs.length > 200) this.logs.shift();
    console.log(line);
  }

  // ----------------------------------------------------------
  // ANDROID PERMISSIONS
  // ----------------------------------------------------------
  private async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== "android") return true;

    try {
      const results = await PermissionsAndroid.requestMultiple([
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.ACCESS_FINE_LOCATION",
      ]);

      // Check if all required permissions are granted
      const allGranted =
        results["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED &&
        results["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED &&
        results["android.permission.ACCESS_FINE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED;

      if (!allGranted) {
        this.log("Warning: Not all BLE permissions granted");
        // Log which permissions were denied
        Object.entries(results).forEach(([perm, result]) => {
          if (result !== PermissionsAndroid.RESULTS.GRANTED) {
            this.log(`Permission denied: ${perm} - ${result}`);
          }
        });
      }

      return allGranted;
    } catch (e) {
      this.log("Permission error: " + String(e));
      return false;
    }
  }

  // ----------------------------------------------------------
  // SCANNING — Pairing.tsx calls startScan(callback)
  // Filters to show only our 3 device types (GTS10, GTL1, Vest)
  // ----------------------------------------------------------
  async startScan(onDeviceFound: (dev: DeviceDescriptor) => void) {
    // Safety: Prevent multiple scans
    if (this.scanning) {
      this.log("Scan already in progress, ignoring duplicate startScan call");
      AppLogger.warn("BLE scan already in progress ignoring duplicate startScan");
      return;
    }

    // Safety: Verify manager exists
    if (!this.manager) {
      this.log("ERROR: BLE Manager not initialized, cannot start scan");
      AppLogger.warn("Unexpected state BLE Manager not initialized cannot start scan");
      return;
    }

    try {
      const permissionsGranted = await this.requestPermissions();
      if (!permissionsGranted) {
        this.log("WARNING: BLE permissions not granted, scan may fail");
        // Continue anyway - some devices might work with partial permissions
      }
    } catch (permError: any) {
      this.log(`Permission request failed: ${permError?.message ?? permError}`);
      // Continue anyway - permissions might already be granted
    }

    try {
      this.scanning = true;
      AppLogger.info("BLE scan started");
      this.log("Scan started - filtering for Polar H10 and Vest devices");
      this.log("Scanning without filter to find both HR service (0x180D) and Vest service (4fafc201-...)");

      // Scan without filter to include both service UUIDs
      // Polars use standard HR service (0x180D), Vest uses custom service (4fafc201-...)
      // Per integration guide: "Make sure app scans without filter or includes both service UUIDs"
      this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          this.log("Scan error: " + error.message);
          AppLogger.error("BLE scan error", error);
          return;
        }
        if (!device) return;

        try {
          const { id, name, rssi } = device;

          // Get device service UUIDs (if available from scan response)
          // On Android, serviceUUIDs is often empty in scan; harness is then matched by name only (e.g. "PAWSOMEBOND-PB-001").
          const serviceUUIDs = device.serviceUUIDs || [];
          const serviceUUIDsLower = serviceUUIDs.map((uuid: string) => uuid.toLowerCase());

          // Check if it's a PawsomeBond Vest by service UUID (future-proof for generic ESP32)
          // Check both full UUID and partial UUID match
          const vestServiceUUIDLower = VEST_SERVICE_UUID.toLowerCase();
          const isVestByService = serviceUUIDsLower.some((uuid: string) => {
            const uuidLower = uuid.toLowerCase();
            return uuidLower.includes('4fafc201') || 
                   uuidLower === vestServiceUUIDLower ||
                   uuidLower.replace(/-/g, '').includes('4fafc201');
          });

          // Check if it's a Polar H10 by service UUID
          const heartRateServiceUUIDLower = HEART_RATE_SERVICE_UUID.toLowerCase();
          const isPolarByService = serviceUUIDsLower.some((uuid: string) => {
            const uuidLower = uuid.toLowerCase();
            return uuidLower.includes('180d') || 
                   uuidLower === heartRateServiceUUIDLower ||
                   uuidLower.replace(/-/g, '').includes('180d');
          });

          // Match by name pattern per NEW_REQUIREMENTS.md
          // Polar H10: name includes "Polar H10" (case-insensitive)
          // PAWSOMEBOND-PB-*: harness name matching
          const nameLower = (name?.toLowerCase() || "").trim();
          const isPolarH10ByName = nameLower.includes("polar h10") ||
            nameLower.includes("polar h 10");
          
          const isVestByName = nameLower.startsWith("pawsomebond-") ||
            nameLower.startsWith("pawsomebond ") ||
            nameLower === "pawsomebond";

          // Combine service UUID and name matching
          const isPolarH10 = isPolarH10ByName || isPolarByService;
          const isVest = isVestByName || isVestByService;

          if (!isPolarH10 && !isVest) {
            // Not one of our devices - skip it
            return; // Don't log every unknown device to reduce noise
          }

          // This is one of our devices - log and pass it to the callback
          const deviceType = isVest ? "vest" : null; // Polar H10 needs user to select role
          const detectionMethod = isVest
            ? (isVestByName ? "by name" : "by service UUID")
            : (isPolarH10ByName ? "by name" : "by service UUID");
          const label = isVest
            ? "PawsomeBond Harness"
            : "Polar H10 (select role)";

          this.log(`Found ${label} [${detectionMethod}]: ${name || 'Unknown'} (${id})`);
          
          const displayName = isVest && !isVestByName && !name 
            ? "PAWSOMEBOND-PB-001" 
            : (name ?? null);

          onDeviceFound({
            id,
            name: displayName,
            mac: id,
            rssi,
          });
        } catch (scanError: any) {
          this.log(`Error processing scanned device: ${scanError?.message ?? scanError}`);
        }
      });
    } catch (scanStartError: any) {
      this.scanning = false;
      this.log(`Failed to start scan: ${scanStartError?.message ?? scanStartError}`);
      throw scanStartError;
    }
  }

  // ----------------------------------------------------------
  // AUTO-CONNECT: Automatically scan and connect to paired devices
  // ----------------------------------------------------------
  async autoConnectPairedDevices(): Promise<void> {
    try {
      // Load paired devices
      const paired = await loadPairedDevices();
      this.pairedDescriptors = paired;

      // Check if there are any paired devices
      const hasPairedDevices = paired.dog || paired.human || paired.vest;
      if (!hasPairedDevices) {
        this.log("No paired devices found - skipping auto-connect");
        return;
      }

      this.log(`Auto-connect: Found ${Object.keys(paired).length} paired device(s)`);

      // Check if devices are already connected
      const connections = this.getConnections();
      const allConnected =
        (paired.dog ? connections.connected.dog : true) &&
        (paired.human ? connections.connected.human : true) &&
        (paired.vest ? connections.connected.vest : true);

      if (allConnected) {
        this.log("All paired devices already connected - skipping auto-connect");
        return;
      }

      // Start scanning for paired devices
      this.log("Starting auto-connect scan for paired devices...");

      const connectedDevices = new Set<string>();
      const scanTimeout = 15000; // 15 seconds timeout
      let scanTimer: NodeJS.Timeout | null = null;

      const stopAutoScan = () => {
        if (this.scanning) {
          this.stopScan();
        }
        if (scanTimer) {
          clearTimeout(scanTimer);
        }
      };

      // Set timeout to stop scanning
      scanTimer = setTimeout(() => {
        this.log("Auto-connect scan timeout - stopping scan");
        stopAutoScan();
      }, scanTimeout);

      // Start scan with auto-connect logic
      await this.startScan(async (device) => {
        try {
          // Check if this device matches any paired device by ID (not MAC)
          const deviceId = device.id;

          let matchedRole: Role | null = null;
          let matchedDescriptor: DeviceDescriptor | null = null;

          if (paired.dog && paired.dog.id === deviceId) {
            matchedRole = "dog";
            matchedDescriptor = paired.dog;
          } else if (paired.human && paired.human.id === deviceId) {
            matchedRole = "human";
            matchedDescriptor = paired.human;
          } else if (paired.vest && paired.vest.id === deviceId) {
            matchedRole = "vest";
            matchedDescriptor = paired.vest;
          }

          if (matchedRole && matchedDescriptor && !connectedDevices.has(deviceId)) {
            // Check if already connected
            if (this.connectedRoles[matchedRole]) {
              this.log(`Device ${matchedRole} already connected, skipping`);
              connectedDevices.add(deviceId);
              return;
            }

            this.log(`Auto-connecting to ${matchedRole} device: ${device.name ?? device.id}`);
            connectedDevices.add(deviceId);

            // Auto-connect to this device
            try {
              await this.connectToScannedDevice(matchedDescriptor, matchedRole);
              this.log(`✓ Successfully auto-connected to ${matchedRole} device`);
            } catch (connectError: any) {
              this.log(`Failed to auto-connect to ${matchedRole}: ${connectError?.message ?? connectError}`);
              connectedDevices.delete(deviceId); // Allow retry
            }

            // Check if all devices are now connected
            const currentConnections = this.getConnections();
            const allNowConnected =
              (paired.dog ? currentConnections.connected.dog : true) &&
              (paired.human ? currentConnections.connected.human : true) &&
              (paired.vest ? currentConnections.connected.vest : true);

            if (allNowConnected) {
              this.log("All paired devices connected - stopping auto-connect scan");
              stopAutoScan();
            }
          }
        } catch (error: any) {
          this.log(`Error in auto-connect handler: ${error?.message ?? error}`);
        }
      });

    } catch (error: any) {
      this.log(`Auto-connect failed: ${error?.message ?? error}`);
    }
  }

  stopScan() {
    if (!this.scanning) return;

    try {
      if (this.manager) {
        this.manager.stopDeviceScan();
      }
      this.scanning = false;
      AppLogger.info("BLE scan stopped");
      this.log("Scan stopped");
    } catch (error: any) {
      this.log(`Error stopping scan: ${error?.message ?? error}`);
      this.scanning = false; // Reset flag even if stop failed
    }
  }

  // ----------------------------------------------------------
  // MANUAL ROLE ASSIGNMENT (OPTION C)
  // ----------------------------------------------------------
  assignDeviceType(descriptor: DeviceDescriptor, role: Role) {
    this.roles[descriptor.id] = role;
    this.pairedDescriptors[role] = descriptor;
    savePairedDevice(role, descriptor).catch((e) =>
      console.warn("Failed to persist paired device", e)
    );

    this.connectedDevice = {
      name: descriptor.name ?? `${role.toUpperCase()} Device`,
      mac: descriptor.id,
      rssi: descriptor.rssi ?? -60,
    };

    if (role === "human" || role === "dog") {
      this.assignedProfile = role;
    }

    this.log(`Device assigned → ${role} (${descriptor.id})`);
    this.emit("assigned", { role, descriptor });
    this.emitConnections();
  }

  private emitConnections() {
    this.emit("connections", this.getConnections());
  }

  getConnections() {
    return {
      connected: { ...this.connectedRoles },
      paired: { ...this.pairedDescriptors },
      assignedProfile: this.assignedProfile,
    };
  }

  isRoleConnected(role: Role) {
    return !!this.connectedRoles[role];
  }

  // ----------------------------------------------------------
  // AUTO-DETECT DEVICE TYPE FROM NAME AND MAC
  // ----------------------------------------------------------
  detectDeviceType(deviceName: string | null | undefined, deviceId?: string | null): Role | null {
    return detectDeviceType(deviceName, deviceId);
  }

  // ----------------------------------------------------------
  // CONNECT (Used after assigning role)
  // ----------------------------------------------------------
  async connectToScannedDevice(
    descriptor: DeviceDescriptor,
    role: Role
  ): Promise<void> {
    // Safety: Stop any ongoing scan first
    try {
      this.stopScan();
    } catch (e) {
      this.log("Warning: Failed to stop scan: " + String(e));
      // Continue - scan might not be running
    }

    try {
      this.log(`Connecting to ${descriptor.name ?? "Unknown"} as ${role}`);

      // Safety checks with detailed error messages
      if (!descriptor || !descriptor.id) {
        const error = new Error("Invalid device descriptor or device ID");
        this.log(`Connection failed: ${error.message}`);
        this.emit("error", error);
        throw error;
      }

      if (!this.manager) {
        const error = new Error("BLE Manager not initialized");
        this.log(`Connection failed: ${error.message}`);
        this.emit("error", error);
        throw error;
      }

      // Check if already connected to this device
      const existingDevice = this.devices[role];
      if (existingDevice) {
        try {
          const isConnected = await existingDevice.isConnected();
          if (isConnected) {
            this.log(`Device ${role} already connected, skipping`);
            return;
          }
        } catch (e) {
          // Device might be disconnected, continue with connection
        }
      }

      let device;
      try {
        // CRITICAL: requestMTU can fail on some devices - make it optional
        device = await this.manager.connectToDevice(descriptor.id, {
          requestMTU: 185,
        }).catch(async (mtuError: any) => {
          // If MTU request fails, try without it
          this.log(`MTU request failed, retrying without MTU: ${mtuError?.message}`);
          return await this.manager.connectToDevice(descriptor.id);
        });
      } catch (connectError: any) {
        const errorMsg = connectError?.message ?? String(connectError);
        this.log(`Failed to connect to device: ${errorMsg}`);
        // Reset connection state on error
        this.connectedRoles[role] = false;
        if (this.devices[role]) {
          delete this.devices[role];
        }
        this.emit("error", new Error(`Connection failed: ${errorMsg}`));
        throw new Error(`Failed to connect: ${errorMsg}`);
      }

      if (!device) {
        const error = new Error("Device connection returned null");
        this.log(`Connection failed: ${error.message}`);
        this.connectedRoles[role] = false;
        this.emit("error", error);
        throw error;
      }

      // Safety: Verify device is actually connected
      try {
        const isConnected = await device.isConnected();
        if (!isConnected) {
          const error = new Error("Device connection returned but isConnected is false");
          this.log(`Connection failed: ${error.message}`);
          this.connectedRoles[role] = false;
          if (this.devices[role]) {
            delete this.devices[role];
          }
          this.emit("error", error);
          throw error;
        }
      } catch (e: any) {
        const errorMsg = e?.message ?? String(e);
        this.log(`Failed to check device connection status: ${errorMsg}`);
        this.connectedRoles[role] = false;
        if (this.devices[role]) {
          delete this.devices[role];
        }
        this.emit("error", new Error(`Connection verification failed: ${errorMsg}`));
        throw new Error(`Connection verification failed: ${errorMsg}`);
      }

      // Discover services with error handling and timeout
      try {
        // Safety: Only discover if device is connected
        const isConnected = await device.isConnected();
        if (isConnected) {
          // Add timeout to prevent hanging on service discovery
          try {
            const discoverPromise = device.discoverAllServicesAndCharacteristics();
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Service discovery timeout")), 10000)
            );

            await Promise.race([discoverPromise, timeoutPromise]);
            this.log(`Service discovery completed for ${role}`);
          } catch (discoverTimeoutError: any) {
            this.log(`Service discovery timed out or failed (continuing anyway): ${discoverTimeoutError?.message ?? discoverTimeoutError}`);
            // Continue - some devices work without full discovery
          }

          // Try to read device name if not available (non-blocking)
          if (!descriptor.name) {
            try {
              const namePromise = device.readCharacteristicForService(
                "00001800-0000-1000-8000-00805f9b34fb", // Generic Access Service
                "00002a00-0000-1000-8000-00805f9b34fb"  // Device Name characteristic
              );
              const nameTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Name read timeout")), 3000)
              );

              const deviceInfo = await Promise.race([namePromise, nameTimeout]) as any;
              if (deviceInfo?.value) {
                const name = Buffer.from(deviceInfo.value, "base64").toString("utf8");
                this.log(`Read device name: ${name}`);
                descriptor.name = name;
              }
            } catch (nameError: any) {
              this.log(`Could not read device name (non-critical): ${nameError?.message ?? nameError}`);
              // Non-critical, continue
            }
          }
        } else {
          this.log("Device not connected, skipping service discovery");
        }
      } catch (discoverError: any) {
        this.log(`Service discovery error (continuing anyway): ${discoverError?.message ?? discoverError}`);
        // Continue anyway - some devices work without full discovery
        // Don't throw - connection can still succeed
      }

      // Store device reference BEFORE subscriptions (so cleanup can find it)
      this.devices[role] = device;
      this.roles[device.id] = role;
      this.rssi = device.rssi ?? -60;

      // Subscribe to characteristics with error handling
      // Safety: Only subscribe if device is still connected
      try {
        const isConnected = await device.isConnected();
        if (!isConnected) {
          const error = new Error("Device disconnected before subscription");
          this.log(`Connection failed: ${error.message}`);
          // Clean up device reference
          delete this.devices[role];
          delete this.roles[device.id];
          this.connectedRoles[role] = false;
          this.emit("error", error);
          throw error;
        }
      } catch (e: any) {
        const errorMsg = e?.message ?? String(e);
        this.log(`Failed to check connection before subscription: ${errorMsg}`);
        // Clean up device reference
        delete this.devices[role];
        delete this.roles[device.id];
        this.connectedRoles[role] = false;
        this.emit("error", new Error(`Pre-subscription check failed: ${errorMsg}`));
        throw new Error(`Pre-subscription check failed: ${errorMsg}`);
      }

      if (role === "human" || role === "dog") {
        try {
          // Subscribe to heart rate data
          await this.subscribePolarH10(device, role);

          // Read battery level from Battery Service immediately (non-blocking)
          this.readBatteryLevel(device, role).catch((batteryError: any) => {
            this.log(`Warning: Failed to read initial battery for ${role}: ${batteryError?.message ?? batteryError}`);
            // Non-critical - continue
          });

          // Set up periodic battery reads (only once)
          if (!this.batteryReadInterval) {
            this.batteryReadInterval = setInterval(() => {
              try {
                // Read battery for all connected devices (including vest)
                Object.entries(this.devices).forEach(async ([deviceRole, dev]) => {
                  try {
                    if (dev && (deviceRole === "human" || deviceRole === "dog" || deviceRole === "vest")) {
                      await this.readBatteryLevel(dev, deviceRole as "human" | "dog" | "vest");
                    }
                  } catch (batteryReadError: any) {
                    this.log(`Error reading battery for ${deviceRole}: ${batteryReadError?.message ?? batteryReadError}`);
                    // Don't crash - just log
                  }
                });
              } catch (intervalError: any) {
                this.log(`Error in battery read interval: ${intervalError?.message ?? intervalError}`);
                // Don't crash - just log
              }
            }, this.BATTERY_READ_INTERVAL_MS);
          }
        } catch (subError: any) {
          this.log(`Warning: Failed to subscribe to Polar H10 for ${role}: ${subError?.message ?? subError}`);
          // Don't fail connection if subscription fails - device might still work
          // Connection still succeeds, just data won't stream
        }
      } else if (role === "vest") {
        this.log(`Harness connected — subscribing to STATUS + TELEMETRY`);

        try {
          const isConnected = await device.isConnected();
          if (isConnected) {
            // Subscribe to beb54841 STATUS for therapy confirmation
            try {
              await Promise.race([
                this.subscribeVestStatus(device),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Status sub timeout")), 5000)),
              ]);
            } catch (statusError: any) {
              this.log(`Warning: STATUS subscription failed (commands still work): ${statusError?.message ?? statusError}`);
            }

            // Subscribe to beb54842 TELEMETRY for live data bridge
            try {
              await Promise.race([
                this.subscribeTelemetry(device),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Telemetry sub timeout")), 5000)),
              ]);
            } catch (telemetryError: any) {
              this.log(`Warning: TELEMETRY subscription failed: ${telemetryError?.message ?? telemetryError}`);
            }

            this.readBatteryLevel(device, "vest").catch(() => {});

            if (!this.batteryReadInterval) {
              this.batteryReadInterval = setInterval(() => {
                Object.entries(this.devices).forEach(async ([deviceRole, dev]) => {
                  try {
                    if (dev && (deviceRole === "human" || deviceRole === "dog" || deviceRole === "vest")) {
                      await this.readBatteryLevel(dev, deviceRole as "human" | "dog" | "vest");
                    }
                  } catch {}
                });
              }, this.BATTERY_READ_INTERVAL_MS);
            }
          }
        } catch (verifyError: any) {
          this.log(`Harness verify error (connection may still work): ${verifyError?.message ?? verifyError}`);
        }
      }

      // Set up disconnect handler with error handling
      try {
        const disconnectSub = device.onDisconnected((error) => {
          try {
            this.log(`Device disconnected: ${role} - ${error?.message ?? "No error"}`);
            AppLogger.info(`BLE device disconnected ${role} ${error?.message ?? ""}`);

            // CRITICAL: Clean up subscriptions ONLY for this specific device
            const deviceId = device.id;

            // Get subscriptions for this specific device
            const deviceSubs = this.deviceSubscriptions.get(deviceId) || [];

            // Remove subscriptions for this device
            deviceSubs.forEach(sub => {
              try {
                if (sub && typeof sub.remove === 'function') {
                  sub.remove();
                }
              } catch (e) {
                // Ignore - subscription might already be removed or device is disconnected
              }
            });

            // Remove device from subscriptions map
            this.deviceSubscriptions.delete(deviceId);

            // Remove disconnect subscription from main subscriptions array
            const mainIndex = this.subscriptions.indexOf(disconnectSub);
            if (mainIndex !== -1) {
              this.subscriptions.splice(mainIndex, 1);
            }

            // Clean up device reference
            if (this.devices[role]) {
              delete this.devices[role];
            }
            delete this.roles[deviceId];

            // Reset connection state
            this.connectedRoles[role] = false;
            if (role === "vest") {
              this.comfortStatus = "idle";
              this.stopBondSyncMode(); // Stop Bond Sync if vest disconnects
            }

            // Update isConnected flag if no devices are connected
            const hasAnyConnection = Object.values(this.connectedRoles).some(connected => connected);
            if (!hasAnyConnection) {
              this.isConnected = false;
              this.connectedDevice = null;
            }

            this.emitConnections();
            this.emit("disconnected", { role, deviceId });
          } catch (disconnectError: any) {
            this.log(`Error in disconnect handler: ${disconnectError?.message ?? disconnectError}`);
            // Still try to clean up state even if emit fails
            try {
              this.connectedRoles[role] = false;
              if (this.devices[role]) {
                delete this.devices[role];
              }
              this.emitConnections();
            } catch (cleanupError: any) {
              this.log(`Error during disconnect cleanup: ${cleanupError?.message ?? cleanupError}`);
            }
          }
        });

        // CRITICAL: Store disconnect subscription for cleanup to prevent memory leaks
        if (disconnectSub) {
          const deviceId = device.id;
          if (!this.deviceSubscriptions.has(deviceId)) {
            this.deviceSubscriptions.set(deviceId, []);
          }
          this.deviceSubscriptions.get(deviceId)!.push(disconnectSub);
          this.subscriptions.push(disconnectSub);
        }
      } catch (listenerError: any) {
        this.log(`Failed to set up disconnect listener: ${listenerError?.message ?? listenerError}`);
        // Connection can still succeed even if disconnect listener fails
      }

      // Mark as connected BEFORE emitting events (for vest, connection succeeds even if status sub fails)
      this.isConnected = true;
      this.connectedRoles[role] = true;

      // Update connected device info
      this.connectedDevice = {
        name: descriptor.name ?? `${role.toUpperCase()} Device`,
        mac: descriptor.id,
        rssi: descriptor.rssi ?? -60,
      };

      if (role === "human" || role === "dog") {
        this.assignedProfile = role;
      }

      // Emit connection events
      this.emitConnections();
      this.emit("connected", this.connectedDevice);

      this.log(`✓ Successfully connected to ${descriptor.name ?? descriptor.id} as ${role}`);
      AppLogger.info(`BLE device connected to ${descriptor.name ?? descriptor.id} as ${role}`);
    } catch (e: any) {
      this.log("Connect error: " + String(e?.message ?? e));
      AppLogger.error(`BLE connection failed role=${role} device=${descriptor.name ?? descriptor.id}`, e);

      // Reset connection state on error
      this.connectedRoles[role] = false;
      if (this.devices[role]) {
        delete this.devices[role];
      }

      this.emit("error", e);
      throw e; // Re-throw so caller knows connection failed
    }
  }

  // ----------------------------------------------------------
  // LEGACY CONNECT() — Used by Details screen
  // ----------------------------------------------------------
  async connect() {
    if (!this.connectedDevice) {
      Alert.alert("No device selected", "Please use the Pairing screen first.");
      return;
    }

    const role =
      this.roles[this.connectedDevice.mac] ?? this.assignedProfile ?? "human";

    await this.connectToScannedDevice(
      {
        id: this.connectedDevice.mac,
        name: this.connectedDevice.name,
        mac: this.connectedDevice.mac,
        rssi: this.connectedDevice.rssi,
      },
      role
    );
  }

  // ----------------------------------------------------------
  // POLAR H10 MONITORING (Standard Bluetooth Heart Rate Profile)
  // ----------------------------------------------------------
  private async subscribePolarH10(device: Device, role: "human" | "dog") {
    // Safety: Verify device is connected before subscribing
    if (!device) {
      this.log(`Cannot subscribe to ${role} device - device is null`);
      return;
    }

    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        this.log(`Cannot subscribe to ${role} device - not connected`);
        return;
      }
    } catch (e) {
      this.log(`Failed to check connection status for ${role} device`);
      return;
    }

    this.log(`Subscribing Polar H10 for ${role} (${device.id})`);

    // Store previous data for merging parsed values
    const previousDataKey = role === "human" ? "humanPolarData" : "dogPolarData";
    if (!(this as any)[previousDataKey]) {
      (this as any)[previousDataKey] = {};
    }

    // Polar H10 uses standard Heart Rate Service - NO START COMMAND NEEDED!
    // Data streams automatically after subscribing to notifications

    // Subscribe to Heart Rate Measurement characteristic
    try {
      const subscription = device.monitorCharacteristicForService(
        HEART_RATE_SERVICE_UUID,
        HEART_RATE_MEASUREMENT_UUID,
        (error, characteristic) => {
          try {
            if (error) {
              this.log(`Polar H10 notification error [${role}]: ${error.message}`);
              return;
            }
            if (!characteristic?.value) return;

            try {
              if (!characteristic?.value) {
                return;
              }

              const rawData = Buffer.from(characteristic.value, "base64");
              if (!rawData || rawData.length === 0) {
                return;
              }

              const data = new Uint8Array(rawData);
              if (!data || data.length === 0) {
                return;
              }

              // Parse Heart Rate data using PolarParser
              const parsed = parseHeartRate(data);

              if (parsed) {
                const previousData = (this as any)[previousDataKey] || {};
                const realTimeData = polarToRealTimeData(parsed, previousData);

                if (realTimeData) {
                  // Update stored data
                  (this as any)[previousDataKey] = realTimeData;

                  const targetData = role === "human" ? this.humanData : this.dogData;

                  // Safety: Ensure targetData exists
                  if (!targetData) {
                    this.log(`Warning: targetData is null for ${role}`);
                    AppLogger.warn(`Unexpected null targetData for ${role}`);
                    return;
                  }

                  // Update values from parsed data with safety checks
                  if (realTimeData.heart_rate !== undefined &&
                    typeof realTimeData.heart_rate === 'number' &&
                    realTimeData.heart_rate > 0 &&
                    realTimeData.heart_rate < 300) {
                    targetData.heartRate = realTimeData.heart_rate;
                  }

                  // HRV is calculated from RR intervals in parseHeartRate
                  if (realTimeData.hrv !== undefined &&
                    typeof realTimeData.hrv === 'number' &&
                    realTimeData.hrv > 0 &&
                    realTimeData.hrv < 1000) {
                    // Ensure hrv array exists
                    if (!Array.isArray(targetData.hrv)) {
                      targetData.hrv = [];
                    }
                    // Store HRV value in the hrv array (for sync calculations)
                    targetData.hrv.push(realTimeData.hrv);
                    if (targetData.hrv.length > 64) targetData.hrv.shift();
                  }

                  // Polar H10 doesn't provide SpO2 or battery via HR service
                  // SpO2 remains 0 (not available from Polar H10)
                  // Battery would need to be read from a different service if available

                  targetData.lastUpdate = Date.now();

                  // Safety: Only emit if we have valid data
                  try {
                    this.emitDeviceData(role);
                  } catch (emitError: any) {
                    this.log(`Error emitting device data [${role}]: ${emitError?.message ?? emitError}`);
                  }

                  this.log(`Polar H10 data [${role}]: HR=${parsed.heartRate}, HRV=${realTimeData.hrv ?? 'N/A'}, Contact=${parsed.hasContact}`);
                  AppLogger.info(`Packet received Polar H10 [${role}] HR=${parsed.heartRate} HRV=${realTimeData.hrv ?? "N/A"}`);
                }
              } else {
                this.log(`Failed to parse Polar H10 data from ${role} device`);
                AppLogger.error(`Packet parse failed Polar H10 [${role}] parseHeartRate returned null`);
                // Even if parsing fails, emit current data (which will be 0 if no data received)
                try {
                  this.emitDeviceData(role);
                } catch (emitError: any) {
                  this.log(`Error emitting device data after parse failure [${role}]: ${emitError?.message ?? emitError}`);
                }
              }
            } catch (parseError: any) {
              this.log(`Parse error [${role}]: ${parseError?.message ?? parseError}`);
              AppLogger.error(`Packet parse failed Polar H10 [${role}]`, parseError);
              // Don't crash - just log the error
            }
          } catch (callbackError: any) {
            // Prevent callback errors from crashing the app
            this.log(`Error in Polar H10 callback [${role}]: ${callbackError?.message ?? callbackError}`);
          }
        }
      );

      // CRITICAL: Store subscription for cleanup to prevent memory leaks
      if (subscription) {
        const deviceId = device.id;
        if (!this.deviceSubscriptions.has(deviceId)) {
          this.deviceSubscriptions.set(deviceId, []);
        }
        this.deviceSubscriptions.get(deviceId)!.push(subscription);
        this.subscriptions.push(subscription);
        this.log(`Subscribed to Polar H10 Heart Rate for ${role} - data will stream automatically`);
      } else {
        this.log(`Warning: Polar H10 subscription returned null for ${role}`);
      }
    } catch (subError: any) {
      this.log(`Failed to subscribe Polar H10 notify for ${role}: ${subError?.message ?? subError}`);
      // Don't throw - subscription failure shouldn't crash the app
      // Connection can still succeed even if subscription fails
    }
  }

  // ----------------------------------------------------------
  // READ BATTERY LEVEL FROM BATTERY SERVICE
  // ----------------------------------------------------------
  private async readBatteryLevel(device: Device, role: "human" | "dog" | "vest"): Promise<void> {
    try {
      const isConnected = await device.isConnected();
      if (!isConnected) {
        this.log(`Cannot read battery for ${role} - device not connected`);
        return;
      }

      // Read battery level from standard Battery Service
      const batteryChar = await device.readCharacteristicForService(
        BATTERY_SERVICE_UUID,
        BATTERY_LEVEL_UUID
      );

      if (batteryChar?.value) {
        const batteryData = Buffer.from(batteryChar.value, "base64");
        if (batteryData.length > 0) {
          const batteryLevel = batteryData[0]; // Battery level is 0-100%

          // Validate battery level
          if (batteryLevel >= 0 && batteryLevel <= 100) {
            if (role === "vest") {
              // Emit vest battery data
              this.log(`Read battery level for vest: ${batteryLevel}%`);
              this.emit("data", {
                profile: "vest",
                battery: batteryLevel,
              });
            } else {
              const targetData = role === "human" ? this.humanData : this.dogData;
              if (targetData) {
                targetData.battery = batteryLevel;
                this.log(`Read battery level for ${role}: ${batteryLevel}%`);

                // Emit updated data with battery
                this.emitDeviceData(role);
              }
            }
          }
        }
      }
    } catch (error: any) {
      // Battery service might not be available on all devices - non-critical
      this.log(`Could not read battery level for ${role}: ${error?.message ?? error}`);
    }
  }

  // ----------------------------------------------------------
  // CALCULATE STRESS FROM HRV
  // Lower HRV = Higher stress, Higher HRV = Lower stress
  // Stress score: 0-100 (0 = no stress, 100 = high stress)
  // ----------------------------------------------------------
  private calculateStressFromHRV(hrv: number | null | undefined): number {
    if (!hrv || hrv <= 0) {
      return 50; // Unknown/moderate stress if no HRV data
    }

    // HRV ranges (in ms):
    // Very low HRV (< 20ms) = High stress (80-100)
    // Low HRV (20-40ms) = Moderate-high stress (60-80)
    // Normal HRV (40-60ms) = Low-moderate stress (30-60)
    // Good HRV (60-100ms) = Low stress (10-30)
    // Excellent HRV (> 100ms) = Very low stress (0-10)

    if (hrv < 20) {
      return Math.min(100, 80 + (20 - hrv) * 1); // 80-100
    } else if (hrv < 40) {
      return Math.min(80, 60 + (40 - hrv) * 1); // 60-80
    } else if (hrv < 60) {
      return Math.min(60, 30 + (60 - hrv) * 1); // 30-60
    } else if (hrv < 100) {
      return Math.min(30, 10 + (100 - hrv) * 0.5); // 10-30
    } else {
      return Math.max(0, 10 - (hrv - 100) * 0.1); // 0-10
    }
  }

  // Remove old parseRunmefitHeartRate and parseRunmefitHRV methods
  // They are replaced by ProtobufParser

  // Emit device data event with all sensor readings
  // Always emits data, showing 0 for missing values
  private emitDeviceData(role: "human" | "dog") {
    try {
      const data = role === "human" ? this.humanData : this.dogData;

      // Safety: Ensure data exists
      if (!data) {
        this.log(`Warning: ${role} data is null, cannot emit`);
        return;
      }

      // Safety: Ensure hrv array exists and is valid
      const hrvArray = Array.isArray(data.hrv) ? data.hrv : [];
      const latestHRV = hrvArray.length > 0 && typeof hrvArray[hrvArray.length - 1] === 'number'
        ? hrvArray[hrvArray.length - 1]
        : 0;

      // Calculate stress from HRV
      const stressScore = this.calculateStressFromHRV(latestHRV);

      const payload: any = {
        profile: role,
        heartRate: (typeof data.heartRate === 'number' && data.heartRate >= 0) ? data.heartRate : 0,
        spO2: (typeof data.spO2 === 'number' && data.spO2 >= 0) ? data.spO2 : 0,
        hrv: (typeof latestHRV === 'number' && latestHRV >= 0) ? latestHRV : 0,
        respiratoryRate: (typeof data.respiratoryRate === 'number' && data.respiratoryRate >= 0) ? data.respiratoryRate : 0,
        battery: (typeof data.battery === 'number' && data.battery >= 0) ? data.battery : 0,
        stress: stressScore, // Calculated from HRV
        rssi: typeof this.rssi === 'number' ? this.rssi : -60,
        firmwareVersion: this.firmwareVersion || "ble-real-0.1",
        sleepScore: (typeof this.sleepScore === 'number' && this.sleepScore >= 0) ? this.sleepScore : 0,
        recoveryScore: (typeof this.recoveryScore === 'number' && this.recoveryScore >= 0) ? this.recoveryScore : 0,
        strainScore: (typeof this.strainScore === 'number' && this.strainScore >= 0) ? this.strainScore : 0,
      };

      // Add HRV history for sync calculations (safely)
      try {
        payload.hrvHistory = Array.isArray(hrvArray) ? [...hrvArray] : [];
      } catch (e) {
        payload.hrvHistory = [];
      }

      // Safety: Wrap emit in try-catch to prevent crashes if no listeners
      try {
        this.emit("data", payload);
        this.log(`Emitted data [${role}]: HR=${payload.heartRate}, SpO2=${payload.spO2}, HRV=${payload.hrv}, Battery=${payload.battery}%, Stress=${payload.stress}`);
      } catch (emitError: any) {
        this.log(`Error emitting data event [${role}]: ${emitError?.message ?? emitError}`);
        // Don't throw - just log the error
      }
    } catch (error: any) {
      this.log(`Error in emitDeviceData [${role}]: ${error?.message ?? error}`);
      // Don't throw - just log the error
    }
  }

  // ----------------------------------------------------------
  // PAWSOMEBOND VEST — COMMANDS ONLY (Output-only device)
  // CRITICAL: Vest does NOT support notifications - it's output-only
  // Only write commands, never subscribe to characteristics
  // ----------------------------------------------------------

  /**
   * Write a raw UTF-8 string to CMD RX characteristic (beb54840).
   * All therapy control goes through this method.
   */
  private async writeCmd(cmd: string): Promise<boolean> {
    const vest = this.devices.vest;
    if (!vest) {
      this.log(`CMD write failed: harness not connected`);
      return false;
    }
    try {
      const isConnected = await vest.isConnected();
      if (!isConnected) {
        this.log(`CMD write failed: harness not connected`);
        return false;
      }
    } catch (e: any) {
      this.log(`CMD write failed: ${e?.message ?? e}`);
      return false;
    }

    const base64 = Buffer.from(cmd, "utf8").toString("base64");
    try {
      await vest.writeCharacteristicWithResponseForService(
        VEST_SERVICE_UUID,
        VEST_CMD_RX_UUID,
        base64
      );
      this.log(`✓ CMD sent: ${cmd}`);
      return true;
    } catch (writeError: any) {
      try {
        await vest.writeCharacteristicWithoutResponseForService(
          VEST_SERVICE_UUID,
          VEST_CMD_RX_UUID,
          base64
        );
        this.log(`✓ CMD sent (no-response): ${cmd}`);
        return true;
      } catch (fallbackError: any) {
        this.log(`CMD write failed: ${writeError?.message ?? writeError}`);
        return false;
      }
    }
  }

  /**
   * Send CALM command via BLE: writes "CALM:protocol:intensity:duration" to beb54840.
   * Confirmation arrives on beb54841 as THERAPY:HEARTBEAT within ~1 second.
   */
  async sendCalmBLE(protocol: number, intensity: number, duration: number): Promise<boolean> {
    const cmd = `CALM:${protocol}:${intensity}:${duration}`;
    this.currentTherapyMode = protocol;
    const ok = await this.writeCmd(cmd);
    if (ok) this.emit("therapy_mode_changed", { mode: protocol, name: cmd });
    return ok;
  }

  /**
   * Send STOP command via BLE: writes "STOP" to beb54840.
   * Confirmation arrives on beb54841 as STOPPED.
   */
  async sendStopBLE(): Promise<boolean> {
    this.currentTherapyMode = null;
    this.stopBondSyncMode();
    const ok = await this.writeCmd("STOP");
    if (ok) this.emit("therapy_mode_changed", { mode: 0, name: "STOP" });
    return ok;
  }

  /**
   * Legacy: send therapy command by code. Now maps codes to the new string format.
   */
  async sendTherapyCommand(commandCode: number): Promise<boolean> {
    if (commandCode === THERAPY.STOP) {
      return this.sendStopBLE();
    }
    if (commandCode === THERAPY.BOND_SYNC) {
      this.startBondSyncMode();
    } else {
      this.stopBondSyncMode();
    }
    return this.writeCmd(`CALM:${commandCode}:3:60`);
  }

  /**
   * Send owner heartbeat to harness (for Bond Sync mode).
   * Uses CMD RX characteristic with a HEARTBEAT:bpm string.
   */
  async sendOwnerHeartbeat(bpm: number): Promise<boolean> {
    if (typeof bpm !== 'number' || bpm < 30 || bpm > 250) {
      this.log(`Invalid BPM: ${bpm}`);
      return false;
    }
    return this.writeCmd(`HEARTBEAT:${Math.round(bpm)}`);
  }

  /**
   * @deprecated Intensity is now embedded in the CALM:protocol:intensity:duration string.
   * Kept for backward compatibility — sends an INTENSITY:value command.
   */
  async setVestIntensity(intensity: number): Promise<boolean> {
    const clamped = Math.max(0, Math.min(255, Math.round(intensity)));
    return this.writeCmd(`INTENSITY:${clamped}`);
  }

  /**
   * WiFi provisioning via BLE (beb54843). Happens once during first setup.
   * Writes {ssid, password} JSON, then listens for SUCCESS/FAILED on beb54841.
   * Does NOT disconnect — caller handles navigation on success.
   */
  async writeWifiCredentials(ssid: string, password: string): Promise<boolean> {
    const vest = this.devices.vest;
    if (!vest) {
      this.log("Harness not connected - cannot provision WiFi");
      return false;
    }
    try {
      const isConnected = await vest.isConnected();
      if (!isConnected) {
        this.log("Harness not connected");
        return false;
      }
      const payload = JSON.stringify({ ssid: ssid.trim(), password: password.trim() });
      const base64 = Buffer.from(payload, "utf8").toString("base64");
      await vest.writeCharacteristicWithResponseForService(
        VEST_SERVICE_UUID,
        VEST_WIFI_PROVISION_UUID,
        base64
      );
      this.log("WiFi credentials written to harness via beb54843");
      return true;
    } catch (e: any) {
      this.log("WiFi provision failed: " + (e?.message ?? e));
      return false;
    }
  }

  // Send vest command code (0x00-0x0D) - legacy method, now uses sendTherapyCommand
  async writeVestCommandCode(commandCode: number): Promise<void> {
    // Use new sendTherapyCommand method
    const success = await this.sendTherapyCommand(commandCode);
    if (!success) {
      throw new Error(`Failed to send therapy command: 0x${commandCode.toString(16).padStart(2, '0')}`);
    }
  }

  /** @deprecated Legacy method — use sendCalmBLE / sendStopBLE instead. */
  private async writeVestCommandCodeLegacy(commandCode: number): Promise<void> {
    const ok = await this.sendTherapyCommand(commandCode);
    if (!ok) throw new Error(`Failed to send therapy command: ${commandCode}`);
  }

  // Set custom vibration with intensity (0-255) - legacy method
  async setVestVibration(intensity: number): Promise<void> {
    // Use MASSAGE mode (0x0A) and set intensity separately
    await this.sendTherapyCommand(THERAPY.MASSAGE);
    await this.setVestIntensity(intensity);
  }

  // Direct vibration slider (0-255) - legacy method, now uses setVestIntensity
  async setVestVibrationDirect(value: number): Promise<void> {
    await this.setVestIntensity(value);
  }

  // IR light toggle (on/off) - legacy method, now uses LIGHT_ONLY mode
  async setVestIR(on: boolean): Promise<void> {
    if (on) {
      await this.sendTherapyCommand(THERAPY.LIGHT_ONLY);
    } else {
      await this.sendTherapyCommand(THERAPY.STOP);
    }
  }

  /**
   * Subscribe to STATUS TX characteristic (beb54841) for therapy confirmation.
   * ESP32 sends: THERAPY:HEARTBEAT, STOPPED, COOLDOWN:180, CONNECTED
   * This is the PRIMARY way to confirm therapy — NOT Firebase.
   */
  private async subscribeVestStatus(device: Device): Promise<void> {
    try {
      if (!device) {
        this.log("Cannot subscribe to harness status - device is null");
        return;
      }

      let isConnected = false;
      try {
        isConnected = await Promise.race([
          device.isConnected(),
          new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
        ]);
      } catch {
        this.log("Harness connection check failed, skipping status subscription");
        return;
      }
      if (!isConnected) return;

      const subscription = device.monitorCharacteristicForService(
        VEST_SERVICE_UUID,
        VEST_STATUS_TX_UUID,
        (error, characteristic) => {
          try {
            if (error) {
              this.log(`Status notify error: ${error.message}`);
              return;
            }
            if (!characteristic?.value) return;

            const status = Buffer.from(characteristic.value, "base64").toString("utf-8").trim();
            this.log(`◀ STATUS: ${status}`);

            if (status.startsWith("THERAPY:")) {
              this.emit("therapy_confirmed", { status: "running", raw: status });
            } else if (status === "STOPPED") {
              this.currentTherapyMode = null;
              this.emit("therapy_confirmed", { status: "stopped", raw: status });
            } else if (status.startsWith("COOLDOWN:")) {
              const secs = parseInt(status.split(":")[1], 10) || 0;
              this.emit("therapy_confirmed", { status: "cooldown", cooldownSecs: secs, raw: status });
            } else if (status === "CONNECTED") {
              this.log("Harness acknowledged BLE connection");
              this.emit("therapy_confirmed", { status: "connected", raw: status });
            } else if (status === "SUCCESS") {
              this.emit("wifi_provision_result", { success: true });
            } else if (status === "FAILED") {
              this.emit("wifi_provision_result", { success: false });
            }

            this.emit("vest_status", { status });
          } catch (e: any) {
            this.log(`Status callback error: ${e?.message ?? e}`);
          }
        }
      );

      if (subscription) {
        const deviceId = device.id;
        if (!this.deviceSubscriptions.has(deviceId)) {
          this.deviceSubscriptions.set(deviceId, []);
        }
        this.deviceSubscriptions.get(deviceId)!.push(subscription);
        this.subscriptions.push(subscription);
        this.log("Subscribed to harness STATUS (beb54841) for therapy confirmation");
      }
    } catch (error: any) {
      this.log(`Status subscription error (non-critical): ${error?.message ?? error}`);
    }
  }

  /**
   * Subscribe to TELEMETRY TX characteristic (beb54842).
   * ESP32 sends JSON every 3s with live state (state, anxietyScore, battery, etc.).
   * App emits "telemetry" event so FirebaseContext can bridge it to RTDB.
   */
  private async subscribeTelemetry(device: Device): Promise<void> {
    try {
      if (!device) return;
      let isConnected = false;
      try {
        isConnected = await Promise.race([
          device.isConnected(),
          new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
        ]);
      } catch { return; }
      if (!isConnected) return;

      const subscription = device.monitorCharacteristicForService(
        VEST_SERVICE_UUID,
        VEST_TELEMETRY_TX_UUID,
        (error, characteristic) => {
          try {
            if (error) {
              this.log(`Telemetry notify error: ${error.message}`);
              return;
            }
            if (!characteristic?.value) return;

            const raw = Buffer.from(characteristic.value, "base64").toString("utf-8").trim();
            try {
              const telemetry = JSON.parse(raw);
              this.emit("telemetry", telemetry);
            } catch {
              this.log(`Telemetry parse error: ${raw.substring(0, 80)}`);
            }
          } catch (e: any) {
            this.log(`Telemetry callback error: ${e?.message ?? e}`);
          }
        }
      );

      if (subscription) {
        const deviceId = device.id;
        if (!this.deviceSubscriptions.has(deviceId)) {
          this.deviceSubscriptions.set(deviceId, []);
        }
        this.deviceSubscriptions.get(deviceId)!.push(subscription);
        this.subscriptions.push(subscription);
        this.log("Subscribed to harness TELEMETRY (beb54842) for live data bridge");
      }
    } catch (error: any) {
      this.log(`Telemetry subscription error: ${error?.message ?? error}`);
    }
  }

  /** @deprecated Legacy wrapper — forwards to writeCmd. */
  private async writeVestCommand(payload: string) {
    const ok = await this.writeCmd(payload);
    if (!ok) throw new Error("Failed to write command to harness");
  }

  sendComfortSignal(
    target: "dog" | "human",
    opts?: { redLight?: boolean; vibration?: "gentle" | "pulse"; durationMs?: number }
  ) {
    // Map comfort signals to vest commands
    const vibration = opts?.vibration ?? (target === "dog" ? "gentle" : "pulse");
    let commandCode: number;

    if (vibration === "gentle") {
      commandCode = THERAPY.MASSAGE; // Use MASSAGE for gentle vibration
    } else if (vibration === "pulse") {
      commandCode = THERAPY.CALM; // Use CALM for pulse-like breathing
    } else {
      commandCode = THERAPY.CALM;
    }

    // Enable IR light if requested
    if (opts?.redLight ?? (target === "dog")) {
      // Use LIGHT_ONLY mode for red light therapy
      this.sendTherapyCommand(THERAPY.LIGHT_ONLY).catch(e =>
        this.log(`Failed to enable light therapy: ${e?.message ?? e}`)
      );
    }

    return this.sendTherapyCommand(commandCode).then(success => {
      if (!success) {
        throw new Error("Failed to send comfort signal");
      }
      return success;
    })
      .then(() => {
        this.comfortStatus = "active";
        this.emit("comfort", { status: "active", target });

        // Auto-stop after duration
        if (opts?.durationMs) {
          setTimeout(() => {
            this.sendTherapyCommand(THERAPY.STOP).catch(e =>
              this.log(`Failed to stop vest: ${e?.message ?? e}`)
            );
            this.comfortStatus = "idle";
            this.emit("comfort", { status: "idle", target });
          }, opts.durationMs);
        }
      })
      .catch((e) => {
        this.log("Comfort signal failed: " + String(e?.message ?? e));
        throw e;
      });
  }

  sendCue(type: "vibrate" | "beep" | "tone" = "vibrate") {
    // Backwards-compatibility: map cues to comfort signals.
    const vibration = type === "vibrate" ? "gentle" : type === "tone" ? "pulse" : "pulse";
    return this.sendComfortSignal("dog", { vibration });
  }

  // ----------------------------------------------------------
  // BOND SYNC MODE - Continuous HR updates
  // Per NEW_REQUIREMENTS.md: When Bond Sync (0x08) is active,
  // app must continuously send owner's HR every second
  // ----------------------------------------------------------
  private startBondSyncMode() {
    // Stop any existing bond sync interval
    this.stopBondSyncMode();

    this.log("Starting Bond Sync mode - will send owner HR every second");

    // Set up interval to send owner HR every second
    this.bondSyncInterval = setInterval(() => {
      try {
        // Safety: Check if vest is still connected
        const vest = this.devices.vest;
        if (!vest) {
          this.log("Vest not available for Bond Sync, stopping");
          this.stopBondSyncMode();
          return;
        }

        // Get current owner HR
        const ownerHR = this.humanData?.heartRate ?? 0;

        // Only send if we have valid HR data and vest is connected
        if (ownerHR > 0 && ownerHR < 300) {
          // Check connection before sending (non-blocking)
          vest.isConnected().then((isConnected) => {
            if (isConnected) {
              this.sendOwnerHeartbeat(ownerHR).catch((error: any) => {
                this.log(`Failed to send owner heartbeat in Bond Sync mode: ${error?.message ?? error}`);
                // If sending fails repeatedly, might want to stop Bond Sync
              });
            } else {
              this.log("Vest disconnected during Bond Sync, stopping");
              this.stopBondSyncMode();
            }
          }).catch((connError: any) => {
            this.log(`Error checking vest connection in Bond Sync: ${connError?.message ?? connError}`);
            // If we can't check connection, stop Bond Sync to be safe
            this.stopBondSyncMode();
          });
        } else {
          // No valid HR data - log but don't stop Bond Sync (HR might come later)
          if (ownerHR === 0) {
            // Only log occasionally to avoid spam
            const now = Date.now();
            if (!(this as any).lastBondSyncWarning || now - (this as any).lastBondSyncWarning > 5000) {
              this.log("Bond Sync active but no valid owner HR data yet");
              (this as any).lastBondSyncWarning = now;
            }
          }
        }
      } catch (error: any) {
        this.log(`Error in Bond Sync interval: ${error?.message ?? error}`);
        // Don't stop Bond Sync on single error - might be temporary
      }
    }, this.BOND_SYNC_HR_INTERVAL_MS);
  }

  private stopBondSyncMode() {
    if (this.bondSyncInterval) {
      clearInterval(this.bondSyncInterval);
      this.bondSyncInterval = undefined;
      this.log("Stopped Bond Sync mode - no longer sending owner HR");
    }
  }

  // ----------------------------------------------------------
  // BOND ENGINE UPDATE LOOP
  // ----------------------------------------------------------
  private updateBondScores() {
    try {
      // Safety: Ensure sync windows are arrays
      const humanWindow = Array.isArray(this.humanSyncWindow) ? this.humanSyncWindow : [];
      const dogWindow = Array.isArray(this.dogSyncWindow) ? this.dogSyncWindow : [];

      const humanSeries = humanWindow.slice(-this.MAX_SYNC_SAMPLES);
      const dogSeries = dogWindow.slice(-this.MAX_SYNC_SAMPLES);

      if (
        !Array.isArray(humanSeries) || humanSeries.length < this.MIN_SYNC_SAMPLES ||
        !Array.isArray(dogSeries) || dogSeries.length < this.MIN_SYNC_SAMPLES
      ) {
        return;
      }

      const humanHRVlatest = typeof humanSeries[humanSeries.length - 1] === 'number'
        ? humanSeries[humanSeries.length - 1]
        : 0;
      const dogHRVlatest = typeof dogSeries[dogSeries.length - 1] === 'number'
        ? dogSeries[dogSeries.length - 1]
        : 0;

      // Use real HR data if available, otherwise use defaults
      const humanHR = (typeof this.humanData?.heartRate === 'number' && this.humanData.heartRate > 0)
        ? this.humanData.heartRate
        : 75;
      const dogHR = (typeof this.dogData?.heartRate === 'number' && this.dogData.heartRate > 0)
        ? this.dogData.heartRate
        : 95;
      const resp = (typeof this.dogData?.respiratoryRate === 'number' && this.dogData.respiratoryRate > 0)
        ? this.dogData.respiratoryRate
        : 24;

      // Safety: Ensure calculation functions don't crash
      let humanC = 0;
      let dogC = 0;
      let sync = 0;

      try {
        humanC = calculateHumanCoherence(humanHRVlatest, humanHR);
        dogC = calculateDogCoherence(dogHRVlatest, dogHR, resp);
        sync = calculateSynchronization(humanSeries, dogSeries);
      } catch (calcError: any) {
        this.log(`Error calculating bond scores: ${calcError?.message ?? calcError}`);
        AppLogger.error("Bond score calculation error", calcError);
        return;
      }

      const durSec = (Date.now() - this.sessionStart) / 1000;

      let bond0to10 = 0;
      try {
        bond0to10 = calculateBondScore(humanC, dogC, sync, durSec);
      } catch (bondError: any) {
        this.log(`Error calculating bond score: ${bondError?.message ?? bondError}`);
        AppLogger.error("Bond score calculation error", bondError);
        return;
      }

      // Safety: Ensure scores are valid numbers
      this.sleepScore = Math.max(0, Math.min(100, Math.round(bond0to10 * 10)));
      this.recoveryScore = Math.max(0, Math.min(100, Math.round(dogC)));
      this.strainScore = Math.max(0, Math.min(100, Math.round(humanC)));

      const now = Date.now();
      if (now - this.lastBondLogTime >= this.BOND_LOG_INTERVAL_MS) {
        this.lastBondLogTime = now;
        AppLogger.info(
          `Bond score calculated humanC=${Math.round(humanC)} dogC=${Math.round(dogC)} sync=${Math.round(sync)} bond=${this.sleepScore} durationSec=${Math.round(durSec)}`
        );
      }

      // Emit combined bond scores
      try {
        this.emit("data", {
          sleepScore: this.sleepScore,
          recoveryScore: this.recoveryScore,
          strainScore: this.strainScore,
          bondScore: this.sleepScore,
          humanHealthScore: this.strainScore,
          dogHealthScore: this.recoveryScore,
        });
      } catch (emitError: any) {
        this.log(`Error emitting bond scores: ${emitError?.message ?? emitError}`);
      }
    } catch (error: any) {
      this.log(`Error in updateBondScores: ${error?.message ?? error}`);
      // Don't throw - just log the error
    }
  }

  // ----------------------------------------------------------
  // TRAINING
  // ----------------------------------------------------------
  startTrainingSession(meta?: { type?: string }) {
    const s: Session = {
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      durationMin: 0,
      notes: meta?.type ?? "training",
    };
    this.sessions.unshift(s);
    this.sessionStart = Date.now();
    this.emit("training_started", s);
  }

  stopTrainingSession() {
    if (!this.sessions.length) return;

    const s = this.sessions[0];
    const mins = (Date.now() - this.sessionStart) / 60000;

    s.durationMin = Math.max(1, Math.round(mins));
    this.emit("training_stopped", s);
  }

  // ----------------------------------------------------------
  // MISC (UI compatibility)
  // ----------------------------------------------------------
  manualFetch() {
    this.emit("data", {
      sleepScore: this.sleepScore,
      recoveryScore: this.recoveryScore,
      strainScore: this.strainScore,
    });
  }

  setMockMode(_on: boolean) {
    this.log("Mock mode ignored (real BLE manager)");
  }

  assignProfile(p: "human" | "dog") {
    this.assignedProfile = p;
    this.log(`assignedProfile=${p}`);
    this.emit("assigned", { profile: p });
  }

  emitLogs() {
    this.emit("logs", this.logs.slice(-50));
  }

  // ----------------------------------------------------------
  // CLEANUP HELPER: Clean up subscriptions for a specific device role
  // ----------------------------------------------------------
  private cleanupDeviceSubscriptions(role: Role) {
    try {
      // Remove subscriptions related to this device
      // Note: We can't easily identify which subscription belongs to which device,
      // so we'll clean up all subscriptions when a device disconnects
      // The cleanup() method handles full cleanup
      this.log(`Cleaning up subscriptions for ${role} device`);
    } catch (e: any) {
      this.log(`Error cleaning up subscriptions for ${role}: ${e?.message ?? e}`);
    }
  }

  // ----------------------------------------------------------
  // CLEANUP (CRITICAL for preventing memory leaks)
  // ----------------------------------------------------------
  cleanup() {
    this.log("BLEManager: Cleaning up...");

    // Stop Bond Sync mode first
    this.stopBondSyncMode();

    // Remove all subscriptions (CRITICAL: prevents memory leaks)
    // Clean up per-device subscriptions
    this.deviceSubscriptions.forEach((subs, deviceId) => {
      subs.forEach(sub => {
        try {
          if (sub && typeof sub.remove === 'function') {
            sub.remove();
          }
        } catch (e) {
          // Ignore cleanup errors - just log
          this.log(`Warning: Error removing subscription for device ${deviceId}: ${e}`);
        }
      });
    });
    this.deviceSubscriptions.clear();

    // Clean up main subscriptions array
    const subscriptionsToRemove = [...this.subscriptions];
    subscriptionsToRemove.forEach(sub => {
      try {
        if (sub && typeof sub.remove === 'function') {
          sub.remove();
        }
      } catch (e) {
        // Ignore cleanup errors - just log
        this.log(`Warning: Error removing subscription during cleanup: ${e}`);
      }
    });
    this.subscriptions = [];

    // Stop scanning
    if (this.scanning) {
      try {
        this.stopScan();
      } catch (e) {
        this.log("Error stopping scan during cleanup: " + String(e));
      }
    }

    // Clear intervals
    if (this.bondInterval) {
      try {
        clearInterval(this.bondInterval);
        this.bondInterval = undefined;
      } catch (e) {
        this.log("Error clearing bond interval: " + String(e));
      }
    }

    if (this.batteryReadInterval) {
      try {
        clearInterval(this.batteryReadInterval);
        this.batteryReadInterval = undefined;
      } catch (e) {
        this.log("Error clearing battery read interval: " + String(e));
      }
    }

    if (this.bondSyncInterval) {
      try {
        clearInterval(this.bondSyncInterval);
        this.bondSyncInterval = undefined;
      } catch (e) {
        this.log("Error clearing bond sync interval: " + String(e));
      }
    }

    // Disconnect all devices
    if (this.devices) {
      Object.values(this.devices).forEach(async (device) => {
        if (device) {
          try {
            await device.cancelConnection();
          } catch (e) {
            // Ignore disconnect errors
          }
        }
      });
    }

    // Reset all state
    this.devices = {};
    this.roles = {};
    this.humanData = { heartRate: 0, spO2: 0, hrv: [], respiratoryRate: 0, battery: 0, lastUpdate: 0 };
    this.dogData = { heartRate: 0, spO2: 0, hrv: [], respiratoryRate: 0, battery: 0, lastUpdate: 0 };
    this.humanSyncWindow = [];
    this.dogSyncWindow = [];
    this.isConnected = false;
    this.connectedDevice = null;
    this.assignedProfile = null;
    this.connectedRoles = { human: false, dog: false, vest: false };
    this.comfortStatus = "idle";
    this.currentTherapyMode = null;

    this.log("BLEManager: Cleanup complete");
  }

  // ----------------------------------------------------------
  // DISCONNECT
  // ----------------------------------------------------------
  disconnect() {
    // Use cleanup method to ensure all subscriptions are removed
    this.cleanup();

    try {
      this.emit("disconnected");
      this.emitConnections();
    } catch (emitError: any) {
      this.log(`Error emitting disconnect events: ${emitError?.message ?? emitError}`);
    }
  }

  private runBondingTick() {
    this.captureSyncSample("human");
    this.captureSyncSample("dog");
    this.updateBondScores();
  }

  private captureSyncSample(role: "human" | "dog") {
    try {
      const store = role === "human" ? this.humanData : this.dogData;

      // Safety: Ensure store and hrv array exist
      if (!store || !Array.isArray(store.hrv) || store.hrv.length === 0) {
        return;
      }

      // Safety: Ensure lastUpdate is valid
      if (typeof store.lastUpdate !== 'number' || store.lastUpdate <= 0) {
        return;
      }

      const isFresh =
        Date.now() - store.lastUpdate <= this.SAMPLE_INTERVAL_MS * 2;
      if (!isFresh) return;

      const latest = store.hrv[store.hrv.length - 1];
      if (latest === undefined || typeof latest !== 'number' || latest <= 0) {
        return;
      }

      const buffer = role === "human" ? this.humanSyncWindow : this.dogSyncWindow;

      // Safety: Ensure buffer is an array
      if (!Array.isArray(buffer)) {
        if (role === "human") {
          this.humanSyncWindow = [];
        } else {
          this.dogSyncWindow = [];
        }
        return;
      }

      buffer.push(latest);
      if (buffer.length > this.MAX_SYNC_SAMPLES) buffer.shift();
    } catch (error: any) {
      this.log(`Error in captureSyncSample [${role}]: ${error?.message ?? error}`);
      // Don't throw - just log the error
    }
  }

  // ----------------------------------------------------------
  // STATE (UI)
  // ----------------------------------------------------------
  getState() {
    return {
      isConnected: this.isConnected,
      assignedProfile: this.assignedProfile,
      rssi: this.rssi,
      human: {
        battery: this.humanData.battery ?? 0,
        heartRate: this.humanData.heartRate ?? 0,
        spO2: this.humanData.spO2 ?? 0,
        hrv: this.humanData.hrv.length > 0 ? this.humanData.hrv[this.humanData.hrv.length - 1] : 0,
        respiratoryRate: this.humanData.respiratoryRate ?? 0,
      },
      dog: {
        battery: this.dogData.battery ?? 0,
        heartRate: this.dogData.heartRate ?? 0,
        spO2: this.dogData.spO2 ?? 0,
        hrv: this.dogData.hrv.length > 0 ? this.dogData.hrv[this.dogData.hrv.length - 1] : 0,
        respiratoryRate: this.dogData.respiratoryRate ?? 0,
      },
      sessions: this.sessions.slice(0, 10),
      firmwareVersion: this.firmwareVersion,
      sleepScore: this.sleepScore ?? 0,
      recoveryScore: this.recoveryScore ?? 0,
      strainScore: this.strainScore ?? 0,
      logs: this.logs.slice(-50),
    };
  }
}

export const bleManager = new BLEManagerReal();
