# Firebase rules and indexes (project: pawsomebond-464d2)

These files are **reference copies**. They are not auto-deployed. Deploy them from **Firebase Console** so the app can use real data.

- **firestore.rules** — Paste in Firestore → Rules → Publish. Allows users to read/write their own `users/{uid}` and `profile/dog`; authenticated read/write to `devices/{deviceId}`.
- **firestore.indexes.json** — In Firestore → Indexes you can add composite indexes for `history` and `alerts` (timestamp DESC) if needed for queries.
- **database.rules.json** — Paste in Realtime Database → Rules. Allows app to read `devices/{deviceId}/live` and write commands; `live` write is open so harness/backend can write.

Your app lives in **doggpt/** (this folder’s parent). The app uses **android/app/google-services.json** to connect to the Firebase project.
