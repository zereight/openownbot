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

/** Why `name` cannot be set, or null when it can. */
export function providerEnvironmentIssue(name: string): string | null {
  if (!NAME.test(name)) return "The name may hold only letters, digits and _, and cannot start with a digit.";
  const upper = name.toUpperCase();
  if (REFUSED_NAMES.has(upper) || REFUSED_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
    return `${name} is set by OpenBot and cannot be changed here.`;
  }
  return null;
}

export type ProviderEnvironmentParse =
  | { ok: true; environment: ProviderEnvironment }
  | { ok: false; line: number; message: string };

/** The variables of a text with one NAME=value on each line. A blank line and a line that starts with # are skipped. */
export function parseProviderEnvironment(text: string): ProviderEnvironmentParse {
  const environment: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const at = index + 1;
    const equals = line.indexOf("=");
    if (equals < 0) return { ok: false, line: at, message: "Write each variable as NAME=value." };
    const name = line.slice(0, equals).trim();
    const value = line.slice(equals + 1).trim();
    const issue = providerEnvironmentIssue(name);
    if (issue) return { ok: false, line: at, message: issue };
    if (Object.hasOwn(environment, name)) return { ok: false, line: at, message: `${name} is set twice.` };
    if (value.length > PROVIDER_ENVIRONMENT_LIMITS.valueLength) {
      return { ok: false, line: at, message: `The value of ${name} is too long.` };
    }
    if (Object.keys(environment).length >= PROVIDER_ENVIRONMENT_LIMITS.variables) {
      return {
        ok: false,
        line: at,
        message: `A provider can hold at most ${PROVIDER_ENVIRONMENT_LIMITS.variables} variables.`,
      };
    }
    environment[name] = value;
  }
  return { ok: true, environment };
}

/** The text that `parseProviderEnvironment` reads back as `environment`. */
export function formatProviderEnvironment(environment: ProviderEnvironment): string {
  return Object.entries(environment)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n");
}

/**
 * The entries of a stored value that `parseProviderEnvironment` would accept. A name that a later
 * release refuses, or a value that is not text, is dropped here and the rest is kept, so one bad
 * entry never makes the file unreadable.
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

/** The variables that Claude's process gets on top of its own, as the settings page reads them. */
export interface ProviderEnvironmentState {
  environment: ProviderEnvironment;
}

export function decodeProviderEnvironmentState(value: unknown): ProviderEnvironmentState {
  if (typeof value !== "object" || value === null || !("environment" in value)) {
    throw new Error("Invalid provider environment.");
  }
  return { environment: readProviderEnvironment(value.environment) };
}
