// @vitest-environment node

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSummary, ChannelMessage, ChannelTask } from "@robot/contracts/ipc";
import { sourceText } from "@robot/i18n/source";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { channelFailure } from "./channel-effects";
import { ChannelHistory, type ChannelTextModel } from "./channel-history";
import { ChannelMemoryStore } from "./channel-memory-store";
import { ChannelStore } from "./channel-store";
import { runCauseEffect } from "./effect-boundary";
import { OpenOwnBotDatabase } from "./openownbot-database";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const MESSAGE_CHARACTERS = 5_000;
// Rendered, these fourteen messages come to about 70,000 characters: past the 60,000 that make a
// packet ask for a summary, and well inside the 120,000 that a packet may hold.
const MESSAGE_COUNT = 14;

async function setup(generate: ChannelTextModel) {
  const root = await mkdtemp(join(tmpdir(), "channel-history-test-"));
  roots.push(root);
  const database = new OpenOwnBotDatabase(root);
  await runCauseEffect(database.initialize());
  const store = new ChannelStore(database);
  const history = new ChannelHistory(store, generate, new ChannelMemoryStore(database));
  const agentId = `agent-${randomUUID()}`;
  const channelId = randomUUID();
  const taskId = randomUUID();
  const author: ChannelMessage["author"] = { kind: "member", id: "member", name: "You" };
  const messages: ChannelMessage[] = Array.from({ length: MESSAGE_COUNT }, (_, index) => ({
    id: `message-${index}`,
    channelId,
    sequence: 0,
    author,
    taskId: null,
    superseded: false,
    message: {
      id: `message-${index}`,
      author: "user",
      text: `message-${index} ${"x".repeat(MESSAGE_CHARACTERS)}`,
      createdAt: "2026-10-27T00:00:00.000Z",
      status: "completed",
    },
  }));
  const task: ChannelTask = {
    id: taskId,
    channelId,
    parentTaskId: null,
    rootTaskId: taskId,
    ownerAgentId: agentId,
    requestMessageId: `message-${MESSAGE_COUNT - 1}`,
    instruction: "Answer the greeting.",
    attachmentDraftIds: [],
    expectedResult: "A reply.",
    sourceMessageIds: [`message-${MESSAGE_COUNT - 1}`],
    dependencies: [],
    resources: [],
    state: "queued",
    revision: 0,
    assignmentCount: 0,
    error: null,
  };
  const channel = store.create(channelId, {
    name: "busy-channel",
    title: "",
    instructions: "",
    members: [{ agentId }],
    leadAgentId: agentId,
  });
  store.update(channel, { messages, tasks: [task] });
  const agent: AgentSummary = {
    id: agentId,
    name: "Engineering Lead",
    title: "",
    description: "",
    notifications: false,
    provider: "claude",
    model: "claude-haiku-5-5",
    reasoningEffort: "max",
    threadId: null,
    workspacePath: root,
    preview: "",
    updatedAt: null,
    avatarSeed: agentId,
    avatarHue: null,
    avatarUrl: null,
  };
  return { database, store, history, task, agent, channelId };
}

const timedOut: ChannelTextModel = () => Effect.fail(channelFailure(new Error("Profile generation timed out.")));

describe("ChannelHistory.prepare", () => {
  it("builds the packet from the recent messages when the summary cannot be written", async () => {
    const { database, store, history, task, agent, channelId } = await setup(timedOut);
    try {
      const packet = await Effect.runPromise(history.prepare(task, agent, agent, null));
      expect(packet.text).toContain(`message-${MESSAGE_COUNT - 1} `);
      expect(packet.text).toContain("message-0 ");
      expect(packet.summaryVersion).toBe(0);
      expect(store.summary(channelId).text).toBe("");
    } finally {
      database.close();
    }
  });

  it("still refuses a packet that is too long once the summary cannot shorten it", async () => {
    const { database, history, task, agent } = await setup(timedOut);
    try {
      const failure = await Effect.runPromise(Effect.flip(history.prepare(task, agent, agent, null, 40_000)));
      expect(String(failure.cause)).toContain(sourceText("error.backend.channelContextTooLong"));
    } finally {
      database.close();
    }
  });

  it("saves the summary and leaves out the messages it covers when the model answers", async () => {
    const { database, store, history, task, agent, channelId } = await setup(() => Effect.succeed("SUMMARY-TEXT"));
    try {
      const packet = await Effect.runPromise(history.prepare(task, agent, agent, null));
      expect(store.summary(channelId).text).toBe("SUMMARY-TEXT");
      expect(packet.text).toContain("Shared history summary");
      expect(packet.text).not.toContain("message-0 ");
      expect(packet.text).toContain(`message-${MESSAGE_COUNT - 1} `);
    } finally {
      database.close();
    }
  });
});
