import { join } from "node:path";
import { decodeRecord, requiredString } from "@robot/contracts/ipc-decoding";
import { sourceText } from "@robot/i18n/source";
import { createOpenOwnBotLogger, toLogValue } from "@robot/logging";
import { Effect } from "effect";
import { app } from "electron";
import type { AgentService } from "../../backend/agent-service";
import { runCauseEffect } from "../../backend/effect-boundary";
import { DiscordConnectFailed, toDiscordConnectFailed } from "../../backend/messaging/discord/discord-connect";
import { discordDriver } from "../../backend/messaging/discord/discord-driver";
import { MessagingOperationFailed, MessagingService } from "../../backend/messaging/messaging-service";
import { SlackConnectFailed, toSlackConnectFailed } from "../../backend/messaging/slack/slack-connect";
import { slackDriver } from "../../backend/messaging/slack/slack-driver";
import { telegramDriver } from "../../backend/messaging/telegram/telegram-driver";
import type { SidebarLayoutStore } from "../../backend/sidebar-layout-store";
import type { CentralAuthManager } from "../central-auth-manager";
import { loadIngressQueueKey } from "../ingress-queue-key";
import { MessagingCredentialStore } from "../messaging-credential-store";
import { toRemoteWorkflowError } from "../remote-service-effects";
import { INGRESS_QUEUE_KEY_FILE, MESSAGING_CREDENTIAL_FILE } from "./data-files";
import type { safeStorageCipher } from "./platform";
import { TEARDOWN_ORDER } from "./teardown-order";
/**
 * The composition root. Every long-lived service the desktop app owns is built here, in one
 * function, in dependency order, and handed back as a single record.
 *
 * **One function on purpose.** Most of these services take their dependencies by value, and a value
 * only type-checks because `tsc` narrows a local across the statements of one function body. Split
 * this into stages and `mainWindow`, `browser`, `teamWebRtcBridge` and the rest would each have to
 * cross a boundary as `T | null`, which is how the entry point ended up with seventeen
 * `() => X | null` accessors and twenty-three unreachable "not ready" guards. A local built above
 * the line that reads it needs neither.
 *
 * **Construct only.** This function does not subscribe the renderer forwarders, register IPC
 * handlers, load the renderer or open event connections - the entry point does, after this returns.
 * The rule keeps the direction of the dependency honest: pull the wiring in here too and the
 * parameter object grows larger than the return value, at which point this is a service locator.
 *
 * **Every step is registered for teardown as it is built**, so a quit that arrives mid-startup
 * stops exactly what exists. `TEARDOWN_ORDER` below, not the order of the pushes, decides what runs
 * when - see `teardown-registry.ts` for why shutdown here is not the reverse of construction.
 */

import { SignalIngress } from "../signal-ingress";
import { SLACK_DEV_CALLBACK_PATH, startSlackDevCallbackServer } from "../slack-dev-callback-server";
import type { TeardownRegistry } from "../teardown-registry";

export const logger = createOpenOwnBotLogger("application-services");

export interface MessagingServicesContext {
  teardown: TeardownRegistry;
  secretCipher: ReturnType<typeof safeStorageCipher>;
  centralAuth: CentralAuthManager;
  service: AgentService;
  sidebarLayout: SidebarLayoutStore;
  /** Read on each call: the team store that names this host is built after messaging. */
  readHostId: () => string | null;
  openLink: (url: string) => Promise<void>;
}

/**
 * The Slack, Discord and Telegram connections. Awaited in place, so start and teardown order stay as they were
 * inline.
 */
export async function createMessagingServices({
  teardown,
  secretCipher,
  centralAuth,
  service,
  sidebarLayout,
  readHostId,
  openLink,
}: MessagingServicesContext): Promise<{ messaging: MessagingService; signalIngress: SignalIngress }> {
  /*
   * The Slack workspaces, Discord guilds and Telegram chats where the agents answer. The tokens use the same cipher as every other
   * secret; an unreadable file is reported, not fatal, and each workspace then connects again.
   */
  const messagingCredentials = new MessagingCredentialStore(
    join(app.getPath("userData"), MESSAGING_CREDENTIAL_FILE),
    secretCipher,
  );
  const messagingCredentialLoadError = await Effect.runPromise(messagingCredentials.load());
  if (messagingCredentialLoadError)
    logger.warn(
      `ROBot could not read the messaging token file (${messagingCredentialLoadError.name}). It was left unchanged.`,
    );
  // The Signal socket that brings the events of the Slack workspaces, Discord guilds and Telegram chats
  // linked to this host, and makes its Discord and Telegram calls.
  const signalIngress = new SignalIngress({
    hostId: readHostId,
    signedIn: () => {
      try {
        centralAuth.getSignedInUser();
        return true;
      } catch {
        return false;
      }
    },
    issueTicket: (hostId) => centralAuth.issueRemoteHostTicket(hostId).pipe(toRemoteWorkflowError),
    issueSlackRoute: (hostId) => centralAuth.issueSlackRoute(hostId).pipe(toRemoteWorkflowError),
    issueDiscordRoute: (hostId) => centralAuth.issueDiscordRoute(hostId).pipe(toRemoteWorkflowError),
    issueWebhookRoute: (hostId) => centralAuth.issueWebhookRoute(hostId).pipe(toRemoteWorkflowError),
    issueTelegramRoute: (hostId) => centralAuth.issueTelegramRoute(hostId).pipe(toRemoteWorkflowError),
    queueKey: () => loadIngressQueueKey(join(app.getPath("userData"), INGRESS_QUEUE_KEY_FILE), secretCipher),
  });
  teardown.push(TEARDOWN_ORDER.signalIngress, "the Signal ingress socket", () =>
    Effect.runPromise(signalIngress.dispose()),
  );
  // Development only: `bun run dev:slack` names this loopback port, so a Slack install returns to this
  // dev app and not to an installed ROBot that owns `openownbot://`.
  const developmentSlackCallbackPort = app.isPackaged ? 0 : Number(process.env.OPENOWNBOT_DEV_SLACK_CALLBACK_PORT ?? 0);
  const messaging = new MessagingService({
    threads: service.messaging,
    agents: {
      listAgents: () => service.listAgents(),
      // A chat app user is not the owner, even when the owner links the chat.
      respondToApproval: (input) => service.respondToApproval(input, { owner: false }),
      onEvent: (listener) => {
        service.on("event", listener);
        return () => service.off("event", listener);
      },
      createAgentProfile: (input) => service.createAgentProfile(input),
      createMemory: (input) => service.memories.create(input),
      ensureDeletable: (agentId) => service.ensureAgentDeletable(agentId),
      deleteAgent: (agentId) => service.deleteAgent(agentId),
      sidebarChatIds: () => service.sidebarChatIds(),
    },
    credentials: messagingCredentials,
    drivers: [
      slackDriver({ ingress: signalIngress }),
      discordDriver({ ingress: signalIngress }),
      telegramDriver({ ingress: signalIngress }),
    ],
    downloadsRoot: join(app.getPath("userData"), "messaging-downloads"),
    statusPath: join(app.getPath("userData"), "messaging-status.json"),
    ingress: signalIngress,
    sidebar: sidebarLayout,
    slackApp: {
      authorize: (input) =>
        Effect.suspend(() => {
          const hostId = readHostId();
          if (!hostId)
            return Effect.fail(
              new SlackConnectFailed({ cause: new Error(sourceText("error.messaging.relayUnavailable")) }),
            );
          return centralAuth
            .requestAuthorized(
              "/v2/slack/authorize",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  hostId,
                  ...input,
                  ...(developmentSlackCallbackPort > 0
                    ? { returnUrl: `http://127.0.0.1:${developmentSlackCallbackPort}${SLACK_DEV_CALLBACK_PATH}` }
                    : {}),
                }),
              },
              (value) => requiredString(decodeRecord(value, "Slack sign-in"), "authorizeUrl"),
            )
            .pipe(toSlackConnectFailed);
        }),
      unlink: (workspaceId) =>
        Effect.suspend(() => {
          const hostId = readHostId();
          return hostId
            ? centralAuth.unlinkSlackWorkspace(hostId, workspaceId).pipe(toSlackConnectFailed)
            : Effect.void;
        }),
      openExternal: openLink,
    },
    discordApp: {
      authorize: (input) =>
        Effect.suspend(() => {
          const hostId = readHostId();
          if (!hostId)
            return Effect.fail(
              new DiscordConnectFailed({ cause: new Error(sourceText("error.messaging.discordRelayUnavailable")) }),
            );
          return centralAuth
            .requestAuthorized(
              "/v2/discord/authorize",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hostId, ...input }),
              },
              (value) => requiredString(decodeRecord(value, "Discord sign-in"), "authorizeUrl"),
            )
            .pipe(toDiscordConnectFailed);
        }),
      unlink: (guildId) =>
        Effect.suspend(() => {
          const hostId = readHostId();
          return hostId ? centralAuth.unlinkDiscordGuild(hostId, guildId).pipe(toDiscordConnectFailed) : Effect.void;
        }),
      openExternal: openLink,
    },
    telegramApp: {
      createLink: () =>
        Effect.suspend(() => {
          const hostId = readHostId();
          if (!hostId)
            return Effect.fail(
              new MessagingOperationFailed({
                cause: new Error(sourceText("error.messaging.telegramRelayUnavailable")),
              }),
            );
          return centralAuth.createTelegramLink(hostId).pipe(
            Effect.mapError(({ cause }) => {
              // The account service has no Telegram bot. The user can only wait, so they get catalog
              // text, which a joined server can show to its client.
              const notConfigured =
                cause instanceof Error && "code" in cause && cause.code === "telegram_not_configured";
              return new MessagingOperationFailed({
                cause: notConfigured ? new Error(sourceText("error.messaging.telegramServiceUnavailable")) : cause,
              });
            }),
          );
        }),
      unlink: (chatId) =>
        Effect.suspend(() => {
          const hostId = readHostId();
          return hostId
            ? centralAuth
                .unlinkTelegramChat(hostId, chatId)
                .pipe(Effect.mapError((error) => new MessagingOperationFailed({ cause: error.cause })))
            : Effect.void;
        }),
      openExternal: openLink,
    },
  });
  // Not awaited: a connection waits for Slack, and the app does not wait for it.
  void runCauseEffect(messaging.start()).catch((error) =>
    logger.warn("Messaging connections did not start.", toLogValue(error)),
  );
  teardown.push(TEARDOWN_ORDER.messaging, "the messaging connections", () => Effect.runPromise(messaging.stop()));
  if (developmentSlackCallbackPort > 0) {
    // As `openownbot://` does for a packaged build, a finished install brings ROBot to the front.
    const callback = await startSlackDevCallbackServer(developmentSlackCallbackPort, async (nonce, grant) => {
      const received = await runCauseEffect(messaging.completeSlackWorkspace(nonce, grant));
      if (received) app.focus({ steal: true });
      return received;
    });
    teardown.push(TEARDOWN_ORDER.signalIngress, "the Slack development callback", () => callback.close());
  }
  return { messaging, signalIngress };
}
