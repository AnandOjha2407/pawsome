import SignUp from "../../src/screens/SignUp";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useFirebase } from "../../src/context/FirebaseContext";

export default function AuthSignUpScreen() {
  const router = useRouter();
  const firebase = useFirebase();

  useEffect(() => {
    if (firebase?.user) {
      router.replace("/");
    }
  }, [firebase?.user]);

  return (
    <SignUp
      onBack={() => router.back()}
    />
  );
}
