import { type DynamicRecord, isDynamicRecord } from "@robot/contracts/runtime-values";
import { Effect } from "effect";
import type { DecisionBackend, DecisionFetch } from "./channel-decision";
import {
  COMPUTER_DECISION_TIMEOUT_MS,
  type ComputerDecisionRefusal,
  computerDecisionOutcome,
  computerDecisionRequest,
  type ScreenElement,
} from "./computer-use-decision";

/**
 * The fast path of Computer Use: a bounded loop where a decision model clicks, types and scrolls, and
 * the calling agent takes over the moment the model is unsure.
 *
 * The loop never finishes a task by itself. `done` is only the model's claim, which the agent checks
 * against the elements this result returns, because a model that stops early looks the same as one
 * that is right. Everything else (no backend, a slow or refused answer, a refused action, the step
 * limit) is `fallback`, and carries what the agent needs to carry on with the ordinary driver tools.
 */

export const FAST_STEP_LIMIT = 6;
const SCROLL_NOTCHES = 3;
const REPORTED_ELEMENTS = 60;

/** One driver tool call, as the loop needs it. The caller owns the connection and its lease. */
export interface FastDriverResult {
  isError: boolean;
  structured: DynamicRecord | null;
  text: string;
}
export type FastDriverCall = (name: string, args: DynamicRecord) => Effect.Effect<FastDriverResult, unknown>;

export interface FastRunInput {
  goal: string;
  pid: number;
  windowId: number;
  /** The text to type when the goal needs some. Null when it needs none. */
  text: string | null;
  backend: DecisionBackend | null;
}

export interface FastRunPorts {
  driver: FastDriverCall;
  fetch: DecisionFetch;
  now?: () => number;
}

export interface FastStepReport {
  operation: string;
  element: string | null;
  probability: number;
  milliseconds: number;
}

export type FastRunFallbackReason =
  | "no-backend"
  | "driver"
  | "empty-window"
  | "no-controls"
  | "network"
  | "timeout"
  | "unreadable"
  | "action-failed"
  | "step-limit"
  | `http-${number}`
  | ComputerDecisionRefusal;

export type FastRunResult =
  | { status: "done"; steps: FastStepReport[]; elements: string[] }
  | { status: "fallback"; reason: FastRunFallbackReason; steps: FastStepReport[]; elements: string[] };

interface Snapshot {
  elements: ScreenElement[];
  tokens: Map<number, string>;
  labels: Map<number, string>;
}

function readSnapshot(structured: DynamicRecord | null): Snapshot | null {
  const rows = structured?.elements;
  if (!Array.isArray(rows)) return null;
  const snapshot: Snapshot = { elements: [], tokens: new Map(), labels: new Map() };
  for (const row of rows) {
    if (!isDynamicRecord(row) || typeof row.element_index !== "number" || typeof row.role !== "string") continue;
    const label = typeof row.label === "string" ? row.label : "";
    const actions = Array.isArray(row.actions) ? row.actions.filter((item) => typeof item === "string") : [];
    snapshot.elements.push({
      index: row.element_index,
      role: row.role,
      label,
      value: typeof row.value === "string" ? row.value : null,
      actions,
    });
    snapshot.labels.set(row.element_index, `${row.role} ${label}`.trim());
    if (typeof row.element_token === "string") snapshot.tokens.set(row.element_index, row.element_token);
  }
  return snapshot;
}

/** The elements the agent continues from, one line each, so it needs no second snapshot to decide. */
function report(snapshot: Snapshot | null): string[] {
  if (!snapshot) return [];
  return snapshot.elements
    .slice(0, REPORTED_ELEMENTS)
    .map((element) => `[${element.index}] ${element.role} ${element.label}`.trim());
}

async function askBackend(
  request: NonNullable<ReturnType<typeof computerDecisionRequest>>,
  ports: FastRunPorts,
): Promise<{ ok: true; body: unknown } | { ok: false; reason: FastRunFallbackReason }> {
  let response: Response;
  try {
    response = await ports.fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(COMPUTER_DECISION_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, reason: timedOut ? "timeout" : "network" };
  }
  if (!response.ok) return { ok: false, reason: `http-${response.status}` };
  try {
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

export const runFastComputerUse = Effect.fn("ComputerUseFast.run")(function* (
  input: FastRunInput,
  ports: FastRunPorts,
): Effect.fn.Return<FastRunResult> {
  const steps: FastStepReport[] = [];
  const clock = ports.now ?? Date.now;
  let snapshot: Snapshot | null = null;
  const fallback = (reason: FastRunFallbackReason): FastRunResult => ({
    status: "fallback",
    reason,
    steps,
    elements: report(snapshot),
  });
  const backend = input.backend;
  if (!backend) return fallback("no-backend");

  let text = input.text;
  for (let step = 0; step < FAST_STEP_LIMIT; step += 1) {
    const state = yield* Effect.result(
      ports.driver("get_window_state", {
        pid: input.pid,
        window_id: input.windowId,
        include_screenshot: false,
        max_elements: 400,
      }),
    );
    if (state._tag === "Failure" || state.success.isError) return fallback("driver");
    snapshot = readSnapshot(state.success.structured);
    if (!snapshot || snapshot.elements.length === 0) return fallback("empty-window");

    const request = computerDecisionRequest(backend, { goal: input.goal, elements: snapshot.elements, text });
    if (!request) return fallback("no-controls");
    const started = clock();
    const answer = yield* Effect.promise(() => askBackend(request, ports));
    if (!answer.ok) return fallback(answer.reason);
    const outcome = computerDecisionOutcome(answer.body, { goal: input.goal, elements: snapshot.elements, text });
    if (!outcome.ok) return fallback(outcome.reason);

    const label = outcome.element === null ? null : (snapshot.labels.get(outcome.element) ?? null);
    steps.push({
      operation: outcome.operation,
      element: label,
      probability: outcome.probability,
      milliseconds: clock() - started,
    });
    if (outcome.operation === "DONE") return { status: "done", steps, elements: report(snapshot) };

    const token = outcome.element === null ? undefined : snapshot.tokens.get(outcome.element);
    if (outcome.element !== null && token === undefined) return fallback("action-failed");
    const target = { pid: input.pid, window_id: input.windowId };
    const acted = yield* Effect.result(
      outcome.operation === "CLICK"
        ? ports.driver("click", { ...target, element_token: token })
        : outcome.operation === "TYPE_TEXT"
          ? ports.driver("type_text", { ...target, element_token: token, text: text ?? "" })
          : ports.driver("scroll", {
              ...target,
              direction: outcome.operation === "SCROLL_DOWN" ? "down" : "up",
              amount: SCROLL_NOTCHES,
            }),
    );
    if (acted._tag === "Failure" || acted.success.isError) return fallback("action-failed");
    if (outcome.operation === "TYPE_TEXT") text = null;
  }
  return fallback("step-limit");
});
