import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { isString } from "@robot/contracts/runtime-values";
import { isRecord } from "./protocol";

/**
 * The extension that registers the models of a Pi provider. Pi lists the models of an extension such as
 * `pi-claude-bridge` (provider `claude-bridge`) only while it loads that extension, so a run that starts
 * with `--no-extensions` finds no such model and `set_model` fails with "Model not found".
 *
 * The package of a provider is named `pi-<provider>` in the npm folder of the Pi agent directory. Its
 * `package.json` names the extension files in `pi.extensions`. Null when no such package is installed.
 */
export function piExtensionForModel(model: string | null | undefined, agentDirectory: string): string | null {
  const separator = model?.indexOf("/") ?? -1;
  if (!model || separator < 1) return null;
  const provider = model.slice(0, separator);
  // The provider id becomes a folder name, so anything that is not a plain id is not looked up.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(provider)) return null;
  const packageDirectory = join(agentDirectory, "npm", "node_modules", `pi-${provider}`);
  try {
    const manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
    const pi = isRecord(manifest) ? manifest.pi : undefined;
    const extensions = isRecord(pi) && Array.isArray(pi.extensions) ? pi.extensions.filter(isString) : [];
    const [entry] = extensions;
    if (!entry) return null;
    const path = isAbsolute(entry) ? entry : resolve(packageDirectory, entry);
    // An entry may not point out of the package.
    return path.startsWith(`${packageDirectory}/`) ? path : null;
  } catch {
    return null;
  }
}
