import { join } from "node:path";
import { app } from "electron";
import { runCauseEffect } from "../../backend/effect-boundary";
import { managedBitwardenCli } from "../bitwarden-cli-installer";
import { BitwardenConnectorService } from "../bitwarden-connector-service";
import { BitwardenConnectorStore } from "../bitwarden-connector-store";
import type { readCentralAuthApiUrl } from "../central-auth-manager";
import { githubAppConfig } from "../github-connector-config";
import { GitHubConnectorService } from "../github-connector-service";
import { GitHubConnectorStore } from "../github-connector-store";
import { runtimeTarget } from "../provider-runtime-manager";
import type { ApplicationServiceContext } from "./application-service-types";
import { BITWARDEN_CONNECTOR_FILE, GITHUB_CONNECTOR_FILE } from "./data-files";
import type { safeStorageCipher } from "./platform";
import { TEARDOWN_ORDER } from "./teardown-order";

/** The GitHub sign-in of this computer. */
export async function startGitHubConnector({
  centralAuthApiUrl,
  openLink,
  secretCipher,
  teardown,
}: {
  centralAuthApiUrl: ReturnType<typeof readCentralAuthApiUrl>;
  openLink: (url: string) => Promise<void>;
  secretCipher: ReturnType<typeof safeStorageCipher>;
  teardown: ApplicationServiceContext["teardown"];
}) {
  /*
   * The built-in GitHub connection. Loaded before the agent service, because the first spawn reads
   * its MCP server and its `gh` and `git` files. An unreadable file is logged by the service and
   * treated as no sign-in.
   */
  const githubConnector = new GitHubConnectorService({
    app: githubAppConfig(),
    store: new GitHubConnectorStore(join(app.getPath("userData"), GITHUB_CONNECTOR_FILE), secretCipher),
    toolDirectory: join(app.getPath("userData"), "provider-state", "github"),
    apiUrl: centralAuthApiUrl,
    openExternal: openLink,
  });
  await runCauseEffect(githubConnector.load());
  teardown.push(TEARDOWN_ORDER.githubConnector, "the GitHub connection", () =>
    runCauseEffect(githubConnector.dispose()),
  );
  return { githubConnector };
}

/** The Bitwarden connection of this host. */
export async function startBitwardenConnector({
  secretCipher,
  teardown,
}: {
  secretCipher: ReturnType<typeof safeStorageCipher>;
  teardown: ApplicationServiceContext["teardown"];
}) {
  /*
   * The Bitwarden connection. A host connection's API key and master password are stored, so the
   * host unlocks again after a restart; its CLI data and ROBot's copy of `bw` stay outside every
   * root an agent can write.
   */
  const bitwardenCliTarget = runtimeTarget(process.platform, process.arch);
  const bitwardenConnector = new BitwardenConnectorService({
    host: {
      store: new BitwardenConnectorStore(join(app.getPath("userData"), BITWARDEN_CONNECTOR_FILE), secretCipher),
      dataDirectory: join(app.getPath("userData"), "provider-state", "bitwarden-host"),
      installCli: bitwardenCliTarget
        ? (signal) =>
            managedBitwardenCli({
              directory: join(app.getPath("userData"), "provider-state", "bitwarden-cli"),
              target: bitwardenCliTarget,
              signal,
            })
        : null,
    },
  });
  await runCauseEffect(bitwardenConnector.load());
  teardown.push(TEARDOWN_ORDER.bitwardenConnector, "the Bitwarden connection", async () => {
    await runCauseEffect(bitwardenConnector.dispose());
  });
  return { bitwardenConnector };
}
