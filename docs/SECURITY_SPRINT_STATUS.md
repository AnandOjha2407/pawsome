# PawsomeBond — CYBER SECURITY HANDOUT — MOBILE APP

**Owner:** Bushra (React Native / Firebase App Layer)  
**DARYX Tech Inc.** — Pre-Trial Security Sprint — 3 Weeks  

**Job:** Secure the React Native app — authentication, token handling, Firebase communication, and command security. *(Firmware is handled separately.)*

---

### Colour legend (status)

| Colour | Meaning |
|--------|---------|
| <span style="color:#15803d;font-weight:600">Green</span> | **Implemented** in the app codebase (or satisfied without external console work) |
| <span style="color:#a16207;font-weight:600">Amber</span> | **Partial / different shape** — close to handout but path or storage differs; confirm with team |
| <span style="color:#b91c1c;font-weight:600">Red</span> | **Not implemented** in app **or** requires **your** Firebase / Google Cloud / QA / report action |

---

## 1. YOUR ROLE IN THE SECURITY FRAMEWORK

| Layer (Bushra owns) | Priority | Status |
|---------------------|----------|--------|
| **Firebase Auth** — Email/password auth working + token management | CRITICAL | <span style="color:#15803d">**Implemented:**</span> `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, Google sign-in, `onAuthStateChanged`. SDK persists session natively. <span style="color:#a16207">Optional explicit `getIdToken()` + Keychain mirror</span> <span style="color:#b91c1c">not in repo.</span> |
| **Command security** — Only logged-in owner can send commands to their vest | CRITICAL | <span style="color:#15803d">**Implemented:**</span> `assertRegisteredUserOwnsDevice`, `getCommandEnvelope`, RTDB writes only via `firebase.ts` helpers. |
| **Token storage** — Auth tokens stored securely (not in plain AsyncStorage) | HIGH | <span style="color:#15803d">**Implemented:**</span> No Firebase ID token stored in AsyncStorage by app. <span style="color:#b91c1c">**Not implemented:**</span> `react-native-keychain` (handout Task 3) — not in current `package.json`. |
| **API key protection** — Firebase config not exposed in public builds | HIGH | <span style="color:#b91c1c">**Needs your action:**</span> App Check + API key restrictions (Google Cloud) + publish rules. APK still contains `google-services.json` by design. |
| **Input validation** — All command inputs validated before sending | MEDIUM | <span style="color:#15803d">**Implemented:**</span> Ranges, config validation, device id checks, command `type` whitelist. |
| **Session management** — Auto logout, token expiry handling | MEDIUM | <span style="color:#15803d">**Implemented:**</span> `onAuthStateChanged`, root redirect to `/login` if no user. SDK handles token refresh. <span style="color:#a16207">Tabs do not force redirect on logout</span> (cold start uses `index`). |

---

## 2. FIRST — ANSWER THESE QUESTIONS TODAY

*⚠️ Needed before Firebase security rules can be deployed — share with the team ASAP.*

| Question | Why it matters | Your answer (PawsomeBond app) |
|----------|----------------|--------------------------------|
| Is Firebase email/password auth implemented? | Rules depend on auth being active | <span style="color:#15803d">**Yes.**</span> `FirebaseContext` + Login/SignUp. Enable Email/Password (and Google if used) in Firebase Console. |
| Does the app read data as a logged-in user? | If not, rules will lock out the app | <span style="color:#15803d">**Yes**</span> when a session exists; SDK attaches identity. `app/index.tsx` → `/login` if no user. `subscribeLiveState` skips if `auth().currentUser` is null. |
| Is each device linked to a user UID in the DB? | Required for per-device access control | <span style="color:#15803d">**Yes.**</span> `syncDeviceIdToBackend`: Firestore `users/{uid}.deviceId` + RTDB `userDevices/{uid}` = device id string. Pairing/Settings → `setDeviceId`. |
| Where are auth tokens currently stored? | Insecure storage = account takeover risk | <span style="color:#15803d">**Native Firebase Auth persistence**</span> — not copied into AsyncStorage by app code. <span style="color:#b91c1c">Keychain mirror not implemented.</span> |
| Does the app validate commands before sending? | Unvalidated commands can harm the dog | <span style="color:#15803d">**Yes.**</span> Validation + ownership before RTDB write; payload includes `type`, `timestamp`, `sentBy`. |

---

## 3. WEEK-BY-WEEK PLAN

### Week 1 — Authentication & Firebase Rules

**Task 1: Confirm Firebase Auth is active**  
Handout pattern: `signInWithEmailAndPassword` → optional `getIdToken()` → secure store.

| Check | Status |
|-------|--------|
| `auth().signInWithEmailAndPassword` exists and works | <span style="color:#15803d">Yes — `FirebaseContext.signIn`</span> |
| `getIdToken()` after sign-in | <span style="color:#a16207">Not explicitly called for Keychain; SDK manages tokens</span> |
| Tell team rules can be deployed | <span style="color:#b91c1c">**You** confirm on device + email/report team</span> |

**Task 2: Link device to user in Firebase**

| Check | Status |
|-------|--------|
| Handout example: `userDevices/${uid}/${deviceId}` = `true` | <span style="color:#a16207">**Different:**</span> app uses RTDB `userDevices/${uid}` = **string** device id + Firestore `users/{uid}.deviceId`. Align **deployed** RTDB rules with this shape (see `firebase/database.rules.json`). |
| Pairing / Settings triggers sync | <span style="color:#15803d">Yes — `setDeviceId` → `syncDeviceIdToBackend`</span> |

**Task 3: Secure token storage (`react-native-keychain`)**

| Check | Status |
|-------|--------|
| `npm install react-native-keychain` + store/clear ID token | <span style="color:#b91c1c">**Not implemented**</span> (removed from repo; add when you want native dep + rebuild). |

---

### Week 2 — Command Security & Input Validation

**Task 4: Secure command sending**  
Motors on a real dog — validate + authenticate.

| Check | Status |
|-------|--------|
| Logged-in user required | <span style="color:#15803d">Yes — `getCommandEnvelope` / ownership</span> |
| Valid command type | <span style="color:#15803d">Yes — `COMMAND_TYPES_WHITELIST`; CALM/STOP/STATUS + CONFIG for Settings</span> |
| `timestamp` (Unix seconds) + `sentBy` | <span style="color:#15803d">Yes — on every command write</span> |
| Handout path `/devices/${deviceId}/commands/latest` | <span style="color:#a16207">**Actual path:**</span> `/{deviceId}/commands/latest` at RTDB root (matches ESP32 pipeline). |

**Task 5: Protect Firebase config in APK**

| Measure | Status |
|---------|--------|
| Firebase App Check in app init | <span style="color:#b91c1c">**Not implemented**</span> (`@react-native-firebase/app-check` not in project) |
| API key restricted to package name | <span style="color:#b91c1c">**You:** Google Cloud Console</span> (`com.pawsomebond.app` / `com.bondai.doggpt`) |
| Security rules | <span style="color:#a16207">**Files in repo**</span> `firebase/` — <span style="color:#b91c1c">**you publish**</span> to Firebase |

---

### Week 3 — Session Management & Testing

**Task 6: Token expiry & auto logout**

| Check | Status |
|-------|--------|
| `onAuthStateChanged` | <span style="color:#15803d">Yes — `FirebaseContext`</span> |
| Navigate to Login when user null | <span style="color:#15803d">Root `app/index.tsx` → `/login`</span> |
| Every screen forces login after logout | <span style="color:#a16207">Not all routes; index gate on cold start</span> |

**Task 7: Test the full security flow**

| Scenario | Expected | Status |
|----------|----------|--------|
| 1. User A cannot read User B’s device data | FAIL for B | <span style="color:#b91c1c">**Manual test** + depends on **deployed** rules (owner-scoped vs auth-only)</span> |
| 2. Send command without logging in | FAIL | <span style="color:#15803d">Blocked in `firebase.ts` for Firebase path</span> |
| 3. Unknown command type | Rejected by firmware | <span style="color:#15803d">App only sends whitelisted types;</span> <span style="color:#b91c1c">firmware must reject unknown</span> |
| 4. Log out → access data → redirect login | Redirect | <span style="color:#a16207">Index on launch;</span> <span style="color:#b91c1c">full flow = **manual QA**</span> |

---

## 4. BUSHRA'S SECURITY CHECKLIST (from handout)

| Task | Week | Status |
|------|------|--------|
| Confirm Firebase Auth working — report to team | 1 | <span style="color:#a16207">Code ready</span> · <span style="color:#b91c1c">Report to team = TODO (you)</span> |
| Link device to user UID in Firebase on pairing | 1 | <span style="color:#15803d">**Done**</span> |
| Replace AsyncStorage with react-native-keychain | 1 | <span style="color:#b91c1c">**Not done**</span> |
| Add command validation before Firebase write | 2 | <span style="color:#15803d">**Done**</span> |
| Add timestamp to every command | 2 | <span style="color:#15803d">**Done**</span> |
| Enable Firebase App Check | 2 | <span style="color:#b91c1c">**Not done**</span> (app + Console) |
| Restrict Firebase API key to package name | 2 | <span style="color:#b91c1c">**You — Google Cloud**</span> |
| Implement auth state listener + auto logout | 3 | <span style="color:#15803d">**Listener + index redirect**</span> · <span style="color:#a16207">full “auto logout” UX on all routes optional</span> |
| Run full security test scenarios | 3 | <span style="color:#b91c1c">**TODO — manual QA**</span> |

---

## 5. ATTACK SCENARIOS YOU ARE DEFENDING AGAINST

| Attack | Risk to PawsomeBond | Your fix — status |
|--------|---------------------|-------------------|
| User A reads User B’s dog data | Privacy breach, loss of trust | <span style="color:#a16207">Device linking in app + **rules you deploy**;</span> owner-scoped rules <span style="color:#b91c1c">your choice in Console</span> |
| Logged-out user sends commands | Unauthorized motor on dog | <span style="color:#15803d">Auth + ownership before RTDB write</span> |
| Token stolen from AsyncStorage | Account takeover | <span style="color:#15803d">No ID token in AsyncStorage;</span> <span style="color:#b91c1c">Keychain not added</span> |
| APK decompiled for Firebase key | Attacker hits Firebase | <span style="color:#b91c1c">App Check + API restriction + rules — **you configure**</span> |
| Replay attack (old command) | Unwanted therapy | <span style="color:#15803d">Fresh `timestamp` each send;</span> firmware &lt; 30s |
| Unknown command type injected | Undefined vest behavior | <span style="color:#15803d">Whitelist + typed send helpers;</span> firmware validates |

**BLE note:** Therapy over BLE without Firebase can still occur in some flows — <span style="color:#a16207">product policy</span>, not fixed by rules alone.

---

## 6. HOW YOUR WORK CONNECTS TO THE FIRMWARE

Agreed RTDB payload (app sends — path `/{deviceId}/commands/latest`):

```json
{
  "type": "CALM",
  "timestamp": 1234567890,
  "sentBy": "user-uid-123"
}
```

| Field | Status |
|-------|--------|
| `type` CALM / STOP / STATUS (+ CONFIG for Settings) | <span style="color:#15803d">Implemented</span> |
| `timestamp` Unix seconds | <span style="color:#15803d">Implemented</span> |
| `sentBy` Firebase UID | <span style="color:#15803d">Implemented</span> |
| CALM extras: `protocol`, `intensity`, `duration` | <span style="color:#15803d">Implemented</span> |

Firmware will reject (handout):

| Rule | App side |
|------|----------|
| Unrecognized `type` | <span style="color:#15803d">Only whitelisted sends</span> |
| Timestamp older than 30 seconds | <span style="color:#15803d">Current time at send;</span> clock skew <span style="color:#a16207">edge case</span> |
| Invalid/missing device token | <span style="color:#b91c1c">App Check / server policy — not only app code</span> |

---

## 7. BEFORE PROTOTYPES SHIP — YOUR NONNEGOTIABLES

| # | Requirement | Status |
|---|-------------|--------|
| **5** | Firebase Auth confirmed working **and reported to team** | <span style="color:#a16207">Works in code</span> · <span style="color:#b91c1c">**You report**</span> |
| **6** | Device-to-user linking working on pairing screen | <span style="color:#15803d">**Yes**</span> (`setDeviceId`, Wi‑Fi flow, Settings) |
| **7** | Commands only sent by authenticated users | <span style="color:#15803d">**Yes**</span> for Firebase RTDB command path |

---

*3 weeks scope: app layer here; firmware separate. Together = full coverage when rules + App Check + QA are completed.*
