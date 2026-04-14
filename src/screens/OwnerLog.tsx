// Owner Daily Log — Trial tracking + event logging to Firestore
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../ThemeProvider";
import { MaterialIcons } from "@expo/vector-icons";
import { useFirebase } from "../context/FirebaseContext";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "@react-native-firebase/firestore";

const EVENTS = [
  "Owner left home",
  "Owner returned",
  "Thunderstorm",
  "Fireworks",
  "Doorbell",
  "Visitor arrived",
  "Visitor left",
  "Car ride",
  "Vet visit",
  "Walk",
  "Feeding time",
  "Bedtime",
  "Other",
] as const;

const DURATIONS = [
  "5 min",
  "15 min",
  "30 min",
  "1 hour",
  "2 hours",
  "4+ hours",
  "All day",
] as const;

type LogEntry = {
  id: string;
  event: string;
  duration: string;
  notes: string;
  timestamp: Date;
};

export default function OwnerLog() {
  const { theme } = useTheme();
  const firebase = useFirebase();
  const [selectedEvent, setSelectedEvent] = useState<string>(EVENTS[0]);
  const [selectedDuration, setSelectedDuration] = useState<string>(DURATIONS[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);

  const deviceId = firebase?.deviceId;
  const uid = firebase?.user?.uid;

  const loadTodayEntries = useCallback(async () => {
    if (!deviceId) {
      setEntries([]);
      setLoadingEntries(false);
      return;
    }
    try {
      const db = getFirestore();
      const notesRef = collection(db, "devices", deviceId, "owner_notes");
      const q = query(notesRef, orderBy("timestamp", "desc"), limit(20));
      const snap = await getDocs(q);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const items: LogEntry[] = [];
      snap.forEach((d) => {
        const data = d.data();
        let ts: Date;
        if (data.timestamp instanceof Timestamp) {
          ts = data.timestamp.toDate();
        } else if (data.timestamp?.toDate) {
          ts = data.timestamp.toDate();
        } else {
          ts = new Date();
        }
        if (ts >= today) {
          items.push({
            id: d.id,
            event: data.event ?? "",
            duration: data.duration ?? "",
            notes: data.notes ?? "",
            timestamp: ts,
          });
        }
      });
      setEntries(items);
    } catch (e) {
      if (__DEV__) console.warn("[OwnerLog] load error:", e);
    } finally {
      setLoadingEntries(false);
    }
  }, [deviceId]);

  useEffect(() => {
    loadTodayEntries();
  }, [loadTodayEntries]);

  const handleLogEvent = async () => {
    if (!deviceId || !uid) {
      Alert.alert("Setup Required", "Set your Device ID in Settings first.");
      return;
    }
    setSaving(true);
    try {
      const db = getFirestore();
      const notesRef = collection(db, "devices", deviceId, "owner_notes");
      const docId = `${Date.now()}_${uid}`;
      await setDoc(doc(notesRef, docId), {
        timestamp: serverTimestamp(),
        event: selectedEvent,
        duration: selectedDuration,
        notes: notes.trim(),
        userId: uid,
      });
      setNotes("");
      await loadTodayEntries();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save event.");
    } finally {
      setSaving(false);
    }
  };

  const trialDay = 4;
  const trialTotal = 10;
  const trialPhase = "THERAPY";

  const formatTime = (d: Date) => {
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: theme.textDark }]}>Daily Log</Text>
        <View style={[styles.trialBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.trialText, { color: theme.primary }]}>
            Trial Day {trialDay} of {trialTotal}
          </Text>
          <Text style={[styles.trialPhase, { color: theme.textMuted }]}>
            Phase: {trialPhase}
          </Text>
        </View>

        {/* Event dropdown */}
        <Text style={[styles.label, { color: theme.textMuted }]}>What happened?</Text>
        <TouchableOpacity
          onPress={() => { setShowEventPicker(!showEventPicker); setShowDurationPicker(false); }}
          style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Text style={[styles.dropdownText, { color: theme.textDark }]}>{selectedEvent}</Text>
          <MaterialIcons name={showEventPicker ? "expand-less" : "expand-more"} size={24} color={theme.textMuted} />
        </TouchableOpacity>
        {showEventPicker && (
          <View style={[styles.pickerList, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {EVENTS.map((evt) => (
              <TouchableOpacity
                key={evt}
                onPress={() => { setSelectedEvent(evt); setShowEventPicker(false); }}
                style={[styles.pickerItem, selectedEvent === evt && { backgroundColor: theme.primary + "20" }]}
              >
                <Text style={[styles.pickerItemText, { color: selectedEvent === evt ? theme.primary : theme.textDark }]}>{evt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Duration dropdown */}
        <Text style={[styles.label, { color: theme.textMuted, marginTop: 16 }]}>How long?</Text>
        <TouchableOpacity
          onPress={() => { setShowDurationPicker(!showDurationPicker); setShowEventPicker(false); }}
          style={[styles.dropdown, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Text style={[styles.dropdownText, { color: theme.textDark }]}>{selectedDuration}</Text>
          <MaterialIcons name={showDurationPicker ? "expand-less" : "expand-more"} size={24} color={theme.textMuted} />
        </TouchableOpacity>
        {showDurationPicker && (
          <View style={[styles.pickerList, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {DURATIONS.map((dur) => (
              <TouchableOpacity
                key={dur}
                onPress={() => { setSelectedDuration(dur); setShowDurationPicker(false); }}
                style={[styles.pickerItem, selectedDuration === dur && { backgroundColor: theme.primary + "20" }]}
              >
                <Text style={[styles.pickerItemText, { color: selectedDuration === dur ? theme.primary : theme.textDark }]}>{dur}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Notes */}
        <Text style={[styles.label, { color: theme.textMuted, marginTop: 16 }]}>Notes (optional)</Text>
        <TextInput
          style={[styles.notesInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
          placeholder="Any observations..."
          placeholderTextColor={theme.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Log button */}
        <TouchableOpacity
          onPress={handleLogEvent}
          disabled={saving}
          style={[styles.logBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <>
              <MaterialIcons name="add" size={22} color="#000" />
              <Text style={styles.logBtnText}>LOG EVENT</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Today's entries */}
        <Text style={[styles.sectionTitle, { color: theme.textDark, marginTop: 28 }]}>
          Today's Entries
        </Text>
        {loadingEntries ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={theme.primary} />
        ) : entries.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>No entries today yet.</Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={[styles.entryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.entryHeader}>
                <Text style={[styles.entryEvent, { color: theme.textDark }]}>{entry.event}</Text>
                <Text style={[styles.entryTime, { color: theme.textMuted }]}>{formatTime(entry.timestamp)}</Text>
              </View>
              <Text style={[styles.entryDuration, { color: theme.primary }]}>{entry.duration}</Text>
              {entry.notes ? (
                <Text style={[styles.entryNotes, { color: theme.textMuted }]}>{entry.notes}</Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  trialBadge: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 24 },
  trialText: { fontSize: 16, fontWeight: "700" },
  trialPhase: { fontSize: 14, fontWeight: "600" },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  dropdown: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 10, borderWidth: 1 },
  dropdownText: { fontSize: 16, fontWeight: "600" },
  pickerList: { borderWidth: 1, borderRadius: 10, marginTop: 4, overflow: "hidden" },
  pickerItem: { padding: 14 },
  pickerItemText: { fontSize: 15 },
  notesInput: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 15, minHeight: 80 },
  logBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 12, marginTop: 20 },
  logBtnText: { fontSize: 16, fontWeight: "800", color: "#000" },
  sectionTitle: { fontSize: 18, fontWeight: "700" },
  emptyText: { fontSize: 14, marginTop: 12 },
  entryCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginTop: 10 },
  entryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  entryEvent: { fontSize: 15, fontWeight: "700" },
  entryTime: { fontSize: 13 },
  entryDuration: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  entryNotes: { fontSize: 13, marginTop: 6, fontStyle: "italic" },
});
