import { isManagedRuntimeProvider } from "@robot/contracts/agent-providers";
import { Effect, Fiber } from "effect";
import { toAgentRemovalFailed } from "../backend/agent/agent-removal";
import { toHostedSiteOperationFailed } from "../backend/agent/hosted-site-coordinator";
import { AgentApiKeys } from "../backend/agent-api-keys";
import { AgentDatabaseSupervisor } from "../backend/agent-data/agent-database-supervisor";
import { AgentTables } from "../backend/agent-data/agent-tables";
import { RoutineResultStore } from "../backend/routine-results/routine-result-store";
import { createRoutineResults } from "../backend/routine-results/routine-results";
import { WorkflowTriggers } from "../backend/workflows/workflow-triggers";
import { createAcpRegistry } from "./acp-registry";
import { createAgentAdminSettings } from "./agent-admin-settings";
import { spawnAgentDatabaseHost } from "./agent-database-host-process";
import { agentDisplayEnvironment, hasSeparateAgentDisplay } from "./agent-display";
import { createAgentHostSettings } from "./agent-host-settings";
import { createBrowserProfileService } from "./browser-profile-service";
import { HostReleaseService, readInstallationMode } from "./host-release-service";
import { LicenseDesktopService } from "./license-service";
import { LocalSignInWindows } from "./local-sign-in-window";
import { LocalSkillLibrary } from "./local-skill-library";
import { localSkillTools } from "./local-skill-tools";
import { MAC_PERMISSION_URLS } from "./mac-permission-urls";
import { PushNotificationStore } from "./push-notification-store";
import { DESKTOP_USE_MS } from "./push-notifications";
import { RemoteWorkflowError, toRemoteWorkflowError } from "./remote-service-effects";
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

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";

import type { AgentStatus, CentralAuthState } from "@robot/contracts/ipc";
import {
  agentBrowserProfile,
  IPC_ENDPOINTS,
  isManagedToolRuntime,
  isUpdateBusyPhase,
  LOCAL_SERVER_ID,
  latestTurnAnswer,
} from "@robot/contracts/ipc";
import { LOCAL_ONLY } from "@robot/contracts/local-only";
import { sourceText } from "@robot/i18n/source";
import { createOpenOwnBotLogger, toLogValue } from "@robot/logging";
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  Notification,
  nativeImage,
  powerMonitor,
  safeStorage,
  screen,
  shell,
  systemPreferences,
} from "electron";
import { AgentLifecycleFailed } from "../backend/agent/agent-lifecycle-failed";
import { pasteCodeLoginSupported } from "../backend/agent/cli-code-login";
import { toMcpGatewayFailed } from "../backend/agent/mcp-gateway";
import { ProviderAccountStore } from "../backend/agent/provider-account-store";
import { AgentService } from "../backend/agent-service";
import { AgentStore } from "../backend/agent-store";
import { BrowserHost } from "../backend/browser-host";
import { BrowserProfileStore } from "../backend/browser-profiles/browser-profile-store";
import { runCauseEffect } from "../backend/effect-boundary";
import { MailboxStore } from "../backend/mailbox-store";
import { OpenOwnBotDatabase } from "../backend/openownbot-database";
import { passwordVaultRouter } from "../backend/password-vault-router";
import { sweepProviderTemp } from "../backend/provider-temp";
import { SidebarLayoutStore } from "../backend/sidebar-layout-store";
import { TeamChatStore } from "../backend/team-chat-store";
import { createAgentDefaultsPreferenceStore } from "./agent-defaults-preference-store";
import { AgentInitializationGate } from "./agent-initialization";
import { AgentMarketplaceService } from "./agent-marketplace-service";
import { AgentMemoryLimitPreferenceStore, reloadingAgentMemoryLimit } from "./agent-memory-limit-preference-store";
import { AgentSectionService } from "./agent-section-service";
import { AgentTemplateService } from "./agent-template-service";
import { AppBehaviorService } from "./app-behavior-service";
import { AppearanceService } from "./appearance-service";
import { ApprovalAutomation, readApprovalAutomation } from "./approval-automation-store";
import { BillingDesktopService } from "./billing-service";
import { BrowserDockOverlay } from "./browser-dock-overlay";
import { startBrowserLog } from "./browser-log";
import { BrowserPictureInPicture } from "./browser-picture-in-picture";
import { BrowserViewClient } from "./browser-view-client";
import { BusyMessageModePreferenceStore } from "./busy-message-mode-preference-store";
import { CentralAuthManager, readCentralAuthApiUrl, readMobileConnectApiUrl } from "./central-auth-manager";
import { startChannelLog } from "./channel-log";
import { ChatVisualPreviewer } from "./chat-visual-preview";
import { ClaudeEnvironmentStore } from "./claude-environment-store";
import { applicationBundlePath, applicationIconName } from "./computer-use-permission-app";
import { ComputerUsePermissionHelpWindowController } from "./computer-use-permission-help-window";
import { createCustomAgentChanges } from "./custom-agent-changes";
import { CUSTOM_AGENTS_FILE, CustomAgentStore } from "./custom-agent-store";
import { createCustomProviderChanges } from "./custom-provider-changes";
import { CustomProviderStore } from "./custom-provider-store";
import { DecisionModelStore } from "./decision-model-store";
import { desktopShowsAgentEvent } from "./desktop-notifications";
import { shouldAutoStartHost } from "./development-profile";
import { applyDevelopmentRemoteAccount, startDevelopmentRemoteRole } from "./development-remote-bootstrap";
import { performDynamicIslandCriticalAction } from "./dynamic-island-actions";
import { DynamicIslandFailed, DynamicIslandWindowController, toDynamicIslandFailed } from "./dynamic-island-window";
import { createExternalLinkPreferenceStore, ExternalLinkOpener } from "./external-link-opener";
import { createFastComputerUseHost } from "./fast-computer-use-host";
import { agentWebhookRoutineWriter } from "./host-events-service";
import { HostService } from "./host-service";
import { HostUpdateCoordinator } from "./host-update-coordinator";
import { CLIENT_USE_WINDOW_MS, HostedServerActivity } from "./hosted-server-activity";
import { applyHostedServerAccount, type HostedServerEnvironment } from "./hosted-server-bootstrap";
import { HostedServerDesktopService, withHostingDeveloperKey } from "./hosted-server-service";
import { HostedServerStartRetry } from "./hosted-server-start-retry";
import { HostedSiteDesktopService } from "./hosted-site-service";
import { IdleRestart } from "./idle-restart";
import { InterfaceSizeService } from "./interface-size-service";
import { prepareToolRuntimeForTest } from "./ipc/mcp-server-handlers";
import { LanguageService } from "./language-service";
import { localRoutineFeedDocument } from "./local-routine-calendar";
import { createLoginItem } from "./login-item";
import { LogoColorService } from "./logo-color-service";
import {
  createComputerUsePermissionHelpWindow,
  createDynamicIslandWindow,
  loadBrowserDockRenderer,
  loadComputerUsePermissionHelpRenderer,
  loadDynamicIslandRenderer,
  showMainWindow,
} from "./main-window";
import { DATA_SKILL_SLUG, ManagedSkillService, SKILL_CREATOR_SKILL_SLUG } from "./managed-skill-service";
import { McpHostSignIns } from "./mcp-host-sign-ins";
import { McpOAuthProxySettingsFile } from "./mcp-oauth-proxy-store";
import { McpOAuthStore } from "./mcp-oauth-store";
import { MemoryReviewPreferenceStore } from "./memory-review-preference-store";
import { NotificationPreferenceStore } from "./notification-preference-store";
import { OnePasswordConnectorService } from "./onepassword-connector-service";
import { OnePasswordConnectorStore } from "./onepassword-connector-store";
import { PromptCacheTtlPreferenceStore } from "./prompt-cache-ttl-preference-store";
import { ProviderAccountsHost } from "./provider-accounts-host";
import { createProviderCliAppVersionStore } from "./provider-cli-app-version-store";
import { ProviderCredentialStore } from "./provider-credential-store";
import { createProviderDetection } from "./provider-detection";
import { PROVIDER_DETECTION_SETTINGS_FILE, ProviderDetectionSettingsStore } from "./provider-detection-settings-store";
import { ProviderHostSignIns } from "./provider-host-sign-ins";
import { startAccountLog, startAgentLog, startProviderLog } from "./provider-log";
import { toProviderRuntimeFailure } from "./provider-runtime-effects";
import { ProviderRuntimeManager, providerRuntimeRoot, runtimeTarget } from "./provider-runtime-manager";
import { ProviderUseSettingsStore } from "./provider-use-settings-store";
import { RelayedMessagingInstalls } from "./relayed-messaging-installs";
import { decodeQueuedMessageReceipt } from "./remote-agent-decoding";
import { RemoteDesktopManager } from "./remote-desktop-manager";
import { resolveRemoteDesktopRuntime } from "./remote-desktop-runtime-artifact";
import { loadOrCreateRemoteDesktopCredentials } from "./remote-desktop-secret-store";
import { decodeVoid } from "./remote-host-decoding";
import { createRemoteNetworkRoutePreferenceStore } from "./remote-network-route-preference-store";
import type { RemoteServerManager } from "./remote-server-manager";
import { RemoteSessionCache } from "./remote-session-cache";
import { createRemoteSessionReusePreferenceStore } from "./remote-session-reuse-preference-store";
import { sendToRenderer } from "./renderer-ipc";
import { RequestedUpdate, RequestedUpdateRefusal } from "./requested-update";
import { StatementTimings } from "./resource-summary";
import { RoutineFeedServer } from "./routine-feed-server";
import { clearRoutineHold, ROUTINE_HOLD_FILE, takeRoutineHold, writeRoutineHold } from "./routine-hold-file";
import { ScreenCapturer } from "./screen-capture";
import { agentProcessEnvironment, ServerMemory } from "./server-memory";
import { ServerMode } from "./server-mode";
import { ServerTimezonePreferenceStore } from "./server-timezone-preference-store";
import {
  configureApplicationProtocol,
  configureAttachmentProtocol,
  configureServerLogoProtocols,
} from "./session-configuration";
import { readSetupState, writeSetupState } from "./setup-store";
import { agentPrintedLink, SignInRelayHost } from "./sign-in-relay-host";
import { SkillMarketplaceService } from "./skill-marketplace-service";
import { startAccountProfileRefresh } from "./startup/account-profile";
import type { ApplicationServiceContext, ApplicationServices } from "./startup/application-service-types";
import { startAutomation } from "./startup/automation";
import { startComputerUse } from "./startup/computer-use";
import { startBitwardenConnector, startGitHubConnector } from "./startup/connectors";
import {
  AGENT_DEFAULTS_PREFERENCE_FILE,
  AGENT_MEMORY_LIMIT_PREFERENCE_FILE,
  APP_BEHAVIOR_PREFERENCE_FILE,
  APPEARANCE_PREFERENCE_FILE,
  APPROVAL_AUTOMATION_FILE,
  BROWSER_STATE_FILE,
  BUSY_MESSAGE_MODE_PREFERENCE_FILE,
  CENTRAL_AUTH_FILE,
  CLAUDE_ENVIRONMENT_PREFERENCE_FILE,
  CUSTOM_PROVIDERS_FILE,
  DYNAMIC_ISLAND_PREFERENCE_FILE,
  EXTERNAL_LINK_PREFERENCE_FILE,
  INTERFACE_SIZE_PREFERENCE_FILE,
  LANGUAGE_PREFERENCE_FILE,
  LOGO_COLOR_PREFERENCE_FILE,
  MCP_OAUTH_FILE,
  MCP_OAUTH_PROXY_FILE,
  MEMORY_REVIEW_PREFERENCE_FILE,
  NOTIFICATION_PREFERENCE_FILE,
  ONEPASSWORD_CONNECTOR_FILE,
  PROMPT_CACHE_TTL_PREFERENCE_FILE,
  PROVIDER_CLI_APP_VERSION_FILE,
  PROVIDER_CREDENTIAL_FILE,
  PUSH_NOTIFICATION_FILE,
  REMOTE_DESKTOP_RUNTIME_SECRET_FILE,
  REMOTE_NETWORK_ROUTE_PREFERENCE_FILE,
  REMOTE_SESSION_REUSE_PREFERENCE_FILE,
  REMOTE_SESSIONS_FILE,
  ROUTINE_FEED_FILE,
  SERVER_TIMEZONE_PREFERENCE_FILE,
  SETUP_FILE,
  SIDEBAR_LAYOUT_FILE,
  TEAM_FILE,
  UPDATE_PREFERENCE_FILE,
  VAULT_FILE,
} from "./startup/data-files";
import { startFlows } from "./startup/flows";
import { startHostEvents } from "./startup/host-events";
import { createImportServices } from "./startup/imports";
import { startMcpSignIns } from "./startup/mcp-sign-ins";
import { createMessagingServices } from "./startup/messaging-services";
import { startMonitoring } from "./startup/monitoring";
import { computerUseCapability, safeStorageCipher } from "./startup/platform";
import { startRemoteServers } from "./startup/remote-servers";
import { startStorageUsage } from "./startup/storage-usage";
import { TEARDOWN_ORDER } from "./startup/teardown-order";
import { startUpdater } from "./startup/updater";
import { startVoice } from "./startup/voice";
import { TeamStore } from "./team-store";
import { TeamWebRtcBridge } from "./team-webrtc-bridge";
import { readUpdatePreference, writeUpdatePreference } from "./update-preference-store";
import { checkRestartReadiness, type RestartReadiness } from "./update-readiness";
import { VaultService } from "./vault-service";
import { VaultStore } from "./vault-store";
import { startWorkflowLog } from "./workflow-log";

const logger = createOpenOwnBotLogger("application-services");
export async function createApplicationServices({
  mainWindow,
  windows,
  appIconPath,
  appVariant,
  developmentRemoteRole,
  hostedServer,
  serverMode: serverModeEnvironment,
  hostingDeveloperKey,
  macHapticFeedback,
  teardown,
  forwardCentralAuth,
  forwardBrowserDisplayState,
  forwardProviderRuntimeStatus,
  forwardVoiceModelStatus,
  forwardVoiceStreamTranscript,
  forwardSpeechModelStatus,
  forwardWorkflowNotice,
  prepareForUpdateInstall,
  quitting,
}: ApplicationServiceContext): Promise<ApplicationServices> {
  // First, so the provider lines of the whole startup reach the file.
  teardown.push(
    TEARDOWN_ORDER.providerLog,
    "the provider log",
    startProviderLog(join(app.getPath("userData"), "logs")),
  );
  teardown.push(TEARDOWN_ORDER.agentLog, "the agent log", startAgentLog(join(app.getPath("userData"), "logs")));
  teardown.push(TEARDOWN_ORDER.agentLog, "the browser log", startBrowserLog(join(app.getPath("userData"), "logs")));
  teardown.push(TEARDOWN_ORDER.agentLog, "the channel log", startChannelLog(join(app.getPath("userData"), "logs")));
  teardown.push(TEARDOWN_ORDER.agentLog, "the workflow log", startWorkflowLog(join(app.getPath("userData"), "logs")));
  teardown.push(TEARDOWN_ORDER.accountLog, "the account log", startAccountLog(join(app.getPath("userData"), "logs")));
  const externalLinkPreference = createExternalLinkPreferenceStore(
    join(app.getPath("userData"), EXTERNAL_LINK_PREFERENCE_FILE),
  );
  // The store loads below with the other preferences. Until then, a page opens in the default browser.
  const externalLinks = new ExternalLinkOpener({
    preference: externalLinkPreference,
    platform: process.platform,
    openDefault: (url) => shell.openExternal(url),
    // The user clicked the link in the focused window, which can be a chat window.
    onFallback: (fallback) =>
      sendToRenderer(
        BrowserWindow.getFocusedWindow() ?? windows.getMainWindow(),
        IPC_ENDPOINTS.app.externalLinkFallback,
        fallback,
      ),
  });
  const openLink = (url: string) => runCauseEffect(externalLinks.open(url));
  // The one forward reference left in this function: the controller is built at the top of
  // startup because its window must be able to appear immediately, but the two services its
  // critical actions drive are built hundreds of lines below. A single named local rather than
  // two lazy getters, so the gap is visible and bounded.
  let criticalActionTargets: { agents: AgentService; host: HostService; remoteServers: RemoteServerManager } | null =
    null;
  const dynamicIsland = new DynamicIslandWindowController({
    platform: process.platform,
    preferencePath: join(app.getPath("userData"), DYNAMIC_ISLAND_PREFERENCE_FILE),
    createWindow: createDynamicIslandWindow,
    loadWindow: (window, display) => loadDynamicIslandRenderer(window, display, appVariant),
    getDisplays: () => screen.getAllDisplays(),
    getMainWindow: windows.getMainWindow,
    ensureMainWindow: windows.ensureMainWindow,
    presentMainWindow: showMainWindow,
    performHaptic: () => macHapticFeedback.performAlignment(),
    performCriticalAction: (action) =>
      Effect.suspend(() => {
        if (!criticalActionTargets) {
          return Effect.fail(new DynamicIslandFailed({ cause: new Error(sourceText("error.app.notReady")) }));
        }
        const { agents, host, remoteServers } = criticalActionTargets;
        return performDynamicIslandCriticalAction(
          action,
          agents,
          remoteServers,
          { decodeVoid, decodeQueuedMessageReceipt },
          () => host.conversationSender(),
        ).pipe(toDynamicIslandFailed);
      }),
  });
  teardown.push(TEARDOWN_ORDER.dynamicIsland, "the Dynamic Island", () => dynamicIsland.destroy());
  const centralAuthApiUrl = readCentralAuthApiUrl(
    process.env.OPENOWNBOT_AUTH_API_URL,
    app.isPackaged && !LOCAL_ONLY ? "https://api.openbot.run" : "http://127.0.0.1:3100",
  );
  const centralAuth = new CentralAuthManager({
    apiUrl: centralAuthApiUrl,
    mobileConnectApiUrl: readMobileConnectApiUrl(process.env.OPENOWNBOT_MOBILE_AUTH_API_URL, centralAuthApiUrl),
    storagePath: join(app.getPath("userData"), CENTRAL_AUTH_FILE),
    ...safeStorageCipher("error.app.macSecureStorageUnavailable"),
  });
  // Registered before `initialize()`, which publishes `{ status: "loading" }` synchronously: the
  // listener therefore runs on the next line with most of this function's services still unbuilt.
  teardown.push(TEARDOWN_ORDER.centralAuth, "the account runtime", () => Effect.runPromise(centralAuth.dispose()));
  centralAuth.on("changed", forwardCentralAuth);
  const centralAuthInitialization = Effect.runSync(Effect.cached(centralAuth.initialize().pipe(toRemoteWorkflowError)));
  void Effect.runPromise(centralAuthInitialization).catch((error) =>
    logger.warn("The account did not initialize.", toLogValue(error)),
  );
  const { refreshAccountProfile } = startAccountProfileRefresh({ centralAuth, mainWindow, teardown });
  // Before the agents load, so the first check of an agent that follows a default reads the saved one.
  const agentDefaults = createAgentDefaultsPreferenceStore(
    join(app.getPath("userData"), AGENT_DEFAULTS_PREFERENCE_FILE),
  );
  await runCauseEffect(agentDefaults.load());
  const store = new AgentStore(
    app.getPath("userData"),
    homedir(),
    new OpenOwnBotDatabase(app.getPath("userData")),
    () => agentDefaults.get(),
  );
  // Phase marks for `dev:bench`, so a slow start shows which group of awaits it waited on. They
  // change nothing.
  performance.mark("openownbot:services.pre-store");
  await runCauseEffect(store.initialize());
  performance.mark("openownbot:services.store");
  // Closing copies the write-ahead log into the database file and removes it. A step that passed its
  // limit, such as a slow agent stop, still writes, so the close waits a short time for it.
  teardown.push(TEARDOWN_ORDER.database, "the database", () => store.database.close(), { afterAbandonedSteps: true });
  const managedSkills = new ManagedSkillService(
    app.isPackaged
      ? join(process.resourcesPath, "managed-skills", "openownbot-site-hosting", "SKILL.md")
      : resolve(__dirname, "../../resources/managed-skills/openownbot-site-hosting/SKILL.md"),
  );
  const skillCreator = new ManagedSkillService(
    app.isPackaged
      ? join(process.resourcesPath, "managed-skills", "openownbot-skill-creator", "SKILL.md")
      : resolve(__dirname, "../../resources/managed-skills/openownbot-skill-creator/SKILL.md"),
    undefined,
    undefined,
    SKILL_CREATOR_SKILL_SLUG,
  );
  const dataSkill = new ManagedSkillService(
    app.isPackaged
      ? join(process.resourcesPath, "managed-skills", "openownbot-data", "SKILL.md")
      : resolve(__dirname, "../../resources/managed-skills/openownbot-data/SKILL.md"),
    undefined,
    undefined,
    DATA_SKILL_SLUG,
  );
  await Effect.runPromise(managedSkills.syncAll(store.list()));
  await Effect.runPromise(skillCreator.syncAll(store.list()));
  await Effect.runPromise(dataSkill.syncAll(store.list()));
  performance.mark("openownbot:services.skills");
  const hostedSites = new HostedSiteDesktopService(centralAuth, () => {
    // Read at request time: the team store is created later, and the server can register after launch.
    const hostId = teamStore.getIdentity()?.serverId;
    return hostId ? centralAuth.hostSiteCredential(hostId) : null;
  });
  const billing = new BillingDesktopService(centralAuth, openLink);
  const license = new LicenseDesktopService(centralAuth, openLink);
  const hostedServers = new HostedServerDesktopService(
    withHostingDeveloperKey(centralAuth, hostingDeveloperKey),
    openLink,
    Date.now,
    // A new server is running, but the joined list has no entry for it yet: read the list again.
    (serverId) => {
      if (!remoteServers.list().some((server) => server.id === serverId))
        void Effect.runPromise(remoteServers.invalidateDirectory());
    },
    (serverId, server) => remoteServers.hostedServerStarting(serverId, server),
  );
  const sidebarLayout = new SidebarLayoutStore(join(app.getPath("userData"), SIDEBAR_LAYOUT_FILE));
  await runCauseEffect(sidebarLayout.initialize());
  const mailbox = new MailboxStore(app.getPath("userData"), store.sharedRoot, store.database);
  await runCauseEffect(mailbox.initialize());
  configureApplicationProtocol();
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  const teamWebRtcBridge = new TeamWebRtcBridge({
    developmentUrl: developmentUrl ?? null,
    iceTransportPolicy: developmentUrl && process.env.OPENOWNBOT_DEV_ICE_TRANSPORT_POLICY === "relay" ? "relay" : "all",
  });
  teamWebRtcBridge.on("accountProfileChanged", refreshAccountProfile);
  teardown.push(TEARDOWN_ORDER.teamWebRtcBridge, "the team WebRTC bridge", () =>
    runCauseEffect(teamWebRtcBridge.stop()),
  );
  // Only a hosted, self-hosted or container server: one unit or container holds ROBot and every
  // agent process. The desktop app does not hold turns for memory.
  const hostMemory =
    hostedServer || serverModeEnvironment
      ? new ServerMemory({
          hostedPlan: hostedServer !== null,
          onError: (message, error) => logger.warn(message, toLogValue(error)),
          onAgentProcessStopped: (stopped) =>
            logger.warn("Stopped a leftover agent process to free memory.", { ...stopped }),
        })
      : null;
  // Every provider process on a server gets the marker of leftover agent processes and the CPU limit
  // module for Node. The module must exist: Node does not start when a `--require` file is missing.
  const cpuLimitModule = app.isPackaged
    ? join(process.resourcesPath, "agent-runtime", "cpu-limit.cjs")
    : resolve(__dirname, "../../resources/agent-runtime/cpu-limit.cjs");
  const serverEnvironment = hostMemory
    ? agentProcessEnvironment(existsSync(cpuLimitModule) ? cpuLimitModule : null)
    : null;
  if (hostMemory) {
    hostMemory.start();
    teardown.push(TEARDOWN_ORDER.serverMemory, "the server memory reading", () => Effect.runPromise(hostMemory.stop()));
  }
  const browserProfileStore = new BrowserProfileStore(store.database);
  const browser = new BrowserHost(mainWindow, store.downloadsRoot, join(app.getPath("userData"), BROWSER_STATE_FILE), {
    memoryLow: () => (hostMemory?.level() ?? "ok") !== "ok",
    browserProfile: (agentId) => {
      const agent = store.list().find((candidate) => candidate.id === agentId);
      return agent ? agentBrowserProfile(agent) : { kind: "shared" };
    },
    profileExists: (profileId) => browserProfileStore.get(profileId) !== undefined,
  });
  teardown.push(TEARDOWN_ORDER.browser, "the browser", () => runCauseEffect(browser.destroy()));
  await runCauseEffect(browser.restore(store.list().map((agent) => ({ id: agent.id, threadId: agent.threadId }))));
  performance.mark("openownbot:services.browser");
  const browserPictureInPicture = new BrowserPictureInPicture({
    // A value, deliberately: the window this is docked to is the one that exists now. The event
    // callback below is the opposite case and re-reads, because it fires long after a macOS window
    // close and rebuild would have made this reference stale.
    mainWindow,
    browser,
    preloadPath: join(__dirname, "../preload/index.cjs"),
    iconPath: appIconPath,
    ...(developmentUrl === undefined ? {} : { developmentUrl }),
    onEvent: (event) => {
      const window = windows.getMainWindow();
      if (!window || window.isDestroyed()) return;
      sendToRenderer(window, IPC_ENDPOINTS.browser.pictureInPictureEvent, event);
    },
  });
  teardown.push(TEARDOWN_ORDER.browserPictureInPicture, "picture in picture", () => browserPictureInPicture.destroy());
  const localSignIn = new LocalSignInWindows();
  teardown.push(TEARDOWN_ORDER.localSignIn, "the local sign-in window", () => Effect.runPromise(localSignIn.discard()));
  // A value, as for Picture in Picture: the overlay is a view in the window that the browser shows its pages in.
  const browserDock = new BrowserDockOverlay({
    mainWindow,
    preloadPath: join(__dirname, "../preload/index.cjs"),
    load: loadBrowserDockRenderer,
    forwardShortcut: (input) => browser.forwardDockShortcut(input),
  });
  browser.setMainPageListener((page) => browserDock.setPage(page));
  teardown.push(TEARDOWN_ORDER.browserDock, "the browser dock", () => {
    browser.setMainPageListener(null);
    browserDock.destroy();
  });
  browser.onChanged((tabs, activeTabId) => forwardBrowserDisplayState({ tabs, activeTabId }));
  const setupFile = join(app.getPath("userData"), SETUP_FILE);
  const updatePreferenceFile = join(app.getPath("userData"), UPDATE_PREFERENCE_FILE);
  const routineHoldFile = join(app.getPath("userData"), ROUTINE_HOLD_FILE);
  const setupState = await runCauseEffect(readSetupState(setupFile));
  // Loaded before the first window and before the application menu is built, so every native
  // surface draws in the saved language on the first frame rather than switching after startup.
  const language = new LanguageService({
    path: join(app.getPath("userData"), LANGUAGE_PREFERENCE_FILE),
    systemLocale: app.getLocale(),
  });
  await runCauseEffect(language.load());
  const logoColor = new LogoColorService({ path: join(app.getPath("userData"), LOGO_COLOR_PREFERENCE_FILE) });
  await runCauseEffect(logoColor.load());
  // Before the renderer loads, so the window background takes the saved colors.
  const appearance = new AppearanceService({
    path: join(app.getPath("userData"), APPEARANCE_PREFERENCE_FILE),
    supportsTransparentWindow: process.platform === "darwin",
  });
  await runCauseEffect(appearance.load());
  // Before the renderer loads, so its first navigation applies the saved size.
  const interfaceSize = new InterfaceSizeService({
    path: join(app.getPath("userData"), INTERFACE_SIZE_PREFERENCE_FILE),
  });
  await runCauseEffect(interfaceSize.load());
  const notificationPreference = new NotificationPreferenceStore(
    join(app.getPath("userData"), NOTIFICATION_PREFERENCE_FILE),
  );
  await runCauseEffect(notificationPreference.load());
  const busyMessageMode = new BusyMessageModePreferenceStore(
    join(app.getPath("userData"), BUSY_MESSAGE_MODE_PREFERENCE_FILE),
  );
  await runCauseEffect(busyMessageMode.load());
  const agentMemoryLimit = new AgentMemoryLimitPreferenceStore(
    join(app.getPath("userData"), AGENT_MEMORY_LIMIT_PREFERENCE_FILE),
  );
  await runCauseEffect(agentMemoryLimit.load());
  const memoryReview = new MemoryReviewPreferenceStore(join(app.getPath("userData"), MEMORY_REVIEW_PREFERENCE_FILE));
  await runCauseEffect(memoryReview.load());
  logger.warn("The roles file did not load. Members get no access to agents until an admin saves the roles.");
  const serverTimezone = new ServerTimezonePreferenceStore(
    join(app.getPath("userData"), SERVER_TIMEZONE_PREFERENCE_FILE),
  );
  await runCauseEffect(serverTimezone.load());
  const promptCacheTtl = new PromptCacheTtlPreferenceStore(
    join(app.getPath("userData"), PROMPT_CACHE_TTL_PREFERENCE_FILE),
  );
  await runCauseEffect(promptCacheTtl.load());
  const remoteSessionReuse = createRemoteSessionReusePreferenceStore(
    join(app.getPath("userData"), REMOTE_SESSION_REUSE_PREFERENCE_FILE),
  );
  await runCauseEffect(remoteSessionReuse.load());
  await runCauseEffect(externalLinkPreference.load());
  const remoteNetworkRoute = createRemoteNetworkRoutePreferenceStore(
    join(app.getPath("userData"), REMOTE_NETWORK_ROUTE_PREFERENCE_FILE),
  );
  await runCauseEffect(remoteNetworkRoute.load());
  const appBehavior = new AppBehaviorService({
    path: join(app.getPath("userData"), APP_BEHAVIOR_PREFERENCE_FILE),
    loginItem: createLoginItem({ appVariant, server: Boolean(hostedServer || serverModeEnvironment) }),
    offersBackground: process.platform !== "darwin" && !hostedServer && !serverModeEnvironment,
    offersKeepAwake: process.platform !== "linux" && !hostedServer && !serverModeEnvironment,
  });
  await runCauseEffect(appBehavior.load());
  void Effect.runPromise(appBehavior.refreshLoginItem()).catch((error) =>
    logger.warn("The login item did not refresh.", toLogValue(error)),
  );
  const remoteSessionCache = new RemoteSessionCache({
    path: join(app.getPath("userData"), REMOTE_SESSIONS_FILE),
    enabled: remoteSessionReuse.get().keepBetweenRuns,
    ...safeStorageCipher("error.app.macSecureStorageUnavailable"),
  });
  // A kept session is useless without an account, and it names the last one. The listener also
  // covers a sign-out that settles before the remote services exist.
  const forgetSignedOutSessions = (state: CentralAuthState) => {
    if (state.status === "signed_out") void Effect.runPromise(remoteSessionCache.clear());
  };
  forgetSignedOutSessions(centralAuth.getState());
  centralAuth.on("changed", forgetSignedOutSessions);
  const updatePreference = await runCauseEffect(readUpdatePreference(updatePreferenceFile));
  const approvalAutomationFile = join(app.getPath("userData"), APPROVAL_AUTOMATION_FILE);
  const approvalAutomation = new ApprovalAutomation({
    path: approvalAutomationFile,
    initial: await runCauseEffect(readApprovalAutomation(approvalAutomationFile)),
    knownAgentIds: () => store.list().map((agent) => agent.id),
  });
  /*
   * The installed CLIs are the computer's, the partial downloads are this profile's.
   *
   * Development gives every renderer port and every `--isolated` worktree a `userData` of its own,
   * so a store kept there started empty each time: ROBot fell back to the user's own CLI, offered
   * the pinned version against it, and downloaded 144 MB again for a profile that would be replaced
   * by the next port. The packaged app's `userData` is `appData/ROBot`, so the shared
   * store is the path it always used. The switch is read here rather than imported from the entry
   * point, which this file may not reach into; both readers read the same immutable value.
   */
  const providerUse = new ProviderUseSettingsStore(join(app.getPath("userData"), "provider-use.json"));
  await runCauseEffect(providerUse.load());
  const providerAccounts = new ProviderAccountStore(
    join(app.getPath("userData"), "provider-accounts.json"),
    join(app.getPath("userData"), "provider-accounts"),
  );
  await runCauseEffect(providerAccounts.load());
  const providerCliAppVersion = createProviderCliAppVersionStore(
    join(app.getPath("userData"), PROVIDER_CLI_APP_VERSION_FILE),
  );
  await runCauseEffect(providerCliAppVersion.load());
  const providerRuntimes = new ProviderRuntimeManager({
    isProviderOn: (provider) => !providerUse.off().includes(provider),
    root: providerRuntimeRoot({
      appData: app.getPath("appData"),
      userDataOverride: app.commandLine.getSwitchValue("user-data-dir"),
    }),
    downloadRoot: join(app.getPath("userData"), "provider-runtimes", ".downloads"),
    updateRuntime: (runtime, install, signal, onWait) => {
      if (isManagedToolRuntime(runtime)) return install().pipe(Effect.asVoid);
      return service
        .updateProviderCli(
          runtime,
          () =>
            install().pipe(
              Effect.mapError(
                (error) => new AgentLifecycleFailed({ operation: "updateProviderCli.install", cause: error.cause }),
              ),
            ),
          signal,
          onWait,
        )
        .pipe(Effect.asVoid, toProviderRuntimeFailure);
    },
  });
  teardown.push(TEARDOWN_ORDER.providerRuntimes, "the provider runtimes", () =>
    runCauseEffect(providerRuntimes.stop()),
  );
  // Before `new AgentService`, which reads every `executablePath` eagerly.
  await runCauseEffect(providerRuntimes.initialize());
  const secretCipher = safeStorageCipher("error.app.secretStorageUnavailable");
  const claudeEnvironment = new ClaudeEnvironmentStore({
    path: join(app.getPath("userData"), CLAUDE_ENVIRONMENT_PREFERENCE_FILE),
    cipher: secretCipher,
  });
  await runCauseEffect(claudeEnvironment.load());
  const decisionModel = new DecisionModelStore({
    settingsPath: join(app.getPath("userData"), "decision-model.json"),
    keysPath: join(app.getPath("userData"), "decision-model-keys.json"),
    cipher: secretCipher,
  });
  await runCauseEffect(decisionModel.load());
  const customProviders = new CustomProviderStore({
    path: join(app.getPath("userData"), CUSTOM_PROVIDERS_FILE),
    cipher: secretCipher,
  });
  // Before the service, which reads the endpoints at its first provider spawn. A file this build
  // cannot read leaves the list empty and every write refused; it does not stop the app.
  await runCauseEffect(customProviders.load());
  // The same reasons as the endpoints: before the service, and a file this build cannot read only
  // refuses the writes.
  const customAgents = new CustomAgentStore({
    path: join(app.getPath("userData"), CUSTOM_AGENTS_FILE),
    cipher: secretCipher,
  });
  await runCauseEffect(customAgents.load());
  const providerDetectionSettings = new ProviderDetectionSettingsStore(
    join(app.getPath("userData"), PROVIDER_DETECTION_SETTINGS_FILE),
  );
  performance.mark("openownbot:services.preferences");
  await runCauseEffect(providerDetectionSettings.load());
  const providerDetection = await Effect.runPromise(
    createProviderDetection({
      settings: providerDetectionSettings,
      customProviders,
      customAgents,
    }),
  );
  teardown.push(TEARDOWN_ORDER.providerDetection, "model server discovery", () =>
    Effect.runPromise(providerDetection.close()),
  );
  /*
   * Loaded before the service, not on first use: a provider spawn reads its key synchronously, so
   * the decrypted map has to already exist by the time any client is built. A machine with no
   * secret storage keeps working on the free tier -- only saving a key needs the cipher.
   */
  const providerCredentials = new ProviderCredentialStore(
    join(app.getPath("userData"), PROVIDER_CREDENTIAL_FILE),
    secretCipher,
  );
  // An unreadable key file is reported, not fatal: the app starts, OpenCode runs on the free models,
  // and Settings tells the user to save the key again. Only the error's class is logged, because a
  // parse message quotes the file.
  performance.mark("openownbot:services.provider-detection");
  const credentialLoadError = await Effect.runPromise(providerCredentials.load());
  if (credentialLoadError) {
    logger.warn(`ROBot could not read the provider key file (${credentialLoadError.name}). It was left unchanged.`);
  }
  /*
   * The MCP sign-ins, in their own file with the same cipher. `mcp-remote` used to keep these where
   * ROBot could not redact them; here they are covered by the same rule as every other secret.
   *
   * Unreadable is not fatal, for the same reason as the keys above: every signed-in server asks for
   * a sign-in again, and nothing else on this machine stops working.
   */
  const mcpOAuthStore = new McpOAuthStore(join(app.getPath("userData"), MCP_OAUTH_FILE), secretCipher);
  const mcpOAuthLoadError = await Effect.runPromise(mcpOAuthStore.load());
  if (mcpOAuthLoadError) {
    logger.warn(`ROBot could not read the MCP sign-in file (${mcpOAuthLoadError.name}). It was left unchanged.`);
  }
  // The OAuth proxy port, so a Codex session resumed after a restart reaches the same address.
  const mcpOAuthProxySettings = new McpOAuthProxySettingsFile(
    join(app.getPath("userData"), MCP_OAUTH_PROXY_FILE),
    secretCipher,
  );
  const { mcpOAuth, signInRelayClient } = await startMcpSignIns({
    language,
    mcpOAuthProxySettings,
    mcpOAuthStore,
    openLink,
    teardown,
    windows,
  });
  const { githubConnector } = await startGitHubConnector({ centralAuthApiUrl, openLink, secretCipher, teardown });
  const { bitwardenConnector } = await startBitwardenConnector({ secretCipher, teardown });

  /*
   * The Vault in Server settings. Every agent fills its logins, cards and contact info; the file
   * holds no resource, so nothing is torn down.
   */
  const vault = new VaultService({
    store: new VaultStore(join(app.getPath("userData"), VAULT_FILE), secretCipher),
    canPersist: secretCipher.canPersist,
  });
  await Effect.runPromise(vault.load());

  /*
   * The 1Password connection. The browser fills logins from it, so the agent service reads it. The
   * login list is read from 1Password in the background; startup does not wait for it.
   */
  const onePasswordCliTarget = runtimeTarget(process.platform, process.arch);
  const onePasswordConnector = new OnePasswordConnectorService({
    store: new OnePasswordConnectorStore(join(app.getPath("userData"), ONEPASSWORD_CONNECTOR_FILE), secretCipher),
    hostName: hostname(),
    appVersion: app.getVersion(),
    // Outside every root an agent can write, like the GitHub tool files.
    cliInstall: onePasswordCliTarget
      ? { directory: join(app.getPath("userData"), "provider-state", "1password-cli"), target: onePasswordCliTarget }
      : null,
    openExternal: openLink,
  });
  await runCauseEffect(onePasswordConnector.load());
  performance.mark("openownbot:services.connectors");
  teardown.push(TEARDOWN_ORDER.onePasswordConnector, "the 1Password connection", () =>
    runCauseEffect(onePasswordConnector.dispose()),
  );
  // Read by the resource monitor.
  const statementTimings = new StatementTimings();
  const tables = new AgentTables({
    sharedRoot: store.sharedRoot,
    supervisor: new AgentDatabaseSupervisor({
      spawnHost: spawnAgentDatabaseHost,
      onStatementSettled: (durationMs) => statementTimings.record(durationMs),
    }),
  });
  const { computerUseHighlight, computerUseReads, cuaDriver } = await startComputerUse({
    quitting,
    teardown,
    // `service` is built below; the highlight controller reads it only after it starts.
    earliestRunningTurnStartedAt: () => service.earliestRunningTurnStartedAt(),
  });
  // The overlays are ROBot windows, so they can mark only the display ROBot is on. With an agent
  // display of its own, the driver works where they cannot be drawn.
  const drawsComputerUseHighlight = !hasSeparateAgentDisplay(process.platform);
  const computerUsePermissionHelp = new ComputerUsePermissionHelpWindowController({
    createWindow: () => createComputerUsePermissionHelpWindow(language.translate),
    loadWindow: loadComputerUsePermissionHelpRenderer,
    // The bundle that owns this process, which is the one macOS attributes every click and capture
    // to. In a development build that is Electron itself, and the window says so.
    bundlePath: () => applicationBundlePath(app.getPath("exe"), process.platform),
    // `large` is 32 points, which is the size a drag image is drawn at.
    // Read out of the bundle rather than asked of macOS: `app.getFileIcon` ends the main process
    // on this Electron. The app's own icon stands in for a bundle that carries none, because a drag
    // with no image is refused and would leave the user with a card that does nothing.
    bundleIcon: async (path) => {
      const resources = join(path, "Contents", "Resources");
      const names: string[] = await readdir(resources).catch(() => []);
      const iconName = applicationIconName(path, names);
      const icon = iconName ? nativeImage.createFromPath(join(resources, iconName)) : nativeImage.createEmpty();
      // A bundle icon is drawn at up to 1024 points, and a drag carries the image at its own size:
      // unresized it covers the pane the user is dragging onto.
      return (icon.isEmpty() ? nativeImage.createFromPath(appIconPath) : icon).resize({ width: 32, height: 32 });
    },
    revealPath: (path) => shell.showItemInFolder(path),
  });
  // An always-on-top window that outlived the quit would be the last thing on the desktop.
  teardown.push(TEARDOWN_ORDER.computerUsePermissionHelp, "the Computer Use permission help", () => {
    computerUsePermissionHelp.close();
  });
  // Windows only: there the Antigravity server unpacks about 310 MB at each start, and the process
  // tree stop ends every command it started, so none outlives its folder. Elsewhere the system
  // folder stays: a macOS path in userData has a space and is too long for a Unix socket.
  const providerTempDirectory = join(app.getPath("userData"), "provider-temp");
  performance.mark("openownbot:services.computer-use");
  if (process.platform === "win32") await Effect.runPromise(sweepProviderTemp(providerTempDirectory));
  // Outside every workspace. Each saved key is masked in the logs before the first agent starts.
  const agentApiKeys = new AgentApiKeys(join(app.getPath("userData"), "agent-api-keys"));
  await Effect.runPromise(agentApiKeys.registerSaved());
  // The schedule triggers of workflows share the routine timer; built after the workflows below.
  let workflowTriggers: WorkflowTriggers | null = null;
  const service: AgentService = new AgentService({
    store,
    mailbox,
    browser,
    visualPreview: new ChatVisualPreviewer(),
    prepareMcpTest: (config) =>
      prepareToolRuntimeForTest(config, {
        startToolRuntimes: () => {
          Effect.runFork(providerRuntimes.ensureToolRuntimes());
        },
        ensureToolRuntimesReady: () => providerRuntimes.ensureToolRuntimesReady(),
        toolRuntimes: () => providerRuntimes.mcpToolRuntimes(),
      }),
    // `desktopCapturer` captures the display ROBot is on. With an agent display of its own, that
    // is only the ROBot window, so agents take their screenshots with the Computer Use driver.
    screenCapture: hasSeparateAgentDisplay(process.platform)
      ? null
      : new ScreenCapturer({
          platform: process.platform,
          screenAccess: () => systemPreferences.getMediaAccessStatus("screen"),
          displays: () => screen.getAllDisplays(),
          primaryDisplayId: () => screen.getPrimaryDisplay().id,
          getSources: (options) => desktopCapturer.getSources(options),
        }),
    fastComputerUse: createFastComputerUseHost({
      backend: () => decisionModel.resolveForComputerUse(),
      // The same condition as the entry that agents are handed: no tools while a grant is missing.
      socketPath: () => (cuaDriver.mcpServerForProviders() ? cuaDriver.socketPath() : null),
      fetch: (url, init) => fetch(url, init),
    }),
    hostMemory,
    requestTimeoutMs: 30_000,
    offProviders: providerUse.off(),
    providerAccounts,
    saveProviderUse: (provider, on) =>
      providerUse.set(provider, on).pipe(
        Effect.tap(() => providerRuntimes.providerUseChanged()),
        Effect.mapError((error) => new AgentLifecycleFailed({ operation: "saveProviderUse", cause: error.cause })),
      ),
    preferredProvider: setupState.preferredProvider ?? "codex",
    bundledExecutables: providerRuntimes.bundledExecutables(),
    prepareAgentWorkspace: (agent) =>
      Effect.gen(function* () {
        yield* managedSkills.syncAgent(agent);
        yield* skillCreator.syncAgent(agent);
        yield* dataSkill.syncAgent(agent);
      }),
    hostedSites: {
      list: () => hostedSites.list().pipe(toHostedSiteOperationFailed),
      publish: (input, roots) => hostedSites.publish(input, roots).pipe(toHostedSiteOperationFailed),
      replace: (input, roots) => hostedSites.replace(input, roots).pipe(toHostedSiteOperationFailed),
      delete: (siteId) => hostedSites.delete(siteId).pipe(toHostedSiteOperationFailed),
    },
    sidebarLayout,
    preferredModel: setupState.preferredModel,
    // Only a dev build leads with the OpenCode development model; a packaged app keeps the
    // built-in default.
    developmentDefaults: appVariant === "dev",
    credentials: {
      apiKey: (provider) => providerCredentials.get(provider),
      // Read at each Claude spawn, so a change from Server settings applies to the next process.
      promptCacheTtl: () => promptCacheTtl.get().ttl,
      // Read at each Claude spawn, like the prompt cache time.
      claudeEnvironment: () => claudeEnvironment.values(),
      // `configs()`, not `list()`: this is the one path the API keys travel, and it ends at the
      // spawned provider process. The IPC handlers are given `list()`.
      customProviders: () => customProviders.configs(),
      // The same rule: `configs()`, with the environment values, goes to the agent process only.
      customAgents: () => customAgents.configs(),
      // The enabled MCP servers, read at each spawn. The service owns the store, so this reads back
      // into the object being constructed; nothing calls it before the constructor returns.
      mcpServers: () => service.mcp.enabled(),
      // The floor under those servers: the `bin` of every managed tool runtime, appended after the
      // user's own `PATH`, so a machine with no Node can still start `npx some-server` and a machine
      // that has one keeps the build it installed.
      mcpToolRuntimes: () => providerRuntimes.mcpToolRuntimes(),
      // The sign-ins of the http servers. The service hands a provider a route of its OAuth proxy,
      // never the token; only a test the user pressed may open a browser.
      mcpOAuth,
      mcpOAuthProxySettings,
      providerStateDirectory: join(app.getPath("userData"), "provider-state"),
      ...(process.platform === "win32" ? { providerTempDirectory } : {}),
      ...(serverEnvironment ? { serverEnvironment } : {}),
      // The GitHub entries are paths only: `gh` and `git` read the token from the files the connection
      // keeps current. On a server with an agent display, `DISPLAY` names it, so a program an agent
      // starts opens where the driver sees it.
      agentEnvironment: (inherited) => ({
        ...agentDisplayEnvironment(process.platform),
        ...githubConnector.agentEnvironment(inherited),
      }),
    },
    // Appended to the stored servers at each spawn, so the same tools reach Codex, Claude and the
    // ACP providers. Null until the daemon runs, which is what keeps a machine with no driver from
    // handing every provider a command it cannot start.
    computerUseMcpServer: () => cuaDriver.mcpServerForProviders(),
    githubConnector: {
      mcpServer: () => githubConnector.mcpServer(),
      mcpAuthorization: () => githubConnector.mcpAuthorization().pipe(toMcpGatewayFailed),
    },
    passwordVault: passwordVaultRouter([
      { prefix: "", vault: onePasswordConnector },
      { prefix: "bitwarden:", vault: bitwardenConnector },
      { prefix: "openownbot:", vault: vault.logins },
    ]),
    vaultItems: vault.items,
    agentApiKeys,
    localSkillTools: () => localSkillTools(skills),
    routineFlowTools: () => routineFlowRuntime,
    workflowTools: () => workflowRuntime,
    // `events` is built later, after the account service and the relay.
    webhookRoutines: () => agentWebhookRoutineWriter(events),
    approvalAutomation,
    busyMessageMode: () => busyMessageMode.get().mode,
    decisionBackend: () => decisionModel.resolve(),
    agentMemoryLimit: () => agentMemoryLimit.get().limit,
    memoryReviewInterval: () => memoryReview.get().interval,
    timezone: () => serverTimezone.effective(),
    // `workflowTriggers` is built later, after the workflows.
    extraRoutineSources: () => (workflowTriggers ? [workflowTriggers] : []),
    // `host` is built later, after the agent service; a channel tool reads it when it runs.
    channelPersonAgentLevel: (personId, agentId) => host.channelPersonAgentLevel(personId, agentId),
    channelRemotePerson: (personId) => host.channelPersonIsRemote(personId),
    // The delete also clears the agent from workflow nodes, so the editors of those workflows load
    // the new graph. `workflowStore` is built later, after the agent service.
    deleteWithRevokedApproval: (agentId, remove) =>
      Effect.suspend(() => {
        const workflowIds = workflowStore.workflowsOfAgent(agentId);
        return approvalAutomation.deleteAgent(agentId, remove).pipe(
          toAgentRemovalFailed,
          Effect.tap(() =>
            Effect.sync(() => {
              for (const workflowId of workflowIds) service.notifyWorkflowsChanged(workflowId);
            }),
          ),
        );
      }),
    tables,
  });
  teardown.push(TEARDOWN_ORDER.service, "the agent service", () => runCauseEffect(service.stop()));
  const agentMemoryLimitSetting = reloadingAgentMemoryLimit(agentMemoryLimit, service);
  /** The answer an agent gave in one turn, for routine flows, routine results and local scripts. */
  const turnAnswer = (agentId: string, turnId: string): string | null => {
    const threadId = store.list().find((agent) => agent.id === agentId)?.threadId;
    if (!threadId) return null;
    return latestTurnAnswer(store.database.readTurnAssistantMessages(agentId, threadId, turnId), turnId)?.text ?? null;
  };
  const { automation } = startAutomation({ agentDefaults, mailbox, service, store, teardown, turnAnswer });
  const { routineFlowRuntime, workflowRuntime, workflowStore } = await startFlows({
    forwardWorkflowNotice,
    mailbox,
    serverTimezone,
    service,
    store,
    teardown,
    turnAnswer,
  });
  workflowTriggers = new WorkflowTriggers({
    store: workflowStore,
    timezone: () => serverTimezone.effective(),
    start: (start) => workflowRuntime.startScheduled(start),
    changed: (workflowId) => service.notifyWorkflowsChanged(workflowId),
  });
  service.routineTimer.arm();
  // An agent event too, so joined admins and the web app read the Vault again. It carries no item.
  vault.onChanged(() => service.notifyVaultChanged());
  teardown.push(TEARDOWN_ORDER.workflows, "the workflows", () => Effect.runPromise(workflowRuntime.close()));
  // An agent routine's answer sent on to a messaging place; see `routine-results.ts`.
  const routineResultRuntime = await Effect.runPromise(
    createRoutineResults({
      store: new RoutineResultStore(store.database),
      delivery: (deliveryId) => {
        const found = mailbox.getDelivery(deliveryId)?.delivery;
        return found ? { turnId: found.turnId } : null;
      },
      turnAnswer,
      connection: (connectionId) => {
        const record = service.messaging.store.connection(connectionId);
        return record?.enabled ? { platform: record.platform, name: record.workspaceName } : null;
      },
      options: () => service.messaging.destinationOptions(),
      post: (connectionId, placeId, markdown) => service.messaging.deliver(connectionId, placeId, markdown),
      changed: (agentIds) => {
        for (const agentId of agentIds) service.notifyRoutineResultsChanged(agentId);
      },
    }),
  );
  service.on("event", (event) => {
    Effect.runFork(routineFlowRuntime.notice(event));
    Effect.runFork(routineResultRuntime.notice(event));
    Effect.runFork(workflowRuntime.notice(event));
  });
  teardown.push(TEARDOWN_ORDER.routineResults, "the routine results", () =>
    Effect.runPromise(routineResultRuntime.close()),
  );
  // Listens only after the user turns the feed on in Server Settings > Routines.
  const routineFeed = new RoutineFeedServer({
    path: join(app.getPath("userData"), ROUTINE_FEED_FILE),
    cipher: secretCipher,
    document: localRoutineFeedDocument(service, language.translate),
  });
  await Effect.runPromise(routineFeed.start());
  teardown.push(TEARDOWN_ORDER.routineFeed, "the routine feed", () => Effect.runPromise(routineFeed.stop()));
  // The host id is read when the Signal socket opens, and the team store is built further down, so
  // it starts as "no name yet".
  let ingressHostId: () => string | null = () => null;
  performance.mark("openownbot:services.routines");
  const { messaging, signalIngress } = await createMessagingServices({
    teardown,
    secretCipher,
    centralAuth,
    service,
    sidebarLayout,
    readHostId: () => ingressHostId(),
    openLink,
  });
  // A connect, a disconnect or an expiry changes the tools and the `gh` sign-in of every agent.
  githubConnector.onAgentAccessChanged(() => {
    void runCauseEffect(service.notifyGitHubConnectorChanged()).catch((error) =>
      logger.warn("Provider tools did not refresh.", toLogValue(error)),
    );
  });
  // The capability and the tool list both follow the daemon, and nothing else can tell them: no
  // provider probe reaches the driver, because the driver is this process's child.
  // The held state first: the providers start at `unavailable`, and a listener hears only what
  // changes, so a computer that has the driver and neither grant would keep reporting a driver it
  // has until a grant moved.
  service.setComputerUseCapability(computerUseCapability(cuaDriver.lastState));
  cuaDriver.onStateChanged((state) => service.setComputerUseCapability(computerUseCapability(state)));
  // Only when a live session would hold the wrong tool set: this deactivates every agent's stored
  // provider session, so the driver stays quiet for a grant, for the warm-up below, and from the
  // moment ROBot quits, where the sessions are being left for the next run.
  cuaDriver.onMcpServerChanged(() => {
    void runCauseEffect(service.notifyComputerUseChanged()).catch((error) =>
      logger.warn("Provider tools did not refresh.", toLogValue(error)),
    );
  });
  // The rim follows the daemon: it can show nothing while the agents hold no tools, and polling a
  // socket nothing answers would only log failures.
  cuaDriver.onMcpServerChanged(() => {
    if (cuaDriver.mcpServerForProviders()) {
      if (drawsComputerUseHighlight) computerUseHighlight.start();
    } else {
      computerUseHighlight.stop();
      // The daemon this connection was opened to is gone, so the socket behind it is too.
      void Effect.runPromise(computerUseReads.close());
    }
  });
  // A user who granted the permissions expects the tools after a restart without opening the panel,
  // and a remote request or a scheduled task opens no window at all. This starts the daemon once and
  // keeps it only when the grants are there; it raises no prompt, so a user who granted nothing sees
  // nothing. It also tells no listener, because the sessions read back from the database were
  // written by a run that had this same entry.
  //
  // The warm-up tells no listener on purpose, so the rim has to read the result itself: a user who
  // granted the permissions has a running daemon from here on, and nothing else would start it.
  // The fiber ends with an exit rather than a failure, because agent initialization waits for it
  // whether it worked or not.
  const computerUseWarmUp = Effect.runFork(
    cuaDriver.warmUp().pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          if (drawsComputerUseHighlight && cuaDriver.mcpServerForProviders()) computerUseHighlight.start();
        }),
      ),
      Effect.exit,
    ),
  );
  /*
   * Where the decision put the download: onboarding, which is the screen this start is about to
   * show. A user who finished onboarding before ROBot downloaded a runtime at all is asked for
   * one here too, but only when this machine already has an MCP server to start.
   *
   * Nothing waits for it and nothing reports it. MCP is optional, so a failed download must not
   * reach onboarding; a server that cannot start is reported at hand-off like any other.
   */
  if (!setupState.completed || service.mcp.enabled().length > 0) Effect.runFork(providerRuntimes.ensureToolRuntimes());
  // After `new AgentService`, which owns the channels: the layout files channels beside agents, and
  // reconciling against the agents alone would read every channel as gone and drop where it sits.
  performance.mark("openownbot:services.messaging");
  await runCauseEffect(sidebarLayout.reconcileAgents(service.sidebarChatIds()));

  /*
   * The runtime manager decides which provider has an update waiting, by comparing against the
   * latest upstream release. It knows the copies it downloaded itself; a CLI the user installed is
   * only ever reported in the agent status, so it is passed on from here. Its update offer installs
   * a managed copy and leaves the system installation untouched.
   */
  const trackSystemCliVersions = (status: AgentStatus): void => {
    for (const provider of status.providers ?? []) {
      const version = provider.cliSource === "system" ? (provider.version ?? null) : null;
      if (isManagedRuntimeProvider(provider.id)) providerRuntimes.setSystemVersion(provider.id, version);
    }
  };
  trackSystemCliVersions(service.getStatus());
  service.on("event", (event) => {
    if (event.type === "status") trackSystemCliVersions(event.status);
  });
  providerRuntimes.on("status", forwardProviderRuntimeStatus);
  // After the status forward, so the offer a check finds reaches the renderer.
  const appUpgraded = providerCliAppVersion.get().appVersion !== app.getVersion();
  providerRuntimes.startUpdateChecks({ updateInstalled: appUpgraded });
  if (appUpgraded)
    void runCauseEffect(providerCliAppVersion.set({ appVersion: app.getVersion() })).catch((error) =>
      logger.warn("The provider CLI app version did not save.", toLogValue(error)),
    );
  // A tool runtime that becomes ready changes what the MCP servers resolve to, for every
  // provider: sessions that dropped their stdio servers before it finished downloading are
  // marked for refresh, and the deferred mechanism spends the mark before each agent's next
  // turn. Provider CLI updates change no MCP resolution, so only tool runtimes refresh.
  providerRuntimes.on("ready", (runtime) => {
    if (isManagedToolRuntime(runtime)) Effect.runFork(service.refreshAllAgentRuntimes());
  });
  const { storageUsage } = startStorageUsage({ mailbox, service, store, teardown });
  // A grant changed on this computer must reach the phones and web clients that show it.
  approvalAutomation.subscribe(() => service.notifyAgentsChanged());
  const skills = new SkillMarketplaceService(
    centralAuth,
    () => service.listAgents(),
    // Every skill change ends here: install, update, uninstall, turning one on or off, and a skill
    // an agent creates. The event reaches this computer's windows and the joined clients.
    (agentId) =>
      service
        .refreshAgentRuntime(agentId)
        .pipe(Effect.ensuring(Effect.sync(() => service.notifySkillsChanged(agentId)))),
    new LocalSkillLibrary(join(app.getPath("userData"), "local-skills"), () => service.listAgents()),
  );
  const marketplaceAgents = new AgentMarketplaceService(centralAuth, service, skills);
  const agentTemplates = new AgentTemplateService(centralAuth, service, {
    listTemplateSkills: (agentId) => skills.listTemplateSkills(agentId),
    installVersion: (input) => skills.installVersion(input),
    library: () => skills.requireLocalLibrary(),
    installLocal: (input) => skills.installLocal(input),
  });
  const agentSections = new AgentSectionService({
    agents: { list: () => service.listAgents() },
    sidebar: sidebarLayout,
    templates: {
      snapshot: (agentId) => {
        const agent = service.listAgents().find((item) => item.id === agentId);
        return agent
          ? agentTemplates.snapshot(agent)
          : Effect.fail(new Error("The agent for the section file is gone."));
      },
      installSnapshot: (snapshot, avatar, timezone) =>
        agentTemplates
          .installSnapshot(snapshot, avatar, timezone)
          .pipe(Effect.map(({ agent, skillIds }) => ({ agentId: agent.id, skillIds }))),
    },
    skills: { setEnabled: (input) => skills.setEnabled(input) },
  });
  const teamStore = new TeamStore(join(app.getPath("userData"), TEAM_FILE));
  await runCauseEffect(teamStore.initialize());
  performance.mark("openownbot:services.team");
  ingressHostId = () => teamStore.getIdentity()?.serverId ?? null;
  signalIngress.reconnect();
  const { events, eventsRuntime } = startHostEvents({
    centralAuth,
    secretCipher,
    service,
    signalIngress,
    teamStore,
    teardown,
    workflowRuntime,
  });
  // After `teamStore.initialize()` and before `HostService`, which reads the account it activates.
  if (developmentRemoteRole) {
    await runCauseEffect(
      applyDevelopmentRemoteAccount({
        role: developmentRemoteRole,
        centralAuth,
        teamStore,
        setupFile,
        setupCompleted: setupState.completed,
      }),
    );
  }
  // At the same position. A failure leaves the host unconfigured and the app running, so the log
  // shows why; a throw here would make systemd restart the app with a claim that may be spent.
  let hostedServerSignedIn = false;
  const signInHostedServer = (
    environment: HostedServerEnvironment,
    initialization: Effect.Effect<CentralAuthState, RemoteWorkflowError>,
  ) =>
    applyHostedServerAccount({ environment, centralAuth, centralAuthInitialization: initialization, teamStore }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          hostedServerSignedIn = true;
        }),
      ),
    );
  if (hostedServer) {
    await runCauseEffect(signInHostedServer(hostedServer, centralAuthInitialization)).catch((error) =>
      logger.error("The hosted server could not sign in:", toLogValue(error)),
    );
  }

  const teamChatStore = new TeamChatStore(store.database);
  performance.mark("openownbot:services.hosted");
  const remoteDesktopRuntime = await Effect.runPromise(
    resolveRemoteDesktopRuntime({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      sourceRoot: resolve(__dirname, "../.."),
      platform: process.platform === "darwin" || process.platform === "win32" ? process.platform : "linux",
      architecture: process.arch,
      ...(process.env.OPENOWNBOT_REMOTE_DESKTOP_RUNTIME_PATH === undefined
        ? {}
        : { overrideRoot: process.env.OPENOWNBOT_REMOTE_DESKTOP_RUNTIME_PATH }),
    }),
  );
  const agentAdminSettings = createAgentAdminSettings({ agents: service, approvalAutomation });
  const agentHostSettings = createAgentHostSettings({ agents: service, busyMessageMode, agentDefaults });
  const browserProfiles = createBrowserProfileService({ store: browserProfileStore, agents: service, browser });
  const customProviderChanges = createCustomProviderChanges({ service, customProviders });
  const customAgentChanges = createCustomAgentChanges({ service, customAgents });
  const acpRegistry = createAcpRegistry({
    directory: app.getPath("userData"),
    customAgentChanges,
    withRuntimeRemoval: (ids, operation) =>
      service
        .withCustomAgentRuntimeRemoval(ids, () =>
          operation.pipe(
            Effect.mapError(
              (failure) => new AgentLifecycleFailed({ operation: "removeCustomAgentRuntime", cause: failure.cause }),
            ),
          ),
        )
        .pipe(toProviderRuntimeFailure),
  });
  teardown.push(TEARDOWN_ORDER.providerRuntimes - 1, "ACP registry installations", () =>
    runCauseEffect(acpRegistry.close()),
  );
  // The host comes before the updater, and the restart readiness reads the host. The routes reach
  // the schedule through this, and a request that arrives before it exists is refused.
  let requestedUpdate: RequestedUpdate | undefined;
  const installationMode =
    app.isPackaged && process.platform === "linux" ? await runCauseEffect(readInstallationMode()) : null;
  const hostRelease = new HostReleaseService({
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    environment: process.env,
    installationMode,
    updateStatus: () => ({
      phase: requestedUpdate?.snapshot().phase ?? "unsupported",
      managedByHost: requestedUpdate?.snapshot().remoteUpdates === "managed",
    }),
  });
  const scheduledUpdate = (): RequestedUpdate => {
    if (!requestedUpdate) throw new RequestedUpdateRefusal("unsupported");
    return requestedUpdate;
  };
  const { agentImport, hermesImport, instanceTransfer } = createImportServices({
    channelActor: () => host.channelActor(),
    customAgentChanges,
    customProviderChanges,
    providerUse,
    routineFlowRuntime,
    serverTimezone,
    service,
    sidebarLayout,
    skills,
    store,
  });
  const mcpHostSignIns = new McpHostSignIns({ service: service.mcp, browser });
  const providerSignIns = new ProviderHostSignIns({ service, browser });
  const providerAccountsHost = new ProviderAccountsHost({ service, browser });
  // The flows end with the sign-ins they relay, which `mcpHostSignIns`, `providerSignIns` and
  // `providerAccountsHost` close.
  const signInRelayHost = new SignInRelayHost({
    mcp: mcpHostSignIns,
    providers: providerSignIns,
    accounts: providerAccountsHost,
    receiveMcpGrant: (state, code) => mcpOAuth.receiveAuthorizationCode(state, code),
    // The search ignores case, so the exact address is checked again on each agent message it finds.
    printedLink: (agentId, url) =>
      agentPrintedLink(
        service.conversations.search(url, agentId, undefined, 20).results.map(({ message }) => message),
        url,
        Date.now(),
      ),
  });
  teardown.push(TEARDOWN_ORDER.mcpHostSignIns, "MCP sign-ins of joined servers", () =>
    Effect.runPromise(mcpHostSignIns.close()),
  );
  teardown.push(TEARDOWN_ORDER.providerAccountsHost, "Provider account sign-ins of joined servers", () =>
    Effect.runPromise(providerAccountsHost.close()),
  );
  teardown.push(TEARDOWN_ORDER.providerHostSignIns, "Provider sign-ins of joined servers", () =>
    Effect.runPromise(providerSignIns.close()),
  );
  // The live view of a sign-in page in this host's browser: only on Linux, where the Gemini CLI has
  // always printed its page. The relay takes the page on every platform.
  const providerHostSignIns = process.platform === "linux" ? providerSignIns : undefined;
  const pushNotificationStore = new PushNotificationStore(join(app.getPath("userData"), PUSH_NOTIFICATION_FILE));
  await runCauseEffect(pushNotificationStore.load());
  const host = new HostService({
    appVersion: app.getVersion(),
    store: teamStore,
    agents: service,
    // Defined below with the startup it waits for; a request runs only after this returns.
    agentsReady: () => agentInitialization.awaitSettled(),
    events,
    skills,
    sidebarLayout,
    mailbox,
    browser,
    chat: teamChatStore,
    channels: service.channels,
    // Present, so the host advertises `mcp-servers-v1`. The routes are admin-only.
    mcpServers: service.mcp,
    // Present, so the host advertises `mcp-sign-in-v1`. The routes are admin-only.
    mcpSignIns: mcpHostSignIns,
    // Present, so the host advertises `sign-in-relay-v1`. The routes are admin-only.
    signInRelay: signInRelayHost,
    // Present, so the host advertises `connectors-v1`. GitHub answers `available: false` when this
    // build has no GitHub App. The routes are admin-only.
    connectors: { github: githubConnector, messaging },
    // Present, so the host advertises `onepassword-connector-v1`. An owner or admin connects it with
    // a service account token, as a host with no screen cannot approve the 1Password app.
    onePasswordConnector,
    // Present, so the host advertises `bitwarden-connector-v1`. An owner or admin connects it with an
    // API key and the master password: a session key from their computer cannot open this vault.
    bitwardenConnector,
    // Present, so the host advertises `vault-v1`. The routes are admin-only.
    vault,
    // Present on Linux, so the host advertises `provider-host-sign-in-v1`. The routes are admin-only.
    providerHostSignIns,
    // Present, so the host advertises `provider-accounts-v1`. The routes are admin-only.
    providerAccounts: providerAccountsHost,
    // Present, so the host advertises `provider-usage-reset-v1`. The routes are admin-only.
    providerUsageResets: service,
    // Present, so the host advertises `storage-v1`. Members read; only admins delete or clear.
    storage: storageUsage,
    // Present, so the host advertises `hosted-sites-v1`. Members list; only admins delete.
    hostedSites,
    // Present, so the host advertises `agent-import-v1`. Any member can import.
    agentImport,
    // Present, so the host advertises `instance-transfer-v1`. Only owners and admins.
    instanceTransfer,
    // Present, so the host advertises `routine-flows-v1`. Any member who can see the agents.
    routineFlows: routineFlowRuntime,
    // Present, so the host advertises `workflows-v1`. Any member who can see and talk to the agents.
    workflows: { ...workflowRuntime, rotateWorkflowSecret: (input) => events.rotateWorkflowSecret(input) },
    // Present, so the host advertises `agent-hidden-v1`. Any member can hide or restore an agent that they can see.
    hiddenAgents: service,
    // Present, so the host advertises `agent-access-v1`. Only owners and admins change the roles.
    // Present, so the host advertises `agent-tasks-v1`. Any member who can send a message to the agent.
    agentTasks: service,
    // Present, so the host advertises `browser-profiles-v1`. Only owners and admins change profiles;
    // any member reads the profile labels of the tabs they can see.
    browserProfiles,
    // True on a hosted server, so the host advertises `focus-use-v1`. Any member can send it.
    focusUse: hostedServer !== null,
    // Each member present advertises its admin capability. Every admin route requires an owner or admin.
    admin: {
      agents: agentAdminSettings,
      agentHost: agentHostSettings,
      sessionSettings: service,
      acpRegistry,
      skills,
      sharedTables: service,
      marketplaceAgents,
      agentTemplates,
      providers: {
        service,
        credentials: providerCredentials,
        runtimes: providerRuntimes,
        customProviders: customProviderChanges,
        pasteSignIn: pasteCodeLoginSupported(),
      },
      release: hostRelease,
      update: {
        snapshot: () => scheduledUpdate().snapshot(),
        check: () => scheduledUpdate().check(),
        start: (member, mode) => scheduledUpdate().start(member, mode),
        requestWhenIdle: (member) => scheduledUpdate().requestWhenIdle(member),
        cancel: () => scheduledUpdate().cancel(),
        changeSettings: (change) => scheduledUpdate().changeSettings(change),
      },
      timezone: serverTimezone,
      memoryLimit: agentMemoryLimitSetting,
      memoryReview,
      promptCacheTtl,
      // The local Settings save does the same two steps (`saveSetup`).
      defaultProvider: {
        // The provider that a new agent starts on now, also before a setup choice: `preferredProvider` above.
        get: () =>
          readSetupState(setupFile).pipe(
            Effect.map((state) => ({
              provider: service.preferredProvider(),
              model: state.preferredProvider === service.preferredProvider() ? state.preferredModel : null,
            })),
          ),
        set: (input) =>
          writeSetupState(setupFile, input).pipe(
            Effect.tap(() => service.setPreferredProvider(input.preferredProvider, input.preferredModel)),
            // The window read the setup once at start, so it gets the new choice.
            Effect.tap((state) =>
              Effect.sync(() => {
                for (const window of BrowserWindow.getAllWindows())
                  sendToRenderer(window, IPC_ENDPOINTS.app.setupState, state);
              }),
            ),
            Effect.map((state) => ({ provider: state.preferredProvider, model: state.preferredModel })),
          ),
      },
      routineResults: routineResultRuntime,
    },
    // The host's Team API routes share the IPC handlers' runtime preparation: a first server
    // saved, enabled, or tested remotely must start and await the managed download like a local one.
    mcpToolRuntimePreparation: {
      startToolRuntimes: () => {
        Effect.runFork(providerRuntimes.ensureToolRuntimes());
      },
      ensureToolRuntimesReady: () => providerRuntimes.ensureToolRuntimesReady(),
      toolRuntimes: () => providerRuntimes.mcpToolRuntimes(),
    },
    teamWebRtcBridge,
    privateNetwork: () => remoteNetworkRoute.get().route === "private",
    registerRemoteHost: (input) => centralAuth.registerRemoteHost(input).pipe(toRemoteWorkflowError),
    handOverRemoteHostKey: (hostId, handover) =>
      centralAuth.handOverRemoteHostKey(hostId, handover).pipe(toRemoteWorkflowError),
    issueRemoteHostTicket: (hostId) => centralAuth.issueRemoteHostTicket(hostId).pipe(toRemoteWorkflowError),
    sendLiveActivityPush: (hostId, push) => centralAuth.sendLiveActivityPush(hostId, push).pipe(toRemoteWorkflowError),
    sendPushNotification: (hostId, push) => centralAuth.sendPushNotification(hostId, push).pipe(toRemoteWorkflowError),
    pushNotificationStore,
    // The owner is at this computer only with recent input, also when the window was left in focus.
    // Then the focused window shows the event, or the desktop notifies. When mute or the level of
    // this server keeps the desktop quiet about the event, the phone tells the owner.
    hostComputerInUse: (event) => {
      const window = windows.getMainWindow();
      if (!window || window.isDestroyed()) return false;
      if (powerMonitor.getSystemIdleState(DESKTOP_USE_MS / 1_000) !== "active") return false;
      if (window.isFocused()) return true;
      // Without a notification service, as on Linux without a daemon, the desktop shows nothing.
      if (!Notification.isSupported()) return false;
      // Read when an event arrives, after the manager below exists.
      const local = remoteServers.list().find((server) => server.id === LOCAL_SERVER_ID);
      return desktopShowsAgentEvent(event, local, notificationPreference.get().desktopNotifications);
    },
    verifyRemoteSessionTicket: (ticket) => centralAuth.verifyRemoteSessionTicket(ticket).pipe(toRemoteWorkflowError),
    endRemoteSession: (sessionId) => centralAuth.endRemoteSession(sessionId).pipe(toRemoteWorkflowError),
    remoteControlPlaneUrl: centralAuth.resolveApiUrl("/"),
    createRemoteInvite: (hostId, input) => centralAuth.createRemoteInvite(hostId, input).pipe(toRemoteWorkflowError),
    listRemoteInvites: (hostId) => centralAuth.listRemoteInvites(hostId).pipe(toRemoteWorkflowError),
    revokeRemoteInvite: (inviteId) => centralAuth.revokeRemoteInvite(inviteId).pipe(toRemoteWorkflowError),
    listRemoteMembers: (hostId) => centralAuth.listRemoteMembers(hostId).pipe(toRemoteWorkflowError),
    updateRemoteMember: (hostId, membershipId, role, reactivate) =>
      centralAuth.updateRemoteMember(hostId, membershipId, role, reactivate).pipe(toRemoteWorkflowError),
    removeRemoteMember: (hostId, membershipId) =>
      centralAuth.removeRemoteMember(hostId, membershipId).pipe(toRemoteWorkflowError),
    updateRemoteHostLogo: (hostId, image, version) =>
      centralAuth.updateRemoteHostLogo(hostId, image, version).pipe(toRemoteWorkflowError),
    localDevelopmentHost: developmentRemoteRole === "host",
    logDirectory: join(app.getPath("userData"), "logs", "remote"),
    // Still a function, and still throws when nobody is signed in: the account is a lifetime
    // state of the running app, not a startup-ordering artifact.
    getSignedInUser: () => centralAuth.getSignedInUser(),
    redeemCentralTicket: (ticket, serverId) =>
      centralAuth.redeemTeamAuthTicket(ticket, serverId).pipe(toRemoteWorkflowError),
    sendTeamInviteEmail: (input) => centralAuth.sendTeamInviteEmail(input).pipe(toRemoteWorkflowError),
    platform: process.platform === "darwin" || process.platform === "win32" ? process.platform : "linux",
    unattended: false,
    remoteDesktopRuntimePaths: remoteDesktopRuntime,
    openRemoteDesktopSetup: (action, appPath) =>
      Effect.tryPromise({
        try: async () => {
          if (action === "reveal") shell.showItemInFolder(appPath);
          else {
            await shell.openExternal(MAC_PERMISSION_URLS[action]);
            await computerUsePermissionHelp.show(action, appPath);
          }
        },
        catch: (cause) => new RemoteWorkflowError({ cause }),
      }),
    remoteDesktopStateDirectory: join(app.getPath("userData"), "remote-desktop-runtime"),
    getRemoteDesktopRuntimeCredentials: () =>
      Effect.suspend(() => {
        if (!safeStorage.isEncryptionAvailable())
          return Effect.fail(
            new RemoteWorkflowError({ cause: new Error(sourceText("error.app.secretStorageUnavailable")) }),
          );
        return loadOrCreateRemoteDesktopCredentials(
          join(app.getPath("userData"), REMOTE_DESKTOP_RUNTIME_SECRET_FILE),
          secretCipher,
        ).pipe(toRemoteWorkflowError);
      }),
    getRemoteDesktopDisplays: () => {
      const primaryId = screen.getPrimaryDisplay().id;
      return screen.getAllDisplays().map((display, index) => ({
        id: String(display.id),
        label: display.label || `Display ${index + 1}`,
        width: display.size.width,
        height: display.size.height,
        primary: display.id === primaryId,
      }));
    },
    // A member's paste in the remote desktop replaces this computer's clipboard, as a copy they make
    // on it does.
    writeRemoteDesktopClipboard: (text) => clipboard.writeText(text),
    getRemoteDesktopIceServers: () =>
      Effect.try({
        try: () => {
          // The private route has no relay, so the remote desktop also connects only over a direct path.
          if (developmentRemoteRole === "host" || remoteNetworkRoute.get().route === "private") return [];
          const identity = teamStore.getIdentity();
          if (!identity) throw new Error(sourceText("error.app.remoteIdentityUnavailable"));
          const iceServers = teamWebRtcBridge.getIceServers(identity.serverId);
          if (iceServers.length === 0) throw new Error(sourceText("error.app.iceServersMissing"));
          return iceServers;
        },
        catch: (cause) => new RemoteWorkflowError({ cause }),
      }),
  });
  teardown.push(TEARDOWN_ORDER.host, "the local host", () => runCauseEffect(host.shutdown()));
  const signedInState = centralAuth.getState();
  if (signedInState.status === "signed_in") {
    await runCauseEffect(host.applySignedInAccount(signedInState.user));
  } else if (signedInState.status === "signed_out") {
    // Sign-out can settle before this service exists, leaving `forwardCentralAuth`
    // nothing to deactivate. Unbinding here is what stops a persisted
    // `activeAccountId` from keeping the last account's host configured - and
    // unconfigurable - while nobody is signed in. A still-loading or failed account
    // service keeps its host, and the event listener settles it.
    await runCauseEffect(host.applySignedInAccount(null));
  }
  performance.mark("openownbot:services.remote-desktop");
  const { resourceMonitor, trace } = startMonitoring({
    browser,
    hostedServer,
    serverModeEnvironment,
    service,
    statementTimings,
    teardown,
  });
  const { remoteServers } = await startRemoteServers({
    centralAuth,
    centralAuthInitialization,
    developmentRemoteRole,
    hostedServers,
    remoteSessionCache,
    teamStore,
    teamWebRtcBridge,
    teardown,
    trace,
  });
  criticalActionTargets = { agents: service, host, remoteServers };
  // After `remoteServers.initialize()`. The client half polls for the host's connection file and
  // throws when it never appears, before any window is shown - see the module it lives in. It reads
  // the joined servers to choose between WebRTC and HTTP, so it waits for the account's host list.
  if (developmentRemoteRole) {
    await runCauseEffect(remoteServers.awaitHostDirectory());
    await runCauseEffect(
      startDevelopmentRemoteRole({
        role: developmentRemoteRole,
        host,
        remoteServers,
      }),
    );
  }
  configureAttachmentProtocol({ mailbox, agents: service, remoteServers });
  configureServerLogoProtocols({ teamStore, remoteServers });
  // After the servers: the view it opens belongs to one of them, and it has to stop before they do.
  const browserView = new BrowserViewClient({
    servers: remoteServers,
    onEvent: (event) => {
      const window = windows.getMainWindow();
      if (!window || window.isDestroyed()) return;
      sendToRenderer(window, IPC_ENDPOINTS.browser.liveViewEvent, event);
    },
  });
  teardown.push(TEARDOWN_ORDER.browserView, "the live browser view", () => runCauseEffect(browserView.stop()));
  const remoteDesktop = new RemoteDesktopManager({
    createRemoteDesktopSession: (serverId) =>
      serverId === "local"
        ? host.createLocalRemoteDesktopTestSession()
        : remoteServers.createRemoteDesktopSession(serverId),
    closeRemoteDesktopSession: (serverId, sessionId) =>
      serverId === "local"
        ? host.closeLocalRemoteDesktopTestSession(sessionId)
        : remoteServers.closeRemoteDesktopSession(serverId, sessionId),
    selectRemoteDesktopDisplay: (serverId, displayId) => {
      if (serverId === "local")
        return Effect.fail(new RemoteWorkflowError({ cause: new Error(sourceText("error.app.finishLocalTest")) }));
      return remoteServers.selectRemoteDesktopDisplay(serverId, displayId);
    },
  });
  teardown.push(TEARDOWN_ORDER.remoteDesktop, "remote desktop", () => Effect.runPromise(remoteDesktop.stop()));
  const { speech, voice } = await startVoice({
    forwardSpeechModelStatus,
    forwardVoiceModelStatus,
    forwardVoiceStreamTranscript,
    secretCipher,
    teardown,
  });
  const { currentVersion, updater } = await startUpdater({
    installationMode,
    prepareForUpdateInstall,
    teardown,
    updatePreference,
  });
  const agentInitialization = new AgentInitializationGate(() =>
    Effect.gen(function* () {
      yield* Fiber.join(computerUseWarmUp);
      yield* service.initialize({ heldRoutines: takeRoutineHold(routineHoldFile, (message) => logger.warn(message)) });
      yield* eventsRuntime.start();
      yield* automation.sync();
      // Picks up the flows a restart stopped between one agent's answer and the next agent's message.
      yield* routineFlowRuntime.sweep();
      // Ends the workflow steps a restart cut off, and moves the runs on.
      yield* workflowRuntime.sweep();
      // Marks the posts a restart cut off, and sends the answers that ended while ROBot was closed.
      yield* routineResultRuntime.recover();
    }),
  );
  const describeRestartReadiness = (): RestartReadiness =>
    checkRestartReadiness({
      // A workflow model step lives in this process only; agent steps are queued deliveries.
      agentWork: [...service.hasActiveWork(), ...(workflowRuntime.working() ? ["routine-run"] : [])],
      hostBlockers: host.describeRestartBlockers(),
      activeBrowserControls: browser.getControlState().sessions.length,
      activeFileTransfers: remoteServers.hasActiveTransfers(),
      updaterBusy: !updater.getStatus().managedByHost && isUpdateBusyPhase(updater.getStatus().phase),
      initializationPending: !agentInitialization.succeeded,
    });
  const hostUpdateCoordinator = new HostUpdateCoordinator({
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
    pid: process.pid,
    currentVersion,
    describeReadiness: describeRestartReadiness,
    setManagedByHost: (managed) => updater.setManagedByHost(managed),
    setHostState: (state) => updater.setHostState(state),
    onDiagnostic: (message) => logger.warn(message),
    checkHealth: () =>
      Effect.sync(() => {
        if (!agentInitialization.succeeded) return { ok: false, checks: ["initialization-not-ready"] };
        try {
          service.listAgents();
        } catch {
          return { ok: false, checks: ["agent-list-failed"] };
        }
        return { ok: true, checks: ["initialization-succeeded", "agent-list"] };
      }),
  });
  // A client that used the server in the last minutes still uses it.
  const clientInUse = () =>
    host.connectedClientCount() > 0 && Date.now() - (host.lastClientUseAt() ?? 0) < CLIENT_USE_WINDOW_MS;
  // A client wakes a hosted server, and reading is not use. Without this, a member who only reads
  // would see the restart at the end of the disk restore.
  const startedAt = Date.now();
  const clientInUseSinceStart = () =>
    clientInUse() || (host.connectedClientCount() > 0 && Date.now() - startedAt < CLIENT_USE_WINDOW_MS);
  requestedUpdate = new RequestedUpdate({
    updater,
    describeReadiness: describeRestartReadiness,
    preference: updatePreference,
    savePreference: (change) => writeUpdatePreference(updatePreferenceFile, change),
    log: (message) => logger.info(message),
    announce: (state, version) => host.announceRestart(state, version),
    // boat restores the disk of a woken server lazily, so its start no longer applies a release.
    clientInUse: hostedServer ? clientInUseSinceStart : undefined,
  });
  const remoteUpdate = requestedUpdate;
  teardown.push(TEARDOWN_ORDER.requestedUpdate, "the requested update", () =>
    Effect.runPromise(remoteUpdate.dispose()),
  );
  const idleRestart = new IdleRestart({
    updater,
    describeReadiness: describeRestartReadiness,
    holdRoutines: () => service.routineTimer.hold(),
    releaseRoutines: () => service.routineTimer.release(),
    recordHold: (window) => {
      try {
        if (window) writeRoutineHold(routineHoldFile, window);
        else clearRoutineHold(routineHoldFile);
      } catch (error) {
        // The restart goes on: the next start then skips the held routines as missed.
        logger.warn("The routine hold could not be saved.", toLogValue(error));
      }
    },
    relaunch: () => {
      // A development build only quits: its supervisor stops the stack, and a relaunched Electron
      // would run outside it with no renderer server.
      if (app.isPackaged) app.relaunch();
      app.quit();
    },
    log: (message) => logger.info(message),
  });
  teardown.push(TEARDOWN_ORDER.idleRestart, "the restart when idle", () => idleRestart.dispose());
  if (hostedServer) {
    const hostedServerStartRetry = new HostedServerStartRetry({
      hostPhase: () => host.getStatus().phase,
      startHost: () =>
        Effect.gen(function* () {
          // A start with no answer from the account server ends in the auth error state, and only a
          // retry reads the stored session again.
          if (centralAuth.getState().status !== "signed_in") yield* centralAuth.retry().pipe(toRemoteWorkflowError);
          if (!hostedServerSignedIn) yield* signInHostedServer(hostedServer, Effect.succeed(centralAuth.getState()));
          return yield* host.start();
        }),
      onError: (message, error) => logger.warn(message, toLogValue(error)),
    });
    hostedServerStartRetry.start();
    teardown.push(TEARDOWN_ORDER.hostedServerStartRetry, "the hosted server start retry", () =>
      Effect.runPromise(hostedServerStartRetry.stop()),
    );
    const hostedServerActivity = new HostedServerActivity({
      hostId: hostedServer.hostId,
      // A live Slack, Discord or Telegram connection counts only when Signal cannot start the server for
      // the next message and keep it (an older Signal, or no queue key): stopped, the server could not
      // hear it. An open browser view does not count: a view that the user forgot would keep the server
      // running. Input in the view counts as client use.
      inUse: () =>
        service.hasActiveWork().length > 0 ||
        (messaging.hasLiveConnection() && !signalIngress.queueReady()) ||
        host.describeRestartBlockers().some((reason) => reason !== "browser-view") ||
        clientInUse(),
      nextRunAt: () => {
        const dueAt = service.routineTimer.nextDueAt();
        return dueAt ? Date.parse(dueAt) : null;
      },
      report: (path, report) =>
        centralAuth
          .requestAuthorized(
            path,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) },
            () => undefined,
          )
          .pipe(toRemoteWorkflowError),
      onError: (message, error) => logger.warn(message, toLogValue(error)),
    });
    hostedServerActivity.start();
    teardown.push(TEARDOWN_ORDER.hostedServerActivity, "the hosted server activity report", () =>
      Effect.runPromise(hostedServerActivity.stop()),
    );
  } else if (!serverModeEnvironment) {
    // A server that was published at the last quit is published again at launch, once (`index.ts`).
    // That start can fail when the network is not ready yet, such as at login after an update, and
    // the server then stayed private until the user published it again. A published server that a
    // Signal failure puts in the error phase later is published again in the same way.
    const launchPublishRetry = new HostedServerStartRetry({
      hostPhase: () => host.getStatus().phase,
      startHost: () =>
        Effect.gen(function* () {
          // A server that the user stopped is not published again: Stop clears `enabledOnLaunch`.
          if (!shouldAutoStartHost({ ...host.getStatus(), remoteRole: developmentRemoteRole })) return;
          const auth = centralAuth.getState();
          // Only a start with no answer from the account server; any other auth error is the user's.
          if (auth.status === "error" && auth.issue.code === "auth_api_unavailable")
            yield* centralAuth.retry().pipe(toRemoteWorkflowError);
          if (centralAuth.getState().status !== "signed_in") return;
          return yield* host.start();
        }),
      onError: (message, error) => logger.warn(message, toLogValue(error)),
    });
    launchPublishRetry.start();
    teardown.push(TEARDOWN_ORDER.launchPublishRetry, "the launch publish retry", () =>
      Effect.runPromise(launchPublishRetry.stop()),
    );
  }
  const serverMode = serverModeEnvironment
    ? new ServerMode({
        environment: serverModeEnvironment,
        version: app.getVersion(),
        centralAuth,
        host,
        memory: hostMemory,
        onError: (message, error) => logger.warn(message, toLogValue(error)),
      })
    : null;
  if (serverMode) {
    // Without the socket the server still runs, and the log says why nobody can sign it in.
    await runCauseEffect(serverMode.listen()).catch((error) =>
      logger.error("The server control socket did not start:", toLogValue(error)),
    );
    // Nobody presses Retry on a server either. A server that is signed out has nothing to publish.
    const serverStartRetry = new HostedServerStartRetry({
      hostPhase: () => host.getStatus().phase,
      startHost: () =>
        Effect.gen(function* () {
          if (centralAuth.getState().status === "error") yield* centralAuth.retry().pipe(toRemoteWorkflowError);
          yield* serverMode.publish();
        }),
      onError: (message, error) => logger.warn(message, toLogValue(error)),
    });
    serverStartRetry.start();
    teardown.push(TEARDOWN_ORDER.serverMode, "the server control socket", async () => {
      await Effect.runPromise(serverStartRetry.stop());
      await Effect.runPromise(serverMode.close());
    });
  }
  performance.mark("openownbot:services.updates");
  await runCauseEffect(hostUpdateCoordinator.tick());
  performance.mark("openownbot:services.host-update");
  hostUpdateCoordinator.start();
  teardown.push(TEARDOWN_ORDER.hostUpdateCoordinator, "the host update coordinator", () =>
    Effect.runPromise(hostUpdateCoordinator.stop()),
  );

  return {
    service,
    routineFlows: routineFlowRuntime,
    workflows: workflowRuntime,
    routineResults: routineResultRuntime,
    providerRuntimes,
    providerCredentials,
    messaging,
    mcpOAuth,
    signInRelayClient,
    relayedMessagingInstalls: new RelayedMessagingInstalls(remoteServers),
    githubConnector,
    onePasswordConnector,
    bitwardenConnector,
    vault,
    mailbox,
    storageUsage,
    browser,
    browserPictureInPicture,
    localSignIn,
    browserDock,
    browserView,
    updater,
    setupFile,
    updatePreferenceFile,
    approvalAutomation,
    agentAdminSettings,
    agentHostSettings,
    browserProfiles,
    language,
    logoColor,
    appearance,
    interfaceSize,
    notificationPreference,
    busyMessageMode,
    agentDefaults,
    agentMemoryLimit: agentMemoryLimitSetting,
    memoryReview,
    serverTimezone,
    promptCacheTtl,
    claudeEnvironment,
    remoteSessionReuse,
    externalLinkPreference,
    externalLinks,
    openLink,
    remoteNetworkRoute,
    remoteSessionCache,
    appBehavior,
    agentInitialization,
    hostUpdateCoordinator,
    requestedUpdate: remoteUpdate,
    idleRestart,
    describeRestartReadiness,
    sidebarLayout,
    host,
    remoteDesktop,
    remoteServers,
    centralAuth,
    skills,
    hostedSites,
    billing,
    license,
    hostedServers,
    routineFeed,
    events,
    eventsRuntime,
    serverMode,
    customProviders,
    customProviderChanges,
    customAgentChanges,
    acpRegistry,
    providerDetection,
    providerDetectionSettings,
    marketplaceAgents,
    agentTemplates,
    agentSections,
    agentImport,
    hermesImport,
    instanceTransfer,
    voice,
    decisionModel,
    speech,
    dynamicIsland,
    cuaDriver,
    computerUseHighlight,
    computerUsePermissionHelp,
    trace,
    resourceMonitor,
    teamStore,
    appliedAccount: signedInState,
    centralAuthInitialization,
  };
}
