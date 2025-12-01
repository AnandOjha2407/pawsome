// src/ble/BLEManager.ts
type Listener = (...args: any[]) => void;

class SimpleEmitter {
  private listeners: Record<string, Listener[]> = {};

  on(event: string, fn: Listener) {
    (this.listeners[event] = this.listeners[event] || []).push(fn);
  }

  off(event: string, fn?: Listener) {
    if (!fn) {
      delete this.listeners[event];
      return;
    }
    this.listeners[event] = (this.listeners[event] || []).filter(
      (l) => l !== fn
    );
    if (this.listeners[event].length === 0) delete this.listeners[event];
  }

  emit(event: string, ...args: any[]) {
    (this.listeners[event] || []).slice().forEach((fn) => {
      try {
        fn(...args);
      } catch (e) {
        console.warn("Emitter listener error", e);
      }
    });
  }
}

/**
 * Rich mock BLE Manager for both Human & Dog dashboards
 * - Emits 'data' (realtime)
 * - Emits 'connected' / 'disconnected'
 * - Emits 'history' (7-day arrays + sleep summary) on manualFetch / sync
 * - Emits 'training_started' | 'training_stopped' | 'cue'
 * - Emits 'alert' for conditions (low battery / inactivity)
 *
 * Updated: now produces three coherent / relative scores:
 *  - bondScore (combined human+dog sync)
 *  - humanHealthScore
 *  - dogHealthScore
 *
 * Backwards-compatible fields (sleepScore/recoveryScore/strainScore) map to:
 *  - sleepScore -> bondScore
 *  - recoveryScore -> dogHealthScore
 *  - strainScore -> humanHealthScore
 */
class BLEManager extends SimpleEmitter {
  // connection & assignment
  isConnected = false;
  assignedProfile: "human" | "dog" | null = null;

  // common telemetry
  rssi = -55;

  // human-specific
  heartRate = 72;
  spO2 = 98;
  steps = 4500;
  battery = 80;
  activeMinutes = 34;
  activityPct = 0.42;
  calories = 220;

  // dog-specific
  dogHeartRate = 80;
  dogSpO2 = 98;
  dogSteps = 820;
  dogBattery = 85;
  restTime = 120;
  napDuration = 30;
  activityLevel: "low" | "medium" | "high" = "medium";
  harnessContact = true;
  dogCalories = 120;

  // history and sleep
  hrHistory: number[] = Array.from(
    { length: 7 },
    () => 60 + Math.floor(Math.random() * 40)
  );
  stepsHistory: number[] = Array.from(
    { length: 7 },
    () => 1000 + Math.floor(Math.random() * 6000)
  );
  restVsActiveHistory: { rest: number; active: number }[] = Array.from(
    { length: 7 },
    () => ({ rest: 600, active: 180 })
  );
  sleepSummary = { lastNight: { deep: 120, light: 240 }, quality: "Good" };

  // training sessions
  sessions: {
    id: string;
    date: string;
    durationMin: number;
    notes?: string;
  }[] = [];

  // firmware + logs
  firmwareVersion = "mock-1.0.0";
  logs: string[] = [];

  // simulation
  mockMode = true;
  private _simInterval?: any;
  private _simTarget: "human" | "dog" | "both" = "human";
  private _trainingActive = false;

  // SCORES (single-source-of-truth)
  bondScore = 0; // combined human+dog sync
  humanHealthScore = 0;
  dogHealthScore = 0;

  // Backwards compatibility (legacy names)
  sleepScore = 0;
  recoveryScore = 0;
  strainScore = 0;

  constructor() {
    super();
    this.logs.push(
      `[${new Date().toISOString()}] BLEManager initialized (mockMode=${
        this.mockMode
      })`
    );
  }

  // -------------------------------------------------------------
  // CONNECTION
  // -------------------------------------------------------------
  connect() {
    this.isConnected = true;
    this.emit("connected");
    this.logs.push(`[${new Date().toISOString()}] Connected`);
  }

  disconnect() {
    this.isConnected = false;
    this.emit("disconnected");
    this.logs.push(`[${new Date().toISOString()}] Disconnected`);
    this.stopSimulation();
  }

  // -------------------------------------------------------------
  // SIMULATION CONTROL
  // -------------------------------------------------------------
  simulateData(target?: "human" | "dog" | "both") {
    if (!this.mockMode) return;
    if (this._simInterval) return;

    this._simTarget = target ?? this.assignedProfile ?? "human";
    this.logs.push(
      `[${new Date().toISOString()}] simulateData started (target=${
        this._simTarget
      })`
    );

    this._simInterval = setInterval(() => {
      this._simulateTick(this._simTarget);
    }, 3000);
  }

  stopSimulation() {
    if (this._simInterval) {
      clearInterval(this._simInterval);
      delete this._simInterval;
      this.logs.push(`[${new Date().toISOString()}] Simulation stopped`);
    }
  }

  // -------------------------------------------------------------
  // INTERNAL HELPERS (simple smoothing / mapping)
  // -------------------------------------------------------------
  private avg(arr: number[]) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private clamp01(v: number) {
    return Math.max(0, Math.min(1, v));
  }

  private mapTo100(v: number, inMin: number, inMax: number) {
    // linear map to 0..100
    const t = (v - inMin) / (inMax - inMin);
    return Math.round(this.clamp01(t) * 100);
  }

  // -------------------------------------------------------------
  // SINGLE SIM TICK
  // -------------------------------------------------------------
  private _simulateTick(target: "human" | "dog" | "both") {
    // update common
    this.rssi = -60 + Math.floor(Math.random() * 10);

    // human: small random walk (bounded)
    this.heartRate = Math.max(
      45,
      Math.min(160, Math.round(this.heartRate + (Math.random() * 6 - 3)))
    );
    this.spO2 = Math.max(
      90,
      Math.min(100, Math.round(this.spO2 + (Math.random() > 0.92 ? -1 : 0)))
    );
    this.steps += Math.floor(Math.random() * 30);
    this.battery = Math.max(1, this.battery - (Math.random() < 0.02 ? 1 : 0));
    this.activeMinutes += Math.random() > 0.8 ? 1 : 0;
    this.activityPct = Math.min(1, this.activityPct + Math.random() * 0.02);
    this.calories = Math.round(this.calories + Math.random() * 5);

    // dog: small random walk (bounded)
    this.dogHeartRate = Math.max(
      50,
      Math.min(180, Math.round(this.dogHeartRate + (Math.random() * 6 - 3)))
    );
    this.dogSpO2 = Math.max(
      90,
      Math.min(100, Math.round(this.dogSpO2 + (Math.random() > 0.95 ? -1 : 0)))
    );
    this.dogSteps += Math.floor(Math.random() * 25);
    this.dogBattery = Math.max(
      1,
      this.dogBattery - (Math.random() < 0.02 ? 1 : 0)
    );
    if (Math.random() > 0.9) {
      const list = ["low", "medium", "high"] as const;
      this.activityLevel = list[Math.floor(Math.random() * list.length)];
    }
    this.restTime += Math.random() > 0.85 ? 2 : 0;
    this.napDuration += Math.random() > 0.9 ? 5 : 0;
    this.harnessContact = Math.random() > 0.01;
    this.dogCalories = Math.round(this.dogCalories + Math.random() * 3);

    // history upkeep (occasional)
    if (Math.random() > 0.92) {
      this.hrHistory.shift();
      this.hrHistory.push(50 + Math.floor(Math.random() * 60));

      this.stepsHistory.shift();
      this.stepsHistory.push(200 + Math.floor(Math.random() * 6500));

      this.restVsActiveHistory.shift();
      this.restVsActiveHistory.push({
        rest: 500 + Math.floor(Math.random() * 300),
        active: 120 + Math.floor(Math.random() * 180),
      });
    }

    // alerts
    if (this.battery < 15)
      this.emit("alert", {
        type: "low_battery",
        target: "human",
        battery: this.battery,
      });
    if (this.dogBattery < 15)
      this.emit("alert", {
        type: "low_battery",
        target: "dog",
        battery: this.dogBattery,
      });
    if (this.activityLevel === "low" && Math.random() > 0.995) {
      this.emit("alert", { type: "inactivity", target: "dog" });
    }

    // -------------------------------------------------------------
    // SCORES / HEALTH METRICS (relative & coherent)
    // -------------------------------------------------------------
    // Simulate HRV-ish values (ms) for human & dog for scoring (mocked)
    const humanHRV = 20 + Math.floor(Math.random() * 60); // 20..80 ms
    const dogHRV = 15 + Math.floor(Math.random() * 50); // 15..65 ms

    // Human health: combine HR (resting preference), HRV, SpO2
    // - Preferred resting HR mapped 40..100 => higher score if lower HR
    const humanHRScore = this.mapTo100(100 - (this.heartRate - 40), 0, 100); // inverse HR
    const humanHRVScore = this.mapTo100(humanHRV, 10, 80);
    const humanO2Score = this.mapTo100(this.spO2, 92, 100);
    // weighted combine
    this.humanHealthScore = Math.round(
      humanHRScore * 0.4 + humanHRVScore * 0.35 + humanO2Score * 0.25
    );

    // Dog health: combine dog HR, dog HRV, dog SpO2
    const dogHRScore = this.mapTo100(100 - (this.dogHeartRate - 40), 0, 100);
    const dogHRVScore = this.mapTo100(dogHRV, 10, 70);
    const dogO2Score = this.mapTo100(this.dogSpO2, 92, 100);
    this.dogHealthScore = Math.round(
      dogHRScore * 0.45 + dogHRVScore * 0.25 + dogO2Score * 0.3
    );

    // Bond score: measure synchrony and calm alignment between human & dog
    // Simple approach:
    //  - HR difference (smaller diff -> better sync)
    //  - both low strain (both health scores high)
    //  - activity alignment (both moving or both resting)
    const hrDiff = Math.abs(this.heartRate - this.dogHeartRate); // lower is better
    const hrSyncScore = this.mapTo100(Math.max(0, 120 - hrDiff), 20, 120); // map smaller diff to higher
    const healthAvg = (this.humanHealthScore + this.dogHealthScore) / 2;
    // activity alignment: if both activityPct/dog steps relative indicate similar state
    const humanActive = this.activityPct > 0.35 || this.activeMinutes > 10;
    const dogActive =
      this.activityLevel === "high" || this.dogSteps % 1000 > 200;
    const activityMatch = humanActive === dogActive ? 100 : 50;

    // combine into bond (0..100)
    this.bondScore = Math.round(
      (this.humanHealthScore + this.dogHealthScore) / 2
    );

    // Backwards compatibility
    this.sleepScore = this.bondScore;
    this.recoveryScore = this.dogHealthScore;
    this.strainScore = this.humanHealthScore;

    // -------------------------------------------------------------
    // PAYLOADS (SAME SCORES FOR HUMAN + DOG where appropriate)
    // -------------------------------------------------------------
    const humanPayload = {
      profile: "human",
      heartRate: this.heartRate,
      spO2: this.spO2,
      steps: this.steps,
      battery: this.battery,
      activeMinutes: this.activeMinutes,
      activityPct: this.activityPct,
      calories: this.calories,
      rssi: this.rssi,
      firmwareVersion: this.firmwareVersion,

      // scores
      bondScore: this.bondScore,
      humanHealthScore: this.humanHealthScore,
      dogHealthScore: this.dogHealthScore,

      // legacy
      sleepScore: this.sleepScore,
      recoveryScore: this.recoveryScore,
      strainScore: this.strainScore,
    };

    const dogPayload = {
      profile: "dog",
      activityLevel: this.activityLevel,
      steps: this.dogSteps,
      restTime: this.restTime,
      napDuration: this.napDuration,
      battery: this.dogBattery,
      harnessContact: this.harnessContact,
      calories: this.dogCalories,
      rssi: this.rssi,
      firmwareVersion: this.firmwareVersion,

      // dog vitals
      dogHeartRate: this.dogHeartRate,
      dogSpO2: this.dogSpO2,

      // scores
      bondScore: this.bondScore,
      humanHealthScore: this.humanHealthScore,
      dogHealthScore: this.dogHealthScore,

      // legacy
      sleepScore: this.sleepScore,
      recoveryScore: this.recoveryScore,
      strainScore: this.strainScore,
    };

    // emit
    if (target === "human") this.emit("data", humanPayload);
    else if (target === "dog") this.emit("data", dogPayload);
    else {
      this.emit("data", humanPayload);
      this.emit("data", dogPayload);
    }

    this.logs.push(`[${new Date().toISOString()}] emit data target=${target}`);
  }

  // -------------------------------------------------------------
  // HISTORY + MANUAL FETCH
  // -------------------------------------------------------------
  manualFetch() {
    const target = this.assignedProfile ?? "human";
    this._simulateTick(target);

    this.emit("history", {
      hrHistory: this.hrHistory.slice(),
      stepsHistory: this.stepsHistory.slice(),
      restVsActiveHistory: this.restVsActiveHistory.slice(),
      sleepSummary: this.sleepSummary,
    });

    this.logs.push(
      `[${new Date().toISOString()}] manualFetch -> history emitted`
    );
  }

  // -------------------------------------------------------------
  // TRAINING
  // -------------------------------------------------------------
  startTrainingSession(meta?: { type?: string }) {
    if (this._trainingActive) return;
    this._trainingActive = true;

    const session = {
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      durationMin: 0,
      notes: meta?.type ?? "training",
    };

    this.sessions.unshift(session);
    this.emit("training_started", session);
    this.logs.push(
      `[${new Date().toISOString()}] training_started ${session.id}`
    );
  }

  stopTrainingSession() {
    if (!this._trainingActive) return;
    this._trainingActive = false;

    const session = this.sessions[0];
    if (session) session.durationMin = 10 + Math.floor(Math.random() * 40);

    this.emit("training_stopped", session);
    this.logs.push(
      `[${new Date().toISOString()}] training_stopped ${session?.id}`
    );
  }

  sendCue(type: "vibrate" | "beep" | "tone" = "vibrate") {
    this.emit("cue", { type });
    this.logs.push(`[${new Date().toISOString()}] cue ${type}`);
  }

  // -------------------------------------------------------------
  // DEBUG / GETTERS
  // -------------------------------------------------------------
  getState() {
    return {
      isConnected: this.isConnected,
      assignedProfile: this.assignedProfile,

      human: {
        heartRate: this.heartRate,
        spO2: this.spO2,
        steps: this.steps,
        battery: this.battery,
        activeMinutes: this.activeMinutes,
        activityPct: this.activityPct,
        calories: this.calories,
      },

      dog: {
        dogHeartRate: this.dogHeartRate,
        dogSpO2: this.dogSpO2,
        steps: this.dogSteps,
        battery: this.dogBattery,
        restTime: this.restTime,
        napDuration: this.napDuration,
        activityLevel: this.activityLevel,
        harnessContact: this.harnessContact,
        calories: this.dogCalories,
      },

      hrHistory: this.hrHistory.slice(),
      stepsHistory: this.stepsHistory.slice(),
      sleepSummary: this.sleepSummary,
      sessions: this.sessions.slice(0, 10),

      bondScore: this.bondScore,
      humanHealthScore: this.humanHealthScore,
      dogHealthScore: this.dogHealthScore,

      sleepScore: this.sleepScore,
      recoveryScore: this.recoveryScore,
      strainScore: this.strainScore,

      logs: this.logs.slice(-100),
    };
  }

  emitLogs() {
    this.emit("logs", this.getState().logs);
  }

  assignProfile(profile: "human" | "dog") {
    this.assignedProfile = profile;
    this.logs.push(`[${new Date().toISOString()}] assignedProfile=${profile}`);
    this.emit("assigned", { profile });
  }

  setMockMode(on: boolean) {
    this.mockMode = on;
    this.logs.push(`[${new Date().toISOString()}] mockMode=${on}`);
    if (!on) this.stopSimulation();
  }

  seedHistory({
    hr,
    steps,
    restVsActive,
    sleep,
  }: {
    hr?: number[];
    steps?: number[];
    restVsActive?: any[];
    sleep?: any;
  }) {
    if (hr) this.hrHistory = hr.slice();
    if (steps) this.stepsHistory = steps.slice();
    if (restVsActive) this.restVsActiveHistory = restVsActive.slice();
    if (sleep) this.sleepSummary = sleep;

    this.logs.push(`[${new Date().toISOString()}] seedHistory called`);
  }
}

export const bleManager = new BLEManager();
