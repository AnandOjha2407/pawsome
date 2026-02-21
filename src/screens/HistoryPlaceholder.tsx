// src/screens/HistoryPlaceholder.tsx — 5.4 History: Anxiety Timeline, State Distribution, Event Log
// Data from Firestore /devices/{device_id}/history and .../alerts (unique per user via device_id).
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Polyline, Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { useTheme } from "../ThemeProvider";
import { MaterialIcons } from "@expo/vector-icons";
import { useFirebase } from "../context/FirebaseContext";
import { loadHistory, loadAlerts } from "../firebase/firebase";

const PAGE_SIZE = 50;
const STATES = ["SLEEPING", "CALM", "ALERT", "ANXIOUS", "ACTIVE"] as const;
const STATE_COLORS: Record<string, string> = {
  SLEEPING: "#58A6FF",
  CALM: "#3FB950",
  ALERT: "#D29922",
  ANXIOUS: "#A855F7",
  ACTIVE: "#F0883E",
};

type DateFilter = "today" | "yesterday" | "week" | "month" | "custom";

function getDateRange(
  filter: DateFilter,
  customStart: Date | null,
  customEnd: Date | null
): { start: Date; end: Date } {
  const now = new Date();
  if (filter === "custom" && customStart && customEnd) {
    return { start: new Date(customStart), end: new Date(customEnd) };
  }
  if (filter === "custom") {
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  let end = new Date(now);
  let start: Date;
  if (filter === "today") {
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  } else if (filter === "yesterday") {
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { start, end };
  } else if (filter === "week") {
    start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (filter === "month") {
    start = new Date(end);
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start = new Date(end);
    start.setDate(start.getDate() - 6);
  }
  return { start, end };
}

const CUSTOM_PRESETS: { label: string; days: number }[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export default function HistoryPlaceholder() {
  const { theme } = useTheme();
  const firebase = useFirebase();
  const [filter, setFilter] = useState<DateFilter>("week");
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastTimestamp, setLastTimestamp] = useState<Date | null>(null);
  const loadMoreTriggered = useRef(false);

  const deviceId = firebase?.deviceId;
  const { start: effectiveStart, end: effectiveEnd } = getDateRange(filter, customStart, customEnd);

  const loadFirst = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    setHistory([]);
    setAlerts([]);
    setLastTimestamp(null);
    setHasMore(true);
    loadMoreTriggered.current = false;
    try {
      const [h, a] = await Promise.all([
        loadHistory(deviceId, effectiveStart, effectiveEnd, PAGE_SIZE),
        loadAlerts(deviceId, effectiveStart, effectiveEnd, PAGE_SIZE),
      ]);
      setHistory(h);
      setAlerts(a);
      if (h.length < PAGE_SIZE) setHasMore(false);
      const last = h[h.length - 1];
      const ts = last?.timestamp;
      if (ts) setLastTimestamp(ts.toDate ? ts.toDate() : ts);
    } catch (e) {
      console.warn("History load failed", e);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [deviceId, effectiveStart.getTime(), effectiveEnd.getTime()]);

  useEffect(() => {
    if (!deviceId) {
      setHistory([]);
      setAlerts([]);
      return;
    }
    loadFirst();
  }, [deviceId, filter, effectiveStart.getTime(), effectiveEnd.getTime()]);

  const loadMore = useCallback(async () => {
    if (!deviceId || !hasMore || loadingMore || loadMoreTriggered.current) return;
    if (!lastTimestamp) {
      setHasMore(false);
      return;
    }
    loadMoreTriggered.current = true;
    setLoadingMore(true);
    try {
      const h = await loadHistory(deviceId, effectiveStart, effectiveEnd, PAGE_SIZE, lastTimestamp);
      if (h.length > 0) {
        setHistory((prev) => [...prev, ...h]);
        const last = h[h.length - 1];
        const ts = last?.timestamp;
        if (ts) setLastTimestamp(ts.toDate ? ts.toDate() : ts);
      }
      if (h.length < PAGE_SIZE) setHasMore(false);
    } catch (e) {
      console.warn("Load more failed", e);
    } finally {
      setLoadingMore(false);
      loadMoreTriggered.current = false;
    }
  }, [deviceId, hasMore, loadingMore, lastTimestamp, effectiveStart, effectiveEnd]);

  const stateDistribution = React.useMemo(() => {
    const counts: Record<string, number> = {};
    STATES.forEach((s) => (counts[s] = 0));
    history.forEach((item) => {
      const s = item.state ?? "CALM";
      if (STATES.includes(s)) counts[s]++;
    });
    const total = history.length || 1;
    return STATES.map((state) => ({
      state,
      count: counts[state],
      pct: Math.round((counts[state] / total) * 100),
      color: STATE_COLORS[state],
    })).filter((d) => d.count > 0);
  }, [history]);

  const chartData = React.useMemo(() => {
    const sorted = [...history].sort((a, b) => {
      const ta = a.timestamp?.toDate?.()?.getTime?.() ?? (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : 0);
      const tb = b.timestamp?.toDate?.()?.getTime?.() ?? (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : 0);
      return ta - tb;
    });
    return sorted.map((item) => {
      const t = item.timestamp?.toDate?.()?.getTime?.() ?? (item.timestamp?.seconds ? item.timestamp.seconds * 1000 : 0);
      return {
        time: t,
        y: Math.min(100, Math.max(0, Number(item.anxietyScore) ?? 0)),
      };
    });
  }, [history]);

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

  const chartWidth = Dimensions.get("window").width - 48;
  const chartHeight = 180;
  const padding = { top: 10, right: 10, bottom: 30, left: 36 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;
  const maxY = 100;
  const timeRange = chartData.length >= 2
    ? chartData[chartData.length - 1].time - chartData[0].time
    : 1;
  const points = chartData.length
    ? chartData
        .map((d) => {
          const x = padding.left + ((d.time - (chartData[0]?.time ?? 0)) / timeRange) * innerW;
          const y = padding.top + (1 - d.y / maxY) * innerH;
          return `${x},${y}`;
        })
        .join(" ")
    : "";

  const mergedEvents = React.useMemo(() => {
    const list: { id: string; timestamp: any; state?: string; anxietyScore?: number; type?: string; score?: number; isAlert?: boolean }[] = [
      ...history.map((h) => ({ ...h, id: (h as any).id ?? `h-${(h as any).timestamp?.seconds ?? Math.random()}`, isAlert: false })),
      ...alerts.map((a) => ({ ...a, id: (a as any).id ?? `a-${(a as any).timestamp?.seconds ?? Math.random()}`, type: (a as any).type, score: (a as any).score, isAlert: true })),
    ];
    list.sort((a, b) => {
      const ta = a.timestamp?.toDate?.()?.getTime?.() ?? (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : 0);
      const tb = b.timestamp?.toDate?.()?.getTime?.() ?? (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : 0);
      return tb - ta;
    });
    return list;
  }, [history, alerts]);

  const renderEventItem = ({ item }: { item: (typeof mergedEvents)[0] }) => (
    <View
      style={[
        item.isAlert ? styles.alertCard : styles.eventCard,
        { backgroundColor: theme.card, borderColor: item.isAlert ? "#F85149" : theme.border },
      ]}
    >
      <Text style={[styles.eventTime, { color: theme.textMuted }]}>
        {item.timestamp?.toDate?.()?.toLocaleString?.() ?? "—"}
      </Text>
      <Text style={[styles.eventState, { color: item.isAlert ? "#F85149" : theme.textDark }]}>
        {item.isAlert
          ? `${item.type ?? "Alert"} • Score: ${item.score ?? "—"}`
          : `${item.state ?? "—"} • Anxiety: ${item.anxietyScore ?? "—"}`}
      </Text>
    </View>
  );

  const ListHeader = () => (
    <>
      <Text style={[styles.title, { color: theme.textDark }]}>History</Text>

      <View style={styles.filterRow}>
        {(["today", "yesterday", "week", "month", "custom"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => f === "custom" ? setCustomModalVisible(true) : setFilter(f)}
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
                numberOfLines={1}
              >
                {f === "today" ? "Today" : f === "yesterday" ? "Yesterday" : f === "week" ? "This Week" : f === "month" ? "This Month" : "Custom"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Modal visible={customModalVisible} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setCustomModalVisible(false)}
          >
            <View style={[styles.modalContent, { backgroundColor: theme.card }]} onStartShouldSetResponder={() => true}>
              <Text style={[styles.modalTitle, { color: theme.textDark }]}>Custom date range</Text>
              {CUSTOM_PRESETS.map(({ label, days }) => {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - days);
                start.setHours(0, 0, 0, 0);
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.modalOption, { borderColor: theme.border }]}
                    onPress={() => {
                      setCustomStart(start);
                      setCustomEnd(end);
                      setFilter("custom");
                      setCustomModalVisible(false);
                    }}
                  >
                    <Text style={[styles.modalOptionText, { color: theme.textDark }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.modalCancel, { borderColor: theme.border }]}
                onPress={() => setCustomModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {loading ? (
          <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* 1. Anxiety Timeline Chart */}
            <Text style={[styles.sectionLabel, { color: theme.textDark }]}>Anxiety Timeline (0–100)</Text>
            <View style={[styles.chartCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Svg width={chartWidth} height={chartHeight}>
                {chartData.length > 0 && (
                  <>
                    <Line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerH} stroke={theme.border} strokeWidth={1} />
                    <Line x1={padding.left} y1={padding.top + innerH} x2={padding.left + innerW} y2={padding.top + innerH} stroke={theme.border} strokeWidth={1} />
                    <Polyline points={points} fill="none" stroke={theme.primary} strokeWidth={2} />
                  </>
                )}
              </Svg>
              {chartData.length === 0 && (
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>No anxiety data in this period</Text>
              )}
            </View>

            {/* 2. State Distribution (Donut) */}
            <Text style={[styles.sectionLabel, { color: theme.textDark, marginTop: 20 }]}>State Distribution (% time)</Text>
            <View style={[styles.chartCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {stateDistribution.length > 0 ? (
                <View style={styles.donutRow}>
                  <View style={styles.donutLegend}>
                    {stateDistribution.map((d) => (
                      <View key={d.state} style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                        <Text style={[styles.legendText, { color: theme.textDark }]}>{d.state}</Text>
                        <Text style={[styles.legendPct, { color: theme.textMuted }]}>{d.pct}%</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.donutWrap}>
                    <Svg width={120} height={120} viewBox="0 0 120 120">
                      {(() => {
                        const total = stateDistribution.reduce((s, x) => s + x.pct, 0) || 1;
                        let acc = 0;
                        return stateDistribution.map((d) => {
                          const pct = d.pct / total;
                          const startAngle = acc;
                          const sweep = pct * 360;
                          acc += sweep;
                          const r = 50;
                          const cx = 60;
                          const cy = 60;
                          const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
                          const y1 = cy - r * Math.sin((startAngle * Math.PI) / 180);
                          const x2 = cx + r * Math.cos(((startAngle + sweep) * Math.PI) / 180);
                          const y2 = cy - r * Math.sin(((startAngle + sweep) * Math.PI) / 180);
                          const large = sweep > 180 ? 1 : 0;
                          const pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
                          return <Path key={d.state} d={pathD} fill={d.color} stroke={theme.card} strokeWidth={2} />;
                        });
                      })()}
                      <Circle cx={60} cy={60} r={28} fill={theme.card} />
                    </Svg>
                  </View>
                </View>
              ) : (
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>No state data in this period</Text>
              )}
            </View>

      {/* 3. Event Log — header only; list is below */}
      <Text style={[styles.sectionLabel, { color: theme.textDark, marginTop: 20 }]}>Event Log</Text>
          </>
        )}
      </>
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <FlatList
        data={mergedEvents}
        keyExtractor={(item) => item.id ?? String(item.timestamp)}
        renderItem={renderEventItem}
        ListHeaderComponent={loading ? null : ListHeader}
        ListEmptyComponent={
          !loading && mergedEvents.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 8 }]}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                No events in this period. Data is stored in Firestore per device and unique per user.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (mergedEvents.length > 0 && hasMore && !loadingMore) loadMore();
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          hasMore && mergedEvents.length > 0 && loadingMore ? (
            <View style={styles.loadMoreWrap}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.loadMoreText, { color: theme.textMuted }]}>Loading more…</Text>
            </View>
          ) : null
        }
      />
      {loading && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[styles.center, { flex: 1, backgroundColor: theme.background }]}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        </View>
      )}
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
  chartCard: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8, minHeight: 100 },
  emptyCard: { padding: 24, borderRadius: 12, borderWidth: 1 },
  emptyText: { fontSize: 14, textAlign: "center" },
  eventCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  alertCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8, borderLeftWidth: 4 },
  eventTime: { fontSize: 12, marginBottom: 4 },
  eventState: { fontSize: 14, fontWeight: "600" },
  donutRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  donutLegend: { flex: 1 },
  legendRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  legendText: { fontSize: 13, fontWeight: "600", flex: 1 },
  legendPct: { fontSize: 12 },
  donutWrap: { width: 120, height: 120 },
  loadMoreBtn: { padding: 16, borderRadius: 12, borderWidth: 1, alignItems: "center", marginTop: 12 },
  loadMoreWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  loadMoreText: { fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalContent: { borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16 },
  modalOption: { paddingVertical: 14, borderBottomWidth: 1 },
  modalOptionText: { fontSize: 16, fontWeight: "600" },
  modalCancel: { marginTop: 16, paddingVertical: 12, alignItems: "center", borderTopWidth: 1 },
  modalCancelText: { fontSize: 15 },
});
