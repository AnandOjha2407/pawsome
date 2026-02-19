import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "@pawsomebond_device_id_v1";

export async function getDeviceId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DEVICE_ID_KEY);
  } catch (e) {
    console.warn("[deviceId] get failed", e);
    return null;
  }
}

export async function setDeviceId(id: string | null): Promise<void> {
  try {
    if (id) {
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    } else {
      await AsyncStorage.removeItem(DEVICE_ID_KEY);
    }
  } catch (e) {
    console.warn("[deviceId] set failed", e);
  }
}
