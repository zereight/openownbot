// @vitest-environment node

import type { ChannelPage, ChannelTask } from "@robot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { stoppedChannelTasks } from "./channel-conversation-rows";

function task(id: string, overrides: Partial<ChannelTask> = {}): ChannelTask {
  return {
    id,
    channelId: "channel",
    parentTaskId: null,
    rootTaskId: id,
    ownerAgentId: "agent",
    requestMessageId: "message",
    instruction: "Do the work",
    attachmentDraftIds: [],
    expectedResult: "",
    sourceMessageIds: [],
    dependencies: [],
    resources: [],
    state: "paused",
    revision: 1,
    assignmentCount: 1,
    error: null,
    ...overrides,
  };
}

function page(tasks: ChannelTask[], archived = false): ChannelPage {
  return {
    channel: {
      id: "channel",
      name: "General",
      title: "",
      instructions: "",
      members: [{ agentId: "agent" }],
      leadAgentId: "agent",
      archived,
      revision: 1,
      createdAt: "2026-10-27T00:00:00.000Z",
    },
    messages: [],
    tasks,
    olderCursor: null,
    throughSequence: 0,
  };
}

const ids = (tasks: ChannelTask[]) => tasks.map((item) => item.id);

describe("stoppedChannelTasks", () => {
  it("lists a task that the reader stopped, which carries no reason", () => {
    expect(ids(stoppedChannelTasks(page([task("stopped-by-reader")])))).toEqual(["stopped-by-reader"]);
  });

  it("lists a task that the service stopped with its reason", () => {
    const stopped = task("stopped-by-service", { error: "The automatic assignment limit was reached." });
    expect(ids(stoppedChannelTasks(page([stopped])))).toEqual(["stopped-by-service"]);
  });

  it("lists a failed task", () => {
    const failed = task("failed", { state: "failed", error: "The agent could not complete this task." });
    expect(ids(stoppedChannelTasks(page([failed])))).toEqual(["failed"]);
  });

  it("lists nothing that is queued, running, waiting, completed or cancelled", () => {
    const others = (["queued", "running", "waiting", "completed", "cancelled"] as const).map((state) =>
      task(state, { state }),
    );
    expect(stoppedChannelTasks(page(others))).toEqual([]);
  });

  it("lists nothing for an archived channel, which stops every task", () => {
    expect(stoppedChannelTasks(page([task("paused-by-archive")], true))).toEqual([]);
  });

  it("lists one entry for a stopped run, the root, and not each task under it", () => {
    const run = [
      task("child", { parentTaskId: "root", rootTaskId: "root" }),
      task("root"),
      task("grandchild", { parentTaskId: "child", rootTaskId: "root" }),
    ];
    expect(ids(stoppedChannelTasks(page(run)))).toEqual(["root"]);
  });
});
