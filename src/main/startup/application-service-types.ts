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
import type { AcpRegistry } from "../acp-registry";
import type { AgentAdminSettingsService } from "../agent-admin-settings";
import type { AgentDefaultsPreferenceStore } from "../agent-defaults-preference-store";
import type { AgentHostSettingsService } from "../agent-host-settings";
import type { AgentImportService } from "../agent-import-service";
import type { AgentInitializationGate } from "../agent-initialization";
import type { AgentMarketplaceService } from "../agent-marketplace-service";
import type { AgentMemoryLimitSetting } from "../agent-memory-limit-preference-store";
import type { AgentSectionService } from "../agent-section-service";
import type { AgentTemplateService } from "../agent-template-service";
import type { AppBehaviorService } from "../app-behavior-service";
import type { AppearanceService } from "../appearance-service";
import type { ApprovalAutomation } from "../approval-automation-store";
import type { BillingDesktopService } from "../billing-service";
import type { BitwardenConnectorService } from "../bitwarden-connector-service";
import type { BrowserDockOverlay } from "../browser-dock-overlay";
import type { BrowserPictureInPicture } from "../browser-picture-in-picture";
import type { BrowserProfileService } from "../browser-profile-service";
import type { BrowserViewClient } from "../browser-view-client";
import type { BusyMessageModePreferenceStore } from "../busy-message-mode-preference-store";
import type { CentralAuthManager } from "../central-auth-manager";
import type { ClaudeEnvironmentStore } from "../claude-environment-store";
import type { ComputerUseHighlightController } from "../computer-use-highlight-window";
import type { ComputerUsePermissionHelpWindowController } from "../computer-use-permission-help-window";
import type { CuaDriverRuntime } from "../cua-driver-runtime";
import type { CustomAgentChanges } from "../custom-agent-changes";
import type { CustomProviderChanges } from "../custom-provider-changes";
import type { CustomProviderStore } from "../custom-provider-store";
import type { DecisionModelStore } from "../decision-model-store";
import type { DevelopmentRemoteRole } from "../development-remote-bootstrap";
import type { DynamicIslandWindowController } from "../dynamic-island-window";
import type { ExternalLinkOpener, ExternalLinkPreferenceStore } from "../external-link-opener";
import type { GitHubConnectorService } from "../github-connector-service";
import type { HermesImportService } from "../hermes-import-service";
import type { HostEventsRuntime } from "../host-events-runtime";
import type { HostEventsService } from "../host-events-service";
import type { HostService } from "../host-service";
import type { HostUpdateCoordinator } from "../host-update-coordinator";
import type { HostedServerEnvironment } from "../hosted-server-bootstrap";
import type { HostedServerDesktopService } from "../hosted-server-service";
import type { HostedSiteDesktopService } from "../hosted-site-service";
import type { IdleRestart } from "../idle-restart";
import type { InstanceTransferService } from "../instance-transfer-service";
import type { InterfaceSizeService } from "../interface-size-service";
import type { LanguageService } from "../language-service";
import type { LicenseDesktopService } from "../license-service";
import type { LocalSignInWindows } from "../local-sign-in-window";
import type { LogoColorService } from "../logo-color-service";
import type { MacHapticFeedback } from "../mac-haptic-feedback";
import type { MainWindowController } from "../main-window";
import type { MemoryReviewPreferenceStore } from "../memory-review-preference-store";
import type { NotificationPreferenceStore } from "../notification-preference-store";
import type { OnePasswordConnectorService } from "../onepassword-connector-service";
import type { PromptCacheTtlPreferenceStore } from "../prompt-cache-ttl-preference-store";
import type { ProviderCredentialStore } from "../provider-credential-store";
import type { ProviderDetection } from "../provider-detection";
import type { ProviderDetectionSettingsStore } from "../provider-detection-settings-store";
import type { ProviderRuntimeManager } from "../provider-runtime-manager";
import type { RelayedMessagingInstalls } from "../relayed-messaging-installs";
import type { RemoteDesktopManager } from "../remote-desktop-manager";
import type { RemoteNetworkRoutePreferenceStore } from "../remote-network-route-preference-store";
import type { RemoteServerManager } from "../remote-server-manager";
import type { RemoteWorkflowError } from "../remote-service-effects";

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

import type { RemoteSessionCache } from "../remote-session-cache";
import type { RemoteSessionReusePreferenceStore } from "../remote-session-reuse-preference-store";
import type { RequestedUpdate } from "../requested-update";
import type { ResourceMonitor } from "../resource-monitor";
import type { RoutineFeedServer } from "../routine-feed-server";
import type { ServerMode, ServerModeEnvironment } from "../server-mode";
import type { ServerTimezonePreferenceStore } from "../server-timezone-preference-store";
import type { SignInRelayClient } from "../sign-in-relay-client";
import type { SkillMarketplaceService } from "../skill-marketplace-service";
import type { TeamStore } from "../team-store";
import type { TeardownRegistry } from "../teardown-registry";
import type { TraceFile } from "../trace-file";
import type { RestartReadiness } from "../update-readiness";
import type { UpdateService } from "../update-service";
import type { VaultService } from "../vault-service";
import type { VoiceSpeechService } from "../voice-speech-service";
import type { VoiceTranscriptionService } from "../voice-transcription-service";

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
