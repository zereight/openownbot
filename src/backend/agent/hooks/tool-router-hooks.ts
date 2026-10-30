import { Effect } from "effect";
import type { AgentServiceParts } from "../../agent-service";
import { AgentLifecycleFailed } from "../agent-lifecycle-failed";
import type { OpenOwnBotToolRouterHooks } from "../openownbot-tool-router";
import { toToolOperationFailed } from "../tool-operation";

/** How the tool router reaches agents, channels and routines. */
export function toolRouterHooks(parts: AgentServiceParts): OpenOwnBotToolRouterHooks {
  return {
    listAgents: () => parts.listAgents(),
    listModels: () => parts.listModels(),
    providerAccounts: (provider) => parts.getStatus().providers?.find((row) => row.id === provider)?.accounts,
    preferredProvider: () => parts.preferredProvider(),
    createAgent: (input, creatorAgentId, configure) =>
      parts
        .createAgent(
          input,
          { kind: "agent", agentId: creatorAgentId },
          configure
            ? (agent) =>
                configure(agent).pipe(
                  Effect.mapError(
                    (failure) => new AgentLifecycleFailed({ operation: "configure tool agent", cause: failure.cause }),
                  ),
                )
            : undefined,
        )
        .pipe(toToolOperationFailed),
    updateAgent: (input, initiatingAgentId) => parts.updateAgent(input, initiatingAgentId).pipe(toToolOperationFailed),
    setAvatar: (agentId, image) => parts.setAvatar(agentId, image).pipe(toToolOperationFailed),
    enabledMcpServers: () => parts.mcp.enabled(),
    emitError: (code, error, agentId) => parts.emitError(code, error, agentId),
    redactMcp: (text) => parts.mcp.redact(text),
    runsTurn: (agentId) => parts.runsTurn(agentId),
    interrupt: (agentId, turnId, mayStop) =>
      parts.interruptTurn(agentId, turnId, undefined, mayStop).pipe(toToolOperationFailed),
    turnActivity: (agentId, turnId) => ({
      startedAt: turnId ? parts.turn.turnStartedAt(turnId) : null,
      lastEventAt: parts.turn.lastEventAt(agentId),
    }),
    requestNoUpdate: (agentId, threadId, turnId) => parts.turn.requestNoUpdate(agentId, threadId, turnId),
    reportRoutineFailure: (agentId, turnId, reason) => parts.turn.reportRoutineFailure(agentId, turnId, reason),
    requestNewChat: (agentId) => {
      parts.requestedNewChats.add(agentId);
    },
    steerAgentMessage: (recipientAgentId, deliveryId) => parts.steerAgentMessage(recipientAgentId, deliveryId),
  };
}
