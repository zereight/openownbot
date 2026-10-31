import { REMOTE_ACCOUNT_CHECK_INTERVAL_MS } from "@robot/team-client";
import { runCauseEffect } from "../../backend/effect-boundary";
import type { CentralAuthManager } from "../central-auth-manager";
import type { ApplicationServiceContext } from "./application-service-types";
import { TEARDOWN_ORDER } from "./teardown-order";

/** Refreshes the signed-in account profile while the main window has focus. */
export function startAccountProfileRefresh({
  centralAuth,
  mainWindow,
  teardown,
}: {
  centralAuth: CentralAuthManager;
  mainWindow: ApplicationServiceContext["mainWindow"];
  teardown: ApplicationServiceContext["teardown"];
}) {
  let profileRefreshActive = true;
  let profileRefreshing = false;
  let profileRefreshAgain = false;
  const refreshAccountProfile = async () => {
    if (!profileRefreshActive) return;
    if (profileRefreshing) {
      profileRefreshAgain = true;
      return;
    }
    profileRefreshing = true;
    try {
      do {
        profileRefreshAgain = false;
        await runCauseEffect(centralAuth.refreshProfile());
      } while (profileRefreshAgain && profileRefreshActive);
    } finally {
      profileRefreshing = false;
    }
  };
  let profileTimer: ReturnType<typeof setInterval> | null = null;
  const stopProfileTimer = () => {
    if (profileTimer !== null) clearInterval(profileTimer);
    profileTimer = null;
  };
  const startProfileTimer = () => {
    stopProfileTimer();
    profileTimer = setInterval(() => void refreshAccountProfile(), REMOTE_ACCOUNT_CHECK_INTERVAL_MS);
    profileTimer.unref();
  };
  if (mainWindow.isFocused()) startProfileTimer();
  mainWindow.on("focus", startProfileTimer);
  mainWindow.on("blur", stopProfileTimer);
  teardown.push(TEARDOWN_ORDER.updater, "account profile refresh", () => {
    profileRefreshActive = false;
    stopProfileTimer();
    mainWindow.removeListener("focus", startProfileTimer);
    mainWindow.removeListener("blur", stopProfileTimer);
    centralAuth.stopProfileRefresh();
  });
  return { refreshAccountProfile };
}
