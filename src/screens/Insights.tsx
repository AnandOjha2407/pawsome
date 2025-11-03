import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function Insights() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Insights</Text>
      <Text style={styles.subtitle}>
        Smart behavior analysis and training recommendations will appear here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#555' },
});
