# All paths and storage keys — full reference

Every path and storage key used in the app, by file. Firebase project is determined by **android/app/google-services.json** → `project_id: pawsomebond-464d2`.

**Project layout:** The app lives under **doggpt/** (this folder). Firebase rules and indexes are in **doggpt/firebase/** (firestore.rules, database.rules.json, firestore.indexes.json) — paste those into Firebase Console; they are not auto-deployed.

---

## 1. Firebase (project: pawsomebond-464d2)

All Firebase usage is in **src/firebase/firebase.ts**. The SDK uses the project from **google-services.json** (androidn/app or the file pointed to by app.config’s `googleServicesFile`).

### Realtime Database (RTDB)

| Path | Usage | Function / line |
|------|--------|------------------|
| `devices/{deviceId}/live` | READ live harness state | `subscribeLiveState` — ref path built line 175 |
| `devices/{deviceId}/commands/latest` | WRITE calm command | `sendCalmCommand` — line 214 |
| `devices/{deviceId}/commands/latest` | WRITE stop command | `sendStopCommand` — line 236 |
| `devices/{deviceId}/commands/latest` | WRITE config command | `sendConfigCommand` — line 265 |
| `userDevices/{uid}` | WRITE/REMOVE synced deviceId per user | `syncDeviceIdToBackend` — line 413 |

Constants: `RTDB_PATHS.devices` = `"devices"`, `RTDB_PATHS.commandsLatest` = `"commands/latest"`, `RTDB_PATHS.userDevices` = `"userDevices"` (firebase.ts lines 24–25).

### Firestore

| Path | Usage | Function / line |
|------|--------|------------------|
| `users/{uid}` | FCM token (fields fcmToken, fcmTokenUpdatedAt) | `saveFcmToken` — lines 401–404 |
| `users/{uid}` | deviceId, deviceIdUpdatedAt (merge) | `syncDeviceIdToBackend` — lines 410–412 |
| `users/{uid}` | notification prefs (notificationPreferences, preferencesUpdatedAt) | `loadUserPreferences` 437, `saveUserPreferences` 453–456 |
| `users/{uid}/profile/dog` | Dog profile (name, breed, age, weight, updatedAt) | `loadDogProfile` 474, `saveDogProfile` 491–495 |
| `devices/{deviceId}/history` | History records (timestamp, state, etc.) | `loadHistory` — collection("devices").doc(deviceId).collection("history") 304–306 |
| `devices/{deviceId}/alerts` | Alerts (timestamp, type, score, etc.) | `loadAlerts` — 345–347 |
| `devices/{deviceId}/config/autoCalm` | Auto-calm config (enabled, threshold, defaultProtocol, defaultIntensity, updatedAt) | `writeDeviceConfig` 373–376, `loadDeviceConfig` 384–387 |

---

## 2. Local storage (AsyncStorage)

Keys are strings; data is app-local on device.

| Key | Where defined | Where used | Purpose |
|-----|----------------|------------|---------|
| `@app_settings_v1` | src/storage/constants.ts `SETTINGS_STORAGE_KEY` | Settings.tsx (as STORAGE_KEY), pairedDevices.ts (readSettings/writeSettings) | BLE paired devices, autoConnect, stressAlertsEnabled, stressThreshold |
| `@onboarding_complete_v1` | src/storage/constants.ts `ONBOARDING_COMPLETE_KEY` | app/index.tsx (getItem), WiFiProvisioning.tsx (setItem), Settings reset can clear via onboarding flow | Whether user finished onboarding (dog profile + pair/WiFi step) |
| `@pawsomebond_device_id_v1` | src/storage/deviceId.ts `DEVICE_ID_KEY` | deviceId.ts getDeviceId/setDeviceId; FirebaseContext + Settings call setDeviceId (which uses saveDeviceId from deviceId.ts) | Current Device ID for Firebase live/commands (e.g. PB-001) |

---

## 3. Config / build paths

| What | Path / value | File |
|------|----------------|------|
| Android package | `com.pawsomebond.app` | app.config.js android.package, google-services.json android_client_info.package_name |
| google-services.json (Expo) | `./google-services.json` (relative to project root) | app.config.js android.googleServicesFile |
| google-services.json (Android build) | **android/app/google-services.json** | Used by Gradle; must match project pawsomebond-464d2 if that’s the app’s backend |

---

## 4. Route paths (Expo Router)

Used in app/ and redirects; not storage.

| Route | Used in |
|-------|---------|
| `/login` | app/index.tsx Redirect when !user |
| `/dog-profile` | app/index.tsx Redirect when !deviceId && !onboardingComplete |
| `/dashboard` | app/index.tsx default redirect; WiFiProvisioning replace |
| `/pair` | DogProfileSetup router.replace after saveDogProfile; Settings “Re-pair” |
| `/settings` | Various screens |

---

## 5. File reference summary

- **src/firebase/firebase.ts** — All Firebase paths (RTDB + Firestore); see table above.
- **src/storage/constants.ts** — `SETTINGS_STORAGE_KEY`, `ONBOARDING_COMPLETE_KEY`.
- **src/storage/deviceId.ts** — `DEVICE_ID_KEY`; get/set Device ID in AsyncStorage.
- **src/storage/pairedDevices.ts** — Uses `SETTINGS_STORAGE_KEY`; reads/writes `pairedDevices` and other settings in one JSON object.
- **app/index.tsx** — Reads `ONBOARDING_COMPLETE_KEY`.
- **src/screens/WiFiProvisioning.tsx** — Writes `ONBOARDING_COMPLETE_KEY`; calls `firebase.setDeviceId` (which persists to `@pawsomebond_device_id_v1` and syncs to backend).
- **src/screens/DogProfileSetup.tsx** — Calls `saveDogProfile(uid, profile)` → Firestore `users/{uid}/profile/dog`.
- **src/screens/Settings.tsx** — Uses `SETTINGS_STORAGE_KEY` (as STORAGE_KEY) for reset; Device ID field reads/writes via Firebase context (and thus deviceId storage + Firestore/RTDB sync).
- **android/app/google-services.json** — Defines Firebase project (project_id, firebase_url, etc.). Currently **pawsomebond-464d2**.

All backend data (dog profile, user prefs, deviceId sync, live data, commands, history, alerts, config) goes to Firebase project **pawsomebond-464d2** when the app is built with the current **android/app/google-services.json**.
