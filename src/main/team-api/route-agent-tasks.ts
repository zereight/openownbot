import { INPUT_LIMITS } from "@robot/contracts/input-limits";
import type { TeamMemberSummary } from "@robot/contracts/ipc";
import { type DynamicRecord, isString } from "@robot/contracts/runtime-values";
import { AGENT_TASKS_CAPABILITY, AGENT_TASKS_ROUTES } from "@robot/contracts/team-protocol/agent-tasks-v1";
import { sourceText } from "@robot/i18n/source";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { TeamApiAgentTasks } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import {
  conversationSnapshotForCapabilities,
  memberSender,
  readJson,
  requireAgentLevel,
  requireListedAgent,
  stringField,
} from "./request-helpers";

/**
 * `agent-tasks-v1`: the tasks of one agent. A member who can send a message to the agent can use them,
 * so no role is checked, as for `POST /v1/agents/:id/messages`. The member is the sender of a start and
 * of a message. An agent that this peer cannot see (`hiddenAgentIds`) answers as a missing agent does.
 */
export async function routeAgentTasks(
  context: TeamApiRequestContext,
  agents: TeamApiAgentTasks | undefined,
  hiddenAgentIds: ReadonlySet<string>,
): Promise<RouteOutcome> {
  const { method, url, capabilities, request, json, member } = context;
  if (method !== "POST" || !Object.values(AGENT_TASKS_ROUTES).some((path) => path === url.pathname)) return "unmatched";
  if (!agents || !capabilities.has(AGENT_TASKS_CAPABILITY))
    throw new HttpError(400, sourceText("error.backend.threadRemoteUnsupported"));
  const body = await readJson(request);
  const agentId = stringField(body, "agentId");
  if (hiddenAgentIds.has(agentId)) throw new HttpError(404, sourceText("error.team.agentNotFound"));
  requireListedAgent(agents, agentId);
  if (url.pathname === AGENT_TASKS_ROUTES.list) return json(200, agents.tasks.list(agentId));
  if (url.pathname !== AGENT_TASKS_ROUTES.read) requireAgentLevel(context, agentId, "chat");
  if (url.pathname === AGENT_TASKS_ROUTES.start) return json(200, await startTask(agents, agentId, body, member));
  const taskId = stringField(body, "taskId");
  switch (url.pathname) {
    case AGENT_TASKS_ROUTES.read:
      return json(200, conversationSnapshotForCapabilities(agents.tasks.read(agentId, taskId), capabilities));
    case AGENT_TASKS_ROUTES.send:
      return json(
        202,
        await runCauseEffect(
          agents.sendMessage(
            {
              agentId,
              taskId,
              text: stringField(body, "text", false, INPUT_LIMITS.messageText),
              ...clientMessageId(body),
            },
            memberSender(member),
          ),
        ),
      );
    case AGENT_TASKS_ROUTES.stop:
      await runCauseEffect(agents.tasks.stop({ agentId, taskId }));
      return json(200, {});
    case AGENT_TASKS_ROUTES.close:
      await runCauseEffect(agents.tasks.close({ agentId, taskId }));
      return json(200, {});
    case AGENT_TASKS_ROUTES.reopen:
      agents.tasks.reopen({ agentId, taskId });
      return json(200, {});
  }
  return "unmatched";
}

function startTask(agents: TeamApiAgentTasks, agentId: string, body: DynamicRecord, member: TeamMemberSummary) {
  return runCauseEffect(
    agents.tasks.start(
      { agentId, text: stringField(body, "text", false, INPUT_LIMITS.messageText), ...clientMessageId(body) },
      memberSender(member),
    ),
  );
}

/** The frozen codec has already checked that it is an identifier. */
function clientMessageId(body: DynamicRecord): { clientMessageId?: string } {
  return isString(body.clientMessageId) ? { clientMessageId: body.clientMessageId } : {};
}
