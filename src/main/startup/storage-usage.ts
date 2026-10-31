import { join } from "node:path";
import { Effect } from "effect";
import { app } from "electron";
import type { AgentService } from "../../backend/agent-service";
import type { AgentStore } from "../../backend/agent-store";
import type { MailboxStore } from "../../backend/mailbox-store";
import { StorageUsageScanner, StorageUsageService } from "../../backend/storage-usage";
import { providerRuntimeRoot } from "../provider-runtime-manager";
import type { ApplicationServiceContext } from "./application-service-types";
import { TEARDOWN_ORDER } from "./teardown-order";

/** The storage usage scans of Settings > Storage. */
export function startStorageUsage({
  mailbox,
  service,
  store,
  teardown,
}: {
  mailbox: MailboxStore;
  service: AgentService;
  store: AgentStore;
  teardown: ApplicationServiceContext["teardown"];
}) {
  const userData = app.getPath("userData");
  const storageSources = {
    roots: {
      database: store.database.path,
      downloads: store.downloadsRoot,
      caches: ["remote-attachments", "remote-shared-files", "remote-workspace-files"].map((name) =>
        join(userData, name),
      ),
      logs: [
        join(userData, "logs", "remote"),
        join(userData, "logs", "update"),
        join(userData, "logs", "providers"),
        join(userData, "logs", "agents"),
        join(userData, "logs", "main"),
      ],
      runtimes: providerRuntimeRoot({
        appData: app.getPath("appData"),
        userDataOverride: app.commandLine.getSwitchValue("user-data-dir"),
      }),
      data: userData,
    },
    database: () => store.database.connection,
    mailbox,
    agents: () => service.listAgents(),
  };
  const storageUsage = new StorageUsageService(new StorageUsageScanner(storageSources), storageSources);
  teardown.push(TEARDOWN_ORDER.storageUsage, "storage scans", () => Effect.runPromise(storageUsage.dispose()));
  // A deleted or renamed agent changes every scope, so no surface keeps its old answer.
  service.on("event", (event) => {
    if (event.type === "agents-changed") storageUsage.invalidate();
  });
  return { storageUsage };
}
