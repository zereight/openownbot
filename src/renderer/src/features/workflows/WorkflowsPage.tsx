import { WORKFLOWS_CAPABILITY } from "@robot/contracts/team-protocol/workflows-v1";
import { DiagramChatAgentPicker, DiagramChatPanel } from "@robot/ui/features/diagrams/DiagramChatPanel";
import { WorkflowCanvas } from "@robot/ui/features/workflows/WorkflowCanvas";
import {
  WORKFLOW_FEATURES_V1,
  type WorkflowCatalogs,
  type WorkflowFeatures,
} from "@robot/ui/features/workflows/workflow-model";
import { useText } from "@robot/ui/text";
import { createMemo, createSignal, Show, untrack } from "solid-js";
import { useNavigation } from "../../navigation";
import { useAuth } from "../account/account-context";
import { useAgents } from "../agents/agents-context";
import { serverRoleCanAdminister, serverSupportsCapability } from "../servers/server-capabilities";
import { useServers } from "../servers/servers-context";
import { createWorkflowAssistant } from "./workflow-assistant";
import { createWorkflowsController } from "./workflows-controller";
import { desktopWorkflowHost, type WorkflowHost } from "./workflows-port";

/**
 * The workflows of one server on a page that covers the agent list. A joined server whose ROBot
 * does not serve `workflows-v1` shows a notice.
 */
export function WorkflowsPage(props: { serverId: string }) {
  const { t } = useText();
  const { servers } = useServers();
  const server = () => servers().find((entry) => entry.id === props.serverId);
  const supported = () => {
    const entry = server();
    return !entry || entry.kind === "local" || serverSupportsCapability(entry, WORKFLOWS_CAPABILITY);
  };
  /** A joined server that has not answered the compatibility check yet is not an older host. */
  const checking = () => {
    const entry = server();
    return entry?.kind === "remote" && !entry.compatibility?.hostAppVersion;
  };
  return (
    <Show
      when={supported() ? props.serverId : null}
      keyed
      fallback={
        <main class="window-page diagram-view diagram-flows-notice">
          <Show when={!checking()}>
            <p>{t("error.workflow.serverTooOld")}</p>
          </Show>
        </main>
      }
    >
      {(serverId) => (
        <WorkflowsCanvas
          serverId={serverId}
          host={desktopWorkflowHost(serverId, server)}
          admin={serverRoleCanAdminister(server())}
          remote={server()?.kind === "remote"}
        />
      )}
    </Show>
  );
}

/**
 * `admin`: an owner or admin of the server, who may make a webhook secret. The host checks it again.
 * `remote`: a joined server, whose agents the workflow chat does not reach.
 */
function WorkflowsCanvas(props: { serverId: string; host: WorkflowHost; admin: boolean; remote: boolean }) {
  const { agentList, modelOptions } = useAgents();
  const { signedInAccount } = useAuth();
  // The keyed parent mounts a new canvas for each server, so the host does not change.
  const workflows = createWorkflowsController(untrack(() => props.host));
  const catalogs: WorkflowCatalogs = {
    get agents() {
      return agentList();
    },
    get models() {
      return modelOptions();
    },
    get places() {
      return workflows.places();
    },
    imageModels: [],
    files: [],
    get self() {
      return signedInAccount()?.name ?? undefined;
    },
  };
  // A channel output needs a messaging place. Without one, a new output posts a notification.
  const features = createMemo<WorkflowFeatures>(() =>
    workflows.places().length > 0
      ? WORKFLOW_FEATURES_V1
      : { ...WORKFLOW_FEATURES_V1, outputs: WORKFLOW_FEATURES_V1.outputs.filter((output) => output !== "channel") },
  );
  // The canvas is a direct child of the window page, which gives it the height of the pane. The chat
  // is its sibling, not inside it: a key pressed in the chat is not a key pressed on the canvas.
  return (
    <Show when={workflows.detail()}>
      {(workflow) => (
        <>
          <WorkflowCanvas
            workflow={workflow()}
            features={features()}
            catalogs={catalogs}
            frame="window"
            readOnly={workflows.readOnly()}
            {...workflows.props}
            onRotateWebhookSecret={props.admin ? workflows.props.onRotateWebhookSecret : undefined}
          />
          <WorkflowChat serverId={props.serverId} workflows={workflows} remote={props.remote} />
        </>
      )}
    </Show>
  );
}

/**
 * The chat over the open workflow. It stays on screen, disabled with its reason, when the workflow is
 * read-only or the server is a joined one, and then it sends nothing.
 */
function WorkflowChat(props: {
  serverId: string;
  workflows: ReturnType<typeof createWorkflowsController>;
  remote: boolean;
}) {
  const { t } = useText();
  const { agentList, userHiddenAgentIds } = useAgents();
  const { selectAgent } = useNavigation();
  const [open, setOpen] = createSignal(false);
  const unavailable = createMemo(() => {
    if (props.remote) return t("workflow.chat.remote");
    const reason = props.workflows.lock();
    return reason ? t(reason) : undefined;
  });
  const agents = createMemo(() => agentList().filter((agent) => !userHiddenAgentIds().has(agent.id)));
  const assistant = createWorkflowAssistant({
    serverId: untrack(() => props.serverId),
    workflows: props.workflows,
    agents,
    disabled: () => unavailable() !== undefined,
  });
  return (
    <Show when={assistant.agent()}>
      {(agent) => (
        <div class="diagram-view-chat" data-placement="end">
          <DiagramChatPanel
            agent={agent()}
            copy={{
              label: t("workflow.chat.label"),
              title: t("workflow.chat.title", { name: agent().name }),
              empty: t("workflow.chat.empty", { name: agent().name }),
              placeholder: t("workflow.chat.placeholder"),
              show: t("workflow.chat.show"),
              working: t("workflow.chat.working", { name: agent().name }),
            }}
            agentPicker={
              <DiagramChatAgentPicker
                agents={agents()}
                value={agent().id}
                disabled={assistant.working()}
                onChange={assistant.choose}
              />
            }
            messages={assistant.messages()}
            working={assistant.working()}
            open={open()}
            onOpenChange={setOpen}
            onSend={assistant.send}
            onOpenConversation={() => selectAgent(agent().id)}
            onOpenLink={(url) => void window.openownbot.openUrl(url)}
            unavailable={unavailable()}
          />
        </div>
      )}
    </Show>
  );
}
