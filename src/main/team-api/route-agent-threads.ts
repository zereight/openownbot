import { agentThreadTitle } from "@robot/contracts/ipc";
import { AGENT_THREADS_CAPABILITY, AGENT_THREADS_ROUTES } from "@robot/contracts/team-protocol/agent-threads-v1";
import { sourceText } from "@robot/i18n/source";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { TeamApiAgentTasks } from "./dependencies";
import { HttpError } from "./http-error";
import type { RouteOutcome, TeamApiRequestContext } from "./request-context";
import { readJson, requireAgentLevel, requireListedAgent, stringField } from "./request-helpers";

/**
 * `agent-threads-v1`: rename and delete a side thread, by its `agent-tasks-v1` task id. The same member
 * who can send to the agent can use them, with the agent level of a task change. An agent that this
 * peer cannot see (`hiddenAgentIds`) answers as a missing agent does.
 */
export async function routeAgentThreads(
  context: TeamApiRequestContext,
  agents: TeamApiAgentTasks | undefined,
  hiddenAgentIds: ReadonlySet<string>,
): Promise<RouteOutcome> {
  const { method, url, capabilities, request, json } = context;
  if (method !== "POST" || !Object.values(AGENT_THREADS_ROUTES).some((path) => path === url.pathname))
    return "unmatched";
  if (!agents || !capabilities.has(AGENT_THREADS_CAPABILITY))
    throw new HttpError(400, sourceText("error.backend.threadRemoteUnsupported"));
  const body = await readJson(request);
  const agentId = stringField(body, "agentId");
  if (hiddenAgentIds.has(agentId)) throw new HttpError(404, sourceText("error.team.agentNotFound"));
  requireListedAgent(agents, agentId);
  requireAgentLevel(context, agentId, "chat");
  const taskId = stringField(body, "taskId");
  if (url.pathname === AGENT_THREADS_ROUTES.rename) {
    const title = agentThreadTitle(body.title);
    if (title === null) throw new HttpError(400, sourceText("error.backend.threadTitleRequired"));
    agents.tasks.rename({ agentId, taskId }, title);
  } else {
    await runCauseEffect(agents.tasks.delete({ agentId, taskId }));
  }
  return json(200, {});
}
