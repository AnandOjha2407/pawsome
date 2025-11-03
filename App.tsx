// App.tsx
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Expo Router already provides a NavigationContainer.
            We must NOT create another NavigationContainer here,
            so we render our navigator directly so it uses the
            container provided by Expo Router. */}
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
