import {
  type AgentModelChoice,
  type AgentSummary,
  DEFAULT_PROVIDER_ACCOUNT_ID,
  sameAgentModelChoice,
  type UpdateAgentInput,
} from "@robot/contracts/ipc";
import { Effect, Exit } from "effect";
import type { AgentServiceParts, AgentUpdate } from "../agent-service";
import type { StoredStateFailure } from "../stored-state-effects";
import type { AgentLifecycleFailed } from "./agent-lifecycle-failed";
import type { ProviderOperationFailed } from "./provider-runtime";
import { agentProviderAccount } from "./thread-items";
import type { UsageLimitKey } from "./usage-limit-gate";

/** Why `usageLimitMove` changes an agent's model, when it is not the switch for a usage limit. */
export type ModelMove = "return" | "provider-error" | "next-turn";

export function agentModelChoice(agent: AgentSummary): AgentModelChoice {
  return {
    provider: agent.provider,
    model: agent.model,
    ...(agent.providerAccountId ? { providerAccountId: agent.providerAccountId } : {}),
  };
}

export function usageLimitOf(choice: AgentModelChoice): UsageLimitKey {
  return { provider: choice.provider, accountId: agentProviderAccount(choice), model: choice.model };
}

interface ModelMovesSteps {
  /** The service's update of an agent, which hands its work over to the new model. */
  applyAgentUpdate(
    input: AgentUpdate,
    initiatingAgentId: string | undefined,
    move: ModelMove | null,
  ): Effect.Effect<unknown, AgentLifecycleFailed | ProviderOperationFailed | StoredStateFailure>;
}

/**
 * When an agent changes its model without a person: it leaves a model that a usage limit or a
 * provider error holds for a ready backup model, goes back once the hold ends, and applies a provider
 * change that waited for its work to end.
 */
export class ModelMoves {
  readonly #parts: AgentServiceParts;
  readonly #steps: ModelMovesSteps;

  constructor(parts: AgentServiceParts, steps: ModelMovesSteps) {
    this.#parts = parts;
    this.#steps = steps;
  }

  #applyAgentUpdate(input: AgentUpdate, initiatingAgentId: string | undefined, move: ModelMove | null) {
    return this.#steps.applyAgentUpdate(input, initiatingAgentId, move);
  }

  /**
   * The model a usage limit or a provider error moves this agent to now, or null. An agent goes back
   * to the model it left once no limit or provider error holds that model. An agent held by a limit,
   * or whose model failed a turn with a provider error, set to switch without asking and with queued
   * work or channel work that waits for it, moves to its first backup model that is ready. Only an
   * agent with no started work moves; the end of its turn tries again.
   */
  usageLimitMove(agentId: string): { input: UpdateAgentInput; move: ModelMove | null } | null {
    const agent = this.#parts.store.list().find((candidate) => candidate.id === agentId);
    if (!agent || (!agent.usageLimitReturn && !agent.backupModels?.automatic)) return null;
    if (this.#parts.runsTurn(agentId) || this.#parts.mailbox.hasStartedDelivery(agentId)) return null;
    // The agent keeps its reasoning effort where the other model has it. It goes back with the effort it left.
    const move = (choice: AgentModelChoice, reasoningEffort = agent.reasoningEffort) => {
      const model = this.#parts.endpoints
        .available()
        .find((option) => option.provider === choice.provider && option.id === choice.model);
      return {
        agentId,
        provider: choice.provider,
        model: choice.model,
        providerAccountId: choice.providerAccountId ?? null,
        reasoningEffort:
          model && !model.supportedReasoningEfforts.includes(reasoningEffort)
            ? model.defaultReasoningEffort
            : reasoningEffort,
      };
    };
    if (agent.usageLimitReturn && this.#usageLimitReady(agent.usageLimitReturn))
      return { input: move(agent.usageLimitReturn, agent.usageLimitReturn.reasoningEffort), move: "return" };
    const limited = !this.#parts.usageLimits.mayDrain(agentId);
    const failed = !limited && this.#parts.usageLimits.isFailed(usageLimitOf(agentModelChoice(agent)));
    if (!limited && !failed) return null;
    const taskWork = () =>
      this.#parts.mailbox.queuedTaskIds(agentId).some((taskId) => this.#parts.mailbox.nextQueued(agentId, taskId));
    // A channel task that the limit refused went back to its channel, so the queue can be empty.
    if (!this.#parts.mailbox.nextQueued(agentId) && !taskWork() && !this.#parts.channels.ownsWaitingWork(agentId))
      return null;
    const next = this.usageLimitBackup(agentId);
    return next ? { input: { ...move(next), leaveUsageLimit: true }, move: failed ? "provider-error" : null } : null;
  }

  /** The first ready backup model of an agent set to switch without asking, or undefined. */
  usageLimitBackup(agentId: string): AgentModelChoice | undefined {
    const agent = this.#parts.store.list().find((candidate) => candidate.id === agentId);
    if (!agent?.backupModels?.automatic) return undefined;
    const current = agentModelChoice(agent);
    return agent.backupModels.order.find(
      (choice) => !sameAgentModelChoice(choice, current) && this.#usageLimitReady(choice),
    );
  }

  /** Whether the model is ready, and no usage limit or provider error holds it. */
  #usageLimitReady(choice: AgentModelChoice): boolean {
    const limit = usageLimitOf(choice);
    return (
      this.#modelChoiceReady(choice) &&
      !this.#parts.usageLimits.isLimited(limit) &&
      !this.#parts.usageLimits.isFailed(limit)
    );
  }

  /**
   * Whether the provider is on and signed in, the account is connected, and the model list has the
   * model. The same check as `backupModelOption` in the settings page and the chat card.
   */
  #modelChoiceReady(choice: AgentModelChoice): boolean {
    const accountId = choice.providerAccountId ?? DEFAULT_PROVIDER_ACCOUNT_ID;
    const provider = this.#parts.getStatus().providers?.find((status) => status.id === choice.provider);
    const accounts = provider?.accounts;
    return (
      provider !== undefined &&
      provider.off !== true &&
      provider.state === "available" &&
      (accounts === undefined
        ? accountId === DEFAULT_PROVIDER_ACCOUNT_ID
        : accounts.some((account) => account.id === accountId && account.state === "connected")) &&
      this.#parts.endpoints.available().some((model) => model.provider === choice.provider && model.id === choice.model)
    );
  }

  /**
   * True while a provider handover would break a running turn, task, or started delivery. It sees a
   * turn that the database still records too, as the idle check of `#applyAgentUpdate` does, so a
   * queued change waits for that turn and is not dropped as a failure.
   */
  #runtimeHandoverBusy(agentId: string): boolean {
    const threadId = this.#parts.store.list().find((candidate) => candidate.id === agentId)?.threadId;
    return (
      this.#parts.runsTurn(agentId) ||
      this.#parts.mailbox.hasStartedDelivery(agentId) ||
      this.#parts.conversation.workingTaskSnapshots(agentId).length > 0 ||
      (threadId ? this.#parts.store.database.readActiveTurnId(agentId, threadId) !== null : false)
    );
  }

  /** A queued provider change is ready to apply: the agent is idle. */
  pendingRuntimeDue(agentId: string): boolean {
    const agent = this.#parts.store.list().find((candidate) => candidate.id === agentId);
    return Boolean(agent?.pendingRuntime) && !this.#runtimeHandoverBusy(agentId);
  }

  /** Applies `pendingRuntime` once the agent is idle. True when the agent moved. */
  readonly followPendingRuntime = Effect.fn("ModelMoves.followPendingRuntime")(function* (
    this: ModelMoves,
    agentId: string,
  ) {
    return yield* this.#parts.endpoints
      .runExclusive(() =>
        Effect.gen({ self: this }, function* () {
          const agent = this.#parts.store.list().find((candidate) => candidate.id === agentId);
          const pending = agent?.pendingRuntime;
          if (!pending || this.#runtimeHandoverBusy(agentId)) return false;
          yield* this.#applyAgentUpdate(
            {
              agentId,
              provider: pending.provider,
              model: pending.model,
              reasoningEffort: pending.reasoningEffort,
              providerAccountId: pending.providerAccountId ?? null,
            },
            undefined,
            "next-turn",
          );
          return true;
        }),
      )
      .pipe(
        Effect.catch((failure) =>
          Effect.gen({ self: this }, function* () {
            this.#parts.emitError("pending_runtime_switch_failed", failure, agentId);
            // A change that fails on an idle agent, such as a provider that is now off, would fail again
            // before each turn. The agent stays on its provider, and the header stops showing the change.
            if (this.#runtimeHandoverBusy(agentId)) return false;
            const cleared = yield* Effect.exit(this.#parts.store.updateAgent({ agentId, pendingRuntime: null }));
            if (Exit.isSuccess(cleared)) this.#parts.emit({ type: "agents-changed", agents: this.#parts.listAgents() });
            return false;
          }),
        ),
      );
  });

  /** Makes the move of `usageLimitMove`, if one is due. True when the agent moved. */
  readonly followUsageLimit = Effect.fn("ModelMoves.followUsageLimit")(function* (this: ModelMoves, agentId: string) {
    return yield* this.#parts.endpoints
      .runExclusive(() =>
        Effect.gen({ self: this }, function* () {
          const move = this.usageLimitMove(agentId);
          if (!move) return false;
          yield* this.#applyAgentUpdate(move.input, undefined, move.move);
          return true;
        }),
      )
      .pipe(
        Effect.catch((failure) =>
          Effect.sync(() => {
            this.#parts.emitError("usage_limit_switch_failed", failure, agentId);
            return false;
          }),
        ),
      );
  });
}
