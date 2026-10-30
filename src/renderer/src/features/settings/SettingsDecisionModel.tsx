import {
  CLOUDFLARE_DECISION_MODELS,
  type CloudflareDecisionModel,
  DECISION_MODEL_BACKENDS,
  DEFAULT_LOCAL_DECISION_MODEL,
  DEFAULT_LOCAL_DECISION_URL,
  type DecisionModelBackend,
  type DecisionModelKeyName,
  type DecisionModelState,
  type DecisionModelTestResult,
  type SaveDecisionModelInput,
} from "@robot/contracts/ipc";
import type { AppTextKey } from "@robot/i18n";
import {
  Button,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsSection,
  SwitchField,
} from "@robot/ui";
import { currentText, useText } from "@robot/ui/text";
import type { JSX } from "@solidjs/web";
import { createEffect, createStore, Show } from "solid-js";
import { actionToast } from "../../action-toast";
import { decisionModelPort } from "./decision-model-port";

const BACKEND_LABEL: Record<DecisionModelBackend, AppTextKey> = {
  off: "settings.decisionModel.backend.off",
  jev: "settings.decisionModel.backend.jev",
  openrouter: "settings.decisionModel.backend.openrouter",
  cloudflare: "settings.decisionModel.backend.cloudflare",
  local: "settings.decisionModel.backend.local",
};

const KEY_LABEL: Record<DecisionModelKeyName, AppTextKey> = {
  jev: "settings.decisionModel.key.jev",
  openrouter: "settings.decisionModel.key.openrouter",
  cloudflare: "settings.decisionModel.key.cloudflare",
  local: "settings.decisionModel.key.local",
};

interface DraftState {
  loaded: DecisionModelState | null;
  backend: DecisionModelBackend;
  openrouterModel: string;
  cloudflareAccountId: string;
  cloudflareModel: CloudflareDecisionModel;
  localUrl: string;
  localModel: string;
  computerUse: boolean;
  key: string;
  saving: boolean;
  testing: boolean;
  trial: DecisionModelTestResult | null;
}

function activeKeyName(backend: DecisionModelBackend): DecisionModelKeyName | null {
  return backend === "off" ? null : backend;
}

/**
 * Settings › Agents: which fast model picks the channel member for a request that names none.
 * Keys go to main and never come back: the section shows only whether one is saved.
 */
export function SettingsDecisionModel(props: { selectMount?: HTMLElement | undefined }): JSX.Element {
  const { t } = useText();
  const [draft, setDraft] = createStore<DraftState>({
    loaded: null,
    backend: "off",
    openrouterModel: "",
    cloudflareAccountId: "",
    cloudflareModel: "clef-flash",
    localUrl: DEFAULT_LOCAL_DECISION_URL,
    localModel: DEFAULT_LOCAL_DECISION_MODEL,
    computerUse: false,
    key: "",
    saving: false,
    testing: false,
    trial: null,
  });

  function apply(state: DecisionModelState): void {
    setDraft((value) => {
      value.loaded = state;
      value.backend = state.backend;
      value.openrouterModel = state.openrouterModel;
      value.cloudflareAccountId = state.cloudflareAccountId;
      value.cloudflareModel = state.cloudflareModel;
      value.localUrl = state.localUrl;
      value.localModel = state.localModel;
      value.computerUse = state.computerUse;
      value.key = "";
    });
  }

  function fail(error: unknown): void {
    const { errorMessage } = currentText();
    actionToast.error(errorMessage(error, t("settings.decisionModel.saveFailed")), {
      id: "settings-decision-model-save-failed",
      report: { operation: "settings", source: "action", cause_code: "unknown" },
    });
  }

  createEffect(
    () => true,
    () => {
      decisionModelPort().decisionModel.get().then(apply).catch(fail);
    },
  );

  async function save(keys: SaveDecisionModelInput["keys"]): Promise<void> {
    if (draft.saving) return;
    setDraft((value) => {
      value.saving = true;
    });
    try {
      apply(
        await decisionModelPort().decisionModel.save({
          backend: draft.backend,
          openrouterModel: draft.openrouterModel.trim(),
          cloudflareAccountId: draft.cloudflareAccountId.trim(),
          cloudflareModel: draft.cloudflareModel,
          localUrl: draft.localUrl.trim(),
          localModel: draft.localModel.trim(),
          computerUse: draft.computerUse,
          ...(keys ? { keys } : {}),
        }),
      );
    } catch (error) {
      fail(error);
    } finally {
      setDraft((value) => {
        value.saving = false;
      });
    }
  }

  async function runTrial(): Promise<void> {
    if (draft.testing) return;
    setDraft((value) => {
      value.testing = true;
      value.trial = null;
    });
    try {
      const result = await decisionModelPort().decisionModel.test();
      setDraft((value) => {
        value.trial = result;
      });
    } catch (error) {
      fail(error);
    } finally {
      setDraft((value) => {
        value.testing = false;
      });
    }
  }

  const trialText = (): string => {
    const result = draft.trial;
    if (!result) return "";
    return result.ok
      ? t("settings.decisionModel.test.ok", { name: result.picked ?? "", ms: String(result.milliseconds) })
      : t("settings.decisionModel.test.failed", { reason: result.reason ?? "" });
  };

  const keyName = () => activeKeyName(draft.backend);
  const keySaved = () => {
    const name = keyName();
    return name !== null && !!draft.loaded?.keys[name];
  };
  const saveKeys = (): SaveDecisionModelInput["keys"] => {
    const name = keyName();
    const typed = draft.key.trim();
    return name !== null && typed ? { [name]: typed } : undefined;
  };

  return (
    <SettingsSection
      data-settings-row="settings.decisionModel.title"
      title={t("settings.decisionModel.title")}
      description={t("settings.decisionModel.description")}
    >
      <ItemGroup class="settings-modal-card">
        <Item class="settings-modal-row">
          <ItemContent>
            <ItemTitle>{t("settings.decisionModel.backend.title")}</ItemTitle>
            <ItemDescription>{t("settings.decisionModel.backend.description")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Select<DecisionModelBackend>
              class="settings-modal-select"
              options={[...DECISION_MODEL_BACKENDS]}
              value={draft.backend}
              onChange={(next) =>
                next &&
                setDraft((value) => {
                  value.backend = next;
                  value.key = "";
                })
              }
              placement="bottom-end"
              itemComponent={(selectProps) => (
                <SelectItem item={selectProps.item}>{t(BACKEND_LABEL[selectProps.item.rawValue])}</SelectItem>
              )}
            >
              <SelectTrigger size="sm" aria-label={t("settings.decisionModel.backend.title")}>
                <SelectValue<DecisionModelBackend>>
                  {(state) => {
                    const option = state.selectedOption();
                    return option ? t(BACKEND_LABEL[option]) : "";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent mount={props.selectMount} />
            </Select>
          </ItemActions>
        </Item>

        <Show when={draft.backend === "openrouter"}>
          <Item class="settings-modal-row">
            <ItemContent>
              <ItemTitle>{t("settings.decisionModel.openrouterModel.title")}</ItemTitle>
              <div class="settings-voice-key">
                <Input
                  size="sm"
                  autocomplete="off"
                  spellcheck={false}
                  aria-label={t("settings.decisionModel.openrouterModel.title")}
                  value={draft.openrouterModel}
                  onValueChange={(value) =>
                    setDraft((state) => {
                      state.openrouterModel = value;
                    })
                  }
                />
              </div>
            </ItemContent>
          </Item>
        </Show>

        <Show when={draft.backend === "local"}>
          <Item class="settings-modal-row">
            <ItemContent>
              <ItemTitle>{t("settings.decisionModel.localUrl.title")}</ItemTitle>
              <ItemDescription>{t("settings.decisionModel.localUrl.description")}</ItemDescription>
              <ItemDescription>
                <code>{t("settings.decisionModel.localUrl.install")}</code>
              </ItemDescription>
              <ItemDescription>
                <code>{t("settings.decisionModel.localUrl.start")}</code>
              </ItemDescription>
              <div class="settings-voice-key">
                <Input
                  size="sm"
                  autocomplete="off"
                  spellcheck={false}
                  aria-label={t("settings.decisionModel.localUrl.title")}
                  placeholder={DEFAULT_LOCAL_DECISION_URL}
                  value={draft.localUrl}
                  onValueChange={(value) =>
                    setDraft((state) => {
                      state.localUrl = value;
                    })
                  }
                />
              </div>
              <ItemTitle>{t("settings.decisionModel.localModel.title")}</ItemTitle>
              <ItemDescription>{t("settings.decisionModel.localModel.description")}</ItemDescription>
              <div class="settings-voice-key">
                <Input
                  size="sm"
                  autocomplete="off"
                  spellcheck={false}
                  aria-label={t("settings.decisionModel.localModel.title")}
                  placeholder={DEFAULT_LOCAL_DECISION_MODEL}
                  value={draft.localModel}
                  onValueChange={(value) =>
                    setDraft((state) => {
                      state.localModel = value;
                    })
                  }
                />
              </div>
            </ItemContent>
          </Item>
        </Show>

        <Show when={draft.backend === "cloudflare"}>
          <Item class="settings-modal-row">
            <ItemContent>
              <ItemTitle>{t("settings.decisionModel.cloudflareAccount.title")}</ItemTitle>
              <ItemDescription>{t("settings.decisionModel.cloudflareAccount.description")}</ItemDescription>
              <div class="settings-voice-key">
                <Input
                  size="sm"
                  autocomplete="off"
                  spellcheck={false}
                  aria-label={t("settings.decisionModel.cloudflareAccount.title")}
                  value={draft.cloudflareAccountId}
                  onValueChange={(value) =>
                    setDraft((state) => {
                      state.cloudflareAccountId = value;
                    })
                  }
                />
                <Select<CloudflareDecisionModel>
                  class="settings-modal-select"
                  options={[...CLOUDFLARE_DECISION_MODELS]}
                  value={draft.cloudflareModel}
                  onChange={(next) =>
                    next &&
                    setDraft((state) => {
                      state.cloudflareModel = next;
                    })
                  }
                  placement="bottom-end"
                  itemComponent={(selectProps) => (
                    <SelectItem item={selectProps.item}>{selectProps.item.rawValue}</SelectItem>
                  )}
                >
                  <SelectTrigger size="sm" aria-label={t("settings.decisionModel.cloudflareModel.title")}>
                    <SelectValue<CloudflareDecisionModel>>{(state) => state.selectedOption() ?? ""}</SelectValue>
                  </SelectTrigger>
                  <SelectContent mount={props.selectMount} />
                </Select>
              </div>
            </ItemContent>
          </Item>
        </Show>

        <Show when={keyName()}>
          {(name) => (
            <Item class="settings-modal-row">
              <ItemContent>
                <ItemTitle>{t(KEY_LABEL[name()])}</ItemTitle>
                <ItemDescription aria-live="polite">
                  {keySaved()
                    ? t("settings.decisionModel.key.saved")
                    : t(
                        name() === "local"
                          ? "settings.decisionModel.key.localOptional"
                          : "settings.decisionModel.key.missing",
                      )}
                </ItemDescription>
                <div class="settings-voice-key">
                  <Input
                    type="password"
                    size="sm"
                    autocomplete="off"
                    spellcheck={false}
                    aria-label={t(KEY_LABEL[name()])}
                    placeholder={t("settings.decisionModel.key.placeholder")}
                    value={draft.key}
                    disabled={draft.saving}
                    onValueChange={(value) =>
                      setDraft((state) => {
                        state.key = value;
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void save(saveKeys());
                    }}
                  />
                </div>
              </ItemContent>
              <ItemActions>
                <Show when={keySaved()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    disabled={draft.saving}
                    onClick={() => void save({ [name()]: null })}
                  >
                    {t("settings.decisionModel.key.remove")}
                  </Button>
                </Show>
              </ItemActions>
            </Item>
          )}
        </Show>

        <Show when={draft.backend !== "off"}>
          <SwitchField
            data-settings-row="settings.decisionModel.computerUse.title"
            checked={draft.computerUse}
            disabled={draft.saving}
            onChange={(checked) =>
              setDraft((state) => {
                state.computerUse = checked;
              })
            }
            label={t("settings.decisionModel.computerUse.title")}
            description={t("settings.decisionModel.computerUse.description")}
          />
        </Show>

        <Item class="settings-modal-row">
          <ItemContent>
            <ItemDescription>{t("settings.decisionModel.fallback")}</ItemDescription>
            <ItemDescription aria-live="polite">{trialText()}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={draft.testing || draft.saving || draft.backend === "off"}
              onClick={() => void runTrial()}
            >
              {t("settings.decisionModel.test.action")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={draft.saving}
              onClick={() => void save(saveKeys())}
            >
              {t("settings.decisionModel.save")}
            </Button>
          </ItemActions>
        </Item>
      </ItemGroup>
    </SettingsSection>
  );
}
