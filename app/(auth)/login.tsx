import Login from "../../src/screens/Login";
import { useRouter } from "expo-router";

export default function AuthLoginScreen() {
  const router = useRouter();
  return (
    <Login
      onSignUp={() => router.push("/(auth)/signup")}
      onSuccess={() => router.replace("/")}
    />
  );
}
