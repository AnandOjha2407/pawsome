// Onboarding: Dog Profile Setup — name, breed, age, weight; save to Firestore and continue to BLE Pair
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "../ThemeProvider";
import { useFirebase } from "../context/FirebaseContext";
import { loadDogProfile, saveDogProfile, type DogProfile } from "../firebase/firebase";
import { MOCK_DEVICE_ID } from "../mock/mockData";

export default function DogProfileSetup() {
  const { theme } = useTheme();
  const firebase = useFirebase();
  const router = useRouter();
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    let mounted = true;
    const uid = firebase?.user?.uid;
    if (!uid) return;
    loadDogProfile(uid)
      .then((profile) => {
        if (!mounted) return;
        if (profile) {
          setName(profile.name ?? "");
          setBreed(profile.breed ?? "");
          setAge(profile.age != null ? String(profile.age) : "");
          setWeight(profile.weight != null ? String(profile.weight) : "");
        }
      })
      .finally(() => { if (mounted) setInitialLoad(false); });
    return () => { mounted = false; };
  }, [firebase?.user?.uid]);

  const handleContinue = async () => {
    const n = name.trim();
    if (!n) {
      Alert.alert("Required", "Please enter your dog's name.");
      return;
    }
    const uid = firebase?.user?.uid;
    if (!uid) return;
    setLoading(true);
    try {
      const profile: Partial<DogProfile> = {
        name: n,
        breed: breed.trim() || undefined,
        age: age.trim() ? parseInt(age, 10) : undefined,
        weight: weight.trim() ? parseFloat(weight) : undefined,
      };
      await saveDogProfile(uid, profile);
      router.replace("/(onboarding)/pair");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not save profile.");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoad) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
        <View style={styles.centered}>
          <Text style={{ color: theme.textMuted }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.inner}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: theme.textDark }]}>Dog Profile</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>Tell us about your dog</Text>
          <Text style={[styles.label, { color: theme.textMuted }]}>Name (required)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
            placeholder="Dog's name"
            placeholderTextColor={theme.textMuted}
            value={name}
            onChangeText={setName}
          />
          <Text style={[styles.label, { color: theme.textMuted }]}>Breed</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
            placeholder="Optional"
            placeholderTextColor={theme.textMuted}
            value={breed}
            onChangeText={setBreed}
          />
          <Text style={[styles.label, { color: theme.textMuted }]}>Age (years)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
            placeholder="Optional"
            placeholderTextColor={theme.textMuted}
            value={age}
            onChangeText={setAge}
            keyboardType="numeric"
          />
          <Text style={[styles.label, { color: theme.textMuted }]}>Weight (lbs)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
            placeholder="Optional"
            placeholderTextColor={theme.textMuted}
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
          />
          <TouchableOpacity
            onPress={handleContinue}
            disabled={loading}
            style={[styles.btn, { backgroundColor: theme.primary, opacity: loading ? 0.7 : 1 }]}
          >
            <Text style={styles.btnText}>Continue</Text>
          </TouchableOpacity>
          {__DEV__ && (
            <TouchableOpacity
              onPress={async () => {
                if (firebase?.setDeviceId) {
                  await firebase.setDeviceId(MOCK_DEVICE_ID);
                  router.replace("/(tabs)/dashboard");
                }
              }}
              style={[styles.btn, styles.mockBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.btnText, { color: theme.textMuted }]}>Use mock device and open app (dev)</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 14, marginBottom: 24 },
  label: { fontSize: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16 },
  btn: { padding: 16, borderRadius: 12, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  mockBtn: { backgroundColor: "transparent", borderWidth: 1, marginTop: 16 },
});
