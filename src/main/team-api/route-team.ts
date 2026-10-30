import type { TeamApiOptions } from "./dependencies";
// The team itself: who you are, who else is here, and the sessions of this host.
//
// Sessions run through `requireAdmin` first. That check is a
// throw, not a branch, so a route that forgets it does not fail closed - it quietly hands a member
// the administrator's view. Every handler below that touches another member calls it on its own
// first line for exactly that reason.

import { readFile } from "node:fs/promises";
import type { TeamPresenceSnapshot } from "@openownbot/contracts/ipc";
import { TEAM_API_ROUTES } from "@openownbot/contracts/team-api-routes";
import { sourceText } from "@openownbot/i18n/source";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { TeamStore } from "../team-store";
import type { TeamApiBrowser, TeamApiBrowserView, TeamApiRemoteScreen } from "./dependencies";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { pathIdentifier, requireAdmin } from "./request-helpers";

export interface TeamRouteDependencies {
  store: Pick<TeamStore, "logout" | "resolveLogo" | "listSessions" | "revokeSession">;
  remoteScreen?: Pick<TeamApiRemoteScreen, "revokeTeamSession">;
  /** A session or a member that ends gives back the browser tabs it controls. */
  browser?: Pick<TeamApiBrowser, "releaseUserControlHeldBy">;
  browserView?: Pick<TeamApiBrowserView, "revokeTeamSession">;
  onSessionRevoked?: TeamApiOptions["onSessionRevoked"];
  getPresence: () => TeamPresenceSnapshot;
  refreshPresence: () => void;
}

export async function routeTeam(
  context: TeamApiRequestContext,
  { store, remoteScreen, browser, browserView, onSessionRevoked, getPresence, refreshPresence }: TeamRouteDependencies,
): Promise<RouteOutcome> {
  const { method, url, response, member, token, sessionId, json, empty } = context;

  if (method === "POST" && url.pathname === TEAM_API_ROUTES.auth.logout) {
    await runCauseEffect(store.logout(token));
    await (remoteScreen ? runCauseEffect(remoteScreen.revokeTeamSession(sessionId)) : undefined);
    browser?.releaseUserControlHeldBy({ kind: "session", sessionId });
    await (browserView ? runCauseEffect(browserView.revokeTeamSession(sessionId)) : undefined);
    refreshPresence();
    return empty(204);
  }
  if (method === "GET" && url.pathname === TEAM_API_ROUTES.me) {
    return json(200, member);
  }
  if (method === "GET" && url.pathname === TEAM_API_ROUTES.team.presence) {
    return json(200, getPresence());
  }
  if (method === "GET" && url.pathname === TEAM_API_ROUTES.team.logo) {
    const logo = store.resolveLogo();
    if (!logo || (url.searchParams.get("v") && url.searchParams.get("v") !== logo.version)) {
      return json(404, { error: sourceText("error.team.logoNotFound") });
    }
    const bytes = await readFile(logo.path);
    response.writeHead(200, {
      "Content-Type": logo.mimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(bytes);
    return "handled";
  }
  if (method === "GET" && url.pathname === TEAM_API_ROUTES.events) {
    return json(426, { error: "Use WebSocket for remote events." });
  }
  // Two routes a released client still asks for. They answer 426 rather than 404 so the client
  // shows "update the host" instead of treating the host as broken; the features behind them are
  // gone, and the wire protocol is frozen, so the tombstones stay.
  if (method === "GET" && url.pathname === TEAM_API_ROUTES.host.remoteMac) {
    return json(426, { error: sourceText("error.team.updateRequired"), code: "protocol_mismatch" });
  }
  if (method === "GET" && url.pathname === TEAM_API_ROUTES.host.remoteDesktopAccess) {
    return json(426, { error: sourceText("error.team.updateRequired"), code: "protocol_mismatch" });
  }

  if (method === "GET" && url.pathname === TEAM_API_ROUTES.team.sessions) {
    requireAdmin(member);
    return json(200, store.listSessions());
  }
  const sessionMatch = url.pathname.match(/^\/v1\/team\/sessions\/([^/]+)$/);
  if (method === "DELETE" && sessionMatch) {
    requireAdmin(member);
    const revokedSessionId = pathIdentifier(sessionMatch[1], "sessionId");
    await runCauseEffect(store.revokeSession(revokedSessionId));
    await (onSessionRevoked ? runCauseEffect(onSessionRevoked(revokedSessionId)) : undefined);
    await (remoteScreen ? runCauseEffect(remoteScreen.revokeTeamSession(revokedSessionId)) : undefined);
    browser?.releaseUserControlHeldBy({ kind: "session", sessionId: revokedSessionId });
    await (browserView ? runCauseEffect(browserView.revokeTeamSession(revokedSessionId)) : undefined);
    refreshPresence();
    return empty(204);
  }

  return "unmatched";
}
