// What a channel remembers: the notes every member of it carries into a turn.

import { decodeChannelMemories, decodeChannelMemory } from "@robot/contracts/ipc";
import { CHANNEL_ROUTES } from "@robot/contracts/team-protocol/channels-v1";
import type { AgentService } from "../../backend/agent-service";
import { runCauseEffect } from "../../backend/effect-boundary";
import { decodeVoid } from "../remote-host-decoding";
import type { RemoteServerManager } from "../remote-server-manager";
import {
  parseChannelId,
  parseCreateChannelMemory,
  parseDeleteChannelMemory,
  parseUpdateChannelMemory,
} from "./agent-inputs";
import type { IpcGroupHandlers } from "./define-ipc-group";
import { scopedHandler } from "./scoped-handler";

interface ChannelMemoryIpcDependencies {
  service: AgentService;
  remoteServers: RemoteServerManager;
}

export function channelMemoryIpcHandlers({
  service,
  remoteServers,
}: ChannelMemoryIpcDependencies): Pick<IpcGroupHandlers, "channelMemories"> {
  return {
    channelMemories: {
      listChannelMemories: scopedHandler(parseChannelId, {
        local: (channelId) => service.channels.listMemories(channelId),
        remote: (channelId, serverId) =>
          runCauseEffect(
            remoteServers.request(serverId, CHANNEL_ROUTES.memories, decodeChannelMemories, {
              method: "POST",
              body: { channelId },
            }),
          ),
      }),
      createChannelMemory: scopedHandler(parseCreateChannelMemory, {
        local: (parsed) => service.channels.createMemory(parsed),
        remote: (parsed, serverId) =>
          runCauseEffect(
            remoteServers.request(serverId, CHANNEL_ROUTES.memoryCreate, decodeChannelMemory, {
              method: "POST",
              body: parsed,
            }),
          ),
      }),
      updateChannelMemory: scopedHandler(parseUpdateChannelMemory, {
        local: (parsed) => service.channels.updateMemory(parsed),
        remote: (parsed, serverId) =>
          runCauseEffect(
            remoteServers.request(serverId, CHANNEL_ROUTES.memoryUpdate, decodeChannelMemory, {
              method: "POST",
              body: parsed,
            }),
          ),
      }),
      deleteChannelMemory: scopedHandler(parseDeleteChannelMemory, {
        local: (parsed) => service.channels.deleteMemory(parsed),
        remote: (parsed, serverId) =>
          runCauseEffect(
            remoteServers.request(serverId, CHANNEL_ROUTES.memoryDelete, decodeVoid, {
              method: "POST",
              body: parsed,
            }),
          ),
      }),
      clearChannelMemories: scopedHandler(parseChannelId, {
        local: (channelId) => service.channels.clearMemories(channelId),
        remote: (channelId, serverId) =>
          runCauseEffect(
            remoteServers.request(serverId, CHANNEL_ROUTES.memoryClear, decodeVoid, {
              method: "POST",
              body: { channelId },
            }),
          ),
      }),
    },
  };
}
