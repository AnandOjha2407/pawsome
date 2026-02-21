# Build & Configuration

## 1. EAS Build (Android)

**Yes.** This command is enough to build the app:

```bash
npx eas build -p android --profile preview
```

- Builds an **APK** (internal distribution) per `eas.json` → `preview.android.buildType: "apk"`.
- Uses your `app.config.js` and `google-services.json`.
- **First time:** run `npx eas login` and `npx eas build:configure` if needed.

For **production** (Play Store):

```bash
npx eas build -p android --profile production
```

---

## 2. What You Need to Provide / Check

### Firebase (required for auth, live data, commands)

| Item | Where | Notes |
|------|--------|--------|
| **google-services.json** | Project root (`doggpt/google-services.json`) | Already present. Ensure the **Android app** in Firebase Console has **package name** `com.pawsomebond.app` (must match `app.config.js` → `android.package`). If you created a new Firebase project, download this file and replace. |
| **GoogleService-Info.plist** | For iOS build | Only needed for `eas build -p ios`. Download from Firebase Console → Project settings → iOS app, add to `doggpt/` (or configure in app.config). |
| **Realtime Database** | Firebase Console | Create Realtime Database (e.g. region us-central1). Path used: `devices/{device_id}/live`. |
| **Firestore** | Firebase Console | Create Firestore DB. Collections: `users`, `devices/{id}/commands`, `history`, `alerts`, `config`. |
| **Auth** | Firebase Console | Enable **Email/Password** sign-in in Authentication → Sign-in method. |
| **Security rules** | Firebase Console | For production, set Auth-required rules for Realtime DB and Firestore so only logged-in users / device owners can read/write. |

### EAS / Expo

| Item | Where | Notes |
|------|--------|--------|
| **EAS project** | `app.config.js` → `extra.eas.projectId` | Already set (`383b6e8b-bd84-448c-96a1-f212946a0d6c`). If you use a different Expo account/project, run `eas init` and update. |
| **API_BASE** | `app.config.js` → `extra.API_BASE` | Currently `http://192.168.1.4:3000`. Only needed if you use a backend (e.g. chat). For the current app (Firebase + BLE only) you can leave it or remove from `extra` if unused. |

### No extra keys in code

- **Firebase** keys are in `google-services.json` (and iOS plist). Do **not** put API keys in `app.config.js` or code.
- **BLE** uses standard UUIDs (no keys).
- **FCM** uses the same Firebase project; token is saved to Firestore per user.

---

## 3. Summary Checklist

- [ ] Firebase Android app package name = `com.pawsomebond.app`, `google-services.json` in project root.
- [ ] Realtime Database + Firestore created; Auth Email/Password enabled.
- [ ] (Optional) Security rules for production.
- [ ] Run: `npx eas build -p android --profile preview`.

If anything fails (e.g. Firebase not found), fix the package name and re-download `google-services.json`, then rebuild.

---

## 4. "No firebase app DEFAULT has been created" / Login or Sign up fails

- **Expo Go:** Firebase Auth and Realtime DB use **native** modules. They **do not work in Expo Go**. You must use a **development build** or an **EAS-built APK**:
  - `npx expo run:android` (local dev build), or  
  - `npx eas build -p android --profile preview` (then install the APK).
- **Package name:** `google-services.json` must have `"package_name": "com.pawsomebond.app"` (it was fixed from `"app.config.js"`). If you added the Android app in Firebase with a different package, add an app with `com.pawsomebond.app` and replace `google-services.json`.
- **Initialization:** The app imports `@react-native-firebase/app` at startup so the default Firebase app exists before Auth is used. No need to call `firebase.initializeApp()` when using React Native Firebase with a dev build and a correct `google-services.json`.
