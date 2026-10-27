// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isNoModelForPatternDiagnostic } from "./provider-diagnostics";

// Failure modes: the warning of a stale model setting reaches the user as a "Provider error" toast on
// every connect; or a real failure that only mentions models is hidden with it.
describe("no model for a pattern", () => {
  it("matches the warning that Pi and Pi-Bolt print", () => {
    expect(isNoModelForPatternDiagnostic('Warning: No models match pattern "openai-codex/gpt-5.6-luna"')).toBe(true);
  });

  it("does not match a failure that mentions models", () => {
    expect(isNoModelForPatternDiagnostic("Error: Model request failed")).toBe(false);
    expect(isNoModelForPatternDiagnostic("Error: No models match pattern")).toBe(false);
    expect(isNoModelForPatternDiagnostic("401 No models are available for this key")).toBe(false);
  });
});
