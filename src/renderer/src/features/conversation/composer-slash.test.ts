// @vitest-environment node

import { createFormat } from "@robot/i18n/format";
import {
  type ComposerCommand,
  pickerOptionDescription,
  pickerOptionKey,
  pickerOptionName,
  slashQuery,
} from "@robot/ui/features/conversation/ComposerEditor";
import { describe, expect, it } from "vitest";

// Failure modes: a path or a URL in the middle of a message opens the command picker; the picker
// stays shut for a bare `/`; an unavailable command shows its description instead of the reason.
describe("slash query", () => {
  it("opens for a slash that starts the message", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/comp")).toBe("comp");
    expect(slashQuery("/skill:review")).toBe("skill:review");
  });

  it("stays text anywhere else", () => {
    expect(slashQuery("see /compact")).toBeNull();
    expect(slashQuery("src/main")).toBeNull();
    expect(slashQuery(" /compact")).toBeNull();
    expect(slashQuery("/usr/bin")).toBeNull();
    expect(slashQuery("/compact now")).toBeNull();
    expect(slashQuery("line one\n/compact")).toBeNull();
  });

  it("ends at a mention, so `/a@b` and `/a$b` stay text", () => {
    expect(slashQuery("/a@b")).toBeNull();
    expect(slashQuery("/a$b")).toBeNull();
  });
});

describe("command option", () => {
  const command: ComposerCommand = { id: "compact", name: "compact", description: "Compact now", run: () => {} };
  const format = createFormat("en");

  it("is named with its slash and keyed by its id", () => {
    expect(pickerOptionName({ type: "command", command })).toBe("/compact");
    expect(pickerOptionKey({ type: "command", command })).toBe("command:compact");
  });

  it("shows why it cannot run in place of the description", () => {
    expect(pickerOptionDescription({ type: "command", command }, format)).toBe("Compact now");
    expect(pickerOptionDescription({ type: "command", command: { ...command, unavailable: "Busy" } }, format)).toBe(
      "Busy",
    );
  });
});
