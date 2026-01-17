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
    try {
      const eventListeners = this.listeners[event] || [];
      // Use slice() to create a copy so we don't modify array during iteration
      eventListeners.slice().forEach((fn) => {
        try {
          if (fn && typeof fn === 'function') {
            fn(...args);
          }
        } catch (listenerError: any) {
          // Prevent listener errors from crashing the app
          console.warn(`Error in event listener for "${event}":`, listenerError?.message ?? listenerError);
        }
      });
    } catch (emitError: any) {
      // Prevent emit errors from crashing the app
      console.warn(`Error emitting event "${event}":`, emitError?.message ?? emitError);
    }
  }
}
