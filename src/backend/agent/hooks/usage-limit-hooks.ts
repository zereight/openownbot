import type { AgentModelChoice } from "@robot/contracts/ipc";
import { Effect } from "effect";
import type { AgentServiceParts } from "../../agent-service";
import { agentProviderAccount } from "../thread-items";
import type { UsageLimitKey } from "../usage-limit-gate";
import { toUsageReadFailed, type UsageLimitHooks } from "../usage-limit-gate";

/** How the usage limit gate switches models and resumes agents. */
export function usageLimitHooks(parts: AgentServiceParts): UsageLimitHooks {
  return {
    emit: (event) => parts.emit(event),
    emitRuntimeSnapshot: () => parts.emitRuntimeSnapshot(),
    scheduleDrain: (agentId) => parts.drain.scheduleDrain(agentId),
    readUsage: (provider, model, accountId) =>
      parts.providers.usage({ provider, model, ...(accountId ? { accountId } : {}) }).pipe(toUsageReadFailed),
    // The refused turn's drain must not wait for the queues, so the owned scope settles them. An
    // agent set to switch without asking keeps its queue for the backup model; an idle one moves now,
    // and the refused one at the end of its turn.
    held: (agentIds) =>
      Effect.sync(() => {
        for (const agentId of agentIds) parts.drain.scheduleDrain(agentId);
      }).pipe(
        Effect.andThen(parts.settleHeldQueues(agentIds.filter((agentId) => !parts.usageLimitBackup(agentId)))),
        Effect.catch((failure) => Effect.sync(() => parts.emitError("usage_limit_hold_failed", failure.cause))),
        Effect.forkIn(parts.scope, { startImmediately: true }),
        Effect.asVoid,
      ),
    // A channel task that went back to its queue is assigned again only by a pump. An agent that
    // left this model for a backup goes back to it.
    released: (limit) =>
      parts.channels.wake().pipe(
        Effect.catch((failure) => Effect.sync(() => parts.emitError("usage_limit_release_failed", failure.cause))),
        Effect.andThen(
          Effect.forEach(
            parts.store
              .list()
              .filter((agent) => agent.usageLimitReturn && sameUsageLimit(agent.usageLimitReturn, limit)),
            (agent) => Effect.sync(() => parts.drain.scheduleDrain(agent.id)),
            { discard: true },
          ),
        ),
        Effect.forkIn(parts.scope, { startImmediately: true }),
        Effect.asVoid,
      ),
  };
}

function sameUsageLimit(choice: AgentModelChoice, limit: UsageLimitKey): boolean {
  return (
    choice.provider === limit.provider &&
    agentProviderAccount(choice) === limit.accountId &&
    choice.model === limit.model
  );
}
