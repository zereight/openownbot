import { Effect } from "effect";
/**
 * Everything `OPENOWNBOT_DEV_REMOTE_ROLE` adds to startup: signing a throwaway account in against the
 * local account API and configuring the dev host. The `client` role signs in to the same account as
 * the `host` role, so it is a second device of one owner: the account directory lists the host for it,
 * as it does for a second computer of a user. None of it runs in a packaged build - `developmentRemoteRole`
 * is null unless the app is unpackaged and the variable is set to `host` or `client`.
 *
 * The two entry points below keep the positions they had in the construction sequence:
 * `applyDevelopmentRemoteAccount` must run after `teamStore.initialize()` and before `HostService`
 * is built, and `startDevelopmentRemoteRole` after `remoteServers.initialize()`. The client half
 * polls for thirty seconds and then throws, deliberately: a dev client with no remote server is a
 * failure worth seeing at startup rather than an empty window.
 */

import { rm } from "node:fs/promises";
import type { CentralAuthManager } from "./central-auth-manager";
import { developmentRemoteConnectionPath } from "./development-runtime-directory";
import type { HostService } from "./host-service";
import type { RemoteServerManager } from "./remote-server-manager";
import { RemoteWorkflowError, remoteCall, toRemoteWorkflowError } from "./remote-service-effects";
import { writeSetupState } from "./setup-store";
import type { TeamStore } from "./team-store";

export type DevelopmentRemoteRole = "host" | "client";

/** The account of both roles: the client is a second device of the host's owner. */
const DEVELOPMENT_ACCOUNT_EMAIL = "openownbot-dev-host@example.com";

export interface DevelopmentRemoteAccountOptions {
  role: DevelopmentRemoteRole;
  centralAuth: CentralAuthManager;
  teamStore: TeamStore;
  setupFile: string;
  setupCompleted: boolean;
}

export const applyDevelopmentRemoteAccount = Effect.fn("DevelopmentRemote.applyAccount")(function* ({
  role,
  centralAuth,
  teamStore,
  setupFile,
  setupCompleted,
}: DevelopmentRemoteAccountOptions) {
  const email = teamStore.getOwnerEmail() ?? DEVELOPMENT_ACCOUNT_EMAIL;
  const user = yield* ensureDevelopmentAccount(centralAuth, email);
  yield* teamStore.activateAccount(user);
  if (role === "host" && !teamStore.configured) {
    yield* teamStore.configureWithAccount("ROBot Local Dev Host", user);
  }
  if (role === "client" && !setupCompleted) {
    yield* writeSetupState(setupFile, { preferredProvider: "codex", preferredModel: null }).pipe(toRemoteWorkflowError);
  }
});

export interface DevelopmentRemoteRoleOptions {
  role: DevelopmentRemoteRole;
  host: HostService;
  remoteServers: RemoteServerManager;
}

export const startDevelopmentRemoteRole = Effect.fn("DevelopmentRemote.startRole")(function* ({
  role,
  host,
  remoteServers,
}: DevelopmentRemoteRoleOptions) {
  if (role === "host") {
    yield* remoteCall(() => rm(developmentRemoteConnectionPath(), { force: true }));
    const status = yield* host.start();
    if (status.phase !== "online") yield* host.startDevelopmentLocal();
    return;
  }
  yield* awaitDevelopmentRemoteServer(remoteServers);
});

const ensureDevelopmentAccount = Effect.fn("DevelopmentRemote.ensureAccount")(function* (
  manager: Pick<CentralAuthManager, "initialize" | "logout" | "requestEmailCode" | "verifyEmailCode">,
  email: string,
) {
  const initialized = yield* manager.initialize().pipe(toRemoteWorkflowError);
  if (initialized.status === "signed_in" && initialized.user.email === email) return initialized.user;
  if (initialized.status === "signed_in") yield* manager.logout().pipe(toRemoteWorkflowError);
  let challenge = yield* manager.requestEmailCode(email).pipe(toRemoteWorkflowError);
  if (
    challenge.status === "error" &&
    challenge.issue.code === "code_recently_sent" &&
    challenge.issue.retryAfterSeconds !== undefined &&
    challenge.issue.retryAfterSeconds > 0 &&
    challenge.issue.retryAfterSeconds <= 60
  ) {
    yield* Effect.sleep(challenge.issue.retryAfterSeconds * 1000);
    challenge = yield* manager.requestEmailCode(email).pipe(toRemoteWorkflowError);
  }
  if (challenge.status === "error")
    return yield* new RemoteWorkflowError({ cause: new Error(challenge.issue.message) });
  if (challenge.status !== "code_sent" || !challenge.developmentCode)
    return yield* new RemoteWorkflowError({
      cause: new Error("The local account API did not return a development sign-in code."),
    });
  const verified = yield* manager
    .verifyEmailCode(challenge.challengeId, challenge.developmentCode)
    .pipe(toRemoteWorkflowError);
  if (verified.status === "error") return yield* new RemoteWorkflowError({ cause: new Error(verified.issue.message) });
  if (verified.status !== "signed_in")
    return yield* new RemoteWorkflowError({ cause: new Error("The local development account could not sign in.") });
  return verified.user;
});

/** The account directory lists the host for this device once both roles are signed in to one account. */
const awaitDevelopmentRemoteServer = Effect.fn("DevelopmentRemote.await")(function* (manager: RemoteServerManager) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (manager.list().some((server) => server.kind === "remote")) return;
    yield* Effect.sleep(250);
  }
  return yield* new RemoteWorkflowError({ cause: new Error("The local development host did not start.") });
});
