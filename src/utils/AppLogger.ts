/**
 * Persistent debug and crash logging.
 * Writes to /Download/app_logs.txt (Android) when allowed; else app private storage.
 * Use exportLogsToShare() to save a copy to Download via the system share sheet.
 * Format: YYYY-MM-DD HH:mm:ss LEVEL Message
 * Levels: INFO, WARN, ERROR, CRASH
 */

import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "CRASH";

const LOG_FILE_NAME = "app_logs.txt";

/**
 * Log file path. Android: /storage/emulated/0/Download/app_logs.txt for PC/ZArchiver access.
 */
function getLogFilePath(): string {
  if (Platform.OS === "android") {
    const downloadDir = "/storage/emulated/0/Download";
    return `${downloadDir}/${LOG_FILE_NAME}`;
  }
  const base = FileSystem.documentDirectory ?? "";
  if (!base) return "";
  const normalized = base.endsWith("/") ? base : base + "/";
  return normalized + LOG_FILE_NAME;
}

let logFilePath: string = "";
let useFallbackPath = false;
let writeQueue: Promise<void> = Promise.resolve();
let initialized = false;

/** Current screen path for crash reports (set from root layout). */
let currentScreen: string = "";

function getFallbackPath(): string {
  const base = FileSystem.documentDirectory ?? "";
  if (!base) return "";
  const normalized = base.endsWith("/") ? base : base + "/";
  return normalized + LOG_FILE_NAME;
}

function ensurePath(): string {
  if (!logFilePath) logFilePath = getLogFilePath();
  if (useFallbackPath) return getFallbackPath();
  return logFilePath;
}

/** Format: 2026-03-06 13:22:10 */
function formatTimestamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${M}-${D} ${h}:${m}:${s}`;
}

/** Single line: 2026-03-06 13:22:10 INFO App started */
function formatLine(level: LogLevel, message: string): string {
  const ts = formatTimestamp();
  return `${ts} ${level} ${message}\n`;
}

const MAX_LOG_BYTES = 512 * 1024;

function byteLength(str: string): number {
  if (typeof (global as any).Buffer !== "undefined") {
    return (global as any).Buffer.byteLength(str, "utf8");
  }
  return new TextEncoder().encode(str).length;
}

async function appendToFile(line: string): Promise<void> {
  const path = ensurePath();
  if (!path) return;

  const doWrite = async () => {
    let pathToUse = useFallbackPath ? getFallbackPath() : path;
    try {
      const info = await FileSystem.getInfoAsync(pathToUse, { size: true }).catch(() => null);
      const exists = info?.exists ?? false;
      let content = line;
      if (exists && info?.size != null) {
        const existing = await FileSystem.readAsStringAsync(pathToUse, {
          encoding: FileSystem.EncodingType.UTF8,
        }).catch(() => "");
        content = existing + line;
        const sizeBytes = byteLength(content);
        if (sizeBytes > MAX_LOG_BYTES) {
          const lines = content.split("\n");
          let trimmed = "";
          let len = 0;
          for (let i = lines.length - 1; i >= 0; i--) {
            const part = (i === 0 ? "" : "\n") + lines[i];
            if (len + byteLength(part) > MAX_LOG_BYTES) break;
            trimmed = part + trimmed;
            len += byteLength(part);
          }
          content = trimmed || line;
        }
      }
      await FileSystem.writeAsStringAsync(pathToUse, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (e) {
      if (!useFallbackPath) {
        useFallbackPath = true;
        pathToUse = getFallbackPath();
        try {
          const info = await FileSystem.getInfoAsync(pathToUse, { size: true }).catch(() => null);
          const exists = info?.exists ?? false;
          let content = line;
          if (exists && info?.size != null) {
            const existing = await FileSystem.readAsStringAsync(pathToUse, {
              encoding: FileSystem.EncodingType.UTF8,
            }).catch(() => "");
            content = existing + line;
          }
          await FileSystem.writeAsStringAsync(pathToUse, content, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        } catch (_e2) {
          if (__DEV__) console.warn("[AppLogger] Failed to write log file");
        }
      }
    }
  };

  writeQueue = writeQueue.then(doWrite).catch(() => {});
  await writeQueue;
}

function writeLog(level: LogLevel, message: string): void {
  const line = formatLine(level, message);
  appendToFile(line);
  if (__DEV__) console.log(`[AppLogger] ${level} ${message}`);
}

export function info(message: string): void {
  writeLog("INFO", message);
}

export function warn(message: string): void {
  writeLog("WARN", message);
}

export function error(message: string, err?: unknown): void {
  let msg = message;
  if (err instanceof Error) {
    msg += ` | ${err.name}: ${err.message}`;
    if (err.stack) msg += ` | ${err.stack.replace(/\n/g, " ")}`;
  } else if (err != null) {
    msg += ` | ${String(err)}`;
  }
  writeLog("ERROR", msg);
}

/**
 * Log a crash with message, stack trace, and current screen.
 * Used by the global crash handler.
 */
export function crash(message: string, err?: unknown): void {
  let msg = message;
  if (err instanceof Error) {
    msg += ` | ${err.message}`;
    if (err.stack) msg += ` | Stack: ${err.stack.replace(/\n/g, " ")}`;
  } else if (err != null) {
    msg += ` | ${String(err)}`;
  }
  if (currentScreen) msg += ` | Screen: ${currentScreen}`;
  writeLog("CRASH", msg);
}

export function getLogPath(): string {
  return ensurePath();
}

const EXPORT_FILE_NAME = "app_logs_export.txt";

/**
 * Export the current log file so you can save it to Download (or anywhere).
 * Opens the share sheet: choose "Save to device" / "Files" and pick the Download folder
 * so the file appears when the phone is connected to a PC.
 */
export async function exportLogsToShare(): Promise<{ success: boolean; message: string }> {
  try {
    const path = ensurePath();
    if (!path) return { success: false, message: "Log path not available" };

    const exists = await FileSystem.getInfoAsync(path, { size: false }).then((i) => i.exists).catch(() => false);
    let content = "";
    if (exists) {
      content = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 }).catch(() => "");
    }
    if (!content.trim()) content = "(No log entries yet.)\n";

    const exportPath = `${FileSystem.documentDirectory ?? ""}${EXPORT_FILE_NAME}`;
    await FileSystem.writeAsStringAsync(exportPath, content, { encoding: FileSystem.EncodingType.UTF8 });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return { success: false, message: "Sharing is not available on this device" };

    await Sharing.shareAsync(exportPath, {
      mimeType: "text/plain",
      dialogTitle: "Save app logs (choose Download to find on PC)",
    });
    return { success: true, message: "Use 'Save to device' or 'Files' and pick Download folder to find the file when connected to PC." };
  } catch (e: any) {
    return { success: false, message: e?.message ?? String(e) };
  }
}

/**
 * Set current screen path for crash reports. Call from root layout when route changes.
 */
export function setCurrentScreen(screen: string): void {
  currentScreen = screen || "";
}

/**
 * Setup global handlers for uncaught exceptions and unhandled promise rejections.
 * CRASH entries include error message, stack trace, and current screen.
 */
export function setupGlobalHandlers(): void {
  if (initialized) return;
  initialized = true;

  const logCrash = (label: string, err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    crash(`${label}: ${msg}`, err);
  };

  const originalHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
  if (typeof (global as any).ErrorUtils?.setGlobalHandler === "function") {
    (global as any).ErrorUtils.setGlobalHandler((err: unknown, isFatal?: boolean) => {
      logCrash(isFatal ? "FATAL" : "Uncaught", err);
      if (typeof originalHandler === "function") {
        originalHandler(err, isFatal);
      }
    });
  }

  const rejectionHandler = (event: PromiseRejectionEvent | { reason?: unknown }) => {
    const reason = "reason" in event ? event.reason : (event as any).detail?.reason;
    logCrash("Unhandled promise rejection", reason ?? "Unknown");
  };

  if (typeof global !== "undefined") {
    (global as any).onunhandledrejection = rejectionHandler;
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("unhandledrejection", rejectionHandler as EventListener);
  }

  info("App logger initialized");
}

export default {
  info,
  warn,
  error,
  crash,
  getLogPath,
  setCurrentScreen,
  setupGlobalHandlers,
  exportLogsToShare,
};
