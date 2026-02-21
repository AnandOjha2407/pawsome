import SignUp from "../../src/screens/SignUp";
import { useRouter } from "expo-router";

export default function AuthSignUpScreen() {
  const router = useRouter();
  return (
    <SignUp
      onBack={() => router.back()}
      onSuccess={() => router.replace("/")}
    />
  );
}
