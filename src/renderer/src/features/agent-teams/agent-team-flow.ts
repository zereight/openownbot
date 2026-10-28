import type { AgentTeamPreview, ChosenAgentTeam } from "@openbot/contracts/ipc";
import { classifyFailure } from "@openbot/telemetry";
import type { AgentTeamImportPreview } from "@openbot/ui/features/agents/AgentTeamImportDialog";
import { currentText } from "@openbot/ui/text";
import { createSignal } from "solid-js";
import { actionToast } from "../../action-toast";

type TeamProblem = Extract<AgentTeamPreview, { ok: false }>["problem"];

/** The words for why a file cannot be imported. */
export function teamProblemText(problem: TeamProblem): string {
  const { t } = currentText();
  switch (problem.kind) {
    case "json":
      return t("agentTeam.problem.json");
    case "format":
      return t("agentTeam.problem.format");
    case "version":
      return t("agentTeam.problem.version");
    case "tooLarge":
      return t("agentTeam.problem.tooLarge");
    case "name":
      return t("agentTeam.problem.name");
    case "sections":
      return t("agentTeam.problem.sections");
    case "agents":
      return t("agentTeam.problem.agents");
    case "sectionName":
      return t("agentTeam.problem.sectionName", { name: problem.section });
    case "agent":
      return t("agentTeam.problem.agent", { name: problem.agent });
    case "marketplaceSkill":
      return t("agentTeam.problem.marketplaceSkill", { name: problem.agent });
    case "duplicate":
      return t("agentTeam.problem.duplicate", { name: problem.agent });
  }
}

/**
 * Saving a section as a team file, and choosing a team file to import. Choosing shows what the file
 * would create and waits: nothing is made until the user confirms in the dialog.
 */
export function createAgentTeamFlow(sectionName: (sectionId: string) => string | undefined) {
  const [chosen, setChosen] = createSignal<ChosenAgentTeam | null>(null);

  const preview = (): AgentTeamImportPreview | null => {
    const value = chosen()?.preview;
    return value?.ok ? value : null;
  };

  async function exportSection(sectionId: string): Promise<void> {
    const name = sectionName(sectionId);
    if (!name) return;
    try {
      const result = await window.openbot.agentTeams.export({ sectionIds: [sectionId], teamName: name });
      if (!result) return;
      const { t } = currentText();
      actionToast.success(t("agentTeam.export.done", { count: result.agents, file: result.fileName }), {
        ...(result.masked > 0 ? { description: t("agentTeam.export.masked", { count: result.masked }) } : {}),
      });
    } catch (error) {
      const { t, errorMessage } = currentText();
      actionToast.error(t("agentTeam.export.failed"), {
        description: errorMessage(error, t("agentTeam.export.failed")),
        report: { operation: "agent", source: "action", cause_code: classifyFailure(error) },
      });
    }
  }

  async function chooseFile(): Promise<void> {
    try {
      const file = await window.openbot.agentTeams.choose();
      if (!file) return;
      if (!file.preview.ok) {
        const { t } = currentText();
        actionToast.error(t("agentTeam.import.failed"), { description: teamProblemText(file.preview.problem) });
        return;
      }
      setChosen(file);
    } catch (error) {
      const { t, errorMessage } = currentText();
      actionToast.error(t("agentTeam.import.failed"), {
        description: errorMessage(error, t("agentTeam.import.failed")),
        report: { operation: "agent", source: "action", cause_code: classifyFailure(error) },
      });
    }
  }

  async function importChosen(): Promise<void> {
    const file = chosen();
    if (!file) return;
    const result = await window.openbot.agentTeams.import({
      text: file.text,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setChosen(null);
    const { t } = currentText();
    actionToast.success(t("agentTeam.import.done", { count: result.agents }));
  }

  return {
    exportSection,
    chooseFile,
    importChosen,
    preview,
    close: () => setChosen(null),
  };
}
