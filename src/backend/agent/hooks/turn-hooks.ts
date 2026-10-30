import { Effect } from "effect";
import type { AgentServiceParts } from "../../agent-service";
import type { TurnHooks } from "../turn-lifecycle";

/** How a running turn reports back to the service. */
export function turnHooks(parts: AgentServiceParts): TurnHooks {
  return {
    emitFailure: (failure) => parts.emitServiceEvent("failure", failure),
    emit: (event) => parts.emit(event),
    emitError: (code, error, agentId, context) => parts.emitError(code, error, agentId, context),
    emitRuntimeSnapshot: () => parts.emitRuntimeSnapshot(),
    scheduleDrain: (agentId) => parts.drain.scheduleDrain(agentId),
    steerAgentMessage: (recipientAgentId, deliveryId) => parts.steerAgentMessage(recipientAgentId, deliveryId),
    dropRefusedSession: (agentId, externalThreadId) =>
      parts.threads.dropRefusedProviderSession(agentId, externalThreadId),
    listAgents: () => parts.listAgents(),
    redactMcp: (text) => parts.mcp.redact(text),
    emitToolUsage: (usage) => parts.emitServiceEvent("toolUsage", usage),
    turnModel: (agentId, turnId) => parts.drain.modelForTurn(agentId, turnId),
    mayFailOver: (agentId) => parts.usageLimitBackup(agentId) !== undefined,
    requeueChannelDelivery: (deliveryId, continueWork) => parts.requeueChannelDelivery(deliveryId, continueWork),
    quietRoutineDelivery: (deliveryId) => parts.routines.quietRunForDelivery(deliveryId),
    takeRoutinePreview: (deliveryId) => parts.routines.takePreviewBeforeRun(deliveryId),
    closeRoutineSession: (externalThreadId) => parts.threads.closeRoutineThread(externalThreadId),
    conversationTurnEnded: (agentId, sideThreadId, counts, memoryCommitted) =>
      parts.memoryReview.turnEnded(agentId, sideThreadId, counts, memoryCommitted),
    turnStopped: (agentId, taskId, turnId) =>
      parts.stoppedTurn(agentId, taskId) === turnId || (taskId === null && parts.requestedNewChats.has(agentId)),
    hasOpenWait: (agentId, deliveryIds) =>
      parts.waits.list(agentId).waits.some((wait) => deliveryIds.includes(wait.requestMessageId)),
    routineAnswered: (agentId, deliveryId, answer) => {
      const agent = parts.store.list().find((item) => item.id === agentId);
      const run = parts.routines.runForDelivery(deliveryId);
      if (!agent || !run) return Effect.void;
      return parts.threads
        .addRoutineDigest(agent, run.routineName, answer)
        .pipe(
          Effect.catch((failure) =>
            Effect.sync(() => parts.emitError("routine_digest_failed", failure.cause, agentId)),
          ),
        );
    },
    attachAnswerFiles: (agentId, snapshot, answer, paths) =>
      parts.attachments
        .attachAnswerFiles(agentId, snapshot, answer, paths)
        .pipe(
          Effect.catch((failure) =>
            Effect.sync(() => parts.emitError("answer_attachments_failed", failure.cause, agentId)),
          ),
        ),
    taskForThread: (threadId) => parts.tasks.taskForThread(threadId),
    taskOpen: (taskId) => parts.tasks.threadId(taskId) !== null,
    taskFailed: (taskId, message) => parts.tasks.failed(taskId, parts.mcp.redact(message)),
  };
}
