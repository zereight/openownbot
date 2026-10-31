import { join } from "node:path";
import { Effect } from "effect";
import { app } from "electron";
import type { AgentService } from "../../backend/agent-service";
import type { AgentStore } from "../../backend/agent-store";
import type { SidebarLayoutStore } from "../../backend/sidebar-layout-store";
import { AgentImportService } from "../agents/agent-import-service";
import type { createCustomAgentChanges } from "../agents/custom-agent-changes";
import { HermesImportService } from "../agents/hermes-import-service";
import { InstanceTransferService } from "../agents/instance-transfer-service";
import type { HostService } from "../host/host-service";
import type { ServerTimezonePreferenceStore } from "../host/server-timezone-preference-store";
import type { createCustomProviderChanges } from "../providers/custom-provider-changes";
import type { ProviderUseSettingsStore } from "../providers/provider-use-settings-store";
import type { SkillMarketplaceService } from "../skills/skill-marketplace-service";
import { HERMES_IMPORT_LINKS_FILE } from "./data-files";
import type { StartedFlows } from "./flows";

/** The agent import, Hermes import and instance transfer services. */
export function createImportServices({
  channelActor,
  customAgentChanges,
  customProviderChanges,
  providerUse,
  routineFlowRuntime,
  serverTimezone,
  service,
  sidebarLayout,
  skills,
  store,
}: {
  /** Read only on apply: the caller builds the host after this. */
  channelActor: () => ReturnType<HostService["channelActor"]>;
  customAgentChanges: ReturnType<typeof createCustomAgentChanges>;
  customProviderChanges: ReturnType<typeof createCustomProviderChanges>;
  providerUse: ProviderUseSettingsStore;
  routineFlowRuntime: StartedFlows["routineFlowRuntime"];
  serverTimezone: ServerTimezonePreferenceStore;
  service: AgentService;
  sidebarLayout: SidebarLayoutStore;
  skills: SkillMarketplaceService;
  store: AgentStore;
}) {
  // Imported channels are created by the local user, as when they create one by hand. A member who
  // imports from a joined client is named by the route instead. The host is read only on apply.
  const agentImport = new AgentImportService(
    service,
    {
      library: () => skills.requireLocalLibrary(),
      installLocal: (input) => skills.installLocal(input),
    },
    channelActor,
    () => serverTimezone.effective(),
    join(app.getPath("userData"), "agent-import-uploads"),
  );
  // Hermes profiles become agents through the same services; MCP servers through the MCP settings.
  const hermesImport = new HermesImportService(
    {
      listAgents: () => service.listAgents(),
      createAgentProfile: (input) => service.createAgentProfile(input),
      updateAgent: (input) => service.updateAgent(input),
      deleteAgent: (agentId) => service.deleteAgent(agentId),
      routines: service.routines,
      memories: service.memories,
      listMcpServers: () => service.mcp.list(),
      saveMcpServer: (config) => service.mcp.save({ config }),
    },
    { library: () => skills.requireLocalLibrary(), installLocal: (input) => skills.installLocal(input) },
    join(app.getPath("userData"), HERMES_IMPORT_LINKS_FILE),
    () => serverTimezone.effective(),
  );
  // The same owners the Settings screens write through, so an import has their checks and restarts.
  const instanceTransfer = new InstanceTransferService({
    agents: service,
    skills: { library: () => skills.requireLocalLibrary(), installLocal: (input) => skills.installLocal(input) },
    sharedRoot: store.sharedRoot,
    appVersion: app.getVersion(),
    uploadDirectory: join(app.getPath("userData"), "instance-transfer-uploads"),
    timezone: () => serverTimezone.effective(),
    settings: {
      mcpServers: () => service.mcp.list(),
      saveMcpServer: (config) => service.mcp.save({ config }),
      customProviders: () => customProviderChanges.list(),
      saveCustomProvider: (input) => customProviderChanges.save(input),
      customAgents: () => customAgentChanges.list(),
      providersOff: () => providerUse.off(),
      sidebar: () => sidebarLayout.getSnapshot(),
      mutateSidebar: (action) => sidebarLayout.mutate(action, service.sidebarChatIds()),
      routineFlowLinks: (agentId) => routineFlowRuntime.canvas(agentId).pipe(Effect.map((canvas) => canvas.links)),
      connectRoutineFlow: (input) => routineFlowRuntime.connect(input),
      signedInProviders: () =>
        (service.getStatus().providers ?? [])
          .filter((provider) => provider.state === "available" && !provider.off)
          .map((provider) => provider.id),
    },
  });
  return { agentImport, hermesImport, instanceTransfer };
}
