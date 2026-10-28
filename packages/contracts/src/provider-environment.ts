import { isDynamicRecord } from "./runtime-values";

/** The most variables a provider can hold, and the longest value of one. */
export const PROVIDER_ENVIRONMENT_LIMITS = { variables: 32, valueLength: 4096 } as const;

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/**
 * Names that a person cannot set, since each would break something OpenBot owns: the keys and the
 * sign-in of a provider, where programs and the config are found, what runs before a program starts,
 * and the variables that OpenBot sets for its own processes.
 */
const REFUSED_NAMES: ReadonlySet<string> = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "PATH",
  "HOME",
  "USERPROFILE",
  "SHELL",
  "CLAUDE_CONFIG_DIR",
  "NODE_OPTIONS",
  "CLAUDE_CODE_ENABLE_TODO_TOOLS",
  "NODE_PATH",
  "ELECTRON_RUN_AS_NODE",
]);
const REFUSED_PREFIXES = ["OPENBOT_", "CLAUDE_AGENT_SDK_", "DYLD_", "LD_"] as const;

export type ProviderEnvironment = Readonly<Record<string, string>>;

/** Renderer to main. `value: null` keeps the value that main holds for this secret name. */
export interface ProviderEnvironmentInput {
  name: string;
  secret: boolean;
  value: string | null;
}

/** Main to renderer. The value of a secret never comes back: it is null. */
export interface ProviderEnvironmentEntry {
  name: string;
  secret: boolean;
  value: string | null;
}

export interface ProviderEnvironmentState {
  entries: ProviderEnvironmentEntry[];
}

/** Why `name` cannot be set, or null when it can. */
export function providerEnvironmentIssue(name: string): string | null {
  if (!NAME.test(name)) return "The name may hold only letters, digits and _, and cannot start with a digit.";
  const upper = name.toUpperCase();
  if (REFUSED_NAMES.has(upper) || REFUSED_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
    return `${name} is set by OpenBot and cannot be changed here.`;
  }
  return null;
}

/**
 * The first problem of a list that a person typed, with its row number, or null when it can be
 * saved. `saved` names the secrets that main holds, since only those can keep their value.
 */
export function providerEnvironmentInputIssue(
  inputs: readonly ProviderEnvironmentInput[],
  saved: ReadonlySet<string>,
): string | null {
  if (inputs.length > PROVIDER_ENVIRONMENT_LIMITS.variables) {
    return `A provider can hold at most ${PROVIDER_ENVIRONMENT_LIMITS.variables} variables.`;
  }
  const seen = new Set<string>();
  for (const [index, input] of inputs.entries()) {
    const row = `Row ${index + 1}: `;
    const issue = providerEnvironmentIssue(input.name);
    if (issue) return row + issue;
    if (seen.has(input.name)) return `${row}${input.name} is set twice.`;
    seen.add(input.name);
    if (input.value === null) {
      if (!input.secret || !saved.has(input.name)) return `${row}${input.name} needs a value.`;
    } else if (input.value.length > PROVIDER_ENVIRONMENT_LIMITS.valueLength) {
      return `${row}The value of ${input.name} is too long. It can hold ${PROVIDER_ENVIRONMENT_LIMITS.valueLength} characters.`;
    }
  }
  return null;
}

/**
 * The entries of a stored map that `providerEnvironmentIssue` accepts. A name that a later release
 * refuses, or a value that is not text, is dropped here and the rest is kept, so one bad entry never
 * makes the file unreadable.
 */
export function readProviderEnvironment(value: unknown): ProviderEnvironment {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const environment: Record<string, string> = {};
  for (const [name, item] of Object.entries(value)) {
    if (Object.keys(environment).length >= PROVIDER_ENVIRONMENT_LIMITS.variables) break;
    if (typeof item !== "string" || item.length > PROVIDER_ENVIRONMENT_LIMITS.valueLength) continue;
    if (providerEnvironmentIssue(name) === null) environment[name] = item;
  }
  return environment;
}

export function decodeProviderEnvironmentState(value: unknown): ProviderEnvironmentState {
  if (typeof value !== "object" || value === null || !("entries" in value) || !Array.isArray(value.entries)) {
    throw new Error("Invalid provider environment.");
  }
  const entries: ProviderEnvironmentEntry[] = [];
  for (const item of value.entries) {
    if (!isDynamicRecord(item) || typeof item.name !== "string" || typeof item.secret !== "boolean") continue;
    // A secret never comes back, so a value on a secret row is dropped, not trusted.
    entries.push({
      name: item.name,
      secret: item.secret,
      value: !item.secret && typeof item.value === "string" ? item.value : null,
    });
  }
  return { entries };
}
