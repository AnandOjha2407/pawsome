// src/screens/Analytics.tsx

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";
import { Theme } from "../theme";
import {
  loadBondScoreRecords,
  calculateImprovement,
  BondScoreRecord,
} from "../storage/analytics";
import { LinearGradient } from "expo-linear-gradient";
import { Dimensions } from "react-native";

const screenW = Dimensions.get("window").width;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.background,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: theme.textDark,
      marginLeft: 12,
      flex: 1,
    },
    container: {
      flex: 1,
      padding: 18,
    },
    summaryCard: {
      borderRadius: 16,
      padding: 18,
      marginBottom: 18,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    summaryTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 16,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      marginBottom: 16,
    },
    summaryItem: {
      alignItems: "center",
    },
    summaryLabel: {
      fontSize: 12,
      marginBottom: 4,
    },
    summaryValue: {
      fontSize: 24,
      fontWeight: "800",
    },
    trendRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    trendText: {
      fontSize: 14,
      fontWeight: "600",
      marginLeft: 8,
    },
    sessionCount: {
      fontSize: 12,
      textAlign: "center",
      marginTop: 4,
    },
    chartCard: {
      borderRadius: 16,
      padding: 18,
      marginBottom: 18,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    chartTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 12,
    },
    chartContainer: {
      alignItems: "center",
    },
    tableCard: {
      borderRadius: 16,
      padding: 18,
      marginBottom: 18,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    tableTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 16,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    tableHeader: {
      borderBottomWidth: 2,
      paddingBottom: 8,
    },
    tableHeaderText: {
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    tableCell: {
      fontSize: 14,
    },
    emptyText: {
      textAlign: "center",
      fontSize: 14,
      paddingVertical: 24,
      lineHeight: 20,
    },
    moreText: {
      textAlign: "center",
      fontSize: 12,
      paddingTop: 12,
      fontStyle: "italic",
    },
  });
}

export default function Analytics() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [records, setRecords] = useState<BondScoreRecord[]>([]);
  const [improvement, setImprovement] = useState(calculateImprovement([]));
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await loadBondScoreRecords();
      setRecords(data);
      setImprovement(calculateImprovement(data));
    } catch (error) {
      console.error("Failed to load analytics:", error);
      setRecords([]);
      setImprovement(calculateImprovement([]));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      setRefreshKey(prev => prev + 1);
    }, [])
  );

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  const getTrendIcon = () => {
    if (improvement.trend === "improving") {
      return "trending-up";
    } else if (improvement.trend === "declining") {
      return "trending-down";
    }
    return "trending-flat";
  };

  const getTrendColor = () => {
    if (improvement.trend === "improving") {
      return theme.success || "#4CAF50";
    } else if (improvement.trend === "declining") {
      return theme.error || "#F44336";
    }
    return theme.textMuted;
  };

  // Prepare chart data (last 14 records for bar chart)
  const chartRecords = records.slice(0, 14).reverse();
  const chartScores = chartRecords.map(r => r.bondScore);
  const maxScore = chartScores.length > 0 
    ? Math.max(...chartScores, 100) 
    : 100;

  return (
    <SafeAreaView style={[styles.screen, { paddingTop: Math.max(insets.top, 10) }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 20,
          }}
        >
          <MaterialIcons name="arrow-back" size={24} color={theme.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics & Progress</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Improvement Summary */}
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: theme.glassBackground || theme.card,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.summaryTitle, { color: theme.textDark }]}>
            Progress Overview
          </Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>
                Average Score
              </Text>
              <Text style={[styles.summaryValue, { color: theme.textDark }]}>
                {improvement.averageScore.toFixed(1)}
              </Text>
            </View>

            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>
                Recent Average
              </Text>
              <Text style={[styles.summaryValue, { color: theme.textDark }]}>
                {improvement.recentAverage.toFixed(1)}
              </Text>
            </View>

            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>
                Best Score
              </Text>
              <Text
                style={[
                  styles.summaryValue,
                  { color: theme.success || theme.primary },
                ]}
              >
                {improvement.bestScore.toFixed(1)}
              </Text>
            </View>
          </View>

          <View style={styles.trendRow}>
            <MaterialIcons
              name={getTrendIcon()}
              size={20}
              color={getTrendColor()}
            />
            <Text style={[styles.trendText, { color: getTrendColor() }]}>
              {improvement.trend === "improving"
                ? `Improving by ${Math.abs(improvement.improvementPercentage).toFixed(1)}%`
                : improvement.trend === "declining"
                ? `Declining by ${Math.abs(improvement.improvementPercentage).toFixed(1)}%`
                : "Stable"}
            </Text>
          </View>

          <Text style={[styles.sessionCount, { color: theme.textMuted }]}>
            Total Sessions: {improvement.totalSessions}
          </Text>
        </View>

        {/* Chart */}
        {chartScores.length > 0 && (
          <View
            style={[
              styles.chartCard,
              {
                backgroundColor: theme.glassBackground || theme.card,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.chartTitle, { color: theme.textDark }]}>
              Bond Score Trend
            </Text>
            <View style={styles.chartContainer}>
              {/* Simple Bar Chart */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  height: 150,
                  marginBottom: 8,
                  width: "100%",
                }}
              >
                {chartScores.map((score, index) => {
                  const safeScore = typeof score === 'number' && !isNaN(score) ? score : 0;
                  const safeMaxScore = maxScore > 0 ? maxScore : 100;
                  const barHeight = Math.max(8, Math.round((safeScore / safeMaxScore) * 130));
                  const isRecent = index >= chartScores.length - 7;
                  const primaryColor = theme.secondary || theme.primary || "#007AFF";
                  const mutedColor = theme.textMuted || "#999999";
                  return (
                    <View
                      key={index}
                      style={{ flex: 1, alignItems: "center", marginHorizontal: 2 }}
                    >
                      <LinearGradient
                        colors={
                          isRecent
                            ? [primaryColor, primaryColor]
                            : [`${mutedColor}80`, `${mutedColor}60`]
                        }
                        start={{ x: 0, y: 1 }}
                        end={{ x: 0, y: 0 }}
                        style={{
                          width: "80%",
                          height: barHeight,
                          borderRadius: 4,
                          minHeight: 8,
                        }}
                      />
                    </View>
                  );
                })}
              </View>
              {/* Chart labels */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 8,
                  width: "100%",
                }}
              >
                {chartScores.map((_, index) => {
                  if (
                    index % Math.ceil(chartScores.length / 7) !== 0 &&
                    index !== chartScores.length - 1
                  ) {
                    return <View key={index} style={{ flex: 1 }} />;
                  }
                  return (
                    <Text
                      key={index}
                      style={{
                        fontSize: 10,
                        color: theme.textMuted,
                        flex: 1,
                        textAlign: "center",
                      }}
                    >
                      {index + 1}
                    </Text>
                  );
                })}
              </View>
              <View style={{ marginTop: 8, paddingHorizontal: 8, width: "100%" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 11, color: theme.textMuted }}>0</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted }}>
                    Score: {Math.round(maxScore)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Records Table */}
        <View
          style={[
            styles.tableCard,
            {
              backgroundColor: theme.glassBackground || theme.card,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.tableTitle, { color: theme.textDark }]}>
            Session History
          </Text>

          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.emptyText, { color: theme.textMuted, marginTop: 12 }]}>
                Loading analytics...
              </Text>
            </View>
          ) : records.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              No training sessions recorded yet.
              {"\n"}Start a session to track your progress!
            </Text>
          ) : (
            <>
              {/* Table Header */}
              <View
                style={[
                  styles.tableRow,
                  styles.tableHeader,
                  { borderBottomColor: theme.border },
                ]}
              >
                <Text
                  style={[
                    styles.tableHeaderText,
                    { color: theme.textMuted },
                    { flex: 2 },
                  ]}
                >
                  Date
                </Text>
                <Text
                  style={[
                    styles.tableHeaderText,
                    { color: theme.textMuted },
                    { flex: 1 },
                  ]}
                >
                  Score
                </Text>
                <Text
                  style={[
                    styles.tableHeaderText,
                    { color: theme.textMuted },
                    { flex: 1 },
                  ]}
                >
                  Duration
                </Text>
              </View>

              {/* Table Rows */}
              {records.slice(0, 20).map((record) => (
                <View
                  key={record.id}
                  style={[
                    styles.tableRow,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.tableCell,
                      { color: theme.textDark },
                      { flex: 2 },
                    ]}
                  >
                    {formatDate(record.date)}
                  </Text>
                  <Text
                    style={[
                      styles.tableCell,
                      {
                        color:
                          record.bondScore >= 70
                            ? theme.success || theme.primary
                            : record.bondScore >= 50
                            ? theme.warning || theme.secondary
                            : theme.error || theme.textMuted,
                        fontWeight: "600",
                      },
                      { flex: 1 },
                    ]}
                  >
                    {Math.round(record.bondScore)}
                  </Text>
                  <Text
                    style={[
                      styles.tableCell,
                      { color: theme.textMuted },
                      { flex: 1 },
                    ]}
                  >
                    {record.durationMinutes}m
                  </Text>
                </View>
              ))}

              {records.length > 20 && (
                <Text style={[styles.moreText, { color: theme.textMuted }]}>
                  Showing last 20 of {records.length} sessions
                </Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

