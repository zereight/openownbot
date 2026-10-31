// Checks the reverse actions of device access on a real host: revoke a device and sign in again, and
// restart the host with the revocation kept. A host has one owner, and every client is a device of
// that owner. The last event
// socket of a session that closes gives back the browser control of that session. A real
// `TeamApiServer` runs on loopback with the real team store on a temporary profile, in a child
// process of this script. An owner client makes each change through the released `/v1/team/*`
// routes, and a second device checks that its token, its event socket and its sign-in follow. The
// host process then restarts on the same files, and each change must still hold.
// Run: `bun scripts/team-session-revoke-e2e.ts`.
// Writes .openownbot-build/team-session-revoke-e2e/report.json.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TEAM_API_ROUTES } from "@robot/contracts/team-api-routes";
import {
  TEAM_APP_VERSION_HEADER,
  TEAM_CAPABILITIES_HEADER,
  TEAM_PROTOCOL_V1_WEBSOCKET,
  TEAM_PROTOCOL_V7,
  TEAM_PROTOCOL_V7_CAPABILITIES,
  TEAM_PROTOCOL_VERSION_HEADER,
} from "@robot/contracts/team-protocol";
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

const OUT = resolve(import.meta.dirname, "../.openownbot-build/team-session-revoke-e2e");
const HOST_VERSION = "0.0.0-e2e";
const ACCOUNT = { id: "account-e2e-1", email: "owner@example.test", name: "Owner", avatarUrl: null };
const ACCOUNT_TICKET = "ticket-e2e";
const STEP_DEADLINE_MS = 30_000;

/** A line that the host process writes to its standard output, after `HOST_LINE`. */
type HostMessage =
  | { type: "ready"; port: number }
  | { type: "revoked"; sessionId: string }
  | { type: "released"; sessionId: string };
const HOST_LINE = "team-revoke-host ";

// --- Host process ---

/**
 * Runs the host on a profile, as the app does at launch, until its standard input closes.
 * The first start also sets up the team, as the owner does in the app.
 */
async function runHost(root: string, configure: boolean): Promise<void> {
  // The main process imports Electron for its windows and IPC. No check here opens a window.
  plugin({
    name: "team-revoke-electron-boundary",
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
  const { TeamApiServer } = await import("../src/main/team-api/team-api-server");
  const { TeamStore } = await import("../src/main/team/team-store");

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
    releaseUserControlHeldBy: (holder) => {
      if (holder.kind === "session") send({ type: "released", sessionId: holder.sessionId });
    },
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
  const send = (message: HostMessage) => process.stdout.write(`${HOST_LINE}${JSON.stringify(message)}\n`);

  const userData = join(root, "user-data");
  const database = new OpenOwnBotDatabase(userData);
  const agentStore = new AgentStore(userData, join(root, "home"), database);
  const mailbox = new MailboxStore(userData, agentStore.sharedRoot, agentStore.database);
  const sidebar = new SidebarLayoutStore(join(userData, "sidebar-layout.json"));
  const team = new TeamStore(join(userData, "team-server.json"));
  await runCauseEffect(sidebar.initialize());
  // The stores only: `AgentService.initialize` would start the provider CLIs, which no step needs.
  await runCauseEffect(agentStore.initialize());
  await runCauseEffect(mailbox.initialize());
  await runCauseEffect(team.initialize());
  if (configure) await runCauseEffect(team.configureWithAccount("E2E Host", ACCOUNT));
  const agents = new AgentService({ store: agentStore, mailbox, browser: agentBrowser, sidebarLayout: sidebar });
  let port = 0;
  const server = new TeamApiServer({
    store: team,
    agents,
    mailbox,
    browser: teamBrowser,
    sidebarLayout: sidebar,
    appVersion: HOST_VERSION,
    redeemCentralTicket: (ticket) => Effect.succeed(ticket === ACCOUNT_TICKET ? ACCOUNT : null),
    // The WebRTC gateway ends a revoked session through this callback.
    onSessionRevoked: (sessionId) => Effect.sync(() => send({ type: "revoked", sessionId })),
  });
  port = await Effect.runPromise(server.start());
  send({ type: "ready", port });
  // The client closes standard input to stop the host, as the app quits.
  await Bun.stdin.text();
  await Effect.runPromise(server.stop());
  await runCauseEffect(agents.stop());
  database.close();
}

if (process.argv[2] === "--host") {
  const root = process.argv[3];
  assert.ok(root, "The host needs a profile directory.");
  await runHost(root, process.argv[4] === "--configure");
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

/** Runs one check. `summarize` keeps tokens and live objects out of the report. */
async function step<T>(name: string, run: () => Promise<T>, summarize: (value: T) => unknown = (value) => value) {
  process.stdout.write(`- ${name}\n`);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    // A bound on failure only: each check waits for its event, and a missing event must fail.
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

/** Reads one host line; other output of the host process is its log. */
function decodeHostLine(line: string): HostMessage | null {
  if (!line.startsWith(HOST_LINE)) return null;
  const value = record(JSON.parse(line.slice(HOST_LINE.length)), "host line");
  if (value.type === "ready" && typeof value.port === "number") return { type: "ready", port: value.port };
  if (value.type === "revoked") return { type: "revoked", sessionId: text(value.sessionId, "session id") };
  if (value.type === "released") return { type: "released", sessionId: text(value.sessionId, "session id") };
  throw new Error(`Unknown host line: ${line}`);
}

/** A value that `JSON.parse` gives: the wire body of a response, a frame or a fixture. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonObject {
  assert.ok(isRecord(value), `${label} is not an object.`);
  return value;
}

function text(value: unknown, label: string): string {
  assert.equal(typeof value, "string", `${label} is not text.`);
  return String(value);
}

const root = await mkdtemp(join(tmpdir(), "openownbot-team-revoke-"));
let host: { process: Bun.Subprocess<"pipe", "pipe", "inherit">; exited: Promise<number> } | null = null;
let port = 0;
const sockets: WebSocket[] = [];
/** Sessions that the host told the WebRTC gateway to end, and the waiters for the next one. */
const revokedForGateway: string[] = [];
const revokedWaiters: ((sessionId: string) => void)[] = [];
/** Sessions whose browser control the host gave back, and the waiters for the next one. */
const releasedSessions: string[] = [];
const releasedWaiters: ((sessionId: string) => void)[] = [];

/** Starts the host process on the profile, and waits until it listens. */
async function startHost(configure: boolean): Promise<void> {
  const child = Bun.spawn([process.execPath, import.meta.path, "--host", root, ...(configure ? ["--configure"] : [])], {
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
        const message = decodeHostLine(line);
        if (!message) process.stdout.write(`${line}\n`);
        else if (message.type === "ready") ready.resolve(message.port);
        else if (message.type === "released") {
          releasedSessions.push(message.sessionId);
          releasedWaiters.shift()?.(message.sessionId);
        } else {
          revokedForGateway.push(message.sessionId);
          revokedWaiters.shift()?.(message.sessionId);
        }
      }
    }
    ready.reject(new Error("The host process stopped before it listened."));
  })();
  port = await ready.promise;
}

/** Stops the host process as the app quits, and checks that it stopped cleanly. */
async function stopHost(): Promise<void> {
  for (const socket of sockets.splice(0)) socket.close();
  if (!host) return;
  const { process: child, exited } = host;
  host = null;
  child.stdin.end();
  assert.equal(await exited, 0, "The host process did not stop cleanly.");
}

/** The next session that the host tells the WebRTC gateway to end. */
function nextRevokedForGateway(): Promise<string> {
  return new Promise((resolveRevoked) => revokedWaiters.push(resolveRevoked));
}

function nextReleasedSession(): Promise<string> {
  return new Promise((resolveReleased) => releasedWaiters.push(resolveReleased));
}

/** One request from a current desktop client. */
async function call(
  method: string,
  path: string,
  input: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    [TEAM_PROTOCOL_VERSION_HEADER]: String(TEAM_PROTOCOL_V7),
    [TEAM_APP_VERSION_HEADER]: HOST_VERSION,
    [TEAM_CAPABILITIES_HEADER]: TEAM_PROTOCOL_V7_CAPABILITIES.join(","),
  };
  if (input.body !== undefined) headers["Content-Type"] = "application/json";
  if (input.token) headers.Authorization = `Bearer ${input.token}`;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: input.body === undefined ? null : JSON.stringify(input.body),
  });
  const body = await response.text();
  return { status: response.status, body: body ? JSON.parse(body) : null };
}

async function login(): Promise<string> {
  const response = await call("POST", TEAM_API_ROUTES.auth.account, { body: { accountTicket: ACCOUNT_TICKET } });
  assert.equal(response.status, 200, `Sign-in returned ${response.status}.`);
  return text(record(response.body, "login").sessionToken, "session token");
}

async function meStatus(token: string): Promise<number> {
  return (await call("GET", TEAM_API_ROUTES.me, { token })).status;
}

/** The session ids that the owner sees in the session list. */
async function sessionIds(ownerToken: string): Promise<string[]> {
  const listed = await call("GET", TEAM_API_ROUTES.team.sessions, { token: ownerToken });
  assert.equal(listed.status, 200);
  assert.ok(Array.isArray(listed.body));
  return listed.body.map((session) => text(record(session, "session").id, "session id"));
}

/** Signs in a new device, and finds its session in the owner's list. */
async function loginDevice(ownerToken: string): Promise<{ token: string; sessionId: string }> {
  const before = new Set(await sessionIds(ownerToken));
  const token = await login();
  const added = (await sessionIds(ownerToken)).filter((id) => !before.has(id));
  assert.equal(added.length, 1, "Sign-in did not add exactly one session.");
  return { token, sessionId: added[0] ?? "" };
}

/**
 * Opens the event socket of a session, and gives a promise for its close code. The promise is in
 * an object: an async function that returned it directly would wait for the close.
 */
async function openEvents(token: string): Promise<{ closed: Promise<number>; close: () => void }> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${TEAM_API_ROUTES.events}`, [
    TEAM_PROTOCOL_V1_WEBSOCKET,
    `openownbot-token.${token}`,
  ]);
  sockets.push(socket);
  const closed = new Promise<number>((resolveClose) =>
    socket.addEventListener("close", (event) => resolveClose(event.code), { once: true }),
  );
  await new Promise<void>((resolveOpen, reject) => {
    socket.addEventListener("open", () => resolveOpen(), { once: true });
    socket.addEventListener("error", () => reject(new Error("The event socket did not open.")), { once: true });
  });
  return { closed, close: () => socket.close() };
}

try {
  await startHost(true);
  const ownerToken = await login();

  const member = await step(
    "setup: the owner signs in on two more devices",
    async () => {
      const laptop = await loginDevice(ownerToken);
      const phone = await loginDevice(ownerToken);
      assert.equal(await meStatus(laptop.token), 200);
      assert.equal(await meStatus(phone.token), 200);
      return { laptop, phone };
    },
    () => ({ devices: 2 }),
  );

  await step("client goes away: the last event socket of a session gives back its browser control", async () => {
    const phoneSession = member.phone.sessionId;
    const first = await openEvents(member.phone.token);
    const second = await openEvents(member.phone.token);
    first.close();
    await first.closed;
    const released = nextReleasedSession();
    second.close();
    await second.closed;
    assert.equal(await released, phoneSession, "The last socket did not give back the browser control.");
    const releases = releasedSessions.filter((sessionId) => sessionId === phoneSession).length;
    assert.equal(releases, 1, "A socket gave back the browser control while the session had another socket.");
    assert.equal(await meStatus(member.phone.token), 200, "Closing the sockets ended the session.");
    return { releases };
  });

  await step("revoke session: one device loses access at once, the other keeps it", async () => {
    const laptopSession = member.laptop.sessionId;
    const laptopEvents = (await openEvents(member.laptop.token)).closed;
    const gateway = nextRevokedForGateway();
    const revoked = await call("DELETE", TEAM_API_ROUTES.team.session(laptopSession), { token: ownerToken });
    assert.equal(revoked.status, 204);
    assert.equal(await laptopEvents, 1008, "The revoked device kept its event socket.");
    assert.equal(await meStatus(member.laptop.token), 401);
    assert.equal(await meStatus(member.phone.token), 200, "Revoking one session ended another.");
    assert.equal(await gateway, laptopSession, "The WebRTC gateway was not told to end the session.");
    assert.ok(!(await sessionIds(ownerToken)).includes(laptopSession), "A revoked session is listed.");
    return { revokedSession: laptopSession, socketClose: 1008 };
  });

  const relogin = await step(
    "reconnect after revoke: the device signs in again with a new session",
    async () => {
      const device = await loginDevice(ownerToken);
      assert.notEqual(device.sessionId, member.laptop.sessionId);
      assert.equal(await meStatus(device.token), 200);
      const { closed: events } = await openEvents(device.token);
      return { token: device.token, events };
    },
    () => ({ signedIn: true, eventsOpen: true }),
  );

  await step("restart: the host keeps every revocation", async () => {
    const previousPort = port;
    await stopHost();
    await startHost(false);
    assert.equal(await meStatus(member.laptop.token), 401, "A revoked session came back after restart.");
    assert.equal(await meStatus(member.phone.token), 200, "A session that was not revoked ended after restart.");
    assert.equal(await meStatus(relogin.token), 200, "The new session ended after restart.");
    return { previousPort, port, revokedSessionStaysRevoked: true };
  });

  report.passed = report.steps.every((entry) => entry.passed);
} finally {
  await stopHost().catch(() => undefined);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
}

process.stdout.write(`Team session revoke and reconnect passed. Report: ${join(OUT, "report.json")}\n`);
