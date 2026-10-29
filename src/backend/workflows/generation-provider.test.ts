import { describe, expect, it } from "vitest";
import { workflowGenerationProvider } from "./generation-provider";

describe("workflowGenerationProvider", () => {
  it("keeps the provider that the step names, even one that cannot generate", () => {
    expect(workflowGenerationProvider("muse", "claude", "claude")).toBe("muse");
    expect(workflowGenerationProvider("codex", "claude", "claude")).toBe("codex");
  });

  it("falls back to the starting choice, then to the preferred provider", () => {
    expect(workflowGenerationProvider(null, "codex", "claude")).toBe("codex");
    expect(workflowGenerationProvider(null, undefined, "claude")).toBe("claude");
  });

  it("skips a fallback that cannot generate without tools", () => {
    expect(workflowGenerationProvider(null, "muse", "claude")).toBe("claude");
    expect(workflowGenerationProvider(null, undefined, "muse")).not.toBe("muse");
  });
});
