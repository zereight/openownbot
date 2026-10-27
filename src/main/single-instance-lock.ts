// Why a development launch waits for the single-instance lock instead of exiting at once.
//
// electron-vite restarts the app on every main-process rebuild by killing the old process and
// spawning the replacement immediately, without waiting for the old one to exit. The old one
// still holds the single-instance lock through its whole shutdown, so the replacement used to
// start, find the lock held, and exit with code 0 — and electron-vite exits when its Electron
// child does, which stopped the whole development stack on nearly every save to src/main.
// Waiting here, before anything else starts, lets the replacement survive the restart: the old
// process exits, the lock frees, and this process becomes the instance. A packaged build keeps
// exiting at once, so a second launch still hands off to the running app immediately.

export interface SingleInstanceLockRequest {
  /** Passes `app.requestSingleInstanceLock` through, so tests can answer it. */
  request: () => boolean;
  /** False in a packaged build, where a second launch must exit at once. */
  isDevelopment: boolean;
  /** Blocks the calling thread, so startup stays synchronous. */
  sleep: (milliseconds: number) => void;
  /** Writes one line when the wait starts and one when it ends; silent in tests. */
  log: (message: string) => void;
}

const LOCK_POLL_INTERVAL_MS = 250;
// Past the 30s shutdown deadline with room for the quit around it. A lock still held then
// belongs to a genuinely stuck process, and this launch exits like a second launch does.
const LOCK_WAIT_BUDGET_MS = 60_000;

export function acquireSingleInstanceLock(dependencies: SingleInstanceLockRequest): boolean {
  if (dependencies.request()) return true;
  if (!dependencies.isDevelopment) return false;
  dependencies.log("Another OpenBot holds the single-instance lock; waiting for it to quit.");
  const attempts = Math.floor(LOCK_WAIT_BUDGET_MS / LOCK_POLL_INTERVAL_MS);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    dependencies.sleep(LOCK_POLL_INTERVAL_MS);
    if (dependencies.request()) {
      dependencies.log("The single-instance lock freed up; starting.");
      return true;
    }
  }
  dependencies.log("The single-instance lock is still held; exiting like a second launch.");
  return false;
}

/** The synchronous sleep `acquireSingleInstanceLock` blocks on. */
export function sleepMilliseconds(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
