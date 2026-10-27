import setting from "./local-only.json";

/**
 * On in this fork: no request goes to a service that OpenBot operates. Set `localOnly` in
 * `local-only.json` to false and rebuild to get the upstream behaviour back. The JSON import types
 * it as `boolean`, so `!LOCAL_ONLY && x` is not a constant condition.
 */
export const LOCAL_ONLY: boolean = setting.localOnly;

/** How OpenBot reaches the app. Private: callers ask the functions below and never iterate. */
type OpenBotService =
  /** The domain and every subdomain. */
  | { readonly kind: "domain"; readonly domain: string }
  /** A namespace on a GitHub host: releases, raw files, the API, packages and Pages. */
  | { readonly kind: "github-owner"; readonly owner: string }
  /** One path prefix on a host that other projects share. */
  | { readonly kind: "path"; readonly host: string; readonly prefix: `/${string}` };

const OPENBOT_SERVICES: readonly OpenBotService[] = [
  { kind: "domain", domain: "openbot.run" },
  { kind: "domain", domain: "openbot.site" },
  { kind: "github-owner", owner: "nightly-labs" },
  // The Expo update channel of the shipped iPhone app: `updates.url` in apps/mobile/app.json. The same id
  // is `extra.eas.projectId` there, which is a build setting and not a request, so only the URL form counts.
  { kind: "path", host: "u.expo.dev", prefix: "/eeec730f-c8f4-42c0-a750-64df8af14940" },
];

const GITHUB_HOSTS: ReadonlySet<string> = new Set([
  "github.com",
  "www.github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "codeload.github.com",
  "ghcr.io",
]);

/** Path segments that come before the owner: `api.github.com/repos/<owner>`, `ghcr.io/v2/<owner>`. */
const GITHUB_NAMESPACE_PREFIXES: ReadonlySet<string> = new Set(["repos", "orgs", "v2"]);

/**
 * `new URL` leaves `hostname` empty for `turn:` and `turns:` and puts the host in `pathname`, and it
 * keeps a trailing dot and the case of a host in a scheme it does not know.
 */
function hostnameOf(url: URL): string {
  const host = url.hostname !== "" ? url.hostname : (url.pathname.split(/[:/]/, 1)[0] ?? "");
  return host.toLowerCase().replace(/\.+$/, "");
}

function githubNamespace(url: URL, host: string): string | null {
  if (!GITHUB_HOSTS.has(host)) return null;
  const [first, second] = url.pathname.split("/").filter(Boolean);
  const namespace = first !== undefined && GITHUB_NAMESPACE_PREFIXES.has(first.toLowerCase()) ? second : first;
  return namespace?.toLowerCase() ?? null;
}

/** The view that decides a request: does `url` belong to `service`? */
function matchesUrl(service: OpenBotService, url: URL): boolean {
  const host = hostnameOf(url);
  switch (service.kind) {
    case "domain":
      return host === service.domain || host.endsWith(`.${service.domain}`);
    case "github-owner":
      return githubNamespace(url, host) === service.owner || host === `${service.owner}.github.io`;
    case "path": {
      const path = url.pathname.toLowerCase();
      return host === service.host && (path === service.prefix || path.startsWith(`${service.prefix}/`));
    }
    default:
      return service satisfies never;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The view that decides a source line: does a text name `service`? Boundaries keep `notopenbot.run` out. */
function mentionPattern(service: OpenBotService): string {
  switch (service.kind) {
    case "domain":
      return `(?<![a-z0-9-])(?:[a-z0-9-]+\\.)*${escapeRegExp(service.domain)}(?![a-z0-9-]|\\.[a-z0-9])`;
    case "github-owner":
      return `(?<![a-z0-9-])${escapeRegExp(service.owner)}(?![a-z0-9-])`;
    case "path":
      return `(?<![a-z0-9-])${escapeRegExp(service.host + service.prefix)}(?![a-z0-9-])`;
    default:
      return service satisfies never;
  }
}

const MENTION = new RegExp(OPENBOT_SERVICES.map(mentionPattern).join("|"), "i");

function parseUrl(url: string | URL): URL | null {
  if (url instanceof URL) return url;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** The scheme and host of a refused URL: a path or query can carry a ticket, so it is never reported. */
function refusedOrigin(url: string | URL): string | null {
  if (!LOCAL_ONLY) return null;
  const parsed = parseUrl(url);
  if (parsed === null || !OPENBOT_SERVICES.some((service) => matchesUrl(service, parsed))) return null;
  return `${parsed.protocol}//${hostnameOf(parsed)}`;
}

/** True when LOCAL_ONLY is on and `url` belongs to an OpenBot service. An unparsable URL is not refused. */
export function refusesOpenBotUrl(url: string | URL): boolean {
  return refusedOrigin(url) !== null;
}

/** For scripts/check-local-only.ts: whether `text` names an OpenBot service. It ignores LOCAL_ONLY. */
export function mentionsOpenBotService(text: string): boolean {
  return MENTION.test(text);
}

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** `globalThis` fits. `fetch` is not `typeof fetch`, which Bun's types extend with `preconnect`. */
export interface GuardableScope {
  fetch: Fetch;
  WebSocket?: typeof WebSocket;
}

const guardedScopes = new WeakSet<GuardableScope>();

function refusal(origin: string): TypeError {
  return new TypeError(`fetch failed: ${origin} is an OpenBot service and local-only mode is on`);
}

/**
 * Replaces `scope.fetch` and `scope.WebSocket` so that a refused URL never leaves. `fetch` rejects
 * with a `TypeError`, as an offline `fetch` does, and the `WebSocket` constructor throws it. Calls
 * `onRefused` with the origin only. Does nothing while LOCAL_ONLY is off, and a second call for the
 * same scope changes nothing.
 */
export function guardOpenBotEgress(scope: GuardableScope, onRefused?: (origin: string) => void): void {
  if (!LOCAL_ONLY || guardedScopes.has(scope)) return;
  guardedScopes.add(scope);

  const originalFetch = scope.fetch;
  scope.fetch = (input, init) => {
    const origin = refusedOrigin(typeof input === "string" || input instanceof URL ? input : input.url);
    if (origin === null) return originalFetch.call(scope, input, init);
    onRefused?.(origin);
    return Promise.reject(refusal(origin));
  };

  const OriginalWebSocket = scope.WebSocket;
  if (OriginalWebSocket === undefined) return;
  scope.WebSocket = new Proxy(OriginalWebSocket, {
    construct(target, args, newTarget) {
      const origin = refusedOrigin(args[0]);
      if (origin !== null) {
        onRefused?.(origin);
        throw refusal(origin);
      }
      return Reflect.construct(target, args, newTarget);
    },
  });
}
