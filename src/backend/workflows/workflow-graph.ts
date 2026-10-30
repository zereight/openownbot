/**
 * The fields of a workflow node that the host reads without the database, what a trigger node is
 * planned on, and where an output posts. The port rules of a graph are the contract's
 * (`workflowGraphProblem`), so the mobile editor checks a graph as the host does; they are
 * re-exported here for the callers that read them from this module. The shape and the limits of a
 * graph are the contract's (`isWorkflowGraph`); the byte limit of its JSON is `workflowGraphFits`.
 */

import { INPUT_LIMITS } from "@robot/contracts/input-limits";
import {
  WORKFLOW_TRIGGER_TYPES,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowTriggerType,
} from "@robot/contracts/ipc";
import { isOneOf } from "@robot/contracts/runtime-values";

export { type WorkflowGraphProblem, workflowGraphProblem } from "@robot/contracts/ipc";

/** What a trigger node is planned on. The store writes a row from these values and plans it again when one changes. */
export interface WorkflowTriggerPlan {
  type: WorkflowTriggerType;
  /** The schedule as the store keeps it, for a schedule trigger. */
  scheduleJson: string | null;
  timezone: string | null;
}

/** The plan of a trigger node, or null for another kind or a trigger type this app does not know. */
export function triggerPlan(node: WorkflowNode): WorkflowTriggerPlan | null {
  if (node.kind !== "trigger") return null;
  const type = node.fields.trigger ?? "manual";
  if (!isOneOf(WORKFLOW_TRIGGER_TYPES, type)) return null;
  return {
    type,
    scheduleJson: type === "schedule" && node.schedule ? JSON.stringify(node.schedule) : null,
    timezone: nodeTimezone(node),
  };
}

/**
 * What makes a node start runs on its own, or null for a manual trigger and any other node. Two
 * nodes with the same signature start runs the same way, so a change of it arms or disarms the
 * workflow. A `message` trigger counts: the contract allows it, and a run cannot refuse it later.
 */
export function triggerSignature(node: WorkflowNode): string | null {
  const plan = triggerPlan(node);
  if (plan === null || plan.type === "manual") return null;
  return JSON.stringify([plan.type, plan.scheduleJson, plan.timezone]);
}

/** The messaging place of each output node that posts to one, by node. */
export function placeOutputs(graph: WorkflowGraph): Map<string, string> {
  const places = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.kind !== "output" || node.fields.target !== "channel") continue;
    places.set(node.id, JSON.stringify([node.fields.connectionId ?? null, node.fields.placeId ?? null]));
  }
  return places;
}

/** Whether the JSON of the graph fits `INPUT_LIMITS.workflowGraphBytes`: the one byte limit of a saved graph. */
export function workflowGraphFits(graph: WorkflowGraph): boolean {
  return Buffer.byteLength(JSON.stringify(graph)) <= INPUT_LIMITS.workflowGraphBytes;
}

/** The zone that a trigger node names, or null when it names none. */
export function nodeTimezone(node: WorkflowNode): string | null {
  const timezone = node.fields.timezone;
  return typeof timezone === "string" && timezone.length > 0 ? timezone : null;
}
