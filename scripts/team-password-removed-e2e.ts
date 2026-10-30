// Checks that the host has no password sign-in, and what it does with the password data of an older
// version. A team file written by a version with a password sign-in is put on a temporary profile: the
// owner has a password hash and salt and no account, a second member has an account and a hash, a third
// has a hash and no account, and the copy of the imported record has the owner's hash. A real
// `TeamApiServer` runs on that profile on loopback, in a child process of this script.
// `/v1/auth/login` and `/v1/auth/password` must answer like any unknown route, for a client of the
// oldest protocol and a client of protocol 7. The owner must sign in with the account. After the host
// wrote the file, the hash and the salt must be gone for the two members that have an account, and
// must remain for the member without one and in the imported copy. A host whose start cannot write
// the file must leave it byte for byte as it was. No response may carry a hash or a salt.
// Run: `bun scripts/team-password-removed-e2e.ts`.
// Writes .openownbot-build/team-password-removed-e2e/report.json.
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
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
// One hash and salt for each member of the fixture, so a check can tell which ones the host removed.
// No value contains another one: the checks count occurrences in the file text.
const OWNER_DATA = { hash: "owner-hash-0123456789abcdefghijklmnopqrstuvwxyz", salt: "owner-salt-0123456789abcdef" };
const BOUND_DATA = { hash: "hasacct-hash-0123456789abcdefghijklmnopqrstuvwxyz", salt: "hasacct-salt-0123456789abcdef" };
const UNBOUND_DATA = {
  hash: "noacct-hash-0123456789abcdefghijklmnopqrstuvwxyz",
  salt: "noacct-salt-0123456789abcdef",
};
const INVITED_DATA = {
  hash: "invited-hash-0123456789abcdefghijklmnopqrstuvwxyz",
  salt: "invited-salt-0123456789abcdef",
};
const BOUND_ACCOUNT_ID = "account-bound-1";
const ACCOUNT = { id: "account-e2e-1", email: "owner@example.test", name: "Owner", avatarUrl: null };
const ACCOUNT_TICKET = "ticket-e2e";
// A member that has a hash and no account, whose user name is the address of this account.
const INVITED_ACCOUNT = { id: "account-invited-1", email: "invited@example.test", name: "Invited", avatarUrl: null };
const INVITED_TICKET = "ticket-invited";
const HOST_LINE = "team-password-host ";

// --- Host process ---

/**
 * Runs the host on a profile until its standard input closes. It activates the account of the owner, as
 * the app does at launch after a sign-in, and lets the host redeem the one ticket of this check.
 * In `read-only` mode the profile cannot be written when the team store starts. The host reports
 * whether that failed, and stops.
 */
async function runHost(root: string, mode: "serve" | "read-only"): Promise<void> {
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
  if (mode === "read-only") {
    // The start writes the file once, so a profile that cannot be written fails it.
    chmodSync(userData, 0o555);
    const outcome = await runCauseEffect(team.initialize()).then(
      () => "written",
      () => "failed",
    );
    chmodSync(userData, 0o755);
    database.close();
    process.stdout.write(`${HOST_LINE}${JSON.stringify({ outcome })}\n`);
    return;
  }
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
    redeemCentralTicket: (ticket) =>
      Effect.succeed(ticket === ACCOUNT_TICKET ? ACCOUNT : ticket === INVITED_TICKET ? INVITED_ACCOUNT : null),
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
  const mode = process.argv[4];
  assert.ok(mode === "serve" || mode === "read-only", "The host needs a mode.");
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

/** One member as a version with a password sign-in stored it. The values are not real hashes. */
function legacyMember(
  username: string,
  role: "owner" | "member",
  data: { hash: string; salt: string },
  accountId?: string,
) {
  return {
    id: randomUUID(),
    username,
    email: null,
    name: null,
    avatarUrl: null,
    role,
    disabled: false,
    createdAt: new Date().toISOString(),
    ...(accountId === undefined ? {} : { accountId }),
    passwordSalt: data.salt,
    passwordHash: data.hash,
  };
}

/**
 * The team file of a version with a password sign-in. One host: the owner has a hash, a salt and no
 * account; a member has an account and a hash; a member has a hash and no account and will sign in with
 * an account; a member has a hash and no account and never signs in. The file also holds the copy of
 * the imported record, with every hash. Returns the text, so that a check can compare.
 */
async function writeLegacyTeamFile(): Promise<string> {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const owner = legacyMember(LEGACY_USERNAME, "owner", OWNER_DATA);
  const host = {
    version: 1,
    serverId: randomUUID(),
    serverName: "Legacy Host",
    enabledOnLaunch: false,
    publicKey,
    privateKey,
    members: [
      owner,
      legacyMember("bound-user", "member", BOUND_DATA, BOUND_ACCOUNT_ID),
      legacyMember(INVITED_ACCOUNT.email, "member", INVITED_DATA),
      legacyMember("unbound-user", "member", UNBOUND_DATA),
    ],
    invites: [],
    sessions: [],
  };
  const file = {
    version: 2,
    activeAccountId: null,
    hosts: [host],
    legacyImport: { fingerprint: "e2e-fingerprint", record: structuredClone(host) },
  };
  const text = JSON.stringify(file);
  await mkdir(join(root, "user-data"), { recursive: true });
  await writeFile(join(root, "user-data", TEAM_FILE), text);
  return text;
}

/** Starts the host process on the profile, and waits until it listens. */
async function startHost(): Promise<void> {
  const child = Bun.spawn([process.execPath, import.meta.path, "--host", root, "serve"], {
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

/** How often the file holds the value. Each hash and salt is in the host and in the imported copy. */
async function occurrences(value: string): Promise<number> {
  return (await teamFile()).split(value).length - 1;
}

/** The hash and the salt of a member: in both copies, or only in the imported copy. */
async function assertPasswordData(
  name: string,
  data: { hash: string; salt: string },
  expected: "kept" | "dropped",
): Promise<void> {
  const copies = expected === "kept" ? 2 : 1;
  assert.equal(await occurrences(data.hash), copies, `The hash of ${name} is not ${expected}.`);
  assert.equal(await occurrences(data.salt), copies, `The salt of ${name} is not ${expected}.`);
}

try {
  const fixture = await writeLegacyTeamFile();
  await step("read-only profile: a failed write leaves the team file as it was", async () => {
    const child = Bun.spawn([process.execPath, import.meta.path, "--host", root, "read-only"], {
      stdout: "pipe",
      stderr: "inherit",
    });
    const output = await new Response(child.stdout).text();
    assert.equal(await child.exited, 0, "The read-only host did not stop cleanly.");
    const line = output.split("\n").find((candidate) => candidate.startsWith(HOST_LINE));
    assert.ok(line, "The read-only host reported no outcome.");
    const { outcome } = JSON.parse(line.slice(HOST_LINE.length));
    assert.equal(outcome, "failed", "The write did not fail, so this check proves nothing.");
    assert.equal(await teamFile(), fixture, "The team file changed although the write failed.");
    return { outcome };
  });

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

  await step("password data: gone for the owner and the member with an account, kept for the rest", async () => {
    // The host did write: the owner is bound to the account now. Without that, this check proves nothing.
    assert.ok((await teamFile()).includes(ACCOUNT.id), "The host did not write the account of the owner.");
    await assertPasswordData("the owner, bound at start", OWNER_DATA, "dropped");
    await assertPasswordData("the member that had an account", BOUND_DATA, "dropped");
    await assertPasswordData("the member that has not signed in", INVITED_DATA, "kept");
    await assertPasswordData("the member without an account", UNBOUND_DATA, "kept");
    return { owner: "dropped", bound: "dropped", invited: "kept", unbound: "kept" };
  });

  await step("password data: gone for a member that signs in with an account, kept for the others", async () => {
    sessionToken(
      await call("protocol 7", "POST", TEAM_API_ROUTES.auth.account, { body: { accountTicket: INVITED_TICKET } }),
      "sign-in of the invited member",
    );
    await assertPasswordData("the invited member", INVITED_DATA, "dropped");
    await assertPasswordData("the member without an account", UNBOUND_DATA, "kept");
    return { invited: "dropped", unbound: "kept" };
  });

  await step("password data: no response carries a hash or a salt", async () => {
    const answers = [
      await call("protocol 7", "GET", TEAM_API_ROUTES.me, { token }),
      await call("protocol 7", "GET", TEAM_API_ROUTES.team.sessions, { token }),
      await call("protocol 7", "GET", TEAM_API_ROUTES.team.presence, { token }),
      await call("protocol 7", "POST", TEAM_API_ROUTES.auth.account, { body: { accountTicket: ACCOUNT_TICKET } }),
    ];
    const values = [OWNER_DATA, BOUND_DATA, INVITED_DATA, UNBOUND_DATA].flatMap((data) => [data.hash, data.salt]);
    for (const answer of answers) {
      assert.equal(answer.status, 200, "A response check got a failure.");
      const text = JSON.stringify(answer.body);
      assert.ok(!values.some((value) => text.includes(value)), "A response carries password data.");
      assert.ok(!/passwordHash|passwordSalt/u.test(text), "A response names a password field.");
    }
    return { responses: answers.length };
  });

  await stopHost();
  await startHost();
  await step("restart: the account sign-in works, the route stays gone and the data stays as it was", async () => {
    const session = await accountSignIn("oldest");
    const me = await call("protocol 7", "GET", TEAM_API_ROUTES.me, { token: session });
    assert.equal(me.status, 200);
    const login = await call("protocol 7", "POST", "/v1/auth/login", {
      body: { username: ACCOUNT.email, password: LEGACY_PASSWORD },
    });
    assert.notEqual(login.status, 200);
    await assertPasswordData("the owner", OWNER_DATA, "dropped");
    await assertPasswordData("the member that had an account", BOUND_DATA, "dropped");
    await assertPasswordData("the invited member", INVITED_DATA, "dropped");
    await assertPasswordData("the member without an account", UNBOUND_DATA, "kept");
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
