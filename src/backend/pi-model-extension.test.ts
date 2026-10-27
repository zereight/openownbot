import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { piExtensionForModel } from "./pi-model-extension";

const directories: string[] = [];

function agentDirectoryWith(packageName: string, manifest: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "pi-model-extension-"));
  directories.push(directory);
  const packageDirectory = join(directory, "npm", "node_modules", packageName);
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(join(packageDirectory, "package.json"), JSON.stringify(manifest));
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("piExtensionForModel", () => {
  it("finds the extension that registers the models of the provider", () => {
    const directory = agentDirectoryWith("pi-claude-bridge", {
      name: "pi-claude-bridge",
      pi: { extensions: ["./src/index.ts"] },
    });
    expect(piExtensionForModel("claude-bridge/claude-haiku-5-5", directory)).toBe(
      join(directory, "npm", "node_modules", "pi-claude-bridge", "src", "index.ts"),
    );
  });

  it("finds nothing for a provider with no installed package", () => {
    const directory = agentDirectoryWith("pi-claude-bridge", { pi: { extensions: ["./src/index.ts"] } });
    expect(piExtensionForModel("openai-codex/gpt-5.6", directory)).toBeNull();
  });

  it("finds nothing for a model with no provider part or for a provider that is not a plain id", () => {
    const directory = agentDirectoryWith("pi-claude-bridge", { pi: { extensions: ["./src/index.ts"] } });
    expect(piExtensionForModel(undefined, directory)).toBeNull();
    expect(piExtensionForModel("claude-haiku-5-5", directory)).toBeNull();
    expect(piExtensionForModel("../claude-bridge/model", directory)).toBeNull();
  });

  it("does not follow an entry that points out of the package", () => {
    const directory = agentDirectoryWith("pi-claude-bridge", { pi: { extensions: ["../../outside.ts"] } });
    expect(piExtensionForModel("claude-bridge/claude-haiku-5-5", directory)).toBeNull();
  });

  it("finds nothing when the package declares no extension", () => {
    const directory = agentDirectoryWith("pi-claude-bridge", { name: "pi-claude-bridge" });
    expect(piExtensionForModel("claude-bridge/claude-haiku-5-5", directory)).toBeNull();
  });
});
