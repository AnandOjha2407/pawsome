# PawsomeBond App — Testing Guide

Step-by-step checklist for the testing team to verify app behaviour. Use this on **preview/production builds** (APK) or in **development**.

---

## 1. App launch

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Open the app | Splash/loading screen appears briefly |
| 1.2 | Wait for load | If not logged in: **Login** screen. If logged in but no device: **Dog Profile**. If logged in with device: **Dashboard** |

**Pass:** App does not crash; one of Login, Dog Profile, or Dashboard appears.

---

## 2. Authentication

### 2.1 Skip login (quick test path)

| Step | Action | Expected |
|------|--------|----------|
| 2.1.1 | On Login screen, tap **"Skip login (for testing)"** | Anonymous sign-in runs |
| 2.1.2 | Wait | Redirect to **Dog Profile** (onboarding) |

**Pass:** No crash; Dog Profile screen shows.

### 2.2 Email / password login

| Step | Action | Expected |
|------|--------|----------|
| 2.2.1 | Enter valid email and password | Fields accept input |
| 2.2.2 | Tap **Sign in** | Loading then redirect to **Dog Profile** or **Dashboard** |
| 2.2.3 | Enter wrong password and tap Sign in | Error message; no crash |

**Pass:** Valid login redirects; invalid login shows error and does not crash.

### 2.3 Sign up

| Step | Action | Expected |
|------|--------|----------|
| 2.3.1 | On Login, tap **Sign up** (or link to sign up) | **Sign up** screen opens |
| 2.3.2 | Enter email, password, confirm password | Fields accept input |
| 2.3.3 | Tap **Sign up** | Account created; redirect to **Dog Profile** or **Dashboard** |

**Pass:** Sign up completes and redirects; no crash.

---

## 3. Onboarding

### 3.1 Dog Profile

| Step | Action | Expected |
|------|--------|----------|
| 3.1.1 | On Dog Profile, leave name empty and tap **Continue** | Alert: "Please enter your dog's name." |
| 3.1.2 | Enter **Name** (required), optionally Breed, Age, Weight | Data is accepted |
| 3.1.3 | Tap **Continue** | Profile saved; navigate to **Pair** (device pairing) |
| 3.1.4 | (Optional) Tap **← Back to login** | Sign out and return to **Login** |

**Pass:** Validation works; save succeeds; navigation to Pair and Back to login work; no crash.

### 3.2 Device pairing (Pair screen)

| Step | Action | Expected |
|------|--------|----------|
| 3.2.1 | On Pair screen | Pairing UI is visible (scan / list or instructions) |
| 3.2.2 | Tap **"Continue to WiFi setup"** | Navigate to **WiFi** screen |

**Pass:** Screen loads; button navigates to WiFi; no crash.

### 3.3 WiFi setup

| Step | Action | Expected |
|------|--------|----------|
| 3.3.1 | On WiFi screen | SSID and Password fields (optional) and **Finish** button visible |
| 3.3.2 | Tap **Finish** (with or without entering WiFi) | Device ID is set (paired vest or mock); navigate to **Dashboard** |

**Pass:** Finish completes; app goes to Dashboard; no crash.

---

## 4. Main app (tabs)

After onboarding you should be on **Dashboard** with bottom tabs: **Dashboard**, **Calm**, **History**, **Settings**.

### 4.1 Dashboard

| Step | Action | Expected |
|------|--------|----------|
| 4.1.1 | Open **Dashboard** tab | Screen loads; dog/device state or placeholder visible |
| 4.1.2 | Observe live state (if device or mock) | Anxiety score, state (e.g. CALM, ANXIOUS), battery, etc. show or show "—" when no data |

**Pass:** Dashboard renders; no crash; missing data shows placeholders (e.g. "—").

### 4.2 Calm

| Step | Action | Expected |
|------|--------|----------|
| 4.2.1 | Open **Calm** tab | Calm / therapy screen loads |
| 4.2.2 | Tap any "Start calm" / therapy action (if shown) | Command is sent or mock feedback; no crash |

**Pass:** Calm screen works; actions do not crash.

### 4.3 History

| Step | Action | Expected |
|------|--------|----------|
| 4.3.1 | Open **History** tab | List loads (sessions/alerts or empty state) |
| 4.3.2 | Scroll if there are many items | List scrolls; no crash |

**Pass:** History loads and scrolls; empty state acceptable; no crash.

### 4.4 Settings

| Step | Action | Expected |
|------|--------|----------|
| 4.4.1 | Open **Settings** tab | Settings screen with sections (e.g. Account, Device, Calibration) |
| 4.4.2 | Scroll through sections | Device ID, firmware, calibration, WiFi status, etc. visible or "—" |
| 4.4.3 | Tap **Sign out** (if present) | Sign out; return to **Login** |
| 4.4.4 | (Optional) Tap **"Use mock device (development)"** | Alert "Using mock data for development."; dashboard/history use mock data |

**Pass:** Settings load; sign out works; mock device option works; no crash.

---

## 5. Mock data testing (no real device)

Use this path when you **do not have a physical vest** to confirm the app still works with mock data.

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | **Skip login** → **Dog Profile** → enter name → **Continue** | To Pair |
| 5.2 | **Continue to WiFi setup** | To WiFi |
| 5.3 | Tap **Finish** (do not pair a device) | App sets mock device ID and opens **Dashboard** |
| 5.4 | On Dashboard | Mock live state (e.g. anxiety score, state) is shown |
| 5.5 | Open **History** | Mock history entries appear |
| 5.6 | Open **Calm** | Calm actions work with mock (no real device) |

**Alternative:** From **Settings**, tap **"Use mock device (development)"** to switch to mock data after already being in the app.

**Pass:** Full flow without device completes; dashboard, history, and calm use mock data; no crash.

---

## 6. Notifications (if enabled)

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | When prompted for notifications | Allow or deny; app does not crash |
| 6.2 | If allowed, receive a test notification and tap it | App opens to Dashboard or Calm as intended |

**Pass:** Permission flow and notification open behaviour work; no crash.

---

## 7. Regression / stability

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Rapidly switch tabs (Dashboard → Calm → History → Settings) several times | No crash; screens remain responsive |
| 7.2 | Leave app in background, then reopen | App resumes; no crash |
| 7.3 | Sign out from Settings, then sign in again (or skip login) | Flow returns to onboarding or dashboard as expected |

**Pass:** No crashes; app remains stable.

---

## Quick reference — user flows

- **Not logged in:** Open app → Login (or Sign up) → Dog Profile → Pair → WiFi → Finish → Dashboard.
- **Quick test (no device):** Skip login → Dog Profile (name + Continue) → Pair → Continue to WiFi → Finish → Dashboard (mock data).
- **Already set up:** Open app → Dashboard (or last tab).

---

## Reporting issues

When something fails, please note:

1. **Step number** (e.g. "3.1.3")
2. **Action** you took
3. **Expected** vs **actual** (e.g. "Expected: go to Pair. Actual: app crashed.")
4. **Device / OS** (e.g. Android 12, build type: preview/production)
5. **Logged in?** (Skip / email) and **device** (mock or real vest, if applicable)
