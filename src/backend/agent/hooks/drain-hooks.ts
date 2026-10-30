import { createOpenOwnBotLogger } from "@robot/logging";
import { Effect } from "effect";
import type { AgentServiceParts } from "../../agent-service";
import type { DrainHooks } from "../drain-scheduler";

const logger = createOpenOwnBotLogger("agent-service");

/** How the drain scheduler starts turns and reads agent state. */
export function drainHooks(parts: AgentServiceParts): DrainHooks {
  return {
    emitError: (code, error, agentId) => parts.emitError(code, error, agentId),
    redactMcp: (text) => parts.mcp.redact(text),
    isStopping: () => parts.stopping,
    servesModel: (model) => parts.endpoints.serves(model),
    requeueChannelDelivery: (deliveryId, continueWork) => parts.requeueChannelDelivery(deliveryId, continueWork),
    mayFailOver: (agentId) => parts.usageLimitBackup(agentId) !== undefined,
    turnEnded: (turnId) => parts.turn.hasEnded(turnId),
    turnRestarting: (turnId) => parts.turn.forgetEnded(turnId),
    startRequestedNewChat: (agentId) => parts.startRequestedNewChat(agentId),
    dropRequestedNewChat: (agentId) => {
      if (parts.requestedNewChats.delete(agentId))
        logger.info(`Agent ${agentId} dropped its new chat request: a turn in its chat started first.`);
    },
    followUsageLimit: (agentId) => {
      if (parts.pendingRuntimeDue(agentId)) {
        Effect.runFork(
          parts.followPendingRuntime(agentId).pipe(
            // A change that is gone, applied or dropped, lets the next drain make a due usage-limit move.
            Effect.andThen((moved) =>
              Effect.sync(() => parts.drain.scheduleDrain(agentId, moved || !parts.pendingRuntimeDue(agentId))),
            ),
            Effect.forkIn(parts.scope, { startImmediately: true }),
          ),
        );
        return true;
      }
      if (!parts.usageLimitMove(agentId)) return false;
      Effect.runFork(
        parts.followUsageLimit(agentId).pipe(
          // The `held` hook kept the queue for this move, so a move that failed settles it.
          Effect.tap((moved) =>
            moved || parts.usageLimits.mayDrain(agentId)
              ? Effect.void
              : parts
                  .settleHeldQueues([agentId])
                  .pipe(
                    Effect.catch((failure) =>
                      Effect.sync(() => parts.emitError("usage_limit_hold_failed", failure.cause, agentId)),
                    ),
                  ),
          ),
          // A channel task waits in its channel, and only a pump assigns it to the new model.
          Effect.tap((moved) =>
            moved
              ? parts.channels
                  .wake()
                  .pipe(
                    Effect.catch((failure) =>
                      Effect.sync(() => parts.emitError("channel_coordination_failed", failure.cause, agentId)),
                    ),
                  )
              : Effect.void,
          ),
          Effect.andThen((moved) => Effect.sync(() => parts.drain.scheduleDrain(agentId, moved))),
          Effect.forkIn(parts.scope, { startImmediately: true }),
        ),
      );
      return true;
    },
  };
}
