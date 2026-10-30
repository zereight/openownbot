import type {
  AgentEvent,
  ClientAgentSummary,
  ConfigureHostInput,
  DirectConversationSnapshot,
  DirectMessage,
  DirectMessageRealtimeEvent,
  DirectThreadSummary,
  DirectTypingRealtimeEvent,
  HostStatus,
  OpenOwnBotDesktopApi,
  RemoteDesktopSession,
  SendDirectMessageInput,
  ServerSummary,
  SetTeamTypingInput,
  TeamPresenceSnapshot,
  TeamSessionSummary,
} from "@robot/contracts/ipc";
import { sourceText } from "@robot/i18n/source";
import {
  STORY_DIRECT_SNAPSHOTS,
  STORY_DIRECT_THREADS,
  STORY_HOST_STATUS,
  STORY_PRESENCE,
  STORY_REMOTE_DESKTOP_SESSION,
  STORY_SERVERS,
  STORY_SESSIONS,
} from "./fixtures";
import { clone, type Listener, type MockRuntime } from "./mock-support";

export interface MockTeamOptions {
  servers?: ServerSummary[];
  presence?: TeamPresenceSnapshot;
  directThreads?: DirectThreadSummary[];
  directSnapshots?: Record<string, DirectConversationSnapshot>;
  hostStatus?: HostStatus;
  sessions?: TeamSessionSummary[];
  remoteDesktopSessions?: RemoteDesktopSession[];
}

/**
 * The team side: the server list, the local host with its members and invitations, direct messages
 * between members, and remote desktop sessions. They share one host status and one presence.
 */
export function createMockTeam(
  options: MockTeamOptions,
  { emit }: MockRuntime,
  emitAgentEvent: (event: AgentEvent) => void,
  readAgents: () => ClientAgentSummary[],
) {
  let servers = clone(options.servers ?? STORY_SERVERS);
  let presence = clone(options.presence ?? STORY_PRESENCE);
  let directThreads = clone(options.directThreads ?? STORY_DIRECT_THREADS);
  const directSnapshots = clone(options.directSnapshots ?? STORY_DIRECT_SNAPSHOTS);
  let hostStatus = clone(options.hostStatus ?? STORY_HOST_STATUS);
  let sessions = clone(options.sessions ?? STORY_SESSIONS);
  let remoteDesktopSessions = clone(options.remoteDesktopSessions ?? [STORY_REMOTE_DESKTOP_SESSION]);
  let directMessageCounter = 10;
  const serverListeners = new Set<Listener<ServerSummary[]>>();
  const presenceListeners = new Set<Listener<TeamPresenceSnapshot>>();
  const directMessageListeners = new Set<Listener<DirectMessageRealtimeEvent>>();
  const directTypingListeners = new Set<Listener<DirectTypingRealtimeEvent>>();
  const hostListeners = new Set<Listener<HostStatus>>();
  const remoteDesktopListeners = new Set<Listener<RemoteDesktopSession[]>>();
  const latestDirectConversationListeners = new Set<Listener<string>>();
  function emitPresence(snapshot: TeamPresenceSnapshot): void {
    presence = clone(snapshot);
    emit(presenceListeners, snapshot);
  }

  function emitDirectMessage(event: DirectMessageRealtimeEvent): void {
    emit(directMessageListeners, event);
  }

  function emitDirectTyping(event: DirectTypingRealtimeEvent): void {
    emit(directTypingListeners, event);
  }

  function getDirectSnapshot(memberId: string): DirectConversationSnapshot {
    return (
      directSnapshots[memberId] ?? {
        threadId: `direct-${memberId}`,
        otherMemberId: memberId,
        messages: [],
        revision: 0,
      }
    );
  }

  function readDirectConversationSnapshot(memberId: string): DirectConversationSnapshot {
    return clone(getDirectSnapshot(memberId));
  }

  function updateDirectConversationSnapshot(
    memberId: string,
    update: (snapshot: DirectConversationSnapshot) => void,
  ): DirectConversationSnapshot {
    const snapshot = getDirectSnapshot(memberId);
    update(snapshot);
    snapshot.revision += 1;
    directSnapshots[memberId] = snapshot;
    return readDirectConversationSnapshot(memberId);
  }

  function emitHostStatus(status: HostStatus): void {
    hostStatus = clone(status);
    emit(hostListeners, status);
  }

  function emitRemoteDesktopSessions(sessionsValue: RemoteDesktopSession[]): void {
    remoteDesktopSessions = clone(sessionsValue);
    emit(remoteDesktopListeners, sessionsValue);
  }

  const serversApi: OpenOwnBotDesktopApi["servers"] = {
    setMuted: async ({ serverId, muted, durationMs }) => {
      if (!servers.some((server) => server.id === serverId)) throw new Error("Remote server not found.");
      const notificationsMutedUntil = muted && durationMs !== undefined ? Date.now() + durationMs : null;
      servers = servers.map((server) =>
        server.id === serverId ? { ...server, notificationsMuted: muted, notificationsMutedUntil } : server,
      );
      return clone(servers);
    },
    setNotificationLevel: async ({ serverId, level }) => {
      if (!servers.some((server) => server.id === serverId)) throw new Error("Remote server not found.");
      servers = servers.map((server) => (server.id === serverId ? { ...server, notificationLevel: level } : server));
      return clone(servers);
    },
    list: async () => clone(servers),
    select: async (serverId) => {
      servers = servers.map((server) => ({ ...server, active: server.id === serverId }));
      emitAgentEvent({ type: "agents-changed", agents: readAgents() });
      return clone(servers);
    },
    reorder: async ({ serverIds }) => {
      const serversById = new Map(servers.map((server) => [server.id, server]));
      servers = [
        ...servers.filter((server) => server.kind === "local"),
        ...serverIds.flatMap((serverId) => {
          const server = serversById.get(serverId);
          return server?.kind === "remote" ? [server] : [];
        }),
      ];
      return clone(servers);
    },
    login: async (input) => {
      const server = servers.find((candidate) => candidate.id === input.serverId);
      if (!server) throw new Error("Server not found");
      return clone(server);
    },
    retryConnection: async (serverId) => {
      const server = servers.find((candidate) => candidate.id === serverId);
      if (!server) throw new Error("Server not found");
      const connected = {
        ...server,
        state: "online" as const,
        hostedSleep: null,
        hostedIssue: null,
        hostedStart: null,
        connectionSequence: (server.connectionSequence ?? 0) + 1,
      };
      servers = servers.map((item) => (item.id === serverId ? connected : item));
      emit(serverListeners, servers);
      return clone(connected);
    },
    remove: async (serverId) => {
      servers = servers.filter((server) => server.id !== serverId);
    },
    getPresence: async () => clone(presence),
    getPresenceFor: async () => clone(presence),
    refreshIdentity: async (serverId) => {
      const server = servers.find((candidate) => candidate.id === serverId);
      if (!server) throw new Error("Server not found");
      return clone(server);
    },
    setTyping: async (_input: SetTeamTypingInput) => undefined,
    onPresence: (listener, serverId) => {
      const receive = (snapshot: TeamPresenceSnapshot) => {
        if (
          !serverId ||
          snapshot.serverId === serverId ||
          (serverId === "local" && snapshot.serverId === hostStatus.serverId)
        )
          listener(snapshot);
      };
      presenceListeners.add(receive);
      return () => presenceListeners.delete(receive);
    },
    listDirectThreads: async () => clone(directThreads),
    readDirectConversation: async (memberId) =>
      clone(
        directSnapshots[memberId] ?? {
          threadId: `direct-${memberId}`,
          otherMemberId: memberId,
          messages: [],
          revision: 0,
        },
      ),
    readDirectConversationPage: async (input) => {
      if (!input.anchor || input.anchor.type === "latest") {
        emit(latestDirectConversationListeners, input.memberId);
      }
      const snapshot = clone(
        directSnapshots[input.memberId] ?? {
          threadId: `direct-${input.memberId}`,
          otherMemberId: input.memberId,
          messages: [],
          revision: 0,
        },
      );
      const messages = snapshot.messages.slice(-Math.min(input.limit ?? 50, 100));
      return {
        ...snapshot,
        messages,
        pageInfo: { hasOlder: snapshot.messages.length > messages.length, olderCursor: null },
      };
    },
    sendDirectMessage: async (input: SendDirectMessageInput) => {
      const message: DirectMessage = {
        id: input.clientMessageId,
        threadId: `direct-${input.memberId}`,
        senderMemberId: "member-self",
        recipientMemberId: input.memberId,
        text: input.text,
        createdAt: new Date().toISOString(),
        sequence: directMessageCounter++,
      };
      const snapshot = directSnapshots[input.memberId] ?? {
        threadId: message.threadId,
        otherMemberId: input.memberId,
        messages: [],
        revision: 0,
      };
      snapshot.messages = [...snapshot.messages, message];
      snapshot.revision += 1;
      directSnapshots[input.memberId] = snapshot;
      return clone(message);
    },
    markDirectRead: async (input) => {
      directThreads = directThreads.map((thread) =>
        thread.otherMemberId === input.memberId ? { ...thread, unreadCount: 0 } : thread,
      );
      const snapshot = directSnapshots[input.memberId];
      const readState = {
        unreadCount: 0,
        firstUnreadMessageId: null,
        throughSequence: input.throughSequence,
      };
      if (snapshot) snapshot.readState = readState;
      return readState;
    },
    setDirectTyping: async () => undefined,
    onDirectMessage: (listener) => {
      directMessageListeners.add(listener);
      return () => directMessageListeners.delete(listener);
    },
    onDirectTyping: (listener) => {
      directTypingListeners.add(listener);
      return () => directTypingListeners.delete(listener);
    },
    // The unfiltered streams the preload narrows to one server. The preview sends only the narrowed ones.
    onScopedPresence: () => () => undefined,
    onScopedDirectMessage: () => () => undefined,
    onScopedDirectTyping: () => () => undefined,
    onEvent: (listener) => {
      serverListeners.add(listener);
      return () => serverListeners.delete(listener);
    },
  };

  const host: OpenOwnBotDesktopApi["host"] = {
    getStatus: async () => clone(hostStatus),
    configure: async (input: ConfigureHostInput) => {
      hostStatus = {
        ...hostStatus,
        configured: true,
        phase: "idle",
        serverName: input.serverName,
      };
      emitHostStatus(hostStatus);
      return clone(hostStatus);
    },
    updateIdentity: async (input) => {
      hostStatus = {
        ...hostStatus,
        ...(input.serverName === undefined ? {} : { serverName: input.serverName }),
      };
      emitHostStatus(hostStatus);
      return clone(hostStatus);
    },
    rotateIdentityKey: async () => {
      hostStatus = { ...hostStatus, message: sourceText("status.host.keyRotated") };
      emitHostStatus(hostStatus);
      return clone(hostStatus);
    },
    getPresence: async () => clone(presence),
    start: async () => {
      hostStatus = { ...hostStatus, phase: "online", apiOnline: true, remoteDesktopReady: true };
      emitHostStatus(hostStatus);
      return clone(hostStatus);
    },
    stop: async () => {
      hostStatus = { ...hostStatus, phase: "idle", apiOnline: false, remoteDesktopReady: false };
      emitHostStatus(hostStatus);
      return clone(hostStatus);
    },
    // The preview has no runtime to ask, so the check is what a granted permission looks like.
    recheckScreenRecording: async () => {
      hostStatus = { ...hostStatus, remoteDesktopScreenRecordingDenied: false };
      emitHostStatus(hostStatus);
      return clone(hostStatus);
    },
    listSessions: async () => clone(sessions),
    revokeSession: async (sessionId) => {
      sessions = sessions.filter((session) => session.id !== sessionId);
    },
    onEvent: (listener) => {
      hostListeners.add(listener);
      return () => hostListeners.delete(listener);
    },
  };

  const remoteDesktop: OpenOwnBotDesktopApi["remoteDesktop"] = {
    checkSetup: async () => ({
      platform: "darwin",
      hostName: "Mac mini",
      username: "openownbot",
      checkedAt: new Date().toISOString(),
      screenRecording: hostStatus.remoteDesktopScreenRecordingDenied ? "blocked" : "allowed",
      accessibility: "blocked",
      service: "allowed",
      displays: "allowed",
      guiSession: "allowed",
      restartRequired: false,
      activeSessions: remoteDesktopSessions.length,
      message: null,
    }),
    openSetup: async () => undefined,
    test: async (input) => ({ active: input.action !== "stop", mouse: false, keyboard: false, code: "1234" }),
    list: async () => clone(remoteDesktopSessions),
    connect: async (input) => {
      const session: RemoteDesktopSession = {
        ...clone(STORY_REMOTE_DESKTOP_SESSION),
        id: `remote-desktop-${remoteDesktopSessions.length + 1}`,
        serverId: input.serverId,
        createdAt: new Date().toISOString(),
      };
      remoteDesktopSessions = [...remoteDesktopSessions, session];
      emitRemoteDesktopSessions(remoteDesktopSessions);
      return { status: "connected", session: clone(session) };
    },
    selectDisplay: async (input) => {
      remoteDesktopSessions = remoteDesktopSessions.map((session) =>
        session.serverId === input.serverId ? { ...session, selectedDisplayId: input.displayId } : session,
      );
      emitRemoteDesktopSessions(remoteDesktopSessions);
    },
    disconnect: async (sessionId) => {
      remoteDesktopSessions = remoteDesktopSessions.filter((session) => session.id !== sessionId);
      emitRemoteDesktopSessions(remoteDesktopSessions);
    },
    onEvent: (listener) => {
      remoteDesktopListeners.add(listener);
      return () => remoteDesktopListeners.delete(listener);
    },
  };

  return {
    servers: serversApi,
    /** The server the preview shows, which its agent events belong to. */
    activeServerId: () => servers.find((server) => server.active)?.id ?? "local",
    host,
    remoteDesktop,
    emitPresence,
    emitDirectMessage,
    emitDirectTyping,
    emitHostStatus,
    emitRemoteDesktopSessions,
    readDirectConversationSnapshot,
    updateDirectConversationSnapshot,
    onLatestDirectConversationOpened: (listener: Listener<string>) => {
      latestDirectConversationListeners.add(listener);
      return () => latestDirectConversationListeners.delete(listener);
    },
    dispose: () => {
      presenceListeners.clear();
      directMessageListeners.clear();
      directTypingListeners.clear();
      hostListeners.clear();
      remoteDesktopListeners.clear();
      latestDirectConversationListeners.clear();
    },
  };
}
