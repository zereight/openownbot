import type {
  AppVariant,
  BrowserDisplayState,
  CentralAuthState,
  ProviderRuntimeSnapshot,
  SpeechModelStatus,
  VoiceModelStatus,
  VoiceStreamTranscript,
} from "@robot/contracts/ipc";
import type { Effect } from "effect";
import type { BrowserWindow } from "electron";
import type { AgentLifecycleFailed } from "../../backend/agent/agent-lifecycle-failed";
import type { AgentService } from "../../backend/agent-service";
import type { BrowserHost } from "../../backend/browser-host";
import type { MailboxStore } from "../../backend/mailbox-store";
import type { McpOAuth } from "../../backend/mcp-oauth-provider";
import type { MessagingService } from "../../backend/messaging/messaging-service";
import type { RoutineFlowsHandle } from "../../backend/routine-flows/routine-flows";
import type { RoutineResultsHandle } from "../../backend/routine-results/routine-results";
import type { SidebarLayoutStore } from "../../backend/sidebar-layout-store";
import type { StorageUsageService } from "../../backend/storage-usage";
import type { WorkflowNotice, WorkflowsHandle } from "../../backend/workflows/workflows";
import type { BillingDesktopService } from "../account/billing-service";
import type { CentralAuthManager } from "../account/central-auth-manager";
import type { LicenseDesktopService } from "../account/license-service";
import type { AgentAdminSettingsService } from "../agents/agent-admin-settings";
import type { AgentDefaultsPreferenceStore } from "../agents/agent-defaults-preference-store";
import type { AgentHostSettingsService } from "../agents/agent-host-settings";
import type { AgentImportService } from "../agents/agent-import-service";
import type { AgentInitializationGate } from "../agents/agent-initialization";
import type { AgentMarketplaceService } from "../agents/agent-marketplace-service";
import type { AgentMemoryLimitSetting } from "../agents/agent-memory-limit-preference-store";
import type { AgentSectionService } from "../agents/agent-section-service";
import type { AgentTemplateService } from "../agents/agent-template-service";
import type { ApprovalAutomation } from "../agents/approval-automation-store";
import type { BusyMessageModePreferenceStore } from "../agents/busy-message-mode-preference-store";
import type { CustomAgentChanges } from "../agents/custom-agent-changes";
import type { DecisionModelStore } from "../agents/decision-model-store";
import type { HermesImportService } from "../agents/hermes-import-service";
import type { InstanceTransferService } from "../agents/instance-transfer-service";
import type { MemoryReviewPreferenceStore } from "../agents/memory-review-preference-store";
import type { PromptCacheTtlPreferenceStore } from "../agents/prompt-cache-ttl-preference-store";
import type { BrowserDockOverlay } from "../browser/browser-dock-overlay";
import type { BrowserPictureInPicture } from "../browser/browser-picture-in-picture";
import type { BrowserProfileService } from "../browser/browser-profile-service";
import type { BrowserViewClient } from "../browser/browser-view-client";
import type { LocalSignInWindows } from "../browser/local-sign-in-window";
import type { ComputerUseHighlightController } from "../computer-use/computer-use-highlight-window";
import type { ComputerUsePermissionHelpWindowController } from "../computer-use/computer-use-permission-help-window";
import type { CuaDriverRuntime } from "../computer-use/cua-driver-runtime";
import type { BitwardenConnectorService } from "../connectors/bitwarden-connector-service";
import type { GitHubConnectorService } from "../connectors/github-connector-service";
import type { OnePasswordConnectorService } from "../connectors/onepassword-connector-service";
import type { HostEventsRuntime } from "../events/host-events-runtime";
import type { HostEventsService } from "../events/host-events-service";
import type { HostService } from "../host/host-service";
import type { HostedServerEnvironment } from "../host/hosted-server-bootstrap";
import type { HostedServerDesktopService } from "../host/hosted-server-service";
import type { HostedSiteDesktopService } from "../host/hosted-site-service";
import type { IdleRestart } from "../host/idle-restart";
import type { RelayedMessagingInstalls } from "../messaging/relayed-messaging-installs";
import type { DevelopmentRemoteRole } from "../platform/development-remote-bootstrap";
import type { AcpRegistry } from "../providers/acp-registry";
import type { ClaudeEnvironmentStore } from "../providers/claude-environment-store";
import type { CustomProviderChanges } from "../providers/custom-provider-changes";
import type { CustomProviderStore } from "../providers/custom-provider-store";
import type { ProviderCredentialStore } from "../providers/provider-credential-store";
import type { ProviderDetection } from "../providers/provider-detection";
import type { ProviderDetectionSettingsStore } from "../providers/provider-detection-settings-store";
import type { ProviderRuntimeManager } from "../providers/provider-runtime-manager";
import type { RemoteDesktopManager } from "../remote-desktop/remote-desktop-manager";
import type { RemoteNetworkRoutePreferenceStore } from "../remote-servers/remote-network-route-preference-store";
import type { RemoteServerManager } from "../remote-servers/remote-server-manager";
import type { RemoteWorkflowError } from "../remote-servers/remote-service-effects";
import type { AppBehaviorService } from "../settings/app-behavior-service";
import type { AppearanceService } from "../settings/appearance-service";
import type { InterfaceSizeService } from "../settings/interface-size-service";
import type { LanguageService } from "../settings/language-service";
import type { LogoColorService } from "../settings/logo-color-service";
import type { NotificationPreferenceStore } from "../settings/notification-preference-store";
import type { HostUpdateCoordinator } from "../updates/host-update-coordinator";
import type { DynamicIslandWindowController } from "../windows/dynamic-island-window";
import type { ExternalLinkOpener, ExternalLinkPreferenceStore } from "../windows/external-link-opener";
import type { MacHapticFeedback } from "../windows/mac-haptic-feedback";
import type { MainWindowController } from "../windows/main-window";

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

import type { SignInRelayClient } from "../account/sign-in-relay-client";
import type { RoutineFeedServer } from "../events/routine-feed-server";
import type { ServerMode, ServerModeEnvironment } from "../host/server-mode";
import type { ServerTimezonePreferenceStore } from "../host/server-timezone-preference-store";
import type { ResourceMonitor } from "../platform/resource-monitor";
import type { TeardownRegistry } from "../platform/teardown-registry";
import type { TraceFile } from "../platform/trace-file";
import type { RemoteSessionCache } from "../remote-servers/remote-session-cache";
import type { RemoteSessionReusePreferenceStore } from "../remote-servers/remote-session-reuse-preference-store";
import type { SkillMarketplaceService } from "../skills/skill-marketplace-service";
import type { TeamStore } from "../team/team-store";
import type { RequestedUpdate } from "../updates/requested-update";
import type { RestartReadiness } from "../updates/update-readiness";
import type { UpdateService } from "../updates/update-service";
import type { VaultService } from "../vault/vault-service";
import type { VoiceSpeechService } from "../voice/voice-speech-service";
import type { VoiceTranscriptionService } from "../voice/voice-transcription-service";

export interface ApplicationServiceContext {
  /**
   * The window that exists now, by value. Anything that must survive a macOS close-and-rebuild
   * reads `windows.getMainWindow()` instead - the two type-check identically, so only the call
   * site says which one is correct.
   */
  mainWindow: BrowserWindow;
  windows: MainWindowController;
  appIconPath: string;
  appVariant: AppVariant;
  developmentRemoteRole: DevelopmentRemoteRole | null;
  /** Set only in a hosted server VM. */
  hostedServer: HostedServerEnvironment | null;
  /** Set only in a self-hosted server that `install-server.sh` installed. */
  serverMode: ServerModeEnvironment | null;
  /** Set only by `bun run dev --hosting=test`. */
  hostingDeveloperKey: string | null;
  macHapticFeedback: MacHapticFeedback;
  teardown: TeardownRegistry;
  forwardCentralAuth: (state: CentralAuthState) => void;
  forwardBrowserDisplayState: (state: BrowserDisplayState) => void;
  forwardProviderRuntimeStatus: (snapshot: ProviderRuntimeSnapshot) => void;
  forwardVoiceModelStatus: (status: VoiceModelStatus) => void;
  forwardVoiceStreamTranscript: (transcript: VoiceStreamTranscript) => void;
  forwardSpeechModelStatus: (status: SpeechModelStatus) => void;
  forwardWorkflowNotice: (notice: WorkflowNotice) => void;
  prepareForUpdateInstall: () => Promise<void>;
  /** True once a quit starts, also before this function returns. See `CuaDriverRuntimeOptions.quitting`. */
  quitting: () => boolean;
}

/** Everything the entry point wires up, registers IPC handlers against, and shuts down. */
export interface ApplicationServices {
  service: AgentService;
  routineFlows: RoutineFlowsHandle;
  workflows: WorkflowsHandle;
  routineResults: RoutineResultsHandle;
  providerRuntimes: ProviderRuntimeManager;
  providerCredentials: ProviderCredentialStore;
  /** The Slack and Telegram connections of the agents on this host. */
  messaging: MessagingService;
  /** Reached by the entry point for one thing only: handing a returning grant to its sign-in. */
  mcpOAuth: McpOAuth;
  /** The sign-ins of joined servers that wait in this computer's browser, and the callbacks they take. */
  signInRelayClient: SignInRelayClient;
  /** The Slack and Discord installs that this computer opened for a joined server. */
  relayedMessagingInstalls: RelayedMessagingInstalls;
  githubConnector: GitHubConnectorService;
  onePasswordConnector: OnePasswordConnectorService;
  bitwardenConnector: BitwardenConnectorService;
  vault: VaultService;
  mailbox: MailboxStore;
  storageUsage: StorageUsageService;
  browser: BrowserHost;
  browserPictureInPicture: BrowserPictureInPicture;
  localSignIn: LocalSignInWindows;
  browserDock: BrowserDockOverlay;
  browserView: BrowserViewClient;
  updater: UpdateService;
  /** Point-in-time restart safety for host-managed updates. Nothing holds the instance when empty. */
  describeRestartReadiness: () => RestartReadiness;
  hostUpdateCoordinator: HostUpdateCoordinator;
  /** The update restart that an admin of a joined server asked for (`host-update-v1`). */
  requestedUpdate: RequestedUpdate;
  /** The restart that the user of this computer asked for, when no work runs. */
  idleRestart: IdleRestart;
  setupFile: string;
  updatePreferenceFile: string;
  approvalAutomation: ApprovalAutomation;
  agentAdminSettings: AgentAdminSettingsService;
  agentHostSettings: AgentHostSettingsService;
  browserProfiles: BrowserProfileService;
  language: LanguageService;
  logoColor: LogoColorService;
  appearance: AppearanceService;
  interfaceSize: InterfaceSizeService;
  notificationPreference: NotificationPreferenceStore;
  busyMessageMode: BusyMessageModePreferenceStore;
  agentDefaults: AgentDefaultsPreferenceStore;
  agentMemoryLimit: AgentMemoryLimitSetting;
  memoryReview: MemoryReviewPreferenceStore;
  serverTimezone: ServerTimezonePreferenceStore;
  promptCacheTtl: PromptCacheTtlPreferenceStore;
  claudeEnvironment: ClaudeEnvironmentStore;
  remoteSessionReuse: RemoteSessionReusePreferenceStore;
  externalLinkPreference: ExternalLinkPreferenceStore;
  externalLinks: ExternalLinkOpener;
  /** Opens a web page in the program that the user chose in Settings. */
  openLink: (url: string) => Promise<void>;
  remoteNetworkRoute: RemoteNetworkRoutePreferenceStore;
  remoteSessionCache: RemoteSessionCache;
  appBehavior: AppBehaviorService;
  agentInitialization: AgentInitializationGate<AgentLifecycleFailed>;
  sidebarLayout: SidebarLayoutStore;
  host: HostService;
  remoteDesktop: RemoteDesktopManager;
  remoteServers: RemoteServerManager;
  centralAuth: CentralAuthManager;
  skills: SkillMarketplaceService;
  hostedSites: HostedSiteDesktopService;
  billing: BillingDesktopService;
  license: LicenseDesktopService;
  hostedServers: HostedServerDesktopService;
  routineFeed: RoutineFeedServer;
  events: HostEventsService;
  eventsRuntime: HostEventsRuntime;
  /** The terminal control of a self-hosted server. Null in every other build. */
  serverMode: ServerMode | null;
  customProviders: CustomProviderStore;
  customProviderChanges: CustomProviderChanges;
  customAgentChanges: CustomAgentChanges;
  acpRegistry: AcpRegistry;
  providerDetection: ProviderDetection;
  providerDetectionSettings: ProviderDetectionSettingsStore;
  marketplaceAgents: AgentMarketplaceService;
  agentTemplates: AgentTemplateService;
  agentSections: AgentSectionService;
  agentImport: AgentImportService;
  hermesImport: HermesImportService;
  instanceTransfer: InstanceTransferService;
  voice: VoiceTranscriptionService;
  decisionModel: DecisionModelStore;
  speech: VoiceSpeechService;
  dynamicIsland: DynamicIslandWindowController;
  cuaDriver: CuaDriverRuntime;
  computerUseHighlight: ComputerUseHighlightController;
  computerUsePermissionHelp: ComputerUsePermissionHelpWindowController;
  trace: TraceFile;
  resourceMonitor: ResourceMonitor;
  teamStore: TeamStore;
  /**
   * The account state this function read part-way through, and bound the local host to. The
   * entry point compares it against the current state to find an account that settled after
   * that read, while `forwardCentralAuth` still had no services to apply it to.
   */
  appliedAccount: CentralAuthState;
  /** Left un-awaited on purpose: the account settles in the background while the app opens. */
  centralAuthInitialization: Effect.Effect<CentralAuthState, RemoteWorkflowError>;
}
