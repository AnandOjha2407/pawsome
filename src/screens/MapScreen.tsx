// src/screens/MapScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import * as Location from 'expo-location';

type MapsModule = {
  MapView: any;
  Marker: any;
  Polyline: any;
  PROVIDER_GOOGLE?: any;
};

export default function MapScreen() {
  const [region, setRegion] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeCoords, setRouteCoords] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [maps, setMaps] = useState<MapsModule | null>(null);

  useEffect(() => {
    let sub: any = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission denied');
          Alert.alert('Permission required', 'Location access is needed for GPS tracking.');
          setLoading(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        const { latitude, longitude } = loc.coords;
        setRegion({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 });
        setRouteCoords([{ latitude, longitude }]);

        // Lazy-load native map package only on mobile platforms
        if (Platform.OS !== 'web') {
          try {
            const pkg = 'react-native' + '-maps';
            const mapsModule: any = await import(pkg);
            const normalized: MapsModule = {
              MapView: mapsModule.default ?? mapsModule.MapView,
              Marker: mapsModule.Marker ?? mapsModule.default?.Marker ?? mapsModule.MapMarker ?? null,
              Polyline: mapsModule.Polyline ?? mapsModule.default?.Polyline ?? null,
              PROVIDER_GOOGLE: mapsModule.PROVIDER_GOOGLE ?? undefined,
            };
            setMaps(normalized);
          } catch (e: any) {
            console.warn('react-native-maps load failed', e);
            setErrorMsg('Map module failed to load (native only).');
          }
        }
      } catch (e: any) {
        setErrorMsg(String(e.message ?? e));
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (sub && typeof sub.remove === 'function') sub.remove();
    };
  }, []);

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8 }}>Loading map & location…</Text>
      </View>
    );

  if (errorMsg)
    return (
      <View style={styles.center}>
        <Text>{errorMsg}</Text>
      </View>
    );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>Map is unavailable in web preview</Text>
        <Text style={{ marginTop: 8, color: '#666', textAlign: 'center', maxWidth: 420 }}>
          To view the interactive map please open the app on a mobile device (Expo Go) or an Android/iOS emulator.
        </Text>
      </View>
    );
  }

  if (!maps)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8 }}>Loading native map module…</Text>
      </View>
    );

  const { MapView, Marker, Polyline, PROVIDER_GOOGLE } = maps;

  return (
    <View style={styles.container}>
      {region ? (
        <MapView
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={region}
          showsUserLocation
        >
          <Marker coordinate={{ latitude: region.latitude, longitude: region.longitude }} title="You" description="Current location" />
          {routeCoords.length > 1 && <Polyline coordinates={routeCoords} strokeWidth={4} />}
        </MapView>
      ) : (
        <View style={styles.center}>
          <Text>Region unavailable</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
