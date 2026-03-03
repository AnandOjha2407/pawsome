# Firebase setup for real data (pawsomebond-464d2)

Do this in **Firebase Console** → project **pawsomebond-464d2**.

**Rule/index copies:** The same rules and indexes are in **`doggpt/firebase/`** (firestore.rules, database.rules.json, firestore.indexes.json). Paste from there or from this doc into the Console.

---

## 1. Enable services

- **Authentication** → Sign-in method: enable **Email/Password** and **Google**.
- **Build** → **Firestore Database** → Create database (choose region, start in **test mode** then replace with rules below).
- **Build** → **Realtime Database** → Create database (same region as Firestore if possible). Use the default URL (e.g. `https://pawsomebond-464d2-default-rtdb.firebaseio.com`).

---

## 2. Firestore rules

In **Firestore** → **Rules**, replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users: only the signed-in user can read/write their own doc and subcollections
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /{subcollection}/{doc} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    // Devices: app reads/writes by deviceId (e.g. PB-001). Authenticated users can read/write.
    match /devices/{deviceId} {
      allow read, write: if request.auth != null;
      match /{subcollection}/{doc} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

Publish the rules.

---

## 3. Realtime Database rules

In **Realtime Database** → **Rules**, replace with:

```json
{
  "rules": {
    "userDevices": {
      "$uid": {
        ".read": "auth != null && auth.uid == $uid",
        ".write": "auth != null && auth.uid == $uid"
      }
    },
    "devices": {
      "$deviceId": {
        ".read": "auth != null",
        ".write": "auth != null",
        "live": {
          ".read": "auth != null",
          ".write": "true"
        },
        "commands": {
          ".read": "auth != null",
          ".write": "auth != null"
        }
      }
    }
  }
}
```

- **userDevices/{uid}**: only that user can read/write (app syncs deviceId).
- **devices/{deviceId}/live**: app reads; **`.write": "true"`** lets your harness/backend (or a script) write without auth. If the harness uses Firebase Auth, change to `"auth != null"`.
- **devices/{deviceId}/commands**: app writes commands; only authenticated users.

Publish the rules.

---

## 4. Check app config

- **android/app/google-services.json** has `project_id`: **pawsomebond-464d2** (already set).
- In the app: **Settings** → set **Device ID** to e.g. **PB-001** and tap **Save Device ID** so the app subscribes to `/devices/PB-001/live` and writes to `/devices/PB-001/commands/latest`.

---

## 5. Where real data comes from

| Data | Source |
|------|--------|
| Dog profile, user prefs | Firestore (`users/{uid}`, `users/{uid}/profile/dog`) — app reads/writes. |
| Live harness state | Realtime DB `devices/PB-001/live` — **harness or your backend must write here** (e.g. every 10s). The app only reads. |
| Commands (calm/stop/config) | Realtime DB `devices/PB-001/commands/latest` — app writes; harness/backend reads and clears. |
| History / alerts | Firestore `devices/{deviceId}/history` and `alerts` — app reads; your backend or device pipeline should write. |

If **live** or **history/alerts** stay empty, the app is correct — something else (harness firmware or backend) must write to those paths.
