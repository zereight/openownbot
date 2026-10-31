import { sourceText } from "@robot/i18n/source";
import { Effect } from "effect";
import { AgentRoutineStore } from "../../backend/agent-routine-store";
import type { AgentService } from "../../backend/agent-service";
import type { AgentStore } from "../../backend/agent-store";
import type { MailboxStore } from "../../backend/mailbox-store";
import { routineFlowRoutines } from "../../backend/routine-flows/routine-flow-routines";
import { RoutineFlowStore } from "../../backend/routine-flows/routine-flow-store";
import { createRoutineFlows } from "../../backend/routine-flows/routine-flows";
import { WorkflowRunStore } from "../../backend/workflows/workflow-run-store";
import { WorkflowStore } from "../../backend/workflows/workflow-store";
import { workflowScheduleDueAt } from "../../backend/workflows/workflow-triggers";
import { createWorkflows } from "../../backend/workflows/workflows";
import type { ServerTimezonePreferenceStore } from "../server-timezone-preference-store";
import type { ApplicationServiceContext } from "./application-service-types";
import { TEARDOWN_ORDER } from "./teardown-order";

/** The routine flows and workflows. */
export async function startFlows({
  forwardWorkflowNotice,
  mailbox,
  serverTimezone,
  service,
  store,
  teardown,
  turnAnswer,
}: {
  forwardWorkflowNotice: ApplicationServiceContext["forwardWorkflowNotice"];
  mailbox: MailboxStore;
  serverTimezone: ServerTimezonePreferenceStore;
  service: AgentService;
  store: AgentStore;
  teardown: ApplicationServiceContext["teardown"];
  turnAnswer: (agentId: string, turnId: string) => string | null;
}) {
  // An agent routine's answer handed on from agent to agent; see `routine-flows.ts`.
  const routineFlowRuntime = await Effect.runPromise(
    createRoutineFlows({
      store: new RoutineFlowStore({ database: store.database }),
      routines: routineFlowRoutines(new AgentRoutineStore(store.database)),
      delivery: (deliveryId) => {
        const found = mailbox.getDelivery(deliveryId)?.delivery;
        return found ? { status: found.status, turnId: found.turnId, error: found.error } : null;
      },
      turnAnswer,
      agentName: (agentId) => store.list().find((agent) => agent.id === agentId)?.name ?? agentId,
      sendHandoff: (input) => service.enqueueRoutineHandoff(input),
      // An agent event, so this window, joined clients and the web app hear it the same way.
      changed: (agentIds) => {
        for (const agentId of agentIds) service.notifyRoutineFlowsChanged(agentId);
      },
    }),
  );
  teardown.push(TEARDOWN_ORDER.routineFlows, "the routine flows", () => Effect.runPromise(routineFlowRuntime.close()));
  // Graphs of steps drawn on a canvas; see `workflows.ts`.
  const workflowStore = new WorkflowStore({
    database: store.database,
    nextDueAt: workflowScheduleDueAt(() => serverTimezone.effective()),
  });
  const workflowRuntime = await Effect.runPromise(
    createWorkflows({
      store: workflowStore,
      runs: new WorkflowRunStore({ database: store.database }),
      delivery: (deliveryId) => {
        const found = mailbox.getDelivery(deliveryId)?.delivery;
        return found ? { status: found.status, turnId: found.turnId, error: found.error } : null;
      },
      turnAnswer,
      // A workflow step is a routine handoff whose routine is the workflow.
      sendHandoff: (input) => service.enqueueRoutineHandoff(input),
      stopDelivery: (agentId, deliveryId) => {
        const found = mailbox.getDelivery(deliveryId)?.delivery;
        if (!found) return Effect.void;
        return found.status === "running" && found.turnId
          ? service.interrupt(agentId, found.turnId)
          : service.queue.cancel(agentId, deliveryId);
      },
      generateText: (request) =>
        service.generateWorkflowText(request).pipe(
          Effect.mapError((failure) => ({
            message: failure.cause instanceof Error ? failure.cause.message : sourceText("error.workflow.modelFailed"),
          })),
        ),
      notify: forwardWorkflowNotice,
      connectionOn: (connectionId) => service.messaging.store.connection(connectionId)?.enabled === true,
      post: (connectionId, placeId, markdown) => service.messaging.deliver(connectionId, placeId, markdown),
      // An agent event, so this window, joined clients and the web app hear it the same way.
      changed: (workflowId) => service.notifyWorkflowsChanged(workflowId),
      rearm: () => service.routineTimer.arm(),
      timezone: () => serverTimezone.effective(),
      runEnded: (end) => service.notifyWorkflowRunEnded(end),
    }),
  );
  return { routineFlowRuntime, workflowRuntime, workflowStore };
}

export type StartedFlows = Awaited<ReturnType<typeof startFlows>>;
