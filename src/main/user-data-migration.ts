import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { lockHolderPid, processIsAlive } from "./single-instance-lock";

export type UserDataMigrationOutcome = "not-needed" | "migrated" | "legacy-in-use" | "failed";

export interface UserDataMigrationDependencies {
  exists(path: string): boolean;
  /** Whether the app that owns the old folder is running. A copy of a database in use is not safe. */
  legacyIsRunning(): boolean;
  copyDirectory(from: string, to: string): void;
  rename(from: string, to: string): void;
  remove(path: string): void;
}

/**
 * Brings the data folder of the app under its old name (`OpenBot`) to the folder of the new name. The old
 * folder is copied, never moved or deleted, so going back to the old app loses nothing. The copy is made
 * beside the target and renamed into place, so that a start cut off half way never leaves a folder that
 * looks complete.
 */
export function migrateUserData(
  legacyDirectory: string,
  currentDirectory: string,
  dependencies: UserDataMigrationDependencies,
): UserDataMigrationOutcome {
  if (dependencies.exists(currentDirectory) || !dependencies.exists(legacyDirectory)) return "not-needed";
  if (dependencies.legacyIsRunning()) return "legacy-in-use";
  const staging = `${currentDirectory}.migrating`;
  if (dependencies.exists(staging)) dependencies.remove(staging);
  try {
    dependencies.copyDirectory(legacyDirectory, staging);
    dependencies.rename(staging, currentDirectory);
    return "migrated";
  } catch {
    try {
      dependencies.remove(staging);
    } catch {
      // The next start removes it before copying again.
    }
    return "failed";
  }
}

export function nodeUserDataMigrationDependencies(legacyDirectory: string): UserDataMigrationDependencies {
  return {
    exists: existsSync,
    legacyIsRunning: () => {
      const pid = lockHolderPid(legacyDirectory);
      return pid !== null && processIsAlive(pid);
    },
    // Chromium's lock files are links to a process that no longer exists; they are not data.
    copyDirectory: (from, to) =>
      cpSync(from, to, {
        recursive: true,
        filter: (source) =>
          !["SingletonLock", "SingletonCookie", "SingletonSocket"].includes(source.split("/").at(-1) ?? ""),
      }),
    rename: renameSync,
    remove: (path) => rmSync(path, { recursive: true, force: true }),
  };
}

export const LEGACY_USER_DATA_NAME = "OpenBot";
export const USER_DATA_NAME = "OpenOwnBot";

export function legacyUserDataDirectory(appData: string): string {
  return join(appData, LEGACY_USER_DATA_NAME);
}
