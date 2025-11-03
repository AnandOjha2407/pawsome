// src/navigation/RootNavigator.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

// Screens
import Home from '../screens/Home';
import Pairing from '../screens/Pairing';
import Dashboard from '../screens/Dashboard';
import Insights from '../screens/Insights';
import Settings from '../screens/Settings';
import MapScreen from '../screens/MapScreen';
import BondAI from '../screens/BondAI'; // <- new screen you will create

const Stack = createNativeStackNavigator<any>();
const Tabs = createBottomTabNavigator<any>();

function MainTabs() {
  return (
    <Tabs.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 8 },
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#64748b',
      }}
    >
      <Tabs.Screen
        name="Home"
        component={Home}
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="home" color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="Dashboard"
        component={Dashboard}
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="dashboard" color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="BondAI"
        component={BondAI}
        options={{
          title: 'BondAI',
          tabBarLabel: 'BondAI',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="chat" color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="Map"
        component={MapScreen}
        options={{
          title: 'Map',
          tabBarLabel: 'Map',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="map" color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="Settings"
        component={Settings}
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
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
    </Stack.Navigator>
  );
}
