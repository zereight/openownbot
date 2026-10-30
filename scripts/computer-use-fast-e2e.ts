import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DynamicRecord, isDynamicRecord } from "@robot/contracts/runtime-values";
import { createOpenOwnBotLogger } from "@robot/logging";
import { Effect } from "effect";
import { type FastRunResult, runFastComputerUse } from "../src/backend/computer-use-fast";
import { CUA_DRIVER_VENDOR_CALLS_OFF } from "../src/main/cua-driver-artifact";
import { CuaDriverToolClient } from "../src/main/cua-driver-tool-client";
import { createFastComputerUseHost } from "../src/main/fast-computer-use-host";

/**
 * Drives the real driver daemon and the real Calculator through the fast path, with a local oracle in
 * place of the decision model. It checks the loop, the snapshot parsing, the element tokens and the
 * three ways back to the agent. It does not measure how well a decision model chooses: that needs a
 * Jev or OpenRouter key and a different script.
 *
 * Calculator is the target because pressing a digit changes nothing that outlasts the app. The script
 * refuses to run when Calculator is open already, and quits only the Calculator it started.
 */
const logger = createOpenOwnBotLogger("computer-use-fast-e2e");
const DRIVER = join(process.cwd(), "build", "cua-driver", process.platform, process.arch, "cua-driver");
const REPORT = join(process.cwd(), ".openownbot-build", "computer-use-fast-e2e.json");

type Oracle = "click-then-done" | "unsure" | "blocked";

function choice(key: string, options: readonly string[], probability: number) {
  const rest = options.filter((option) => option !== key);
  return {
    type: "choice",
    choice: key,
    probabilities: Object.fromEntries([
      [key, probability],
      ...rest.map((option) => [option, (1 - probability) / rest.length]),
    ]),
  };
}

interface OracleAnswer {
  answers: Record<string, ReturnType<typeof choice>>;
}

function oracleAnswer(mode: Oracle, call: number, body: DynamicRecord): OracleAnswer {
  const questions = isDynamicRecord(body.questions) ? body.questions : {};
  const operation = isDynamicRecord(questions.operation) ? questions.operation : {};
  const operationKeys = isDynamicRecord(operation.criteria) ? Object.keys(operation.criteria) : [];
  if (mode === "blocked") return { answers: { operation: choice("BLOCKED", operationKeys, 0.97) } };
  if (mode === "unsure") return { answers: { operation: choice("CLICK", operationKeys, 0.4) } };
  if (call > 0) return { answers: { operation: choice("DONE", operationKeys, 0.97) } };
  const clicks = isDynamicRecord(questions.click_target) ? questions.click_target : {};
  const criteria = isDynamicRecord(clicks.criteria) ? clicks.criteria : {};
  const seven = Object.entries(criteria).find(
    ([, text]) => typeof text === "string" && text.startsWith('AXButton "7"'),
  );
  if (!seven) return { answers: { operation: choice("BLOCKED", operationKeys, 0.97) } };
  return {
    answers: {
      operation: choice("CLICK", operationKeys, 0.97),
      click_target: choice(seven[0], Object.keys(criteria), 0.96),
    },
  };
}

async function startOracle(): Promise<{ url: string; mode: (next: Oracle) => void; close: () => void }> {
  let mode: Oracle = "click-then-done";
  let calls = 0;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const body = isDynamicRecord(parsed) ? parsed : {};
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(oracleAnswer(mode, calls++, body)));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("The oracle has no port.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    mode: (next) => {
      mode = next;
      calls = 0;
    },
    close: () => server.close(),
  };
}

function calculatorPid(): number | null {
  try {
    const pid = Number.parseInt(
      execFileSync("pgrep", ["-x", "Calculator"], { encoding: "utf8" }).split("\n")[0] ?? "",
      10,
    );
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function until<T>(read: () => Promise<T | null>, what: string): Promise<T> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = await read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

async function main(): Promise<void> {
  if (process.platform !== "darwin") throw new Error("This script drives Calculator on macOS.");
  if (calculatorPid() !== null)
    throw new Error("Calculator is open. Quit it first, so the script touches nothing of yours.");

  const directory = await mkdtemp(join(tmpdir(), "openownbot-fast-e2e-"));
  const socket = join(directory, "driver.sock");
  const daemon: ChildProcess = spawn(DRIVER, ["serve", "--socket", socket, "--no-overlay"], {
    env: { ...process.env, ...CUA_DRIVER_VENDOR_CALLS_OFF, CUA_DRIVER_EMBEDDED: "1" },
    stdio: "ignore",
  });
  const oracle = await startOracle();
  const client = new CuaDriverToolClient(() => socket);
  const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
  const scenarios: Record<string, { status: string; reason: string | null; steps: FastRunResult["steps"] }> = {};
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    execFileSync("open", ["-a", "Calculator"]);
    // The window is found by the process, because the driver reports the name in the user's language.
    const window = await until(async () => {
      const pid = calculatorPid();
      if (pid === null) return null;
      const listed = await run(client.call("list_windows", { on_screen_only: true, pid }));
      const windows = Array.isArray(listed.structured?.windows) ? listed.structured.windows : [];
      const found = windows.find((item) => isDynamicRecord(item) && item.pid === pid);
      return isDynamicRecord(found) && typeof found.window_id === "number" ? { pid, windowId: found.window_id } : null;
    }, "the Calculator window");

    const backend = { kind: "openrouter", apiKey: "oracle", model: "oracle" } as const;
    const fetchOracle = (_url: string | URL | Request, init?: RequestInit) => fetch(oracle.url, init);
    const attempt = async (name: string, mode: Oracle, withBackend: boolean): Promise<FastRunResult> => {
      oracle.mode(mode);
      const result = await run(
        runFastComputerUse(
          { goal: "Press the 7 button", ...window, text: null, backend: withBackend ? backend : null },
          { driver: client.call, fetch: fetchOracle },
        ),
      );
      scenarios[name] = {
        status: result.status,
        reason: "reason" in result ? result.reason : null,
        steps: result.steps,
      };
      return result;
    };

    // Calculator keeps its display out of the accessibility tree. The "All Clear" button turns into
    // "Clear" once a digit is entered, so its label is what shows that the press arrived.
    const clearLabel = async (): Promise<string | null> => {
      const state = await run(
        client.call("get_window_state", { pid: window.pid, window_id: window.windowId, include_screenshot: false }),
      );
      const rows = Array.isArray(state.structured?.elements) ? state.structured.elements : [];
      const clear = rows.find((row) => isDynamicRecord(row) && row.element_index === 2);
      return isDynamicRecord(clear) && typeof clear.label === "string" ? clear.label : null;
    };
    const labelBefore = await clearLabel();
    const done = await attempt("click-then-done", "click-then-done", true);
    const labelAfter = await clearLabel();
    const buttonChanged = labelBefore !== null && labelAfter !== null && labelBefore !== labelAfter;
    const unsure = await attempt("unsure-falls-back", "unsure", true);
    const blocked = await attempt("blocked-falls-back", "blocked", true);
    const none = await attempt("no-backend-falls-back", "click-then-done", false);

    // The path that the agent tool takes: the host opens its own lease, runs, and closes it.
    const host = createFastComputerUseHost({ backend: () => backend, socketPath: () => socket, fetch: fetchOracle });
    const hostOff = createFastComputerUseHost({ backend: () => null, socketPath: () => socket, fetch: fetchOracle });
    oracle.mode("click-then-done");
    const viaHost = await run(host.run({ goal: "Press the 7 button", ...window }));
    scenarios["via-host"] = {
      status: viaHost.status,
      reason: "reason" in viaHost ? viaHost.reason : null,
      steps: viaHost.steps,
    };

    const checks = {
      hostRunsToDone: viaHost.status === "done" && viaHost.steps.length === 2,
      hostNamesItsService: host.service() === "openrouter" && hostOff.service() === null,
      doneAfterOneClick: done.status === "done" && done.steps.length === 2 && done.steps[0]?.operation === "CLICK",
      buttonChanged,
      unsureFallsBack: unsure.status === "fallback" && unsure.reason === "below-threshold",
      blockedFallsBack: blocked.status === "fallback" && blocked.reason === "blocked",
      noBackendFallsBack: none.status === "fallback" && none.reason === "no-backend",
      fallbackCarriesElements: unsure.status === "fallback" && unsure.elements.length > 0,
    };
    await mkdir(join(process.cwd(), ".openownbot-build"), { recursive: true });
    await writeFile(REPORT, `${JSON.stringify({ scenarios, labelBefore, labelAfter, checks }, null, 2)}\n`);
    logger.info(`Wrote ${REPORT}`);
    if (!Object.values(checks).every(Boolean)) throw new Error(`A check failed: ${JSON.stringify(checks)}`);
  } finally {
    await run(client.close).catch(() => undefined);
    oracle.close();
    try {
      execFileSync("osascript", ["-e", 'tell application "Calculator" to quit']);
    } catch {
      // Calculator was not started, or has quit already.
    }
    daemon.kill("SIGTERM");
    await rm(directory, { recursive: true, force: true });
  }
}

await main();
