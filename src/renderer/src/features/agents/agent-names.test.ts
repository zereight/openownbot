import { AGENT_NAMES, pickAgentName } from "@openownbot/brand/agent-names";
import { describe, expect, it } from "vitest";

describe("pickAgentName", () => {
  it("picks a name from the list by the random number", () => {
    expect(pickAgentName(() => 0, [])).toBe(AGENT_NAMES[0]);
    expect(pickAgentName(() => 0.999999, [])).toBe(AGENT_NAMES.at(-1));
  });

  it("skips the names that agents already have, whatever their case", () => {
    const first = AGENT_NAMES[0] ?? "";
    expect(pickAgentName(() => 0, [first.toUpperCase()])).toBe(AGENT_NAMES[1]);
  });

  it("numbers a name once every name is taken", () => {
    const name = pickAgentName(() => 0, [...AGENT_NAMES]);
    expect(name).toBe(`${AGENT_NAMES[0]} 2`);
    expect(pickAgentName(() => 0, [...AGENT_NAMES, name])).toBe(`${AGENT_NAMES[0]} 3`);
  });

  it("keeps every name distinct and plain", () => {
    expect(new Set(AGENT_NAMES.map((name) => name.toLowerCase())).size).toBe(AGENT_NAMES.length);
    for (const name of AGENT_NAMES) expect(name).toMatch(/^[A-Z][a-z]+$/);
  });
});
