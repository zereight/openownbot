// Checks who may sign in with a password on a real host. A member that has an account must use the
// account: the host refuses the password of that member, and keeps the stored hash. A member with no
// account still signs in with the password. A real `TeamApiServer` runs on loopback with the real team
// store on a temporary profile, in a child process of this script. A client of the oldest protocol and
// a client of protocol 7 send the requests through the released `/v1/auth/login` route. The host
// process restarts on the same files between the phases, and the refusal must still hold.
// Run: `bun scripts/team-password-login-e2e.ts`.
// Writes .openownbot-build/team-password-login-e2e/report.json.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TEAM_API_ROUTES } from "@openownbot/contracts/team-api-routes";
import {
  TEAM_APP_VERSION_HEADER,
  TEAM_CAPABILITIES_HEADER,
  TEAM_PROTOCOL_V1,
  TEAM_PROTOCOL_V7,
  TEAM_PROTOCOL_V7_CAPABILITIES,
  TEAM_PROTOCOL_VERSION_HEADER,
} from "@openownbot/contracts/team-protocol";
import { plugin } from "bun";
import { Effect } from "effect";
import type { AgentBrowserHost } from "../src/backend/agent/turn-lifecycle";
import { AgentService } from "../src/backend/agent-service";
import { AgentStore } from "../src/backend/agent-store";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenOwnBotDatabase } from "../src/backend/openownbot-database";
import { SidebarLayoutStore } from "../src/backend/sidebar-layout-store";
import type { TeamApiBrowser } from "../src/main/team-api/dependencies";

const OUT = resolve(import.meta.dirname, "../.openownbot-build/team-password-login-e2e");
const HOST_VERSION = "0.0.0-e2e";
const TEAM_FILE = "openbot-team-server-v2.json";
const STEP_DEADLINE_MS = 30_000;
const OWNER = { username: "owner-user", password: "owner-password-123" };
const ACCOUNT = { id: "account-e2e-1", email: "owner@example.test", name: "Owner", avatarUrl: null };
const ACCOUNT_TICKET = "ticket-e2e";
const HOST_LINE = "team-password-host ";

// --- Host process ---

/**
 * Runs the host on a profile until its standard input closes. `configure` sets up the team with an
 * owner who has a password and no account. `account` activates the account of the owner, as the app
 * does at launch after a sign-in, and lets the host redeem the one ticket of this check.
 */
async function runHost(root: string, mode: "configure" | "account"): Promise<void> {
  // The main process imports Electron for its windows and IPC. No check here opens a window.
  plugin({
    name: "team-password-electron-boundary",
    setup(build) {
      class Inert {}
      build.module("electron", () => ({
        loader: "object",
        exports: {
          app: { getPath: () => tmpdir(), getVersion: () => HOST_VERSION, isPackaged: false, on: () => undefined },
          BrowserWindow: Object.assign(class extends Inert {}, { getAllWindows: () => [] }),
          MessageChannelMain: class extends Inert {},
          Notification: Object.assign(class extends Inert {}, { isSupported: () => false }),
          clipboard: {},
          dialog: {},
          ipcMain: { handle: () => undefined, removeHandler: () => undefined, on: () => undefined },
          nativeImage: {},
          net: {},
          powerMonitor: { on: () => undefined },
          safeStorage: { isEncryptionAvailable: () => false },
          screen: {},
          session: {},
          shell: { openExternal: async () => undefined },
          systemPreferences: {},
          webContents: { getAllWebContents: () => [] },
        },
      }));
    },
  });
  const { TeamApiServer } = await import("../src/main/team-api-server");
  const { TeamStore } = await import("../src/main/team-store");

  const unused = () => Effect.die(new Error("Not used by this check."));
  const agentBrowser: AgentBrowserHost = {
    listTabs: () => [],
    beginTakeover: unused,
    endTakeover: () => {},
    userControlTabFor: () => null,
    awaitUserControlRelease: unused,
    resolveUploadTarget: unused,
    handleDynamicTool: unused,
    onChanged: () => () => {},
    onControlChanged: () => () => {},
    onDocumentChanged: () => () => {},
    clearControls: () => {},
    endControl: () => {},
    close: () => Effect.void,
    clearAgentSession: () => Effect.void,
  };
  const teamBrowser: TeamApiBrowser = {
    listTabs: () => [],
    getControlState: () => ({ sessions: [] }),
    open: unused,
    activate: unused,
    navigate: unused,
    reload: unused,
    stop: unused,
    takeUserControl: unused,
    releaseUserControl: () => {},
    releaseUserControlHeldBy: () => {},
    close: unused,
    capturePreview: unused,
    setVisible: unused,
    getDisplayState: () => ({ tabs: [], activeTabId: null }),
    loadUrl: unused,
    isPrivate: () => false,
    startView: unused,
    dispatchViewInput: unused,
    copyViewSelection: unused,
    importSignIn: unused,
  };

  const userData = join(root, "user-data");
  const database = new OpenOwnBotDatabase(userData);
  const agentStore = new AgentStore(userData, join(root, "home"), database);
  const mailbox = new MailboxStore(userData, agentStore.sharedRoot, agentStore.database);
  const sidebar = new SidebarLayoutStore(join(userData, "sidebar-layout.json"));
  const team = new TeamStore(join(userData, TEAM_FILE));
  await runCauseEffect(sidebar.initialize());
  // The stores only: `AgentService.initialize` would start the provider CLIs, which no step needs.
  await runCauseEffect(agentStore.initialize());
  await runCauseEffect(mailbox.initialize());
  await runCauseEffect(team.initialize());
  if (mode === "configure") await runCauseEffect(team.configure("E2E Host", OWNER.username, OWNER.password));
  else await runCauseEffect(team.activateAccount(ACCOUNT));
  const agents = new AgentService({ store: agentStore, mailbox, browser: agentBrowser, sidebarLayout: sidebar });
  const server = new TeamApiServer({
    store: team,
    agents,
    mailbox,
    browser: teamBrowser,
    sidebarLayout: sidebar,
    appVersion: HOST_VERSION,
    redeemCentralTicket: (ticket) => Effect.succeed(ticket === ACCOUNT_TICKET ? ACCOUNT : null),
  });
  const port = await Effect.runPromise(server.start());
  process.stdout.write(`${HOST_LINE}${JSON.stringify({ port })}\n`);
  // The client closes standard input to stop the host, as the app quits.
  await Bun.stdin.text();
  await Effect.runPromise(server.stop());
  await runCauseEffect(agents.stop());
  database.close();
}

if (process.argv[2] === "--host") {
  const root = process.argv[3];
  const mode = process.argv[4];
  assert.ok(root, "The host needs a profile directory.");
  assert.ok(mode === "configure" || mode === "account", "The host needs a mode.");
  await runHost(root, mode);
  process.exit(0);
}

// --- Clients ---

interface Step {
  name: string;
  passed: boolean;
  detail?: unknown;
  error?: string;
}

const report: { passed: boolean; steps: Step[] } = { passed: false, steps: [] };

/** Runs one check. `summarize` keeps tokens out of the report. */
async function step<T>(name: string, run: () => Promise<T>, summarize: (value: T) => unknown = (value) => value) {
  process.stdout.write(`- ${name}\n`);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    // A bound on failure only: a missing answer must fail.
    const value = await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error(`No result within ${STEP_DEADLINE_MS} ms.`)), STEP_DEADLINE_MS);
      }),
    ]);
    report.steps.push({ name, passed: true, detail: summarize(value) });
    return value;
  } catch (error) {
    report.steps.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

const root = await mkdtemp(join(tmpdir(), "openownbot-team-password-"));
let host: { process: Bun.Subprocess<"pipe", "pipe", "inherit">; exited: Promise<number> } | null = null;
let port = 0;

/** Starts the host process on the profile, and waits until it listens. */
async function startHost(mode: "configure" | "account"): Promise<void> {
  const child = Bun.spawn([process.execPath, import.meta.path, "--host", root, mode], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });
  host = { process: child, exited: child.exited };
  const ready = Promise.withResolvers<number>();
  void (async () => {
    let buffered = "";
    for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream())) {
      buffered += chunk;
      let end = buffered.indexOf("\n");
      while (end >= 0) {
        const line = buffered.slice(0, end);
        buffered = buffered.slice(end + 1);
        end = buffered.indexOf("\n");
        if (!line.startsWith(HOST_LINE)) process.stdout.write(`${line}\n`);
        else ready.resolve(Number(JSON.parse(line.slice(HOST_LINE.length)).port));
      }
    }
    ready.reject(new Error("The host process stopped before it listened."));
  })();
  port = await ready.promise;
}

/** Stops the host process as the app quits, and checks that it stopped cleanly. */
async function stopHost(): Promise<void> {
  if (!host) return;
  const { process: child, exited } = host;
  host = null;
  child.stdin.end();
  assert.equal(await exited, 0, "The host process did not stop cleanly.");
}

type Client = "oldest" | "protocol 7";

/** One request from a client of the given protocol. */
async function call(client: Client, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    [TEAM_PROTOCOL_VERSION_HEADER]: String(client === "oldest" ? TEAM_PROTOCOL_V1 : TEAM_PROTOCOL_V7),
    [TEAM_APP_VERSION_HEADER]: HOST_VERSION,
  };
  if (client === "protocol 7") headers[TEAM_CAPABILITIES_HEADER] = TEAM_PROTOCOL_V7_CAPABILITIES.join(",");
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const passwordLogin = (client: Client, username: string, password: string) =>
  call(client, TEAM_API_ROUTES.auth.login, { username, password });

/** The hash of every member in the team file, read from disk. */
async function storedHashes(): Promise<string[]> {
  const hashes: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === "object" && value !== null) {
      for (const [key, inner] of Object.entries(value)) {
        if (key === "passwordHash" && typeof inner === "string") hashes.push(inner);
        else visit(inner);
      }
    }
  };
  visit(JSON.parse(await readFile(join(root, "user-data", TEAM_FILE), "utf8")));
  return hashes;
}

function sessionToken(response: { status: number; body: unknown }, label: string): string {
  assert.equal(response.status, 200, `${label} returned ${response.status}.`);
  const body = response.body;
  if (typeof body === "object" && body !== null && "sessionToken" in body && typeof body.sessionToken === "string")
    return body.sessionToken;
  throw new Error(`${label} gave no session token.`);
}

async function meStatus(token: string): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}${TEAM_API_ROUTES.me}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      [TEAM_PROTOCOL_VERSION_HEADER]: String(TEAM_PROTOCOL_V7),
      [TEAM_APP_VERSION_HEADER]: HOST_VERSION,
      [TEAM_CAPABILITIES_HEADER]: TEAM_PROTOCOL_V7_CAPABILITIES.join(","),
    },
  });
  return response.status;
}

/** The refusal of a bound member must look like a wrong password: it names no account. */
async function assertRefusedLikeWrongPassword(client: Client, username: string): Promise<number> {
  const wrong = await passwordLogin(client, username, "not-the-password-123");
  const bound = await passwordLogin(client, username, OWNER.password);
  assert.notEqual(bound.status, 200, `${client} signed in with the password of a member that has an account.`);
  assert.equal(bound.status, wrong.status, `${client} sees a different status for a refused password.`);
  assert.deepEqual(bound.body, wrong.body, `${client} sees a different body for a refused password.`);
  return bound.status;
}

try {
  await startHost("configure");
  await step("legacy member with no account: both clients sign in with the password", async () => {
    for (const client of ["oldest", "protocol 7"] as const) {
      const token = sessionToken(await passwordLogin(client, OWNER.username, OWNER.password), client);
      assert.equal(await meStatus(token), 200);
    }
    const wrong = await passwordLogin("protocol 7", OWNER.username, "not-the-password-123");
    assert.notEqual(wrong.status, 200, "A wrong password signed in.");
    return { clients: 2, hashes: (await storedHashes()).length };
  });

  await stopHost();
  await startHost("account");
  await step("member with an account: both clients are refused, with the answer of a wrong password", async () => {
    const statuses = {
      oldest: await assertRefusedLikeWrongPassword("oldest", ACCOUNT.email),
      "protocol 7": await assertRefusedLikeWrongPassword("protocol 7", ACCOUNT.email),
    };
    return statuses;
  });
  await step("member with an account: the account sign-in still works", async () => {
    const token = sessionToken(
      await call("protocol 7", TEAM_API_ROUTES.auth.account, { accountTicket: ACCOUNT_TICKET }),
      "account sign-in",
    );
    assert.equal(await meStatus(token), 200);
    return { signedIn: true };
  });
  await step("refusal keeps the stored hash", async () => {
    const hashes = await storedHashes();
    assert.equal(hashes.length, 1, "The stored hash was removed or copied.");
    assert.ok(!(await readFile(join(root, "user-data", TEAM_FILE), "utf8")).includes(OWNER.password));
    return { hashes: hashes.length };
  });

  await stopHost();
  await startHost("account");
  await step("restart: the refusal holds, the account sign-in works and the hash stays", async () => {
    await assertRefusedLikeWrongPassword("protocol 7", ACCOUNT.email);
    const token = sessionToken(
      await call("protocol 7", TEAM_API_ROUTES.auth.account, { accountTicket: ACCOUNT_TICKET }),
      "account sign-in after restart",
    );
    assert.equal(await meStatus(token), 200);
    assert.equal((await storedHashes()).length, 1);
    return { refused: true, signedIn: true };
  });

  report.passed = report.steps.every((entry) => entry.passed);
} finally {
  await stopHost().catch(() => undefined);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
}

process.stdout.write(`Team password sign-in passed. Report: ${join(OUT, "report.json")}\n`);
