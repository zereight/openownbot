import type { ConversationMessage, ConversationSnapshot } from "@openownbot/contracts/ipc";
import type { OpenOwnBotDatabase } from "../openownbot-database";
import type { AgentThreadRecord, AgentThreadStore } from "./agent-thread-store";

export interface AgentThreadForkInput {
  agentId: string;
  /** The thread to copy: a side thread, or the agent's own chat. */
  sourceThreadId: string;
  /** The last message to copy. Later messages stay in the source. */
  throughMessageId: string;
  title: string;
}

/**
 * Forks a conversation: a new side thread of the same agent that starts with a copy of the history up to one
 * message. The copy is a whole conversation snapshot, so a replay of the new thread keeps it. The fork has no
 * provider session yet; the source keeps its own, and neither thread changes the other afterwards.
 *
 * It refuses a message that does not exist and a message of a turn that still runs, because the copy of a turn
 * that is not finished could never finish. It does not touch the source.
 */
export function forkAgentThread(
  database: OpenOwnBotDatabase,
  threads: AgentThreadStore,
  input: AgentThreadForkInput,
): AgentThreadRecord {
  const source = database.readConversation(input.agentId, input.sourceThreadId);
  const cut = source.messages.findIndex((message) => message.id === input.throughMessageId);
  if (cut < 0) throw new Error(`The conversation has no message ${input.throughMessageId}.`);
  const copied = source.messages.slice(0, cut + 1);
  if (source.activeTurnId !== null && copied.some((message) => message.turnId === source.activeTurnId)) {
    throw new Error("A thread cannot be forked from a turn that is still running.");
  }
  const fork = threads.create({
    agentId: input.agentId,
    origin: "user",
    title: input.title,
    titleSource: "auto",
    forkedFrom: { threadId: input.sourceThreadId, messageId: input.throughMessageId },
  });
  try {
    database.persistConversation(forkSnapshot(source, fork.threadId, copied), "agent-thread.forked", {
      sourceThreadId: input.sourceThreadId,
      throughMessageId: input.throughMessageId,
    });
  } catch (failure) {
    threads.delete(fork.taskId);
    throw failure;
  }
  return fork;
}

/** A turn id is unique in the whole database, so the copy of a turn gets an id of the new thread. */
function forkSnapshot(
  source: ConversationSnapshot,
  threadId: string,
  messages: readonly ConversationMessage[],
): ConversationSnapshot {
  return {
    agentId: source.agentId,
    threadId,
    activeTurnId: null,
    revision: 0,
    messages: messages.map((message) => {
      const copy = structuredClone(message);
      if (copy.turnId) copy.turnId = `${threadId}:${copy.turnId}`;
      return copy;
    }),
  };
}
