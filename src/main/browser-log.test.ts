// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpenOwnBotLogger } from "@robot/logging";
import { afterEach, describe, expect, it } from "vitest";
import { startBrowserLog } from "./browser-log";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function readLogWhen(path: string, ready: (text: string) => boolean): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const text = await readFile(path, "utf8").catch(() => "");
    if (ready(text)) return text;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("The browser log did not receive the line.");
}

describe("browser log", () => {
  it("keeps the browser lines in browser.log and redacts a secret in an error text", async () => {
    const root = await mkdtemp(join(tmpdir(), "openownbot-browser-log-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    cleanups.push(startBrowserLog(root));
    const secret = "sk-ant-0123456789abcdef";
    const host = createOpenOwnBotLogger("browser-host", () => undefined);
    const other = createOpenOwnBotLogger("main", () => undefined);

    host.warn("A browser tool call failed.", { tool: "click", error: `Error: apiKey=${secret}` });
    other.warn("Not a browser line.");

    const text = await readLogWhen(join(root, "browser", "browser.log"), (content) =>
      content.includes("A browser tool call failed."),
    );
    expect(text).toContain('"tool":"click"');
    expect(text).not.toContain(secret);
    expect(text).not.toContain("Not a browser line.");
  });
});
