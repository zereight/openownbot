import {
  APP_LOGO_COLOR_HEX,
  APP_LOGO_EYE_HEX,
  type AppLogoColor,
  type AppVariant,
  DEFAULT_APP_LOGO_COLOR,
} from "@robot/contracts/ipc";
import { createSignal, onSettled } from "solid-js";
import { appPort } from "./app-port";

/** Sets the logo color and its eye color in this window, for the release logo and the logo of this build. */
function applyLogoColor(color: AppLogoColor, variant: AppVariant): void {
  const style = document.documentElement.style;
  style.setProperty("--openownbot-logo-production", APP_LOGO_COLOR_HEX[color]);
  style.setProperty("--openownbot-logo-production-eye", APP_LOGO_EYE_HEX[color]);
  if (variant !== "production") style.setProperty(`--openownbot-logo-${variant}`, APP_LOGO_COLOR_HEX[color]);
}

/**
 * Keeps this window on the saved logo color. Every window runs it, the Dynamic Island too, because
 * the island has no Settings of its own and main broadcasts each change to every window. A dev or
 * preview build also changes the color of its own logo. The preview calls the returned function when
 * it unmounts, so the next story starts from the brand tokens.
 */
export function syncLogoColor(): () => void {
  let active = true;
  const variant = appPort()
    .getAppInfo()
    .then((info) => info.variant)
    .catch(() => undefined);
  const apply = (color: AppLogoColor) => {
    void variant.then((appVariant) => {
      if (active && appVariant) applyLogoColor(color, appVariant);
    });
  };
  void appPort()
    .getAppLogoColorPreference()
    .then((preference) => apply(preference.color))
    .catch(() => undefined);
  const unsubscribe = appPort().onAppLogoColorPreference((preference) => apply(preference.color));
  return () => {
    active = false;
    unsubscribe();
    document.documentElement.style.removeProperty("--openownbot-logo-production");
    document.documentElement.style.removeProperty("--openownbot-logo-production-eye");
    document.documentElement.style.removeProperty("--openownbot-logo-dev");
    document.documentElement.style.removeProperty("--openownbot-logo-preview");
  };
}

/** The Settings control state. Set optimistically, and reverted if main refuses the write. */
export function useLogoColorChoice() {
  const [color, setColor] = createSignal<AppLogoColor>(DEFAULT_APP_LOGO_COLOR);
  let confirmed: AppLogoColor = DEFAULT_APP_LOGO_COLOR;
  let latestRequest = 0;
  let pending = 0;

  /** A saved value from main. A choice that is still in flight is newer, so it stays on screen. */
  function confirm(next: AppLogoColor): void {
    confirmed = next;
    if (pending === 0) setColor(next);
  }

  function changeColor(next: AppLogoColor): void {
    const request = ++latestRequest;
    pending += 1;
    setColor(next);
    void appPort()
      .setAppLogoColorPreference({ color: next })
      .then((preference) => {
        confirmed = preference.color;
        if (request === latestRequest) setColor(preference.color);
      })
      .catch(() => {
        if (request === latestRequest) setColor(confirmed);
      })
      .finally(() => {
        pending -= 1;
      });
  }

  onSettled(() => {
    void appPort()
      .getAppLogoColorPreference()
      .then((preference) => confirm(preference.color))
      .catch(() => undefined);
    return appPort().onAppLogoColorPreference((preference) => confirm(preference.color));
  });

  return { color, changeColor };
}
