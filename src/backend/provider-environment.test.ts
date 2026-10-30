import {
  decodeProviderEnvironmentState,
  providerEnvironmentInputIssue,
  providerEnvironmentIssue,
  readProviderEnvironment,
} from "@robot/contracts/provider-environment";
import { describe, expect, it } from "vitest";

const none = new Set<string>();

describe("providerEnvironmentIssue", () => {
  it("refuses a name that is not a shell variable name", () => {
    expect(providerEnvironmentIssue("1BAD")).not.toBeNull();
    expect(providerEnvironmentIssue("A-B")).not.toBeNull();
    expect(providerEnvironmentIssue("")).not.toBeNull();
  });

  it("refuses the names that ROBot owns", () => {
    for (const name of [
      "ANTHROPIC_API_KEY",
      "PATH",
      "HOME",
      "CLAUDE_CONFIG_DIR",
      "NODE_OPTIONS",
      "CLAUDE_CODE_ENABLE_TODO_TOOLS",
      "OPENOWNBOT_AGENT_PROCESS",
      "CLAUDE_AGENT_SDK_CLIENT_APP",
      "DYLD_INSERT_LIBRARIES",
      "LD_PRELOAD",
    ]) {
      expect(providerEnvironmentIssue(name), name).not.toBeNull();
    }
    expect(providerEnvironmentIssue("CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS")).toBeNull();
  });
});

describe("providerEnvironmentInputIssue", () => {
  it("accepts rows with a name and a value, and none at all", () => {
    expect(providerEnvironmentInputIssue([], none)).toBeNull();
    expect(providerEnvironmentInputIssue([{ name: "A", secret: false, value: "1" }], none)).toBeNull();
    expect(providerEnvironmentInputIssue([{ name: "A", secret: true, value: "" }], none)).toBeNull();
  });

  it("names the row of the first problem", () => {
    const issue = providerEnvironmentInputIssue(
      [
        { name: "A", secret: false, value: "1" },
        { name: "PATH", secret: false, value: "/x" },
      ],
      none,
    );
    expect(issue).toMatch(/^Row 2: /);
  });

  it("refuses a duplicate name, a long value and too many rows", () => {
    expect(
      providerEnvironmentInputIssue(
        [
          { name: "A", secret: false, value: "1" },
          { name: "A", secret: false, value: "2" },
        ],
        none,
      ),
    ).toMatch(/^Row 2: /);
    expect(providerEnvironmentInputIssue([{ name: "A", secret: false, value: "x".repeat(4097) }], none)).toMatch(
      /4096/,
    );
    const many = Array.from({ length: 33 }, (_, i) => ({ name: `V${i}`, secret: false, value: "1" }));
    expect(providerEnvironmentInputIssue(many, none)).not.toBeNull();
  });

  it("lets only a saved secret keep its value", () => {
    const keep = [{ name: "TOKEN", secret: true, value: null }];
    expect(providerEnvironmentInputIssue(keep, new Set(["TOKEN"]))).toBeNull();
    expect(providerEnvironmentInputIssue(keep, none)).not.toBeNull();
    // A secret that turns visible has to be typed again: its value is not here to show.
    expect(
      providerEnvironmentInputIssue([{ name: "TOKEN", secret: false, value: null }], new Set(["TOKEN"])),
    ).not.toBeNull();
  });
});

describe("readProviderEnvironment", () => {
  it("keeps the valid entries of a stored value and drops the rest, so a later refused name never loses the file", () => {
    expect(readProviderEnvironment({ A: "1", PATH: "/x", B: 2, C: "ok" })).toEqual({ A: "1", C: "ok" });
  });

  it("reads anything that is not a record as no variables", () => {
    expect(readProviderEnvironment(null)).toEqual({});
    expect(readProviderEnvironment(["A=1"])).toEqual({});
  });
});

describe("decodeProviderEnvironmentState", () => {
  it("never trusts a value on a secret row", () => {
    expect(
      decodeProviderEnvironmentState({
        entries: [
          { name: "A", secret: false, value: "1" },
          { name: "T", secret: true, value: "leak" },
        ],
      }),
    ).toEqual({
      entries: [
        { name: "A", secret: false, value: "1" },
        { name: "T", secret: true, value: null },
      ],
    });
  });
});
