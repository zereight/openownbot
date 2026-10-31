import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
// App identity, first-run setup, external links and the data and
// diagnostics exports.

import { HOSTED_SERVER_CONTACT_URL } from "@robot/contracts/hosted-servers";
import { INPUT_LIMITS } from "@robot/contracts/input-limits";
import {
  type AppInfo,
  type AppSetupState,
  type AppVariant,
  type ChatWindowTarget,
  type ExternalDestination,
  type ExternalLinkBrowser,
  externalLinkAppName,
  GROK_BOT_EXPORT_URL,
} from "@robot/contracts/ipc";
import { app, type BrowserWindow, dialog, type OpenDialogOptions, shell } from "electron";
import { version as developmentVersion } from "../../../package.json";
import type { AgentService } from "../../backend/agent-service";
import type { BrowserHost } from "../../backend/browser-host";
import type { MailboxStore } from "../../backend/mailbox-store";
import type { AgentDefaultsPreferenceStore } from "../agents/agent-defaults-preference-store";
import type { AgentMemoryLimitSetting } from "../agents/agent-memory-limit-preference-store";
import type { ApprovalAutomation } from "../agents/approval-automation-store";
import type { BusyMessageModePreferenceStore } from "../agents/busy-message-mode-preference-store";
import { MAC_PERMISSION_URLS } from "../computer-use/mac-permission-urls";
import { exportDiagnostics, exportOpenOwnBotData } from "../host/maintenance-service";
import { isTailscaleConnected } from "../platform/private-network-detection";
import type { RemoteNetworkRoutePreferenceStore } from "../remote-servers/remote-network-route-preference-store";
import type { RemoteSessionCache } from "../remote-servers/remote-session-cache";
import type { RemoteSessionReusePreferenceStore } from "../remote-servers/remote-session-reuse-preference-store";
import type { AppBehaviorService } from "../settings/app-behavior-service";
import type { AppearanceService } from "../settings/appearance-service";
import type { InterfaceSizeService } from "../settings/interface-size-service";
import type { LanguageService } from "../settings/language-service";
import type { LogoColorService } from "../settings/logo-color-service";
import { readSetupState, writeSetupState } from "../settings/setup-store";
import type { UpdateService } from "../updates/update-service";
import type { ExternalLinkOpener, ExternalLinkPreferenceStore } from "../windows/external-link-opener";
import {
  parseAgentDefaults,
  parseAppAppearancePreference,
  parseAppBehaviorPreferenceChange,
  parseAppInterfaceSizePreference,
  parseAppLanguagePreference,
  parseAppLogoColorPreference,
  parseBusyMessageModePreference,
  parseChatWindowTarget,
  parseExternalDestination,
  parseExternalLinkPreference,
  parseRemoteNetworkRoutePreference,
  parseRemoteSessionReusePreference,
  parseSetup,
} from "./app-inputs";
import { stringPayload } from "./validation";

/**
 * Every destination `openExternal` may reach, as a closed table.
 *
 * Exported because the addresses are a product contract the checker cannot judge: a wrong one sends
 * a user who asked for an OpenCode Go key to some other site, and the type only says "a string".
 *
 * `mac-screen-recording` is not a web page. macOS opens a settings pane from a URL, and the table is
 * what keeps that address out of the renderer. It is the same pane the Computer Use panel opens, so
 * it is read from `mac-permission-urls.ts` rather than written twice. `hosted-server-contact` is a
 * `mailto:` address, which `openUrl` refuses; the web client opens the same constant.
 */
const EXTERNAL_DESTINATIONS: Record<ExternalDestination, string> = {
  "agent-setup": "https://github.com/zereight/openownbot/blob/main/docs/TROUBLESHOOTING.md",
  "opencode-install": "https://opencode.ai/docs/",
  "opencode-auth": "https://opencode.ai/auth",
  "claude-install": "https://code.claude.com/docs",
  feedback: "https://github.com/zereight/openownbot/issues/new",
  message: "https://github.com/zereight/openownbot/issues",
  changelog: "https://github.com/zereight/openownbot/releases",
  guides: "https://github.com/zereight/openownbot/tree/main/docs",
  "grok-bot-export": GROK_BOT_EXPORT_URL,
  "hosted-server-contact": HOSTED_SERVER_CONTACT_URL,
  "mac-screen-recording": MAC_PERMISSION_URLS["screen-recording"],
};

import { runCauseEffect } from "../../backend/effect-boundary";
import { openHttpLink } from "../messaging/message-link-relay";
import type { ResourceMonitor } from "../platform/resource-monitor";
import type { TraceFile } from "../platform/trace-file";
import { handler, type IpcGroupHandlers, payloadHandler } from "./define-ipc-group";

export interface AppIpcDependencies {
  service: AgentService;
  mailbox: MailboxStore;
  browser: BrowserHost;
  updater: UpdateService;
  setupFile: string;
  approvalAutomation: ApprovalAutomation;
  busyMessageMode: BusyMessageModePreferenceStore;
  agentDefaults: AgentDefaultsPreferenceStore;
  agentMemoryLimit: AgentMemoryLimitSetting;
  remoteSessionReuse: RemoteSessionReusePreferenceStore;
  remoteNetworkRoute: RemoteNetworkRoutePreferenceStore;
  /** Applies a changed network route to the devices that are connected to this computer now. */
  applyRemoteNetworkRoute: () => Promise<void>;
  remoteSessionCache: RemoteSessionCache;
  externalLinkPreference: ExternalLinkPreferenceStore;
  externalLinks: ExternalLinkOpener;
  /** Opens a web page in the program that the user chose in Settings. */
  openLink: (url: string) => Promise<void>;
  appBehavior: AppBehaviorService;
  language: LanguageService;
  logoColor: LogoColorService;
  appearance: AppearanceService;
  interfaceSize: InterfaceSizeService;
  initializeAgent: () => Promise<void>;
  appVariant: AppVariant;
  getMainWindow: () => BrowserWindow | null;
  openChatWindow: (target: ChatWindowTarget) => void;
  chatWindowTargets: () => ChatWindowTarget[];
  trace: TraceFile;
  resources: ResourceMonitor;
}

export function appIpcHandlers({
  service,
  mailbox,
  browser,
  updater,
  setupFile,
  approvalAutomation,
  busyMessageMode,
  agentDefaults,
  agentMemoryLimit,
  remoteSessionReuse,
  remoteNetworkRoute,
  applyRemoteNetworkRoute,
  remoteSessionCache,
  externalLinkPreference,
  externalLinks,
  openLink,
  appBehavior,
  language,
  logoColor,
  appearance,
  interfaceSize,
  initializeAgent,
  appVariant,
  getMainWindow,
  openChatWindow,
  chatWindowTargets,
  trace,
  resources,
}: AppIpcDependencies): Pick<IpcGroupHandlers, "app" | "maintenance"> {
  return {
    app: {
      getAppInfo: handler((): AppInfo => {
        const platform = process.platform;
        if (platform !== "darwin" && platform !== "win32" && platform !== "linux") {
          throw new Error(`Unsupported desktop platform: ${platform}`);
        }
        // electron-vite starts a script, so Electron reports its own version in development.
        const version = app.isPackaged ? app.getVersion() : developmentVersion;
        return {
          name: app.getName(),
          version,
          platform,
          variant: appVariant,
        };
      }),
      getSetupState: handler(() => runCauseEffect(readSetupState(setupFile))),
      getApprovalAutomation: handler(() => approvalAutomation.current()),
      getBusyMessageModePreference: handler(() => busyMessageMode.get()),
      setBusyMessageModePreference: payloadHandler(parseBusyMessageModePreference, (parsed) =>
        runCauseEffect(busyMessageMode.set(parsed)),
      ),
      getAgentDefaults: handler(() => agentDefaults.get()),
      // The agents that follow a changed default get it at once: see `AgentService.agentDefaultsChanged`.
      setAgentDefaults: payloadHandler(parseAgentDefaults, async (parsed) => {
        const previous = agentDefaults.get();
        const saved = await runCauseEffect(agentDefaults.set(parsed));
        service.agentDefaultsChanged(previous);
        return saved;
      }),
      getAgentMemoryLimitPreference: handler(() => agentMemoryLimit.get()),
      getRemoteSessionReusePreference: handler(() => remoteSessionReuse.get()),
      // Off removes the kept sessions at once. The sessions of this run then end when the app quits.
      setRemoteSessionReusePreference: payloadHandler(parseRemoteSessionReusePreference, async (parsed) => {
        const saved = await runCauseEffect(remoteSessionReuse.set(parsed));
        await Effect.runPromise(remoteSessionCache.setEnabled(saved.keepBetweenRuns));
        return saved;
      }),
      getRemoteNetworkRoute: handler(() => ({
        ...remoteNetworkRoute.get(),
        tailscaleConnected: isTailscaleConnected(),
      })),
      // The private route drops the connected devices, so each connects again without the relay.
      setRemoteNetworkRoute: payloadHandler(parseRemoteNetworkRoutePreference, async (parsed) => {
        const previous = remoteNetworkRoute.get();
        const saved = await runCauseEffect(remoteNetworkRoute.set(parsed));
        // A route that the host did not apply must not stay saved: the next connection would read it.
        await applyRemoteNetworkRoute().catch(async (error: unknown) => {
          await runCauseEffect(remoteNetworkRoute.set(previous));
          throw error;
        });
        return { ...saved, tailscaleConnected: isTailscaleConnected() };
      }),
      getAppBehaviorPreference: handler(() => runCauseEffect(appBehavior.get())),
      setAppBehaviorPreference: payloadHandler(parseAppBehaviorPreferenceChange, (parsed) =>
        runCauseEffect(appBehavior.set(parsed)),
      ),
      getAppLanguagePreference: handler(() => language.preference),
      setAppLanguagePreference: payloadHandler(parseAppLanguagePreference, (parsed) =>
        runCauseEffect(language.set(parsed)),
      ),
      getAppLogoColorPreference: handler(() => logoColor.preference),
      setAppLogoColorPreference: payloadHandler(parseAppLogoColorPreference, (parsed) =>
        runCauseEffect(logoColor.set(parsed)),
      ),
      getAppAppearancePreference: handler(() => appearance.preference),
      setAppAppearancePreference: payloadHandler(parseAppAppearancePreference, (parsed) =>
        runCauseEffect(appearance.set(parsed)),
      ),
      getAppInterfaceSizePreference: handler(() => interfaceSize.preference),
      setAppInterfaceSizePreference: payloadHandler(parseAppInterfaceSizePreference, (parsed) =>
        runCauseEffect(interfaceSize.set(parsed)),
      ),
      saveSetup: payloadHandler(parseSetup, async (input): Promise<AppSetupState> => {
        const state = await runCauseEffect(writeSetupState(setupFile, input));
        await runCauseEffect(service.setPreferredProvider(input.preferredProvider, input.preferredModel));
        await initializeAgent();
        return state;
      }),
      openExternal: payloadHandler(parseExternalDestination, (parsed) => openLink(EXTERNAL_DESTINATIONS[parsed])),
      openUrl: payloadHandler(stringPayload("URL", INPUT_LIMITS.browserUrl), (url) => openHttpLink(url, openLink)),
      getExternalLinkPreference: handler(() => externalLinkPreference.get()),
      setExternalLinkPreference: payloadHandler(parseExternalLinkPreference, (parsed) =>
        runCauseEffect(externalLinkPreference.set(parsed)),
      ),
      listExternalLinkBrowsers: handler(() => runCauseEffect(externalLinks.listBrowsers())),
      chooseExternalLinkApp: handler(async (): Promise<ExternalLinkBrowser | null> => {
        const mainWindow = getMainWindow();
        // macOS shows an application bundle as one file, so the dialog can offer only applications.
        const options: OpenDialogOptions = {
          title: language.translate("dialog.chooseExternalLinkApp"),
          properties: ["openFile"],
          ...(process.platform === "darwin"
            ? {
                defaultPath: "/Applications",
                filters: [{ name: language.translate("dialog.filter.applications"), extensions: ["app"] }],
              }
            : {}),
        };
        const result = mainWindow
          ? await dialog.showOpenDialog(mainWindow, options)
          : await dialog.showOpenDialog(options);
        const path = result.canceled ? undefined : result.filePaths[0];
        return path ? { name: externalLinkAppName(path), path } : null;
      }),
      openChatWindow: payloadHandler(parseChatWindowTarget, openChatWindow),
      getChatWindows: handler(chatWindowTargets),
    },
    maintenance: {
      openLogs: handler(async () => {
        const directory = join(app.getPath("userData"), "logs");
        await mkdir(directory, { recursive: true });
        const error = await shell.openPath(directory);
        if (error) throw new Error(error);
        return directory;
      }),
      exportData: handler(() =>
        runCauseEffect(
          exportOpenOwnBotData({ service, mailbox, parentWindow: getMainWindow(), translate: language.translate }),
        ),
      ),
      exportDiagnostics: handler(() =>
        runCauseEffect(
          exportDiagnostics({
            service,
            browser,
            updater,
            trace,
            resources,
            parentWindow: getMainWindow(),
            translate: language.translate,
          }),
        ),
      ),
    },
  };
}
