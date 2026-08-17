/**
 * Generic capability resolver.
 *
 * A plugin can declare `meta.capability: "cardigann"` (or an array) to request
 * core capabilities. This maps declared capability names to capability objects
 * injected into the plugin's `install(ctx)`. The core knows capability NAMES,
 * not plugin internals.
 */
import { createCardigannCapability } from "../services/cardigann-engine/capability";

export function resolveCapabilities(
  capability?: string | string[],
): Record<string, unknown> {
  const caps: Record<string, unknown> = {};
  const list = typeof capability === "string" ? [capability] : capability ?? [];
  for (const name of list) {
    if (name === "cardigann") {
      caps.cardigann = createCardigannCapability();
    }
  }
  return caps;
}
