import { isDynamicRecord } from "@openbot/contracts/runtime-values";

/**
 * The fast decision models that can pick the member for a request that names none: Jev of TypeSafe, a
 * decisions model on OpenRouter, or Clef on Cloudflare Workers AI. The three take one request shape (a
 * state and typed questions) and answer a probability for each option, so a person's lead model is asked
 * only when they are unsure or fail.
 */
export type DecisionBackend =
  | { kind: "jev"; apiKey: string }
  | { kind: "openrouter"; apiKey: string; model: string }
  | { kind: "cloudflare"; accountId: string; apiToken: string; model: "clef" | "clef-flash" };

export interface DecisionMember {
  id: string;
  name: string;
  title: string;
  description: string;
}

export interface DecisionInput {
  title: string;
  instructions: string;
  members: readonly DecisionMember[];
  recent: readonly { author: string; text: string }[];
  request: string;
}

/** The request that the three services take: a state, and typed questions about it. */
export interface DecisionBody {
  model: string;
  state: {
    channel: string;
    instructions: string;
    recent: { author: string; text: string }[];
    request: string;
  };
  questions: Record<string, { type: "choice"; instructions: string; criteria: Record<string, string> }>;
}

export interface DecisionRequest {
  url: string;
  headers: Record<string, string>;
  body: DecisionBody;
}

/** `fetch` as far as this module uses it: Bun's own type also asks for `preconnect`. */
export type DecisionFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type DecisionResult = { ok: true; agentId: string; probability: number } | { ok: false; reason: string };

/** What the model must reach to pick a member. Below it, the lead decides, as before. */
export const DECISION_THRESHOLD = 0.6;
/** A routing that waits longer is slower than the lead's own answer would have been. */
export const DECISION_TIMEOUT_MS = 3000;
export const CLOUDFLARE_ACCOUNT_ID = /^[a-f0-9]{32}$/;

const NONE = "none";
const QUESTION_ID = "member";
const INSTRUCTIONS_CHARACTERS = 1000;
const RECENT_CHARACTERS = 600;
const REQUEST_CHARACTERS = 2000;

const memberKey = (index: number) => `m${index + 1}`;

function optionKeys(input: DecisionInput): string[] {
  return [...input.members.map((_, index) => memberKey(index)), NONE];
}

function criteria(input: DecisionInput): Record<string, string> {
  return {
    ...Object.fromEntries(
      input.members.map((member, index) => [
        memberKey(index),
        [member.name, member.title, member.description].filter((part) => part.trim() !== "").join(": "),
      ]),
    ),
    [NONE]: "No single member fits this request, or it needs several members.",
  };
}

function body(model: string, input: DecisionInput): DecisionBody {
  return {
    model,
    state: {
      channel: input.title,
      instructions: input.instructions.slice(0, INSTRUCTIONS_CHARACTERS),
      recent: input.recent.map(({ author, text }) => ({ author, text: text.slice(-RECENT_CHARACTERS) })),
      request: input.request.slice(0, REQUEST_CHARACTERS),
    },
    questions: {
      [QUESTION_ID]: {
        type: "choice",
        instructions: "Which channel member should handle the request?",
        criteria: criteria(input),
      },
    },
  };
}

export function decisionRequest(backend: DecisionBackend, input: DecisionInput): DecisionRequest {
  switch (backend.kind) {
    case "jev":
      return {
        url: "https://api.typesafe.ai/v1/systemone",
        headers: { Authorization: `Bearer ${backend.apiKey}`, "Content-Type": "application/json" },
        body: body("jev-latest", input),
      };
    case "openrouter":
      return {
        url: "https://openrouter.ai/api/alpha/decisions",
        headers: { Authorization: `Bearer ${backend.apiKey}`, "Content-Type": "application/json" },
        body: body(backend.model, input),
      };
    case "cloudflare":
      return {
        url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(backend.accountId)}/ai/run/@cf/cloudflare/${backend.model}`,
        headers: { Authorization: `Bearer ${backend.apiToken}`, "Content-Type": "application/json" },
        body: body(backend.model, input),
      };
  }
}

/**
 * The option that the answer picks, or null when it must not be used: a choice that was not offered or is
 * not the most likely one, a probability that is no number, a pick of "none", or one below the threshold.
 * Cloudflare's API wraps the answer in `result`.
 */
export function decisionOutcome(
  response: unknown,
  keys: readonly string[],
): { key: string; probability: number } | null {
  const answered = isDynamicRecord(response) && isDynamicRecord(response.result) ? response.result : response;
  if (!isDynamicRecord(answered) || !isDynamicRecord(answered.answers)) return null;
  const answer = answered.answers[QUESTION_ID];
  if (!isDynamicRecord(answer) || typeof answer.choice !== "string" || !isDynamicRecord(answer.probabilities))
    return null;
  const { choice, probabilities } = answer;
  if (choice === NONE || !keys.includes(choice)) return null;
  const values = Object.values(probabilities);
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;
  const probability = probabilities[choice];
  if (typeof probability !== "number" || probability < DECISION_THRESHOLD) return null;
  if (values.some((value) => typeof value === "number" && value > probability)) return null;
  return { key: choice, probability };
}

export async function decideMember(
  backend: DecisionBackend,
  input: DecisionInput,
  options: { fetch: DecisionFetch; timeoutMs: number },
): Promise<DecisionResult> {
  if (input.members.length < 2) return { ok: false, reason: "no-choice" };
  const request = decisionRequest(backend, input);
  const keys = optionKeys(input);
  let response: Response;
  try {
    response = await options.fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      reason:
        (error instanceof DOMException && error.name === "TimeoutError") ||
        (error instanceof DOMException && error.name === "AbortError")
          ? "timeout"
          : "network",
    };
  }
  if (!response.ok) return { ok: false, reason: `http-${response.status}` };
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const outcome = decisionOutcome(parsed, keys);
  const index = outcome ? keys.indexOf(outcome.key) : -1;
  const member = index >= 0 ? input.members[index] : undefined;
  return outcome && member
    ? { ok: true, agentId: member.id, probability: outcome.probability }
    : { ok: false, reason: "unsure" };
}
