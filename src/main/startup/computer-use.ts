import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Effect } from "effect";
import { app } from "electron";
import { runCauseEffect } from "../../backend/effect-boundary";
import { ComputerUseHighlightController } from "../computer-use-highlight-window";
import {
  COMPUTER_USE_ACTION_MAX_AGE_MS,
  COMPUTER_USE_CURSOR_MAX_AGE_MS,
  chooseTarget,
  liveSession,
} from "../computer-use-target-window";
import { isSupportedCuaDriverTarget, resolveCuaDriver } from "../cua-driver-artifact";
import { CuaDriverDaemonClient } from "../cua-driver-daemon-client";
import { CuaDriverRuntime, cuaDriverCommandAlias, resolveCuaDriverEndpoint } from "../cua-driver-runtime";
import {
  computerUseCoveringWindowIds,
  computerUseDesktopPoint,
  computerUseDesktopRect,
  computerUseDisplays,
  createComputerUseHighlightWindow,
  loadComputerUseHighlightRenderer,
  sendComputerUseHighlightPlacement,
} from "../main-window";
import { appendRemoteDiagnosticLog } from "../remote-diagnostics";
import type { ApplicationServiceContext } from "./application-service-types";
import { DEVELOPMENT_BUNDLE_IDENTIFIER, PACKAGED_BUNDLE_IDENTIFIER } from "./platform";
import { TEARDOWN_ORDER } from "./teardown-order";

/** The Computer Use driver, its read client and the highlight window. */
export async function startComputerUse({
  quitting,
  teardown,
  earliestRunningTurnStartedAt,
}: {
  quitting: ApplicationServiceContext["quitting"];
  teardown: ApplicationServiceContext["teardown"];
  earliestRunningTurnStartedAt: () => number | null;
}) {
  // Looked up again on demand, because a user may install the driver while ROBot runs, and the
  // panel's "Check again" has to see it.
  const resolveCuaDriverExecutable = () => {
    const installDirectory = process.env.CUA_DRIVER_RS_INSTALL_DIR ?? process.env.CUA_DRIVER_BIN_DIR;
    const localAppDataDirectory = process.env.LOCALAPPDATA;
    return resolveCuaDriver({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      sourceRoot: resolve(__dirname, "../.."),
      platform: process.platform,
      architecture: process.arch,
      homeDirectory: homedir(),
      pathVariable: process.env.PATH ?? null,
      overrides: [process.env.OPENOWNBOT_CUA_DRIVER_PATH, process.env.CUA_DRIVER_PATH],
      ...(installDirectory === undefined ? {} : { installDirectory }),
      ...(localAppDataDirectory === undefined ? {} : { localAppDataDirectory }),
      applicationsDirectory: "/Applications",
    });
  };
  const cuaDriver = new CuaDriverRuntime({
    executable: await Effect.runPromise(resolveCuaDriverExecutable()),
    resolveExecutable: resolveCuaDriverExecutable,
    // Linux ships as an AppImage, whose mount is somewhere else at each launch, so the command the
    // proxies are given is a link below the profile rather than the path inside the mount.
    commandAlias: cuaDriverCommandAlias({
      platform: process.platform,
      isPackaged: app.isPackaged,
      appImagePath: process.env.APPIMAGE ?? null,
      userDataPath: app.getPath("userData"),
    }),
    endpoint: await runCauseEffect(
      resolveCuaDriverEndpoint({
        platform: process.platform,
        userDataPath: app.getPath("userData"),
        temporaryDirectory: tmpdir(),
        runtimeDirectory: process.env.XDG_RUNTIME_DIR ?? null,
      }),
    ),
    supported: isSupportedCuaDriverTarget(process.platform, process.arch),
    hostBundleId: app.isPackaged ? PACKAGED_BUNDLE_IDENTIFIER : DEVELOPMENT_BUNDLE_IDENTIFIER,
    platform: process.platform,
    onDiagnostic: (message) => {
      Effect.runFork(appendRemoteDiagnosticLog(join(app.getPath("userData"), "logs", "remote"), "cua-driver", message));
    },
    quitting,
  });
  // After the provider runtimes, which hold the `cua-driver mcp` children that talk to this
  // daemon: stopping it first would leave them reading a socket nothing answers.
  teardown.push(TEARDOWN_ORDER.cuaDriver, "the Computer Use driver", () => runCauseEffect(cuaDriver.stop()));
  /*
   * The rim ROBot draws over the window an agent works in.
   *
   * It asks the daemon two read-only questions over a connection of its own: whether any agent
   * holds a live session, and where every window is. Both answers come from the daemon's own view,
   * which an MCP client of ROBot's could not see: the tools report only the sessions of the lease
   * that asks, and the agent's lease is its own.
   */
  const computerUseReads = new CuaDriverDaemonClient(() =>
    cuaDriver.mcpServerForProviders() ? cuaDriver.socketPath() : null,
  );
  const computerUseHighlight = new ComputerUseHighlightController({
    createWindow: createComputerUseHighlightWindow,
    loadWindow: loadComputerUseHighlightRenderer,
    place: sendComputerUseHighlightPlacement,
    displays: computerUseDisplays,
    // The driver's own cursor on one screen, ROBot's inside this overlay on more than one. The
    // runtime answers `null` for the screen it draws itself, so only one cursor is ever drawn.
    readPointer: () => {
      const pointer = cuaDriver.lastPointer(COMPUTER_USE_CURSOR_MAX_AGE_MS);
      return pointer ? computerUseDesktopPoint(pointer) : null;
    },
    readTarget: (previous) =>
      Effect.gen(function* () {
        if (!cuaDriver.mcpServerForProviders()) return null;
        // The rim marks work in progress, so it goes down with the last turn: completed, failed or
        // cancelled. The driver's lease outlives the turn, so only an action made while a turn that
        // still runs was running counts: a lease left by the turn before would put the rim over a
        // turn that does not touch the desktop. Neither a lease nor an action names its agent, so the
        // oldest running turn is the bound: a newer turn of another agent does not hide this one's
        // rim. The caller reads `service`, which it builds after this.
        const turnStartedAt = earliestRunningTurnStartedAt();
        if (turnStartedAt === null) return null;
        const session = liveSession(yield* computerUseReads.sessions(), (Date.now() - turnStartedAt) / 1000);
        if (!session) return null;
        const windows = yield* computerUseReads.listWindows();
        const action = cuaDriver.lastAction(COMPUTER_USE_ACTION_MAX_AGE_MS);
        return chooseTarget({
          windows,
          session,
          action,
          ownPid: process.pid,
          ownCoveringWindowIds: computerUseCoveringWindowIds(),
          previous,
          toDesktop: computerUseDesktopRect,
        });
      }),
  });
  // Before the daemon stops, so the rim is gone rather than left over a window nothing drives, and
  // so the read connection lets its lease go while there is still a daemon to tell.
  teardown.push(TEARDOWN_ORDER.computerUseHighlight, "the Computer Use highlight", async () => {
    computerUseHighlight.destroy();
    await Effect.runPromise(computerUseReads.close());
  });
  return { computerUseHighlight, computerUseReads, cuaDriver };
}
