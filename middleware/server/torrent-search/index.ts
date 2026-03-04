/**
 * Torrent search coordinator.
 *
 * Runs the requested provider(s) in parallel, merges their results and
 * de-duplicates by info_hash (keeping the entry with the most seeders).
 *
 * This whole folder can be deleted if a better search method is found.
 */
import type { TorrentSearchResult, TorrentSource } from "./types";
import { searchPirateBay } from "./providers/piratebay";
import { searchNyaa } from "./providers/nyaa";
import { searchYts } from "./providers/yts";

export type { TorrentSearchResult, TorrentSource };

export interface TorrentSearchOptions {
  query: string;
  /** Which source(s) to query. "all" runs every provider in parallel. */
  source: TorrentSource | "all";
  /** Max results per provider (default 50) */
  limit?: number;
  /** Pre-encoded extra tracker params (e.g. "&tr=...&tr=...") appended to magnet links */
  extraTrackers?: string;
}

/** Run a single provider, catching errors silently. */
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

  // Build list of providers to run
  const tasks: Promise<TorrentSearchResult[]>[] = [];

  if (source === "all" || source === "tpb") {
    tasks.push(safeSearch(() => searchPirateBay(query, limit, extraTrackers)));
  }
  if (source === "all" || source === "nyaa") {
    tasks.push(safeSearch(() => searchNyaa(query, limit, extraTrackers)));
  }
  if (source === "all" || source === "yts") {
    tasks.push(safeSearch(() => searchYts(query, limit, extraTrackers)));
  }

  const batches = await Promise.all(tasks);
  const all = batches.flat();

  // De-duplicate by info_hash, keeping the entry with highest seeder count
  const map = new Map<string, TorrentSearchResult>();
  for (const item of all) {
    const key = item.infoHash.toLowerCase();
    if (!key) {
      // No hash — always include
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
