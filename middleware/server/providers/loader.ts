/**
 * Provider registry.
 *
 * Discovers and loads every `*.ts` file under `server/providers/`
 * (excluding types.ts and this loader itself).
 *
 * At runtime providers are registered once and looked up by id.
 */

import type { MediaProvider } from "./types";

const _providers = new Map<string, MediaProvider>();
let _loaded = false;

/** Register a provider manually (used by each provider file's init). */
export function registerProvider(provider: MediaProvider): void {
  _providers.set(provider.meta.id, provider);
}

/** Get a provider by id. */
export function getProvider(id: string): MediaProvider | undefined {
  return _providers.get(id);
}

/** Get all registered providers. */
export function getAllProviders(): MediaProvider[] {
  return [..._providers.values()];
}

/** Ensure all built-in providers are loaded (call once from API). */
export async function ensureProviders(): Promise<void> {
  if (_loaded) return;
  _loaded = true;

  // Eagerly import each built-in provider so it self-registers.
  // @ts-expect-error dynamic provider imports resolved at runtime by Nitro
  await import("./yts");
  // @ts-expect-error dynamic provider imports resolved at runtime by Nitro
  await import("./dontorrent-movies");
  // @ts-expect-error dynamic provider imports resolved at runtime by Nitro
  await import("./dontorrent-shows");
  // @ts-expect-error dynamic provider imports resolved at runtime by Nitro
  await import("./showrss");
}
