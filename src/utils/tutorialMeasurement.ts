// src/utils/tutorialMeasurement.ts
// Measurement registry for tutorial spotlight positioning

type MeasurementCallback = () => Promise<{ x: number; y: number; width: number; height: number }>;

class TutorialMeasurementRegistry {
  private measurements: Map<string, MeasurementCallback> = new Map();

  register(stepId: string, callback: MeasurementCallback) {
    this.measurements.set(stepId, callback);
  }

  unregister(stepId: string) {
    this.measurements.delete(stepId);
  }

  async measure(stepId: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const callback = this.measurements.get(stepId);
    if (callback) {
      return await callback();
    }
    return null;
  }

  clear() {
    this.measurements.clear();
  }
}

export const tutorialMeasurementRegistry = new TutorialMeasurementRegistry();

