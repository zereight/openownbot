import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { INPUT_LIMITS } from "@openownbot/contracts/input-limits";
import { type BrowserBounds, type BrowserEnvironment, isBrowserProfileId } from "@openownbot/contracts/ipc";
import { isBoolean, isNumber, isString } from "@openownbot/contracts/runtime-values";
import { Effect } from "effect";
import { browserCall, browserSync } from "./browser-effects";
import type { BrowserToolArguments } from "./browser-tools";
import { isMissingFileError } from "./file-errors";
import { isRecord } from "./protocol";

export interface StoredBrowserTab {
  id: string;
  url: string;
  ownerThreadId: string | null;
  ownerAgentId: string | null;
  /** Absent in a v1 file, and in a v2 file whose environment did not survive validation. */
  environment?: BrowserEnvironment;
  /** The key of the agent session the tab opened in. Absent: the shared session. See `agentBrowserSessionKey`. */
  agentSession?: string;
  /**
   * The id of the named profile the tab opened in. It comes before `agentSession`, which a profile tab
   * also stores, so an older build opens it in a session of its own and never in the shared one.
   */
  profile?: string;
}

/** The persistent session of a tab other than the shared one. Fixed for the life of the tab. */
export type BrowserTabSession = { kind: "agent"; key: string } | { kind: "profile"; profileId: string };

/** The directory name of a session under `Partitions`. Its partition is `persist:` and this name. */
export function browserTabPartition(tabSession: BrowserTabSession): string {
  return tabSession.kind === "agent"
    ? `openownbot-browser-agent-${tabSession.key}`
    : `openownbot-browser-profile-${tabSession.profileId}`;
}

/** The session of a saved tab. Undefined: the shared session. */
export function storedTabSession(
  tab: Pick<StoredBrowserTab, "agentSession" | "profile">,
): BrowserTabSession | undefined {
  if (tab.profile !== undefined) return { kind: "profile", profileId: tab.profile };
  return tab.agentSession === undefined ? undefined : { kind: "agent", key: tab.agentSession };
}

/** The saved fields of a tab session. A profile tab also names a session that an older build reads. */
export function storedSessionFields(
  tabSession: BrowserTabSession | undefined,
): Pick<StoredBrowserTab, "agentSession" | "profile"> {
  if (!tabSession) return {};
  if (tabSession.kind === "agent") return { agentSession: tabSession.key };
  return {
    agentSession: agentBrowserSessionKey(`browser-profile:${tabSession.profileId}`),
    profile: tabSession.profileId,
  };
}

/**
 * The partition key of an agent's own browser session. A hash, so an agent id never becomes part of
 * a directory name, and the same agent always gets the same cookies back.
 */
export function agentBrowserSessionKey(agentId: string): string {
  return createHash("sha256").update(agentId).digest("hex").slice(0, 32);
}

function isAgentBrowserSessionKey(value: unknown): value is string {
  return isString(value) && /^[0-9a-f]{32}$/.test(value);
}

/**
 * A viewport this large would allocate a backing store big enough to take the whole app down, and the
 * bound is on the *physical* pixels, so a modest CSS size with a 4x scale factor still trips it.
 */
const MAX_PHYSICAL_VIEWPORT_PIXELS = 8_388_608;

function isSafeViewportSize(width: number, height: number, deviceScaleFactor: number): boolean {
  return width * height * deviceScaleFactor * deviceScaleFactor <= MAX_PHYSICAL_VIEWPORT_PIXELS;
}

export function defaultBrowserEnvironment(): BrowserEnvironment {
  return {
    viewport: { mode: "fill", width: 1200, height: 800, deviceScaleFactor: 1, preset: null },
    colorScheme: "system",
    reducedMotion: false,
  };
}

/**
 * A per-tab environment read back from the user's own file. Every bound is re-checked rather than
 * trusted, because a hand-edited or truncated file would otherwise hand a viewport straight to
 * `Emulation.setDeviceMetricsOverride`.
 */
function browserEnvironment(value: unknown): BrowserEnvironment | null {
  if (!isRecord(value) || !isRecord(value.viewport)) return null;
  const viewport = value.viewport;
  if (viewport.mode !== "fill" && viewport.mode !== "custom") return null;
  const minimumWidth = viewport.mode === "fill" ? 1 : 320;
  const minimumHeight = viewport.mode === "fill" ? 1 : 240;
  if (!isNumber(viewport.width) || viewport.width < minimumWidth || viewport.width > INPUT_LIMITS.browserDimension) {
    return null;
  }
  if (
    !isNumber(viewport.height) ||
    viewport.height < minimumHeight ||
    viewport.height > INPUT_LIMITS.browserDimension
  ) {
    return null;
  }
  if (!isNumber(viewport.deviceScaleFactor) || viewport.deviceScaleFactor < 0.5 || viewport.deviceScaleFactor > 4) {
    return null;
  }
  if (!isSafeViewportSize(viewport.width, viewport.height, viewport.deviceScaleFactor)) return null;
  if (
    viewport.preset !== null &&
    viewport.preset !== "desktop" &&
    viewport.preset !== "tablet" &&
    viewport.preset !== "mobile"
  ) {
    return null;
  }
  if (value.colorScheme !== "light" && value.colorScheme !== "dark" && value.colorScheme !== "system") return null;
  if (!isBoolean(value.reducedMotion)) return null;
  return {
    viewport: {
      mode: viewport.mode,
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      preset: viewport.preset,
    },
    colorScheme: value.colorScheme,
    reducedMotion: value.reducedMotion,
  };
}

const X_HOSTS = new Set(["x.com", "www.x.com"]);
const X_LANDING_URL = "https://x.com/";

export function persistentBrowserUrl(value: string, options: { popup?: boolean } = {}): string {
  const url = new URL(value);
  if (X_HOSTS.has(url.hostname) && url.pathname === "/i/jf/onboarding/web") {
    return X_LANDING_URL;
  }
  if (options.popup) {
    // A restart cannot resume the popup's live authorization exchange. Keep ordinary
    // query parameters, but do not save or replay callback credentials.
    url.username = "";
    url.password = "";
    const fragment = new URLSearchParams(url.hash.slice(1));
    let changedFragment = false;
    for (const key of ["code", "state", "access_token", "id_token", "refresh_token", "oauth_token", "oauth_verifier"]) {
      url.searchParams.delete(key);
      if (fragment.has(key)) {
        fragment.delete(key);
        changedFragment = true;
      }
    }
    if (changedFragment) url.hash = fragment.toString();
  }
  return url.toString();
}

export function isPersistableBrowserUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** A stored tab, or `null` when the value is not one. */
function storedBrowserTab(value: unknown): StoredBrowserTab | null {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !value.id ||
    value.id.length > INPUT_LIMITS.identifier ||
    !isString(value.url) ||
    value.url.length > INPUT_LIMITS.browserUrl
  ) {
    return null;
  }
  const ownerThreadId = value.ownerThreadId;
  if (ownerThreadId !== null && (!isString(ownerThreadId) || ownerThreadId.length > INPUT_LIMITS.identifier)) {
    return null;
  }
  const ownerAgentId = value.ownerAgentId ?? null;
  if (ownerAgentId !== null && (!isString(ownerAgentId) || ownerAgentId.length > INPUT_LIMITS.identifier)) {
    return null;
  }
  if (!isPersistableBrowserUrl(value.url)) return null;
  // A tab whose session cannot be read is dropped: loading it in the shared session would show it
  // signed in to another account.
  if (value.agentSession !== undefined && !isAgentBrowserSessionKey(value.agentSession)) return null;
  if (value.profile !== undefined && !isBrowserProfileId(value.profile)) return null;
  const environment = browserEnvironment(value.environment);
  return {
    id: value.id,
    url: value.url,
    ownerThreadId,
    ownerAgentId,
    ...(environment === null ? {} : { environment }),
    ...(value.agentSession === undefined ? {} : { agentSession: value.agentSession }),
    ...(value.profile === undefined ? {} : { profile: value.profile }),
  };
}

/** The agent a restored tab can belong to. */
export interface BrowserTabOwner {
  id: string;
  threadId: string | null;
}

/** A tab that arrives without an environment is given the default rather than dropped. */
export interface StoredBrowserStateV2 {
  version: 2;
  activeTabId: string | null;
  tabs: Array<StoredBrowserTab & { environment: BrowserEnvironment }>;
}
export const readBrowserState = Effect.fn("Browser.readState")((path: string) =>
  Effect.gen(function* () {
    const content = yield* browserCall((signal) => readFile(path, { encoding: "utf8", signal }));
    return yield* browserSync((): StoredBrowserStateV2 => {
      const parsed = JSON.parse(content);
      if (!isRecord(parsed) || parsed.version !== 2) {
        return { version: 2, activeTabId: null, tabs: [] };
      }
      const tabs = Array.isArray(parsed.tabs)
        ? parsed.tabs
            .map(storedBrowserTab)
            .filter((tab) => tab !== null)
            .map((tab) => ({
              ...tab,
              url: persistentBrowserUrl(tab.url),
              environment: tab.environment ?? defaultBrowserEnvironment(),
            }))
        : [];
      return {
        version: 2,
        activeTabId: isString(parsed.activeTabId) ? parsed.activeTabId : null,
        tabs: tabs.filter((tab, index) => tabs.findIndex((candidate) => candidate.id === tab.id) === index),
      };
    });
  }).pipe(
    Effect.catch((error) =>
      isMissingFileError(error.cause) || error.cause instanceof SyntaxError
        ? Effect.succeed<StoredBrowserStateV2>({ version: 2, activeTabId: null, tabs: [] })
        : Effect.fail(error),
    ),
  ),
);

export function resolveEnvironment(
  value: BrowserToolArguments<"set_environment">,
  current: BrowserEnvironment,
  bounds: BrowserBounds,
): BrowserEnvironment {
  const preset = value.preset;
  const presetSize = presetDimensions(preset);
  const explicitScale = value.deviceScaleFactor !== undefined;
  const scaleConvertsFill =
    explicitScale && (preset === "fill" || (preset === undefined && current.viewport.mode === "fill"));
  const requestedWidth =
    value.width ??
    presetSize?.width ??
    (preset === "fill" || scaleConvertsFill ? bounds.width : current.viewport.width);
  const requestedHeight =
    value.height ??
    presetSize?.height ??
    (preset === "fill" || scaleConvertsFill ? bounds.height : current.viewport.height);
  const width = Math.round(requestedWidth);
  const height = Math.round(requestedHeight);
  const mode =
    preset === "fill" && !explicitScale
      ? "fill"
      : preset || value.width !== undefined || value.height !== undefined || explicitScale
        ? "custom"
        : current.viewport.mode;
  const minimumWidth = mode === "fill" ? 1 : 320;
  const minimumHeight = mode === "fill" ? 1 : 240;
  if (
    width < minimumWidth ||
    width > INPUT_LIMITS.browserDimension ||
    height < minimumHeight ||
    height > INPUT_LIMITS.browserDimension
  ) {
    throw new Error("Viewport dimensions are outside the supported range.");
  }
  // Fill clears the device metrics override, so it cannot inherit a custom emulation scale.
  const scale =
    mode === "fill" ? 1 : (value.deviceScaleFactor ?? presetSize?.scale ?? current.viewport.deviceScaleFactor);
  if (scale < 0.5 || scale > 4) throw new Error("deviceScaleFactor must be between 0.5 and 4.");
  if (!isSafeViewportSize(width, height, scale)) {
    throw new Error(`The physical viewport must not exceed ${MAX_PHYSICAL_VIEWPORT_PIXELS.toLocaleString()} pixels.`);
  }
  const resolvedPreset =
    preset === "desktop" || preset === "tablet" || preset === "mobile"
      ? preset
      : preset === "custom" || preset === "fill"
        ? null
        : current.viewport.preset;
  return {
    viewport: {
      mode,
      width,
      height,
      deviceScaleFactor: scale,
      preset: resolvedPreset,
    },
    colorScheme: value.colorScheme ?? current.colorScheme,
    reducedMotion: value.reducedMotion ?? current.reducedMotion,
  };
}

function presetDimensions(preset: "fill" | "desktop" | "tablet" | "mobile" | "custom" | undefined) {
  switch (preset) {
    case "desktop":
      return { width: 1440, height: 900, scale: 1 };
    case "tablet":
      return { width: 820, height: 1180, scale: 2 };
    case "mobile":
      return { width: 390, height: 844, scale: 3 };
    default:
      return null;
  }
}
