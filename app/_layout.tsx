import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "BondAI",
          headerTitleAlign: "left", // 👈 moves title to extreme left
          headerStyle: { backgroundColor: "#2c9aa6" },
          headerTintColor: "#fff",
          headerTitleStyle: {
            fontWeight: "700",
            fontSize: 20,
          },
        }}
      />
    </Stack>
  );
}
