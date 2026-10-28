// Moving a team of agents to a file and back. The file dialogs open here, so the renderer never names a path.

import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import type { ExportAgentTeamInput, ImportAgentTeamInput } from "@openbot/contracts/ipc";
import type { AppTranslate } from "@openbot/i18n";
import { app, type BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { AgentTeamService } from "../agent-team-service";
import { handler, type IpcGroupHandlers, payloadHandler } from "./define-ipc-group";
import { isObject, requireString } from "./validation";

export interface AgentTeamIpcDependencies {
  agentTeams: AgentTeamService;
  getMainWindow: () => BrowserWindow | null;
  translate: AppTranslate;
}

export function agentTeamIpcHandlers({
  agentTeams,
  getMainWindow,
  translate,
}: AgentTeamIpcDependencies): Pick<IpcGroupHandlers, "agentTeams"> {
  return {
    agentTeams: {
      export: payloadHandler(parseExportAgentTeam, async (input) => {
        const exported = await runCauseEffect(agentTeams.exportFile(input.sectionIds, input.teamName));
        const mainWindow = getMainWindow();
        const options: SaveDialogOptions = {
          title: translate("dialog.saveAgentTeam"),
          defaultPath: join(app.getPath("downloads"), `${fileStem(input.teamName)}.agent-team.json`),
          filters: [{ name: translate("dialog.filter.agentTeams"), extensions: ["json"] }],
        };
        const result = mainWindow
          ? await dialog.showSaveDialog(mainWindow, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return null;
        await writeFile(result.filePath, exported.text, { encoding: "utf8", mode: 0o600 });
        return { fileName: basename(result.filePath), agents: exported.agents, masked: exported.masked };
      }),
      choose: handler(async () => {
        const mainWindow = getMainWindow();
        const options: OpenDialogOptions = {
          title: translate("dialog.chooseAgentTeam"),
          properties: ["openFile"],
          filters: [{ name: translate("dialog.filter.agentTeams"), extensions: ["json"] }],
        };
        const result = mainWindow
          ? await dialog.showOpenDialog(mainWindow, options)
          : await dialog.showOpenDialog(options);
        const path = result.canceled ? undefined : result.filePaths[0];
        if (!path) return null;
        const text = await readFile(path, "utf8");
        return { fileName: basename(path), text, preview: await runCauseEffect(agentTeams.preview(text)) };
      }),
      import: payloadHandler(parseImportAgentTeam, (input) =>
        runCauseEffect(agentTeams.importFile(input.text, input.timezone)),
      ),
    },
  };
}

function fileStem(name: string): string {
  const stem = name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return stem || "team";
}

export function parseExportAgentTeam(input: unknown): ExportAgentTeamInput {
  if (!isObject(input) || !Array.isArray(input.sectionIds) || input.sectionIds.length === 0)
    throw new Error("Invalid team export.");
  return {
    sectionIds: input.sectionIds.map((id) => requireString(id, "sectionId", INPUT_LIMITS.identifier)),
    teamName: requireString(input.teamName, "teamName", INPUT_LIMITS.agentName),
  };
}

export function parseImportAgentTeam(input: unknown): ImportAgentTeamInput {
  if (!isObject(input)) throw new Error("Invalid team import.");
  return {
    text: requireString(input.text, "text", 10_000_000),
    timezone: requireString(input.timezone, "timezone", 255),
  };
}
