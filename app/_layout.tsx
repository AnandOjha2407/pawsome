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
            backgroundColor: "#712900ff",   // ← same maroon as your button primary
          },
          headerTintColor: "#047c9dff",      // matches theme.textDark
          headerTitleStyle: {
            fontWeight: "700",
            fontSize: 20,
          },
        }}
      />
    </Stack>
  );
}
