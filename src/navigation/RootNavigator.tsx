// src/navigation/RootNavigator.tsx
import React from "react";
import { Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../ThemeProvider";

// Screens
import Home from "../screens/Home";
import Pairing from "../screens/Pairing";
import Dashboard from "../screens/Dashboard";
import Insights from "../screens/Insights";
import Settings from "../screens/Settings";
import BondAI from "../screens/BondAI"; // Chat-style AI screen
import Analytics from "../screens/Analytics";

const Stack = createNativeStackNavigator<any>();
const Tabs = createBottomTabNavigator<any>();

function MainTabs() {
  const { theme } = useTheme();

  return (
    <Tabs.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: {
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          borderTopWidth: 0.5,
          // on Android the elevation sometimes shows a shadow — keep it subtle per theme
          elevation: 0,
        },
        tabBarActiveTintColor: theme.navActive,
        tabBarInactiveTintColor: theme.navInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="Home"
        component={Home}
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="home" color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="Dashboard"
        component={Dashboard}
        options={{
          title: "Dashboard",
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ color, size }) => <MaterialIcons name="dashboard" color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="BondAI"
        component={BondAI}
        options={{
          title: "BondAI",
          tabBarLabel: "BondAI",
          tabBarIcon: ({ color, size }) => <MaterialIcons name="chat" color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="Settings"
        component={Settings}
        options={{
          title: "Settings",
          tabBarLabel: "Settings",
          tabBarIcon: ({ color, size }) => <MaterialIcons name="settings" color={color} size={size} />,
        }}
      />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Pairing" component={Pairing} />
      <Stack.Screen name="Insights" component={Insights} />
      <Stack.Screen name="Analytics" component={Analytics} />
    </Stack.Navigator>
  );
}
