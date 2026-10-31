import { Effect } from "effect";
import type { FastComputerUseHost } from "../../backend/agent/fast-computer-use";
import type { DecisionBackend, DecisionFetch } from "../../backend/channel-decision";
import { runFastComputerUse } from "../../backend/computer-use-fast";
import { CuaDriverToolClient } from "./cua-driver-tool-client";

/**
 * Runs the fast path of Computer Use on this computer's driver daemon.
 *
 * Each run opens its own lease on the daemon and ends it when the run ends, so a run that is
 * interrupted or fails leaves no session behind to be read as an agent that holds the desktop.
 */
export function createFastComputerUseHost(options: {
  /** The backend that the user allowed for Computer Use, or null. */
  backend: () => DecisionBackend | null;
  /** The daemon's socket while it runs and holds its grants, otherwise null. */
  socketPath: () => string | null;
  fetch: DecisionFetch;
}): FastComputerUseHost {
  return {
    service: () => options.backend()?.kind ?? null,
    run: (request) => {
      const client = new CuaDriverToolClient(options.socketPath);
      return runFastComputerUse(
        {
          goal: request.goal,
          pid: request.pid,
          windowId: request.windowId,
          text: request.text ?? null,
          backend: options.backend(),
        },
        { driver: client.call, fetch: options.fetch },
      ).pipe(Effect.ensuring(client.close));
    },
  };
}
