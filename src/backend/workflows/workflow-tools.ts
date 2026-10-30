/**
 * The `openownbot` tools that let an agent read and change the workflow that a chat is about. The
 * workflow comes from the first line of the user's own message, which the Workflows page writes; the
 * model never names one. Both tools answer only in a turn that a person on this computer started in
 * the agent's own chat. A request the model can correct is a tool failure it reads; other errors are
 * faults.
 */

import { INPUT_LIMITS } from "@openownbot/contracts/input-limits";
import {
  WORKFLOW_BRANCHES,
  WORKFLOW_MAX_COORDINATE,
  WORKFLOW_NODE_KINDS,
  WORKFLOW_PORT_TYPES,
  type WorkflowDetail,
} from "@openownbot/contracts/ipc";
import { parseWorkflowChatReference } from "@openownbot/contracts/workflow-chat-reference";
import { Effect } from "effect";
import { z } from "zod";
import { type OpenOwnBotToolResponse, openOwnBotToolFailure, openOwnBotToolResult } from "../agent/routine-tools";
import { ToolOperationFailed } from "../agent/tool-operation";
import type { TurnRequester } from "../agent/turn-requester";
import type { WorkflowEdit } from "./workflow-edits";
import { WorkflowStoreError } from "./workflow-store";
import type { WorkflowsHandle } from "./workflows";

export type WorkflowRunTools = Pick<WorkflowsHandle, "list" | "startRun" | "run">;
export type WorkflowTools = Pick<WorkflowsHandle, "get" | "edit"> & WorkflowRunTools;

/** The turn a workflow tool runs in. Read only when one runs: it reads the mailbox. */
export interface WorkflowToolTurn {
  requester: TurnRequester;
  /** The text of each delivery of the turn. The Workflows page puts the reference line first. */
  texts: readonly string[];
}

export interface WorkflowToolCaller {
  turnId: string;
  /** The agents an agent node may name: listed and not hidden. Read only when an edit names one. */
  agentIds: () => ReadonlySet<string>;
  turn: () => WorkflowToolTurn;
}

/** Enough for one request; a longer change goes in a second call against the new revision. */
const EDITS_PER_CALL = 50;

const identifier = z.string().min(1).max(INPUT_LIMITS.identifier);
const coordinate = z.number().finite().min(-WORKFLOW_MAX_COORDINATE).max(WORKFLOW_MAX_COORDINATE);
const point = z.object({ x: coordinate, y: coordinate }).strict();
const fieldValue = z.union([z.string().max(INPUT_LIMITS.workflowNodeText), z.number().finite(), z.boolean()]);
const editSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("add_node"),
      key: identifier,
      kind: z.enum(WORKFLOW_NODE_KINDS),
      fields: z.object({}).catchall(fieldValue),
      at: point.optional(),
      after: identifier.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("update_node"),
      node: identifier,
      fields: z.object({}).catchall(fieldValue.nullable()).optional(),
      at: point.optional(),
    })
    .strict(),
  z.object({ op: z.literal("remove_node"), node: identifier }).strict(),
  z
    .object({
      op: z.literal("connect"),
      from: identifier,
      to: identifier,
      type: z.enum(WORKFLOW_PORT_TYPES).optional(),
      branch: z.enum(WORKFLOW_BRANCHES).optional(),
    })
    .strict(),
  z.object({ op: z.literal("disconnect"), edge: identifier }).strict(),
]);
const readSchema = z.object({}).strict();
const runInput = z.object({ workflowId: identifier, fromNodeId: identifier.optional() }).strict();
const runLookupInput = z.object({ runId: identifier }).strict();
const editInput = z
  .object({ revision: z.number().int().nonnegative(), edits: z.array(editSchema).min(1).max(EDITS_PER_CALL) })
  .strict();

export const WORKFLOW_TOOL_DEFINITIONS = [
  {
    name: "read_workflow",
    description:
      "Read the workflow that this chat is about: its nodes with their number, fields and positions (the number is the one the canvas shows on the node, so use it when you tell the user which node you changed), its edges, its triggers, and the revision that edit_workflow must name. Only a chat opened from the workflow's own chat panel names a workflow.",
    shape: readSchema.shape,
  },
  {
    name: "edit_workflow",
    description:
      "Change the workflow that this chat is about with a batch of edits applied in order to the stored graph, against the revision you read. Ops: add_node (key names the node for later edits of this batch; kind; fields; at or after, else it goes right of the graph), update_node (fields merge, null removes a field; at moves it), remove_node (its edges go too), connect (from, to, type text|image|file, default text; branch yes|no from a condition), disconnect (edge id). Fields the host reads: trigger: trigger (manual only), timezone; agent: agentId (a listed agent), task, effort (low, medium, high, xhigh or max, for this step only; leave it out for the agent's own); llm: provider, model, effort, prompt, system; condition: rule; approval: question; output: target (notify or channel), for channel connectionId and placeId; prompt: text. A locked node keeps its place and stays. You cannot add, change or remove a schedule, webhook or message trigger, add or move an output to a messaging place, or add an output to a file.",
    shape: editInput.shape,
  },
  {
    name: "list_workflows",
    description:
      "List the workflows on this computer: each one's id, title, number of steps and last run. Use it to find the workflowId for run_workflow.",
    shape: readSchema.shape,
  },
  {
    name: "run_workflow",
    description:
      "Start a run of a workflow now, as the Run button of the Workflows page does: the whole workflow from its triggers, or, with fromNodeId, that node and what comes after it with the newest answers of the nodes before. The run goes on in the background; this returns its runId and status. A run can message people or change things elsewhere, so run only what the user asked for. Calling it again in the same turn with the same arguments starts no second run. Use get_workflow_run to see how the run ends.",
    shape: runInput.shape,
  },
  {
    name: "get_workflow_run",
    description:
      "Read a run that run_workflow started: its status, its error, and the status of each step that ran. The outputs of the steps are left out; they are in the Workflows page.",
    shape: runLookupInput.shape,
  },
] as const;

const NAMES = new Set<string>(WORKFLOW_TOOL_DEFINITIONS.map((tool) => tool.name));
const RUN_TOOL_NAMES = new Set(["list_workflows", "run_workflow", "get_workflow_run"]);

const PERSON_ONLY =
  "Only a person's message in your own chat on this computer can use the workflow tools. Ask the user to request it there.";
const NO_REFERENCE = "This chat is not about a workflow. Open the chat from the workflow's own chat panel.";
const MANY_REFERENCES = "The messages of this turn are about different workflows. Ask the user to send one at a time.";

/**
 * What the model reads of a workflow: no webhook address, strokes as a count. Each node carries its
 * number, its place in the node list from 1, which the canvas shows on the node.
 */
function modelView(detail: WorkflowDetail) {
  return {
    workflowId: detail.summary.id,
    title: detail.summary.title,
    revision: detail.revision,
    nodes: detail.graph.nodes.map((node, index) => ({ number: index + 1, ...node })),
    edges: detail.graph.edges,
    triggers: detail.triggers.map(({ nodeId, type, nextDueAt }) => ({ nodeId, type, nextDueAt })),
    strokes: detail.graph.strokes.length,
  };
}

function staleFailure(current: WorkflowDetail): OpenOwnBotToolResponse {
  return {
    success: false,
    contentItems: [
      {
        type: "inputText",
        text: JSON.stringify({
          error: `The workflow changed since you read it. It is now at revision ${current.revision}. Apply your edits to the workflow below and call edit_workflow again with revision ${current.revision}.`,
          current: modelView(current),
        }),
      },
    ],
  };
}

/** The workflow that every delivery of the turn names, or the failure the model reads. */
function referencedWorkflow(texts: readonly string[]): { workflowId: string } | { failure: OpenOwnBotToolResponse } {
  const ids = texts.map(parseWorkflowChatReference).filter((id) => id !== null);
  const [workflowId] = ids;
  if (workflowId === undefined) return { failure: openOwnBotToolFailure(NO_REFERENCE) };
  if (ids.some((id) => id !== workflowId)) return { failure: openOwnBotToolFailure(MANY_REFERENCES) };
  return { workflowId };
}

/** Each agent an edit names that the caller does not list. */
function unknownAgents(edits: readonly WorkflowEdit[], agentIds: ReadonlySet<string>): string[] {
  const named = edits.flatMap((edit) => {
    if (edit.op !== "add_node" && edit.op !== "update_node") return [];
    const agentId = edit.fields?.agentId;
    return typeof agentId === "string" && agentId.length > 0 ? [agentId] : [];
  });
  return [...new Set(named)].filter((agentId) => !agentIds.has(agentId));
}

/** A shape problem as one line the model can act on. */
function shapeFailure(error: z.ZodError): OpenOwnBotToolResponse {
  const issues = error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`);
  return openOwnBotToolFailure(`Invalid arguments. ${issues.join("; ")}.`);
}

export const handleWorkflowTool = Effect.fn("WorkflowTools.handle")(function* (
  tool: string,
  args: unknown,
  caller: WorkflowToolCaller,
  workflows: WorkflowTools | null,
) {
  if (!NAMES.has(tool)) return null;
  if (!workflows) return yield* new ToolOperationFailed({ cause: new Error("Workflows are unavailable.") });
  const turn = caller.turn();
  if (turn.requester.kind !== "host-person") return openOwnBotToolFailure(PERSON_ONLY);
  if (RUN_TOOL_NAMES.has(tool)) return yield* handleWorkflowRunTool(tool, args, caller.turnId, workflows);
  const reference = referencedWorkflow(turn.texts);
  if ("failure" in reference) return reference.failure;
  const { workflowId } = reference;
  const operation = Effect.gen(function* () {
    if (tool === "read_workflow") {
      const parsed = readSchema.safeParse(args ?? {});
      if (!parsed.success) return shapeFailure(parsed.error);
      return openOwnBotToolResult(modelView(yield* workflows.get(workflowId)));
    }
    const parsed = editInput.safeParse(args);
    if (!parsed.success) return shapeFailure(parsed.error);
    const edits: readonly WorkflowEdit[] = parsed.data.edits;
    const unknown = unknownAgents(edits, caller.agentIds());
    if (unknown.length > 0) return openOwnBotToolFailure(`Unknown agent: ${unknown.join(", ")}.`);
    const result = yield* workflows.edit({
      workflowId,
      revision: parsed.data.revision,
      edits,
      checkpointKey: caller.turnId,
    });
    switch (result.kind) {
      case "saved":
        return openOwnBotToolResult({
          changed: true,
          revision: result.revision,
          created: result.created,
          keptVersion: result.keptVersion,
          note: result.keptVersion
            ? "The graph from before your first change in this turn is in the workflow's version list. Tell the user."
            : "The graph from before this turn's first change is already in the version list.",
        });
      case "unchanged":
        return openOwnBotToolResult({ changed: false, revision: result.revision, note: "The edits changed nothing." });
      case "stale":
        return staleFailure(result.current);
      case "refused":
        return openOwnBotToolFailure(result.reason);
    }
  });
  return yield* operation.pipe(
    Effect.catchTag("WorkflowFailed", (failure) =>
      failure.cause instanceof WorkflowStoreError
        ? Effect.succeed(openOwnBotToolFailure(failure.cause.message))
        : Effect.fail(new ToolOperationFailed({ cause: failure.cause })),
    ),
  );
});

/**
 * The tools that start and follow runs. Unlike the editing tools they name the workflow themselves,
 * since an agent that is asked to run a workflow has to find it. The caller has checked that a person
 * started the turn. The request id is the turn with the workflow and the node, so the same call twice in
 * one turn starts one run.
 */
export const handleWorkflowRunTool = Effect.fn("WorkflowTools.handleRun")(function* (
  tool: string,
  args: unknown,
  turnId: string,
  workflows: WorkflowRunTools,
) {
  const operation = Effect.gen(function* () {
    if (tool === "list_workflows") {
      const parsed = readSchema.safeParse(args ?? {});
      if (!parsed.success) return shapeFailure(parsed.error);
      const list = yield* workflows.list();
      return openOwnBotToolResult({
        workflows: list.map(({ id, title, steps, lastRun }) => ({ id, title, steps, lastRun })),
      });
    }
    if (tool === "run_workflow") {
      const parsed = runInput.safeParse(args);
      if (!parsed.success) return shapeFailure(parsed.error);
      const { workflowId, fromNodeId } = parsed.data;
      const started = yield* workflows.startRun({
        workflowId,
        requestId: `agent:${turnId}:${workflowId}:${fromNodeId ?? ""}`,
        ...(fromNodeId === undefined ? {} : { fromNodeId }),
      });
      return openOwnBotToolResult({ runId: started.run.id, number: started.run.number, status: started.run.status });
    }
    const parsed = runLookupInput.safeParse(args);
    if (!parsed.success) return shapeFailure(parsed.error);
    const { run, steps } = yield* workflows.run(parsed.data.runId);
    return openOwnBotToolResult({
      runId: run.id,
      status: run.status,
      error: run.error,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      steps: steps.map(({ nodeId, attempt, status, error }) => ({ nodeId, attempt, status, error })),
    });
  });
  return yield* operation.pipe(
    Effect.catchTag("WorkflowFailed", (failure) =>
      failure.cause instanceof WorkflowStoreError
        ? Effect.succeed(openOwnBotToolFailure(failure.cause.message))
        : Effect.fail(new ToolOperationFailed({ cause: failure.cause })),
    ),
  );
});
