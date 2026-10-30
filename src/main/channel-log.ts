import { join } from "node:path";
import { teeLogLines } from "@robot/logging";
import { Effect } from "effect";
import { appendRemoteDiagnosticLog } from "./remote-diagnostics";

/**
 * Keeps the channel decision lines in `<logs>/channels/channels.log`, with the same size limit: which
 * backend answered a request, whether it chose a member and why not. Never the request or a key.
 */
export function startChannelLog(logsDirectory: string): () => void {
  const directory = join(logsDirectory, "channels");
  return teeLogLines(["channel-decision"], (line) => {
    Effect.runFork(appendRemoteDiagnosticLog(directory, "channels", `${line}\n`));
  });
}
