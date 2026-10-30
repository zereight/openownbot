import { Button, Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@openownbot/ui";
import { currentText } from "@openownbot/ui/text";
import { createSignal } from "solid-js";
import { actionToast } from "../../action-toast";
import { useI18n } from "../../i18n-context";
import { settingsPort } from "./settings-port";

/**
 * Opens the folder with the log files of this computer. After it opened, the row shows the path, so
 * the user can name it in a support report.
 */
export function SettingsLogsRow() {
  const i18n = useI18n();
  const [folder, setFolder] = createSignal<string | null>(null);
  const [opening, setOpening] = createSignal(false);

  function openLogs(): void {
    setOpening(true);
    settingsPort()
      .maintenance.openLogs()
      .then(setFolder)
      .catch((error: unknown) => {
        const { t, errorMessage } = currentText();
        actionToast.error(errorMessage(error, t("settings.logs.openFailed")), {
          id: "settings-logs-open-failed",
          report: { operation: "settings", source: "action", cause_code: "unknown" },
        });
      })
      .finally(() => setOpening(false));
  }

  return (
    <Item data-settings-row="settings.logs.title" class="settings-modal-row">
      <ItemContent>
        <ItemTitle>{i18n.t("settings.logs.title")}</ItemTitle>
        <ItemDescription>{folder() ?? i18n.t("settings.logs.description")}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button type="button" size="sm" variant="outline" disabled={opening()} onClick={openLogs}>
          {i18n.t("settings.logs.open")}
        </Button>
      </ItemActions>
    </Item>
  );
}
