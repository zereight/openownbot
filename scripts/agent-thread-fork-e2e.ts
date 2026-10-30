// Checks that a fork copies the history of a conversation up to one message into a new side thread of the
// same agent: the copy survives a replay and a restart, the source does not change, a fork of a fork keeps
// its own copy after the first fork is deleted, and a missing message and a running turn are refused.
// Boots the real agent store and database on a temporary profile. No app, provider or network is started.
//
// Run: bun scripts/agent-thread-fork-e2e.ts
// Writes .openownbot-build/agent-thread-fork-e2e/report.json and exits non-zero on a failure.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ConversationMessage } from "@robot/contracts/ipc";
import { readHandoffHistory } from "../src/backend/agent/handoff-history";
import { AgentStore } from "../src/backend/agent-store";
import { forkAgentThread } from "../src/backend/agent-threads/agent-thread-fork";
import { AgentThreadStore } from "../src/backend/agent-threads/agent-thread-store";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { OpenOwnBotDatabase } from "../src/backend/openownbot-database";

const OUT = resolve(import.meta.dirname, "../.openownbot-build/agent-thread-fork-e2e");
const root = await mkdtemp(join(tmpdir(), "openownbot-thread-fork-"));
const userData = join(root, "user-data");
const home = join(root, "home");

interface Report {
  copied?: { messageIds: string[]; turnIds: Array<string | null>; forkedFrom: unknown };
  sourceMessageCount?: number;
  handoffHasCopy?: boolean;
  replayMessageIds?: string[];
  afterRestart?: { forkedFrom: unknown; messageIds: string[] };
  forkOfFork?: { messageIds: string[]; afterFirstDeleted: string[] };
  refused?: { missingMessage: string; runningTurn: string };
  passed: boolean;
}

const report: Report = { passed: false };

function message(id: string, author: "user" | "assistant", turnId: string, minute: number): ConversationMessage {
  return {
    id,
    turnId,
    author,
    text: `${author} ${id}`,
    createdAt: `2026-10-01T10:0${minute}:00.000Z`,
    status: "completed",
  };
}

const HISTORY = [
  message("m1", "user", "turn-1", 1),
  message("m2", "assistant", "turn-1", 2),
  message("m3", "user", "turn-2", 3),
  message("m4", "assistant", "turn-2", 4),
];

const ids = (messages: readonly ConversationMessage[]) => messages.map((entry) => entry.id);

try {
  const { agentId, ownThreadId, forkThreadId } = await boot(async (store, database, threads) => {
    const agent = await runCauseEffect(
      store.createAgent({ name: "Forker", description: "", avatarSeed: "seed", avatarHue: null }),
    );
    // The source is a side thread that already holds the history.
    const ownThreadId = threads.create({
      agentId: agent.id,
      origin: "user",
      title: "Source",
      titleSource: "auto",
    }).threadId;
    database.persistConversation(
      { agentId: agent.id, threadId: ownThreadId, activeTurnId: null, revision: 0, messages: HISTORY },
      "conversation.test-seed",
    );

    const fork = forkAgentThread(database, threads, {
      agentId: agent.id,
      sourceThreadId: ownThreadId,
      throughMessageId: "m2",
      title: (last) => `Fork at ${last.id}`,
    });
    const copy = database.readConversation(agent.id, fork.threadId);
    report.copied = {
      messageIds: ids(copy.messages),
      turnIds: copy.messages.map((entry) => entry.turnId ?? null),
      forkedFrom: fork.forkedFrom,
    };
    assert.deepEqual(ids(copy.messages), ["m1", "m2"], "The fork did not stop at the chosen message.");
    assert.ok(
      copy.messages.every((entry) => entry.turnId === `${fork.threadId}:turn-1`),
      "The copy kept a turn id of the source.",
    );
    assert.deepEqual(fork.forkedFrom, { threadId: ownThreadId, messageId: "m2" });
    assert.equal(threads.taskForThread(fork.threadId)?.agentId, agent.id, "The fork is not a thread of the agent.");

    assert.ok(database.isForkedThread(fork.threadId), "The fork is not marked as a fork.");
    assert.ok(!database.isForkedThread(ownThreadId), "The source is marked as a fork.");
    const handoff = readHandoffHistory(database, agent.id, fork.threadId, new Map());
    const handoffText = JSON.stringify(handoff);
    report.handoffHasCopy = handoffText.includes("user m1") && handoffText.includes("assistant m2");
    assert.ok(report.handoffHasCopy, "The handoff of the fork does not hold the copied history.");
    assert.ok(!handoffText.includes("assistant m4"), "The handoff holds a message after the cut.");

    const source = database.readConversation(agent.id, ownThreadId);
    report.sourceMessageCount = source.messages.length;
    assert.deepEqual(ids(source.messages), ["m1", "m2", "m3", "m4"], "The source changed.");

    report.replayMessageIds = ids(database.rebuildThreadProjection(fork.threadId).messages);
    assert.deepEqual(report.replayMessageIds, ["m1", "m2"], "A replay lost the copy.");

    assert.throws(
      () =>
        forkAgentThread(database, threads, {
          agentId: agent.id,
          sourceThreadId: ownThreadId,
          throughMessageId: "missing",
          title: () => "x",
        }),
      /no message missing/,
    );
    database.persistConversation(
      { agentId: agent.id, threadId: ownThreadId, activeTurnId: "turn-2", revision: 0, messages: HISTORY },
      "conversation.test-seed",
    );
    assert.throws(
      () =>
        forkAgentThread(database, threads, {
          agentId: agent.id,
          sourceThreadId: ownThreadId,
          throughMessageId: "m4",
          title: () => "x",
        }),
      /still running/,
    );
    report.refused = { missingMessage: "no message missing", runningTurn: "still running" };
    assert.equal(threads.list(agent.id).length, 2, "A refused fork left a thread behind.");
    return { agentId: agent.id, ownThreadId, forkThreadId: fork.threadId };
  });

  await boot((_store, database, threads) => {
    const stored = threads.taskForThread(forkThreadId);
    report.afterRestart = {
      forkedFrom: stored?.forkedFrom,
      messageIds: ids(database.readConversation(agentId, forkThreadId).messages),
    };
    assert.deepEqual(stored?.forkedFrom, { threadId: ownThreadId, messageId: "m2" }, "The link did not survive.");
    assert.deepEqual(report.afterRestart.messageIds, ["m1", "m2"], "The copy did not survive a restart.");

    const second = forkAgentThread(database, threads, {
      agentId,
      sourceThreadId: forkThreadId,
      throughMessageId: "m1",
      title: () => "Fork of the fork",
    });
    const secondIds = ids(database.readConversation(agentId, second.threadId).messages);
    assert.deepEqual(secondIds, ["m1"]);
    threads.delete(forkThreadId);
    const afterDelete = ids(database.readConversation(agentId, second.threadId).messages);
    report.forkOfFork = { messageIds: secondIds, afterFirstDeleted: afterDelete };
    assert.deepEqual(afterDelete, ["m1"], "Deleting the first fork changed the second.");
    assert.deepEqual(threads.taskForThread(second.threadId)?.forkedFrom, { threadId: forkThreadId, messageId: "m1" });
  });

  report.passed = true;
} finally {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
}

async function boot<T>(
  use: (store: AgentStore, database: OpenOwnBotDatabase, threads: AgentThreadStore) => T | Promise<T>,
): Promise<T> {
  const database = new OpenOwnBotDatabase(userData);
  const store = new AgentStore(userData, home, database);
  await runCauseEffect(store.initialize());
  try {
    return await use(store, database, new AgentThreadStore(database));
  } finally {
    database.close();
  }
}
