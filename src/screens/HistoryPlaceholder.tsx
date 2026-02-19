// src/screens/HistoryPlaceholder.tsx — History screen per v1 guide
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";
import { MaterialIcons } from "@expo/vector-icons";
import { useFirebase } from "../context/FirebaseContext";
import { loadHistory, loadAlerts } from "../firebase/firebase";

type DateFilter = "today" | "yesterday" | "week" | "month";

export default function HistoryPlaceholder() {
  const { theme } = useTheme();
  const firebase = useFirebase();
  const [filter, setFilter] = useState<DateFilter>("week");
  const [history, setHistory] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const deviceId = firebase?.deviceId;

  useEffect(() => {
    if (!deviceId) {
      setHistory([]);
      setAlerts([]);
      return;
    }
    let mounted = true;
    setLoading(true);
    const now = new Date();
    let start: Date;
    if (filter === "today") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (filter === "yesterday") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      now.setDate(now.getDate() - 1);
    } else if (filter === "week") {
      start = new Date(now);
      start.setDate(start.getDate() - 7);
    } else {
      start = new Date(now);
      start.setMonth(start.getMonth() - 1);
    }
    const end = new Date();

    (async () => {
      try {
        const [h, a] = await Promise.all([
          loadHistory(deviceId!, start, end),
          loadAlerts(deviceId!, start, end),
        ]);
        if (mounted) {
          setHistory(h);
          setAlerts(a);
        }
      } catch (e) {
        console.warn("History load failed", e);
        if (mounted) setHistory([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [deviceId, filter]);

  if (!deviceId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
        <View style={styles.center}>
          <MaterialIcons name="history" size={64} color={theme.primary} />
          <Text style={[styles.title, { color: theme.textDark }]}>History</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Set Device ID in Settings to view anxiety timeline and event log.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.textDark }]}>History</Text>

        {/* Date filters */}
        <View style={styles.filterRow}>
          {(["today", "yesterday", "week", "month"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.filterBtn,
                {
                  backgroundColor: filter === f ? theme.primary : theme.card,
                  borderColor: filter === f ? theme.primary : theme.border,
                },
              ]}
            >
              <Text
                style={{
                  fontWeight: "600",
                  color: filter === f ? "#000" : theme.textDark,
                  fontSize: 12,
                }}
              >
                {f === "today" ? "Today" : f === "yesterday" ? "Yesterday" : f === "week" ? "This Week" : "This Month"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textDark }]}>Event Log</Text>
            {history.length === 0 && alerts.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                  No events in this period. Data will appear when the harness streams to Firebase.
                </Text>
              </View>
            ) : (
              <>
                {history.slice(0, 20).map((item: any, i) => (
                  <View
                    key={item.id ?? i}
                    style={[styles.eventCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                  >
                    <Text style={[styles.eventTime, { color: theme.textMuted }]}>
                      {item.timestamp?.toDate?.()?.toLocaleString?.() ?? "—"}
                    </Text>
                    <Text style={[styles.eventState, { color: theme.textDark }]}>
                      {item.state ?? "—"} • Anxiety: {item.anxietyScore ?? "—"}
                    </Text>
                  </View>
                ))}
                {alerts.slice(0, 10).map((item: any, i) => (
                  <View
                    key={item.id ?? `a${i}`}
                    style={[styles.alertCard, { backgroundColor: theme.card, borderColor: "#F85149" }]}
                  >
                    <Text style={[styles.eventTime, { color: theme.textMuted }]}>
                      {item.timestamp?.toDate?.()?.toLocaleString?.() ?? "—"}
                    </Text>
                    <Text style={[styles.eventState, { color: "#F85149" }]}>
                      {item.type ?? "Alert"} • Score: {item.score ?? "—"}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 20 },
  subtitle: { fontSize: 14, marginTop: 12, textAlign: "center" },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 24 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  sectionLabel: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  emptyCard: { padding: 24, borderRadius: 12, borderWidth: 1 },
  emptyText: { fontSize: 14, textAlign: "center" },
  eventCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  alertCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8, borderLeftWidth: 4 },
  eventTime: { fontSize: 12, marginBottom: 4 },
  eventState: { fontSize: 14, fontWeight: "600" },
});
