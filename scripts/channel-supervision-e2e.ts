// End-to-end check of the channel lead's supervision. It drives the real ChannelService, database and
// mailbox in a temporary folder, and replaces only the lead's model: no provider turn runs, so this
// needs no dev app and no subscription. The report goes to `.openownbot-build/channel-supervision-e2e/`.
//
// Usage: bun scripts/channel-supervision-e2e.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AgentSummary, ChannelMessage, ChannelTask } from "@robot/contracts/ipc";
import { Effect } from "effect";
import { type ChannelHooks, ChannelService } from "../src/backend/channel-service";
import { SUPERVISION_MAX_ROUNDS } from "../src/backend/channel-supervision";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenOwnBotDatabase } from "../src/backend/openownbot-database";

const WAIT_MS = 10_000;
/** A check that something did not happen has no event to wait for, so it waits this long. */
const SETTLE_MS = 400;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function waitFor<T>(label: string, read: () => T, ready: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const value = read();
    if (ready(value)) return value;
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}. Last value: ${JSON.stringify(value)}`);
    await sleep(25);
  }
}

function agent(id: string, name: string, workspacePath: string): AgentSummary {
  return {
    id,
    name,
    title: `${name} title`,
    description: `${name} does work`,
    notifications: false,
    provider: "claude",
    model: "claude-haiku-5-5",
    reasoningEffort: "max",
    threadId: null,
    workspacePath,
    preview: "",
    updatedAt: null,
    avatarSeed: id,
    avatarHue: null,
    avatarUrl: null,
  };
}

function task(channelId: string, id: string, ownerAgentId: string, state: ChannelTask["state"]): ChannelTask {
  return {
    id,
    channelId,
    parentTaskId: null,
    rootTaskId: id,
    ownerAgentId,
    requestMessageId: `request-${id}`,
    instruction: "Write the report.",
    attachmentDraftIds: [],
    expectedResult: "Done.",
    sourceMessageIds: [`request-${id}`],
    dependencies: [],
    resources: [],
    state,
    revision: 0,
    assignmentCount: 1,
    error: null,
  };
}

function agentMessage(channelId: string, taskId: string, agentId: string, name: string, text: string): ChannelMessage {
  const id = randomUUID();
  return {
    id,
    channelId,
    taskId,
    author: { kind: "agent", id: agentId, name },
    sequence: 0,
    superseded: false,
    message: { id, text, author: "assistant", createdAt: new Date().toISOString(), status: "completed" },
  };
}

type Response = string;
interface Scenario {
  name: string;
  passed: boolean;
  evidence: unknown;
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "channel-supervision-e2e-"));
  const database = new OpenOwnBotDatabase(root);
  await runCauseEffect(database.initialize());
  const mailbox = new MailboxStore(root, join(root, "shared"), database);
  const lead = agent("agent-lead", "Lead", root);
  const writer = agent("agent-writer", "Writer", root);
  const prompts: string[] = [];
  let respond: () => Response = () => JSON.stringify({ done: true });
  const hooks: ChannelHooks = {
    agents: () => [lead, writer],
    generate: (_lead, prompt) => {
      prompts.push(prompt);
      return Effect.succeed(respond());
    },
    schedule: () => {},
    interrupt: () => Effect.void,
    // Both agents stay busy, so a nudged task waits queued and no provider work starts.
    busy: () => true,
    changed: () => {},
    error: (error) => {
      throw error;
    },
  };
  const service = new ChannelService(database, mailbox, hooks);
  const scenarios: Scenario[] = [];

  /** A channel whose writer ran one task, with the turn still open. */
  const open = (name: string) => {
    const channelId = randomUUID();
    const channel = service.store.create(channelId, {
      name,
      title: name,
      instructions: "",
      members: [{ agentId: lead.id }, { agentId: writer.id }],
      leadAgentId: lead.id,
    });
    service.store.update(channel, {
      messages: [agentMessage(channelId, "t0", writer.id, writer.name, "Started the report.")],
    });
    return channelId;
  };

  /** Adds a running task of the writer, then ends its turn as the provider does. */
  const finishTurn = async (channelId: string, label: string) => {
    // Ids are global in the store, so each channel gets its own.
    const taskId = `${label}-${channelId.slice(0, 8)}`;
    const turnId = `turn-${taskId}`;
    service.store.update(service.store.get(channelId), {
      tasks: [task(channelId, taskId, writer.id, "running")],
      assignments: [
        {
          id: `assignment-${taskId}`,
          channelId,
          taskId,
          agentId: writer.id,
          taskRevision: 0,
          requestMessageId: `request-${taskId}`,
          resources: [],
          deliveryId: randomUUID(),
          turnId,
          state: "running",
          throughSequence: 0,
          summaryVersion: 0,
          awaitedTaskIds: [],
          pendingRevision: null,
          pendingOutcome: null,
        },
      ],
    });
    assert.equal(
      service.event({ type: "turn-completed", agentId: writer.id, threadId: "unmapped", turnId, status: "completed" }),
      true,
    );
    await waitFor(
      `assignment of ${taskId} ends`,
      () => service.store.assignments(channelId).find((item) => item.id === `assignment-${taskId}`)?.state,
      (state) => state === "completed",
    );
    return taskId;
  };

  const texts = (channelId: string) => service.store.messages(channelId).map((item) => item.message.text);

  try {
    // 1. A channel that nobody worked in since the app started is not examined.
    {
      const channelId = open("untouched");
      service.store.update(service.store.get(channelId), { tasks: [task(channelId, "old", writer.id, "completed")] });
      const before = prompts.length;
      await Effect.runPromise(service.wake());
      await sleep(SETTLE_MS);
      scenarios.push({
        name: "no look at a channel where no turn ended",
        passed: prompts.length === before,
        evidence: { modelCalls: prompts.length - before },
      });
    }

    // 2. The lead nudges the writer. The nudge is a new task of the writer, asked in the lead's name.
    {
      const channelId = open("nudge");
      respond = () => JSON.stringify({ nudge: { agentId: writer.id, instruction: "Finish section 2 of the report." } });
      const first = await finishTurn(channelId, "first");
      const created = await waitFor(
        "nudge task",
        () => service.store.tasks(channelId).find((item) => item.id !== first),
        (value) => value !== undefined,
      );
      const messages = service.store.messages(channelId);
      const request = messages.find((item) => item.message.id === created?.requestMessageId);
      const prompt = prompts.at(-1) ?? "";
      scenarios.push({
        name: "lead nudges an agent that stopped early",
        passed:
          created?.ownerAgentId === writer.id &&
          created.instruction === "Finish section 2 of the report." &&
          created.state === "queued" &&
          request?.author.kind === "agent" &&
          request.author.id === lead.id &&
          prompt.includes("Every agent is idle now") &&
          prompt.includes("Started the report."),
        evidence: {
          task: created && { owner: created.ownerAgentId, state: created.state, instruction: created.instruction },
          requestAuthor: request?.author,
          messageCount: messages.length,
          promptIncludesRecentMessage: prompt.includes("Started the report."),
        },
      });
    }

    // 3. The lead asks the person once, and does not ask again while nothing new is said.
    {
      const channelId = open("question");
      respond = () => JSON.stringify({ question: "Which format does the report need: PDF or Markdown?" });
      const before = prompts.length;
      const first = await finishTurn(channelId, "first");
      await waitFor(
        "question message",
        () => texts(channelId),
        (value) => value.includes("Which format does the report need: PDF or Markdown?"),
      );
      const asked = service.store.messages(channelId).find((item) => item.message.text.startsWith("Which format"));
      const second = await finishTurn(channelId, "second");
      await sleep(SETTLE_MS);
      const tasksAfter = service.store.tasks(channelId).map((item) => item.id);
      scenarios.push({
        name: "lead asks the person, then waits",
        passed:
          asked?.author.kind === "agent" &&
          asked.author.id === lead.id &&
          prompts.length - before === 1 &&
          !tasksAfter.some((id) => id !== first && id !== second),
        evidence: { author: asked?.author, modelCalls: prompts.length - before, tasks: tasksAfter },
      });
    }

    // 4. The lead judges the work complete, and adds nothing.
    {
      const channelId = open("done");
      respond = () => JSON.stringify({ done: true });
      const before = prompts.length;
      const messagesBefore = service.store.messages(channelId).length;
      await finishTurn(channelId, "first");
      await waitFor(
        "model call",
        () => prompts.length,
        (value) => value > before,
      );
      await sleep(SETTLE_MS);
      scenarios.push({
        name: "lead stays silent when the work is done",
        passed:
          service.store.tasks(channelId).length === 1 && service.store.messages(channelId).length === messagesBefore,
        evidence: {
          tasks: service.store.tasks(channelId).length,
          newMessages: service.store.messages(channelId).length - messagesBefore,
        },
      });
    }

    // 5. A bad answer changes nothing.
    {
      const channelId = open("garbage");
      respond = () => "I think it is fine.";
      const before = prompts.length;
      const messagesBefore = service.store.messages(channelId).length;
      await finishTurn(channelId, "first");
      await waitFor(
        "model call",
        () => prompts.length,
        (value) => value > before,
      );
      await sleep(SETTLE_MS);
      scenarios.push({
        name: "an answer in the wrong shape changes nothing",
        passed:
          service.store.tasks(channelId).length === 1 && service.store.messages(channelId).length === messagesBefore,
        evidence: { tasks: service.store.tasks(channelId).length },
      });
    }

    // 6. One person message allows at most SUPERVISION_MAX_ROUNDS looks, however often the agents stop.
    {
      const channelId = open("cap");
      respond = () => JSON.stringify({ done: true });
      const before = prompts.length;
      const rounds = SUPERVISION_MAX_ROUNDS + 2;
      for (let round = 0; round < rounds; round++) {
        // New activity each round, or the same-last-message gate would stop the look first.
        service.store.update(service.store.get(channelId), {
          messages: [agentMessage(channelId, "t0", writer.id, writer.name, `Progress ${round}.`)],
        });
        const calls = prompts.length;
        await finishTurn(channelId, `round-${round}`);
        if (round < SUPERVISION_MAX_ROUNDS)
          await waitFor(
            `look ${round}`,
            () => prompts.length,
            (value) => value > calls,
          );
        else await sleep(SETTLE_MS);
      }
      scenarios.push({
        name: `at most ${SUPERVISION_MAX_ROUNDS} looks per person message`,
        passed: prompts.length - before === SUPERVISION_MAX_ROUNDS,
        evidence: { stops: rounds, modelCalls: prompts.length - before },
      });
    }
  } finally {
    await Effect.runPromise(service.stop());
    database.close();
    await rm(root, { recursive: true, force: true });
  }

  const out = resolve(import.meta.dirname, "../.openownbot-build/channel-supervision-e2e");
  mkdirSync(out, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), passed: scenarios.every((item) => item.passed), scenarios };
  writeFileSync(resolve(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${scenarios.map((item) => `${item.passed ? "PASS" : "FAIL"}  ${item.name}`).join("\n")}\n`);
  if (!report.passed) process.exitCode = 1;
}

await main();
