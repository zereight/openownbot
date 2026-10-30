import { join } from "node:path";
import { teeLogLines } from "@robot/logging";
import { Effect } from "effect";
import { appendRemoteDiagnosticLog } from "./remote-diagnostics";

/**
 * Keeps the lines that explain a browser warning or a stopped browser operation in
 * `<logs>/browser/browser.log`, with the same size limit: a tool call of an agent that failed, a stop
 * request and what it did, and the warnings of the browser host and the live view. A line names the
 * tab, never its address. An error text passes the shared redaction and stops at 200 characters.
 */
export function startBrowserLog(logsDirectory: string): () => void {
  const directory = join(logsDirectory, "browser");
  return teeLogLines(["browser-host", "browser-view"], (line) => {
    Effect.runFork(appendRemoteDiagnosticLog(directory, "browser", `${line}\n`));
  });
}
