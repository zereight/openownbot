import { type GuardableScope, LOCAL_ONLY } from "@openbot/contracts/local-only";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Loads the contract with the switch set to `localOnly`, whatever `local-only.json` says. */
async function contractWithSwitch(localOnly: boolean) {
  vi.resetModules();
  vi.doMock("../../packages/contracts/src/local-only.json", () => ({ default: { localOnly } }));
  return await import("@openbot/contracts/local-only");
}

afterEach(() => {
  vi.doUnmock("../../packages/contracts/src/local-only.json");
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

describe("refusesOpenBotUrl", () => {
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
    const { refusesOpenBotUrl } = await contractWithSwitch(true);
    expect(refusesOpenBotUrl(url)).toBe(true);
    expect(refusesOpenBotUrl(new URL(url))).toBe(true);
  });

  it.each([
    "https://openbot.run.example.com",
    "https://notopenbot.run",
    "https://github.com/zereight/openbot",
    "https://api.github.com/repos/zereight/openbot/releases",
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
    const { refusesOpenBotUrl } = await contractWithSwitch(true);
    expect(refusesOpenBotUrl(url)).toBe(false);
  });

  it("refuses nothing while the switch is off", async () => {
    const { refusesOpenBotUrl } = await contractWithSwitch(false);
    expect(refusesOpenBotUrl("https://x.openbot.run/v1")).toBe(false);
    expect(refusesOpenBotUrl("https://github.com/nightly-labs/openbot")).toBe(false);
  });
});

describe("mentionsOpenBotService", () => {
  it.each([
    "https://x.openbot.run/v1/ping",
    "see OpenBot.Run.",
    "wss://*.openbot.run",
    "owner: nightly-labs",
    "https://demo.openbot.site/",
    "https://u.expo.dev/eeec730f-c8f4-42c0-a750-64df8af14940",
  ])("finds a service in %j", async (text) => {
    const { mentionsOpenBotService } = await contractWithSwitch(true);
    expect(mentionsOpenBotService(text)).toBe(true);
  });

  it.each([
    "notopenbot.run",
    "my-openbot.run",
    "https://openbot.run.example.com",
    "nightly-labs-fork",
    "https://github.com/zereight/openbot",
    "https://u.expo.dev/00000000-0000-0000-0000-000000000000",
    '"projectId": "eeec730f-c8f4-42c0-a750-64df8af14940"',
    "",
  ])("finds nothing in %j", async (text) => {
    const { mentionsOpenBotService } = await contractWithSwitch(true);
    expect(mentionsOpenBotService(text)).toBe(false);
  });

  it("does not depend on the switch", async () => {
    const { mentionsOpenBotService } = await contractWithSwitch(false);
    expect(mentionsOpenBotService("https://x.openbot.run")).toBe(true);
  });
});

describe("guardOpenBotEgress", () => {
  it("makes fetch reject with a TypeError and reports the origin without the path", async () => {
    const { guardOpenBotEgress } = await contractWithSwitch(true);
    const { scope, fetched } = fakeScope();
    const reported: string[] = [];
    guardOpenBotEgress(scope, (origin) => reported.push(origin));

    await expect(scope.fetch("https://x.openbot.run/v1/tickets/secret?token=abc")).rejects.toBeInstanceOf(TypeError);
    await expect(scope.fetch(new URL("https://api.openbot.run/v1/account"))).rejects.toBeInstanceOf(TypeError);
    await expect(scope.fetch(new Request("https://github.com/nightly-labs/openbot/releases"))).rejects.toBeInstanceOf(
      TypeError,
    );

    expect(fetched).toEqual([]);
    expect(reported).toEqual(["https://x.openbot.run", "https://api.openbot.run", "https://github.com"]);
  });

  it("makes the WebSocket constructor throw a TypeError for a refused URL", async () => {
    const { guardOpenBotEgress } = await contractWithSwitch(true);
    const { scope, dialed } = fakeScope();
    const reported: string[] = [];
    guardOpenBotEgress(scope, (origin) => reported.push(origin));
    const GuardedWebSocket = scope.WebSocket;
    if (GuardedWebSocket === undefined) throw new Error("the guard removed WebSocket");

    expect(() => new GuardedWebSocket("wss://signal.openbot.run/v1/signal")).toThrow(TypeError);
    expect(() => new GuardedWebSocket(new URL("wss://signal.openbot.run/v1/signal"))).toThrow(TypeError);

    expect(dialed).toEqual([]);
    expect(reported).toEqual(["wss://signal.openbot.run", "wss://signal.openbot.run"]);
  });

  it("passes an allowed URL through to the original fetch and WebSocket", async () => {
    const { guardOpenBotEgress } = await contractWithSwitch(true);
    const { scope, fetched, dialed } = fakeScope();
    const reported: string[] = [];
    guardOpenBotEgress(scope, (origin) => reported.push(origin));
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
    const { guardOpenBotEgress } = await contractWithSwitch(true);
    const { scope } = fakeScope();
    const first: string[] = [];
    const second: string[] = [];
    guardOpenBotEgress(scope, (origin) => first.push(origin));
    const { fetch: guardedFetch, WebSocket: guardedWebSocket } = scope;

    guardOpenBotEgress(scope, (origin) => second.push(origin));
    await expect(scope.fetch("https://x.openbot.run/")).rejects.toBeInstanceOf(TypeError);

    expect(scope.fetch).toBe(guardedFetch);
    expect(scope.WebSocket).toBe(guardedWebSocket);
    expect(first).toEqual(["https://x.openbot.run"]);
    expect(second).toEqual([]);
  });

  it("leaves the scope alone while the switch is off", async () => {
    const { guardOpenBotEgress } = await contractWithSwitch(false);
    const { scope, fetched } = fakeScope();
    const { fetch: originalFetch, WebSocket: originalWebSocket } = scope;
    guardOpenBotEgress(scope);

    expect(scope.fetch).toBe(originalFetch);
    expect(scope.WebSocket).toBe(originalWebSocket);
    await scope.fetch("https://x.openbot.run/v1");
    expect(fetched).toEqual([{ url: "https://x.openbot.run/v1", init: undefined }]);
  });

  it("guards a scope that has no WebSocket", async () => {
    const { guardOpenBotEgress } = await contractWithSwitch(true);
    const { scope } = fakeScope();
    const withoutSocket: GuardableScope = { fetch: scope.fetch };
    guardOpenBotEgress(withoutSocket);

    await expect(withoutSocket.fetch("https://x.openbot.run/")).rejects.toBeInstanceOf(TypeError);
    expect(withoutSocket.WebSocket).toBeUndefined();
  });
});
