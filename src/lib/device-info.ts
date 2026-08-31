// ---------------------------------------------------------------------------
// device-info.ts — On-device capability detection via browser APIs and
// DroidBridge. Provides system info the AI can reference when helping users.
// ---------------------------------------------------------------------------

import { getDroid } from "./bridge";

export interface DeviceInfo {
  platform: string;
  userAgent: string;
  cpuCores: number;
  memoryGB: number;
  language: string;
  connectionType: string;
  isStandalone: boolean;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  hasSpeechRecognition: boolean;
  hasNotification: boolean;
  storageEstimate?: { usage: number; quota: number };
}

/** Gather device capabilities from browser APIs. */
export function getDeviceInfo(): DeviceInfo {
  const nav = typeof navigator !== "undefined" ? navigator : null;

  const info: DeviceInfo = {
    platform: nav?.platform || "unknown",
    userAgent: nav?.userAgent || "unknown",
    cpuCores: (nav as Navigator & { hardwareConcurrency?: number })?.hardwareConcurrency || 0,
    memoryGB: (nav as Navigator & { deviceMemory?: number })?.deviceMemory || 0,
    language: nav?.language || "en",
    connectionType: ((nav as unknown as { connection?: { effectiveType?: string } })?.connection)?.effectiveType || "unknown",
    isStandalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true,
    screenWidth: window.screen?.width || 0,
    screenHeight: window.screen?.height || 0,
    colorDepth: window.screen?.colorDepth || 0,
    hasSpeechRecognition: typeof window !== "undefined" && (!!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)),
    hasNotification: "Notification" in window,
  };

  return info;
}

/** Get storage estimate if available. */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | undefined> {
  try {
    const estimate = await navigator.storage?.estimate();
    if (estimate) {
      return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
    }
  } catch {
    // Storage API not available
  }
  return undefined;
}

/** Get device info from DroidBridge (Linux container). */
export function getContainerInfo(): {
  hasContainer: boolean;
  distro?: string;
  kernel?: string;
  arch?: string;
} {
  const droid = getDroid();
  if (!droid) return { hasContainer: false };

  try {
    // Try to get basic info from the container
    const raw = droid.run("uname -a && cat /etc/os-release 2>/dev/null | head -5");
    const lines = raw.split("\n");

    const kernelLine = lines[0] || "";
    const distroLine = lines.find((l: string) => l.startsWith("PRETTY_NAME=")) || "";

    return {
      hasContainer: true,
      kernel: kernelLine.slice(0, 100),
      distro: distroLine.replace("PRETTY_NAME=", "").replace(/"/g, "").trim(),
      arch: kernelLine.includes("aarch64") ? "arm64" : kernelLine.includes("x86_64") ? "x86_64" : "unknown",
    };
  } catch {
    return { hasContainer: true };
  }
}

/** Build a system context string for the AI's system prompt. */
export function buildDeviceContext(): string {
  const info = getDeviceInfo();
  const parts: string[] = [];

  parts.push(`DEVICE: ${info.platform} (${info.screenWidth}×${info.screenHeight})`);
  if (info.cpuCores) parts.push(`CPU cores: ${info.cpuCores}`);
  if (info.memoryGB) parts.push(`RAM: ${info.memoryGB} GB`);
  parts.push(`Network: ${info.connectionType}`);
  parts.push(`Language: ${info.language}`);
  if (info.isStandalone) parts.push("Running as installed PWA");

  const container = getContainerInfo();
  if (container.hasContainer) {
    parts.push(`Container: ${container.distro || "Linux"} (${container.arch || "unknown arch"})`);
  }

  return `SYSTEM INFO:\n${parts.join("\n")}`;
}
