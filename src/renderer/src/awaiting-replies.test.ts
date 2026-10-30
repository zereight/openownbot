import type { ChannelTask, ChannelTaskWait } from "@robot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { channelAwaitingReplies } from "./awaiting-replies";

const task = (id: string, state: ChannelTask["state"], parentTaskId: string | null = null): ChannelTask => ({
  id,
  channelId: "ch-b",
  parentTaskId,
  rootTaskId: parentTaskId ?? id,
  ownerAgentId: "A",
  requestMessageId: `m-${id}`,
  instruction: `Instruction ${id}`,
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

const rows = (tasks: ChannelTask[], waits?: Record<string, ChannelTaskWait>) =>
  channelAwaitingReplies({ tasks, agents: [], name: () => "Ada", waits, channelId: "ch-b" });

describe("channelAwaitingReplies with waits", () => {
  it("shows a queued task that waits behind the work of its owner in another channel", () => {
    const [row] = rows([task("t1", "queued")], {
      t1: { kind: "channel-task", channelId: "ch-a", channelName: "Launch", instruction: "Write notes" },
    });
    expect(row).toMatchObject({ id: "t1", name: "Ada", state: "asked" });
    expect(row?.detail).toContain("Launch");
    expect(row?.detail).toContain("Write notes");
  });

  it("does not name this channel when the work in front is here", () => {
    const [row] = rows([task("t1", "queued")], {
      t1: { kind: "channel-task", channelId: "ch-b", channelName: "Here", instruction: "Other task" },
    });
    expect(row?.detail).toContain("Other task");
    expect(row?.detail).not.toContain("Here");
  });

  it("says that the owner is busy in its own chat", () => {
    const [row] = rows([task("t1", "queued")], { t1: { kind: "chat" } });
    expect(row?.detail).toMatch(/chat/i);
  });

  it("shows nothing for a queued task with no wait, or a task that is running", () => {
    expect(rows([task("t1", "queued")])).toEqual([]);
    expect(rows([task("t2", "running")], { t2: { kind: "chat" } })).toEqual([]);
  });

  it("keeps the wait on a sub-task of a parent that waits for it", () => {
    const [row] = rows([task("p", "waiting"), task("c", "queued", "p")], { c: { kind: "chat" } });
    expect(row).toMatchObject({ id: "c", state: "asked" });
    expect(row?.detail).toMatch(/chat/i);
  });
});
