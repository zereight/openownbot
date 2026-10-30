import { type GuardableScope, LOCAL_ONLY } from "@robot/contracts/local-only";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuardableSession } from "./local-only-guard";

type BeforeRequestListener = Parameters<GuardableSession["webRequest"]["onBeforeRequest"]>[1];

// electron cannot be imported outside an Electron process, so the listeners that the guard adds to
// `app` and the session it reads are captured. Hoisted because the factory runs while
// ./local-only-guard is imported.
interface ElectronCapture {
  sessionCreated: Array<(created: GuardableSession) => void>;
  defaultSession: GuardableSession | null;
}
const electron = vi.hoisted((): ElectronCapture => ({ sessionCreated: [], defaultSession: null }));

vi.mock("electron", () => ({
  app: {
    on(event: string, listener: (created: GuardableSession) => void) {
      if (event === "session-created") electron.sessionCreated.push(listener);
    },
    whenReady: () => Promise.resolve(),
  },
  session: {
    get defaultSession() {
      return electron.defaultSession;
    },
  },
}));

/** Loads the contract with the switch set to `localOnly`, whatever `local-only.json` says. */
async function contractWithSwitch(localOnly: boolean) {
  vi.resetModules();
  vi.doMock("../../packages/contracts/src/local-only.json", () => ({ default: { localOnly } }));
  return await import("@robot/contracts/local-only");
}

async function guardWithSwitch(localOnly: boolean) {
  await contractWithSwitch(localOnly);
  return { guard: await import("./local-only-guard"), logging: await import("@robot/logging") };
}

/** A session that keeps one `onBeforeRequest` listener, as Electron does: a repeat call replaces it. */
class FakeSession implements GuardableSession {
  filter: { urls: string[] } | null = null;
  #listener: BeforeRequestListener | null = null;
  registrations = 0;

  webRequest = {
    onBeforeRequest: (filter: { urls: string[] }, listener: BeforeRequestListener) => {
      this.registrations += 1;
      this.filter = filter;
      this.#listener = listener;
    },
  };

  /** What the listener answers for a request to `url`, or null when no listener is set. */
  answer(url: string): { cancel: boolean } | null {
    let response: { cancel: boolean } | null = null;
    this.#listener?.({ url }, (value) => {
      response = value;
    });
    return response;
  }
}

let defaultSession = new FakeSession();

beforeEach(() => {
  vi.stubGlobal("fetch", globalThis.fetch);
  vi.stubGlobal("WebSocket", globalThis.WebSocket);
  defaultSession = new FakeSession();
  electron.sessionCreated = [];
  electron.defaultSession = defaultSession;
});

afterEach(() => {
  vi.doUnmock("../../packages/contracts/src/local-only.json");
  vi.unstubAllGlobals();
});

interface FakeScope {
  scope: GuardableScope;
  fetched: Array<{ url: string; init: RequestInit | undefined }>;
  dialed: string[];
}

/** A scope whose `fetch` and `WebSocket` only record what reached them. */
function fakeScope(): FakeScope {
  const fetched: FakeScope["fetched"] = [];
  const dialed: string[] = [];
  const scope: GuardableScope = {
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      fetched.push({ url: input instanceof Request ? input.url : String(input), init });
      return new Response("from the original fetch");
    },
    WebSocket: new Proxy(WebSocket, {
      construct(_target, args) {
        dialed.push(String(args[0]));
        return Object.create(WebSocket.prototype);
      },
    }),
  };
  return { scope, fetched, dialed };
}

describe("the shipped switch", () => {
  it("is on in this fork", () => {
    expect(LOCAL_ONLY).toBe(true);
  });
});

describe("refusesOpenOwnBotUrl", () => {
  it.each([
    "https://x.openbot.run/v1",
    "https://OPENBOT.RUN./",
    "https://demo.openbot.site",
    "https://github.com/Nightly-Labs/openbot/releases",
    "https://api.github.com/repos/nightly-labs/openbot/releases",
    "https://raw.githubusercontent.com/nightly-labs/openbot/main/x.json",
    "turn:turn.openbot.run:3478",
    "turns:TURN.OpenBot.run:5349?transport=tcp",
    "wss://signal.openbot.run/v1/signal",
    "https://u.expo.dev/eeec730f-c8f4-42c0-a750-64df8af14940",
    "https://u.expo.dev/EEEC730F-c8f4-42c0-a750-64df8af14940/manifest",
    "https://nightly-labs.github.io/docs",
    "https://ghcr.io/v2/nightly-labs/openbot/manifests/latest",
  ])("refuses %s while the switch is on", async (url) => {
    const { refusesOpenOwnBotUrl } = await contractWithSwitch(true);
    expect(refusesOpenOwnBotUrl(url)).toBe(true);
    expect(refusesOpenOwnBotUrl(new URL(url))).toBe(true);
  });

  it.each([
    "https://openbot.run.example.com",
    "https://notopenbot.run",
    "https://github.com/zereight/openownbot",
    "https://api.github.com/repos/zereight/openownbot/releases",
    "https://api.anthropic.com/v1/messages",
    "https://u.expo.dev/00000000-0000-0000-0000-000000000000",
    "https://u.expo.dev/eeec730f-c8f4-42c0-a750-64df8af14940-other",
    "http://127.0.0.1:3100",
    "https://host.tail1234.ts.net:8443",
    "turn:turn.example.com:3478",
    "http://",
    "not a url",
    "",
  ])("lets %j through", async (url) => {
    const { refusesOpenOwnBotUrl } = await contractWithSwitch(true);
    expect(refusesOpenOwnBotUrl(url)).toBe(false);
  });

  it("refuses nothing while the switch is off", async () => {
    const { refusesOpenOwnBotUrl } = await contractWithSwitch(false);
    expect(refusesOpenOwnBotUrl("https://x.openbot.run/v1")).toBe(false);
    expect(refusesOpenOwnBotUrl("https://github.com/zereight/openownbot")).toBe(false);
  });
});

describe("mentionsOpenOwnBotService", () => {
  it.each([
    "https://x.openbot.run/v1/ping",
    "see OpenBot.Run.",
    "wss://*.openbot.run",
    "owner: nightly-labs",
    "https://demo.openbot.site/",
    "https://u.expo.dev/eeec730f-c8f4-42c0-a750-64df8af14940",
  ])("finds a service in %j", async (text) => {
    const { mentionsOpenOwnBotService } = await contractWithSwitch(true);
    expect(mentionsOpenOwnBotService(text)).toBe(true);
  });

  it.each([
    "notopenbot.run",
    "my-openbot.run",
    "https://openbot.run.example.com",
    "nightly-labs-fork",
    "https://github.com/zereight/openownbot",
    "https://u.expo.dev/00000000-0000-0000-0000-000000000000",
    '"projectId": "eeec730f-c8f4-42c0-a750-64df8af14940"',
    "",
  ])("finds nothing in %j", async (text) => {
    const { mentionsOpenOwnBotService } = await contractWithSwitch(true);
    expect(mentionsOpenOwnBotService(text)).toBe(false);
  });

  it("does not depend on the switch", async () => {
    const { mentionsOpenOwnBotService } = await contractWithSwitch(false);
    expect(mentionsOpenOwnBotService("https://x.openbot.run")).toBe(true);
  });
});

describe("guardOpenOwnBotEgress", () => {
  it("makes fetch reject with a TypeError and reports the origin without the path", async () => {
    const { guardOpenOwnBotEgress } = await contractWithSwitch(true);
    const { scope, fetched } = fakeScope();
    const reported: string[] = [];
    guardOpenOwnBotEgress(scope, (origin) => reported.push(origin));

    await expect(scope.fetch("https://x.openbot.run/v1/tickets/secret?token=abc")).rejects.toBeInstanceOf(TypeError);
    await expect(scope.fetch(new URL("https://api.openbot.run/v1/account"))).rejects.toBeInstanceOf(TypeError);
    await expect(scope.fetch(new Request("https://github.com/nightly-labs/openbot/releases"))).rejects.toBeInstanceOf(
      TypeError,
    );

    expect(fetched).toEqual([]);
    expect(reported).toEqual(["https://x.openbot.run", "https://api.openbot.run", "https://github.com"]);
  });

  it("makes the WebSocket constructor throw a TypeError for a refused URL", async () => {
    const { guardOpenOwnBotEgress } = await contractWithSwitch(true);
    const { scope, dialed } = fakeScope();
    const reported: string[] = [];
    guardOpenOwnBotEgress(scope, (origin) => reported.push(origin));
    const GuardedWebSocket = scope.WebSocket;
    if (GuardedWebSocket === undefined) throw new Error("the guard removed WebSocket");

    expect(() => new GuardedWebSocket("wss://signal.openbot.run/v1/signal")).toThrow(TypeError);
    expect(() => new GuardedWebSocket(new URL("wss://signal.openbot.run/v1/signal"))).toThrow(TypeError);

    expect(dialed).toEqual([]);
    expect(reported).toEqual(["wss://signal.openbot.run", "wss://signal.openbot.run"]);
  });

  it("passes an allowed URL through to the original fetch and WebSocket", async () => {
    const { guardOpenOwnBotEgress } = await contractWithSwitch(true);
    const { scope, fetched, dialed } = fakeScope();
    const reported: string[] = [];
    guardOpenOwnBotEgress(scope, (origin) => reported.push(origin));
    const GuardedWebSocket = scope.WebSocket;
    if (GuardedWebSocket === undefined) throw new Error("the guard removed WebSocket");

    const init = { method: "POST", body: "{}" };
    const response = await scope.fetch("https://api.anthropic.com/v1/messages", init);
    const socket = new GuardedWebSocket("ws://127.0.0.1:3100/v1/signal");

    expect(await response.text()).toBe("from the original fetch");
    expect(fetched).toEqual([{ url: "https://api.anthropic.com/v1/messages", init }]);
    expect(dialed).toEqual(["ws://127.0.0.1:3100/v1/signal"]);
    expect(socket).toBeInstanceOf(WebSocket);
    expect(GuardedWebSocket.OPEN).toBe(WebSocket.OPEN);
    expect(reported).toEqual([]);
  });

  it("changes nothing on a second call", async () => {
    const { guardOpenOwnBotEgress } = await contractWithSwitch(true);
    const { scope } = fakeScope();
    const first: string[] = [];
    const second: string[] = [];
    guardOpenOwnBotEgress(scope, (origin) => first.push(origin));
    const { fetch: guardedFetch, WebSocket: guardedWebSocket } = scope;

    guardOpenOwnBotEgress(scope, (origin) => second.push(origin));
    await expect(scope.fetch("https://x.openbot.run/")).rejects.toBeInstanceOf(TypeError);

    expect(scope.fetch).toBe(guardedFetch);
    expect(scope.WebSocket).toBe(guardedWebSocket);
    expect(first).toEqual(["https://x.openbot.run"]);
    expect(second).toEqual([]);
  });

  it("leaves the scope alone while the switch is off", async () => {
    const { guardOpenOwnBotEgress } = await contractWithSwitch(false);
    const { scope, fetched } = fakeScope();
    const { fetch: originalFetch, WebSocket: originalWebSocket } = scope;
    guardOpenOwnBotEgress(scope);

    expect(scope.fetch).toBe(originalFetch);
    expect(scope.WebSocket).toBe(originalWebSocket);
    await scope.fetch("https://x.openbot.run/v1");
    expect(fetched).toEqual([{ url: "https://x.openbot.run/v1", init: undefined }]);
  });

  it("guards a scope that has no WebSocket", async () => {
    const { guardOpenOwnBotEgress } = await contractWithSwitch(true);
    const { scope } = fakeScope();
    const withoutSocket: GuardableScope = { fetch: scope.fetch };
    guardOpenOwnBotEgress(withoutSocket);

    await expect(withoutSocket.fetch("https://x.openbot.run/")).rejects.toBeInstanceOf(TypeError);
    expect(withoutSocket.WebSocket).toBeUndefined();
  });
});

describe("guardSession", () => {
  it("cancels a request to an OpenOwnBot service and reports the origin without the path", async () => {
    const { guard } = await guardWithSwitch(true);
    const fake = new FakeSession();
    const reported: string[] = [];
    guard.guardSession(fake, (origin) => reported.push(origin));

    expect(fake.filter).toEqual({ urls: ["<all_urls>"] });
    expect(fake.answer("https://api.openbot.run/v1/tickets/secret?token=abc")).toEqual({ cancel: true });
    expect(fake.answer("wss://signal.openbot.run/v1/signal")).toEqual({ cancel: true });
    expect(fake.answer("https://github.com/nightly-labs/openbot/releases/latest")).toEqual({ cancel: true });
    expect(reported).toEqual(["https://api.openbot.run", "wss://signal.openbot.run", "https://github.com"]);
  });

  it("lets every other request through without a report", async () => {
    const { guard } = await guardWithSwitch(true);
    const fake = new FakeSession();
    const reported: string[] = [];
    guard.guardSession(fake, (origin) => reported.push(origin));

    expect(fake.answer("https://api.anthropic.com/v1/messages")).toEqual({ cancel: false });
    expect(fake.answer("http://127.0.0.1:3100/v1/health")).toEqual({ cancel: false });
    expect(fake.answer("https://github.com/zereight/openownbot")).toEqual({ cancel: false });
    expect(reported).toEqual([]);
  });
});

describe("installLocalOnlyGuard", () => {
  it("refuses an OpenOwnBot fetch and WebSocket in this process and passes others to the originals", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      fetched.push(String(input));
      return new Response("from the original fetch");
    });
    const { guard } = await guardWithSwitch(true);
    guard.installLocalOnlyGuard();

    await expect(globalThis.fetch("https://x.openbot.run/v1/ping")).rejects.toBeInstanceOf(TypeError);
    expect(() => new globalThis.WebSocket("wss://signal.openbot.run/v1/signal")).toThrow(TypeError);
    const response = await globalThis.fetch("https://api.anthropic.com/v1/messages");

    expect(await response.text()).toBe("from the original fetch");
    expect(fetched).toEqual(["https://api.anthropic.com/v1/messages"]);
  });

  it("guards a session when Electron creates it and the default session when the app is ready", async () => {
    const { guard } = await guardWithSwitch(true);
    guard.installLocalOnlyGuard();

    const browserPane = new FakeSession();
    for (const listener of electron.sessionCreated) listener(browserPane);

    expect(browserPane.answer("https://u.expo.dev/eeec730f-c8f4-42c0-a750-64df8af14940")).toEqual({ cancel: true });
    await vi.waitFor(() => expect(defaultSession.registrations).toBe(1));
    expect(defaultSession.answer("https://x.openbot.site/")).toEqual({ cancel: true });
    expect(defaultSession.answer("https://example.com/")).toEqual({ cancel: false });
  });

  it("keeps one listener on a session that Electron reports and the app also guards", async () => {
    const { guard } = await guardWithSwitch(true);
    guard.installLocalOnlyGuard();
    for (const listener of electron.sessionCreated) listener(defaultSession);
    await vi.waitFor(() => expect(defaultSession.registrations).toBe(2));

    expect(defaultSession.answer("https://x.openbot.run/")).toEqual({ cancel: true });
  });

  it("logs a refused origin once and never the path", async () => {
    const { guard, logging } = await guardWithSwitch(true);
    const lines: string[] = [];
    const stopTee = logging.teeLogLines(["local-only-guard"], (line) => lines.push(line));
    vi.stubGlobal("fetch", async () => new Response("from the original fetch"));
    guard.installLocalOnlyGuard();
    await vi.waitFor(() => expect(defaultSession.registrations).toBe(1));

    await expect(globalThis.fetch("https://x.openbot.run/v1/tickets/secret-ticket")).rejects.toBeInstanceOf(TypeError);
    defaultSession.answer("https://x.openbot.run/v1/other?token=abc");
    defaultSession.answer("https://api.openbot.run/v1/account");
    stopTee();

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Local-only mode refused a request to https://x.openbot.run.");
    expect(lines[1]).toContain("Local-only mode refused a request to https://api.openbot.run.");
    expect(lines.join("\n")).not.toMatch(/secret-ticket|token=abc|\/v1\//);
  });

  it("changes nothing while the switch is off", async () => {
    const before = { fetch: globalThis.fetch, WebSocket: globalThis.WebSocket };
    const { guard } = await guardWithSwitch(false);
    guard.installLocalOnlyGuard();

    expect(globalThis.fetch).toBe(before.fetch);
    expect(globalThis.WebSocket).toBe(before.WebSocket);
    expect(electron.sessionCreated).toEqual([]);
  });
});
