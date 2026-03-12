/**
 * Torrent search coordinator.
 *
 * Delegates to registered torrent-search plugins loaded from data/plugins/.
 * Runs the requested plugin(s) in parallel, merges and de-duplicates results.
 */
import type { TorrentSearchResult } from "../providers/types";
import {
  ensureProviders,
  getTorrentSearchProviders,
} from "../providers/loader";

export type { TorrentSearchResult };

export interface TorrentSearchOptions {
  query: string;
  /** Plugin id to query, or "all" to run every enabled torrent-search plugin. */
  source: string;
  /** Max results per plugin (default 50) */
  limit?: number;
  /** Pre-encoded extra tracker params (e.g. "&tr=...&tr=...") appended to magnet links */
  extraTrackers?: string;
}

/** Run a single plugin search, silently swallowing errors. */
async function safeSearch(
  fn: () => Promise<TorrentSearchResult[]>,
): Promise<TorrentSearchResult[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

export async function searchTorrents(
  opts: TorrentSearchOptions,
): Promise<TorrentSearchResult[]> {
  const { query, source, limit = 50, extraTrackers = "" } = opts;

  await ensureProviders();
  const plugins = getTorrentSearchProviders();

  const targets =
    source === "all" ? plugins : plugins.filter((p) => p.meta.id === source);

  const tasks = targets.map((p) =>
    safeSearch(() => p.search(query, limit, extraTrackers)),
  );

  const all = (await Promise.all(tasks)).flat();

  // De-duplicate by infoHash, keeping the entry with the highest seeder count
  const map = new Map<string, TorrentSearchResult>();
  for (const item of all) {
    const key = item.infoHash.toLowerCase();
    if (!key) {
      map.set(Math.random().toString(), item);
      continue;
    }
    const existing = map.get(key);
    if (!existing || item.seeders > existing.seeders) {
      map.set(key, item);
    }
  }

  return [...map.values()].sort((a, b) => b.seeders - a.seeders);
}
