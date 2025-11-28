// src/screens/Pairing.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { bleManager } from '../ble/BLEManager';

type DeviceItem = {
  id: string;
  name: string;
  mac?: string;
  rssi?: number;
  isMock?: boolean;
};

export default function Pairing() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [btOn, setBtOn] = useState(true);

  // small built-in mock list so UI works without scanning
  const mockDevices: DeviceItem[] = [
    { id: 'mock-1', name: 'GTS10 Mock (Human)', mac: 'AA:BB:CC:11:22:33', rssi: -45, isMock: true },
    { id: 'mock-2', name: 'GTL1 Mock (Dog)', mac: 'AA:BB:CC:44:55:66', rssi: -60, isMock: true },
  ];

  useEffect(() => {
    // If bleManager exposes a isBluetoothOn flag, use it — otherwise assume true for mock
    // (If you later integrate real SDK, wire this to the SDK state)
    if ((bleManager as any).isBluetoothOn !== undefined) {
      setBtOn((bleManager as any).isBluetoothOn);
    } else {
      setBtOn(true);
    }

    // If bleManager exposes discovered devices, listen to it
    const onData = (d: any) => {
      // If your real BLE manager emits devices, parse them here
      // This keeps code future-proof for real SDK integration.
    };

    bleManager.on?.('data', onData); // safe - mock supports on/off
    return () => {
      bleManager.off?.('data', onData);
    };
  }, []);

  const startScan = () => {
    setIsScanning(true);
    setDevices([]); // clear old

    // If you have real scanning API later, call it here:
    // bleManager.startScanning();
    // For mock: show the built-in list after a tiny delay
    setTimeout(() => {
      setDevices(mockDevices);
      setIsScanning(false);
    }, 700);
  };

  const stopScan = () => {
    setIsScanning(false);
    // bleManager.stopScanning(); // later, when real SDK added
  };

  const connectToDevice = (device: DeviceItem) => {
    // If mock — call bleManager.connect()
    try {
      // if your real BLEManager.connect accepts a device model, adapt this call
      // For now the mock bleManager.connect() toggles connection and emits events
      bleManager.connect();
      Alert.alert('Connecting', `Connecting to ${device.name}`);
      // Optionally set a connected device on bleManager if your mock supports it:
      if ((bleManager as any).connectedDevice === undefined) {
        (bleManager as any).connectedDevice = { name: device.name, mac: device.mac, rssi: device.rssi };
      }
    } catch (err) {
      console.warn('Connect failed', err);
      Alert.alert('Error', 'Failed to connect. Check logs.');
    }
  };

  const renderItem = ({ item }: { item: DeviceItem }) => (
    <TouchableOpacity style={styles.deviceRow} onPress={() => connectToDevice(item)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.deviceName}>{item.name}</Text>
        <Text style={styles.deviceSub}>{item.mac ?? 'No MAC'}</Text>
      </View>
      <View style={styles.rssiWrap}>
        <Text style={styles.rssiText}>{item.rssi ?? '-'}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Find Your Device</Text>
        <Text style={styles.subtitle}>Make sure Bluetooth is enabled on your phone</Text>
      </View>

      {!btOn ? (
        <View style={styles.center}>
          <MaterialIcons name="bluetooth-disabled" size={56} color="#999" />
          <Text style={styles.centerText}>Bluetooth is Off</Text>
          <Text style={styles.centerSub}>Enable Bluetooth to scan for devices</Text>
        </View>
      ) : (
        <>
          <View style={styles.controls}>
            {!isScanning ? (
              <TouchableOpacity style={styles.scanBtn} onPress={startScan}>
                <MaterialIcons name="search" size={18} color="#fff" />
                <Text style={styles.scanText}> Scan for devices</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.scanBtn, styles.scanBtnStop]} onPress={stopScan}>
                <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.scanText}> Scanning…</Text>
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={devices}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No devices found</Text>
                <Text style={styles.emptySub}>Try scanning again or use the mock devices</Text>
              </View>
            }
            contentContainerStyle={{ padding: 12 }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6fbfb' },
  header: { padding: 18 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f1722' },
  subtitle: { color: '#64748b', marginTop: 6 },

  center: { alignItems: 'center', padding: 18 },
  centerText: { fontSize: 18, marginTop: 12, color: '#333' },
  centerSub: { color: '#777', marginTop: 6 },

  controls: { paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row' },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2c9aa6',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  scanBtnStop: { backgroundColor: '#e07b39' },
  scanText: { color: '#fff', fontWeight: '700' },

  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  deviceName: { fontWeight: '700', color: '#0f1722' },
  deviceSub: { color: '#64748b', marginTop: 4 },

  rssiWrap: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: '#eef7f7' },
  rssiText: { color: '#2c9aa6', fontWeight: '700' },

  empty: { alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, fontWeight: '700' },
  emptySub: { color: '#777', marginTop: 6 },
});
