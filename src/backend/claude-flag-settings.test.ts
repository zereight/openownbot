import { describe, expect, it } from "vitest";
import { claudeFlagSettings } from "./claude-flag-settings";

describe("claudeFlagSettings", () => {
  it("has no settings when there is nothing to pass", () => {
    expect(claudeFlagSettings({}, undefined)).toBeUndefined();
    expect(claudeFlagSettings({}, "")).toBeUndefined();
  });

  it("passes the user's variables in the env of the flag settings, which win over a Claude settings file", () => {
    expect(claudeFlagSettings({ A: "1" }, undefined)).toEqual({ env: { A: "1" } });
  });

  it("keeps the NODE_OPTIONS of ROBot even when a stored variable names it", () => {
    expect(claudeFlagSettings({ A: "1", NODE_OPTIONS: "--user" }, "--cpu-limit")).toEqual({
      env: { A: "1", NODE_OPTIONS: "--cpu-limit" },
    });
  });
});
