import { createOpenOwnBotLogger } from "@robot/logging";
import { Effect } from "effect";
import type { readInstallationMode } from "../updates/host-release-service";
import {
  CONTAINER_UPDATE_PATHS,
  CONTAINER_UPDATE_TRIGGER,
  HOSTED_UPDATE_TRIGGER,
  HostedUpdateAdapter,
} from "../updates/hosted-update-adapter";

/**
 * The composition root. Every long-lived service the desktop app owns is built here, in one
 * function, in dependency order, and handed back as a single record.
 *
 * **One function on purpose.** Most of these services take their dependencies by value, and a value
 * only type-checks because `tsc` narrows a local across the statements of one function body. Split
 * this into stages and `mainWindow`, `browser`, `teamWebRtcBridge` and the rest would each have to
 * cross a boundary as `T | null`, which is how the entry point ended up with seventeen
 * `() => X | null` accessors and twenty-three unreachable "not ready" guards. A local built above
 * the line that reads it needs neither.
 *
 * **Construct only.** This function does not subscribe the renderer forwarders, register IPC
 * handlers, load the renderer or open event connections - the entry point does, after this returns.
 * The rule keeps the direction of the dependency honest: pull the wiring in here too and the
 * parameter object grows larger than the return value, at which point this is a service locator.
 *
 * **Every step is registered for teardown as it is built**, so a quit that arrives mid-startup
 * stops exactly what exists. `TEARDOWN_ORDER` below, not the order of the pushes, decides what runs
 * when - see `teardown-registry.ts` for why shutdown here is not the reverse of construction.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { LOCAL_ONLY } from "@robot/contracts/local-only";
import { app } from "electron";
import type { readUpdatePreference } from "../updates/update-preference-store";
import {
  createDisabledUpdateAdapter,
  isNixStoreInstall,
  isValidSemver,
  supportsInstalledUpdates,
  type UpdateAdapter,
  UpdateService,
} from "../updates/update-service";
import { listSiblingOpenOwnBotInstances } from "../updates/update-sibling-instances";
import type { ApplicationServiceContext } from "./application-service-types";
import { electronUpdaterCacheRoot } from "./platform";
import { TEARDOWN_ORDER } from "./teardown-order";

const logger = createOpenOwnBotLogger("application-services");
/** The app update service. */
export async function startUpdater({
  installationMode,
  prepareForUpdateInstall,
  teardown,
  updatePreference,
}: {
  installationMode: Effect.Success<ReturnType<typeof readInstallationMode>> | null;
  prepareForUpdateInstall: ApplicationServiceContext["prepareForUpdateInstall"];
  teardown: ApplicationServiceContext["teardown"];
  updatePreference: Effect.Success<ReturnType<typeof readUpdatePreference>>;
}) {
  const currentVersion = app.getVersion();
  // Skip the file check in dev: unpacked runs never enable updates, so avoid touching resourcesPath.
  const updateMetadataAvailable = app.isPackaged && existsSync(join(process.resourcesPath, "app-update.yml"));
  // A hosted or self-installed server runs a release that root owns. Root installs updates for it
  // when openownbot-hosted-update has installed its request units. A container of openownbot-instance asks
  // the host instead, which pulls the image. Other containers have neither.
  const containerInstaller =
    app.isPackaged &&
    process.platform === "linux" &&
    installationMode === "container" &&
    existsSync(CONTAINER_UPDATE_TRIGGER);
  const hostedInstaller =
    containerInstaller ||
    (app.isPackaged &&
      process.platform === "linux" &&
      (process.env.OPENOWNBOT_HOSTED_SERVER === "1" || installationMode === "self") &&
      existsSync(HOSTED_UPDATE_TRIGGER));
  const updatesEnabled =
    app.isPackaged &&
    !LOCAL_ONLY &&
    !isNixStoreInstall() &&
    (hostedInstaller || (supportsInstalledUpdates(process.platform) && updateMetadataAvailable)) &&
    isValidSemver(currentVersion);
  if (app.isPackaged && updateMetadataAvailable && !isValidSemver(currentVersion)) {
    logger.warn(`ROBot updates are disabled because the application version is not valid SemVer: ${currentVersion}`);
  }
  let updateAdapter: UpdateAdapter = createDisabledUpdateAdapter();
  let updaterEnabled = updatesEnabled;
  let updaterCacheDirectory: string | undefined;
  if (updatesEnabled && hostedInstaller) {
    updateAdapter = new HostedUpdateAdapter({
      currentVersion,
      arch: process.arch,
      ...(containerInstaller ? { paths: CONTAINER_UPDATE_PATHS } : {}),
    });
  } else if (updatesEnabled) {
    try {
      const updaterModule = await import("electron-updater");
      const realAdapter = updaterModule.autoUpdater ?? updaterModule.default?.autoUpdater ?? updaterModule.default;
      if (realAdapter) {
        updateAdapter = realAdapter;
        updaterCacheDirectory = join(electronUpdaterCacheRoot(), "openownbot-updater");
      } else {
        updaterEnabled = false;
        logger.warn("ROBot updates are disabled: electron-updater did not export autoUpdater");
      }
    } catch {
      updaterEnabled = false;
      logger.warn("ROBot updates are disabled: electron-updater failed to load");
    }
  }
  const updater = new UpdateService(updateAdapter, {
    currentVersion,
    enabled: updaterEnabled,
    autoDownload: updatePreference.autoDownload,
    beforeInstall: prepareForUpdateInstall,
    // Packaged runs share one application bundle across macOS users. Installing while another
    // login session runs ROBot from that bundle would replace it underneath that session, so
    // the service refuses the install until every sibling session stopped. Unpackaged runs never
    // enable updates, so there is nothing to guard there.
    ...(app.isPackaged
      ? {
          checkSiblingInstances: () =>
            listSiblingOpenOwnBotInstances({
              executablePath: app.getPath("exe"),
              currentPid: process.pid,
              platform: process.platform,
            }).pipe(
              Effect.tap((siblings) =>
                Effect.sync(() => {
                  if (siblings.length === 0) return;
                  const list = siblings.map(({ pid, uid }) => `pid ${pid} (uid ${uid})`).join(", ");
                  logger.warn(`ROBot update install refused: other ROBot processes run from this application: ${list}`);
                }),
              ),
            ),
        }
      : {}),
    ...(typeof process.getuid === "function" ? { currentUid: process.getuid() } : {}),
    platform: process.platform,
    logDirectory: join(app.getPath("userData"), "logs", "update"),
    // Squirrel.Mac only. The path is meaningless under a Linux or Windows home directory.
    ...(process.platform === "darwin"
      ? { shipItDirectory: join(homedir(), "Library", "Caches", "app.robot.desktop.ShipIt") }
      : {}),
    updaterCacheDirectory,
  });
  teardown.push(TEARDOWN_ORDER.updater, "the update service", () => Effect.runPromise(updater.stop()));
  return { currentVersion, updater };
}
