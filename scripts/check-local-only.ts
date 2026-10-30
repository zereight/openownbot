// Stops a change that adds a call to a service that ROBot operates, before it is committed or
// merged. The runtime guard refuses such a call anyway; this check keeps it from reaching the
// guard unseen, and names each place that was reviewed.
//
//   bun scripts/check-local-only.ts   scans the tracked files and exits 1 on a finding
//
// Scope: tracked text files under src/, packages/*/src, apps/mobile (src, modules, plugins, app.json,
// app.config.js), resources/ and electron-builder.yml. Tests, stories, fixtures, the renderer
// preview, the i18n catalogs and Markdown are skipped. apps/auth-api, docs, CI and release scripts
// are outside.
//
// What counts as text: in TypeScript and JavaScript, each string literal and template chunk, so a
// comment, an identifier or JSX text never counts. In JSON, each string value. In any other file,
// each line that is not a comment. A file is parsed only when it has a marker.
//
// Rules:
//   mention       A unit that names a ROBot service needs an allowlist entry for that exact path.
//   bypass        A way out that skips the guarded fetch and WebSocket needs an entry.
//   dynamic-dial  `new WebSocket(x)` with an `x` that is not a plain string needs an entry, unless the
//                 file asks `refusesOpenOwnBotUrl(` first.
//   stale         An entry that matches nothing fails, so a deleted URL cannot return under it.
//   gate          A config file that names a service needs the code that keeps it off (CONFIG_GATES).
//
// Not caught: a URL built from pieces or from a constant in another file, a new connection in a file
// that already has a bypass entry, a dial through a wrapper or alias of WebSocket, a dynamic
// `import("ws")`, a TURN or ICE server from a ticket, and `git commit --no-verify`.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mentionsOpenOwnBotService } from "@robot/contracts/local-only";
import ts from "@typescript/typescript6";
import {
  type AllowEntry,
  type BypassPrimitive,
  CONFIG_GATES,
  type ConfigGate,
  LOCAL_ONLY_ALLOWLIST,
} from "./local-only-allowlist";

export interface SourceFile {
  readonly path: string;
  readonly text: string;
}

export interface Finding {
  readonly path: string;
  /** Null when the finding is about an allowlist entry and not about a line. */
  readonly line: number | null;
  readonly message: string;
}

interface Unit {
  readonly text: string;
  readonly line: number;
}

interface Use {
  readonly primitive: BypassPrimitive;
  readonly line: number;
}

interface Facts {
  readonly units: Unit[];
  readonly bypasses: Use[];
  readonly dials: number[];
}

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const TEXT_EXTENSIONS = new Set([
  ".json",
  ".yml",
  ".yaml",
  ".plist",
  ".podspec",
  ".swift",
  ".kt",
  ".java",
  ".gradle",
  ".xml",
  ".html",
  ".sh",
  ".toml",
  ".rb",
  ".h",
  ".m",
  ".mm",
  ".txt",
]);

const SCANNED_ROOTS: readonly RegExp[] = [
  /^src\//u,
  /^packages\/[^/]+\/src\//u,
  /^apps\/mobile\/(?:src|modules|plugins)\//u,
  /^apps\/mobile\/(?:app\.json|app\.config\.js)$/u,
  /^resources\//u,
  /^electron-builder\.yml$/u,
];

const SKIPPED: readonly RegExp[] = [
  /\.test\.[^/]+$/u,
  /\.stories\.[^/]+$/u,
  /^src\/renderer\/stories\//u,
  /^src\/renderer\/src\/preview\//u,
  /^packages\/i18n\/src\/messages\//u,
  /(?:^|\/)fixtures?\//u,
];

/** Cheap test for a file that may hold a bypass or a dynamic dial, so most files are never parsed. */
const BYPASS_HINT = /["'](?:node:)?(?:ws|https?|net|tls|electron)["']|new\s+WebSocket\b|onBeforeRequest/u;

const COMMENT_LINE = /^(?:#|\/\/|\/\*|\*|<!--|;)/u;

const BYPASS_TEXT: Record<BypassPrimitive, string> = {
  ws: "uses ws, which does not go through the guarded WebSocket",
  "http-request": "uses node:http or node:https requests, which do not go through the guarded fetch",
  "net-connect": "opens a raw socket with node:net or node:tls",
  "electron-net": "uses Electron net, which does not go through the guarded fetch",
  "on-before-request": "sets a webRequest.onBeforeRequest listener, which replaces the guard's",
};

function extensionOf(path: string): string {
  return path.slice(path.lastIndexOf("."));
}

export function isScanned(path: string): boolean {
  const extension = extensionOf(path);
  return (
    (CODE_EXTENSIONS.has(extension) || TEXT_EXTENSIONS.has(extension)) &&
    SCANNED_ROOTS.some((root) => root.test(path)) &&
    !SKIPPED.some((skipped) => skipped.test(path))
  );
}

function scriptKindOf(path: string): ts.ScriptKind {
  switch (extensionOf(path)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function bypassOfModule(specifier: string, clause: ts.ImportClause | undefined): BypassPrimitive | null {
  if (clause?.phaseModifier === ts.SyntaxKind.TypeKeyword) return null;
  const bindings = clause?.namedBindings;
  const named =
    bindings !== undefined && ts.isNamedImports(bindings)
      ? bindings.elements
          .filter((element) => !element.isTypeOnly)
          .map((element) => (element.propertyName ?? element.name).text)
      : [];
  const whole =
    clause === undefined || clause.name !== undefined || (bindings !== undefined && ts.isNamespaceImport(bindings));
  switch (specifier.replace(/^node:/u, "")) {
    case "ws":
      return whole || named.length > 0 ? "ws" : null;
    case "http":
    case "https":
      return whole || named.some((name) => name === "request" || name === "get") ? "http-request" : null;
    case "net":
    case "tls":
      return whole || named.some((name) => name === "connect" || name === "createConnection") ? "net-connect" : null;
    case "electron":
      return named.includes("net") ? "electron-net" : null;
    default:
      return null;
  }
}

function codeFacts(file: SourceFile): Facts {
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, scriptKindOf(file.path));
  const facts: Facts = { units: [], bypasses: [], dials: [] };
  const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      facts.units.push({ text: node.text, line: lineOf(node) });
    } else if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const primitive = bypassOfModule(node.moduleSpecifier.text, node.importClause);
      if (primitive) facts.bypasses.push({ primitive, line: lineOf(node) });
    } else if (ts.isCallExpression(node)) {
      const [argument] = node.arguments;
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require" &&
        argument &&
        ts.isStringLiteral(argument)
      ) {
        const primitive = bypassOfModule(argument.text, undefined);
        if (primitive) facts.bypasses.push({ primitive, line: lineOf(node) });
      }
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === "onBeforeRequest") {
        const owner = callee.expression;
        const ownerName = ts.isPropertyAccessExpression(owner)
          ? owner.name.text
          : ts.isIdentifier(owner)
            ? owner.text
            : "";
        if (ownerName === "webRequest") facts.bypasses.push({ primitive: "on-before-request", line: lineOf(node) });
      }
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "WebSocket") {
      const [argument] = node.arguments ?? [];
      const plain = argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument));
      if (!plain) facts.dials.push(lineOf(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return facts;
}

function lineFacts(text: string): Facts {
  const units = text.split("\n").flatMap((line, index) => {
    const trimmed = line.trim();
    return trimmed === "" || COMMENT_LINE.test(trimmed) ? [] : [{ text: trimmed, line: index + 1 }];
  });
  return { units, bypasses: [], dials: [] };
}

function jsonStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(jsonStrings);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(jsonStrings);
  return [];
}

function jsonFacts(text: string): Facts {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return lineFacts(text);
  }
  const lines = text.split("\n");
  const units = jsonStrings(parsed).map((value) => {
    const index = lines.findIndex((line) => line.includes(JSON.stringify(value)));
    return { text: value, line: index === -1 ? 1 : index + 1 };
  });
  return { units, bypasses: [], dials: [] };
}

function factsOf(file: SourceFile): Facts {
  const extension = extensionOf(file.path);
  if (CODE_EXTENSIONS.has(extension)) {
    return mentionsOpenOwnBotService(file.text) || BYPASS_HINT.test(file.text)
      ? codeFacts(file)
      : { units: [], bypasses: [], dials: [] };
  }
  if (!mentionsOpenOwnBotService(file.text)) return { units: [], bypasses: [], dials: [] };
  return extension === ".json" ? jsonFacts(file.text) : lineFacts(file.text);
}

function quote(text: string): string {
  return JSON.stringify(text.length > 90 ? `${text.slice(0, 90)}...` : text);
}

function allowlistProblems(allowlist: readonly AllowEntry[]): Finding[] {
  return allowlist.flatMap((entry): Finding[] => {
    const problems: string[] = [];
    if (/[*?[\]{}]/u.test(entry.path)) problems.push("the path is a glob: name one exact path");
    if (entry.rule === "mention" && !(entry.unit.source.startsWith("^") && entry.unit.source.endsWith("$"))) {
      problems.push("the pattern is not anchored with ^ and $");
    }
    const gate = CONFIG_GATES.find((candidate) => candidate.path === entry.path);
    if (gate && entry.rule === "mention" && entry.reason !== "gated") {
      problems.push(`only a "gated" mention is allowed in ${gate.path}`);
    }
    return problems.map((message) => ({ path: entry.path, line: null, message: `allowlist entry: ${message}.` }));
  });
}

function matches(entry: AllowEntry, path: string, text: string): boolean {
  return entry.rule === "mention" && entry.path === path && entry.unit.test(text);
}

function gateProblem(gate: ConfigGate, files: readonly SourceFile[], line: number): Finding | null {
  const source = files.find((file) => file.path === gate.gateFile);
  if (source === undefined) {
    return { path: gate.path, line, message: `names a ROBot service, and ${gate.gateFile} is not in the scan.` };
  }
  return gate.holds(source.text)
    ? null
    : {
        path: gate.path,
        line,
        message: `names a ROBot service, and ${gate.gateFile} no longer keeps it off: ${gate.requirement}.`,
      };
}

/** Checks `files` against `allowlist`. Pass every scanned file: an entry for a missing file is stale. */
export function checkFiles(
  files: readonly SourceFile[],
  allowlist: readonly AllowEntry[] = LOCAL_ONLY_ALLOWLIST,
  gates: readonly ConfigGate[] = CONFIG_GATES,
): Finding[] {
  const findings: Finding[] = allowlistProblems(allowlist);
  const used = new Set<AllowEntry>();
  const gatedHits = new Map<string, number>();

  for (const file of files.filter((candidate) => isScanned(candidate.path))) {
    const facts = factsOf(file);
    for (const unit of facts.units.filter((candidate) => mentionsOpenOwnBotService(candidate.text))) {
      const entry = allowlist.find((candidate) => matches(candidate, file.path, unit.text));
      if (entry) {
        used.add(entry);
        if (gates.some((gate) => gate.path === file.path) && !gatedHits.has(file.path))
          gatedHits.set(file.path, unit.line);
      } else {
        findings.push({
          path: file.path,
          line: unit.line,
          message: `${quote(unit.text)} names a ROBot service and is not on the allowlist.`,
        });
      }
    }
    for (const use of facts.bypasses) {
      const entry = allowlist.find(
        (candidate) =>
          candidate.rule === "bypass" && candidate.path === file.path && candidate.primitive === use.primitive,
      );
      if (entry) used.add(entry);
      else
        findings.push({
          path: file.path,
          line: use.line,
          message: `${BYPASS_TEXT[use.primitive]}, and is not on the allowlist.`,
        });
    }
    if (facts.dials.length > 0 && !file.text.includes("refusesOpenOwnBotUrl(")) {
      const entry = allowlist.find((candidate) => candidate.rule === "dynamic-dial" && candidate.path === file.path);
      if (entry) used.add(entry);
      else {
        for (const line of facts.dials) {
          findings.push({
            path: file.path,
            line,
            message:
              "dials a WebSocket with a URL that is not a plain string: ask refusesOpenOwnBotUrl() first, or add a dynamic-dial entry.",
          });
        }
      }
    }
  }

  for (const [path, line] of gatedHits) {
    const gate = gates.find((candidate) => candidate.path === path);
    const problem = gate ? gateProblem(gate, files, line) : null;
    if (problem) findings.push(problem);
  }
  for (const entry of allowlist.filter((candidate) => !used.has(candidate))) {
    const detail = entry.rule === "mention" ? ` ${entry.unit}` : entry.rule === "bypass" ? ` ${entry.primitive}` : "";
    findings.push({
      path: entry.path,
      line: null,
      message: `stale allowlist entry (${entry.rule}${detail}) matches nothing: delete it.`,
    });
  }
  return findings.sort((left, right) => left.path.localeCompare(right.path) || (left.line ?? 0) - (right.line ?? 0));
}

export function readTrackedFiles(root: string): SourceFile[] {
  const listed = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return listed
    .split("\0")
    .filter((path) => path !== "" && isScanned(path))
    .map((path) => ({ path, text: readFileSync(resolve(root, path), "utf8") }));
}

export function formatFinding(finding: Finding): string {
  return `check:local-only: ${finding.path}${finding.line === null ? "" : `:${finding.line}`} ${finding.message}`;
}

if (import.meta.main) {
  const files = readTrackedFiles(resolve(import.meta.dirname, ".."));
  const findings = checkFiles(files);
  if (findings.length > 0) {
    process.stderr.write(
      `${[
        ...findings.map(formatFinding),
        "",
        'Gate the call with LOCAL_ONLY, then add it to scripts/local-only-allowlist.ts as "gated". A call that only shows or parses the text is "not-fetched".',
      ].join("\n")}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `check:local-only: ${files.length} files scanned, ${LOCAL_ONLY_ALLOWLIST.length} allowlist entries, no findings.\n`,
  );
}
