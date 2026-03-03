# Firebase schema: your data vs app vs spec

## 1. Your Realtime Database data — **matches**

Path: `https://pawsomebond-464d2-default-rtdb.firebaseio.com/devices/PB-001/live`

| Field            | Your data | Spec / app expects                    | Status |
|------------------|-----------|----------------------------------------|--------|
| state            | "ANXIOUS" | SLEEPING\|CALM\|ALERT\|ANXIOUS\|ACTIVE | ✓      |
| anxietyScore     | 57        | 0–100                                 | ✓      |
| confidence       | 99        | 0–100                                 | ✓      |
| activityLevel    | 4         | 0–10                                  | ✓      |
| breathingRate    | 0         | breaths/min                           | ✓      |
| circuitTemp      | 23.2      | Celsius                               | ✓      |
| batteryPercent   | 15        | 0–100                                 | ✓      |
| connectionType   | "wifi"    | wifi\|ble                             | ✓      |
| therapyActive    | "NONE"    | NONE\|HEARTBEAT\|…                     | ✓      |
| lastUpdated      | 7871      | number (timestamp or seconds-since-boot) | ✓ (app accepts any number) |
| motionEnergy     | 84        | —                                     | ✓ extra, ignored safely |
| motionVariance   | 1036      | —                                     | ✓ extra, used if present |
| protocol         | 1         | —                                     | ✓ extra, ignored safely |

The app normalizes with `??` defaults and supports extra keys, so your schema is compatible. No change needed for live data.

---

## 2. Why we use Firestore (and where)

The app uses **both** Realtime Database and Firestore by design:

| Use case | Database | Path (or equivalent) | Reason |
|----------|----------|----------------------|--------|
| **Live dashboard** | **Realtime DB** | `/devices/{deviceId}/live` | Real-time stream; device/harness writes here. |
| **Commands (calm/stop/config)** | **Realtime DB** | `/devices/{deviceId}/commands/latest` | ESP32 polls and executes; then deletes. |
| **DeviceId sync per user** | **Realtime DB** | `/userDevices/{uid}` | App writes when user sets Device ID. |
| **User profile, prefs, FCM** | **Firestore** | `users/{uid}` | User document and fields. |
| **Dog profile** | **Firestore** | `users/{uid}/profile/dog` | One dog per user in v1 (name, breed, age, weight). |
| **History** | **Firestore** | `devices/{deviceId}/history` | Query by time range; app reads. |
| **Alerts** | **Firestore** | `devices/{deviceId}/alerts` | Query by time; app reads. |
| **Auto-calm config** | **Firestore** | `devices/{deviceId}/config/autoCalm` | Load/save from Settings. |

So: **Firestore is used** for user data, dog profile, history, alerts, and device config because the app (and the spec) use it for those. You weren’t “told” in a single sentence — it’s how this codebase and the spec are structured: live + commands in RTDB, the rest in Firestore.

---

## 3. App vs “COMPLETE FIREBASE DATA STRUCTURE” spec

### Realtime Database (live)

- **Spec:** `/devices/{device_id}/live` with state, anxietyScore, confidence, etc.
- **App:** Same path, same fields; also allows `motionEnergy`, `motionVariance`, `protocol`, etc.
- **Your data:** Matches; no change needed.

### Commands

- **Spec:** Firestore `/devices/{device_id}/commands` with `cmd`, `protocol`, `intensity`, etc.
- **App:** **Realtime DB** `/devices/{deviceId}/commands/latest` (single doc: calm, stop, config). ESP32 is assumed to poll RTDB and clear after execution.
- So: **app uses RTDB for commands**, not Firestore. If the harness/backend was built for Firestore commands, it would need to be adapted to read from RTDB `commands/latest` (or we’d need to change the app to write to Firestore commands instead).

### Users and dog profile

- **Spec:** Firestore `/users/{uid}`, `/users/{uid}/dogs/{dogId}` (multiple dogs).
- **App:** Firestore `users/{uid}`, `users/{uid}/profile/dog` (single dog in v1).
- So: **same idea (Firestore)**; app uses one dog under `profile/dog` instead of a `dogs` subcollection.

### History and alerts

- **Spec:** Firestore `/devices/{device_id}/history`, `/devices/{device_id}/alerts`.
- **App:** Same: Firestore `devices/{deviceId}/history` and `devices/{deviceId}/alerts`. App reads; backend/device should write.

### Device config

- **Spec:** Firestore `/devices/{device_id}/config` (e.g. autoCalm).
- **App:** Firestore `devices/{deviceId}/config/autoCalm`. Matches.

---

## 4. Summary

- **Your RTDB live schema at `/devices/PB-001/live` matches** the app and spec; extra fields are fine.
- **Firestore is used** for user/dog profile, history, alerts, and config because the app (and spec) are designed that way.
- **Only structural difference:** commands are in **Realtime DB** in the app (`/devices/{id}/commands/latest`), not in Firestore; that’s intentional for the current ESP32 polling flow.
