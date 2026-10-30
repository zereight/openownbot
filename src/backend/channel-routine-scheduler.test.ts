// @vitest-environment node

import type { ChannelTask } from "@robot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { channelRunStatusForTasks } from "./channel-routine-scheduler";

function task(id: string, state: ChannelTask["state"]): ChannelTask {
  return {
    id,
    channelId: "channel",
    parentTaskId: id === "root" ? null : "root",
    rootTaskId: "root",
    ownerAgentId: "agent",
    requestMessageId: "request",
    instruction: "Do the work.",
    attachmentDraftIds: [],
    expectedResult: "Done.",
    sourceMessageIds: ["request"],
    dependencies: [],
    resources: [],
    state,
    revision: 1,
    assignmentCount: 1,
    error: null,
  };
}

describe("channelRunStatusForTasks", () => {
  it("reads a run whose tasks the owner cancelled as cancelled", () => {
    expect(channelRunStatusForTasks([task("root", "cancelled"), task("child", "cancelled")], false)).toEqual({
      status: "cancelled",
      error: null,
    });
  });

  it("reads a run as cancelled when the owner cancelled the rest of it after one task completed", () => {
    expect(
      channelRunStatusForTasks(
        [task("root", "cancelled"), task("done", "completed"), task("other", "cancelled")],
        true,
      ),
    ).toEqual({ status: "cancelled", error: null });
  });

  it("still reads a run whose tasks all completed as succeeded", () => {
    expect(channelRunStatusForTasks([task("root", "completed"), task("child", "completed")], false)).toEqual({
      status: "succeeded",
      error: null,
    });
  });
});
