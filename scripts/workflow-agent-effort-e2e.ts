// Checks that an agent step of a workflow starts its turn with the effort that its node asks for, and
// with nothing else changed. Runs the real agent service, workflows service, mailbox and drain on a
// temporary profile with a fake Codex app-server that logs the `effort` of every `turn/start`. The
// check asserts that a step with `effort: "high"` starts its turn with high, that the next ordinary
// chat turn of the same agent goes back to the agent's own effort, that a step without an effort and
// a step with an effort that the agent's model does not offer (one warning) or that is not a level at
// all run with the agent's own effort, and that the effort is kept beside the message, survives a
// reload of the mailbox, and does not show in the queue or in the delivery that a client reads.
// `bun scripts/workflow-agent-effort-e2e.ts`. Writes .openbot-build/workflow-agent-effort-e2e/report.json.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AGENT_PROVIDERS, type AgentEvent } from "@openbot/contracts/ipc";
import { teeLogLines } from "@openbot/logging";
import { Effect } from "effect";
import type { AgentBrowserHost } from "../src/backend/agent/turn-lifecycle";

const OUT = resolve(import.meta.dirname, "../.openbot-build/workflow-agent-effort-e2e");
const root = await mkdtemp(join(tmpdir(), "openbot-workflow-effort-"));
const userData = join(root, "user-data");
const home = join(root, "home");
const fakeCodex = join(root, "codex");
const fakeTurns = join(root, "codex-turns.jsonl");

// Before the service modules load: the Codex process and the stores read the home folder.
process.env.HOME = home;
process.env.CODEX_HOME = join(home, ".codex");
process.env.OPENBOT_CODEX_PATH = fakeCodex;
mkdirSync(home, { recursive: true });

const { AgentService } = await import("../src/backend/agent-service");
const { AgentStore } = await import("../src/backend/agent-store");
const { runCauseEffect } = await import("../src/backend/effect-boundary");
const { MailboxStore } = await import("../src/backend/mailbox-store");
const { OpenBotDatabase } = await import("../src/backend/openbot-database");
const { WorkflowRunStore } = await import("../src/backend/workflows/workflow-run-store");
const { WorkflowStore } = await import("../src/backend/workflows/workflow-store");
const { workflowScheduleDueAt } = await import("../src/backend/workflows/workflow-triggers");
const { createWorkflows } = await import("../src/backend/workflows/workflows");

/**
 * The effort that a new agent holds, the default that the model reports (not the same, so a fallback
 * to the model's default would show), and the levels that the model offers. "xhigh" and "max" are not
 * among them.
 */
const OWN_EFFORT = "low";
const MODEL_DEFAULT = "medium";
const OFFERED = ["low", "medium", "high"];

/**
 * A Codex app-server with the methods that the service calls. It offers one model with `OFFERED`
 * levels, logs `{ turnId, effort, text }` for each `turn/start`, and answers "Done." after a moment.
 */
const FAKE_CODEX = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.160.1\\n");
  process.exit(0);
}
const TURNS = ${JSON.stringify(fakeTurns)};
const config = { config: { mcp_servers: {} }, layers: [{ name: { type: "user", file: "/fake/.codex/config.toml", profile: null }, version: "1", config: { mcp_servers: {} } }] };
const levels = ${JSON.stringify(OFFERED)}.map((reasoningEffort) => ({ reasoningEffort }));
let buffer = "";
let threads = 0;
let turns = 0;
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});
const write = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
const finish = (threadId, turnId) => {
  const item = { type: "agentMessage", id: "message-" + turnId, text: "Done.", phase: "final_answer" };
  write({ method: "item/completed", params: { threadId, turnId, item } });
  write({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
};
const answer = (message) => {
  const params = message.params || {};
  switch (message.method) {
    case "initialize": return write({ id: message.id, result: {} });
    case "account/read": return write({ id: message.id, result: { account: { type: "chatgpt", email: "codex@example.com" } } });
    case "account/rateLimits/read": return write({ id: message.id, result: { rateLimits: { limitId: "codex", primary: null, secondary: null }, rateLimitsByLimitId: null } });
    case "model/list": return write({ id: message.id, result: { data: [{ model: "gpt-6-luna", displayName: "GPT-6 Luna", defaultReasoningEffort: ${JSON.stringify(MODEL_DEFAULT)}, supportedReasoningEfforts: levels }] } });
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
      appendFileSync(TURNS, JSON.stringify({ turnId, effort: params.effort ?? null, text }) + "\\n");
      write({ id: message.id, result: { turn: { id: turnId, status: "inProgress", items: [] } } });
      write({ method: "turn/started", params: { threadId: params.threadId, turn: { id: turnId } } });
      return setTimeout(() => finish(params.threadId, turnId), 20);
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
    }
    newline = buffer.indexOf("\\n");
  }
});
`;

interface TurnLog {
  turnId: string;
  effort: string | null;
  text: string;
}

const report: {
  turns: { name: string; effort: string | null }[];
  warnings: string[];
  checks: { name: string; passed: boolean }[];
  notCovered: string[];
  passed: boolean;
  error?: string;
} = {
  turns: [],
  warnings: [],
  checks: [],
  notCovered: [
    "A step that a restart sends again: the check starts every run once and never restarts the process.",
    "A step whose agent changes model while the delivery waits: the check changes no model.",
    "Claude, Pi and the other providers: the fake is a Codex app-server, so only the value that reaches `turn/start` is read.",
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

async function waitFor<T>(label: string, read: () => T | null | undefined | false, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((done) => setTimeout(done, 25));
  }
}

/** The same for a state that only an async read answers. */
async function waitForAsync<T>(label: string, read: () => Promise<T | null>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise((done) => setTimeout(done, 25));
  }
}

function turnLogs(): TurnLog[] {
  let text = "";
  try {
    text = readFileSync(fakeTurns, "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function pass(name: string, condition: boolean, detail?: unknown) {
  report.checks.push({ name, passed: condition });
  assert.ok(condition, detail === undefined ? name : `${name}: ${JSON.stringify(detail)}`);
}

const ended = (status: string | undefined) =>
  status === "completed" || status === "failed" || status === "interrupted" || status === "cancelled";

await writeFile(fakeCodex, FAKE_CODEX, { mode: 0o755 });
const stopWarnings = teeLogLines(["drain-scheduler"], (line) => {
  if (line.includes("asked for an effort")) report.warnings.push(line);
});
const database = new OpenBotDatabase(userData);
const store = new AgentStore(userData, home, database);
const mailbox = new MailboxStore(userData, store.sharedRoot, store.database);
const agents = new AgentService({
  store,
  mailbox,
  browser,
  preferredProvider: "codex",
  offProviders: AGENT_PROVIDERS.filter((provider) => provider !== "codex"),
});
// As the app does: the same mailbox, the same handoff, and the agent events that settle a step.
const runStore = new WorkflowRunStore({ database });
const workflows = await Effect.runPromise(
  createWorkflows({
    store: new WorkflowStore({ database, nextDueAt: workflowScheduleDueAt(() => "UTC") }),
    runs: runStore,
    delivery: (deliveryId) => {
      const found = mailbox.getDelivery(deliveryId)?.delivery;
      return found ? { status: found.status, turnId: found.turnId, error: found.error } : null;
    },
    turnAnswer: () => null,
    sendHandoff: (input) => agents.enqueueRoutineHandoff(input),
    stopDelivery: () => Effect.void,
    generateText: () => Effect.fail({ message: "No model step runs in this check." }),
    notify: () => {},
    connectionOn: () => false,
    post: () => Effect.succeed({ posted: true as const }),
    changed: () => {},
    rearm: () => {},
    timezone: () => "UTC",
  }),
);
agents.on("event", (event: AgentEvent) => {
  Effect.runFork(workflows.notice(event));
});

try {
  await runCauseEffect(agents.initialize());
  const worker = await runCauseEffect(
    agents.createAgent({
      name: "Worker",
      description: "Runs the steps of the check.",
      avatarSeed: "worker",
      avatarHue: null,
      initialMessage: "FIRST-CHAT",
    }),
  );
  const turnOf = (marker: string) =>
    waitFor(`the turn of ${marker}`, () => turnLogs().find((t) => t.text.includes(marker)));
  const first = await turnOf("FIRST-CHAT");
  await waitFor("the first chat turn to end", () =>
    agents.listQueue(worker.id).deliveries.every((delivery) => ended(delivery.status)),
  );
  report.turns.push({ name: "the first chat message", effort: first.effort });
  pass("a new agent holds its own effort, not the default the model reports", first.effort === OWN_EFFORT, first);

  /** Runs a workflow with one agent step that asks for `effort` (absent: none) and answers its turn. */
  async function runStep(marker: string, effort?: string) {
    const created = await runCauseEffect(
      workflows.create({
        title: marker,
        graph: {
          nodes: [
            { id: "trigger", kind: "trigger", at: { x: 0, y: 0 }, fields: { trigger: "manual" } },
            {
              id: "agent",
              kind: "agent",
              at: { x: 360, y: 0 },
              fields: { agentId: worker.id, task: marker, ...(effort === undefined ? {} : { effort }) },
            },
          ],
          edges: [{ id: "edge", from: "trigger", to: "agent", type: "text" }],
          strokes: [],
        },
      }),
    );
    const started = await runCauseEffect(
      workflows.startRun({ workflowId: created.summary.id, requestId: crypto.randomUUID() }),
    );
    const turn = await turnOf(marker);
    const detail = await waitForAsync(`the run of ${marker} to end`, async () => {
      const current = await runCauseEffect(workflows.run(started.run.id));
      return current.run.status === "running" ? null : current;
    });
    report.turns.push({ name: `step ${marker}`, effort: turn.effort });
    // The delivery is the store's: the run detail that a client reads does not carry it.
    const step = runStore.steps(started.run.id).find((candidate) => candidate.nodeId === "agent");
    return { turn, run: detail.run, deliveryId: step?.deliveryId ?? null };
  }

  // 1. A step that asks for high starts its turn with high, and the run still ends done.
  const high = await runStep("STEP-HIGH", "high");
  pass("a step with effort high starts its turn with high", high.turn.effort === "high", high.turn);
  pass("the run of that step ends done", high.run.status === "done", high.run);

  // 2. The next ordinary turn of the same agent is back to its own effort.
  const receipt = await runCauseEffect(agents.sendMessage({ agentId: worker.id, text: "CHAT-AFTER-HIGH" }));
  const after = await turnOf("CHAT-AFTER-HIGH");
  await waitFor("the chat turn to end", () =>
    ended(mailbox.getDelivery(receipt.deliveries[0]?.id ?? "")?.delivery.status),
  );
  report.turns.push({ name: "the chat message after the high step", effort: after.effort });
  pass("the next chat turn goes back to the agent's own effort", after.effort === OWN_EFFORT, after);

  // 3. The effort is kept beside the message, survives a reload, and no client reads it.
  const highDelivery = high.deliveryId ? mailbox.getDelivery(high.deliveryId)?.delivery : undefined;
  pass("the step's delivery exists", highDelivery !== undefined, high.deliveryId);
  const highMessageId = highDelivery?.messageId ?? "";
  pass("the mailbox keeps the asked effort for the message", mailbox.reasoningEffortOf(highMessageId) === "high");
  const reloaded = new MailboxStore(userData, store.sharedRoot, store.database);
  await runCauseEffect(reloaded.initialize());
  pass(
    "a reloaded mailbox reads the same effort",
    reloaded.reasoningEffortOf(highMessageId) === "high",
    reloaded.reasoningEffortOf(highMessageId),
  );
  const visible = JSON.stringify({ delivery: highDelivery, queue: agents.listQueue(worker.id) });
  pass(
    "neither the delivery nor the queue shows the effort",
    !visible.includes("reasoningEffort") && !visible.includes('"effort"'),
  );

  // 4. A step with no effort keeps the agent's own.
  const none = await runStep("STEP-NONE");
  pass("a step without an effort starts its turn with the agent's own", none.turn.effort === OWN_EFFORT, none.turn);
  const noneMessageId = none.deliveryId ? (mailbox.getDelivery(none.deliveryId)?.delivery.messageId ?? "") : "";
  pass("no effort is stored for it", noneMessageId !== "" && mailbox.reasoningEffortOf(noneMessageId) === undefined);

  // 5. An effort that the agent's model does not offer is ignored for the step, with one warning.
  const warningsBefore = report.warnings.length;
  const max = await runStep("STEP-MAX", "max");
  pass(
    "an effort that the model does not offer falls back to the agent's own",
    max.turn.effort === OWN_EFFORT,
    max.turn,
  );
  pass("that run still ends done", max.run.status === "done", max.run);
  const maxWarnings = report.warnings.slice(warningsBefore);
  pass(
    "one warning names the agent, the model and the effort",
    maxWarnings.length === 1 &&
      maxWarnings[0]?.includes(worker.id) === true &&
      maxWarnings[0].includes("gpt-6-luna") &&
      maxWarnings[0].includes("max"),
    maxWarnings,
  );

  // 6. A value that is no level at all never leaves the runner: the agent's own effort, no warning.
  const warningsBeforeBogus = report.warnings.length;
  const bogus = await runStep("STEP-BOGUS", "turbo");
  pass("a value that is no level falls back to the agent's own", bogus.turn.effort === OWN_EFFORT, bogus.turn);
  const bogusMessageId = bogus.deliveryId ? (mailbox.getDelivery(bogus.deliveryId)?.delivery.messageId ?? "") : "";
  pass(
    "the runner stores nothing and warns of nothing for it",
    bogusMessageId !== "" &&
      mailbox.reasoningEffortOf(bogusMessageId) === undefined &&
      report.warnings.length === warningsBeforeBogus,
    report.warnings,
  );
  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.exitCode = 1;
} finally {
  stopWarnings();
  await runCauseEffect(agents.stop()).catch(() => {});
  await Effect.runPromise(workflows.close()).catch(() => {});
  database.close();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
  process.stdout.write(`${report.passed ? "PASS" : "FAIL"} ${join(OUT, "report.json")}\n`);
  if (report.error) process.stdout.write(`${report.error}\n`);
}
