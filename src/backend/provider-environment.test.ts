import {
  parseProviderEnvironment,
  providerEnvironmentIssue,
  readProviderEnvironment,
} from "@openbot/contracts/provider-environment";
import { describe, expect, it } from "vitest";

describe("parseProviderEnvironment", () => {
  it("reads lines of NAME=value, with blanks and # comments skipped", () => {
    const parsed = parseProviderEnvironment(
      "# note\n\nCLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS=1\nFOO=a=b c\n",
    );
    expect(parsed).toEqual({
      ok: true,
      environment: { CLAUDE_CODE_EVEN_MORE_DANGEROUSLY_SKIP_PERMISSIONS: "1", FOO: "a=b c" },
    });
  });

  it("refuses a name that is not a shell variable name", () => {
    expect(parseProviderEnvironment("1BAD=x")).toMatchObject({ ok: false, line: 1 });
    expect(parseProviderEnvironment("A-B=x")).toMatchObject({ ok: false });
    expect(parseProviderEnvironment("NOEQUALS")).toMatchObject({ ok: false });
  });

  it("refuses the names that OpenBot owns", () => {
    for (const name of [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "PATH",
      "HOME",
      "CLAUDE_CONFIG_DIR",
      "NODE_OPTIONS",
      "CLAUDE_CODE_ENABLE_TODO_TOOLS",
      "OPENBOT_AGENT_PROCESS",
      "CLAUDE_AGENT_SDK_CLIENT_APP",
      "DYLD_INSERT_LIBRARIES",
      "LD_PRELOAD",
    ]) {
      expect(providerEnvironmentIssue(name), name).not.toBeNull();
    }
    expect(providerEnvironmentIssue("CLAUDE_CODE_USE_BEDROCK")).toBeNull();
  });

  it("names the line of the first problem, and refuses a duplicate name", () => {
    expect(parseProviderEnvironment("A=1\nPATH=/x")).toMatchObject({ ok: false, line: 2 });
    expect(parseProviderEnvironment("A=1\nA=2")).toMatchObject({ ok: false, line: 2 });
  });

  it("limits the count and the length of a value", () => {
    const many = Array.from({ length: 33 }, (_, i) => `V${i}=1`).join("\n");
    expect(parseProviderEnvironment(many)).toMatchObject({ ok: false });
    expect(parseProviderEnvironment(`A=${"x".repeat(4097)}`)).toMatchObject({ ok: false });
  });

  it("accepts an empty text as no variables", () => {
    expect(parseProviderEnvironment("  \n")).toEqual({ ok: true, environment: {} });
  });
});

describe("readProviderEnvironment", () => {
  it("keeps the valid entries of a stored value and drops the rest, so a later refused name never loses the file", () => {
    expect(readProviderEnvironment({ A: "1", PATH: "/x", B: 2, C: "ok" })).toEqual({ A: "1", C: "ok" });
  });

  it("reads anything that is not a record as no variables", () => {
    expect(readProviderEnvironment(null)).toEqual({});
    expect(readProviderEnvironment(["A=1"])).toEqual({});
    expect(readProviderEnvironment("A=1")).toEqual({});
  });
});
