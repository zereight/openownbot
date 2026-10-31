// @vitest-environment node

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSummary, ChannelTask } from "@robot/contracts/ipc";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { type ChannelHooks, ChannelService } from "./channel-service";
import { runCauseEffect } from "./effect-boundary";
import { MailboxStore } from "./mailbox-store";
import { OpenOwnBotDatabase } from "./openownbot-database";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setupService(overrides: Partial<ChannelHooks> = {}) {
  const root = await mkdtemp(join(tmpdir(), "channel-service-test-"));
  roots.push(root);
  const database = new OpenOwnBotDatabase(root);
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
    ...overrides,
  };
  const service = new ChannelService(database, mailbox, hooks);
  return { database, service };
}

async function stopService(database: OpenOwnBotDatabase, service: ChannelService) {
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
        threadId: "thread-unmapped",
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
        threadId: "thread-unmapped",
        turnId: `01a17935-${randomUUID().slice(9)}`,
        status: "failed",
      });
      expect(handled).toBe(false);
    } finally {
      await stopService(database, service);
    }
  });
});

function task(id: string, parentTaskId: string | null, ownerAgentId: string, state: ChannelTask["state"]): ChannelTask {
  return {
    id,
    channelId: "",
    parentTaskId,
    rootTaskId: "",
    ownerAgentId,
    requestMessageId: "request",
    instruction: "Do the work.",
    attachmentDraftIds: [],
    expectedResult: "Done.",
    sourceMessageIds: ["request"],
    dependencies: [],
    resources: [],
    state,
    revision: 3,
    assignmentCount: 2,
    error: state === "failed" ? "The turn failed." : null,
  };
}

describe("ChannelService cancel", () => {
  const owner = { id: "owner", name: "Owner" };

  async function setupStoppedRuns(interrupted: string[]) {
    const { database, service } = await setupService({
      interrupt: (_agentId, turnId) => Effect.sync(() => void interrupted.push(turnId)),
    });
    const channelId = randomUUID();
    const members = ["lead", "reviewer", "writer", "other"];
    const channel = service.store.create(channelId, {
      name: "stopped-runs",
      title: "",
      instructions: "",
      members: members.map((agentId) => ({ agentId })),
      leadAgentId: "lead",
    });
    const tasks = [
      task("root", null, "lead", "paused"),
      task("failed-child", "root", "reviewer", "failed"),
      task("running-child", "root", "writer", "running"),
      task("completed-child", "root", "reviewer", "completed"),
      task("other-root", null, "other", "failed"),
    ].map((item) => ({
      ...item,
      channelId,
      rootTaskId: item.parentTaskId ?? item.id,
    }));
    service.store.update(channel, {
      tasks,
      assignments: [
        {
          id: "running-assignment",
          channelId,
          taskId: "running-child",
          agentId: "writer",
          taskRevision: 3,
          requestMessageId: "request",
          resources: [],
          deliveryId: randomUUID(),
          turnId: "writer-turn",
          state: "running",
          throughSequence: 0,
          summaryVersion: 0,
          awaitedTaskIds: [],
          pendingRevision: null,
          pendingOutcome: null,
        },
      ],
    });
    const cancel = (taskId: string) =>
      runCauseEffect(
        service.command(
          { type: "cancel", operationId: randomUUID(), channelId, taskId, recipientAgentId: null },
          owner,
        ),
      );
    const states = () => Object.fromEntries(service.store.tasks(channelId).map((item) => [item.id, item.state]));
    return { database, service, channelId, cancel, states };
  }

  it("ends every open task of the request when the owner cancels one child, and stops the running turn", async () => {
    const interrupted: string[] = [];
    const { database, service, channelId, cancel, states } = await setupStoppedRuns(interrupted);
    try {
      await cancel("failed-child");

      expect(states()).toEqual({
        root: "cancelled",
        "failed-child": "cancelled",
        "running-child": "cancelled",
        "completed-child": "completed",
        "other-root": "failed",
      });
      expect(interrupted).toEqual(["writer-turn"]);
      const stored = service.store.tasks(channelId);
      const root = stored.find((item) => item.id === "root");
      expect(root).toMatchObject({ error: null, revision: 4, assignmentCount: 2 });
      const failedChild = stored.find((item) => item.id === "failed-child");
      expect(failedChild).toMatchObject({ error: null, revision: 4 });
      expect(stored.find((item) => item.id === "other-root")).toMatchObject({
        error: "The turn failed.",
        revision: 3,
      });
    } finally {
      await stopService(database, service);
    }
  });

  it("refuses to cancel a task that is already complete", async () => {
    const { database, service, cancel, states } = await setupStoppedRuns([]);
    try {
      await expect(cancel("completed-child")).rejects.toThrow("This task is already complete.");
      expect(states()["root"]).toBe("paused");
    } finally {
      await stopService(database, service);
    }
  });

  it("refuses to resume a request that the owner cancelled", async () => {
    const { database, service, channelId, cancel, states } = await setupStoppedRuns([]);
    try {
      await cancel("root");
      await expect(
        runCauseEffect(
          service.command(
            { type: "resume", operationId: randomUUID(), channelId, taskId: "root", recipientAgentId: null },
            owner,
          ),
        ),
      ).rejects.toThrow("This task is already complete.");
      expect(states()["root"]).toBe("cancelled");
    } finally {
      await stopService(database, service);
    }
  });
});

describe("ChannelService summary of stopped work", () => {
  it("counts the paused tasks that wait for the user, apart from the running ones", async () => {
    const { database, service } = await setupService();
    try {
      const channelId = randomUUID();
      const channel = service.store.create(channelId, {
        name: "paused-work",
        title: "",
        instructions: "",
        members: [{ agentId: "lead" }],
        leadAgentId: "lead",
      });
      service.store.update(channel, {
        tasks: (["paused", "paused", "running", "completed"] as const).map((state, index) => ({
          ...task(`task-${index}`, null, "lead", state),
          channelId,
          rootTaskId: `task-${index}`,
        })),
      });
      const summary = service.store.list("owner").find((item) => item.id === channelId);
      expect(summary?.pausedTasks).toBe(2);
      expect(summary?.activeTasks).toBe(1);
    } finally {
      await stopService(database, service);
    }
  });
});
