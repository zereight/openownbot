import type { AgentModelOption } from "@robot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { channelGenerationModel } from "./channel-generation-model";

function model(overrides: Partial<AgentModelOption>): AgentModelOption {
  return {
    provider: "claude",
    id: "claude-haiku-5-5",
    name: "Haiku",
    description: "",
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    ...overrides,
  };
}

describe("channelGenerationModel", () => {
  it("asks for the lowest effort the model supports, whatever the lead is set to", () => {
    expect(channelGenerationModel(model({})).defaultReasoningEffort).toBe("low");
  });

  it("finds the lowest effort when the provider lists them out of order", () => {
    const listed = model({ supportedReasoningEfforts: ["max", "high", "medium"] });
    expect(channelGenerationModel(listed).defaultReasoningEffort).toBe("medium");
  });

  it("keeps the only effort of a model that has no reasoning setting", () => {
    const fixed = model({
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: ["medium"],
      reasoningEffortConfigurable: false,
    });
    expect(channelGenerationModel(fixed).defaultReasoningEffort).toBe("medium");
  });

  it("keeps the model's default when it lists no supported effort", () => {
    const unlisted = model({ defaultReasoningEffort: "high", supportedReasoningEfforts: [] });
    expect(channelGenerationModel(unlisted).defaultReasoningEffort).toBe("high");
  });

  it("leaves every other field of the model as it was", () => {
    const original = model({});
    expect({ ...channelGenerationModel(original), defaultReasoningEffort: original.defaultReasoningEffort }).toEqual(
      original,
    );
  });
});
