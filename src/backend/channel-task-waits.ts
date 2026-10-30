import { CHANNEL_TASK_WAIT_INSTRUCTION_LIMIT, type ChannelTask, type ChannelTaskWait } from "@robot/contracts/ipc";

/** The channel work that an agent is doing now, which the tasks of its other channels wait behind. */
export interface ChannelWorkInFront {
  taskId: string;
  channelId: string;
  channelName: string;
  instruction: string;
}

export interface ChannelTaskWaitLookup {
  /** The channel assignment that the agent runs, or null when it has none. */
  assignmentOf(agentId: string): ChannelWorkInFront | null;
  /** The agent runs a turn of its own chat, or has a message of it queued ahead. */
  chatBusy(agentId: string): boolean;
}

function oneLine(text: string): string {
  const line = text.replace(/\s+/gu, " ").trim();
  return line.length > CHANNEL_TASK_WAIT_INSTRUCTION_LIMIT
    ? `${line.slice(0, CHANNEL_TASK_WAIT_INSTRUCTION_LIMIT).trimEnd()}…`
    : line;
}

/**
 * What each queued task with an owner waits behind. An agent does one thing at a time across all
 * its channels and its own chat, so a task whose owner is busy stays queued with no sign of why.
 * A task that has no owner yet waits for the lead to route it, which is another wait and not named
 * here. The work in front can be in this channel or in another one.
 */
export function channelTaskWaits(
  tasks: readonly ChannelTask[],
  lookup: ChannelTaskWaitLookup,
): Record<string, ChannelTaskWait> {
  const waits: Record<string, ChannelTaskWait> = {};
  for (const task of tasks) {
    if (task.state !== "queued" || !task.ownerAgentId) continue;
    const front = lookup.assignmentOf(task.ownerAgentId);
    if (front) {
      if (front.taskId === task.id) continue;
      waits[task.id] = {
        kind: "channel-task",
        channelId: front.channelId,
        channelName: front.channelName,
        instruction: oneLine(front.instruction),
      };
    } else if (lookup.chatBusy(task.ownerAgentId)) {
      waits[task.id] = { kind: "chat" };
    }
  }
  return waits;
}
