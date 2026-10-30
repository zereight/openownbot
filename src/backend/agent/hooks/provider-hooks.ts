import { Cause, Effect } from "effect";
import type { AgentServiceParts } from "../../agent-service";
import { reportOriginalFailure } from "../../effect-boundary";
import { getString } from "../../protocol";
import { type ProviderHooks, toProviderOperationFailed } from "../provider-runtime";
import { providerForAgent } from "../thread-items";

/** How the provider runtime reaches the turns, tools and boot recovery of the service. */
export function providerHooks(parts: AgentServiceParts): ProviderHooks {
  return {
    bindClient: (client) => {
      client.on("notification", (notification) => {
        if (notification.method === "openownbot/sessionSettings/updated") {
          const threadId = getString(notification.params, "threadId");
          const agentId = threadId ? parts.conversation.agentForThread(threadId) : undefined;
          if (agentId) parts.emit({ type: "agent-session-settings-changed", agentId });
          return;
        }
        Effect.runFork(
          parts.turn
            .handleNotification(notification, client)
            .pipe(Effect.forkIn(parts.scope, { startImmediately: true })),
        );
      });
      client.on("request", (request) =>
        Effect.runFork(
          parts.tools.handle(client, request).pipe(Effect.forkIn(parts.scope, { startImmediately: true })),
        ),
      );
    },
    onProvidersReady: () =>
      Effect.gen(function* () {
        // Work of a deleted task must not run or settle in the agent's own chat.
        yield* parts.tasks.endWorkOfGoneTasks().pipe(
          Effect.tap((agentIds) =>
            Effect.sync(() => {
              for (const id of agentIds) parts.mailboxSync.emitQueue(id);
            }),
          ),
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(cause)
              : reportOriginalFailure(cause, (failure) => parts.emitError("delivery_reconcile_failed", failure)),
          ),
        );
        // A failed reconcile must not skip the channels and drains below (#2214).
        yield* parts.boot
          .reconcileUnresolvedDeliveries()
          .pipe(
            Effect.catchCause((cause) =>
              Cause.hasInterruptsOnly(cause)
                ? Effect.failCause(cause)
                : reportOriginalFailure(cause, (failure) => parts.emitError("delivery_reconcile_failed", failure)),
            ),
          );
        yield* parts.channels.recover();
        parts.channelRoutines.reconcileAll();
        yield* parts.boot.backfillProviderHistory().pipe(Effect.forkIn(parts.scope));
      }).pipe(
        // Limits are not kept over a restart, so an agent on a backup model goes back first.
        // The drains also run when a step above fails, so no settled lane stays idle.
        Effect.ensuring(
          Effect.sync(() => {
            for (const agent of parts.store.list()) parts.drain.scheduleDrain(agent.id);
          }),
        ),
        toProviderOperationFailed,
      ),
    onProviderLost: (client) => {
      parts.boot.orphanDeliveriesOf(client.provider, (agentId) => parts.providers.runsOnOwnProcess(agentId));
      parts.compaction.clientEnded(client);
      parts.attention.clearPrompts(client);
      parts.attention.clearBrowserTakeovers(client);
      parts.attention.clearApprovals(client);
      Effect.runFork(
        parts.turn
          .interruptTurnsOf(client, { keepRecoverable: true })
          .pipe(Effect.forkIn(parts.scope, { startImmediately: true })),
      );
    },
    onClientStopped: (client) =>
      Effect.gen(function* () {
        parts.attention.clearPrompts(client);
        parts.attention.clearBrowserTakeovers(client);
        parts.attention.clearApprovals(client);
        parts.compaction.clientEnded(client);
        yield* parts.warmGenerations.ownerStopped(client);
        yield* parts.turn.interruptTurnsOf(client);
      }),
    onAgentClientLost: (agentId, client) =>
      Effect.gen(function* () {
        parts.attention.clearPrompts(client);
        parts.attention.clearBrowserTakeovers(client);
        parts.attention.clearApprovals(client);
        parts.boot.orphanDeliveriesOfAgent(agentId);
        parts.compaction.clientEnded(client);
        yield* parts.turn.interruptTurnsOf(client, { keepRecoverable: true });
        // A teammate that asked this agent may hold the other answers until this work ends.
        const requesters = parts.mailbox
          .unresolvedDeliveries()
          .flatMap(({ delivery }) =>
            delivery.recipientAgentId === agentId && delivery.sender.kind === "agent" ? [delivery.sender.agentId] : [],
          );
        yield* parts.boot.reconcileUnresolvedDeliveries().pipe(
          Effect.catch((failure) =>
            Effect.sync(() => parts.emitError("delivery_reconcile_failed", failure.cause, agentId)),
          ),
          Effect.ensuring(
            Effect.sync(() => {
              parts.drain.scheduleDrain(agentId);
              for (const requester of new Set(requesters)) parts.drain.scheduleDrain(requester);
            }),
          ),
        );
      }),
    sharedRoot: () => parts.store.sharedRoot,
    isStopping: () => parts.stopping,
    isProviderBusy: (provider) => parts.isProviderBusy(provider),
    isAgentBusy: (agentId) => parts.runsTurn(agentId),
    isProviderAssigned: (provider) => parts.store.list().some((agent) => providerForAgent(agent) === provider),
    captureConfigRevision: () => parts.endpoints.committedRevision(),
    onProviderActivated: (provider, configRevision) =>
      Effect.gen(function* () {
        if (provider === "opencode") parts.endpoints.clearReleased(configRevision);
        yield* parts.endpoints.runExclusive(() => parts.endpoints.moveAgentsOffUnlistedModels(provider));
      }),
    onProviderResumed: (provider) => {
      for (const agent of parts.store.list()) {
        if (providerForAgent(agent) === provider) parts.drain.scheduleDrain(agent.id);
      }
    },
  };
}
