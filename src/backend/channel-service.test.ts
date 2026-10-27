// @vitest-environment node

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSummary } from "@openbot/contracts/ipc";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { type ChannelHooks, ChannelService } from "./channel-service";
import { runCauseEffect } from "./effect-boundary";
import { MailboxStore } from "./mailbox-store";
import { OpenBotDatabase } from "./openbot-database";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setupService() {
  const root = await mkdtemp(join(tmpdir(), "channel-service-test-"));
  roots.push(root);
  const database = new OpenBotDatabase(root);
  await runCauseEffect(database.initialize());
  const mailbox = new MailboxStore(root, join(root, "shared"), database);
  const hooks: ChannelHooks = {
    agents: (): AgentSummary[] => [],
    generate: () => Effect.succeed(""),
    schedule: () => {},
    interrupt: () => Effect.void,
    busy: () => false,
    changed: () => {},
    error: () => {},
  };
  const service = new ChannelService(database, mailbox, hooks);
  return { database, service };
}

async function stopService(database: OpenBotDatabase, service: ChannelService) {
  await Effect.runPromise(service.stop());
  database.close();
}

async function waitForAssignment(service: ChannelService, channelId: string, assignmentId: string, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const assignment = service.store.assignments(channelId).find((item) => item.id === assignmentId);
    if (!assignment) throw new Error("Assignment is gone.");
    if (assignment.state !== "running") return assignment;
    if (Date.now() >= deadline) return assignment;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("ChannelService turn-completed", () => {
  it("settles a running assignment when the turn thread no longer maps to its channel", async () => {
    const { database, service } = await setupService();
    try {
      const agentId = `agent-${randomUUID()}`;
      const channelId = randomUUID();
      const taskId = randomUUID();
      const turnId = `01a17935-${randomUUID().slice(9)}`;
      let channel = service.store.create(channelId, {
        name: "stuck-channel",
        title: "",
        instructions: "",
        members: [{ agentId }],
        leadAgentId: agentId,
      });
      channel = service.store.update(channel, {
        tasks: [
          {
            id: taskId,
            channelId,
            parentTaskId: null,
            rootTaskId: taskId,
            ownerAgentId: agentId,
            requestMessageId: "request",
            instruction: "Do the work.",
            attachmentDraftIds: [],
            expectedResult: "Done.",
            sourceMessageIds: ["request"],
            dependencies: [],
            resources: [],
            state: "running",
            revision: 0,
            assignmentCount: 1,
            error: null,
          },
        ],
        assignments: [
          {
            id: randomUUID(),
            channelId,
            taskId,
            agentId,
            taskRevision: 0,
            requestMessageId: "request",
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
      const created = service.store.assignments(channelId)[0];
      if (!created) throw new Error("Assignment was not created.");
      const assignmentId = created.id;
      expect(service.queueHold(agentId)).not.toBeNull();

      const handled = service.event({
        type: "turn-completed",
        agentId,
        threadId: "openbot-thread-unmapped",
        turnId,
        status: "failed",
      });
      expect(handled).toBe(true);

      const settled = await waitForAssignment(service, channelId, assignmentId);
      expect(settled.state).toBe("failed");
      expect(service.queueHold(agentId)).toBeNull();
      expect(channel.id).toBe(channelId);
    } finally {
      await stopService(database, service);
    }
  });

  it("ignores a turn-completed event for an unknown turn on an unmapped thread", async () => {
    const { database, service } = await setupService();
    try {
      const agentId = `agent-${randomUUID()}`;
      const handled = service.event({
        type: "turn-completed",
        agentId,
        threadId: "openbot-thread-unmapped",
        turnId: `01a17935-${randomUUID().slice(9)}`,
        status: "failed",
      });
      expect(handled).toBe(false);
    } finally {
      await stopService(database, service);
    }
  });
});
