import type { RenderProcessGoneDetails } from "electron";

/** A crash that comes this often is a page that cannot load, and another reload would only repeat it. */
const MAX_RELOADS = 3;
const RELOAD_WINDOW_MS = 60_000;

/**
 * Electron leaves the page of a crashed renderer blank, so the window shows nothing until the app
 * restarts. This tells whether the window should load its page again. A clean exit is not a crash.
 * Three reloads in a minute stop it, so a page that crashes while it loads does not loop.
 */
export function createRendererRecovery(now: () => number = Date.now) {
  const reloads: number[] = [];
  return {
    shouldReload(reason: RenderProcessGoneDetails["reason"]): boolean {
      if (reason === "clean-exit") return false;
      const cutoff = now() - RELOAD_WINDOW_MS;
      while (reloads.length > 0 && (reloads[0] ?? 0) <= cutoff) reloads.shift();
      if (reloads.length >= MAX_RELOADS) return false;
      reloads.push(now());
      return true;
    },
  };
}
