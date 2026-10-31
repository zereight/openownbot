import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkFiles,
  type Finding,
  formatFinding,
  isScanned,
  readTrackedFiles,
  type SourceFile,
} from "./check-local-only";
import { type AllowEntry, CONFIG_GATES, LOCAL_ONLY_ALLOWLIST } from "./local-only-allowlist";

const repositoryRoot = resolve(import.meta.dirname, "..");

const PLANTED_PATH = "src/main/planted.ts";

function plant(text: string, path = PLANTED_PATH): SourceFile[] {
  return [{ path, text }];
}

/** The scanner with no allowlist and no config gates, so each case sees one rule. */
function scan(text: string, path = PLANTED_PATH): Finding[] {
  return checkFiles(plant(text, path), [], []);
}

function notAllowed(text: string): string {
  return `${JSON.stringify(text)} names a ROBot service and is not on the allowlist.`;
}

describe("mention rule", () => {
  it("reports a planted fetch once, at its line", () => {
    const findings = scan(
      [
        'import { Effect } from "effect";',
        "",
        'export const ping = () => fetch("https://x.openbot.run/v1/ping");',
      ].join("\n"),
    );

    expect(findings).toEqual([{ path: PLANTED_PATH, line: 3, message: notAllowed("https://x.openbot.run/v1/ping") }]);
    expect(findings.map(formatFinding)).toEqual([
      `check:local-only: ${PLANTED_PATH}:3 ${notAllowed("https://x.openbot.run/v1/ping")}`,
    ]);
  });

  it.each([
    ["a line comment", '// fetch("https://x.openbot.run/v1/ping");\nexport const a = 1;'],
    ["a block comment", '/* fetch("https://x.openbot.run/v1/ping"); */\nexport const a = 1;'],
    ["a doc comment", "/**\n * Posts to https://x.openbot.run/v1/ping.\n */\nexport const a = 1;"],
    ["an identifier", "export const openownbotRun = 1;\nexport const nightlyLabs = 2;"],
  ])("ignores a ROBot service in %s", (_name, text) => {
    expect(scan(text)).toEqual([]);
  });

  it("ignores the same text in JSX text and reports it in a JSX attribute", () => {
    expect(
      scan("export const Note = () => <p>Visit https://x.openbot.run/v1/ping now</p>;", "src/renderer/src/a.tsx"),
    ).toEqual([]);
    expect(
      scan('export const Link = () => <a href="https://x.openbot.run/join">Join</a>;', "src/renderer/src/a.tsx"),
    ).toEqual([{ path: "src/renderer/src/a.tsx", line: 1, message: notAllowed("https://x.openbot.run/join") }]);
  });

  it("reports the chunk of a template literal that holds the host", () => {
    expect(scan(`export const url = (name: string) => \`https://\${name}.openbot.run/x\`;`)).toEqual([
      { path: PLANTED_PATH, line: 1, message: notAllowed(".openbot.run/x") },
    ]);
  });

  it.each([
    ["nightly-labs", 'export const owner = "nightly-labs";'],
    ["the Expo update URL", 'export const url = "https://u.expo.dev/eeec730f-c8f4-42c0-a750-64df8af14940";'],
    ["a GitHub URL of the owner", 'export const url = "https://github.com/nightly-labs/openbot";'],
  ])("reports %s", (_name, text) => {
    expect(scan(text)).toHaveLength(1);
  });

  it.each([
    ["a host that only ends the same way", 'export const url = "https://notopenbot.run/x";'],
    ["the Expo project id alone", 'export const id = "eeec730f-c8f4-42c0-a750-64df8af14940";'],
    ["another Expo project", 'export const url = "https://u.expo.dev/00000000-0000-0000-0000-000000000000";'],
  ])("does not report %s", (_name, text) => {
    expect(scan(text)).toEqual([]);
  });

  it("reports owner: nightly-labs in a YAML file and not in a YAML comment", () => {
    expect(scan("provider: github\nowner: nightly-labs\nrepo: openownbot\n", "resources/release.yml")).toEqual([
      { path: "resources/release.yml", line: 2, message: notAllowed("owner: nightly-labs") },
    ]);
    expect(scan("provider: github\n# owner: nightly-labs\n", "resources/release.yml")).toEqual([]);
  });

  it("reports a JSON string value at its line and not a key", () => {
    expect(scan('{\n  "a": 1,\n  "list": ["https://api.openbot.run"]\n}\n', "resources/data.json")).toEqual([
      { path: "resources/data.json", line: 3, message: notAllowed("https://api.openbot.run") },
    ]);
    expect(scan('{ "openbot.run": 1 }', "resources/data.json")).toEqual([]);
  });

  it("does not scan tests, fixtures, catalogs, Markdown or files outside the app", () => {
    const text = 'fetch("https://x.openbot.run/v1/ping");';
    for (const path of [
      "src/main/planted.test.ts",
      "src/renderer/src/preview/fixtures.ts",
      "packages/i18n/src/messages/en.ts",
      "docs/planted.ts",
      "apps/auth-api/src/planted.ts",
      ".github/workflows/ci.yml",
      "README.md",
    ]) {
      expect(scan(text, path), path).toEqual([]);
    }
  });

  it("accepts a unit that an entry names and still reports another unit in the file", () => {
    const allowlist: AllowEntry[] = [
      { rule: "mention", path: PLANTED_PATH, unit: /^https:\/\/x\.openbot\.run\/v1\/ping$/u, reason: "refused" },
    ];
    const text = 'fetch("https://x.openbot.run/v1/ping");\nfetch("https://x.openbot.run/v1/other");\n';

    expect(checkFiles(plant(text), allowlist, [])).toEqual([
      { path: PLANTED_PATH, line: 2, message: notAllowed("https://x.openbot.run/v1/other") },
    ]);
  });

  it("does not let an entry for one path admit the same unit in another path", () => {
    const allowlist: AllowEntry[] = [
      { rule: "mention", path: "src/main/other.ts", unit: /^https:\/\/x\.openbot\.run$/u, reason: "refused" },
    ];

    expect(checkFiles(plant('export const a = "https://x.openbot.run";'), allowlist, [])).toEqual([
      {
        path: "src/main/other.ts",
        line: null,
        message: "stale allowlist entry (mention /^https:\\/\\/x\\.openbot\\.run$/u) matches nothing: delete it.",
      },
      { path: PLANTED_PATH, line: 1, message: notAllowed("https://x.openbot.run") },
    ]);
  });
});

describe("stale entries", () => {
  it("fails an entry whose unit is gone from the file", () => {
    const allowlist: AllowEntry[] = [
      { rule: "mention", path: PLANTED_PATH, unit: /^https:\/\/x\.openbot\.run$/u, reason: "gated" },
    ];

    expect(checkFiles(plant("export const a = 1;"), allowlist, [])).toEqual([
      {
        path: PLANTED_PATH,
        line: null,
        message: "stale allowlist entry (mention /^https:\\/\\/x\\.openbot\\.run$/u) matches nothing: delete it.",
      },
    ]);
  });

  it("fails an entry for a file that is not in the scan", () => {
    const allowlist: AllowEntry[] = [
      { rule: "bypass", path: "src/main/deleted.ts", primitive: "ws", note: "Gone with the file." },
    ];

    expect(checkFiles(plant("export const a = 1;"), allowlist, [])).toEqual([
      {
        path: "src/main/deleted.ts",
        line: null,
        message: "stale allowlist entry (bypass ws) matches nothing: delete it.",
      },
    ]);
  });

  it("reports the new URL and the old entry when a URL changes", () => {
    const allowlist: AllowEntry[] = [
      { rule: "mention", path: PLANTED_PATH, unit: /^https:\/\/x\.openbot\.run$/u, reason: "gated" },
    ];

    expect(checkFiles(plant('export const a = "https://y.openbot.run";'), allowlist, [])).toEqual([
      {
        path: PLANTED_PATH,
        line: null,
        message: "stale allowlist entry (mention /^https:\\/\\/x\\.openbot\\.run$/u) matches nothing: delete it.",
      },
      { path: PLANTED_PATH, line: 1, message: notAllowed("https://y.openbot.run") },
    ]);
  });

  it("fails a dynamic-dial entry for a file that no longer dials", () => {
    const allowlist: AllowEntry[] = [{ rule: "dynamic-dial", path: PLANTED_PATH, note: "A signal URL." }];

    expect(checkFiles(plant("export const a = 1;"), allowlist, [])).toEqual([
      { path: PLANTED_PATH, line: null, message: "stale allowlist entry (dynamic-dial) matches nothing: delete it." },
    ]);
  });
});

describe("allowlist shape", () => {
  it("rejects a glob path", () => {
    const allowlist: AllowEntry[] = [
      { rule: "mention", path: "src/main/*.ts", unit: /^https:\/\/x\.openbot\.run$/u, reason: "gated" },
    ];

    expect(checkFiles([], allowlist, [])).toContainEqual({
      path: "src/main/*.ts",
      line: null,
      message: "allowlist entry: the path is a glob: name one exact path.",
    });
  });

  it.each([
    ["a start anchor", /https:\/\/x\.openbot\.run$/u],
    ["an end anchor", /^https:\/\/x\.openbot\.run/u],
    ["both anchors", /openbot\.run/u],
  ])("rejects a pattern without %s", (_name, unit) => {
    const allowlist: AllowEntry[] = [{ rule: "mention", path: PLANTED_PATH, unit, reason: "gated" }];

    expect(checkFiles([], allowlist, [])).toContainEqual({
      path: PLANTED_PATH,
      line: null,
      message: "allowlist entry: the pattern is not anchored with ^ and $.",
    });
  });

  it("allows only a gated mention in a config file that has a gate", () => {
    const allowlist: AllowEntry[] = [
      { rule: "mention", path: "electron-builder.yml", unit: /^owner: nightly-labs$/u, reason: "refused" },
    ];

    expect(checkFiles([], allowlist, CONFIG_GATES)).toContainEqual({
      path: "electron-builder.yml",
      line: null,
      message: 'allowlist entry: only a "gated" mention is allowed in electron-builder.yml.',
    });
  });

  it("names one exact path and one anchored pattern in every shipped entry", () => {
    const problems = checkFiles([], LOCAL_ONLY_ALLOWLIST, []).filter((finding) =>
      finding.message.startsWith("allowlist entry:"),
    );

    expect(problems).toEqual([]);
  });
});

describe("bypass rule", () => {
  it.each([
    ['import WebSocket from "ws";', "uses ws, which does not go through the guarded WebSocket"],
    ['import { WebSocketServer } from "ws";', "uses ws, which does not go through the guarded WebSocket"],
    ['const ws = require("ws");', "uses ws, which does not go through the guarded WebSocket"],
    [
      'import { request } from "node:https";',
      "uses node:http or node:https requests, which do not go through the guarded fetch",
    ],
    [
      'import http from "node:http";',
      "uses node:http or node:https requests, which do not go through the guarded fetch",
    ],
    ['import { connect } from "node:net";', "opens a raw socket with node:net or node:tls"],
    ['import tls from "node:tls";', "opens a raw socket with node:net or node:tls"],
    ['import { app, net } from "electron";', "uses Electron net, which does not go through the guarded fetch"],
    [
      "session.defaultSession.webRequest.onBeforeRequest(filter, listener);",
      "sets a webRequest.onBeforeRequest listener, which replaces the guard's",
    ],
  ])("reports %s", (text, reason) => {
    expect(scan(text)).toEqual([{ path: PLANTED_PATH, line: 1, message: `${reason}, and is not on the allowlist.` }]);
  });

  it.each([
    'import type { WebSocket } from "ws";',
    'import { createServer } from "node:http";',
    'import { createServer } from "node:net";',
    'import { app } from "electron";',
    "session.defaultSession.webRequest.onHeadersReceived(listener);",
  ])("does not report %s", (text) => {
    expect(scan(text)).toEqual([]);
  });

  it("accepts only the primitive that an entry names", () => {
    const allowlist: AllowEntry[] = [
      { rule: "bypass", path: PLANTED_PATH, primitive: "ws", note: "Dials a host that is not a ROBot service." },
    ];
    const text = 'import WebSocket from "ws";\nimport { request } from "node:https";\n';

    expect(checkFiles(plant(text), allowlist, [])).toEqual([
      {
        path: PLANTED_PATH,
        line: 2,
        message:
          "uses node:http or node:https requests, which do not go through the guarded fetch, and is not on the allowlist.",
      },
    ]);
  });
});

describe("dynamic-dial rule", () => {
  const DIAL_MESSAGE =
    "dials a WebSocket with a URL that is not a plain string: ask refusesOpenOwnBotUrl() first, or add a dynamic-dial entry.";

  it("reports a dial with a variable and no predicate, at its line", () => {
    expect(scan("export const open = (url: string) => {\n  return new WebSocket(url);\n};\n")).toEqual([
      { path: PLANTED_PATH, line: 2, message: DIAL_MESSAGE },
    ]);
  });

  it("reports each dial of a file", () => {
    expect(scan("new WebSocket(first);\nnew WebSocket(new URL(second));\n").map((finding) => finding.line)).toEqual([
      1, 2,
    ]);
  });

  it.each([
    ["a string literal", 'new WebSocket("wss://example.com/live");'],
    ["a template without a substitution", "new WebSocket(`wss://example.com/live`);"],
    [
      "a file that asks refusesOpenOwnBotUrl first",
      "if (refusesOpenOwnBotUrl(url)) throw new Error(url);\nnew WebSocket(url);\n",
    ],
  ])("accepts a dial with %s", (_name, text) => {
    expect(scan(text)).toEqual([]);
  });

  it("accepts a dial that an entry names", () => {
    const allowlist: AllowEntry[] = [{ rule: "dynamic-dial", path: PLANTED_PATH, note: "A signal URL." }];

    expect(checkFiles(plant("new WebSocket(url);"), allowlist, [])).toEqual([]);
  });
});

describe("config gates", () => {
  const tracked = readTrackedFiles(repositoryRoot);

  function withText(path: string, change: (text: string) => string): SourceFile[] {
    const original = tracked.find((file) => file.path === path);
    if (original === undefined) throw new Error(`${path} is not tracked`);
    const changed = change(original.text);
    expect(changed).not.toBe(original.text);
    return tracked.map((file) => (file.path === path ? { path, text: changed } : file));
  }

  it("lists the two config files that start a service on their own", () => {
    expect(CONFIG_GATES.map((gate) => [gate.path, gate.gateFile])).toEqual([
      ["electron-builder.yml", "src/main/startup/updater.ts"],
      ["apps/mobile/app.json", "apps/mobile/app.config.js"],
    ]);
  });

  it("fails app.json when app.config.js no longer turns updates off", () => {
    const files = withText("apps/mobile/app.config.js", (text) => text.replace("enabled: !localOnly", "enabled: true"));

    expect(checkFiles(files).map(formatFinding)).toEqual([
      "check:local-only: apps/mobile/app.json:218 names a ROBot service, and apps/mobile/app.config.js no longer keeps it off: app.config.js must read local-only.json and set `updates.enabled` from it.",
    ]);
  });

  it("fails a config file when its gate file is missing from the scan", () => {
    const files = tracked.filter((file) => file.path !== "apps/mobile/app.config.js");

    expect(checkFiles(files).map(formatFinding)).toContain(
      "check:local-only: apps/mobile/app.json:218 names a ROBot service, and apps/mobile/app.config.js is not in the scan.",
    );
  });
});

describe("isScanned", () => {
  it.each([
    "src/main/index.ts",
    "src/renderer/src/features/updates/WhatsNewOverlay.tsx",
    "packages/contracts/src/invite-links.ts",
    "apps/mobile/app.json",
    "apps/mobile/app.config.js",
    "apps/mobile/modules/app-lock/ios/OpenOwnBotAppLock.podspec",
    "electron-builder.yml",
    "resources/release.yml",
  ])("scans %s", (path) => {
    expect(isScanned(path)).toBe(true);
  });

  it.each([
    "src/main/index.test.ts",
    "src/renderer/stories/Button.tsx",
    "src/renderer/src/Button.stories.tsx",
    "src/renderer/src/preview/fixtures.ts",
    "packages/i18n/src/messages/en.ts",
    "apps/auth-api/src/index.ts",
    ".github/workflows/ci.yml",
    "scripts/openownbot-dev.sh",
    "README.md",
  ])("skips %s", (path) => {
    expect(isScanned(path)).toBe(false);
  });
});

describe("the tracked tree", () => {
  // The hooks run the same check, so a merge that skipped them fails the test suite instead.
  it("has no service call that the allowlist does not name", () => {
    expect(checkFiles(readTrackedFiles(repositoryRoot)).map(formatFinding)).toEqual([]);
  });
});
