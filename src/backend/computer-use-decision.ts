import { isDynamicRecord } from "@robot/contracts/runtime-values";
import { type DecisionBackend, decisionEndpoint } from "./channel-decision";

/**
 * The fast path of Computer Use: one request to a decision model picks an operation and the element
 * to act on, from the accessibility elements of one window. This module builds that request and
 * checks the answer. It does no I/O, so the loop that sends it owns the deadline and the retries.
 *
 * The model is only trusted when it is sure. Anything else, and every failure, hands the turn back to
 * the calling agent, which carries on with the ordinary driver tools: a decision model alone solved
 * about a third of the tasks of a public benchmark, so it is a first attempt and not the last word.
 */

/** One row of `get_window_state.elements`, as far as the decision needs it. */
export interface ScreenElement {
  index: number;
  role: string;
  label: string;
  value: string | null;
  actions: readonly string[];
}

export type ComputerOperation = "CLICK" | "TYPE_TEXT" | "SCROLL_DOWN" | "SCROLL_UP" | "DONE" | "BLOCKED";

export interface ComputerDecisionInput {
  goal: string;
  elements: readonly ScreenElement[];
  /** The text the calling agent wants typed, or null when this step has none to type. */
  text: string | null;
}

export type ComputerDecision =
  | { ok: true; operation: "CLICK" | "TYPE_TEXT"; element: number; probability: number }
  | { ok: true; operation: "SCROLL_DOWN" | "SCROLL_UP" | "DONE"; element: null; probability: number }
  | { ok: false; reason: ComputerDecisionRefusal };

export type ComputerDecisionRefusal =
  | "shape"
  | "blocked"
  | "below-threshold"
  | "not-top"
  | "unknown-choice"
  | "bad-probability"
  | "no-controls";

/** What the operation and its target must each reach. Below it, the calling agent decides. */
export const COMPUTER_DECISION_THRESHOLD = 0.75;
/** A step that waits longer is slower than the agent's own next call would have been. */
export const COMPUTER_DECISION_TIMEOUT_MS = 3000;

const MAX_ELEMENTS = 120;
const LABEL_CHARACTERS = 80;
const GOAL_CHARACTERS = 500;
const OPERATION_QUESTION = "operation";
const CLICK_QUESTION = "click_target";
const TYPE_QUESTION = "type_text_target";

const TEXT_ROLES = new Set(["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"]);
/** A control whose content is secret: its value is never read, and nothing is typed into it. */
const SECURE_ROLES = new Set(["AXSecureTextField"]);
const SECRET_LABEL = /pass(word|code|phrase)|secret|token|api.?key|credit|card|cvv|cvc|ssn|pin\b|otp|비밀번호|암호/i;
const PASSIVE_ROLES = new Set(["AXStaticText", "AXImage", "AXGroup", "AXScrollArea", "AXSplitGroup", "AXUnknown"]);

const OPERATIONS: Record<ComputerOperation, string> = {
  CLICK: "Press a button, tab, row, menu item or checkbox.",
  TYPE_TEXT: "Enter the given text into a text field.",
  SCROLL_DOWN: "Scroll the content down to reveal more controls.",
  SCROLL_UP: "Scroll the content up to reveal more controls.",
  DONE: "The goal is already reached on this screen.",
  BLOCKED: "The goal cannot be reached with these controls.",
};

function isSecret(element: ScreenElement): boolean {
  return SECURE_ROLES.has(element.role) || SECRET_LABEL.test(element.label);
}

/** The one-line text of an element. A secret control shows its role and label and never its value. */
function describeElement(element: ScreenElement): string {
  const label = element.label.replace(/\s+/g, " ").trim().slice(0, LABEL_CHARACTERS);
  const value =
    element.value && !isSecret(element) ? element.value.replace(/\s+/g, " ").trim().slice(0, LABEL_CHARACTERS) : "";
  return `${element.role} "${label}"${value ? ` value "${value}"` : ""}`;
}

function isTextTarget(element: ScreenElement): boolean {
  return TEXT_ROLES.has(element.role) && !isSecret(element);
}

function isClickTarget(element: ScreenElement): boolean {
  if (SECURE_ROLES.has(element.role) || TEXT_ROLES.has(element.role)) return false;
  return element.actions.length > 0 || !PASSIVE_ROLES.has(element.role);
}

interface Offered {
  clicks: ScreenElement[];
  types: ScreenElement[];
}

function offered(input: ComputerDecisionInput): Offered {
  const elements = input.elements.slice(0, MAX_ELEMENTS);
  return {
    clicks: elements.filter(isClickTarget),
    types: input.text === null ? [] : elements.filter(isTextTarget),
  };
}

const elementKey = (element: ScreenElement) => `e${element.index}`;

function criteria(elements: readonly ScreenElement[]): Record<string, string> {
  return Object.fromEntries(elements.map((element) => [elementKey(element), describeElement(element)]));
}

export interface ComputerDecisionRequest {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    state: { goal: string; typing: boolean; controls: string[] };
    questions: Record<string, { type: "choice"; instructions: string; criteria: Record<string, string> }>;
  };
}

/**
 * The request for one step, or null when the screen offers nothing to act on (the agent decides).
 *
 * The target heads are asked in the same request as the operation, so a click costs one round trip:
 * only the head of the operation that wins is read. The text itself is never sent. It is the agent's
 * own words, and the model only has to know whether there is some to type.
 */
export function computerDecisionRequest(
  backend: DecisionBackend,
  input: ComputerDecisionInput,
): ComputerDecisionRequest | null {
  const { clicks, types } = offered(input);
  if (clicks.length === 0 && types.length === 0) return null;
  const { url, headers, model } = decisionEndpoint(backend);

  const operations: ComputerOperation[] = [
    ...(clicks.length > 0 ? (["CLICK"] as const) : []),
    ...(types.length > 0 ? (["TYPE_TEXT"] as const) : []),
    "SCROLL_DOWN",
    "SCROLL_UP",
    "DONE",
    "BLOCKED",
  ];
  const questions: ComputerDecisionRequest["body"]["questions"] = {
    [OPERATION_QUESTION]: {
      type: "choice",
      instructions: "Which operation moves the goal forward on this screen?",
      criteria: Object.fromEntries(operations.map((operation) => [operation, OPERATIONS[operation]])),
    },
  };
  if (clicks.length > 0) {
    questions[CLICK_QUESTION] = {
      type: "choice",
      instructions: "If the operation is CLICK, which control should be pressed?",
      criteria: criteria(clicks),
    };
  }
  if (types.length > 0) {
    questions[TYPE_QUESTION] = {
      type: "choice",
      instructions: "If the operation is TYPE_TEXT, which text field should receive the text?",
      criteria: criteria(types),
    };
  }
  return {
    url,
    headers,
    body: {
      model,
      state: {
        goal: input.goal.slice(0, GOAL_CHARACTERS),
        typing: input.text !== null,
        controls: [...clicks, ...types].map((element) => `${elementKey(element)}: ${describeElement(element)}`),
      },
      questions,
    },
  };
}

interface ChoiceAnswer {
  choice: string;
  probabilities: Record<string, number>;
}

function choiceAnswer(response: unknown, question: string): ChoiceAnswer | null {
  const answered = isDynamicRecord(response) && isDynamicRecord(response.result) ? response.result : response;
  if (!isDynamicRecord(answered) || !isDynamicRecord(answered.answers)) return null;
  const answer = answered.answers[question];
  if (!isDynamicRecord(answer) || typeof answer.choice !== "string" || !isDynamicRecord(answer.probabilities))
    return null;
  const probabilities: Record<string, number> = {};
  for (const [key, value] of Object.entries(answer.probabilities)) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    probabilities[key] = value;
  }
  return { choice: answer.choice, probabilities };
}

type Picked = { ok: true; key: string; probability: number } | { ok: false; reason: ComputerDecisionRefusal };

/** The option that the answer picks, when it is offered, the most likely one, and sure enough. */
function pick(answer: ChoiceAnswer | null, keys: readonly string[]): Picked {
  if (!answer) return { ok: false, reason: "shape" };
  if (!keys.includes(answer.choice)) return { ok: false, reason: "unknown-choice" };
  const probability = answer.probabilities[answer.choice];
  if (probability === undefined) return { ok: false, reason: "bad-probability" };
  if (probability < COMPUTER_DECISION_THRESHOLD) return { ok: false, reason: "below-threshold" };
  if (Object.values(answer.probabilities).some((value) => value > probability)) return { ok: false, reason: "not-top" };
  return { ok: true, key: answer.choice, probability };
}

/**
 * The step the answer allows, or the reason it must not be used. `BLOCKED` is a refusal too: the
 * model saying it cannot reach the goal is the moment the agent should take over.
 */
export function computerDecisionOutcome(response: unknown, input: ComputerDecisionInput): ComputerDecision {
  const { clicks, types } = offered(input);
  const operations: readonly string[] = Object.keys(OPERATIONS);
  const operation = pick(choiceAnswer(response, OPERATION_QUESTION), operations);
  if (!operation.ok) return operation;
  switch (operation.key) {
    case "BLOCKED":
      return { ok: false, reason: "blocked" };
    case "CLICK":
    case "TYPE_TEXT": {
      const candidates = operation.key === "CLICK" ? clicks : types;
      if (candidates.length === 0) return { ok: false, reason: "no-controls" };
      const target = pick(
        choiceAnswer(response, operation.key === "CLICK" ? CLICK_QUESTION : TYPE_QUESTION),
        candidates.map(elementKey),
      );
      if (!target.ok) return target;
      const element = candidates.find((candidate) => elementKey(candidate) === target.key);
      if (!element) return { ok: false, reason: "unknown-choice" };
      return {
        ok: true,
        operation: operation.key,
        element: element.index,
        probability: Math.min(operation.probability, target.probability),
      };
    }
    case "SCROLL_DOWN":
    case "SCROLL_UP":
    case "DONE":
      return { ok: true, operation: operation.key, element: null, probability: operation.probability };
    default:
      return { ok: false, reason: "unknown-choice" };
  }
}
