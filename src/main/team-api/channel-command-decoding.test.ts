import { parseChannelCommand } from "@robot/contracts/ipc";
import { CHANNEL_ROUTES, channelRequest } from "@robot/contracts/team-protocol/channels-v1";
import { describe, expect, it } from "vitest";

const cancel = {
  type: "cancel",
  operationId: "operation-1",
  channelId: "channel-1",
  taskId: "task-1",
  recipientAgentId: null,
};

describe("the cancel channel command", () => {
  it("passes the IPC guard with its task", () => {
    expect(parseChannelCommand(cancel)).toEqual(cancel);
  });

  it("refuses the IPC guard without a task", () => {
    const { taskId: _taskId, ...withoutTask } = cancel;
    expect(() => parseChannelCommand(withoutTask)).toThrow("Provide a valid channel command.");
  });

  it("passes the wire decoder with its task, and the host guard after it", () => {
    const wire = channelRequest(CHANNEL_ROUTES.command, cancel);
    expect(wire).toEqual(cancel);
    expect(parseChannelCommand(wire)).toEqual(cancel);
  });

  it("refuses the wire decoder without a task", () => {
    const { taskId: _taskId, ...withoutTask } = cancel;
    expect(() => channelRequest(CHANNEL_ROUTES.command, withoutTask)).toThrow("Invalid channel identifier.");
  });

  it("still refuses a command type that no host knows", () => {
    expect(() => channelRequest(CHANNEL_ROUTES.command, { ...cancel, type: "abandon" })).toThrow(
      "Invalid channel state.",
    );
  });
});
