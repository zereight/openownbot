import { isRemoteNetworkRoute, type RemoteNetworkRoute } from "@robot/contracts/ipc";
import { Badge, RadioGroup } from "@robot/ui";
import { Show } from "solid-js";
import { useText } from "../../text";

interface RemoteNetworkRouteChoiceProps {
  value: RemoteNetworkRoute;
  tailscaleConnected: boolean;
  disabled: boolean;
  onChange: (route: RemoteNetworkRoute) => void;
}

/** The routes as cards with a radio dot. The OpenOwnBot relay card is switched off in this fork. */
export function RemoteNetworkRouteChoice(props: RemoteNetworkRouteChoiceProps) {
  const { t } = useText();
  return (
    <RadioGroup.Root
      class="settings-mobile-route-choice"
      aria-label={t("settings.mobileConnect.route.title")}
      value={props.value}
      disabled={props.disabled}
      onChange={(value) => {
        if (isRemoteNetworkRoute(value)) props.onChange(value);
      }}
    >
      {/* The OpenOwnBot relay route is switched off in this fork, so its card stays commented out.
      <RadioGroup.Item class="settings-mobile-route-option" value="openownbot">
        <RadioGroup.ItemInput />
        <RadioGroup.ItemControl class="settings-mobile-route-card">
          <span class="settings-mobile-route-dot" aria-hidden="true" />
          <span class="settings-mobile-route-text">
            <RadioGroup.ItemLabel class="settings-mobile-route-name">
              {t("settings.mobileConnect.route.openownbot.title")}
              <Badge variant="info-light">{t("settings.mobileConnect.route.openownbot.badge")}</Badge>
            </RadioGroup.ItemLabel>
            <RadioGroup.ItemDescription class="settings-mobile-route-hint">
              {t("settings.mobileConnect.route.openownbot.description")}
            </RadioGroup.ItemDescription>
          </span>
        </RadioGroup.ItemControl>
      </RadioGroup.Item>
      */}
      <RadioGroup.Item class="settings-mobile-route-option" value="private">
        <RadioGroup.ItemInput />
        <RadioGroup.ItemControl class="settings-mobile-route-card">
          <span class="settings-mobile-route-dot" aria-hidden="true" />
          <span class="settings-mobile-route-text">
            <RadioGroup.ItemLabel class="settings-mobile-route-name">
              {t("settings.mobileConnect.route.private.title")}
              <Show when={props.tailscaleConnected}>
                <Badge variant="success-light">{t("settings.mobileConnect.route.private.tailscale")}</Badge>
              </Show>
            </RadioGroup.ItemLabel>
            <RadioGroup.ItemDescription class="settings-mobile-route-hint">
              {t("settings.mobileConnect.route.private.description")}
            </RadioGroup.ItemDescription>
          </span>
        </RadioGroup.ItemControl>
      </RadioGroup.Item>
    </RadioGroup.Root>
  );
}
