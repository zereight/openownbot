// @vitest-environment node

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSummary, ChannelTask } from "@robot/contracts/ipc";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import type { DecisionInput } from "./channel-decision";
import { type ChannelHooks, ChannelService } from "./channel-service";
import { runCauseEffect } from "./effect-boundary";
import { MailboxStore } from "./mailbox-store";
import { OpenOwnBotDatabase } from "./openownbot-database";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

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

async function setup(overrides: Partial<ChannelHooks>) {
  const root = await mkdtemp(join(tmpdir(), "channel-decision-test-"));
  roots.push(root);
  const database = new OpenOwnBotDatabase(root);
  await runCauseEffect(database.initialize());
  const mailbox = new MailboxStore(root, join(root, "shared"), database);
  const lead = agent("agent-lead", "Lead", root);
  const writer = agent("agent-writer", "Writer", root);
  const designer = agent("agent-designer", "Designer", root);
  const generated: string[] = [];
  const hooks: ChannelHooks = {
    agents: () => [lead, writer, designer],
    generate: (_lead, prompt) => {
      generated.push(prompt);
      return Effect.succeed(JSON.stringify({ agentId: designer.id }));
    },
    schedule: () => {},
    interrupt: () => Effect.void,
    busy: () => true,
    changed: () => {},
    error: () => {},
    ...overrides,
  };
  const service = new ChannelService(database, mailbox, hooks);
  const channelId = randomUUID();
  const channel = service.store.create(channelId, {
    name: "launch",
    title: "Launch",
    instructions: "Ship it",
    members: [{ agentId: lead.id }, { agentId: writer.id }, { agentId: designer.id }],
    leadAgentId: lead.id,
  });
  const taskId = randomUUID();
  const task: ChannelTask = {
    id: taskId,
    channelId,
    parentTaskId: null,
    rootTaskId: taskId,
    ownerAgentId: null,
    requestMessageId: "request",
    instruction: "Write the announcement",
    attachmentDraftIds: [],
    expectedResult: "Done.",
    sourceMessageIds: ["request"],
    dependencies: [],
    resources: [],
    state: "queued",
    revision: 0,
    assignmentCount: 0,
    error: null,
  };
  service.store.update(channel, { tasks: [task] });
  const owner = async () => {
    await Effect.runPromise(service.wake(channelId));
    const deadline = Date.now() + 3000;
    for (;;) {
      const owned = service.store.tasks(channelId).find((item) => item.id === taskId)?.ownerAgentId ?? null;
      if (owned !== null || Date.now() >= deadline) return owned;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  return { database, service, generated, owner };
}

async function stop(database: OpenOwnBotDatabase, service: ChannelService) {
  await Effect.runPromise(service.stop());
  database.close();
}

describe("channel routing with a fast decision model", () => {
  it("gives the request to the member that the model picks, and never asks the lead's model", async () => {
    const seen: DecisionInput[] = [];
    const { database, service, generated, owner } = await setup({
      decideMember: (input) => {
        seen.push(input);
        return Effect.succeed("agent-writer");
      },
    });
    try {
      expect(await owner()).toBe("agent-writer");
      expect(generated).toHaveLength(0);
      expect(seen[0]?.request).toBe("Write the announcement");
      expect(seen[0]?.members.map((member) => member.id).sort()).toEqual([
        "agent-designer",
        "agent-lead",
        "agent-writer",
      ]);
    } finally {
      await stop(database, service);
    }
  });

  it("asks the lead's model as before when the decision model has no answer", async () => {
    const { database, service, generated, owner } = await setup({ decideMember: () => Effect.succeed(null) });
    try {
      expect(await owner()).toBe("agent-designer");
      expect(generated).toHaveLength(1);
    } finally {
      await stop(database, service);
    }
  });

  it("asks the lead's model when the decision model names someone who is not a member", async () => {
    const { database, service, generated, owner } = await setup({
      decideMember: () => Effect.succeed("agent-stranger"),
    });
    try {
      await owner();
      expect(generated).toHaveLength(1);
    } finally {
      await stop(database, service);
    }
  });

  it("works as before when no decision model is set up", async () => {
    const { database, service, generated, owner } = await setup({});
    try {
      expect(await owner()).toBe("agent-designer");
      expect(generated).toHaveLength(1);
    } finally {
      await stop(database, service);
    }
  });
});
