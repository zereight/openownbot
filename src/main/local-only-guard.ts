import { guardOpenOwnBotEgress, LOCAL_ONLY, refusesOpenOwnBotUrl } from "@robot/contracts/local-only";
import { createOpenOwnBotLogger } from "@robot/logging";
import { app, session } from "electron";

const logger = createOpenOwnBotLogger("local-only-guard");

type BeforeRequestListener = (details: { url: string }, callback: (response: { cancel: boolean }) => void) => void;

export interface GuardableSession {
  webRequest: { onBeforeRequest(filter: { urls: string[] }, listener: BeforeRequestListener): void };
}

/** Logs each origin once and never the path, which can carry a ticket. */
function createRefusalLog(): (origin: string) => void {
  const logged = new Set<string>();
  return (origin) => {
    if (logged.has(origin)) return;
    logged.add(origin);
    logger.warn(`Local-only mode refused a request to ${origin}.`);
  };
}

/** Electron keeps one `onBeforeRequest` listener per session, so a repeat call replaces this one. */
export function guardSession(target: GuardableSession, onRefused: (origin: string) => void): void {
  target.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
    const refused = refusesOpenOwnBotUrl(details.url);
    if (refused) onRefused(new URL(details.url).origin);
    callback({ cancel: refused });
  });
}

/**
 * While LOCAL_ONLY is on, refuses every request this process makes to a ROBot service: Node
 * `fetch` and `WebSocket` from this call on, and every Electron session (the default one, the
 * updater and the browser panes). The renderer runs in the default session, so it needs no code of
 * its own. Call it before any network call.
 */
export function installLocalOnlyGuard(): void {
  if (!LOCAL_ONLY) return;
  const logRefusal = createRefusalLog();
  guardOpenOwnBotEgress(globalThis, logRefusal);
  app.on("session-created", (created) => guardSession(created, logRefusal));
  void app.whenReady().then(() => guardSession(session.defaultSession, logRefusal));
}
