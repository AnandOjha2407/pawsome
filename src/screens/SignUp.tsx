import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "../ThemeProvider";
import { useFirebase } from "../context/FirebaseContext";

export default function SignUp({ onBack, onSuccess }: { onBack?: () => void; onSuccess?: () => void }) {
  const { theme } = useTheme();
  const firebase = useFirebase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    const e = email.trim();
    const p = password;
    const cp = confirmPassword;
    if (!e || !p) {
      Alert.alert("Error", "Enter email and password.");
      return;
    }
    if (p.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }
    if (p !== cp) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await firebase?.signUp(e, p);
      onSuccess?.();
    } catch (err: any) {
      const msg = err?.message ?? "Could not create account.";
      if (msg.toLowerCase().includes("email") && (msg.toLowerCase().includes("use") || msg.toLowerCase().includes("already"))) {
        Alert.alert("Sign up failed", "This email is already in use. Try logging in instead.");
      } else {
        Alert.alert("Sign up failed", msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.inner}>
        <Text style={[styles.title, { color: theme.textDark }]}>Sign up</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>Create an account</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
          placeholder="Email"
          placeholderTextColor={theme.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <View style={styles.passwordWrap}>
          <TextInput
            style={[styles.input, styles.passwordInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
            placeholder="Password (min 6 characters)"
            placeholderTextColor={theme.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="password-new"
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPassword((p) => !p)}
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          >
            <MaterialIcons name={showPassword ? "visibility-off" : "visibility"} size={24} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.passwordWrap}>
          <TextInput
            style={[styles.input, styles.passwordInput, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textDark }]}
            placeholder="Confirm password"
            placeholderTextColor={theme.textMuted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            autoComplete="password-new"
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowConfirmPassword((p) => !p)}
            accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
          >
            <MaterialIcons name={showConfirmPassword ? "visibility-off" : "visibility"} size={24} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={handleSignUp}
          disabled={loading}
          style={[styles.primaryBtn, { backgroundColor: theme.primary, opacity: loading ? 0.7 : 1 }]}
        >
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryBtnText}>Sign up</Text>}
        </TouchableOpacity>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.linkBtn}>
            <Text style={[styles.linkText, { color: theme.primary }]}>Back to log in</Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 14, marginBottom: 24 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 16 },
  passwordWrap: { position: "relative", marginBottom: 16 },
  passwordInput: { paddingRight: 48 },
  eyeBtn: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" },
  primaryBtn: { padding: 16, borderRadius: 12, alignItems: "center", marginTop: 8 },
  primaryBtnText: { color: "#000", fontWeight: "800", fontSize: 16 },
  linkBtn: { marginTop: 20, alignItems: "center" },
  linkText: { fontSize: 15, fontWeight: "600" },
});
