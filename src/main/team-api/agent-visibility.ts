import type { TeamProtocolV1JsonObject, TeamProtocolV1JsonValue } from "@robot/contracts/team-protocol/v1";

/**
 * Removes the named agents from a response or an event: the agents that the Team API codec cannot
 * describe. A view never changes the host's stored agents.
 */
export function hiddenAgentView(value: unknown, hiddenIds: ReadonlySet<string>): TeamProtocolV1JsonValue {
  const json: TeamProtocolV1JsonValue = JSON.parse(JSON.stringify(value));
  return hiddenIds.size === 0 ? json : project(json, hiddenIds);
}

function project(value: TeamProtocolV1JsonValue, hiddenIds: ReadonlySet<string>, key = ""): TeamProtocolV1JsonValue {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if ((key === "agentOrder" || key === "agentIds") && typeof item === "string" && hiddenIds.has(item)) return [];
      const visible = project(item, hiddenIds);
      return visible === null && item !== null ? [] : [visible];
    });
  }
  if (value === null || typeof value !== "object") return value;
  if (
    (typeof value.id === "string" && hiddenIds.has(value.id)) ||
    // Sender and reaction identities name the agent but describe nothing of it, so they stay.
    (value.kind !== "agent" && typeof value.agentId === "string" && hiddenIds.has(value.agentId))
  )
    return null;
  const result: TeamProtocolV1JsonObject = {};
  for (const [field, child] of Object.entries(value)) {
    if ((key === "agentAssignments" || key === "agents") && hiddenIds.has(field)) continue;
    // A channel led by a hidden agent stays visible without a lead: the channel codec refuses a lead
    // that is not one of the members, and the hidden member is gone from the list.
    const visible =
      (field === "typingAgentId" || field === "leadAgentId") && typeof child === "string" && hiddenIds.has(child)
        ? null
        : project(child, hiddenIds, field);
    if (visible === null && child !== null && ["snapshot", "page", "approval", "request"].includes(field)) return null;
    result[field] = visible;
  }
  return result;
}
