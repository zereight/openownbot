// Moving the agents of sections to a file and back. The file dialogs open here, so the renderer never names a path.

import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { INPUT_LIMITS } from "@openownbot/contracts/input-limits";
import type { ExportAgentSectionInput, ImportAgentSectionInput } from "@openownbot/contracts/ipc";
import type { AppTranslate } from "@openownbot/i18n";
import { app, type BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { AgentSectionService } from "../agent-section-service";
import { handler, type IpcGroupHandlers, payloadHandler } from "./define-ipc-group";
import { isObject, requireString } from "./validation";

export interface AgentSectionIpcDependencies {
  agentSections: AgentSectionService;
  getMainWindow: () => BrowserWindow | null;
  translate: AppTranslate;
}

export function agentSectionIpcHandlers({
  agentSections,
  getMainWindow,
  translate,
}: AgentSectionIpcDependencies): Pick<IpcGroupHandlers, "agentSections"> {
  return {
    agentSections: {
      export: payloadHandler(parseExportAgentSection, async (input) => {
        const exported = await runCauseEffect(agentSections.exportFile(input.sectionIds, input.exportName));
        const mainWindow = getMainWindow();
        const options: SaveDialogOptions = {
          title: translate("dialog.saveAgentSection"),
          defaultPath: join(app.getPath("downloads"), `${fileStem(input.exportName)}.agent-team.json`),
          filters: [{ name: translate("dialog.filter.agentSections"), extensions: ["json"] }],
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
          title: translate("dialog.chooseAgentSection"),
          properties: ["openFile"],
          filters: [{ name: translate("dialog.filter.agentSections"), extensions: ["json"] }],
        };
        const result = mainWindow
          ? await dialog.showOpenDialog(mainWindow, options)
          : await dialog.showOpenDialog(options);
        const path = result.canceled ? undefined : result.filePaths[0];
        if (!path) return null;
        const text = await readFile(path, "utf8");
        return { fileName: basename(path), text, preview: await runCauseEffect(agentSections.preview(text)) };
      }),
      import: payloadHandler(parseImportAgentSection, (input) =>
        runCauseEffect(agentSections.importFile(input.text, input.timezone)),
      ),
    },
  };
}

function fileStem(name: string): string {
  const stem = name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return stem || "sections";
}

export function parseExportAgentSection(input: unknown): ExportAgentSectionInput {
  if (!isObject(input) || !Array.isArray(input.sectionIds) || input.sectionIds.length === 0)
    throw new Error("Invalid section export.");
  return {
    sectionIds: input.sectionIds.map((id) => requireString(id, "sectionId", INPUT_LIMITS.identifier)),
    exportName: requireString(input.exportName, "exportName", INPUT_LIMITS.agentName),
  };
}

export function parseImportAgentSection(input: unknown): ImportAgentSectionInput {
  if (!isObject(input)) throw new Error("Invalid section import.");
  return {
    text: requireString(input.text, "text", 10_000_000),
    timezone: requireString(input.timezone, "timezone", 255),
  };
}
