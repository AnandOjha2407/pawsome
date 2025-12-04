type Listener = (...args: any[]) => void;

export default class SimpleEmitter {
  private listeners: Record<string, Listener[]> = {};

  on(event: string, fn: Listener) {
    (this.listeners[event] = this.listeners[event] || []).push(fn);
  }

  off(event: string, fn?: Listener) {
    if (!fn) return delete this.listeners[event];
    this.listeners[event] = (this.listeners[event] || []).filter((l) => l !== fn);
  }

  emit(event: string, ...args: any[]) {
    (this.listeners[event] || []).slice().forEach((fn) => fn(...args));
  }
}
