import { homedir } from "node:os";
import { join } from "node:path";

import type { CapabilityState, ComputerUseState } from "@robot/contracts/ipc";
import { sourceText } from "@robot/i18n/source";
import { safeStorage } from "electron";

/**
 * What the Computer Use driver is told to record as its host, for its own logs.
 *
 * Advisory only: `cua-driver` does not treat it as a trust signal, and it cannot, because any
 * process can set the variable. The development value is honest about the fact that a dev run is
 * the Electron binary - which is also the name macOS shows in the Privacy & Security panes, and the
 * reason a dev grant does not carry over to a packaged build.
 */
export const PACKAGED_BUNDLE_IDENTIFIER = "app.robot.desktop";
export const DEVELOPMENT_BUNDLE_IDENTIFIER = "com.github.Electron";

/** The Electron secret storage cipher that every encrypted file in userData uses. */
export function safeStorageCipher(
  unavailableKey: "error.app.secretStorageUnavailable" | "error.app.macSecureStorageUnavailable",
) {
  return {
    canPersist: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value: string) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error(sourceText(unavailableKey));
      return safeStorage.encryptString(value);
    },
    decrypt: (value: Buffer) => safeStorage.decryptString(value),
  };
}

/** How the driver's own state reads as the capability the Team API projects. */
export function computerUseCapability(state: ComputerUseState): CapabilityState {
  if (state.status === "ready") return "ready";
  if (state.status === "permissions-required") return "setup-required";
  return "unavailable";
}

/** The base cache path of electron-updater 6.8.9 (`getAppCacheDir`), which differs from Electron's. */
export function electronUpdaterCacheRoot(): string {
  if (process.platform === "win32") return process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  if (process.platform === "darwin") return join(homedir(), "Library", "Caches");
  return process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
}
