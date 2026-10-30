// Why a development launch waits for the previous instance instead of exiting at once.
//
// electron-vite restarts the app on every main-process rebuild by killing the old process and
// spawning the replacement immediately, without waiting for the old one to exit. The old one
// still holds the single-instance lock through its whole shutdown, so the replacement used to
// start, find the lock held, and exit with code 0, and electron-vite exits when its Electron
// child does, which stopped the whole development stack on nearly every save to src/main.
//
// The wait is on the process that holds the lock, and the lock is requested once afterwards. A
// request that fails and is then repeated leaves Electron without a `ready` event: the process
// takes the lock, opens no window and starts nothing, so a retry loop turned a stopped stack into
// a stuck one. A packaged build keeps requesting once and exiting at once, so a second launch
// still hands off to the running app immediately.

import { readlinkSync } from "node:fs";
import { join } from "node:path";

export interface SingleInstanceLockRequest {
  /** Passes `app.requestSingleInstanceLock` through, so tests can answer it. */
  request: () => boolean;
  /** False in a packaged build, where a second launch must exit at once. */
  isDevelopment: boolean;
  /** The process id the lock names, or null when none is held. */
  holder: () => number | null;
  isAlive: (pid: number) => boolean;
  /** Blocks the calling thread, so startup stays synchronous. */
  sleep: (milliseconds: number) => void;
  /** Writes one line when the wait starts and one when it ends; silent in tests. */
  log: (message: string) => void;
}

const LOCK_POLL_INTERVAL_MS = 250;
// Past the 30s shutdown deadline with room for the quit around it. A holder still running then is
// genuinely stuck, and this launch exits like a second launch does.
const LOCK_WAIT_BUDGET_MS = 60_000;

export function acquireSingleInstanceLock(dependencies: SingleInstanceLockRequest): boolean {
  if (dependencies.isDevelopment) waitForHolderToExit(dependencies);
  return dependencies.request();
}

function waitForHolderToExit({ holder, isAlive, sleep, log }: SingleInstanceLockRequest): void {
  const holderIsRunning = (): boolean => {
    const pid = holder();
    return pid !== null && isAlive(pid);
  };
  if (!holderIsRunning()) return;
  log("Another ROBot holds the single-instance lock; waiting for it to quit.");
  const attempts = Math.floor(LOCK_WAIT_BUDGET_MS / LOCK_POLL_INTERVAL_MS);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    sleep(LOCK_POLL_INTERVAL_MS);
    if (!holderIsRunning()) {
      log("The previous instance quit; starting.");
      return;
    }
  }
  log("The previous instance is still running; exiting like a second launch.");
}

/**
 * The process id Chromium writes into `SingletonLock` as `<host>-<pid>`, a symlink in the profile
 * directory. Windows keeps a mutex instead of a file, so there it finds none and a development
 * restart still exits at once.
 */
export function lockHolderPid(userDataPath: string): number | null {
  try {
    const match = /-(\d+)$/.exec(readlinkSync(join(userDataPath, "SingletonLock")));
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/** Signal 0 checks that the process exists. A process of another user answers with EPERM. */
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

/** The synchronous sleep `acquireSingleInstanceLock` blocks on. */
export function sleepMilliseconds(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
