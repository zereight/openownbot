// @vitest-environment node

import { describe, expect, it } from "vitest";
import { type SecondLaunchState, secondLaunchResponse } from "./main-window-state";

function state(overrides: Partial<SecondLaunchState>): SecondLaunchState {
  return {
    sessionEnding: false,
    quitting: false,
    hasMainWindow: false,
    started: false,
    isPackaged: true,
    ...overrides,
  };
}

describe("secondLaunchResponse", () => {
  it("ignores a launch while the session ends, even when quitting", () => {
    expect(secondLaunchResponse(state({ sessionEnding: true, quitting: true }))).toBe("ignore");
  });

  it("relaunches a packaged app that is quitting, so something opens", () => {
    expect(secondLaunchResponse(state({ quitting: true, isPackaged: true }))).toBe("relaunch");
  });

  // A development restart kills the old process and spawns the replacement at once, so the
  // replacement always arrives while the old one is quitting. Relaunching then would spawn a
  // detached Electron outside the supervisor on every save; the replacement waits for the lock
  // instead, so there is nothing to relaunch for.
  it("ignores a launch while a development build is quitting", () => {
    expect(secondLaunchResponse(state({ quitting: true, isPackaged: false }))).toBe("ignore");
  });

  it("presents the window that exists", () => {
    expect(secondLaunchResponse(state({ hasMainWindow: true, started: true }))).toBe("present");
  });

  it("reopens the window once startup built the services", () => {
    expect(secondLaunchResponse(state({ started: true }))).toBe("reopen");
  });

  it("ignores a launch while startup still builds the window", () => {
    expect(secondLaunchResponse(state({}))).toBe("ignore");
  });
});
