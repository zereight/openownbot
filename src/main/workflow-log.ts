import { join } from "node:path";
import { teeLogLines } from "@robot/logging";
import { Effect } from "effect";
import { appendRemoteDiagnosticLog } from "./remote-diagnostics";

/**
 * Keeps the lines that explain a failed workflow step in `<logs>/workflows/workflows.log`, with the
 * same size limit: the model that could not answer and why, and the start of an answer that was not
 * yes or no. Never the input of a step or a key.
 */
export function startWorkflowLog(logsDirectory: string): () => void {
  const directory = join(logsDirectory, "workflows");
  return teeLogLines(["workflows", "workflow-model"], (line) => {
    Effect.runFork(appendRemoteDiagnosticLog(directory, "workflows", `${line}\n`));
  });
}
