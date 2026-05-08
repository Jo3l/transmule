/**
 * Torrent search coordinator — streaming variant.
 *
 * Runs each plugin individually and calls onResult as each one completes,
 * so the caller can stream results progressively.
 */
import type { TorrentSearchResult } from "../providers/types";
import {
  ensureProviders,
  getTorrentSearchProviders,
} from "../providers/loader";
import { enrichWithParsedTags } from "./parse-name";

export type { TorrentSearchResult };

export interface TorrentSearchStreamOptions {
  query: string;
  /** Plugin id to query, or "all" to run every enabled torrent-search plugin. */
  source: string;
  /** Max results per plugin (default 50) */
  limit?: number;
  /** Pre-encoded extra tracker params appended to magnet links */
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

/**
 * Search all target plugins and call `onResult` for each completed source.
 * Returns once all plugins have finished.
 */
export async function searchTorrentsStreamed(
  opts: TorrentSearchStreamOptions,
  onResult: (sourceId: string, results: TorrentSearchResult[]) => void,
): Promise<void> {
  const { query, source, limit = 50, extraTrackers = "" } = opts;

  await ensureProviders();
  const plugins = getTorrentSearchProviders();

  const targets =
    source === "all"
      ? plugins
      : plugins.filter((p) => p.meta.id === source);

  if (targets.length === 0) {
    onResult("_none", []);
    return;
  }

  const tasks = targets.map((p) =>
    safeSearch(() => p.search(query, limit, extraTrackers)).then((results) => {
      const enriched = results.map(enrichWithParsedTags);
      // De-duplicate within this source
      const map = new Map<string, TorrentSearchResult>();
      for (const item of enriched) {
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
      const deduped = [...map.values()].sort(
        (a, b) => b.seeders - a.seeders,
      );
      onResult(p.meta.id, deduped);
    }),
  );

  await Promise.allSettled(tasks);
}
