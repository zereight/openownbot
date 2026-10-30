import {
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
  SettingsSection,
  SwitchField,
} from "@robot/ui";
import { useText } from "@robot/ui/text";
import type { JSX } from "@solidjs/web";
import { createStore, Show } from "solid-js";
import type { ServerSettingsSectionHost } from "./server-settings-section";

interface ServerAccessSection {
  Panel: () => JSX.Element;
  /** Forgets the remote desktop offer of the previous server when the dialog shows another one. */
  resetForServer(): void;
}

/** The access section: whether other devices of the account can reach this computer. */
export function createServerAccessSection(
  host: ServerSettingsSectionHost,
  options: { onSetUpDesktop: () => void; saveIdentityDraft: () => Promise<boolean> },
): ServerAccessSection {
  const { t } = useText();
  const { props, local, configured, published, busy, run } = host;
  /** Set after this Mac publishes, to offer the remote desktop setup once. */
  const [panel, setPanel] = createStore({ offerRemoteDesktopSetup: false });

  /** An unnamed server gets a generated name as it publishes, so the switch needs no setup first. */
  async function setPublished(value: boolean): Promise<void> {
    const serverId = props.server.id;
    if (value && local() && !configured() && !(await options.saveIdentityDraft())) return;
    if (props.server.id !== serverId) return;
    const succeeded = await run("publish", () => props.onSetPublished(value));
    if (!succeeded || props.server.id !== serverId) return;
    setPanel((state) => {
      state.offerRemoteDesktopSetup = value && local() && props.platform === "darwin";
    });
  }

  function dismissRemoteDesktopSetup(): void {
    setPanel((state) => {
      state.offerRemoteDesktopSetup = false;
    });
  }

  function accessDescription() {
    if (!local()) return published() ? t("server.settings.remoteOnline") : t("server.settings.remoteOffline");
    if (published()) return t("server.settings.reachable");
    return configured() ? t("server.settings.notReachable") : t("server.settings.notPublished");
  }

  function Panel() {
    return (
      <>
        <SettingsSection title={t("server.settings.access")}>
          <ItemGroup class="settings-modal-card">
            <SwitchField
              class="server-settings-publish-setting"
              size="default"
              checked={published()}
              disabled={!local() || Boolean(busy())}
              onChange={(value) => void setPublished(value)}
              label={local() ? t("server.settings.publish") : t("server.settings.published")}
              description={accessDescription()}
            />
          </ItemGroup>
        </SettingsSection>
        <Show when={panel.offerRemoteDesktopSetup}>
          <ItemGroup class="settings-modal-card">
            <Item>
              <ItemContent>
                <ItemTitle>{t("server.settings.setUpDesktopTitle")}</ItemTitle>
                <ItemDescription>{t("server.settings.setUpDesktopDescription")}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button size="sm" variant="ghost" onClick={dismissRemoteDesktopSetup}>
                  {t("server.settings.later")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    dismissRemoteDesktopSetup();
                    options.onSetUpDesktop();
                  }}
                >
                  {t("server.settings.setUp")}
                </Button>
              </ItemActions>
            </Item>
          </ItemGroup>
        </Show>
      </>
    );
  }

  return { Panel, resetForServer: dismissRemoteDesktopSetup };
}
