/**
 * Torrent search coordinator.
 *
 * Delegates to registered torrent-search plugins loaded from data/plugins/.
 * Runs the requested plugin(s) in parallel, merges, de-duplicates, and
 * enriches all results with parsed torrent-name tags (quality, codec,
 * audio, languages, etc.) when the plugin doesn't provide native tags.
 */
import type { TorrentSearchResult } from "../providers/types";
import {
  ensureProviders,
  getTorrentSearchProviders,
} from "../providers/loader";
import { parseTorrentName } from "./parse-name";

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

  // Enrich all results with parsed torrent-name tags.
  // Plugins that already provide native tags (e.g. TorrentClaw) keep them;
  // the parser only fills in for results that have no tags.
  const results = [...map.values()].sort((a, b) => b.seeders - a.seeders);
  return results.map(enrichWithParsedTags);
}

/**
 * Adds parsed torrent-name tags to results that don't already have tags.
 * Native plugin tags (e.g. TorrentClaw's TrueSpec scores) are preserved.
 */
function enrichWithParsedTags(r: TorrentSearchResult): TorrentSearchResult {
  // Skip if the plugin already provided tags
  if (r.tags && r.tags.length > 0) return r;

  const { tags } = parseTorrentName(r.name);
  if (tags.length === 0) return r;

  return { ...r, tags };
}
