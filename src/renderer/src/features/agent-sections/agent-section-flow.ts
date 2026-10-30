import type { AgentSectionPreview, ChosenAgentSection } from "@robot/contracts/ipc";
import { classifyFailure } from "@robot/telemetry";
import type { AgentSectionImportPreview } from "@robot/ui/features/agents/AgentSectionImportDialog";
import { currentText } from "@robot/ui/text";
import { createSignal } from "solid-js";
import { actionToast } from "../../action-toast";

type TeamProblem = Extract<AgentSectionPreview, { ok: false }>["problem"];

/** The words for why a file cannot be imported. */
export function sectionProblemText(problem: TeamProblem): string {
  const { t } = currentText();
  switch (problem.kind) {
    case "json":
      return t("agentSection.problem.json");
    case "format":
      return t("agentSection.problem.format");
    case "version":
      return t("agentSection.problem.version");
    case "tooLarge":
      return t("agentSection.problem.tooLarge");
    case "name":
      return t("agentSection.problem.name");
    case "sections":
      return t("agentSection.problem.sections");
    case "agents":
      return t("agentSection.problem.agents");
    case "sectionName":
      return t("agentSection.problem.sectionName", { name: problem.section });
    case "agent":
      return t("agentSection.problem.agent", { name: problem.agent });
    case "marketplaceSkill":
      return t("agentSection.problem.marketplaceSkill", { name: problem.agent });
    case "duplicate":
      return t("agentSection.problem.duplicate", { name: problem.agent });
  }
}

/**
 * Saving a section as a section file, and choosing a section file to import. Choosing shows what the file
 * would create and waits: nothing is made until the user confirms in the dialog.
 */
export function createAgentSectionFlow(sectionName: (sectionId: string) => string | undefined) {
  const [chosen, setChosen] = createSignal<ChosenAgentSection | null>(null);

  const preview = (): AgentSectionImportPreview | null => {
    const value = chosen()?.preview;
    return value?.ok ? value : null;
  };

  async function exportSection(sectionId: string): Promise<void> {
    const name = sectionName(sectionId);
    if (!name) return;
    try {
      const result = await window.openownbot.agentSections.export({ sectionIds: [sectionId], exportName: name });
      if (!result) return;
      const { t } = currentText();
      actionToast.success(t("agentSection.export.done", { count: result.agents, file: result.fileName }), {
        ...(result.masked > 0 ? { description: t("agentSection.export.masked", { count: result.masked }) } : {}),
      });
    } catch (error) {
      const { t, errorMessage } = currentText();
      actionToast.error(t("agentSection.export.failed"), {
        description: errorMessage(error, t("agentSection.export.failed")),
        report: { operation: "agent", source: "action", cause_code: classifyFailure(error) },
      });
    }
  }

  async function chooseFile(): Promise<void> {
    try {
      const file = await window.openownbot.agentSections.choose();
      if (!file) return;
      if (!file.preview.ok) {
        const { t } = currentText();
        actionToast.error(t("agentSection.import.failed"), { description: sectionProblemText(file.preview.problem) });
        return;
      }
      setChosen(file);
    } catch (error) {
      const { t, errorMessage } = currentText();
      actionToast.error(t("agentSection.import.failed"), {
        description: errorMessage(error, t("agentSection.import.failed")),
        report: { operation: "agent", source: "action", cause_code: classifyFailure(error) },
      });
    }
  }

  async function importChosen(): Promise<void> {
    const file = chosen();
    if (!file) return;
    const result = await window.openownbot.agentSections.import({
      text: file.text,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setChosen(null);
    const { t } = currentText();
    actionToast.success(t("agentSection.import.done", { count: result.agents }));
  }

  return {
    exportSection,
    chooseFile,
    importChosen,
    preview,
    close: () => setChosen(null),
  };
}
