import type {
  AgentTask,
  AgentTaskInput,
  AgentTasksSnapshot,
  ConversationMessageSender,
  ConversationSnapshot,
  ForkAgentThreadInput,
  RunQueuedMessageAsTaskInput,
  StartAgentTaskInput,
} from "@robot/contracts/ipc";
import { sourceText } from "@robot/i18n/source";
import { Effect } from "effect";
import type { AgentService, AgentServiceParts } from "../agent-service";
import { AgentLifecycleFailed, lifecycleStep } from "./agent-lifecycle-failed";

/** How long a close waits for the provider to end the turn that it stopped. After it, the close is refused. */
const TASK_STOP_WAIT_MS = 15_000;

interface TaskOperationsSteps {
  /** The service's own send, so a task's first message is queued and delivered as any other. */
  sendMessage: AgentService["sendMessage"];
  cancelQueued(agentId: string, deliveryId: string): Effect.Effect<void, AgentLifecycleFailed>;
}

/**
 * The tasks of each agent: side threads that run beside its own chat. A task starts with a message,
 * or from a fork or a queued message, and it stops, closes, opens again and is deleted here.
 */
export class TaskOperations {
  readonly #parts: AgentServiceParts;
  readonly #steps: TaskOperationsSteps;

  constructor(parts: AgentServiceParts, steps: TaskOperationsSteps) {
    this.#parts = parts;
    this.#steps = steps;
  }

  #sendMessage(...args: Parameters<TaskOperationsSteps["sendMessage"]>) {
    return this.#steps.sendMessage(...args);
  }

  #cancelQueued(agentId: string, deliveryId: string) {
    return this.#steps.cancelQueued(agentId, deliveryId);
  }

  #requireNotHidden(agentId: string): void {
    if (this.#parts.store.isHidden(agentId)) throw new Error(sourceText("error.backend.recipientHidden"));
  }

  list(agentId: string): AgentTasksSnapshot {
    return this.#parts.tasks.snapshot(agentId);
  }

  /** The conversation of one task, for its panel. */
  read(agentId: string, taskId: string): ConversationSnapshot {
    return structuredClone(this.#parts.tasks.read(agentId, taskId));
  }

  /** Starts a task of the agent with its first message. The task runs beside the agent's own chat. */
  readonly start = Effect.fn("TaskOperations.start")(function* (
    this: TaskOperations,
    input: StartAgentTaskInput,
    sender?: ConversationMessageSender,
    timezone?: string,
  ): Effect.fn.Return<AgentTask, AgentLifecycleFailed> {
    const task = yield* lifecycleStep("start task", () => {
      if (!this.#parts.listAgents().some((agent) => agent.id === input.agentId))
        throw new Error(sourceText("error.agent.unknown", { id: input.agentId }));
      this.#requireNotHidden(input.agentId);
      return this.#parts.tasks.create(input.agentId, input.text, "user");
    });
    this.#parts.tasks.changed(task.agentId);
    yield* this.#sendMessage(
      {
        agentId: task.agentId,
        taskId: task.taskId,
        text: input.text,
        ...(input.attachmentDraftIds ? { attachmentDraftIds: input.attachmentDraftIds } : {}),
        ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
      },
      sender,
      timezone,
    ).pipe(
      // A task without its first message is no use: it goes, and the user can send again.
      Effect.tapError(() =>
        Effect.sync(() => {
          this.#parts.tasks.discard(task);
          this.#parts.tasks.changed(task.agentId);
        }),
      ),
    );
    return this.#parts.tasks.publicTask(task);
  }).bind(this);

  /** Forks a conversation of the agent at one message into a new task. Nothing is sent: the first message of the fork starts its session. */
  readonly fork = Effect.fn("TaskOperations.fork")(function* (
    this: TaskOperations,
    input: ForkAgentThreadInput,
  ): Effect.fn.Return<AgentTask, AgentLifecycleFailed> {
    const task = yield* lifecycleStep("fork thread", () => {
      const agent = this.#parts.listAgents().find((candidate) => candidate.id === input.agentId);
      if (!agent) throw new Error(sourceText("error.agent.unknown", { id: input.agentId }));
      this.#requireNotHidden(input.agentId);
      const sourceThreadId =
        input.taskId === null ? agent.threadId : this.#parts.tasks.require(input.agentId, input.taskId).threadId;
      if (!sourceThreadId) throw new Error(sourceText("error.backend.threadNotFound"));
      return this.#parts.tasks.fork(input.agentId, sourceThreadId, input.messageId);
    });
    return this.#parts.tasks.publicTask(task);
  }).bind(this);

  /** Moves a message that waits in the agent's own queue into a new task, so it starts beside the chat. */
  readonly runQueuedMessage = Effect.fn("TaskOperations.runQueuedMessage")(function* (
    this: TaskOperations,
    input: RunQueuedMessageAsTaskInput,
  ): Effect.fn.Return<AgentTask, AgentLifecycleFailed> {
    const context = yield* lifecycleStep("find queued message", () => {
      if (this.#parts.channels.store.assignmentForDelivery(input.deliveryId))
        throw new Error(sourceText("error.backend.useChannelTaskControls"));
      const found = this.#parts.mailbox.getDelivery(input.deliveryId);
      if (!found || found.delivery.recipientAgentId !== input.agentId || found.delivery.status !== "queued")
        throw new Error(sourceText("error.backend.queuedMessageUnavailable"));
      return found;
    });
    const task = yield* lifecycleStep("create task", () =>
      this.#parts.tasks.create(input.agentId, context.delivery.text, "user"),
    );
    yield* this.#parts.mailbox.moveToTask(input.agentId, input.deliveryId, task.taskId).pipe(
      Effect.mapError(
        (failure) => new AgentLifecycleFailed({ operation: "move queued message", cause: failure.cause }),
      ),
      Effect.tapError(() => Effect.sync(() => this.#parts.tasks.discard(task))),
    );
    // The message leaves the agent's own chat, where it showed as queued.
    const agent = this.#parts.store.list().find((candidate) => candidate.id === input.agentId);
    if (agent) {
      const snapshot = this.#parts.conversation.ensureSnapshot(agent.id, agent.threadId);
      snapshot.messages = snapshot.messages.filter((message) => message.id !== input.deliveryId);
      this.#parts.conversation.emitConversation(snapshot, "queue.message-moved-to-task", {
        deliveryId: input.deliveryId,
      });
    }
    this.#parts.mailboxSync.emitQueue(input.agentId);
    this.#parts.tasks.changed(input.agentId);
    this.#parts.drain.scheduleDrain(input.agentId);
    return this.#parts.tasks.publicTask(task);
  }).bind(this);

  /** A teammate's answer that waits in a closing thread goes to the agent's own chat, so it is not cancelled. */
  #returnTaskAnswers(task: { agentId: string; taskId: string }): Effect.Effect<void, AgentLifecycleFailed> {
    return this.#parts.mailbox.returnTaskAnswers(task.agentId, task.taskId).pipe(
      Effect.mapError((failure) => new AgentLifecycleFailed({ operation: "return answers", cause: failure.cause })),
      Effect.flatMap((moved) =>
        moved === 0
          ? Effect.void
          : Effect.sync(() => {
              this.#parts.mailboxSync.emitQueue(task.agentId);
              this.#parts.drain.scheduleDrain(task.agentId);
            }),
      ),
    );
  }

  /** Stops the task's running turn and cancels its queued messages, except teammates' answers. The task stays open. */
  readonly stop = Effect.fn("TaskOperations.stop")(function* (
    this: TaskOperations,
    input: AgentTaskInput,
  ): Effect.fn.Return<void, AgentLifecycleFailed> {
    const task = yield* lifecycleStep("find task", () => this.#parts.tasks.require(input.agentId, input.taskId));
    yield* this.#parts.drain.endPlanContinuation(task.agentId, task.taskId);
    // A teammate's answer stays in the open thread, so it runs with the other answers to the same request.
    for (const message of this.#parts.mailbox.queuedTaskMessages(task.agentId, task.taskId, { teammateAnswers: false }))
      yield* this.#cancelQueued(task.agentId, message.deliveryId);
    const turnId = this.#parts.conversation.loadedExecutionSnapshot(task.threadId)?.activeTurnId;
    if (turnId) {
      this.#parts.tasks.markStopped(task.taskId, turnId);
      yield* this.#parts.interruptTurn(task.agentId, turnId, task.threadId);
    }
    this.#parts.tasks.changed(task.agentId);
  }).bind(this);

  /** Stops the task and closes it. A closed task takes no message until it opens again. */
  readonly close = Effect.fn("TaskOperations.close")(function* (
    this: TaskOperations,
    input: AgentTaskInput,
  ): Effect.fn.Return<void, AgentLifecycleFailed> {
    // The provider ends a stopped turn a moment later, so the close waits for that end, for a time.
    const running = yield* lifecycleStep("find task", () => {
      const found = this.#parts.tasks.require(input.agentId, input.taskId);
      return this.#parts.conversation.loadedExecutionSnapshot(found.threadId)?.activeTurnId
        ? this.#parts.tasks.turnEnd(found.taskId)
        : null;
    });
    // Answers move out before the Stop, so none starts in the thread, and again after the wait.
    yield* this.#returnTaskAnswers(input);
    yield* this.stop(input);
    if (running) yield* running.pipe(Effect.timeoutOption(TASK_STOP_WAIT_MS));
    yield* this.#returnTaskAnswers(input);
    const task = yield* lifecycleStep("find task", () => {
      const found = this.#parts.tasks.require(input.agentId, input.taskId);
      // A turn that starts or ends after the Stop still counts toward the limits of its open task.
      if (this.#parts.mailbox.taskBusy(found.agentId, found.taskId))
        throw new Error(sourceText("error.backend.threadStillRunning"));
      return found;
    });
    this.#parts.tasks.close(task);
    yield* this.#parts.memoryReview.threadClosed(task.agentId, task.threadId);
    // A task lane that waited for a free task can start now.
    this.#parts.drain.scheduleDrain(task.agentId);
  }).bind(this);

  reopen(input: AgentTaskInput): void {
    this.#parts.tasks.reopen(this.#parts.tasks.require(input.agentId, input.taskId));
    this.#parts.drain.scheduleDrain(input.agentId);
  }

  rename(input: AgentTaskInput, title: string): void {
    this.#parts.tasks.rename(this.#parts.tasks.require(input.agentId, input.taskId), title);
  }

  /**
   * Deletes the task's thread with its conversation and mailbox messages. It cancels the queued messages
   * first; a running turn must be stopped first, so a delete never ends work that the person did not
   * stop. The thread is archived before the first await, so no send or drain starts new work in it while
   * the provider sessions close. A delete that fails after that leaves the thread archived, and it can
   * open again.
   */
  readonly delete = Effect.fn("TaskOperations.delete")(function* (
    this: TaskOperations,
    input: AgentTaskInput,
  ): Effect.fn.Return<void, AgentLifecycleFailed> {
    const { task, wasOpen } = yield* lifecycleStep("archive task", () => {
      const found = this.#parts.tasks.require(input.agentId, input.taskId);
      if (this.#parts.conversation.loadedExecutionSnapshot(found.threadId)?.activeTurnId)
        throw new Error(sourceText("error.backend.threadStillRunning"));
      const wasOpen = found.closedAt === null;
      if (wasOpen) this.#parts.tasks.close(found);
      return { task: found, wasOpen };
    });
    // A deleted thread is not reviewed: the person discarded it.
    yield* this.#parts.memoryReview.forgetThread(task.agentId, task.threadId);
    yield* this.#returnTaskAnswers(task);
    for (const message of this.#parts.mailbox.queuedTaskMessages(task.agentId, task.taskId))
      yield* this.#cancelQueued(task.agentId, message.deliveryId);
    yield* lifecycleStep("check task", () => {
      if (!this.#parts.mailbox.taskBusy(task.agentId, task.taskId)) return;
      // A turn that started before the archive runs on, so the thread stays as the person left it.
      if (wasOpen) this.#parts.tasks.reopen(task);
      throw new Error(sourceText("error.backend.threadStillRunning"));
    });
    // The person's messages and their files go with the thread. A message between the agent and another
    // agent stays in the other agent's history: a request from the thread and a teammate's answer to it.
    yield* this.#parts.mailbox
      .deleteTaskMessages(task.agentId, task.taskId)
      .pipe(Effect.mapError(({ cause }) => new AgentLifecycleFailed({ operation: "delete task messages", cause })));
    // The provider sessions close only now: a thread that a failed step keeps resumes its own session
    // when it opens again. A turn that started meanwhile keeps the thread, also with its session.
    yield* lifecycleStep("check task", () => {
      if (this.#parts.mailbox.taskBusy(task.agentId, task.taskId))
        throw new Error(sourceText("error.backend.threadStillRunning"));
    });
    yield* this.#parts.forgetExecutionThread(task.threadId);
    yield* lifecycleStep("delete task", () => {
      if (this.#parts.mailbox.taskBusy(task.agentId, task.taskId))
        throw new Error(sourceText("error.backend.threadStillRunning"));
      this.#parts.tasks.delete(task);
    });
    this.#parts.drain.scheduleDrain(task.agentId);
  }).bind(this);
}
