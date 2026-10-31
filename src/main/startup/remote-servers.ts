import { join } from "node:path";

import { Effect } from "effect";
import { app } from "electron";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { CentralAuthManager } from "../central-auth-manager";
import type { HostedServerDesktopService } from "../hosted-server-service";
import { RemoteConnectTrace } from "../remote-connect-trace";
import { RemoteServerManager } from "../remote-server-manager";
import type { RemoteSessionCache } from "../remote-session-cache";
import type { TeamStore } from "../team-store";
import type { TeamWebRtcBridge } from "../team-webrtc-bridge";
import { TeamWebRtcClientTransport } from "../team-webrtc-client-transport";
import type { TraceFile } from "../trace-file";
import type { ApplicationServiceContext, ApplicationServices } from "./application-service-types";
import { REMOTE_SERVERS_FILE } from "./data-files";
import { safeStorageCipher } from "./platform";
import { TEARDOWN_ORDER } from "./teardown-order";

/** The remote servers that this computer joined. */
export async function startRemoteServers({
  centralAuth,
  centralAuthInitialization,
  developmentRemoteRole,
  hostedServers,
  remoteSessionCache,
  teamStore,
  teamWebRtcBridge,
  teardown,
  trace,
}: {
  centralAuth: CentralAuthManager;
  centralAuthInitialization: ApplicationServices["centralAuthInitialization"];
  developmentRemoteRole: ApplicationServiceContext["developmentRemoteRole"];
  hostedServers: HostedServerDesktopService;
  remoteSessionCache: RemoteSessionCache;
  teamStore: TeamStore;
  teamWebRtcBridge: TeamWebRtcBridge;
  teardown: ApplicationServiceContext["teardown"];
  trace: TraceFile;
}) {
  const connectTrace = new RemoteConnectTrace((span) => trace.record(span));
  const remoteServers = new RemoteServerManager(
    join(app.getPath("userData"), REMOTE_SERVERS_FILE),
    safeStorageCipher("error.app.macSecureStorageUnavailable"),
    {
      createTeamAuthTicket: (serverId) => centralAuth.createTeamAuthTicket(serverId),
      getEmail: () => centralAuth.getSignedInUser().email,
      sendTeamInviteEmail: (input) => centralAuth.sendTeamInviteEmail(input),
    },
    {
      allowLocalDevelopmentInvites: developmentRemoteRole !== null,
      appVersion: app.getVersion(),
      connectTrace,
      accountReady: centralAuthInitialization,
      getLocalHostId: () => teamStore.getIdentity()?.serverId ?? null,
      hostedServers: {
        unavailable: (serverId, wake) => hostedServers.unavailableHost(serverId, wake),
        wake: (serverId) => hostedServers.wake(serverId),
        status: (serverId) => hostedServers.status(serverId),
      },
      webrtcTransport: new TeamWebRtcClientTransport({
        bridge: teamWebRtcBridge,
        listHosts: () => centralAuth.listRemoteHosts(),
        startSession: (hostId) => centralAuth.startRemoteSession(hostId),
        issueTicket: (sessionId, clientPublicKey) => centralAuth.issueRemoteSessionTicket(sessionId, clientPublicKey),
        endSession: (sessionId) => centralAuth.endRemoteSession(sessionId),
        createInvite: (hostId, input) => centralAuth.createRemoteInvite(hostId, input),
        listInvites: (hostId) => centralAuth.listRemoteInvites(hostId),
        previewInvite: (token) => centralAuth.previewRemoteInvite(token),
        acceptInvite: (token) => centralAuth.acceptRemoteInvite(token),
        revokeInvite: (inviteId) => centralAuth.revokeRemoteInvite(inviteId),
        listMembers: (hostId) => centralAuth.listRemoteMembers(hostId),
        updateMember: (hostId, membershipId, role, reactivate) =>
          centralAuth.updateRemoteMember(hostId, membershipId, role, reactivate),
        removeMember: (hostId, membershipId) => centralAuth.removeRemoteMember(hostId, membershipId),
        removeOwnedHost: (hostId) => centralAuth.removeOwnedRemoteHost(hostId),
        getPrincipalId: () => centralAuth.getSignedInUser().id,
        controlPlaneUrl: centralAuth.resolveApiUrl("/"),
        downloadHostLogo: (hostId, version) => centralAuth.downloadRemoteHostLogo(hostId, version),
        transferDirectory: join(app.getPath("userData"), "remote-transfers"),
        connectTrace,
        sessionCache: remoteSessionCache,
      }),
    },
  );
  // A server joined or revoked on another device of this account. Signal carries it to every socket
  // the account holds, so the phone's join reaches this computer in the second it happens rather
  // than at the next account check. The refresh itself belongs to the entry point, which owns the
  // account check and its coalescing; this only forwards the notice to it.
  teamWebRtcBridge.on("accountServersChanged", () => void Effect.runPromise(remoteServers.invalidateDirectory()));
  teardown.push(TEARDOWN_ORDER.remoteServers, "the remote servers", () => runCauseEffect(remoteServers.stop()));
  performance.mark("openownbot:services.plugin-catalog");
  await runCauseEffect(remoteServers.initialize());
  performance.mark("openownbot:services.remote-servers");
  return { remoteServers };
}
