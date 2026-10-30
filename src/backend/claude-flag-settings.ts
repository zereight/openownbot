/**
 * The flag settings of a Claude query: the variables that the user set for the provider and the
 * `NODE_OPTIONS` of ROBot. The CLI reads `env` of this layer after the Claude settings files, so a
 * variable here replaces the same name in `~/.claude/settings.json` and in a project file. ROBot's
 * own `NODE_OPTIONS` goes last, so a stored value never replaces it.
 */
export function claudeFlagSettings(
  userEnvironment: Readonly<Record<string, string>>,
  nodeOptions: string | undefined,
): { env: Record<string, string> } | undefined {
  const env = { ...userEnvironment, ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}) };
  return Object.keys(env).length === 0 ? undefined : { env };
}
