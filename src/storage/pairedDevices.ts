import AsyncStorage from "@react-native-async-storage/async-storage";
import { SETTINGS_STORAGE_KEY } from "./constants";
import { DeviceDescriptor } from "../ble/BLEManager";

export type PairedDeviceMap = {
  dog?: DeviceDescriptor;
  human?: DeviceDescriptor;
  vest?: DeviceDescriptor;
};

type SettingsShape = {
  [key: string]: any;
  pairedDevices?: PairedDeviceMap;
};

async function readSettings(): Promise<SettingsShape> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn("[pairedDevices] failed to read settings", e);
    return {};
  }
}

async function writeSettings(next: SettingsShape) {
  try {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("[pairedDevices] failed to persist settings", e);
  }
}

export async function loadPairedDevices(): Promise<PairedDeviceMap> {
  const settings = await readSettings();
  return settings.pairedDevices ?? {};
}

export async function savePairedDevice(
  role: keyof PairedDeviceMap,
  descriptor: DeviceDescriptor | undefined
) {
  const settings = await readSettings();
  const current = settings.pairedDevices ?? {};
  if (descriptor) {
    current[role] = descriptor;
  } else {
    delete current[role];
  }
  settings.pairedDevices = current;
  await writeSettings(settings);
  return current;
}

