import type { ChannelTask } from "@robot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { channelTaskWaits } from "./channel-task-waits";

const task = (id: string, owner: string | null, state: ChannelTask["state"] = "queued"): ChannelTask => ({
  id,
  channelId: "ch-b",
  parentTaskId: null,
  rootTaskId: id,
  ownerAgentId: owner,
  requestMessageId: `m-${id}`,
  instruction: `do ${id}`,
  attachmentDraftIds: [],
  expectedResult: "",
  sourceMessageIds: [],
  dependencies: [],
  resources: [],
  state,
  revision: 1,
  assignmentCount: 0,
  error: null,
});

const front = { taskId: "t-front", channelId: "ch-a", channelName: "Launch", instruction: "Write the release notes" };

describe("channelTaskWaits", () => {
  it("names the work of another channel that the owner is busy with", () => {
    const waits = channelTaskWaits([task("t1", "A")], { assignmentOf: () => front, chatBusy: () => false });
    expect(waits).toEqual({
      t1: { kind: "channel-task", channelId: "ch-a", channelName: "Launch", instruction: "Write the release notes" },
    });
  });

  it("says nothing of a task that is the work in front itself", () => {
    const waits = channelTaskWaits([task("t-front", "A")], { assignmentOf: () => front, chatBusy: () => false });
    expect(waits).toEqual({});
  });

  it("reports a busy chat when the owner has no channel work", () => {
    const waits = channelTaskWaits([task("t1", "A")], { assignmentOf: () => null, chatBusy: () => true });
    expect(waits).toEqual({ t1: { kind: "chat" } });
  });

  it("reports nothing when the owner is free, or the task has no owner yet", () => {
    const lookup = { assignmentOf: () => null, chatBusy: () => false };
    expect(channelTaskWaits([task("t1", "A"), task("t2", null)], lookup)).toEqual({});
    expect(channelTaskWaits([task("t3", null)], { assignmentOf: () => front, chatBusy: () => true })).toEqual({});
  });

  it("looks only at queued tasks", () => {
    const lookup = { assignmentOf: () => front, chatBusy: () => true };
    const waits = channelTaskWaits([task("r", "A", "running"), task("p", "A", "paused"), task("q", "A")], lookup);
    expect(Object.keys(waits)).toEqual(["q"]);
  });

  it("cuts a long instruction to one line", () => {
    const long = { ...front, instruction: `${"word ".repeat(80)}` };
    const wait = channelTaskWaits([task("t1", "A")], { assignmentOf: () => long, chatBusy: () => false }).t1;
    expect(wait?.kind === "channel-task" && wait.instruction.length).toBeLessThanOrEqual(121);
    expect(wait?.kind === "channel-task" && wait.instruction.endsWith("…")).toBe(true);
  });
});
