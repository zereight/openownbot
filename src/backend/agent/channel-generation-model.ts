import { AGENT_REASONING_EFFORTS, type AgentModelOption } from "@robot/contracts/ipc";

/**
 * The model that answers the channel's own questions: which member takes a task, and what an old
 * stretch of the conversation said. They are mechanical, so they ask for the lowest effort the model
 * offers and not the lead's. At `max` a generation outruns the 120 seconds it may run, and a lead's
 * setting is meant for the lead's own turns.
 */
export function channelGenerationModel(model: AgentModelOption): AgentModelOption {
  const lowest = AGENT_REASONING_EFFORTS.find((effort) => model.supportedReasoningEfforts.includes(effort));
  return lowest ? { ...model, defaultReasoningEffort: lowest } : model;
}
