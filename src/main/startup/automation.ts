import { Effect } from "effect";
import type { AgentService } from "../../backend/agent-service";
import type { AgentStore } from "../../backend/agent-store";
import type { MailboxStore } from "../../backend/mailbox-store";
import type { createAgentDefaultsPreferenceStore } from "../agents/agent-defaults-preference-store";
import { AutomationServer } from "../agents/automation-server";
import type { ApplicationServiceContext } from "./application-service-types";
import { TEARDOWN_ORDER } from "./teardown-order";

/** The local automation server. */
export function startAutomation({
  agentDefaults,
  mailbox,
  service,
  store,
  teardown,
  turnAnswer,
}: {
  agentDefaults: ReturnType<typeof createAgentDefaultsPreferenceStore>;
  mailbox: MailboxStore;
  service: AgentService;
  store: AgentStore;
  teardown: ApplicationServiceContext["teardown"];
  turnAnswer: (agentId: string, turnId: string) => string | null;
}) {
  // Listens only while an agent allows local scripts; see `AutomationServer`.
  const automation = new AutomationServer({
    root: store.automationRoot,
    listAgents: () => service.listAgents(),
    agentDefaults: () => agentDefaults.get(),
    listModels: () => service.listModels(),
    listRoutines: (agentId) => service.routines.list(agentId),
    runRoutine: (input) => service.runRoutineFromAutomation(input),
    sendMessage: (input) => service.sendMessage(input),
    getLocalAttention: (agentId) => service.getLocalAttention(agentId),
    respondToLocalAttention: (agentId, input) => service.respondToLocalAttention(agentId, input),
    delivery: (deliveryId) => mailbox.getDelivery(deliveryId)?.delivery ?? null,
    turnAnswer,
    updateAgent: (input) => service.updateAgent(input),
    clearAgentContext: (agentId) => service.clearAgentContext(agentId),
  });
  service.on("event", (event) => {
    if (event.type === "agents-changed") Effect.runFork(automation.requestSync());
  });
  teardown.push(TEARDOWN_ORDER.automation, "the automation server", () => Effect.runPromise(automation.stop()));
  return { automation };
}
