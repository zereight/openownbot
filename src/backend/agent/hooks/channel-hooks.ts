import { sourceText } from "@robot/i18n/source";
import { createOpenOwnBotLogger } from "@robot/logging";
import { Effect } from "effect";
import type { AgentServiceOptions, AgentServiceParts } from "../../agent-service";
import { DECISION_TIMEOUT_MS, decideMember } from "../../channel-decision";
import { toChannelOperationError } from "../../channel-effects";
import type { ChannelHooks } from "../../channel-service";
import { decodeRecordResponse } from "../../protocol";
import { channelGenerationModel } from "../channel-generation-model";
import { GenerationUsageLimitError, generateTextWithoutTools, ProfileGenerationFailed } from "../profile-generation";
import { isPlanLimitDiagnostic } from "../provider-diagnostics";
import { localTimezone } from "../routine-tools";
import { isRequestTimeout } from "../thread-items";

const decisionLogger = createOpenOwnBotLogger("channel-decision");

/** How channel coordination reaches agents, drains and turns. */
export function channelHooks(
  parts: AgentServiceParts,
  options: Pick<AgentServiceOptions, "channelPersonAgentLevel" | "channelRemotePerson" | "timezone">,
): ChannelHooks {
  return {
    agents: () => parts.listAgents(),
    hidden: (agentId) => parts.store.isHidden(agentId),
    decideMember: (input) => {
      const backend = parts.decisionBackend();
      if (!backend) return Effect.succeed(null);
      const startedAt = Date.now();
      return Effect.promise(() =>
        decideMember(backend, input, { fetch: (url, init) => fetch(url, init), timeoutMs: DECISION_TIMEOUT_MS }),
      ).pipe(
        Effect.map((result) => {
          // Never the request text or the key: only what is needed to see why the lead's model took over.
          decisionLogger.info("Channel decision model answered.", {
            backend: backend.kind,
            ok: result.ok,
            reason: result.ok ? undefined : result.reason,
            probability: result.ok ? result.probability : undefined,
            probabilities: result.ok ? undefined : result.probabilities,
            milliseconds: Date.now() - startedAt,
          });
          return result.ok ? result.agentId : null;
        }),
      );
    },
    generate: (lead, prompt) =>
      Effect.gen(function* () {
        yield* parts.providers.ensureProvider(lead.provider);
        const model = parts.endpoints
          .available()
          .find((item) => item.provider === lead.provider && item.id === lead.model);
        if (!model)
          return yield* new ProfileGenerationFailed({
            cause: new Error(sourceText("error.backend.channelLeadModelUnavailable")),
          });
        const client = parts.providers.createProfileClient(lead.provider, lead.providerAccountId);
        return yield* parts.profileClients
          .run(client, (cancelled) =>
            generateTextWithoutTools(client, channelGenerationModel(model), prompt, cancelled),
          )
          .pipe(
            // A routing turn can be the first one a spent plan refuses: in its completion, or as the
            // error of the `turn/start` request. It holds the lead's model the way a refused member turn
            // does, and the channel keeps the task queued for the reset.
            Effect.tapError((failure) =>
              failure instanceof GenerationUsageLimitError
                ? parts.usageLimits.reached(lead.id, failure.resetsAt, lead.model)
                : failure.cause instanceof Error && isPlanLimitDiagnostic(failure.cause.message)
                  ? parts.usageLimits.reached(lead.id, null, lead.model)
                  : Effect.void,
            ),
          );
      }).pipe(toChannelOperationError),
    schedule: (agentId) => parts.drain.scheduleDrain(agentId),
    awaitDrain: (agentId) => parts.drain.taskFor(agentId)?.pipe(toChannelOperationError),
    contextCharacters: (agentId, threadId) => {
      const agent = parts.store.list().find((item) => item.id === agentId);
      const session = agent ? parts.store.database.activeProviderSession(threadId, agent.provider) : null;
      return session ? parts.compaction.contextInputCharacters(session.externalSessionId) : 120_000;
    },
    reportsCompactions: (agentId) => parts.reportsCompactions(agentId),
    forgetThread: (threadId) => parts.forgetExecutionThread(threadId).pipe(toChannelOperationError),
    loadedSnapshot: (threadId) => parts.conversation.loadedExecutionSnapshot(threadId),
    // A held agent gets no channel assignment: one that waited for the reset would hold its
    // resources. A channel turn runs beside the agent's tasks, unless its provider runs one turn
    // of the agent at a time.
    busy: (agentId) =>
      Boolean(parts.conversation.workingSnapshot(agentId)?.activeTurnId || parts.mailbox.nextQueued(agentId)) ||
      (parts.tasks.oneTurnAtATime(agentId) &&
        parts.conversation.workingTaskSnapshots(agentId).some((snapshot) => snapshot.activeTurnId)) ||
      !parts.usageLimits.mayDrain(agentId),
    usageLimited: (agentId) => !parts.usageLimits.mayDrain(agentId),
    skipAtLimit: (task) => parts.channelRoutines.skipAtLimit(task.channelId, task.requestMessageId),
    usageLimitBackup: (agentId) => parts.usageLimitBackup(agentId) !== undefined,
    steer: (agentId, threadId, turnId, messageId, text) =>
      Effect.gen(function* () {
        const agent = parts.store.list().find((item) => item.id === agentId);
        const session = agent ? parts.store.database.activeProviderSession(threadId, agent.provider) : null;
        const client = agent ? parts.providers.clientForAgent(agent) : null;
        if (!session || !client) return "rejected" as const;
        return yield* client
          .request(
            "turn/steer",
            {
              threadId: session.externalSessionId,
              expectedTurnId: turnId,
              clientUserMessageId: messageId,
              input: [{ type: "text", text }],
            },
            decodeRecordResponse,
          )
          .pipe(
            Effect.match({
              onSuccess: () => "accepted" as const,
              onFailure: (failure) =>
                isRequestTimeout(failure.cause, "turn/steer") ? ("uncertain" as const) : ("rejected" as const),
            }),
          );
      }),
    interrupt: (agentId, turnId, threadId) => parts.interrupt(agentId, turnId, threadId).pipe(toChannelOperationError),

    // Every channel state change ends in `publish`, so this is the complete trigger surface for
    // reconciling a channel routine run. It does not depend on `turn-completed`, which never
    // reaches the agent event forwarder for a channel thread.
    changed: (channelId, revision) => {
      parts.channelRoutines.reconcile(channelId);
      parts.routineTimer.arm();
      parts.emit({ type: "channels-changed", channelId, revision });
    },
    memoriesChanged: (channelId) => parts.emit({ type: "channel-memories-changed", channelId }),
    ...(options.channelPersonAgentLevel ? { personAgentLevel: options.channelPersonAgentLevel } : {}),
    ...(options.channelRemotePerson ? { remotePerson: options.channelRemotePerson } : {}),
    routines: {
      list: (channelId) => parts.channelRoutines.list(channelId),
      create: (input) => parts.channelRoutines.create(input),
      update: (input) => parts.channelRoutines.update(input),
      delete: (input) => parts.channelRoutines.delete(input),
      timezone: options.timezone ?? localTimezone,
    },
    // A held agent starts nothing, so its queue has no event of its own while the reservation
    // moves. Without this its panel keeps naming the channel task that has already ended.
    queueHoldChanged: () => {
      for (const agent of parts.store.list())
        if (parts.mailbox.queuedDeliveryIds(agent.id).length) parts.mailboxSync.emitQueue(agent.id);
    },
    error: (error) => parts.emitError("channel_coordination_failed", error),
  };
}
