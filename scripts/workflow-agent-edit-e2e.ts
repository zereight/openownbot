// Checks that an agent reads and changes the workflow that its chat is about with `read_workflow` and
// `edit_workflow`. Runs the real agent service, tool router and workflows service on a temporary
// profile with a fake Codex app-server. The fake calls the tools through `tool_call`, as a model does,
// and logs the tool result that it gets. The check asserts that a read then an edit adds a node and
// keeps the strokes, the view fields, the node ids and their order; that a stale revision answers with
// the current graph and saves nothing; that every edit that would arm the workflow, add an output to a
// file or move a locked node is refused and saves nothing, while an edit beside them saves and leaves
// the trigger rows as they were; that a routine run, an agent's message, a
// task thread, a member's message and the first message that `create_agent` writes for a new agent
// cannot use the tools, while that first message is still a user message that the new agent reads
// as written and answers without a relay to its creator, and keeps its creator's stamp after a reload,
// until a person edits it; that a chat with no reference line, a
// reference to an unknown workflow and two references are refused; that two edits in one turn keep
// exactly one `auto` version of the graph before them and a later turn keeps another; that a no-op edit
// saves nothing; that a graph too large or against the port rules is refused while the stored graph
// still reads back; and that an agent step takes one of the five efforts, refuses any other value with
// a sentence the model reads, and lets a model step keep the value it always could.
// `bun scripts/workflow-agent-edit-e2e.ts`. Writes .openownbot-build/workflow-agent-edit-e2e/report.json.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  AGENT_PROVIDERS,
  type AgentEvent,
  type ConversationMessageSender,
  type WorkflowDetail,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowVersion,
} from "@robot/contracts/ipc";
import { workflowChatReference } from "@robot/contracts/workflow-chat-reference";
import { sourceText } from "@robot/i18n/source";
import { Effect } from "effect";
import type { AgentBrowserHost } from "../src/backend/agent/turn-lifecycle";

const OUT = resolve(import.meta.dirname, "../.openownbot-build/workflow-agent-edit-e2e");
const root = await mkdtemp(join(tmpdir(), "openownbot-workflow-edit-tool-"));
const userData = join(root, "user-data");
const home = join(root, "home");
const fakeCodex = join(root, "codex");
const fakeLog = join(root, "codex.jsonl");
const fakePrompts = join(root, "codex-prompts.jsonl");

// Before the service modules load: the Codex process and the stores read the home folder.
process.env.HOME = home;
process.env.CODEX_HOME = join(home, ".codex");
process.env.OPENOWNBOT_CODEX_PATH = fakeCodex;
mkdirSync(home, { recursive: true });

const { AgentService } = await import("../src/backend/agent-service");
const { AgentStore } = await import("../src/backend/agent-store");
const { runCauseEffect } = await import("../src/backend/effect-boundary");
const { MailboxStore } = await import("../src/backend/mailbox-store");
const { OpenOwnBotDatabase } = await import("../src/backend/openownbot-database");
const { WorkflowRunStore } = await import("../src/backend/workflows/workflow-run-store");
const { WorkflowStore } = await import("../src/backend/workflows/workflow-store");
const { handleWorkflowTool } = await import("../src/backend/workflows/workflow-tools");
const { workflowScheduleDueAt } = await import("../src/backend/workflows/workflow-triggers");
const { createWorkflows } = await import("../src/backend/workflows/workflows");

const CALL_MARK = "WORKFLOW-CALL";
const MEMBER: ConversationMessageSender = { id: "member-1", name: "Remote member" };
const NODE_GAP = 360;

/**
 * A Codex app-server with the methods that the service calls. A turn whose input has
 * `WORKFLOW-CALL <<ARGS{json}ARGS>>` (or `<<B64{base64 json}B64>>`, for a text that a tool argument
 * carries) calls the `openownbot` tool that `__tool` names (default `read_workflow`) through `tool_call`,
 * logs the result, and ends. `__calls` is a list of such calls for one turn, in order. A value
 * `{ "__repeat": [text, count] }` expands to that text repeated, so a large graph fits in a message.
 * Other turns answer "Done.".
 */
const FAKE_CODEX = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.160.1\\n");
  process.exit(0);
}
const LOG = ${JSON.stringify(fakeLog)};
const PROMPTS = ${JSON.stringify(fakePrompts)};
const CALL = ${JSON.stringify(CALL_MARK)};
const config = { config: { mcp_servers: {} }, layers: [{ name: { type: "user", file: "/fake/.codex/config.toml", profile: null }, version: "1", config: { mcp_servers: {} } }] };
let buffer = "";
let threads = 0;
let turns = 0;
/** Tool request id -> the turn that waits for its result. */
const waiting = new Map();
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});
const log = (entry) => appendFileSync(LOG, JSON.stringify(entry) + "\\n");
const write = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
const finish = (threadId, turnId) => {
  const item = { type: "agentMessage", id: "message-" + turnId, text: "Done.", phase: "final_answer" };
  write({ method: "item/completed", params: { threadId, turnId, item } });
  write({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
};
const expand = (value) => {
  if (Array.isArray(value)) return value.map(expand);
  if (value && typeof value === "object") {
    if (Array.isArray(value.__repeat)) return value.__repeat[0].repeat(value.__repeat[1]);
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, expand(inner)]));
  }
  return value;
};
const callsOf = (text) => {
  if (!text.includes(CALL)) return null;
  const plain = /<<ARGS([\\s\\S]*?)ARGS>>/.exec(text);
  const packed = /<<B64([A-Za-z0-9+/=]+)B64>>/.exec(text);
  const raw = plain ? plain[1] : packed ? Buffer.from(packed[1], "base64").toString("utf8") : null;
  if (raw === null) return null;
  const parsed = expand(JSON.parse(raw));
  return Array.isArray(parsed.__calls) ? parsed.__calls : [parsed];
};
const issue = (turn) => {
  const { __tool = "read_workflow", ...args } = turn.calls[turn.index];
  const id = "tool-" + turn.turnId + "-" + turn.index;
  waiting.set(id, { ...turn, tool: __tool });
  write({
    id,
    method: "item/tool/call",
    params: {
      threadId: turn.threadId,
      turnId: turn.turnId,
      callId: "call-" + turn.turnId + "-" + turn.index,
      namespace: "openownbot",
      tool: "tool_call",
      arguments: { name: "openownbot." + __tool, arguments: args },
    },
  });
};
const answer = (message) => {
  const params = message.params || {};
  switch (message.method) {
    case "initialize": return write({ id: message.id, result: {} });
    case "account/read": return write({ id: message.id, result: { account: { type: "chatgpt", email: "codex@example.com" } } });
    case "account/rateLimits/read": return write({ id: message.id, result: { rateLimits: { limitId: "codex", primary: null, secondary: null }, rateLimitsByLimitId: null } });
    case "model/list": return write({ id: message.id, result: { data: [{ model: "gpt-6-luna", displayName: "GPT-6 Luna" }] } });
    case "plugin/list": return write({ id: message.id, result: { marketplaces: [] } });
    case "config/read": return write({ id: message.id, result: config });
    case "config/batchWrite": return write({ id: message.id, result: {} });
    case "thread/start": return write({ id: message.id, result: { thread: { id: "thread-" + (++threads), turns: [] } } });
    case "thread/resume": return write({ id: message.id, result: { thread: { id: params.threadId, turns: [] } } });
    case "thread/unsubscribe": return write({ id: message.id, result: { status: "Unsubscribed" } });
    case "thread/turns/list":
    case "thread/items/list": return write({ id: message.id, result: { data: [], nextCursor: null } });
    case "thread/read": return write({ id: message.id, result: { thread: { id: params.threadId, turns: [] } } });
    case "turn/start": {
      const turnId = "turn-" + (++turns);
      const text = (params.input || []).map((item) => item.text || "").join("\\n");
      appendFileSync(PROMPTS, JSON.stringify({ turnId, text }) + "\\n");
      write({ id: message.id, result: { turn: { id: turnId, status: "inProgress", items: [] } } });
      write({ method: "turn/started", params: { threadId: params.threadId, turn: { id: turnId } } });
      const calls = callsOf(text);
      if (!calls || calls.length === 0) return setTimeout(() => finish(params.threadId, turnId), 20);
      return issue({ threadId: params.threadId, turnId, calls, index: 0 });
    }
    case "turn/interrupt": {
      write({ id: message.id, result: {} });
      return write({ method: "turn/completed", params: { threadId: params.threadId, turn: { id: params.turnId, status: "interrupted" } } });
    }
    default:
      return write({ id: message.id, error: { code: -32601, message: "Method not found: " + message.method } });
  }
};
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\\n");
  while (newline >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (line) {
      const message = JSON.parse(line);
      if (message.method && message.id !== undefined) answer(message);
      else if (!message.method && waiting.has(message.id)) {
        const turn = waiting.get(message.id);
        waiting.delete(message.id);
        log({ turnId: turn.turnId, index: turn.index, tool: turn.tool, result: message.result ?? null, error: message.error ?? null });
        if (turn.index + 1 < turn.calls.length) issue({ ...turn, index: turn.index + 1 });
        else finish(turn.threadId, turn.turnId);
      }
    }
    newline = buffer.indexOf("\\n");
  }
});
`;

interface ToolLog {
  turnId: string;
  index: number;
  tool: string;
  result: { success: boolean; contentItems: { type: string; text: string }[] } | null;
  error: unknown;
}

/** A field value as the fake sends it; `__repeat` expands in the fake. */
type SentFieldValue = string | number | boolean | null | { __repeat: [string, number] };

/** One edit as the fake sends it. Loose on purpose: the check also sends wrong shapes. */
interface SentEdit {
  op: string;
  key?: string;
  kind?: string;
  node?: string;
  fields?: Record<string, SentFieldValue>;
  at?: { x: number; y: number };
  after?: string;
  from?: string;
  to?: string;
  type?: string;
  branch?: string;
  edge?: string;
}

/** The arguments of one call that the fake makes, with the tool that `__tool` names. */
interface SentCall {
  __tool?: "read_workflow" | "edit_workflow" | "send_message" | "create_agent";
  revision?: number;
  edits?: SentEdit[];
  recipientAgentIds?: string[];
  text?: string;
  expectsReply?: boolean;
  name?: string;
  description?: string;
  initialMessage?: string;
}

/** The fields of a tool result that the check reads. The router sends them as JSON text. */
interface ToolBody {
  error?: string;
  workflowId?: string;
  revision?: number;
  nodes?: WorkflowNode[];
  strokes?: number;
  triggers?: { nodeId: string; type: string }[];
  changed?: boolean;
  created?: Record<string, string>;
  keptVersion?: boolean;
  note?: string;
  current?: { revision: number };
}

interface LoggedCall {
  name: string;
  turnId: string;
  tool: string;
  success: boolean | null;
  text: string;
  body: ToolBody | null;
}

const report: {
  calls: LoggedCall[];
  versions: { workflow: string; versions: WorkflowVersion[] }[];
  checks: { name: string; passed: boolean }[];
  notCovered: string[];
  passed: boolean;
  error?: string;
} = {
  calls: [],
  versions: [],
  checks: [],
  notCovered: [
    "Two deliveries with different references in one real turn: the check calls the handler with two texts, as the router would.",
    "An agent node that names a hidden agent: the check names an agent that does not exist.",
    "A member's message through the Team API: the check stamps the member on the message as the host does.",
    "A restart of the process: the reload check opens a second mailbox store on the open database and reads the stored rows through the parser.",
    "How the chat shows the first message of a created agent: the check reads the queue and the prompt, not the rendered chat.",
  ],
  passed: false,
};

const unused = () => Effect.die(new Error("Not used by this check."));
const browser: AgentBrowserHost = {
  listTabs: () => [],
  beginTakeover: unused,
  endTakeover: () => {},
  resolveUploadTarget: unused,
  handleDynamicTool: unused,
  userControlTabFor: () => null,
  awaitUserControlRelease: unused,
  onChanged: () => () => {},
  onControlChanged: () => () => {},
  onDocumentChanged: () => () => {},
  clearControls: () => {},
  endControl: () => {},
  close: () => Effect.void,
  clearAgentSession: () => Effect.void,
};

/** Waits for a state of the service or the fake's log. */
async function waitFor<T>(label: string, read: () => T | null | undefined | false, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((done) => setTimeout(done, 25));
  }
}

function toolLogs(): ToolLog[] {
  let text = "";
  try {
    text = readFileSync(fakeLog, "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** The text of each turn the fake started, in order. */
function turnPrompts(): { turnId: string; text: string }[] {
  let text = "";
  try {
    text = readFileSync(fakePrompts, "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function pass(name: string, condition: boolean, detail?: string) {
  report.checks.push({ name, passed: condition });
  assert.ok(condition, detail ? `${name}: ${detail}` : name);
}

function logged(name: string, entry: ToolLog): LoggedCall {
  const text = entry.result?.contentItems.map((item) => item.text).join("\n") ?? "";
  // A JSON-RPC error has no body; the check then fails on `success`.
  const body: ToolBody | null = text ? JSON.parse(text) : null;
  const call = { name, turnId: entry.turnId, tool: entry.tool, success: entry.result?.success ?? null, text, body };
  report.calls.push(call);
  return call;
}

/** The text of a message that makes the fake call the tools, after the reference line when there is one. */
function callText(reference: string | null, calls: SentCall[]): string {
  const args = calls.length === 1 ? calls[0] : { __calls: calls };
  const line = `${CALL_MARK} <<ARGS${JSON.stringify(args)}ARGS>>`;
  return reference === null ? line : `${reference}\n${line}`;
}

/** The same, packed so that it can travel inside another call's JSON. */
function packedCallText(reference: string, calls: SentCall[]): string {
  const args = calls.length === 1 ? calls[0] : { __calls: calls };
  return `${reference}\n${CALL_MARK} <<B64${Buffer.from(JSON.stringify(args)).toString("base64")}B64>>`;
}

await writeFile(fakeCodex, FAKE_CODEX, { mode: 0o755 });
const database = new OpenOwnBotDatabase(userData);
const store = new AgentStore(userData, home, database);
const mailbox = new MailboxStore(userData, store.sharedRoot, store.database);
const changedIds: string[] = [];
const turnEnds: Extract<AgentEvent, { type: "turn-completed" }>[] = [];
let rearms = 0;
const agents = new AgentService({
  store,
  mailbox,
  browser,
  preferredProvider: "codex",
  offProviders: AGENT_PROVIDERS.filter((provider) => provider !== "codex"),
  // As in the app: the workflows service is built after the agent service.
  workflowTools: () => workflows,
  channelRemotePerson: (personId) => personId === MEMBER.id,
});
agents.on("event", (event) => {
  if (event.type === "turn-completed") turnEnds.push(event);
});
const workflows = await Effect.runPromise(
  createWorkflows({
    store: new WorkflowStore({ database, nextDueAt: workflowScheduleDueAt(() => "UTC") }),
    runs: new WorkflowRunStore({ database }),
    delivery: () => null,
    turnAnswer: () => null,
    sendHandoff: () => Effect.fail({ cause: new Error("No run starts in this check.") }),
    stopDelivery: () => Effect.void,
    generateText: () => Effect.fail({ message: "No model step runs in this check." }),
    notify: () => {},
    connectionOn: () => false,
    post: () => Effect.succeed({ posted: true as const }),
    changed: (workflowId) => {
      changedIds.push(workflowId);
      agents.notifyWorkflowsChanged(workflowId);
    },
    rearm: () => {
      rearms += 1;
    },
    timezone: () => "UTC",
  }),
);

/**
 * Sends a chat message to an agent and returns the tool results that the fake logged for that
 * message's turn, in call order.
 */
async function callTools(
  name: string,
  agentId: string,
  text: string,
  count: number,
  sender?: ConversationMessageSender,
): Promise<LoggedCall[]> {
  const receipt = await runCauseEffect(agents.sendMessage({ agentId, text }, sender));
  const deliveryId = receipt.deliveries[0]?.id;
  assert.ok(deliveryId, `${name}: no delivery`);
  const turnId = await waitFor(`${name} turn`, () => mailbox.getDelivery(deliveryId)?.delivery.turnId);
  const entries = await waitFor(`${name} tool results`, () => {
    const found = toolLogs().filter((log) => log.turnId === turnId);
    return found.length >= count ? found : null;
  });
  await waitFor(`${name} turn end`, () => {
    const status = mailbox.getDelivery(deliveryId)?.delivery.status;
    return status === "completed" || status === "failed" || status === "interrupted";
  });
  return entries.sort((a, b) => a.index - b.index).map((entry, index) => logged(`${name} ${index + 1}`, entry));
}

/** The next tool results after `before` of them, for a turn that no chat message of ours started. */
async function nextTools(name: string, before: number, count: number): Promise<LoggedCall[]> {
  const entries = await waitFor(`${name} tool results`, () => {
    const logs = toolLogs();
    return logs.length >= before + count ? logs.slice(before, before + count) : null;
  });
  return entries.map((entry, index) => logged(`${name} ${index + 1}`, entry));
}

const detail = (workflowId: string): Promise<WorkflowDetail> => runCauseEffect(workflows.get(workflowId));
const versionsOf = (workflowId: string): Promise<WorkflowVersion[]> => runCauseEffect(workflows.versions(workflowId));
const refusedAll = (calls: LoggedCall[]) => calls.every((call) => call.success === false);
const sameGraph = (a: WorkflowGraph, b: WorkflowGraph) => JSON.stringify(a) === JSON.stringify(b);

function node(
  id: string,
  kind: WorkflowNode["kind"],
  x: number,
  y: number,
  fields: WorkflowNode["fields"],
): WorkflowNode {
  return { id, kind, at: { x, y }, fields };
}

try {
  await runCauseEffect(agents.initialize());
  const createAgent = (name: string) =>
    runCauseEffect(
      agents.createAgent({
        name,
        description: `${name} of the check.`,
        avatarSeed: name.toLowerCase(),
        avatarHue: null,
        initialMessage: "Hello.",
      }),
    );
  const planner = await createAgent("Planner");
  const helper = await createAgent("Helper");
  for (const agent of [planner, helper])
    await waitFor(`the first chat turn of ${agent.name} to end`, () =>
      agents
        .listQueue(agent.id)
        .deliveries.every((delivery) => !["queued", "starting", "running"].includes(delivery.status)),
    );

  // The workflows. "Main" has view fields, a locked node and a stroke that every edit must keep.
  const mainGraph: WorkflowGraph = {
    nodes: [
      node("t1", "trigger", 0, 0, { trigger: "manual" }),
      {
        ...node("a1", "agent", 360, 0, { agentId: planner.id, task: "Do it", color: "#ff0000" }),
        size: { width: 240 },
      },
      node("o1", "output", 720, 0, { target: "notify" }),
      { ...node("l1", "note", 0, 300, { text: "Keep me here." }), locked: true },
      node("x1", "text", 0, 600, { text: "A label", font: "mono" }),
    ],
    edges: [
      { id: "e1", from: "t1", to: "a1", type: "text" },
      { id: "e2", from: "a1", to: "o1", type: "text" },
    ],
    strokes: [
      {
        id: "s1",
        brush: "pen",
        color: "#000000",
        width: 2,
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      },
    ],
  };
  // "Armed" has every trigger kind and an output to a messaging place; the agent cannot touch them.
  const armedGraph: WorkflowGraph = {
    nodes: [
      {
        ...node("s1", "trigger", 0, 0, { trigger: "schedule", timezone: "UTC" }),
        schedule: { kind: "daily", time: "09:00" },
      },
      node("w1", "trigger", 0, 200, { trigger: "webhook" }),
      node("m1", "trigger", 0, 400, { trigger: "message" }),
      node("a2", "agent", 360, 0, { agentId: helper.id, task: "Summarize." }),
      node("co1", "output", 720, 0, { target: "channel", connectionId: "conn-1", placeId: "place-1" }),
    ],
    edges: [
      { id: "e3", from: "s1", to: "a2", type: "text" },
      { id: "e4", from: "a2", to: "co1", type: "text" },
    ],
    strokes: [],
  };
  const versionsGraph: WorkflowGraph = {
    nodes: [node("t3", "trigger", 0, 0, { trigger: "manual" }), node("p3", "prompt", 360, 0, { text: "hello" })],
    edges: [],
    strokes: [],
  };
  const main = await runCauseEffect(workflows.create({ title: "Main", graph: mainGraph }));
  const armed = await runCauseEffect(workflows.create({ title: "Armed", graph: armedGraph }));
  const kept = await runCauseEffect(workflows.create({ title: "Versions", graph: versionsGraph }));
  const mainId = main.summary.id;
  const refMain = workflowChatReference(mainId, "Main");
  const refArmed = workflowChatReference(armed.summary.id, "Armed");
  const refKept = workflowChatReference(kept.summary.id, "Versions");

  // 1. A read, then an edit that adds a node, connects it and changes a field.
  const [read] = await callTools("read", planner.id, callText(refMain, [{ __tool: "read_workflow" }]), 1);
  assert.ok(read, "no read result");
  pass(
    "read_workflow answers with the graph and its revision",
    read.success === true && read.body?.revision === main.revision,
  );
  pass(
    "read_workflow lists every node and the triggers, and counts the strokes",
    read.body?.nodes?.length === 5 && read.body.triggers?.[0]?.nodeId === "t1" && read.body.strokes === 1,
  );
  pass("read_workflow has no webhook address", !read.text.includes("webhookUrl"));
  // Each create plans the triggers too; only the change from here on is the edit's.
  const rearmsBefore = rearms;
  const [edited] = await callTools(
    "edit",
    planner.id,
    callText(refMain, [
      {
        __tool: "edit_workflow",
        revision: main.revision,
        edits: [
          { op: "add_node", key: "p", kind: "prompt", fields: { text: "Say hi" }, after: "a1" },
          { op: "connect", from: "p", to: "o1" },
          { op: "update_node", node: "a1", fields: { task: "Do it well" } },
        ],
      },
    ]),
    1,
  );
  assert.ok(edited, "no edit result");
  pass(
    "edit_workflow saves and answers with the new revision, the new node id and the kept version",
    edited.success === true &&
      edited.body?.changed === true &&
      edited.body.revision === main.revision + 1 &&
      edited.body.created?.p?.startsWith("prompt-") === true &&
      edited.body.keptVersion === true,
    edited.text,
  );
  const promptId = edited.body?.created?.p ?? "";
  const afterEdit = await detail(mainId);
  pass(
    "The stored graph keeps the strokes",
    sameGraph({ ...afterEdit.graph, nodes: [], edges: [] }, { ...mainGraph, nodes: [], edges: [] }),
  );
  pass(
    "The stored graph keeps the node ids and their order, and appends the new node",
    JSON.stringify(afterEdit.graph.nodes.map((item) => item.id)) ===
      JSON.stringify([...mainGraph.nodes.map((item) => item.id), promptId]),
  );
  const storedAgent = afterEdit.graph.nodes.find((item) => item.id === "a1");
  const storedLabel = afterEdit.graph.nodes.find((item) => item.id === "x1");
  const storedLocked = afterEdit.graph.nodes.find((item) => item.id === "l1");
  pass(
    "The stored graph keeps the view fields, the size and the lock of the nodes it did not name",
    storedAgent?.fields.task === "Do it well" &&
      storedAgent.fields.color === "#ff0000" &&
      storedAgent.size?.width === 240 &&
      storedLabel?.fields.font === "mono" &&
      storedLocked?.locked === true,
  );
  const storedPrompt = afterEdit.graph.nodes.find((item) => item.id === promptId);
  pass(
    "The new node goes right of the node it follows",
    storedPrompt?.at.x === 360 + NODE_GAP && storedPrompt.at.y === 0 && storedPrompt.fields.text === "Say hi",
  );
  pass(
    "The stored graph keeps the old edges and has the new one",
    afterEdit.graph.edges.length === 3 &&
      afterEdit.graph.edges
        .slice(0, 2)
        .every((edge, index) => JSON.stringify(edge) === JSON.stringify(mainGraph.edges[index])) &&
      afterEdit.graph.edges[2]?.from === promptId &&
      afterEdit.graph.edges[2].to === "o1" &&
      afterEdit.graph.edges[2].type === "text",
  );
  pass(
    "A real save tells the host and plans the triggers again",
    changedIds.includes(mainId) && rearms === rearmsBefore + 1,
  );

  // 2. The revision that the read gave is stale now: the current graph comes back and nothing saves.
  const [stale] = await callTools(
    "stale",
    planner.id,
    callText(refMain, [
      {
        __tool: "edit_workflow",
        revision: main.revision,
        edits: [{ op: "update_node", node: "a1", fields: { task: "Lost" } }],
      },
    ]),
    1,
  );
  const afterStale = await detail(mainId);
  pass(
    "A stale revision is a failure that carries the current revision, and saves nothing",
    stale?.success === false &&
      stale.body?.error?.includes("changed since you read it") === true &&
      stale.body.current?.revision === afterEdit.revision &&
      afterStale.revision === afterEdit.revision &&
      sameGraph(afterStale.graph, afterEdit.graph),
    stale?.text,
  );

  // 3. Every edit that would arm the workflow, write to a file or touch a locked node is refused.
  const refusedMain: { name: string; edits: SentEdit[] }[] = [
    {
      name: "add schedule trigger",
      edits: [{ op: "add_node", key: "n", kind: "trigger", fields: { trigger: "schedule" } }],
    },
    {
      name: "add webhook trigger",
      edits: [{ op: "add_node", key: "n", kind: "trigger", fields: { trigger: "webhook" } }],
    },
    {
      name: "add message trigger",
      edits: [{ op: "add_node", key: "n", kind: "trigger", fields: { trigger: "message" } }],
    },
    {
      name: "change manual trigger to webhook",
      edits: [{ op: "update_node", node: "t1", fields: { trigger: "webhook" } }],
    },
    {
      name: "add channel output",
      edits: [
        { op: "add_node", key: "n", kind: "output", fields: { target: "channel", connectionId: "c", placeId: "p" } },
      ],
    },
    { name: "add file output", edits: [{ op: "add_node", key: "n", kind: "output", fields: { target: "file" } }] },
    { name: "change output to file", edits: [{ op: "update_node", node: "o1", fields: { target: "file" } }] },
    { name: "move locked node", edits: [{ op: "update_node", node: "l1", at: { x: 5, y: 5 } }] },
    { name: "remove locked node", edits: [{ op: "remove_node", node: "l1" }] },
    {
      name: "name an unknown agent",
      edits: [{ op: "add_node", key: "n", kind: "agent", fields: { agentId: "nobody" } }],
    },
    { name: "name an unknown node", edits: [{ op: "update_node", node: "nope", fields: { task: "x" } }] },
    { name: "connect the same edge twice", edits: [{ op: "connect", from: "t1", to: "a1" }] },
    { name: "send an unknown op", edits: [{ op: "teleport", node: "a1" }] },
    { name: "send too many edits", edits: Array.from({ length: 51 }, () => ({ op: "remove_node", node: "x1" })) },
  ];
  const mainRefusals = await callTools(
    "refused on Main",
    planner.id,
    callText(
      refMain,
      refusedMain.map(({ edits }) => ({ __tool: "edit_workflow", revision: afterEdit.revision, edits })),
    ),
    refusedMain.length,
  );
  // An edit on the armed workflow that leaves its triggers and its place alone saves, and the
  // trigger rows stay as they were: the store plans a row again only when its values change.
  const armedId = armed.summary.id;
  const [armedEdit] = await callTools(
    "edit on Armed",
    planner.id,
    callText(refArmed, [
      {
        __tool: "edit_workflow",
        revision: armed.revision,
        edits: [{ op: "update_node", node: "a2", fields: { task: "Summarize in one line." } }],
      },
    ]),
    1,
  );
  const armedAfterEdit = await detail(armedId);
  const nodeOf = (graph: WorkflowGraph, id: string) => JSON.stringify(graph.nodes.find((item) => item.id === id));
  pass(
    "An edit beside the triggers of an armed workflow saves and keeps a version",
    armedEdit?.success === true &&
      armedEdit.body?.changed === true &&
      armedEdit.body.keptVersion === true &&
      armedAfterEdit.revision === armed.revision + 1 &&
      armedAfterEdit.graph.nodes.find((item) => item.id === "a2")?.fields.task === "Summarize in one line.",
    armedEdit?.text,
  );
  pass(
    "The trigger rows, the trigger nodes and the messaging place of the armed workflow stay as they were",
    JSON.stringify(armedAfterEdit.triggers) === JSON.stringify(armed.triggers) &&
      // The store keeps a row for a schedule and a webhook trigger; a message trigger has none.
      armed.triggers.length === 2 &&
      armed.triggers.some((trigger) => trigger.type === "schedule" && trigger.nextDueAt !== null) &&
      ["s1", "w1", "m1", "co1"].every((id) => nodeOf(armedAfterEdit.graph, id) === nodeOf(armed.graph, id)),
    JSON.stringify({ before: armed.triggers, after: armedAfterEdit.triggers }),
  );
  const armedVersions = await versionsOf(armedId);
  const armedKept = armedVersions[0];
  pass(
    "The armed workflow keeps the graph from before the edit",
    armedVersions.length === 1 &&
      armedKept?.kind === "auto" &&
      armedKept.revision === armed.revision &&
      sameGraph(
        await runCauseEffect(workflows.versionGraph({ workflowId: armedId, versionId: armedKept.id })),
        armed.graph,
      ),
    JSON.stringify(armedVersions),
  );
  const rearmsAfterArmed = rearms;
  pass("The edit on the armed workflow plans the triggers again", rearmsAfterArmed === rearmsBefore + 2);

  const refusedArmed: { name: string; edits: SentEdit[] }[] = [
    {
      name: "change schedule trigger timezone",
      edits: [{ op: "update_node", node: "s1", fields: { timezone: "Asia/Seoul" } }],
    },
    { name: "remove schedule trigger", edits: [{ op: "remove_node", node: "s1" }] },
    {
      name: "change webhook trigger to manual",
      edits: [{ op: "update_node", node: "w1", fields: { trigger: "manual" } }],
    },
    { name: "remove webhook trigger", edits: [{ op: "remove_node", node: "w1" }] },
    { name: "remove message trigger", edits: [{ op: "remove_node", node: "m1" }] },
    {
      name: "move channel output to another place",
      edits: [{ op: "update_node", node: "co1", fields: { placeId: "place-2" } }],
    },
  ];
  const armedRefusals = await callTools(
    "refused on Armed",
    planner.id,
    callText(
      refArmed,
      refusedArmed.map(({ edits }) => ({ __tool: "edit_workflow", revision: armedAfterEdit.revision, edits })),
    ),
    refusedArmed.length,
  );
  const refusals = [...mainRefusals, ...armedRefusals];
  const refusalNames = [...refusedMain, ...refusedArmed].map((item) => item.name);
  for (const [index, call] of refusals.entries()) call.name = `refused: ${refusalNames[index]}`;
  pass(
    "Every refused edit is a tool failure",
    refusedAll(refusals),
    refusals.map((call) => `${call.name}: ${call.text}`).join("\n"),
  );
  const canvasRefusals = refusals.filter((call) => /trigger|channel output/.test(call.name));
  pass(
    "An edit that would arm the workflow tells the model to send the user to the canvas",
    canvasRefusals.length === 11 && canvasRefusals.every((call) => call.text.includes("change it on the canvas")),
  );
  pass(
    "A file output, a locked node, an unknown node and a duplicate edge are refused by the edit that names them",
    refusals
      .filter((call) => /file|locked|unknown node|twice/.test(call.name))
      .every((call) => /^Edit \d+ \(/.test(call.body?.error ?? "")),
  );
  pass(
    "An unknown agent, an unknown op and too many edits are refused as such",
    refusals.find((call) => call.name.includes("unknown agent"))?.text.includes("Unknown agent: nobody") === true &&
      refusals.find((call) => call.name.includes("unknown op"))?.text.includes("Invalid arguments") === true &&
      refusals.find((call) => call.name.includes("too many"))?.text.includes("Invalid arguments") === true,
  );
  const mainAfterRefusals = await detail(mainId);
  const armedAfterRefusals = await detail(armedId);
  pass(
    "Refused edits save nothing",
    mainAfterRefusals.revision === afterEdit.revision &&
      sameGraph(mainAfterRefusals.graph, afterEdit.graph) &&
      armedAfterRefusals.revision === armedAfterEdit.revision &&
      sameGraph(armedAfterRefusals.graph, armedAfterEdit.graph) &&
      rearms === rearmsAfterArmed,
  );

  // 4. Only a person's message in the agent's own chat can use the tools.
  const addNote: SentCall = {
    __tool: "edit_workflow",
    revision: afterEdit.revision,
    edits: [{ op: "add_node", key: "n", kind: "note", fields: { text: "From elsewhere" } }],
  };
  const beforeRoutine = toolLogs().length;
  const routine = agents.routines.create({
    agentId: planner.id,
    name: "Injected",
    instruction: callText(refMain, [addNote]),
    active: false,
    timezone: "UTC",
    schedule: { kind: "daily", time: "09:00" },
  });
  await runCauseEffect(agents.routines.test({ agentId: planner.id, routineId: routine.id }));
  const [fromRoutine] = await nextTools("routine run", beforeRoutine, 1);
  pass(
    "A routine run cannot use the workflow tools",
    fromRoutine?.success === false && fromRoutine.text.includes("Only a person's message"),
    fromRoutine?.text,
  );
  const beforeAgent = toolLogs().length;
  await callTools(
    "agent message",
    planner.id,
    callText(null, [
      {
        __tool: "send_message",
        recipientAgentIds: [helper.id],
        text: packedCallText(refMain, [addNote]),
        expectsReply: false,
      },
    ]),
    1,
  );
  const [fromAgent] = await nextTools("agent message tool", beforeAgent + 1, 1);
  pass(
    "An agent's message to another agent cannot use the workflow tools",
    fromAgent?.tool === "edit_workflow" &&
      fromAgent.success === false &&
      fromAgent.text.includes("Only a person's message"),
    fromAgent?.text,
  );
  const beforeTask = toolLogs().length;
  await runCauseEffect(agents.tasks.start({ agentId: planner.id, text: callText(refMain, [addNote]) }));
  const [fromTask] = await nextTools("task thread", beforeTask, 1);
  pass(
    "A person's task thread cannot use the workflow tools",
    fromTask?.success === false && fromTask.text.includes("Only a person's message"),
    fromTask?.text,
  );
  const [fromMember] = await callTools("member message", planner.id, callText(refMain, [addNote]), 1, MEMBER);
  pass(
    "A team member's message cannot use the workflow tools",
    fromMember?.success === false && fromMember.text.includes("Only a person's message"),
    fromMember?.text,
  );
  // The first message of an agent that `create_agent` makes is a tool call's text, not a person's.
  const beforeCreated = toolLogs().length;
  const recruitMessage = packedCallText(refMain, [{ __tool: "read_workflow" }, addNote]);
  const [created] = await callTools(
    "create agent",
    planner.id,
    callText(null, [
      {
        __tool: "create_agent",
        name: "Recruit",
        description: "Recruit of the check.",
        initialMessage: recruitMessage,
      },
    ]),
    1,
  );
  pass("create_agent makes the agent", created?.success === true, created?.text);
  // The fake numbers its turns per process, so the new agent's results are found by tool, not by turn.
  const fromCreated = await waitFor("the created agent's tool results", () => {
    const entries = toolLogs()
      .slice(beforeCreated)
      .filter((entry) => entry.tool !== "create_agent");
    return entries.length >= 2 ? entries : null;
  });
  const createdCalls = fromCreated.map((entry, index) => logged(`created agent ${index + 1}`, entry));
  const createdRead = createdCalls.find((call) => call.tool === "read_workflow");
  const createdEdit = createdCalls.find((call) => call.tool === "edit_workflow");
  pass(
    "The first message that create_agent writes cannot use the workflow tools",
    createdRead?.success === false &&
      createdRead.text.includes("Only a person's message") &&
      createdEdit?.success === false &&
      createdEdit.text.includes("Only a person's message"),
    createdCalls.map((call) => call.text).join("\n"),
  );
  // `create_agent` changes nothing else about that first message: it is a user message that the new
  // agent reads as a person's, and its answer does not go back to the creator.
  const recruit = agents.listAgents().find((agent) => agent.name === "Recruit");
  assert.ok(recruit, "the created agent is listed");
  await waitFor("the created agent's first turn to end", () =>
    turnEnds.find((event) => event.agentId === recruit.id && event.status === "completed"),
  );
  const [recruitFirst] = agents.listQueue(recruit.id).deliveries;
  assert.ok(recruitFirst, "the created agent has its first delivery");
  pass("The first message that create_agent writes is still a user message", recruitFirst.sender.kind === "user");
  const recruitPrompts = turnPrompts().filter((entry) => entry.text.includes(recruitMessage));
  pass(
    "The new agent reads it as written, with no teammate framing",
    recruitPrompts.length === 1 && recruitPrompts[0]?.text === recruitMessage,
    recruitPrompts.map((entry) => entry.text).join("\n---\n"),
  );
  // The relay runs before the turn-completed event, so the creator would have its answer by now.
  pass(
    "The new agent's answer is not relayed to the creator",
    !mailbox.hasReplyFrom(recruit.id, recruitFirst.messageId) &&
      !agents
        .listQueue(planner.id)
        .deliveries.some((delivery) => delivery.sender.kind === "agent" && delivery.sender.agentId === recruit.id),
  );
  const plannerFirst = agents.listQueue(planner.id).deliveries.find((delivery) => delivery.text === "Hello.");
  assert.ok(plannerFirst, "the planner has its first delivery");
  const reloadedMailbox = new MailboxStore(userData, store.sharedRoot, database);
  await runCauseEffect(reloadedMailbox.initialize());
  pass(
    "The creator stays stamped on the message in the mailbox and after a reload, and a person's message has no stamp",
    mailbox.writtenByAgentIdOf(recruitFirst.messageId) === planner.id &&
      reloadedMailbox.writtenByAgentIdOf(recruitFirst.messageId) === planner.id &&
      reloadedMailbox.getDelivery(recruitFirst.id)?.delivery.sender.kind === "user" &&
      mailbox.writtenByAgentIdOf(plannerFirst.messageId) === undefined &&
      reloadedMailbox.writtenByAgentIdOf(plannerFirst.messageId) === undefined,
  );
  // A person who edits the queued message writes its words, so the stamp goes.
  const editRoot = join(root, "edit-profile");
  const editMailbox = new MailboxStore(editRoot, join(root, "edit-shared"), new OpenOwnBotDatabase(editRoot));
  await runCauseEffect(editMailbox.initialize());
  const written = await runCauseEffect(
    editMailbox.enqueue({
      sender: { kind: "user" },
      writtenByAgentId: planner.id,
      recipientAgentIds: [helper.id],
      text: "Written by a tool call.",
    }),
  );
  const writtenDelivery = written.deliveries[0]?.id;
  assert.ok(writtenDelivery, "the queued message has a delivery");
  editMailbox.beginQueueEdit(helper.id, writtenDelivery, "edit-1");
  const stampedBeforeEdit = editMailbox.writtenByAgentIdOf(written.messageId) === planner.id;
  await runCauseEffect(
    editMailbox.updateQueuedMessage(helper.id, writtenDelivery, "Saved by a person.", [], [], "edit-1", MEMBER),
  );
  pass(
    "A person's edit of a message that a tool call wrote clears the stamp",
    stampedBeforeEdit && editMailbox.writtenByAgentIdOf(written.messageId) === undefined,
  );
  const mainAfterOthers = await detail(mainId);
  pass(
    "None of them saved anything",
    mainAfterOthers.revision === afterEdit.revision && sameGraph(mainAfterOthers.graph, afterEdit.graph),
  );

  // 5. The workflow comes from the reference line, and only from it.
  const [noReference] = await callTools("no reference", planner.id, callText(null, [{ __tool: "read_workflow" }]), 1);
  pass(
    "A chat with no reference line is not about a workflow",
    noReference?.success === false && noReference.text.includes("not about a workflow"),
    noReference?.text,
  );
  const [lateReference] = await callTools(
    "reference not first",
    planner.id,
    `Please.\n${callText(refMain, [{ __tool: "read_workflow" }])}`,
    1,
  );
  pass(
    "A reference that is not the first line does not count",
    lateReference?.success === false && lateReference.text.includes("not about a workflow"),
    lateReference?.text,
  );
  const [ghost] = await callTools(
    "unknown workflow",
    planner.id,
    callText(workflowChatReference(randomUUID(), "Ghost"), [{ __tool: "read_workflow" }]),
    1,
  );
  pass(
    "A reference to a workflow that does not exist is a failure the model reads",
    ghost?.success === false,
    ghost?.text,
  );
  const twoReferences = await Effect.runPromise(
    handleWorkflowTool(
      "read_workflow",
      {},
      {
        turnId: "direct-turn",
        agentIds: () => new Set([planner.id, helper.id]),
        turn: () => ({ requester: { kind: "host-person" }, texts: [refMain, refArmed] }),
      },
      workflows,
    ),
  );
  const twoReferencesText = twoReferences?.contentItems.map((item) => item.text).join("\n") ?? "";
  report.calls.push({
    name: "two references",
    turnId: "direct-turn",
    tool: "read_workflow",
    success: twoReferences?.success ?? null,
    text: twoReferencesText,
    body: twoReferencesText ? JSON.parse(twoReferencesText) : null,
  });
  pass(
    "Two deliveries about different workflows are refused",
    twoReferences?.success === false && twoReferencesText.includes("different workflows"),
    twoReferencesText,
  );

  // 6. Two edits in one turn keep one version of the graph before them; a later turn keeps another.
  const keptId = kept.summary.id;
  pass("A new workflow has no version", (await versionsOf(keptId)).length === 0);
  const twoEdits = await callTools(
    "two edits in one turn",
    planner.id,
    callText(refKept, [
      {
        __tool: "edit_workflow",
        revision: kept.revision,
        edits: [{ op: "add_node", key: "q", kind: "prompt", fields: { text: "second" }, after: "p3" }],
      },
      {
        __tool: "edit_workflow",
        revision: kept.revision + 1,
        edits: [{ op: "update_node", node: "p3", fields: { text: "hello again" } }],
      },
    ]),
    2,
  );
  pass(
    "Both edits of the turn save; the first keeps a version and the second does not",
    twoEdits[0]?.body?.keptVersion === true &&
      twoEdits[0].body.note?.includes("Tell the user") === true &&
      twoEdits[1]?.body?.keptVersion === false &&
      twoEdits[1].body.revision === kept.revision + 2,
    twoEdits.map((call) => call.text).join("\n"),
  );
  const afterTurn = await versionsOf(keptId);
  const firstKept = afterTurn[0];
  pass(
    "Exactly one auto version holds the graph from before the turn",
    afterTurn.length === 1 && firstKept?.kind === "auto" && firstKept.revision === kept.revision,
    JSON.stringify(afterTurn),
  );
  assert.ok(firstKept, "no kept version");
  pass(
    "The kept version is the graph before the turn's first edit",
    sameGraph(
      await runCauseEffect(workflows.versionGraph({ workflowId: keptId, versionId: firstKept.id })),
      kept.graph,
    ),
  );
  const beforeLater = await detail(keptId);
  const [later] = await callTools(
    "later turn",
    planner.id,
    callText(refKept, [
      {
        __tool: "edit_workflow",
        revision: beforeLater.revision,
        edits: [{ op: "update_node", node: "p3", fields: { text: "third" } }],
      },
    ]),
    1,
  );
  const afterLater = await versionsOf(keptId);
  const secondKept = afterLater[0];
  pass(
    "A later turn keeps one more auto version, of the graph before it",
    later?.body?.keptVersion === true &&
      afterLater.length === 2 &&
      secondKept?.kind === "auto" &&
      secondKept.revision === beforeLater.revision &&
      sameGraph(
        await runCauseEffect(workflows.versionGraph({ workflowId: keptId, versionId: secondKept.id })),
        beforeLater.graph,
      ),
    JSON.stringify(afterLater),
  );
  report.versions.push({ workflow: "Versions", versions: afterLater });

  // 7. An edit that changes nothing saves nothing.
  const beforeNoop = await detail(keptId);
  const changesBefore = changedIds.length;
  const [noop] = await callTools(
    "no-op",
    planner.id,
    callText(refKept, [
      {
        __tool: "edit_workflow",
        revision: beforeNoop.revision,
        edits: [{ op: "update_node", node: "p3", fields: { text: "third" } }],
      },
    ]),
    1,
  );
  const afterNoop = await detail(keptId);
  pass(
    "A no-op edit answers unchanged and saves nothing",
    noop?.success === true &&
      noop.body?.changed === false &&
      noop.body.revision === beforeNoop.revision &&
      afterNoop.revision === beforeNoop.revision &&
      (await versionsOf(keptId)).length === 2 &&
      changedIds.length === changesBefore,
    noop?.text,
  );

  // 8. A graph too large, or against the port rules, is refused by the store; the stored graph stays.
  const wide: Record<string, SentFieldValue> = Object.fromEntries(
    Array.from({ length: 32 }, (_, index) => [`f${index}`, { __repeat: ["x", 20_000] }]),
  );
  const [tooLarge, badPort] = await callTools(
    "store refusals",
    planner.id,
    callText(refMain, [
      {
        __tool: "edit_workflow",
        revision: afterEdit.revision,
        edits: [
          { op: "add_node", key: "big1", kind: "note", fields: wide },
          { op: "add_node", key: "big2", kind: "note", fields: wide },
        ],
      },
      {
        __tool: "edit_workflow",
        revision: afterEdit.revision,
        edits: [{ op: "connect", from: "t1", to: "o1", type: "image" }],
      },
    ]),
    2,
  );
  pass(
    "A graph too large is refused with the sentence of the store",
    tooLarge?.success === false && tooLarge.body?.error === sourceText("error.workflow.tooLarge"),
    tooLarge?.text,
  );
  pass(
    "An edge against the port rules is refused with the sentence of the store",
    badPort?.success === false && badPort.body?.error === sourceText("error.workflow.port"),
    badPort?.text,
  );
  const mainAtEnd = await detail(mainId);
  pass(
    "The stored graph still reads back unchanged",
    mainAtEnd.revision === afterEdit.revision && sameGraph(mainAtEnd.graph, afterEdit.graph),
  );

  // 9. The effort of an agent step is one of the five levels; any other value is a failure the model reads.
  const effortBase = await detail(armedId);
  const [badLevel, badType] = await callTools(
    "bad effort",
    planner.id,
    callText(refArmed, [
      {
        __tool: "edit_workflow",
        revision: effortBase.revision,
        edits: [{ op: "update_node", node: "a2", fields: { effort: "turbo" } }],
      },
      {
        __tool: "edit_workflow",
        revision: effortBase.revision,
        edits: [{ op: "add_node", key: "n", kind: "agent", fields: { agentId: helper.id, task: "x", effort: 7 } }],
      },
    ]),
    2,
  );
  const afterBadEffort = await detail(armedId);
  pass(
    "An agent step with an unknown effort is refused with a sentence that names the levels, and saves nothing",
    badLevel?.success === false &&
      badLevel.body?.error?.startsWith("Edit 1 (update_node):") === true &&
      badLevel.body.error.includes("low, medium, high, xhigh, max") &&
      badLevel.body.error.includes('"turbo"'),
    badLevel?.text,
  );
  pass(
    "An agent step with an effort that is not a text is refused too, and the stored graph is unchanged",
    badType?.success === false &&
      badType.body?.error?.startsWith("Edit 1 (add_node):") === true &&
      afterBadEffort.revision === effortBase.revision &&
      sameGraph(afterBadEffort.graph, effortBase.graph),
    badType?.text,
  );
  const [setHigh] = await callTools(
    "set effort",
    planner.id,
    callText(refArmed, [
      {
        __tool: "edit_workflow",
        revision: effortBase.revision,
        edits: [{ op: "update_node", node: "a2", fields: { effort: "high" } }],
      },
    ]),
    1,
  );
  const withEffort = await detail(armedId);
  pass(
    "A valid effort saves on the agent step and leaves its other fields",
    setHigh?.success === true &&
      withEffort.revision === effortBase.revision + 1 &&
      withEffort.graph.nodes.find((item) => item.id === "a2")?.fields.effort === "high" &&
      withEffort.graph.nodes.find((item) => item.id === "a2")?.fields.task === "Summarize in one line.",
    setHigh?.text,
  );
  const [modelStep, clearEffort] = await callTools(
    "other kinds and clearing",
    planner.id,
    callText(refArmed, [
      {
        __tool: "edit_workflow",
        revision: withEffort.revision,
        edits: [{ op: "add_node", key: "m", kind: "llm", fields: { prompt: "Sum up.", effort: "turbo" } }],
      },
      {
        __tool: "edit_workflow",
        revision: withEffort.revision + 1,
        edits: [{ op: "update_node", node: "a2", fields: { effort: null } }],
      },
    ]),
    2,
  );
  const clearedEffort = await detail(armedId);
  pass(
    "A model step keeps whatever effort it was given before, and null takes the effort off an agent step",
    modelStep?.success === true &&
      clearEffort?.success === true &&
      clearedEffort.graph.nodes.some((item) => item.kind === "llm" && item.fields.effort === "turbo") &&
      clearedEffort.graph.nodes.find((item) => item.id === "a2")?.fields.effort === undefined,
    `${modelStep?.text} ${clearEffort?.text}`,
  );
  report.versions.push({ workflow: "Main", versions: await versionsOf(mainId) });
  report.versions.push({ workflow: "Armed", versions: await versionsOf(armedId) });
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.exitCode = 1;
} finally {
  await runCauseEffect(agents.stop()).catch(() => {});
  await Effect.runPromise(workflows.close()).catch(() => {});
  database.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
  process.stdout.write(`${report.passed ? "PASS" : "FAIL"} ${join(OUT, "report.json")}\n`);
  if (report.error) process.stdout.write(`${report.error}\n`);
}
