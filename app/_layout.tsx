import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "BondAI",
          headerTitleAlign: "left",
          headerStyle: {
            backgroundColor: "#000d28ff",   // ← same maroon as your button primary
          },
          headerTintColor: "#fafeffff",      // matches theme.textDark
          headerTitleStyle: {
            fontWeight: "700",
            fontSize: 20,
          },
        }}
      />
    </Stack>
  );
}
