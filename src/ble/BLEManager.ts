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

// ============== PAWSOMEBOND VEST UUIDs ==============
// Based on NEW_REQUIREMENTS.md - PawsomeBond App Specification
const VEST_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const VEST_COMMAND_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";  // WRITE - therapy mode
const VEST_INTENSITY_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9";  // WRITE - 0-255
const VEST_HEARTBEAT_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26aa";  // WRITE - owner BPM
const VEST_STATUS_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26ab";     // READ/NOTIFY
const VEST_WIFI_PROVISION_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26ac"; // WRITE - WiFi SSID+password (setup only)

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

// Device name patterns - updated per NEW_REQUIREMENTS.md
// Polar H10: name includes "Polar H10" (case-insensitive)
// PAWSOMEBOND-VEST: exact name match "PAWSOMEBOND-VEST"
const DEVICE_NAME_PATTERNS = {
  human: [
    /polar\s*h10/i,      // "Polar H10", "POLAR H10", etc.
    /polar\s*h\s*10/i,   // "Polar H 10" (with space)
  ],
  dog: [
    /polar\s*h10/i,      // "Polar H10" (same as human - user selects role)
    /polar\s*h\s*10/i,   // "Polar H 10" (with space)
  ],
  vest: [
    /^pawsomebond-vest$/i,  // Exact match "PAWSOMEBOND-VEST" (case-insensitive)
    /pawsomebond-vest/i,    // Fallback: contains "pawsomebond-vest"
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
  // CRITICAL: Track subscriptions per device role to prevent memory leaks
  private subscriptions: any[] = [];
  private deviceSubscriptions: Map<string, any[]> = new Map(); // Map deviceId -> subscriptions array

  constructor() {
    super();
    this.log("BLEManagerReal initialized");
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
      return;
    }

    // Safety: Verify manager exists
    if (!this.manager) {
      this.log("ERROR: BLE Manager not initialized, cannot start scan");
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
      this.log("Scan started - filtering for Polar H10 and Vest devices");
      this.log("Scanning without filter to find both HR service (0x180D) and Vest service (4fafc201-...)");

      // Scan without filter to include both service UUIDs
      // Polars use standard HR service (0x180D), Vest uses custom service (4fafc201-...)
      // Per integration guide: "Make sure app scans without filter or includes both service UUIDs"
      this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          this.log("Scan error: " + error.message);
          return;
        }
        if (!device) return;

        try {
          const { id, name, rssi } = device;

          // Get device service UUIDs (if available from scan response)
          // On Android, serviceUUIDs is often empty in scan; vest is then matched by name only (e.g. "PAWSOMEBOND-VEST").
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
          // PAWSOMEBOND-VEST: flexible matching for name variations
          const nameLower = (name?.toLowerCase() || "").trim();
          const isPolarH10ByName = nameLower.includes("polar h10") ||
            nameLower.includes("polar h 10");
          
          // CRITICAL: More flexible vest name matching to catch variations
          // Check for exact match, partial match, and common variations
          const isVestByName = nameLower === "pawsomebond-vest" ||
            nameLower === "pawsomebond vest" ||
            nameLower.startsWith("pawsomebond") ||
            (nameLower.includes("pawsomebond") && nameLower.includes("vest")) ||
            nameLower.includes("pawsomebond-vest");

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
            ? "PAWSOMEBOND-VEST (Therapy Vest)"
            : "Polar H10 (select role)";

          this.log(`Found ${label} [${detectionMethod}]: ${name || 'Unknown'} (${id})`);
          
          // If vest detected by service UUID but name doesn't match, use a default name
          const displayName = isVest && !isVestByName && !name 
            ? "PAWSOMEBOND-VEST" 
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
        // CRITICAL FIX: Vest is output-only device - DO NOT subscribe to notifications
        // Only write commands, never monitor characteristics
        this.log(`Vest connected (output-only, no subscriptions needed)`);

        // CRITICAL: Vest connection should NOT fail if status subscription fails
        // The vest is primarily an output device - we send commands to it
        // Status subscription is optional and should never crash the connection

        // Verify vest service exists before attempting subscription (optional)
        // Vest works fine without status subscription - it's output-only
        try {
          const isConnected = await device.isConnected();
          if (!isConnected) {
            this.log("Vest not connected, skipping status subscription");
            // Connection still succeeds - vest can send commands
          } else {
            // Verify service exists (non-blocking with timeout to prevent hanging)
            try {
              // Add timeout to prevent hanging on service discovery
              const servicePromise = device.services();
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Service discovery timeout")), 5000)
              );

              const services = await Promise.race([servicePromise, timeoutPromise]) as any[];
              const vestService = services?.find(s => s.uuid.toLowerCase() === VEST_SERVICE_UUID.toLowerCase());

              if (vestService) {
                // Service exists - optionally subscribe to status (non-critical)
                // Wrap in try-catch to prevent any crash
                try {
                  await Promise.race([
                    this.subscribeVestStatus(device),
                    new Promise((_, reject) =>
                      setTimeout(() => reject(new Error("Status subscription timeout")), 3000)
                    )
                  ]).catch((statusError: any) => {
                    // Silently fail - vest works without status subscription
                    this.log(`Info: Vest status subscription not available (this is OK): ${statusError?.message ?? statusError}`);
                  });
                } catch (statusError: any) {
                  // Double-catch to be extra safe
                  this.log(`Info: Vest status subscription skipped (this is OK): ${statusError?.message ?? statusError}`);
                  // Non-critical - vest works without status subscription
                }
              } else {
                this.log(`Info: Vest service not found in scan. Available services: ${services?.map(s => s.uuid).join(', ') || 'none'}`);
                this.log("Vest will work for sending commands, but status monitoring unavailable");
                // Connection still succeeds - vest can send commands
              }
            } catch (serviceError: any) {
              // Service discovery failed - this is OK, vest can still receive commands
              this.log(`Info: Could not read vest services (this is OK): ${serviceError?.message ?? serviceError}`);
              // Non-critical - connection still succeeds, vest can send commands
            }

            // Try to read initial battery level from standard Battery Service (0x180F)
            // ESP32 devices can expose this service for battery monitoring
            this.readBatteryLevel(device, "vest").catch((batteryError: any) => {
              this.log(`Info: Could not read initial vest battery (non-critical): ${batteryError?.message ?? batteryError}`);
              // Non-critical - vest works without battery level
            });

            // Start periodic battery reads if not already started
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
          }
        } catch (verifyError: any) {
          // Connection verification failed - but connection might still work
          this.log(`Info: Could not verify vest connection (connection may still work): ${verifyError?.message ?? verifyError}`);
          // Non-critical - connection still succeeds, vest can send commands
          // Don't throw - vest connection is successful even if status sub fails
        }
      }

      // Set up disconnect handler with error handling
      try {
        const disconnectSub = device.onDisconnected((error) => {
          try {
            this.log(`Device disconnected: ${role} - ${error?.message ?? "No error"}`);

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
    } catch (e: any) {
      this.log("Connect error: " + String(e?.message ?? e));

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
                }
              } else {
                this.log(`Failed to parse Polar H10 data from ${role} device`);
                // Even if parsing fails, emit current data (which will be 0 if no data received)
                try {
                  this.emitDeviceData(role);
                } catch (emitError: any) {
                  this.log(`Error emitting device data after parse failure [${role}]: ${emitError?.message ?? emitError}`);
                }
              }
            } catch (parseError: any) {
              this.log(`Parse error [${role}]: ${parseError?.message ?? parseError}`);
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
   * Send therapy command to vest (per NEW_REQUIREMENTS.md)
   * This is the core function to control the vest
   * @param commandCode - Therapy command code (0x00-0x0D)
   */
  async sendTherapyCommand(commandCode: number): Promise<boolean> {
    try {
      // Validate command code
      if (typeof commandCode !== 'number' || commandCode < 0 || commandCode > 0x0D) {
        const error = new Error(`Invalid therapy command code: ${commandCode}. Must be 0x00-0x0D`);
        this.log(`Failed to send therapy command: ${error.message}`);
        return false;
      }

      // Update current therapy mode
      this.currentTherapyMode = commandCode;

      // Handle Bond Sync mode - start/stop HR updates
      if (commandCode === THERAPY.BOND_SYNC) {
        this.startBondSyncMode();
      } else {
        // Stop Bond Sync mode for any other command (including STOP)
        this.stopBondSyncMode();
      }

      const vest = this.devices.vest;
      if (!vest) {
        const error = new Error("Vest not connected");
        this.log(`Failed to send therapy command: ${error.message}`);
        return false;
      }

      // Safety: Check connection
      try {
        const isConnected = await vest.isConnected();
        if (!isConnected) {
          const error = new Error("Vest device not connected");
          this.log(`Failed to send therapy command: ${error.message}`);
          return false;
        }
      } catch (connError: any) {
        const error = new Error(`Connection check failed: ${connError?.message ?? connError}`);
        this.log(`Failed to send therapy command: ${error.message}`);
        return false;
      }

      // Convert number to base64 (BLE requires this)
      const bytes = new Uint8Array([commandCode]);
      const base64 = Buffer.from(bytes).toString('base64');

      // Write to vest
      try {
        await vest.writeCharacteristicWithResponseForService(
          VEST_SERVICE_UUID,
          VEST_COMMAND_UUID,
          base64
        );

        const cmdName = Object.keys(THERAPY).find(k => THERAPY[k as keyof typeof THERAPY] === commandCode) ?? 'UNKNOWN';
        this.log(`✓ Sent therapy command: 0x${commandCode.toString(16).padStart(2, '0')} (${cmdName})`);

        // Emit therapy mode change event
        this.emit("therapy_mode_changed", { mode: commandCode, name: cmdName });

        return true;
      } catch (writeError: any) {
        // Fallback: Try without response
        try {
          await vest.writeCharacteristicWithoutResponseForService(
            VEST_SERVICE_UUID,
            VEST_COMMAND_UUID,
            base64
          );
          const cmdName = Object.keys(THERAPY).find(k => THERAPY[k as keyof typeof THERAPY] === commandCode) ?? 'UNKNOWN';
          this.log(`✓ Sent therapy command (no response): 0x${commandCode.toString(16).padStart(2, '0')} (${cmdName})`);

          // Emit therapy mode change event
          this.emit("therapy_mode_changed", { mode: commandCode, name: cmdName });

          return true;
        } catch (fallbackError: any) {
          const error = new Error(`Both write methods failed: ${writeError?.message ?? writeError}`);
          this.log(`Failed to send therapy command: ${error.message}`);
          return false;
        }
      }
    } catch (error: any) {
      this.log(`Failed to send therapy command: ${error?.message ?? error}`);
      return false;
    }
  }

  /**
   * Send owner heartbeat to vest (for Bond Sync mode)
   * Per NEW_REQUIREMENTS.md - sends owner's BPM to VEST_HEARTBEAT characteristic
   * @param bpm - Owner's heart rate in BPM
   */
  async sendOwnerHeartbeat(bpm: number): Promise<boolean> {
    try {
      // Validate BPM
      if (typeof bpm !== 'number' || bpm < 30 || bpm > 250) {
        const error = new Error(`Invalid BPM: ${bpm}. Must be 30-250`);
        this.log(`Failed to send owner heartbeat: ${error.message}`);
        return false;
      }

      const vest = this.devices.vest;
      if (!vest) {
        const error = new Error("Vest not connected");
        this.log(`Failed to send owner heartbeat: ${error.message}`);
        return false;
      }

      // Safety: Check connection
      try {
        const isConnected = await vest.isConnected();
        if (!isConnected) {
          const error = new Error("Vest device not connected");
          this.log(`Failed to send owner heartbeat: ${error.message}`);
          return false;
        }
      } catch (connError: any) {
        const error = new Error(`Connection check failed: ${connError?.message ?? connError}`);
        this.log(`Failed to send owner heartbeat: ${error.message}`);
        return false;
      }

      // Convert BPM to base64 (BLE requires this)
      const bytes = new Uint8Array([Math.round(bpm)]);
      const base64 = Buffer.from(bytes).toString('base64');

      // Write to vest heartbeat characteristic
      try {
        await vest.writeCharacteristicWithResponseForService(
          VEST_SERVICE_UUID,
          VEST_HEARTBEAT_UUID,
          base64
        );
        this.log(`✓ Sent owner heartbeat: ${Math.round(bpm)} BPM`);
        return true;
      } catch (writeError: any) {
        // Fallback: Try without response
        try {
          await vest.writeCharacteristicWithoutResponseForService(
            VEST_SERVICE_UUID,
            VEST_HEARTBEAT_UUID,
            base64
          );
          this.log(`✓ Sent owner heartbeat (no response): ${Math.round(bpm)} BPM`);
          return true;
        } catch (fallbackError: any) {
          const error = new Error(`Both write methods failed: ${writeError?.message ?? writeError}`);
          this.log(`Failed to send owner heartbeat: ${error.message}`);
          return false;
        }
      }
    } catch (error: any) {
      this.log(`Failed to send owner heartbeat: ${error?.message ?? error}`);
      return false;
    }
  }

  /**
   * Set vest intensity (0-255)
   * Per NEW_REQUIREMENTS.md - sends intensity to VEST_INTENSITY characteristic
   * @param intensity - Intensity value (0-255, typically 50-255)
   */
  async setVestIntensity(intensity: number): Promise<boolean> {
    try {
      // Validate intensity (per requirements: range 50-255, but we allow 0-255)
      const clampedIntensity = Math.max(0, Math.min(255, Math.round(intensity)));

      const vest = this.devices.vest;
      if (!vest) {
        const error = new Error("Vest not connected");
        this.log(`Failed to set vest intensity: ${error.message}`);
        return false;
      }

      // Safety: Check connection
      try {
        const isConnected = await vest.isConnected();
        if (!isConnected) {
          const error = new Error("Vest device not connected");
          this.log(`Failed to set vest intensity: ${error.message}`);
          return false;
        }
      } catch (connError: any) {
        const error = new Error(`Connection check failed: ${connError?.message ?? connError}`);
        this.log(`Failed to set vest intensity: ${error.message}`);
        return false;
      }

      // Convert intensity to base64
      const bytes = new Uint8Array([clampedIntensity]);
      const base64 = Buffer.from(bytes).toString('base64');

      // Write to vest intensity characteristic
      try {
        await vest.writeCharacteristicWithResponseForService(
          VEST_SERVICE_UUID,
          VEST_INTENSITY_UUID,
          base64
        );
        this.log(`✓ Set vest intensity: ${clampedIntensity} (${Math.round((clampedIntensity / 255) * 100)}%)`);
        return true;
      } catch (writeError: any) {
        // Fallback: Try without response
        try {
          await vest.writeCharacteristicWithoutResponseForService(
            VEST_SERVICE_UUID,
            VEST_INTENSITY_UUID,
            base64
          );
          this.log(`✓ Set vest intensity (no response): ${clampedIntensity} (${Math.round((clampedIntensity / 255) * 100)}%)`);
          return true;
        } catch (fallbackError: any) {
          const error = new Error(`Both write methods failed: ${writeError?.message ?? writeError}`);
          this.log(`Failed to set vest intensity: ${error.message}`);
          return false;
        }
      }
    } catch (error: any) {
      this.log(`Failed to set vest intensity: ${error?.message ?? error}`);
      return false;
    }
  }

  /**
   * WiFi provisioning (BLE setup only). Write SSID + password to harness, then disconnect.
   * Per requirements: BLE is used for first-time WiFi setup only.
   */
  async writeWifiCredentials(ssid: string, password: string): Promise<boolean> {
    const vest = this.devices.vest;
    if (!vest) {
      this.log("Vest not connected - cannot provision WiFi");
      return false;
    }
    try {
      const isConnected = await vest.isConnected();
      if (!isConnected) {
        this.log("Vest not connected");
        return false;
      }
      const payload = JSON.stringify({ ssid: ssid.trim(), password: password.trim() });
      const base64 = Buffer.from(payload, "utf8").toString("base64");
      await vest.writeCharacteristicWithResponseForService(
        VEST_SERVICE_UUID,
        VEST_WIFI_PROVISION_UUID,
        base64
      );
      this.log("WiFi credentials written; disconnecting after provisioning.");
      await vest.cancelConnection();
      this.connectedRoles.vest = false;
      if (this.devices.vest === vest) delete this.devices.vest;
      this.emitConnections();
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

  // Legacy method - kept for backward compatibility
  private async writeVestCommandCodeLegacy(commandCode: number): Promise<void> {
    const vest = this.devices.vest;
    if (!vest) {
      const error = new Error("Vest not connected - device not found in devices.vest");
      this.log(`Failed to write vest command: ${error.message}`);
      throw error;
    }

    try {
      // Safety: Validate command code (updated to 0x0D max per new requirements)
      if (typeof commandCode !== 'number' || commandCode < 0 || commandCode > 0x0D) {
        const error = new Error(`Invalid command code: ${commandCode}. Must be 0x00-0x0D`);
        this.log(`Failed to write vest command: ${error.message}`);
        throw error;
      }

      const isConnected = await vest.isConnected();
      if (!isConnected) {
        const error = new Error("Vest device not connected - isConnected() returned false");
        this.log(`Failed to write vest command: ${error.message}`);
        throw error;
      }

      // Verify service and characteristic exist
      try {
        const services = await vest.services();
        const vestService = services.find(s => s.uuid.toLowerCase() === VEST_SERVICE_UUID.toLowerCase());
        if (!vestService) {
          const error = new Error(`Vest service not found. Available services: ${services.map(s => s.uuid).join(', ')}`);
          this.log(`Failed to write vest command: ${error.message}`);
          throw error;
        }

        const characteristics = await vestService.characteristics();
        const commandChar = characteristics.find(c => c.uuid.toLowerCase() === VEST_COMMAND_UUID.toLowerCase());
        if (!commandChar) {
          const error = new Error(`Vest command characteristic not found. Available: ${characteristics.map(c => c.uuid).join(', ')}`);
          this.log(`Failed to write vest command: ${error.message}`);
          throw error;
        }

        this.log(`Vest service and characteristic found. Service: ${vestService.uuid}, Char: ${commandChar.uuid}`);
      } catch (discoveryError: any) {
        this.log(`Warning: Could not verify service/characteristic: ${discoveryError?.message ?? discoveryError}`);
        // Continue anyway - might still work
      }

      const data = new Uint8Array([commandCode]);
      const b64 = Buffer.from(data).toString("base64");

      const cmdName = Object.keys(THERAPY).find(k => THERAPY[k as keyof typeof THERAPY] === commandCode) ?? 'UNKNOWN';
      this.log(`Attempting to send vest command: 0x${commandCode.toString(16).padStart(2, '0')} (${cmdName}), base64: ${b64}, raw bytes: [${commandCode}]`);

      // Try withResponse first (preferred method)
      try {
        await vest.writeCharacteristicWithResponseForService(
          VEST_SERVICE_UUID,
          VEST_COMMAND_UUID,
          b64
        );
        this.log(`✓ Successfully sent vest command with response: 0x${commandCode.toString(16).padStart(2, '0')} (${cmdName})`);
        return;
      } catch (withResponseError: any) {
        this.log(`writeCharacteristicWithResponseForService failed: ${withResponseError?.message ?? withResponseError}. Trying withoutResponse...`);

        // Fallback: Try withoutResponse (some ESP32 devices prefer this)
        try {
          await vest.writeCharacteristicWithoutResponseForService(
            VEST_SERVICE_UUID,
            VEST_COMMAND_UUID,
            b64
          );
          this.log(`✓ Successfully sent vest command without response: 0x${commandCode.toString(16).padStart(2, '0')} (${cmdName})`);
          return;
        } catch (withoutResponseError: any) {
          const error = new Error(`Both write methods failed. WithResponse: ${withResponseError?.message ?? withResponseError}. WithoutResponse: ${withoutResponseError?.message ?? withoutResponseError}`);
          this.log(`Failed to write vest command: ${error.message}`);
          throw error;
        }
      }
    } catch (error: any) {
      this.log(`Failed to write vest command: ${error?.message ?? error}`);
      throw error;
    }
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

  // Subscribe to vest status (optional, for monitoring)
  // CRITICAL: This should NEVER crash - vest works fine without status subscription
  private async subscribeVestStatus(device: Device): Promise<void> {
    try {
      // Safety: Verify device is connected
      if (!device) {
        this.log("Cannot subscribe to vest status - device is null");
        return;
      }

      // Add timeout to connection check
      let isConnected = false;
      try {
        const connectCheckPromise = device.isConnected();
        const connectTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection check timeout")), 2000)
        );
        isConnected = await Promise.race([connectCheckPromise, connectTimeout]) as boolean;
      } catch (connectError: any) {
        this.log(`Vest connection check failed (skipping status subscription): ${connectError?.message ?? connectError}`);
        return;
      }

      if (!isConnected) {
        this.log("Vest not connected, cannot subscribe to status");
        return;
      }

      // Safety: Verify service exists with timeout
      let services;
      try {
        const servicePromise = device.services();
        const serviceTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Service read timeout")), 3000)
        );
        services = await Promise.race([servicePromise, serviceTimeout]) as any[];
      } catch (serviceError: any) {
        this.log(`Failed to get services for vest (skipping status subscription): ${serviceError?.message ?? serviceError}`);
        return;
      }

      if (!Array.isArray(services) || services.length === 0) {
        this.log(`No services found for vest (skipping status subscription)`);
        return;
      }

      const vestService = services.find(s => s.uuid.toLowerCase() === VEST_SERVICE_UUID.toLowerCase());
      if (!vestService) {
        this.log(`Vest service not found. Available: ${services.map(s => s.uuid).join(', ')}`);
        return;
      }

      // Safety: Verify status characteristic exists with timeout
      let characteristics;
      try {
        const charPromise = vestService.characteristics();
        const charTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Characteristic read timeout")), 3000)
        );
        characteristics = await Promise.race([charPromise, charTimeout]) as any[];
      } catch (charError: any) {
        this.log(`Failed to get characteristics for vest (skipping status subscription): ${charError?.message ?? charError}`);
        return;
      }

      if (!Array.isArray(characteristics) || characteristics.length === 0) {
        this.log(`No characteristics found for vest service (skipping status subscription)`);
        return;
      }

      const statusChar = characteristics.find(c => c.uuid.toLowerCase() === VEST_STATUS_UUID.toLowerCase());
      if (!statusChar) {
        this.log(`Vest status characteristic not found. Available: ${characteristics.map(c => c.uuid).join(', ')}`);
        return;
      }

      // Safety: Check if characteristic supports notifications
      const properties = statusChar.properties || [];
      const supportsNotify = properties.includes("notify") || properties.includes("indicate");
      if (!supportsNotify) {
        this.log(`Vest status characteristic does not support notifications. Properties: ${properties.join(', ')}`);
        return;
      }

      // Subscribe to status notifications with error handling
      try {
        const subscription = device.monitorCharacteristicForService(
          VEST_SERVICE_UUID,
          VEST_STATUS_UUID,
          (error, characteristic) => {
            try {
              if (error) {
                this.log(`Vest status notification error (non-critical): ${error.message}`);
                return;
              }
              if (characteristic?.value) {
                try {
                  const buffer = Buffer.from(characteristic.value, "base64");
                  const status = buffer.toString("utf-8");

                  // Log raw data for debugging
                  const hexBytes = Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join(' ');
                  this.log(`Vest status raw bytes: [${hexBytes}], decoded: ${status}`);
                  this.emit("vest_status", { status });

                  // Parse battery from vest status
                  let battery: number | undefined;

                  // Try parsing as JSON first (if status is JSON string)
                  try {
                    const jsonData = JSON.parse(status);
                    this.log(`Vest status parsed as JSON: ${JSON.stringify(jsonData)}`);
                    if (typeof jsonData.battery === 'number' && jsonData.battery >= 0 && jsonData.battery <= 100) {
                      battery = jsonData.battery;
                      this.log(`Vest battery from JSON: ${battery}%`);
                    } else if (typeof jsonData.bat === 'number' && jsonData.bat >= 0 && jsonData.bat <= 100) {
                      // Try alternative key 'bat'
                      battery = jsonData.bat;
                      this.log(`Vest battery from JSON (bat key): ${battery}%`);
                    } else if (typeof jsonData.batt === 'number' && jsonData.batt >= 0 && jsonData.batt <= 100) {
                      // Try alternative key 'batt'
                      battery = jsonData.batt;
                      this.log(`Vest battery from JSON (batt key): ${battery}%`);
                    }
                  } catch {
                    // Not JSON, try other parsing methods
                    this.log(`Vest status is not JSON, trying binary/text parsing`);

                    // Try parsing as "battery:XX" or "bat:XX" text format
                    const batteryMatch = status.match(/(?:battery|bat|batt)[:\s]*(\d+)/i);
                    if (batteryMatch) {
                      const parsedBattery = parseInt(batteryMatch[1], 10);
                      if (parsedBattery >= 0 && parsedBattery <= 100) {
                        battery = parsedBattery;
                        this.log(`Vest battery from text pattern: ${battery}%`);
                      }
                    }

                    // Try binary (first byte might be battery) - but only if it's in typical battery range
                    if (battery === undefined && buffer.length > 0) {
                      const firstByte = buffer[0];
                      // ESP32 might send raw battery percentage as first byte
                      if (firstByte >= 0 && firstByte <= 100) {
                        battery = firstByte;
                        this.log(`Vest battery from first byte: ${battery}%`);
                      }
                    }
                  }

                  // Emit vest data with battery if found (similar to human/dog data)
                  if (battery !== undefined) {
                    try {
                      this.emit("data", {
                        profile: "vest",
                        battery: battery,
                      });
                      this.log(`✓ Vest battery emitted: ${battery}%`);
                    } catch (emitError: any) {
                      this.log(`Error emitting vest battery data: ${emitError?.message ?? emitError}`);
                    }
                  } else {
                    this.log(`Could not extract battery from vest status data`);
                  }
                } catch (parseError: any) {
                  this.log(`Failed to parse vest status: ${parseError?.message ?? parseError}`);
                }
              }
            } catch (callbackError: any) {
              // Prevent callback errors from crashing
              this.log(`Error in vest status callback: ${callbackError?.message ?? callbackError}`);
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
          this.log("Successfully subscribed to vest status notifications");
        }
      } catch (monitorError: any) {
        // Monitor subscription failed - this is OK, vest works without it
        this.log(`Failed to start monitoring vest status (this is OK): ${monitorError?.message ?? monitorError}`);
        // Don't throw - vest connection should still succeed
      }
    } catch (error: any) {
      // Catch-all to prevent any crash
      this.log(`Vest status subscription error (non-critical): ${error?.message ?? error}`);
      // Non-critical - vest works without status subscription
      // Don't throw - connection should still succeed
    }
  }

  // Legacy method for backward compatibility
  private async writeVestCommand(payload: string) {
    // Try to parse as JSON for comfort signals, otherwise send as command code
    try {
      const parsed = JSON.parse(payload);
      if (parsed.action === "comfort") {
        // Map comfort signals to vest commands
        if (parsed.vibration === "gentle") {
          await this.sendTherapyCommand(THERAPY.MASSAGE);
        } else if (parsed.vibration === "pulse") {
          await this.sendTherapyCommand(THERAPY.CALM);
        } else {
          await this.sendTherapyCommand(THERAPY.CALM);
        }
        return;
      }
    } catch {
      // Not JSON, try as command code
      const commandCode = parseInt(payload, 10);
      if (!isNaN(commandCode) && commandCode >= 0 && commandCode <= 0x0D) {
        await this.sendTherapyCommand(commandCode);
        return;
      }
    }

    // Fallback: send as raw string (legacy behavior)
    const vest = this.devices.vest;
    if (!vest) {
      throw new Error("Vest not connected");
    }

    try {
      const isConnected = await vest.isConnected();
      if (!isConnected) {
        throw new Error("Vest device not connected");
      }

      const b64 = Buffer.from(payload, "utf8").toString("base64");
      await vest.writeCharacteristicWithResponseForService(
        VEST_SERVICE_UUID,
        VEST_COMMAND_UUID,
        b64
      );
      this.log(`Sent comfort payload: ${payload}`);
    } catch (error: any) {
      this.log(`Failed to write vest command: ${error?.message ?? error}`);
      throw error;
    }
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
        return;
      }

      const durSec = (Date.now() - this.sessionStart) / 1000;

      let bond0to10 = 0;
      try {
        bond0to10 = calculateBondScore(humanC, dogC, sync, durSec);
      } catch (bondError: any) {
        this.log(`Error calculating bond score: ${bondError?.message ?? bondError}`);
        return;
      }

      // Safety: Ensure scores are valid numbers
      this.sleepScore = Math.max(0, Math.min(100, Math.round(bond0to10 * 10)));
      this.recoveryScore = Math.max(0, Math.min(100, Math.round(dogC)));
      this.strainScore = Math.max(0, Math.min(100, Math.round(humanC)));

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
