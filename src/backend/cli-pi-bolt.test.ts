// @vitest-environment node
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { configuredCliPath, parsePiVersion, resolvePiBoltCli } from "./cli";
import { PiAgentClient } from "./pi-client";
import { NO_PROVIDER_CREDENTIALS, requireProviderDriver } from "./provider-drivers";

// Failure modes: a hyphenated id reads a variable name no shell can set; Pi-Bolt's version line,
// which carries build details after the Pi version, is not read; a missing command is reported as
// installed; or an older Pi build is accepted.
const folders: string[] = [];
const saved = process.env.OPENBOT_PI_BOLT_PATH;
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  if (saved === undefined) delete process.env.OPENBOT_PI_BOLT_PATH;
  else process.env.OPENBOT_PI_BOLT_PATH = saved;
});

function fakeCommand(versionLine: string): string {
  const folder = mkdtempSync(join(tmpdir(), "openbot-pi-bolt-"));
  folders.push(folder);
  const path = join(folder, "pi-bolt");
  writeFileSync(path, `#!/bin/sh\necho '${versionLine}'\n`);
  chmodSync(path, 0o755);
  return path;
}

describe("Pi-Bolt command", () => {
  it("reads the path from OPENBOT_PI_BOLT_PATH", () => {
    process.env.OPENBOT_PI_BOLT_PATH = "/tmp/custom/pi-bolt";
    expect(configuredCliPath("pi-bolt")).toBe("/tmp/custom/pi-bolt");
  });

  it("reads the Pi version from the Pi-Bolt version line", () => {
    expect(parsePiVersion("1.4.0 (Pi-Bolt 1.0.5, darwin-arm64, JIT off)")).toBe("1.4.0");
  });

  it("resolves a Pi-Bolt command as a system command", async () => {
    const executable = fakeCommand("1.4.0 (Pi-Bolt 1.0.5, darwin-arm64, JIT off)");
    const cli = await Effect.runPromise(resolvePiBoltCli({ systemCandidates: [executable] }));
    expect(cli).toMatchObject({ executable, version: "1.4.0", source: "system" });
  });

  it("refuses a build older than Pi 1.1.0", async () => {
    const executable = fakeCommand("1.0.9 (Pi-Bolt 0.9.0, darwin-arm64, JIT off)");
    await expect(Effect.runPromise(resolvePiBoltCli({ systemCandidates: [executable] }))).rejects.toThrow();
  });

  it("fails when no command exists", async () => {
    await expect(
      Effect.runPromise(resolvePiBoltCli({ systemCandidates: ["/nonexistent/openbot-pi-bolt"] })),
    ).rejects.toThrow();
  });

  // Without its own identity the client reported "pi", so the models of Pi-Bolt appeared in the Pi
  // row twice and the Pi-Bolt row listed none.
  it("keeps its models in its own row", () => {
    const cli = { executable: "/tmp/pi-bolt", version: "1.4.0", source: "system" as const };
    expect(new PiAgentClient(cli, { requestTimeoutMs: 1_000, identity: "pi-bolt" }).provider).toBe("pi-bolt");
    expect(new PiAgentClient(cli, { requestTimeoutMs: 1_000 }).provider).toBe("pi");
  });

  it("builds a client for the Pi-Bolt row from its driver", () => {
    const cli = { executable: "/tmp/pi-bolt", version: "1.4.0", source: "system" as const };
    const client = requireProviderDriver("pi-bolt").createClient(cli, 1_000, NO_PROVIDER_CREDENTIALS, undefined);
    expect(client.provider).toBe("pi-bolt");
  });
});
