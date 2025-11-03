import React, { useState } from 'react';
import { View, Text, Button, FlatList, TouchableOpacity, StyleSheet } from 'react-native';

export default function Pairing() {
  const [devices, setDevices] = useState([
    { id: 'ABC123', name: 'DogGPT Harness 01' },
    { id: 'XYZ789', name: 'DogGPT Harness 02' },
  ]);

  const handleConnect = (id: string) => {
    alert(`Connecting to ${id}...`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pair Device</Text>
      <Button title="Scan for Devices" onPress={() => alert('Scanning (stub)...')} />

      <FlatList
        style={{ marginTop: 20 }}
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.item} onPress={() => handleConnect(item.id)}>
            <Text style={{ fontWeight: '600' }}>{item.name}</Text>
            <Text style={{ color: '#666' }}>{item.id}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  item: { padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
});
