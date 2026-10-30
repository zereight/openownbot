import type { AgentEvent, ConversationPage, TeamRealtimeEvent } from "@robot/contracts/ipc";

/**
 * The part of a host that a canvas chat reaches: the open agent's own conversation and the events of
 * its host. The routine canvas and the Workflows page both chat through it.
 */
export interface AgentChatPort {
  conversation: {
    /** Sends a request to the agent. Resolves to the delivery that names it, or null without one. */
    send(input: { agentId: string; text: string; clientMessageId: string }): Promise<string | null>;
    /** The newest page, or the page around one message. */
    page(agentId: string, aroundMessageId?: string): Promise<ConversationPage>;
  };
  /** The events of this host only. */
  onEvent(listener: (event: AgentEvent | TeamRealtimeEvent) => void): () => void;
}

/** The desktop adapter for one server. `window.openownbot` is read on each call: tests and stories replace it per case. */
export function desktopAgentChatPort(serverId: string): AgentChatPort {
  const agent = () => window.openownbot.agent;
  return {
    conversation: {
      send: async ({ agentId, text, clientMessageId }) => {
        const receipt = await agent().sendMessage({ agentId, text, clientMessageId }, serverId);
        return receipt.deliveries.find((delivery) => delivery.recipientAgentId === agentId)?.id ?? null;
      },
      page: (agentId, aroundMessageId) =>
        agent().readConversationPage(
          { agentId, ...(aroundMessageId ? { anchor: { type: "around", messageId: aroundMessageId } } : {}) },
          serverId,
        ),
    },
    onEvent: (listener) =>
      agent().onScopedEvent((scoped) => {
        if (scoped.serverId === serverId) listener(scoped.event);
      }),
  };
}
