import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeProvider';

export default function Insights() {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Insights</Text>
      <Text style={styles.subtitle}>
        Smart behavior analysis and training recommendations will appear here.
      </Text>
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: theme.background },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: theme.textDark },
  subtitle: { fontSize: 16, color: theme.textMuted },
});
