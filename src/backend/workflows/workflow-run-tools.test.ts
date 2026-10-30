import type { StartWorkflowRunInput, WorkflowRunDetail, WorkflowSummary } from "@robot/contracts/ipc";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { handleWorkflowRunTool, handleWorkflowTool, type WorkflowRunTools } from "./workflow-tools";

const summary: WorkflowSummary = {
  id: "wf-1",
  title: "Daily report",
  steps: 3,
  updatedAt: "2026-10-29T00:00:00Z",
  lastRun: null,
};
const run = {
  id: "run-1",
  workflowId: "wf-1",
  number: 4,
  triggerNodeId: null,
  source: "manual",
  status: "running",
  error: null,
  startedAt: "2026-10-29T00:00:00Z",
  endedAt: null,
} as const;
const detail: WorkflowRunDetail = {
  run,
  steps: [
    {
      id: "s1",
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "n1",
      attempt: 1,
      agentId: null,
      status: "done",
      output: "big output",
      branch: null,
      error: null,
      startedAt: null,
      endedAt: null,
    },
  ],
};

function setup() {
  const started: StartWorkflowRunInput[] = [];
  const workflows: WorkflowRunTools = {
    list: () => Effect.succeed([summary]),
    startRun: (input) => {
      started.push(input);
      return Effect.succeed(detail);
    },
    run: () => Effect.succeed(detail),
  };
  const call = (tool: string, args: unknown) =>
    Effect.runPromise(handleWorkflowRunTool(tool, args, "turn-1", workflows));
  const text = (response: Awaited<ReturnType<typeof call>>) => {
    const item = response.contentItems[0];
    return item && "text" in item ? item.text : "";
  };
  return { started, call, text };
}

describe("workflow run tools", () => {
  it("lists the workflows with the ids that run_workflow needs", async () => {
    const { call, text } = setup();
    const response = await call("list_workflows", {});
    expect(response.success).toBe(true);
    expect(text(response)).toContain('"id":"wf-1"');
    expect(text(response)).toContain("Daily report");
  });

  it("starts a run and answers its id and status without the step outputs", async () => {
    const { call, text, started } = setup();
    const response = await call("run_workflow", { workflowId: "wf-1", fromNodeId: "n2" });
    expect(response.success).toBe(true);
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ workflowId: "wf-1", fromNodeId: "n2" });
    expect(text(response)).toContain("run-1");
    expect(text(response)).toContain("running");
    expect(text(response)).not.toContain("big output");
  });

  it("names the same request each time in one turn, so a repeated call starts one run", async () => {
    const { call, started } = setup();
    await call("run_workflow", { workflowId: "wf-1" });
    await call("run_workflow", { workflowId: "wf-1" });
    expect(started[0]?.requestId).toBe(started[1]?.requestId);
  });

  it("reads the state of a run: status and the steps, without their outputs", async () => {
    const { call, text } = setup();
    const response = await call("get_workflow_run", { runId: "run-1" });
    expect(response.success).toBe(true);
    expect(text(response)).toContain('"status":"running"');
    expect(text(response)).toContain('"nodeId":"n1"');
    expect(text(response)).not.toContain("big output");
  });

  it("answers a failure the model can read for arguments of the wrong shape", async () => {
    const { call, started } = setup();
    const response = await call("run_workflow", {});
    expect(response.success).toBe(false);
    expect(started).toHaveLength(0);
  });

  it("leaves the run tools to a person: an agent or a routine turn is refused before anything starts", async () => {
    const started: StartWorkflowRunInput[] = [];
    const workflows = {
      get: () => Effect.never,
      edit: () => Effect.never,
      list: () => Effect.never,
      run: () => Effect.never,
      startRun: (input: StartWorkflowRunInput) => {
        started.push(input);
        return Effect.succeed(detail);
      },
    };
    const caller = (kind: "host-person" | "none") => ({
      turnId: "turn-1",
      agentIds: () => new Set<string>(),
      turn: () => ({ requester: { kind }, texts: [] }),
    });
    const run = (kind: "host-person" | "none") =>
      Effect.runPromise(handleWorkflowTool("run_workflow", { workflowId: "wf-1" }, caller(kind), workflows));
    expect((await run("none"))?.success).toBe(false);
    expect(started).toHaveLength(0);
    expect((await run("host-person"))?.success).toBe(true);
    expect(started).toHaveLength(1);
  });
});
