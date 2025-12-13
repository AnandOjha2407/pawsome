// src/ble/BLEManager.ts
// Real BLE manager with Runmefit SDK support for GTS10/GTL1 and ESP32 Vest

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
import { parseDeviceData, RealTimeData } from "./ProtobufParser";
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

// Replace the old Runmefit SDK Service UUIDs with Nordic UART Service
// Based on Android SDK: 6e400001-b5a3-f393-e0a9-e50e24dcca9d
const NORDIC_UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9d";
const NORDIC_UART_TX_CHAR = "6e400003-b5a3-f393-e0a9-e50e24dcca9d"; // Notify (data from device)
const NORDIC_UART_RX_CHAR = "6e400002-b5a3-f393-e0a9-e50e24dcca9d"; // Write (commands to device)

// Remove old RUNMEFIT_SERVICE, HR_CHARACTERISTIC, HRV_CHARACTERISTIC constants

// ESP32 Vest custom service (comfort commands)
const VEST_SERVICE_UUID = "12345678-1234-5678-1234-56789abcdef0";
const VEST_COMMAND_CHAR_UUID = "12345678-1234-5678-1234-56789abcdef1";
const VEST_STATUS_CHAR_UUID = "12345678-1234-5678-1234-56789abcdef2";

// Device name patterns - more comprehensive matching
const DEVICE_NAME_PATTERNS = {
  human: [
    /GTS\d*/i,           // GTS10, GTS1, etc.
    /GTS\s*\d*/i,        // GTS 10, GTS 1 (with space)
    /fitband/i,
    /smartwatch/i,
    /watch/i,
  ],
  dog: [
    /GTL\d*/i,           // GTL1, GTL10, etc.
    /GTL\s*\d*/i,        // GTL 1, GTL 10 (with space)
    /collar/i,
    /pet/i,
    /tracker/i,
  ],
  vest: [
    /bodhi'?s?\s*vest/i, // "Bodhi's vest", "Bodhi s vest" (check first - most specific)
    /bodhi\s+.*vest/i,   // "Bodhi s vest", "Bodhi vest" (with any text between)
    /bodhi/i,            // "Bodhi", "bodhi", "BODHI" (if it contains bodhi)
    /vest/i,             // "vest", "Vest", "VEST"
    /pawsome/i,
    /esp32/i,
    /harness/i,
  ],
};

/**
 * Auto-detect device type based on device name
 * Returns the detected role or null if no pattern matches
 */
function detectDeviceType(deviceName: string | null | undefined): Role | null {
  if (!deviceName) return null;

  const name = deviceName.toLowerCase();

  // Check vest patterns first (more specific)
  for (const pattern of DEVICE_NAME_PATTERNS.vest) {
    if (pattern.test(name)) {
      return "vest";
    }
  }

  // Check dog collar patterns
  for (const pattern of DEVICE_NAME_PATTERNS.dog) {
    if (pattern.test(name)) {
      return "dog";
    }
  }

  // Check human fitband patterns
  for (const pattern of DEVICE_NAME_PATTERNS.human) {
    if (pattern.test(name)) {
      return "human";
    }
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

  // Device data storage
  private humanData: {
    heartRate?: number;
    spO2?: number;
    hrv: number[];
    respiratoryRate?: number;
    battery?: number;
    lastUpdate: number;
  } = { hrv: [], lastUpdate: 0 };

  private dogData: {
    heartRate?: number;
    spO2?: number;
    hrv: number[];
    respiratoryRate?: number;
    battery?: number;
    lastUpdate: number;
  } = { hrv: [], lastUpdate: 0 };

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
  private humanSyncWindow: number[] = [];
  private dogSyncWindow: number[] = [];
  private readonly SAMPLE_INTERVAL_MS = 5000;
  private readonly MAX_SYNC_SAMPLES = 64;
  private readonly MIN_SYNC_SAMPLES = 12;

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
  private async requestPermissions() {
    if (Platform.OS !== "android") return;

    try {
      await PermissionsAndroid.requestMultiple([
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.ACCESS_FINE_LOCATION",
      ]);
    } catch (e) {
      this.log("Permission error: " + String(e));
    }
  }

  // ----------------------------------------------------------
  // SCANNING — Pairing.tsx calls startScan(callback)
  // Filters to show only our 3 device types (GTS10, GTL1, Vest)
  // ----------------------------------------------------------
  async startScan(onDeviceFound: (dev: DeviceDescriptor) => void) {
    if (this.scanning) return;

    await this.requestPermissions();
    this.scanning = true;
    this.log("Scan started - filtering for GTS10, GTL1, and Vest devices only");

    this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        this.log("Scan error: " + error.message);
        return;
      }
      if (!device) return;

      const { id, name, rssi } = device;
      
      // Check if this device matches one of our 3 device types
      const detectedType = detectDeviceType(name);
      
      if (!detectedType) {
        // Not one of our devices - skip it
        this.log(`Skipping unknown device: ${name ?? "Unknown"} (${id})`);
        return;
      }

      // This is one of our devices - log and pass it to the callback
      const deviceTypeLabels = {
        human: "Human Fitband (GTS10)",
        dog: "Dog Collar (GTL1)",
        vest: "Therapy Vest (ESP32)",
      };
      
      this.log(`Found ${deviceTypeLabels[detectedType]}: ${name ?? "Unknown"} (${id})`);

      onDeviceFound({
        id,
        name: name ?? null,
        mac: id,
        rssi,
      });
    });
  }

  stopScan() {
    if (!this.scanning) return;

    this.manager.stopDeviceScan();
    this.scanning = false;
    this.log("Scan stopped");
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
  // AUTO-DETECT DEVICE TYPE FROM NAME
  // ----------------------------------------------------------
  detectDeviceType(deviceName: string | null | undefined): Role | null {
    return detectDeviceType(deviceName);
  }

  // ----------------------------------------------------------
  // CONNECT (Used after assigning role)
  // ----------------------------------------------------------
  async connectToScannedDevice(
    descriptor: DeviceDescriptor,
    role: Role
  ): Promise<void> {
    this.stopScan();

    try {
      this.log(`Connecting to ${descriptor.name ?? "Unknown"} as ${role}`);

      if (!descriptor.id) {
        throw new Error("Invalid device ID");
      }

      let device;
      try {
        device = await this.manager.connectToDevice(descriptor.id, {
          requestMTU: 185,
        });
      } catch (connectError: any) {
        this.log(`Failed to connect to device: ${connectError?.message ?? connectError}`);
        this.emit("error", connectError);
        return;
      }

      if (!device) {
        this.log("Device connection returned null");
        return;
      }

      // Discover services with error handling
      try {
        await device.discoverAllServicesAndCharacteristics();
        
        // Try to read device name if not available
        if (!descriptor.name) {
          try {
            const deviceInfo = await device.readCharacteristicForService(
              "00001800-0000-1000-8000-00805f9b34fb", // Generic Access Service
              "00002a00-0000-1000-8000-00805f9b34fb"  // Device Name characteristic
            );
            if (deviceInfo?.value) {
              const name = Buffer.from(deviceInfo.value, "base64").toString("utf8");
              this.log(`Read device name: ${name}`);
              descriptor.name = name;
            }
          } catch (nameError) {
            this.log(`Could not read device name: ${nameError}`);
          }
        }
      } catch (discoverError: any) {
        this.log(`Failed to discover services: ${discoverError?.message ?? discoverError}`);
        // Continue anyway - some devices work without full discovery
      }

      this.devices[role] = device;
      this.roles[device.id] = role;
      this.rssi = device.rssi ?? -60;

      // Subscribe to characteristics with error handling
      if (role === "human" || role === "dog") {
        try {
          this.subscribeNordicUARTDevice(device, role);
        } catch (subError: any) {
          this.log(`Warning: Failed to subscribe to Nordic UART for ${role}: ${subError?.message ?? subError}`);
        }
      } else if (role === "vest") {
        try {
          this.subscribeVestComfort(device);
        } catch (subError: any) {
          this.log(`Warning: Failed to subscribe to Vest service: ${subError?.message ?? subError}`);
        }
      }

      // Set up disconnect handler with error handling
      try {
        device.onDisconnected((error) => {
          try {
            this.log(`Device disconnected: ${role} - ${error?.message ?? "No error"}`);
            this.connectedRoles[role] = false;
            if (role === "vest") {
              this.comfortStatus = "idle";
            }
            this.emitConnections();
          } catch (disconnectError: any) {
            this.log(`Error in disconnect handler: ${disconnectError?.message ?? disconnectError}`);
          }
        });
      } catch (listenerError: any) {
        this.log(`Failed to set up disconnect listener: ${listenerError?.message ?? listenerError}`);
      }

      this.connectedDevice = {
        name: descriptor.name ?? `${role.toUpperCase()} Device`,
        mac: descriptor.id,
        rssi: descriptor.rssi ?? -60,
      };

      if (role === "human" || role === "dog") {
        this.assignedProfile = role;
      }

      this.isConnected = true;
      this.connectedRoles[role] = true;
      this.emitConnections();
      this.emit("connected", this.connectedDevice);

      this.log(`Connected to ${descriptor.id} as ${role}`);
    } catch (e: any) {
      this.log("Connect error: " + String(e?.message ?? e));
      this.emit("error", e);
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
  // NORDIC UART SERVICE (GTS10/GTL1) MONITORING
  // ----------------------------------------------------------
  private subscribeNordicUARTDevice(device: Device, role: "human" | "dog") {
    this.log(`Subscribing Nordic UART for ${role} (${device.id})`);

    // Subscribe to TX characteristic (notifications from device)
    try {
      device.monitorCharacteristicForService(
        NORDIC_UART_SERVICE,
        NORDIC_UART_TX_CHAR,
        (error, char) => {
          if (error) {
            this.log(`Nordic UART TX error [${role}]: ${error.message}`);
            return;
          }
          if (!char?.value) return;

          try {
            const raw = Buffer.from(char.value, "base64");
            const hex = raw.toString("hex");
            this.log(`Nordic UART packet [${role}]: ${hex} (${raw.length} bytes)`);

            // Parse using ProtobufParser
            const parsed = parseDeviceData(raw);
            
            if (parsed) {
              const targetData = role === "human" ? this.humanData : this.dogData;
              
              if (parsed.heart_rate) {
                targetData.heartRate = parsed.heart_rate;
              }
              if (parsed.blood_oxygen) {
                targetData.spO2 = parsed.blood_oxygen;
              }
              if (parsed.hrv) {
                targetData.hrv.push(parsed.hrv);
                if (targetData.hrv.length > 64) targetData.hrv.shift();
              }
              if (parsed.respiratory_rate && role === "dog") {
                targetData.respiratoryRate = parsed.respiratory_rate;
              }
              if (parsed.battery) {
                targetData.battery = parsed.battery;
              }
              
              targetData.lastUpdate = Date.now();
              this.emitDeviceData(role);
            } else {
              this.log(`Failed to parse data from ${role} device`);
            }
          } catch (parseError: any) {
            this.log(`Parse error [${role}]: ${parseError?.message ?? parseError}`);
          }
        }
      );
    } catch (subError: any) {
      this.log(`Failed to subscribe Nordic UART TX for ${role}: ${subError?.message ?? subError}`);
    }
  }

  // Remove old parseRunmefitHeartRate and parseRunmefitHRV methods
  // They are replaced by ProtobufParser

  // Emit device data event with all sensor readings
  private emitDeviceData(role: "human" | "dog") {
    const data = role === "human" ? this.humanData : this.dogData;
    const latestHRV = data.hrv.length > 0 ? data.hrv[data.hrv.length - 1] : undefined;

    const payload: any = {
      profile: role,
      heartRate: data.heartRate,
      spO2: data.spO2,
      hrv: latestHRV,
      respiratoryRate: data.respiratoryRate,
      battery: data.battery,
      rssi: this.rssi,
      firmwareVersion: this.firmwareVersion,
      sleepScore: this.sleepScore,
      recoveryScore: this.recoveryScore,
      strainScore: this.strainScore,
    };

    // Add HRV history for sync calculations
    if (role === "human") {
      payload.hrvHistory = [...data.hrv];
    } else {
      payload.hrvHistory = [...data.hrv];
    }

    this.emit("data", payload);
    this.log(`Emitted data [${role}]: HR=${data.heartRate}, SpO2=${data.spO2}, HRV=${latestHRV}`);
  }

  // ----------------------------------------------------------
  // ESP32 VEST — UART MONITORING + COMMANDS
  // ----------------------------------------------------------
  private subscribeVestComfort(device: Device) {
    this.log(`Subscribing vest comfort service (${device.id})`);
    try {
      device.monitorCharacteristicForService(
        VEST_SERVICE_UUID,
        VEST_STATUS_CHAR_UUID,
        (error, char) => {
          if (error) {
            this.log("Vest status error: " + error.message);
            return;
          }
          if (!char?.value) return;

          try {
            const status = Buffer.from(char.value, "base64").toString("utf8");
            this.comfortStatus = status.includes("active") ? "active" : "idle";
            this.emit("comfort", { status: this.comfortStatus, payload: status });
          } catch (e) {
            this.log("Vest status parse error: " + String(e));
          }
        }
      );
    } catch (subError: any) {
      this.log(`Failed to subscribe to vest status: ${subError?.message ?? subError}. Service may not exist.`);
    }
  }

  private async writeVestCommand(payload: string) {
    const vest = this.devices.vest;
    if (!vest) {
      throw new Error("Vest not connected");
    }
    const b64 = Buffer.from(payload, "utf8").toString("base64");
    await vest.writeCharacteristicWithResponseForService(
      VEST_SERVICE_UUID,
      VEST_COMMAND_CHAR_UUID,
      b64
    );
    this.log(`Sent comfort payload: ${payload}`);
  }

  sendComfortSignal(
    target: "dog" | "human",
    opts?: { redLight?: boolean; vibration?: "gentle" | "pulse"; durationMs?: number }
  ) {
    const payload = {
      action: "comfort",
      target,
      redlight: opts?.redLight ?? (target === "dog"),
      vibration: opts?.vibration ?? (target === "dog" ? "gentle" : "pulse"),
      duration: opts?.durationMs ?? 30000,
      timestamp: Date.now(),
    };

    return this.writeVestCommand(JSON.stringify(payload))
      .then(() => {
        this.comfortStatus = "active";
        this.emit("comfort", { status: "active", target });
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
  // BOND ENGINE UPDATE LOOP
  // ----------------------------------------------------------
  private updateBondScores() {
    const humanSeries = this.humanSyncWindow.slice(-this.MAX_SYNC_SAMPLES);
    const dogSeries = this.dogSyncWindow.slice(-this.MAX_SYNC_SAMPLES);

    if (
      humanSeries.length < this.MIN_SYNC_SAMPLES ||
      dogSeries.length < this.MIN_SYNC_SAMPLES
    ) {
      return;
    }

    const humanHRVlatest = humanSeries[humanSeries.length - 1];
    const dogHRVlatest = dogSeries[dogSeries.length - 1];

    // Use real HR data if available, otherwise use defaults
    const humanHR = this.humanData.heartRate ?? 75;
    const dogHR = this.dogData.heartRate ?? 95;
    const resp = this.dogData.respiratoryRate ?? 24;

    const humanC = calculateHumanCoherence(humanHRVlatest, humanHR);
    const dogC = calculateDogCoherence(dogHRVlatest, dogHR, resp);
    const sync = calculateSynchronization(humanSeries, dogSeries);

    const durSec = (Date.now() - this.sessionStart) / 1000;

    const bond0to10 = calculateBondScore(humanC, dogC, sync, durSec);

    this.sleepScore = Math.round(bond0to10 * 10);
    this.recoveryScore = Math.round(dogC);
    this.strainScore = Math.round(humanC);

    // Emit combined bond scores
    this.emit("data", {
      sleepScore: this.sleepScore,
      recoveryScore: this.recoveryScore,
      strainScore: this.strainScore,
      bondScore: this.sleepScore,
      humanHealthScore: this.strainScore,
      dogHealthScore: this.recoveryScore,
    });
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
  // DISCONNECT
  // ----------------------------------------------------------
  disconnect() {
    Object.values(this.devices).forEach((d) => {
      try {
        d?.cancelConnection();
      } catch (_) { }
    });

    this.devices = {};
    this.roles = {};
    this.humanData = { hrv: [], lastUpdate: 0 };
    this.dogData = { hrv: [], lastUpdate: 0 };
    this.humanSyncWindow = [];
    this.dogSyncWindow = [];
    this.isConnected = false;
    this.connectedDevice = null;
    this.assignedProfile = null;
    this.connectedRoles = { human: false, dog: false, vest: false };
    this.comfortStatus = "idle";

    this.log("Disconnected all devices");
    this.emit("disconnected");
    this.emitConnections();
  }

  private runBondingTick() {
    this.captureSyncSample("human");
    this.captureSyncSample("dog");
    this.updateBondScores();
  }

  private captureSyncSample(role: "human" | "dog") {
    const store = role === "human" ? this.humanData : this.dogData;
    if (!store.hrv.length) return;

    const isFresh =
      Date.now() - store.lastUpdate <= this.SAMPLE_INTERVAL_MS * 2;
    if (!isFresh) return;

    const latest = store.hrv[store.hrv.length - 1];
    if (latest === undefined) return;

    const buffer = role === "human" ? this.humanSyncWindow : this.dogSyncWindow;
    buffer.push(latest);
    if (buffer.length > this.MAX_SYNC_SAMPLES) buffer.shift();
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
        battery: this.humanData.battery ?? 70,
        heartRate: this.humanData.heartRate,
        spO2: this.humanData.spO2,
        hrv: this.humanData.hrv.length > 0 ? this.humanData.hrv[this.humanData.hrv.length - 1] : undefined,
      },
      dog: {
        battery: this.dogData.battery ?? 80,
        heartRate: this.dogData.heartRate,
        spO2: this.dogData.spO2,
        hrv: this.dogData.hrv.length > 0 ? this.dogData.hrv[this.dogData.hrv.length - 1] : undefined,
        respiratoryRate: this.dogData.respiratoryRate,
      },
      sessions: this.sessions.slice(0, 10),
      firmwareVersion: this.firmwareVersion,
      sleepScore: this.sleepScore,
      recoveryScore: this.recoveryScore,
      strainScore: this.strainScore,
      logs: this.logs.slice(-50),
    };
  }
}

export const bleManager = new BLEManagerReal();
