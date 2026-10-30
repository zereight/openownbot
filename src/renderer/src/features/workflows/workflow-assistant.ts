import { graphAgentIds } from "@robot/contracts/ipc";
import { workflowChatReference } from "@robot/contracts/workflow-chat-reference";
import type { AgentProfile } from "@robot/ui/data";
import { createMemo, createSignal, untrack } from "solid-js";
import { desktopAgentChatPort } from "../../agent-chat-port";
import { createCanvasAssistant } from "../../canvas-assistant";
import { readAgentSelection, writeAgentSelection } from "../agents/agent-selection";
import type { createWorkflowsController } from "./workflows-controller";

/** The agent last picked in the workflow chat for each server, kept apart from the chat agent. */
const WORKFLOW_CHAT_AGENT_KEY = "openownbot:workflow-chat-agent:v1";

/**
 * The chat over the open workflow. A message goes into the picked agent's own conversation, under a
 * first line that names the workflow; the backend reads that line to know which workflow the agent
 * edits. The panel shows only what the user typed.
 *
 * `agents` are the agents that can take a message. `disabled` stops the chat: no request goes out
 * and none is read.
 */
export function createWorkflowAssistant(options: {
  serverId: string;
  workflows: Pick<ReturnType<typeof createWorkflowsController>, "detail" | "settled">;
  agents: () => AgentProfile[];
  disabled: () => boolean;
}) {
  const { serverId, workflows } = options;
  const [picked, setPicked] = createSignal(readAgentSelection(WORKFLOW_CHAT_AGENT_KEY)[serverId] ?? "");
  const isListed = (id: string) => options.agents().some((agent) => agent.id === id);

  /** The open workflow. The memo changes only when another workflow opens, not on each read of it. */
  const workflowId = createMemo(() => workflows.detail()?.summary.id ?? null);
  /**
   * The agents that the steps of the workflow name, read when the workflow opens. An edit of the graph,
   * also one by the agent, does not change who answers: that would drop the exchange in the panel.
   */
  const named = createMemo(() => {
    const id = workflowId();
    const detail = untrack(workflows.detail);
    return id === null || !detail ? [] : graphAgentIds(detail.graph);
  });

  /** The agent picked last, else the first agent that a step of the workflow named, else the first agent. */
  const agentId = createMemo(() => {
    if (isListed(picked())) return picked();
    return named().find(isListed) ?? options.agents()[0]?.id ?? null;
  });

  const assistant = createCanvasAssistant(() => desktopAgentChatPort(serverId), agentId, {
    // The exchange in the panel is about one workflow: another one opens with an empty panel. The
    // conversation of the agent keeps the whole history.
    scope: workflowId,
    // The save of the edits that wait goes first, so the agent reads the graph the user sees.
    prepare: workflows.settled,
    compose: (typed) => {
      const detail = workflows.detail();
      return detail ? `${workflowChatReference(detail.summary.id, detail.summary.title)}\n\n${typed}` : typed;
    },
  });

  return {
    agentId,
    agent: createMemo(() => options.agents().find((agent) => agent.id === agentId())),
    choose: (id: string) => {
      writeAgentSelection(WORKFLOW_CHAT_AGENT_KEY, serverId, id);
      setPicked(id);
    },
    messages: assistant.messages,
    working: assistant.working,
    send: (text: string) => {
      if (!options.disabled()) assistant.send(text);
    },
  };
}
