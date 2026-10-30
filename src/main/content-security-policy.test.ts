import { afterEach, describe, expect, it, vi } from "vitest";
import { buildContentSecurityPolicy, readSelfHostedSignalOrigin } from "./content-security-policy";

/** Builds the policy with the switch set to `localOnly`, whatever `local-only.json` says. */
async function policyWithSwitch(localOnly: boolean) {
  vi.resetModules();
  vi.doMock("../../packages/contracts/src/local-only.json", () => ({ default: { localOnly } }));
  return (await import("./content-security-policy")).buildContentSecurityPolicy;
}

afterEach(() => {
  vi.doUnmock("../../packages/contracts/src/local-only.json");
});

function directive(policy: string, name: string): string | undefined {
  return policy.split("; ").find((candidate) => candidate.startsWith(`${name} `));
}

const CONNECT_WITHOUT_OPENOWNBOT = "connect-src 'self' openbot-attachment: openbot-remote-attachment: ws://127.0.0.1:*";
const CONNECT_WITH_OPENOWNBOT =
  "connect-src 'self' openbot-attachment: openbot-remote-attachment: ws://127.0.0.1:* wss://*.openbot.run";
const FRAME_WITHOUT_OPENOWNBOT =
  "frame-src 'self' openbot-attachment: openbot-remote-attachment: openownbot-visual: openownbot-remote-visual: http://127.0.0.1:* http://localhost:*";
const FRAME_WITH_OPENOWNBOT =
  "frame-src 'self' openbot-attachment: openbot-remote-attachment: openownbot-visual: openownbot-remote-visual: https://*.openbot.run http://127.0.0.1:* http://localhost:*";

describe("buildContentSecurityPolicy", () => {
  it("allows the analytics endpoint and the ROBot hosts only while the switch is off", async () => {
    const build = await policyWithSwitch(false);
    const policy = build(true);

    expect(directive(policy, "connect-src")).toBe(CONNECT_WITH_OPENOWNBOT);
    expect(directive(policy, "connect-src")).not.toContain("localhost");
    expect(directive(build(false), "frame-src")).toBe(FRAME_WITH_OPENOWNBOT);
    expect(directive(policy, "frame-src")).toBe(FRAME_WITH_OPENOWNBOT);
  });

  it.each([true, false])("allows no ROBot host while the switch is on and packaged=%s", async (packaged) => {
    const build = await policyWithSwitch(true);
    const policy = build(packaged);

    expect(directive(policy, "frame-src")).toBe(FRAME_WITHOUT_OPENOWNBOT);
    expect(policy).not.toContain("openbot.run");
    expect(policy).not.toContain("openbot.site");
  });

  it("keeps the loopback sockets and the self-hosted Signal while the switch is on", async () => {
    const build = await policyWithSwitch(true);

    expect(directive(build(true), "connect-src")).toBe(CONNECT_WITHOUT_OPENOWNBOT);
    expect(directive(build(true, undefined, "wss://signal.example.com:8443"), "connect-src")).toBe(
      `${CONNECT_WITHOUT_OPENOWNBOT} wss://signal.example.com:8443`,
    );
  });

  it.each([true, false])("keeps script-src to the app itself when packaged=%s", (packaged) => {
    expect(directive(buildContentSecurityPolicy(packaged), "script-src")).toBe("script-src 'self'");
  });

  it("lets the renderer play an attachment recording, but only from the attachment schemes", () => {
    const policy = buildContentSecurityPolicy(true);

    expect(policy).toContain("media-src 'self' blob: openbot-attachment: openbot-remote-attachment:");
    expect(policy).not.toContain("media-src 'self' blob: openbot-attachment: openbot-remote-attachment: https:");
  });

  it("keeps local development sources", () => {
    const policy = buildContentSecurityPolicy(false, "ws://192.168.1.143:3101/v1/signal");

    expect(policy).toContain("http://localhost:*");
    expect(policy).toContain("ws://localhost:*");
    expect(policy).toContain("ws://192.168.1.143:3101");
  });

  it("does not add public or production Signal origins through the development option", () => {
    expect(buildContentSecurityPolicy(false, "ws://signal.example.com/v1/signal")).not.toContain(
      "ws://signal.example.com",
    );
    expect(buildContentSecurityPolicy(true, "ws://192.168.1.143:3101/v1/signal")).not.toContain(
      "ws://192.168.1.143:3101",
    );
  });

  it("adds only the origin of a self-hosted Signal to connect-src", () => {
    const origin = readSelfHostedSignalOrigin("https://api.example.com", "wss://signal.example.com:8443/v1/signal");
    const connect = buildContentSecurityPolicy(true, undefined, origin)
      .split("; ")
      .find((directive) => directive.startsWith("connect-src "));

    expect(origin).toBe("wss://signal.example.com:8443");
    expect(connect).toContain(" wss://signal.example.com:8443");
    expect(readSelfHostedSignalOrigin(undefined, undefined)).toBeNull();
  });

  it.each([
    [undefined, "wss://signal.example.com/v1/signal", "OPENOWNBOT_REMOTE_SIGNAL_URL needs OPENOWNBOT_AUTH_API_URL."],
    ["https://api.example.com", "ws://signal.example.com/v1/signal", "must be a wss: URL"],
    ["https://api.example.com", "https://signal.example.com/v1/signal", "must be a wss: URL"],
    ["https://api.example.com", "wss://user:pass@signal.example.com/v1/signal", "must be a wss: URL"],
  ])("refuses a self-hosted Signal URL with auth API %s and Signal %s", (authApiUrl, signalUrl, message) => {
    expect(() => readSelfHostedSignalOrigin(authApiUrl, signalUrl)).toThrow(message);
  });
});
