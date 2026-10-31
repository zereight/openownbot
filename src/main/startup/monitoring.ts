import { join } from "node:path";

import { Effect } from "effect";
import { app } from "electron";
import type { AgentService } from "../../backend/agent-service";
import type { BrowserHost } from "../../backend/browser-host";
import { ResourceMonitor } from "../resource-monitor";
import type { StatementTimings } from "../resource-summary";
import { TraceFile } from "../trace-file";
import type { ApplicationServiceContext } from "./application-service-types";
import { TEARDOWN_ORDER } from "./teardown-order";

/** The trace file and the resource monitor. */
export function startMonitoring({
  browser,
  hostedServer,
  serverModeEnvironment,
  service,
  statementTimings,
  teardown,
}: {
  browser: BrowserHost;
  hostedServer: ApplicationServiceContext["hostedServer"];
  serverModeEnvironment: ApplicationServiceContext["serverMode"];
  service: AgentService;
  statementTimings: StatementTimings;
  teardown: ApplicationServiceContext["teardown"];
}) {
  const trace = new TraceFile({ directory: join(app.getPath("userData"), "logs") });
  teardown.push(TEARDOWN_ORDER.trace, "the trace file", () => Effect.runPromise(trace.close()));
  const resourceMonitor = new ResourceMonitor({
    userDataPath: app.getPath("userData"),
    server: hostedServer !== null || serverModeEnvironment !== null,
    trace,
    statementTimings,
    tabProcessIds: () => browser.tabProcessIds(),
  });
  teardown.push(TEARDOWN_ORDER.resourceMonitor, "the resource monitor", () =>
    Effect.runPromise(resourceMonitor.close()),
  );
  service.on("event", (event) => resourceMonitor.observeAgentEvent(event));
  resourceMonitor.start();
  return { resourceMonitor, trace };
}
