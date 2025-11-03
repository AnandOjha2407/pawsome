// src/screens/Dashboard.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Animated,
  Pressable,
  FlatList,
  Alert
} from 'react-native';
import { MaterialIcons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';

type Props = { navigation?: any };

const screenW = Dimensions.get('window').width;

/* Theme — keep in sync with Home */
const theme = {
  background: '#f6fbfb',
  card: '#ffffff',
  primary: '#2c9aa6',
  textDark: '#0f1722',
  textMuted: '#64748b',
  green: '#2aa876',
  orange: '#e07b39',
  purple: '#7c5cff',
};

function AnimatedPressable({ onPress, children, style }: { onPress?: () => void; children: React.ReactNode; style?: any }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, friction: 6 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start()}
      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
      style={({ pressed }) => [{ opacity: pressed ? 0.98 : 1 }]}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/* Small utility for progress bars */
function ProgressBar({ value, label }: { value: number; label?: string }) {
  const width = (screenW - 36);
  const animated = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(animated, { toValue: value, duration: 700, useNativeDriver: false }).start();
  }, [value]);
  const barWidth = animated.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width],
    extrapolate: 'clamp',
  });
  return (
    <View style={{ marginVertical: 6 }}>
      {label ? <Text style={styles.smallLabel}>{label}</Text> : null}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: barWidth }]} />
      </View>
    </View>
  );
}

/* Mocked recent session item */
function SessionItem({ item }: { item: { id: string; date: string; duration: string; notes?: string } }) {
  return (
    <View style={styles.sessionRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sessionDate}>{item.date}</Text>
        <Text style={styles.sessionNotes}>{item.notes ?? 'Training session'}</Text>
      </View>
      <Text style={styles.sessionDuration}>{item.duration}</Text>
    </View>
  );
}

export default function Dashboard({ navigation }: Props) {
  // mocked telemetry
  const [heartRate, setHeartRate] = useState(78);
  const [activityPct, setActivityPct] = useState(0.42); // fraction
  const [activeMinutes, setActiveMinutes] = useState(34);
  const [steps, setSteps] = useState(1520);
  const [battery, setBattery] = useState(78);
  const [gpsConnected, setGpsConnected] = useState(true);
  const [emotion, setEmotion] = useState({ label: 'Content', emoji: '🙂', confidence: 0.82 });
  const [isTraining, setIsTraining] = useState(false);

  const heartPulse = useRef(new Animated.Value(1)).current;

  // pulse animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heartPulse, { toValue: 1.12, duration: 600, useNativeDriver: true }),
        Animated.timing(heartPulse, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // simulate telemetry updates
  useEffect(() => {
    const id = setInterval(() => {
      setHeartRate((h) => Math.max(60, Math.round(h + (Math.random() * 6 - 3))));
      setActivityPct((p) => {
        const next = Math.min(1, +(p + Math.random() * 0.02).toFixed(3));
        return next;
      });
      setSteps((s) => s + Math.round(Math.random() * 12));
      setActiveMinutes((m) => m + (Math.random() > 0.85 ? 1 : 0));
    }, 2500);
    return () => clearInterval(id);
  }, []);

  const recentSessions = [
    { id: '1', date: 'Today · 08:10', duration: '18m', notes: 'Recall + sit drills' },
    { id: '2', date: 'Yesterday · 17:42', duration: '22m', notes: 'Walk & tracking' },
    { id: '3', date: 'Oct 10 · 10:00', duration: '30m', notes: 'Fetch + focus' },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 18 }}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>Live metrics from DogGPT harness</Text>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.smallBadge}>
            <MaterialIcons name="sync" size={16} color={theme.primary} />
            <Text style={styles.badgeText}>Live</Text>
          </View>
        </View>
      </View>

      {/* Top row: Heart + Activity */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={styles.largeCard}>
          <Text style={styles.cardTitle}>Heart Rate</Text>
          <Animated.View style={[styles.heartWrap, { transform: [{ scale: heartPulse }] }]}>
            <FontAwesome5 name="heart" size={36} color={theme.primary} />
          </Animated.View>
          <Text style={styles.hrText}>{heartRate} bpm</Text>
          <Text style={styles.smallLabel}>Last measured just now</Text>
        </View>

        <View style={[styles.smallColumn, { width: screenW * 0.36 }]}>
          <View style={styles.cardSmall}>
            <Text style={styles.cardTitle}>Activity</Text>
            <Text style={styles.bigNumber}>{activeMinutes}m</Text>
            <ProgressBar value={activityPct} label={`${Math.round(activityPct * 100)}% of daily goal`} />
          </View>

          <View style={styles.cardSmall}>
            <Text style={styles.cardTitle}>Steps</Text>
            <Text style={styles.bigNumber}>{steps}</Text>
          </View>
        </View>
      </View>

      {/* Second row: Emotion / Battery / GPS */}
      <View style={{ marginTop: 12, flexDirection: 'row', gap: 12 }}>
        <View style={styles.statCard}>
          <Text style={styles.cardTitle}>Emotion</Text>
          <Text style={styles.emoji}>{emotion.emoji}</Text>
          <Text style={styles.statLabel}>{emotion.label}</Text>
          <Text style={styles.smallLabel}>{Math.round(emotion.confidence * 100)}% confidence</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.cardTitle}>Battery</Text>
          <Text style={styles.bigNumber}>{battery}%</Text>
          <Text style={styles.smallLabel}>{battery > 20 ? 'Good' : 'Low'}</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.cardTitle}>GPS</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialIcons name="gps-fixed" size={18} color={gpsConnected ? theme.primary : '#ccc'} />
            <Text style={[styles.statLabel, { color: gpsConnected ? theme.textDark : '#999' }]}>
              {gpsConnected ? 'Connected' : 'No Fix'}
            </Text>
          </View>
          <Text style={styles.smallLabel}>Last known location available</Text>
        </View>
      </View>

      {/* Training controls */}
      <View style={{ marginTop: 14, marginBottom: 6 }}>
        <Text style={styles.sectionLabel}>Training Controls</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <AnimatedPressable
            onPress={() => setIsTraining((s) => !s)}
            style={[
              styles.controlBtn,
              { backgroundColor: isTraining ? theme.orange : theme.primary },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialIcons name={isTraining ? 'stop' : 'play-arrow'} size={18} color="#fff" />
              <Text style={styles.controlText}>{isTraining ? 'Stop Session' : 'Start Session'}</Text>
            </View>
          </AnimatedPressable>

          <AnimatedPressable onPress={() => Alert.alert('Trigger', 'Send training cue to device')} style={styles.controlOutline}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="volume-low" size={18} color={theme.primary} />
              <Text style={[styles.controlText, { color: theme.primary }]}>Send Cue</Text>
            </View>
          </AnimatedPressable>
        </View>
      </View>

      {/* Recent sessions */}
      <View style={{ marginTop: 18 }}>
        <Text style={styles.sectionLabel}>Recent Sessions</Text>
        <FlatList
          data={recentSessions}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <SessionItem item={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          contentContainerStyle={{ paddingTop: 8 }}
        />
      </View>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

/* Styles */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: theme.textDark },
  subtitle: { color: theme.textMuted, marginTop: 4 },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallBadge: {
    backgroundColor: '#e9fbfb',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeText: { color: theme.primary, fontWeight: '700', marginLeft: 6 },

  largeCard: {
    backgroundColor: theme.card,
    flex: 1,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  cardTitle: { color: theme.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  heartWrap: {
    width: 88,
    height: 88,
    borderRadius: 88,
    backgroundColor: '#f2fbfb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  hrText: { fontSize: 20, fontWeight: '700', color: theme.textDark },
  bigNumber: { fontSize: 20, fontWeight: '800', color: theme.textDark },

  smallColumn: {
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cardSmall: {
    backgroundColor: theme.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  statCard: {
    backgroundColor: theme.card,
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'flex-start',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  emoji: { fontSize: 36, marginVertical: 6 },
  statLabel: { fontSize: 14, fontWeight: '700', color: theme.textDark },

  sectionLabel: { fontWeight: '800', color: theme.textDark, marginBottom: 8 },

  controlBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlOutline: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e6eef0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: { color: '#fff', fontWeight: '800' },

  progressTrack: {
    height: 8,
    backgroundColor: '#eef7f7',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: theme.primary,
  },
  smallLabel: { color: theme.textMuted, fontSize: 12, marginBottom: 6 },

  sessionRow: {
    backgroundColor: theme.card,
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionDate: { fontWeight: '700', color: theme.textDark },
  sessionNotes: { color: theme.textMuted, marginTop: 2 },
  sessionDuration: { fontWeight: '700', color: theme.textMuted },
});
