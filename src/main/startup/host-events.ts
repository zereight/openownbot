import { Effect } from "effect";
import type { AgentService } from "../../backend/agent-service";
import type { CentralAuthManager } from "../account/central-auth-manager";
import { HostEventsRuntime } from "../events/host-events-runtime";
import { HostEventsService } from "../events/host-events-service";
import { WebhookRelay } from "../events/webhook-relay";
import type { SignalIngress } from "../messaging/signal-ingress";
import type { TeamStore } from "../team/team-store";
import type { ApplicationServiceContext } from "./application-service-types";
import type { StartedFlows } from "./flows";
import type { safeStorageCipher } from "./platform";
import { TEARDOWN_ORDER } from "./teardown-order";

/** The host event service and its webhook relay. */
export function startHostEvents({
  centralAuth,
  secretCipher,
  service,
  signalIngress,
  teamStore,
  teardown,
  workflowRuntime,
}: {
  centralAuth: CentralAuthManager;
  secretCipher: ReturnType<typeof safeStorageCipher>;
  service: AgentService;
  signalIngress: SignalIngress;
  teamStore: TeamStore;
  teardown: ApplicationServiceContext["teardown"];
  workflowRuntime: StartedFlows["workflowRuntime"];
}) {
  const webhookRelay = new WebhookRelay({
    account: centralAuth,
    ingress: signalIngress,
    hostId: () => teamStore.getIdentity()?.serverId ?? null,
  });
  const events = new HostEventsService({
    routines: service.routineRecords,
    workflows: {
      receive: (delivery) => workflowRuntime.receiveWebhook(delivery),
      changed: (workflowId) => service.notifyWorkflowsChanged(workflowId),
    },
    cipher: secretCipher,
    relay: webhookRelay,
    accountPrincipal: () => {
      const state = centralAuth.getState();
      return state.status === "signed_in" ? state.user.id : null;
    },
  });
  const eventsRuntime = new HostEventsRuntime(events);
  signalIngress.handleWebhooks((input) => events.receive(input));
  teardown.push(TEARDOWN_ORDER.hostEvents, "the event service", async () => {
    webhookRelay.stop();
    await Effect.runPromise(eventsRuntime.stop());
  });
  return { events, eventsRuntime };
}
