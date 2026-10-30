// Checks that the host has no password sign-in, and that it keeps the password data of an older version.
// A team file written by a version with a password sign-in is put on a temporary profile: the owner has
// a password hash and salt and no account. A real `TeamApiServer` runs on that profile on loopback, in a
// child process of this script. `/v1/auth/login` and `/v1/auth/password` must answer like any unknown
// route, for a client of the oldest protocol and a client of protocol 7. The owner must sign in with
// the account, no response may carry the hash or the salt, and both must still be in the file after the
// host wrote it and after a restart.
// Run: `bun scripts/team-password-removed-e2e.ts`.
// Writes .openownbot-build/team-password-removed-e2e/report.json.
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const OUT = resolve(import.meta.dirname, "../.openownbot-build/team-password-removed-e2e");
const HOST_VERSION = "0.0.0-e2e";
const TEAM_FILE = "openbot-team-server-v2.json";
const STEP_DEADLINE_MS = 30_000;
const LEGACY_USERNAME = "owner-user";
const LEGACY_PASSWORD = "owner-password-123";
const LEGACY_HASH = "legacy-hash-0123456789abcdefghijklmnopqrstuvwxyz";
const LEGACY_SALT = "legacy-salt-0123456789abcdef";
const ACCOUNT = { id: "account-e2e-1", email: "owner@example.test", name: "Owner", avatarUrl: null };
const ACCOUNT_TICKET = "ticket-e2e";
const HOST_LINE = "team-password-host ";

// --- Host process ---

/**
 * Runs the host on a profile until its standard input closes. It activates the account of the owner, as
 * the app does at launch after a sign-in, and lets the host redeem the one ticket of this check.
 */
async function runHost(root: string): Promise<void> {
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
  await runCauseEffect(team.activateAccount(ACCOUNT));
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
  assert.ok(root, "The host needs a profile directory.");
  await runHost(root);
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

/**
 * The team file of a version with a password sign-in: one host whose owner has a hash, a salt and no
 * account. The values are not real hashes; nothing reads them now, which is what this check shows.
 */
async function writeLegacyTeamFile(): Promise<void> {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const file = {
    version: 2,
    activeAccountId: null,
    hosts: [
      {
        version: 1,
        serverId: randomUUID(),
        serverName: "Legacy Host",
        enabledOnLaunch: false,
        publicKey,
        privateKey,
        members: [
          {
            id: randomUUID(),
            username: LEGACY_USERNAME,
            email: null,
            name: null,
            avatarUrl: null,
            role: "owner",
            disabled: false,
            createdAt: new Date().toISOString(),
            passwordSalt: LEGACY_SALT,
            passwordHash: LEGACY_HASH,
          },
        ],
        invites: [],
        sessions: [],
      },
    ],
  };
  await mkdir(join(root, "user-data"), { recursive: true });
  await writeFile(join(root, "user-data", TEAM_FILE), JSON.stringify(file));
}

/** Starts the host process on the profile, and waits until it listens. */
async function startHost(): Promise<void> {
  const child = Bun.spawn([process.execPath, import.meta.path, "--host", root], {
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
async function call(
  client: Client,
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    [TEAM_PROTOCOL_VERSION_HEADER]: String(client === "oldest" ? TEAM_PROTOCOL_V1 : TEAM_PROTOCOL_V7),
    [TEAM_APP_VERSION_HEADER]: HOST_VERSION,
  };
  if (client === "protocol 7") headers[TEAM_CAPABILITIES_HEADER] = TEAM_PROTOCOL_V7_CAPABILITIES.join(",");
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: options.body === undefined ? null : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const teamFile = () => readFile(join(root, "user-data", TEAM_FILE), "utf8");

function sessionToken(response: { status: number; body: unknown }, label: string): string {
  assert.equal(response.status, 200, `${label} returned ${response.status}.`);
  const body = response.body;
  if (typeof body === "object" && body !== null && "sessionToken" in body && typeof body.sessionToken === "string")
    return body.sessionToken;
  throw new Error(`${label} gave no session token.`);
}

const accountSignIn = async (client: Client = "protocol 7") =>
  sessionToken(
    await call(client, "POST", TEAM_API_ROUTES.auth.account, { body: { accountTicket: ACCOUNT_TICKET } }),
    "account sign-in",
  );

/** The team file holds the hash and the salt of the older version, unchanged. */
async function assertLegacyDataKept(): Promise<void> {
  const text = await teamFile();
  assert.ok(text.includes(LEGACY_HASH), "The stored password hash is gone from the team file.");
  assert.ok(text.includes(LEGACY_SALT), "The stored password salt is gone from the team file.");
}

try {
  await writeLegacyTeamFile();
  await startHost();
  await step("password routes: login and password change answer like an unknown route", async () => {
    const unknown = await call("protocol 7", "POST", "/v1/auth/no-such-route", { body: {} });
    const statuses: Record<string, number> = {};
    for (const client of ["oldest", "protocol 7"] as const) {
      const login = await call(client, "POST", "/v1/auth/login", {
        body: { username: LEGACY_USERNAME, password: LEGACY_PASSWORD },
      });
      assert.equal(login.status, unknown.status, `${client} sees a different status for the login route.`);
      assert.deepEqual(login.body, unknown.body, `${client} sees a different body for the login route.`);
      assert.ok(!JSON.stringify(login.body).includes("sessionToken"), `${client} got a session from the login route.`);
      statuses[client] = login.status;
    }
    return { unknown: unknown.status, ...statuses };
  });

  const token = await step(
    "owner from before accounts: signs in with the account, and keeps the owner role",
    async () => {
      const session = await accountSignIn();
      const me = await call("protocol 7", "GET", TEAM_API_ROUTES.me, { token: session });
      assert.equal(me.status, 200);
      assert.ok(typeof me.body === "object" && me.body !== null && "role" in me.body && me.body.role === "owner");
      return session;
    },
    () => ({ signedIn: true, role: "owner" }),
  );

  await step("password change route: authenticated request gets 404", async () => {
    const changed = await call("protocol 7", "POST", "/v1/auth/password", {
      token,
      body: { currentPassword: LEGACY_PASSWORD, newPassword: "a-new-password-456" },
    });
    assert.equal(changed.status, 404, `The password route answered ${changed.status}.`);
    return { status: changed.status };
  });

  await step("older data: the hash and the salt stay in the file after the host wrote it", async () => {
    await assertLegacyDataKept();
    // The host did write: the owner is bound to the account now. Without that, this check proves nothing.
    assert.ok((await teamFile()).includes(ACCOUNT.id), "The host did not write the account of the owner.");
    return { kept: true };
  });

  await step("older data: no response carries the hash or the salt", async () => {
    const answers = [
      await call("protocol 7", "GET", TEAM_API_ROUTES.me, { token }),
      await call("protocol 7", "GET", TEAM_API_ROUTES.team.sessions, { token }),
      await call("protocol 7", "GET", TEAM_API_ROUTES.team.presence, { token }),
      await call("protocol 7", "POST", TEAM_API_ROUTES.auth.account, { body: { accountTicket: ACCOUNT_TICKET } }),
    ];
    for (const answer of answers) {
      assert.equal(answer.status, 200, "A response check got a failure.");
      const text = JSON.stringify(answer.body);
      assert.ok(!text.includes(LEGACY_HASH) && !text.includes(LEGACY_SALT), "A response carries password data.");
      assert.ok(!/passwordHash|passwordSalt/u.test(text), "A response names a password field.");
    }
    return { responses: answers.length };
  });

  await stopHost();
  await startHost();
  await step("restart: the account sign-in works, the route stays gone and the data stays", async () => {
    const session = await accountSignIn("oldest");
    const me = await call("protocol 7", "GET", TEAM_API_ROUTES.me, { token: session });
    assert.equal(me.status, 200);
    const login = await call("protocol 7", "POST", "/v1/auth/login", {
      body: { username: ACCOUNT.email, password: LEGACY_PASSWORD },
    });
    assert.notEqual(login.status, 200);
    await assertLegacyDataKept();
    return { signedIn: true, loginStatus: login.status };
  });

  report.passed = report.steps.every((entry) => entry.passed);
} finally {
  await stopHost().catch(() => undefined);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
}

process.stdout.write(`Team password removal passed. Report: ${join(OUT, "report.json")}\n`);
