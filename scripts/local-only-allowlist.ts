// What `scripts/check-local-only.ts` accepts. Every entry names one exact path and says why it is
// safe. A glob would admit files nobody reviewed, and a pattern that is not anchored would admit a
// changed URL, so the check rejects both. An entry that matches nothing fails the check.

/** Why a mention of an OpenBot service cannot send a request while LOCAL_ONLY is on. */
export type AllowReason =
  /** The code reads LOCAL_ONLY and does not run while it is on. */
  | "gated"
  /** Not gated. The runtime guard refuses it, so this entry keeps the load of the guard visible. */
  | "refused"
  /** Text, an identifier, a validation or a link that is only shown, copied or parsed. */
  | "not-fetched"
  /** Opened in the system browser when the user clicks it. */
  | "user-opened";

/** A way to leave the process that skips the guarded `fetch` and `WebSocket`, or replaces the session guard. */
export type BypassPrimitive = "ws" | "http-request" | "net-connect" | "electron-net" | "on-before-request";

export type AllowEntry =
  | {
      readonly rule: "mention";
      readonly path: string;
      readonly unit: RegExp;
      readonly reason: AllowReason;
      readonly note?: string;
    }
  | { readonly rule: "bypass"; readonly path: string; readonly primitive: BypassPrimitive; readonly note: string }
  | { readonly rule: "dynamic-dial"; readonly path: string; readonly note: string };

/**
 * A config file that may name an OpenBot service only while code elsewhere keeps the service off.
 * Native tooling reads these files, so no runtime guard can stop what they start.
 */
export interface ConfigGate {
  readonly path: string;
  readonly gateFile: string;
  readonly requirement: string;
  readonly holds: (gateSource: string) => boolean;
}

export const CONFIG_GATES: readonly ConfigGate[] = [
  {
    path: "electron-builder.yml",
    gateFile: "src/main/application-services.ts",
    requirement: "the `updatesEnabled` assignment must contain LOCAL_ONLY",
    holds: (source) => /const updatesEnabled =[^;]*\bLOCAL_ONLY\b[^;]*;/u.test(source),
  },
  {
    path: "apps/mobile/app.json",
    gateFile: "apps/mobile/app.config.js",
    requirement: "app.config.js must read local-only.json and set `updates.enabled` from it",
    holds: (source) => /local-only\.json/u.test(source) && /updates:\s*\{[^}]*\benabled:\s*!localOnly\b/u.test(source),
  },
];

function mention(path: string, unit: RegExp, reason: AllowReason, note?: string): AllowEntry {
  return note === undefined ? { rule: "mention", path, unit, reason } : { rule: "mention", path, unit, reason, note };
}

function bypass(path: string, primitive: BypassPrimitive, note: string): AllowEntry {
  return { rule: "bypass", path, primitive, note };
}

function dynamicDial(path: string, note: string): AllowEntry {
  return { rule: "dynamic-dial", path, note };
}

const SITE = /^https:\/\/openbot\.run$/u;
const CHANGELOG = /^https:\/\/openbot\.run\/changelog$/u;
const GUIDES = /^https:\/\/openbot\.run\/guides$/u;
const DISCORD = /^https:\/\/discord\.openbot\.run$/u;
const INVITE_PLACEHOLDER = /^https:\/\/openbot\.run\/join\?…$/u;
const HOSTNAME_SUFFIX = /^\.openbot\.site$/u;
const PODSPEC_HOMEPAGE = /^s\.homepage\s+= 'https:\/\/openbot\.run'$/u;
const ANALYTICS_API = /^https:\/\/analytics\.openbot\.run\/api$/u;

const GLOBAL_WEBSOCKET =
  "Uses the global WebSocket, which installLocalOnlyGuard replaces. The URL is a remote server that the user chose, and an OpenBot host is refused there.";
const RENDERER_SIGNAL_SOCKET =
  "The signal URL comes from a team ticket. The page runs in an Electron session, and webRequest reports its sockets as `webSocket` requests, so the session guard sees them.";
const LOCAL_SUNSHINE =
  "Reaches the local Sunshine runtime on 127.0.0.1 only. That is not an OpenBot service, and a request to it needs no guard.";
const LOCAL_SOCKET = "Connects to the local cua-driver daemon through a unix socket path. It never leaves the machine.";

export const LOCAL_ONLY_ALLOWLIST: readonly AllowEntry[] = [
  mention(
    "apps/mobile/app.json",
    /^https:\/\/u\.expo\.dev\/eeec730f-c8f4-42c0-a750-64df8af14940$/u,
    "gated",
    "app.config.js turns updates off, and CONFIG_GATES checks that it still does.",
  ),
  mention("apps/mobile/modules/app-lock/ios/OpenBotAppLock.podspec", PODSPEC_HOMEPAGE, "not-fetched", "Pod metadata."),
  mention(
    "apps/mobile/modules/composer-paste/ios/OpenBotComposerPaste.podspec",
    PODSPEC_HOMEPAGE,
    "not-fetched",
    "Pod metadata.",
  ),
  mention(
    "apps/mobile/modules/quick-actions/ios/OpenBotQuickActions.podspec",
    PODSPEC_HOMEPAGE,
    "not-fetched",
    "Pod metadata.",
  ),
  mention("apps/mobile/src/features/analytics/mobile-analytics.ts", ANALYTICS_API, "gated"),
  mention(
    "apps/mobile/src/features/links/model/incoming-links.ts",
    SITE,
    "not-fetched",
    "The base that `new URL` resolves a relative link against.",
  ),
  mention("apps/mobile/src/features/servers/screens/add-server-screen.tsx", INVITE_PLACEHOLDER, "not-fetched"),
  mention("apps/mobile/src/features/settings/screens/about-settings-screen.tsx", SITE, "user-opened"),
  mention(
    "apps/mobile/src/features/settings/screens/about-settings-screen.tsx",
    /^https:\/\/github\.com\/nightly-labs\/openbot\/blob\/main\/PRIVACY\.md$/u,
    "user-opened",
  ),
  mention(
    "apps/mobile/src/features/settings/screens/support-settings-screen.tsx",
    /^https:\/\/github\.com\/nightly-labs\/openbot\/issues\/new$/u,
    "user-opened",
  ),
  mention(
    "electron-builder.yml",
    /^owner: nightly-labs$/u,
    "gated",
    "The publish target of the updater. CONFIG_GATES checks that updates stay off.",
  ),
  mention(
    "packages/contracts/src/agent-template-links.ts",
    SITE,
    "not-fetched",
    "The origin of the share links that the app builds and recognises.",
  ),
  mention("packages/contracts/src/hosted-servers.ts", /^mailto:hello@openbot\.run\?subject=$/u, "user-opened"),
  mention(
    "packages/contracts/src/invite-links.ts",
    SITE,
    "not-fetched",
    "The origin of the invite links that the app builds and recognises.",
  ),
  mention(
    "packages/contracts/src/invite-links.ts",
    /^https:\/\/api\.openbot\.run$/u,
    "refused",
    "The default account service of the mobile app. Signing in is a user action, and the mobile guard refuses it.",
  ),
  mention(
    "packages/contracts/src/ipc-agent-import.ts",
    /^nightly-labs\/openbot\/resources\/agent-import\/hermes-agent$/u,
    "not-fetched",
    "A skill id that the user pastes into Hermes. Hermes fetches it and this app does not.",
  ),
  mention("packages/contracts/src/ipc-conversation-events.ts", HOSTNAME_SUFFIX, "not-fetched", "Hostname validation."),
  mention(
    "packages/contracts/src/local-only.ts",
    /^openbot\.run$/u,
    "not-fetched",
    "The list of services that the guard refuses.",
  ),
  mention(
    "packages/contracts/src/local-only.ts",
    /^openbot\.site$/u,
    "not-fetched",
    "The list of services that the guard refuses.",
  ),
  mention(
    "packages/contracts/src/local-only.ts",
    /^nightly-labs$/u,
    "not-fetched",
    "The list of services that the guard refuses.",
  ),
  mention("packages/contracts/src/plugin-links.ts", SITE, "not-fetched", "The origin of the plugin share links."),
  mention(
    "packages/team-client/src/remote-directory.ts",
    SITE,
    "not-fetched",
    "Compared with the origin of an invite. The request goes to the configured API URL.",
  ),
  mention(
    "packages/team-client/src/remote-directory.ts",
    /^https:\/\/api\.openbot\.run$/u,
    "not-fetched",
    "Compared with the origin of an invite. The request goes to the configured API URL.",
  ),
  dynamicDial("packages/team-client/src/remote-peer.ts", RENDERER_SIGNAL_SOCKET),
  mention(
    "packages/telemetry/src/transport.ts",
    /^https:\/\/analytics\.openbot\.run\/api\/track$/u,
    "refused",
    "The default endpoint. Every caller is gated: application-services.ts, renderer error-reports.ts, the web build by its origin check, and mobile failure-reports.ts.",
  ),
  mention("packages/ui/src/features/servers/JoinServerDialog.tsx", INVITE_PLACEHOLDER, "not-fetched"),
  mention(
    "src/backend/agent/hosted-site-coordinator.ts",
    /^ from openbot\.site\.$/u,
    "not-fetched",
    "The text of an approval prompt.",
  ),
  mention(
    "src/backend/agent/hosted-site-coordinator.ts",
    /^ as a public site on openbot\.site\.$/u,
    "not-fetched",
    "The text of an approval prompt.",
  ),
  mention("src/backend/agent/hosted-site-events.ts", HOSTNAME_SUFFIX, "not-fetched", "Hostname validation."),
  mention("src/backend/mcp-oauth-provider.ts", SITE, "gated", "The client metadata leaves the URLs out."),
  mention(
    "src/backend/mcp-oauth-provider.ts",
    /^https:\/\/openbot\.run\/icon-512x512\.png$/u,
    "gated",
    "The client metadata leaves the URLs out.",
  ),
  mention(
    "src/main/analytics.ts",
    ANALYTICS_API,
    "gated",
    "HostAnalytics takes `enabled` from analyticsEnabled in application-services.ts.",
  ),
  mention("src/main/application-services.ts", /^https:\/\/api\.openbot\.run$/u, "gated"),
  dynamicDial("src/main/browser-view-client.ts", GLOBAL_WEBSOCKET),
  mention("src/main/content-security-policy.ts", /^ https:\/\/analytics\.openbot\.run$/u, "gated"),
  mention("src/main/content-security-policy.ts", /^ wss:\/\/\*\.openbot\.run$/u, "gated"),
  mention("src/main/content-security-policy.ts", /^ https:\/\/\*\.openbot\.run$/u, "gated"),
  bypass("src/main/cua-driver-action-tap.ts", "net-connect", LOCAL_SOCKET),
  bypass("src/main/cua-driver-daemon-client.ts", "net-connect", LOCAL_SOCKET),
  bypass("src/main/cua-driver-runtime.ts", "net-connect", LOCAL_SOCKET),
  mention(
    "src/main/host-release-service.ts",
    /^https:\/\/github\.com\/nightly-labs\/openbot\/releases\/latest\/download\/$/u,
    "gated",
  ),
  bypass(
    "src/main/index.ts",
    "electron-net",
    "Calls `net.isOnline()` only, which sends nothing. A `net.fetch` or `net.request` here needs a new review.",
  ),
  mention(
    "src/main/ipc/app-handlers.ts",
    /^https:\/\/github\.com\/nightly-labs\/openbot\/blob\/main\/docs\/TROUBLESHOOTING\.md$/u,
    "user-opened",
  ),
  mention("src/main/ipc/app-handlers.ts", CHANGELOG, "user-opened"),
  mention("src/main/ipc/app-handlers.ts", GUIDES, "user-opened"),
  mention("src/main/ipc/app-handlers.ts", DISCORD, "user-opened"),
  bypass(
    "src/main/local-only-guard.ts",
    "on-before-request",
    "This is the guard. Electron keeps one listener per session, so any other file that sets one replaces it.",
  ),
  mention(
    "src/main/provider-runtime-releases.ts",
    /^https:\/\/raw\.githubusercontent\.com\/nightly-labs\/openbot\/main\/provider-runtime-blocklist\.json$/u,
    "gated",
  ),
  bypass("src/main/remote-screen-gateway.ts", "http-request", LOCAL_SUNSHINE),
  dynamicDial("src/main/remote-server-event-stream.ts", GLOBAL_WEBSOCKET),
  mention("src/main/routine-feed-ics.ts", /^@routines\.openbot\.run$/u, "not-fetched", "The UID of a calendar event."),
  bypass(
    "src/main/signal-ingress.ts",
    "ws",
    "The dial follows the refusesOpenBotUrl check on the signal URL, because ws skips the guarded WebSocket.",
  ),
  bypass("src/main/sunshine-moonlight-runtime.ts", "http-request", LOCAL_SUNSHINE),
  bypass(
    "src/main/voice-cloud-stream.ts",
    "ws",
    "Dials the ElevenLabs speech-to-text URL, which is not an OpenBot service.",
  ),
  dynamicDial("src/main/voice-cloud-stream.ts", "The URL is the ElevenLabs constant of this file."),
  mention("src/renderer/src/analytics.ts", ANALYTICS_API, "gated"),
  mention(
    "src/renderer/src/analytics.ts",
    SITE,
    "not-fetched",
    "The web client sends events only when the page itself is served from this origin.",
  ),
  mention(
    "src/renderer/src/error-reports.ts",
    SITE,
    "not-fetched",
    "The web client sends reports only when the page itself is served from this origin.",
  ),
  mention(
    "src/renderer/src/features/agent-templates/agent-template-card.tsx",
    /^openbot\.run$/u,
    "not-fetched",
    "Drawn onto the share image.",
  ),
  mention(
    "src/renderer/src/features/settings/marketplace-plugin-catalog.ts",
    /^https:\/\/openbot\.run\/plugins\/[a-z0-9-]+$/u,
    "not-fetched",
    "The `shareUrl` of a catalog entry, which the user copies.",
  ),
  dynamicDial("src/renderer/src/features/team/team-webrtc.ts", RENDERER_SIGNAL_SOCKET),
  mention("src/renderer/src/features/updates/WhatsNewOverlay.tsx", CHANGELOG, "user-opened"),
  mention("src/renderer/src/features/web-client/web-provider-admin.ts", CHANGELOG, "user-opened"),
  mention("src/renderer/src/features/web-client/web-provider-admin.ts", GUIDES, "user-opened"),
  mention("src/renderer/src/features/web-client/web-provider-admin.ts", DISCORD, "user-opened"),
];
