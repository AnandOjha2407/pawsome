import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dog-profile" />
      <Stack.Screen name="pair" />
      <Stack.Screen name="wifi" />
    </Stack>
  );
}
