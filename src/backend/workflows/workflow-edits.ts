/**
 * How an agent changes a workflow graph: a batch of edits applied in order to the stored graph, and
 * the diff that says whether the result arms the workflow. Both are pure. A batch never carries the
 * whole graph, so the strokes, the view-state fields, the node order and the ids of nodes it does not
 * name stay as they are. The store checks the graph-wide rules (ports, branches, annotations) once for
 * every writer.
 */

import { INPUT_LIMITS } from "@robot/contracts/input-limits";
import {
  AGENT_REASONING_EFFORTS,
  isReasoningEffort,
  isWorkflowNode,
  WORKFLOW_MAX_COORDINATE,
  type WorkflowBranch,
  type WorkflowEdge,
  type WorkflowFields,
  type WorkflowFieldValue,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeKind,
  type WorkflowPoint,
  type WorkflowPortType,
} from "@robot/contracts/ipc";
import { placeOutputs, triggerSignature } from "./workflow-graph";

/**
 * A node that an edit names: the id of a node of the graph, or the key of a node that an earlier
 * edit of the same batch adds. Keys and ids share one namespace inside a batch.
 */
export type WorkflowNodeRef = string;

/** One change to a workflow graph, as an agent describes it. */
export type WorkflowEdit =
  | {
      op: "add_node";
      key: string;
      kind: WorkflowNodeKind;
      /** Every field the node starts with. The canvas defaults live in the renderer, so there are none here. */
      fields: WorkflowFields;
      /** The top-left corner. Without it the node goes right of `after`, or right of the whole graph. */
      at?: WorkflowPoint | undefined;
      after?: WorkflowNodeRef | undefined;
    }
  | {
      op: "update_node";
      node: WorkflowNodeRef;
      /** Merged into the node's fields. `null` removes a field. A field not named stays. */
      fields?: Readonly<Record<string, WorkflowFieldValue | null>> | undefined;
      at?: WorkflowPoint | undefined;
    }
  | { op: "remove_node"; node: WorkflowNodeRef }
  | {
      op: "connect";
      from: WorkflowNodeRef;
      to: WorkflowNodeRef;
      /** The port type; `text` when absent. */
      type?: WorkflowPortType | undefined;
      branch?: WorkflowBranch | undefined;
    }
  | { op: "disconnect"; edge: string };

/** A batch that applied: the new graph and the id of each added node, by its key. */
export interface AppliedWorkflowEdits {
  ok: true;
  graph: WorkflowGraph;
  created: Readonly<Record<string, string>>;
}

/** A batch that did not apply: for the model, the edit and what is wrong with it. */
export interface RefusedWorkflowEdits {
  ok: false;
  reason: string;
}

/** A new node goes this far right of the node it follows, as the canvas spaces nodes. */
const NODE_GAP = 360;

/**
 * Applies a batch to a graph. New nodes are appended, on top of the stack as the canvas adds them,
 * with the id `${kind}-${newId()}`, the canvas's own format; new edges get `newId()`. A locked node
 * keeps its place and stays: an edit changes its fields only. An edit cannot set a size, a lock or a
 * schedule. Refused, with the index of the edit: an unknown node, key or edge, a key in use, a node
 * past the contract's limits, an output to a file (no run can take it), a second edge with the same
 * ends, port type and branch, and a graph past the node or edge count.
 */
export function applyWorkflowEdits(
  graph: WorkflowGraph,
  edits: readonly WorkflowEdit[],
  newId: () => string,
): AppliedWorkflowEdits | RefusedWorkflowEdits {
  const nodes: WorkflowNode[] = graph.nodes.map((node) => ({ ...node, fields: { ...node.fields } }));
  let edges: WorkflowEdge[] = graph.edges.map((edge) => ({ ...edge }));
  const refs = new Map<WorkflowNodeRef, string>(nodes.map((node) => [node.id, node.id]));
  const created: Record<string, string> = {};
  const refuse = (index: number, op: WorkflowEdit["op"], what: string): RefusedWorkflowEdits => ({
    ok: false,
    reason: `Edit ${index + 1} (${op}): ${what}`,
  });
  const positionOf = (ref: WorkflowNodeRef) => {
    const id = refs.get(ref);
    return id === undefined ? -1 : nodes.findIndex((node) => node.id === id);
  };

  for (const [index, edit] of edits.entries()) {
    switch (edit.op) {
      case "add_node": {
        if (refs.has(edit.key))
          return refuse(index, edit.op, `"${edit.key}" is already a node id or a key of this batch.`);
        if (nodes.length >= INPUT_LIMITS.workflowNodes)
          return refuse(
            index,
            edit.op,
            `the workflow already has ${INPUT_LIMITS.workflowNodes} nodes, the most it can hold.`,
          );
        const anchor = edit.after === undefined ? -1 : positionOf(edit.after);
        if (edit.after !== undefined && anchor < 0)
          return refuse(index, edit.op, `no node "${edit.after}" to place it after.`);
        const node: WorkflowNode = {
          id: `${edit.kind}-${newId()}`,
          kind: edit.kind,
          at: edit.at ?? placement(nodes, anchor < 0 ? undefined : nodes[anchor]),
          fields: { ...edit.fields },
        };
        const problem = effortProblem(node.kind, edit.fields.effort) ?? nodeProblem(node);
        if (problem) return refuse(index, edit.op, problem);
        nodes.push(node);
        refs.set(edit.key, node.id);
        created[edit.key] = node.id;
        break;
      }
      case "update_node": {
        const position = positionOf(edit.node);
        const node = nodes[position];
        if (!node) return refuse(index, edit.op, `no node "${edit.node}".`);
        if (edit.at && node.locked) return refuse(index, edit.op, `node "${node.id}" is locked and cannot be moved.`);
        const fields = { ...node.fields };
        for (const [name, value] of Object.entries(edit.fields ?? {})) {
          if (value === null) delete fields[name];
          else fields[name] = value;
        }
        const next: WorkflowNode = { ...node, fields, ...(edit.at ? { at: edit.at } : {}) };
        const problem = effortProblem(node.kind, edit.fields?.effort) ?? nodeProblem(next);
        if (problem) return refuse(index, edit.op, problem);
        nodes[position] = next;
        break;
      }
      case "remove_node": {
        const position = positionOf(edit.node);
        const node = nodes[position];
        if (!node) return refuse(index, edit.op, `no node "${edit.node}".`);
        if (node.locked) return refuse(index, edit.op, `node "${node.id}" is locked and cannot be removed.`);
        nodes.splice(position, 1);
        edges = edges.filter((edge) => edge.from !== node.id && edge.to !== node.id);
        for (const [ref, id] of refs) if (id === node.id) refs.delete(ref);
        break;
      }
      case "connect": {
        const from = refs.get(edit.from);
        const to = refs.get(edit.to);
        if (from === undefined) return refuse(index, edit.op, `no node "${edit.from}".`);
        if (to === undefined) return refuse(index, edit.op, `no node "${edit.to}".`);
        if (edges.length >= INPUT_LIMITS.workflowEdges)
          return refuse(
            index,
            edit.op,
            `the workflow already has ${INPUT_LIMITS.workflowEdges} edges, the most it can hold.`,
          );
        const type = edit.type ?? "text";
        const same = edges.find(
          (edge) => edge.from === from && edge.to === to && edge.type === type && edge.branch === edit.branch,
        );
        if (same)
          return refuse(index, edit.op, `edge "${same.id}" already joins these nodes with this port type and branch.`);
        edges.push({ id: newId(), from, to, type, ...(edit.branch === undefined ? {} : { branch: edit.branch }) });
        break;
      }
      case "disconnect": {
        const position = edges.findIndex((edge) => edge.id === edit.edge);
        if (position < 0) return refuse(index, edit.op, `no edge "${edit.edge}".`);
        edges.splice(position, 1);
        break;
      }
    }
  }
  return { ok: true, graph: { nodes, edges, strokes: graph.strokes }, created };
}

/** Right of `after`, else right of the rightmost node at the height of the first one, else the origin. */
function placement(nodes: readonly WorkflowNode[], after: WorkflowNode | undefined): WorkflowPoint {
  if (after) return { x: after.at.x + NODE_GAP, y: after.at.y };
  const first = nodes[0];
  if (!first) return { x: 0, y: 0 };
  const right = Math.max(...nodes.map((node) => node.at.x));
  return { x: right + NODE_GAP, y: first.at.y };
}

/**
 * Why the effort that an edit sets cannot run on an agent step, or null. Only the edit that sets it is
 * checked, so a node that already holds another value does not stop an unrelated edit. A node of any
 * other kind keeps whatever it is given, as before.
 */
function effortProblem(kind: WorkflowNodeKind, effort: WorkflowFieldValue | null | undefined): string | null {
  if (kind !== "agent" || effort === undefined || effort === null || isReasoningEffort(effort)) return null;
  return `an agent step takes an effort of ${AGENT_REASONING_EFFORTS.join(", ")}, not ${JSON.stringify(effort)}. Set it to null to use the agent's own effort.`;
}

/** Why a node an edit produced cannot be stored, or null. The limits are the contract's. */
function nodeProblem(node: WorkflowNode): string | null {
  if (node.kind === "output" && node.fields.target === "file")
    return 'an output with target "file" cannot run. Use "notify" for an output the user reads.';
  if (!isWorkflowNode(node))
    return `the node is not valid: at most ${INPUT_LIMITS.workflowNodeFields} fields, field names up to 64 characters, texts up to ${INPUT_LIMITS.workflowNodeText} characters, and coordinates within ${WORKFLOW_MAX_COORDINATE}.`;
  return null;
}

/** What an edit may not change: what starts a run on its own, or posts outside this computer. */
export type WorkflowArmingChange = { kind: "trigger"; nodeId: string } | { kind: "channel-output"; nodeId: string };

/**
 * The arming changes between two graphs. A diff, not a list of forbidden operations, so an
 * `update_node` that flips `fields.trigger` and a `remove_node` of a webhook trigger are both found.
 * A trigger counts by `triggerSignature`; a manual trigger is free. An output to a messaging place
 * counts when it is added or moved to another place, as the Team API's admin rule counts it; its
 * removal is free.
 */
export function armingChanges(before: WorkflowGraph, after: WorkflowGraph): WorkflowArmingChange[] {
  const changes: WorkflowArmingChange[] = [];
  const was = new Map(before.nodes.map((node) => [node.id, triggerSignature(node)]));
  const is = new Map(after.nodes.map((node) => [node.id, triggerSignature(node)]));
  for (const nodeId of new Set([...was.keys(), ...is.keys()]))
    if ((was.get(nodeId) ?? null) !== (is.get(nodeId) ?? null)) changes.push({ kind: "trigger", nodeId });
  const places = placeOutputs(before);
  for (const [nodeId, place] of placeOutputs(after))
    if (places.get(nodeId) !== place) changes.push({ kind: "channel-output", nodeId });
  return changes;
}

/** The sentence the model reads when a batch arms the workflow. */
export function armingReason(changes: readonly WorkflowArmingChange[]): string {
  const triggers = changes.filter((change) => change.kind === "trigger").map((change) => change.nodeId);
  const outputs = changes.filter((change) => change.kind === "channel-output").map((change) => change.nodeId);
  const parts = [
    ...(triggers.length > 0
      ? [`add, change or remove a schedule, webhook or message trigger (${triggers.join(", ")})`]
      : []),
    ...(outputs.length > 0 ? [`add or move an output that posts to a messaging place (${outputs.join(", ")})`] : []),
  ];
  return `You cannot ${parts.join(", or ")}. Tell the user to change it on the canvas.`;
}

/** Whether two graphs hold the same nodes, edges and strokes, whatever the order of their keys. */
export function sameWorkflowGraph(a: WorkflowGraph, b: WorkflowGraph): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null)
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
