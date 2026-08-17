/**
 * Media-provider plugin contract.
 *
 * Every provider is a single file that `export default` an object
 * satisfying `MediaProvider`.  The loader reads the `/providers`
 * directory and registers each one.
 */

// ── Unified data shapes ────────────────────────────────────────────────

export interface MediaLink {
  /** Displayable label (e.g. "720p bluray") */
  label: string;
  /** URL / magnet / torrent to send to the download service */
  url: string;
  /** Optional info columns (quality, type, size, seeds …) */
  quality?: string;
  type?: string;
  size?: string;
  seeds?: number;
  /** Optional hash for deduplication */
  hash?: string;
  /**
   * Target download service. Defaults to "transmission" when absent.
   * Set by plugins that need a different service (e.g. archive.org → "pyload").
   */
  service?: "transmission" | "amule" | "pyload" | "direct";
}

export interface MediaEpisode {
  code: string;
  links: MediaLink[];
  date?: string;
}

export interface MediaItem {
  /** Unique id within the provider run */
  id: string;
  title: string;
  /** Cover / poster image URL */
  cover?: string;
  /** Year or date string */
  year?: string;
  /** Publish / release date */
  date?: string;
  /** Genre(s) as a single comma-separated string */
  genre?: string;
  /** IMDb-style 0-10 rating */
  rating?: number;
  /** Runtime in minutes */
  runtime?: number;
  /** Short description / summary */
  description?: string;
  /** Format label (e.g. "1080p HDRip") */
  format?: string;
  /** File size label (e.g. "2.1 GB") */
  size?: string;
  /** Director name(s) */
  director?: string;
  /** Actor name(s) */
  actors?: string;
  /** Language code (e.g. "en", "es") */
  language?: string;
  /** Genre tags array */
  genres?: string[];
  /** Direct download links for movies / single items */
  links: MediaLink[];
  /** Episode list for series */
  episodes?: MediaEpisode[];
  /** Whether this item is a series with expandable episodes */
  isSeries?: boolean;
  /** External URL to the source page */
  sourceUrl?: string;
  /** If the item needs a second fetch for full detail (lazy load) */
  needsDetail?: boolean;
}

// ── Provider metadata & interface ──────────────────────────────────────

export type MediaType = string;
export type PluginType = "media" | "torrent-search";

export interface ProviderMeta {
  /** Machine-name slug (must match filename, e.g. "yts") */
  id: string;
  /** Human-readable name shown in the UI */
  name: string;
  /** MDI icon class (e.g. "mdi-filmstrip") */
  icon: string;
  /**
   * What kind of content it supplies — creates a sidebar nav section.
   * Omitted for "torrent-search" plugins (they have no sidebar entry).
   */
  mediaType?: MediaType;
  /** Plugin category: "media" (default) or "torrent-search" */
  pluginType?: PluginType;
  /** Short description for the settings panel */
  description?: string;
  /** Requested core capabilities (e.g. "cardigann"), injected via install(ctx). */
  capability?: string | string[];
}

export interface ProviderSearchParams {
  [key: string]: string | undefined;
  /**
   * When truthy, plugins should bypass any internal cache and fetch fresh data.
   * Set by the frontend when the user clicks the "refresh" button.
   */
  _noCache?: string;
}

export interface ProviderListResult {
  items: MediaItem[];
  /** Total available (for pagination) */
  total?: number;
  page?: number;
}

export interface MediaProvider {
  meta: ProviderMeta;

  /**
   * Fetch a listing / search of items.
   * `params` comes straight from the query-string.
   */
  list(params: ProviderSearchParams): Promise<ProviderListResult>;

  /**
   * (Optional) Fetch full detail for an item whose `needsDetail` is true.
   * The frontend passes the item's `sourceUrl`.
   */
  detail?(sourceUrl: string): Promise<Partial<MediaItem>>;

  /**
   * (Optional) Fetch a cover image for an item (used by ShowRSS → episodate).
   * Returns an image URL or null.
   */
  cover?(title: string): Promise<string | null>;

  /**
   * (Optional) Provider-specific filter definitions shown in the UI.
   */
  filters?: ProviderFilter[];
}

export interface ProviderFilterOption {
  label: string;
  value: string;
}

export interface ProviderFilter {
  key: string;
  label: string;
  type: "select" | "text";
  options?: ProviderFilterOption[];
  defaultValue?: string;
}

// ── Torrent tag system ─────────────────────────────────────────────────────

/**
 * A single tag badge shown in the torrent search results, below the name.
 * Plugins return these via TorrentSearchResult.tags[].
 */
export interface TorrentTag {
  /** Display text (e.g. "2160p", "HEVC", "🇬🇧 EN") */
  label: string;
  /**
   * Color variant for the badge:
   *   - quality/warning → amber tones (2160p, HDR)
   *   - info → blue/cyan (codec, source)
   *   - accent → purple (audio)
   *   - success → green (score)
   *   - default → neutral gray
   */
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info" | "accent";
  /** Optional MDI icon class (e.g. "mdi-shield-check") */
  icon?: string;
  /** Tooltip on hover */
  tooltip?: string;
}

// ── Torrent-search plugin ──────────────────────────────────────────────────

/**
 * A torrent-search plugin provides the search() function used by the
 * /api/torrent-search endpoint.  It has no sidebar entry and no mediaType.
 */
export interface TorrentSearchResult {
  name: string;
  magnet: string;
  infoHash: string;
  /** Size in bytes, null if unknown */
  size: number | null;
  seeders: number;
  leechers: number;
  /** ISO date string or null */
  uploadedAt: string | null;
  /** The plugin id that produced this result */
  source: string;
  /** Human-readable category */
  category: string | null;
  /** Poster / cover image URL (TMDB or similar) */
  cover?: string | null;
  /**
   * Optional decorative tags rendered below the torrent name.
   * @since 1.0.0 — added in plugin API v2
   */
  tags?: TorrentTag[];
  /**
   * Direct download URL for non-torrent items (e.g. archive.org files sent to pyLoad).
   * When set, the frontend will use this URL instead of the magnet for download.
   * @since 1.1.0
   */
  downloadUrl?: string;
}

export interface TorrentSearchPlugin {
  meta: ProviderMeta & { pluginType: "torrent-search" };
  search(
    query: string,
    limit: number,
    extraTrackers: string,
    /** Optional sub-source id (for plugins that expose multiple sources). */
    subSource?: string,
  ): Promise<TorrentSearchResult[]>;
}

// ── Plugin installation SPI (v2) ────────────────────────────────────────────
//
// A plugin is no longer just a data provider: it can also INSTALL its own
// middleware API routes and declare a settings section for the frontend.
// The core is fully generic — it knows nothing about a plugin's internals.

/** Generic persisted JSON key/value store, scoped to a single plugin. */
export interface PluginStorage {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  remove(key: string): void;
  /** All keys stored by this plugin. */
  list(): string[];
}

/** Services injected into a plugin's `install(ctx)`. */
export interface PluginContext {
  /** Persisted JSON storage scoped to this plugin. */
  storage: PluginStorage;
  /** Scoped logger (prefixed with the plugin id). */
  log(...args: unknown[]): void;
  /** Register a recurring task; returns a cancel function. */
  interval(fn: () => void | Promise<void>, ms: number): () => void;
  /** Build an HTTP error the dispatch layer understands. */
  httpError(statusCode: number, statusMessage: string): Error;
  /** Injected core capabilities (e.g. `cardigann`), keyed by capability name. */
  [capability: string]: unknown;
}

/** Normalized request context passed to plugin route handlers. */
export interface PluginRouteContext {
  /** Path parameters extracted from `:name` segments. */
  params: Record<string, string>;
  /** Query-string parameters. */
  query: Record<string, string>;
  /** Parsed JSON body (undefined for body-less requests). */
  body: unknown;
  /** Uppercase HTTP method. */
  method: string;
}

/** A plugin-installed API route handler. Returns JSON-serializable data. */
export type PluginApiRoute = (
  ctx: PluginRouteContext,
) => unknown | Promise<unknown>;

/** Route table: `"METHOD /path/:param"` → handler. */
export type PluginRoutes = Record<string, PluginApiRoute>;

/** Settings-section descriptor rendered generically by the frontend. */
export interface PluginSettingsDescriptor {
  type: string;
  [key: string]: unknown;
}

/** How a plugin enumerates its search sub-sources (e.g. indexerr's instances). */
export interface PluginSourcesDescriptor {
  /** Route returning the sub-sources list. */
  list: { method: string; path: string };
  /** Response key holding the array of sub-source entries. */
  itemsKey: string;
  /** Field in each entry that is the unique sub-source id. */
  idField: string;
  /** Field in each entry that is the display label. */
  labelField: string;
  /** Optional boolean field; entries where it is `false` are skipped. */
  enabledField?: string;
}

/** Optional plugin-extension surface added on top of the data methods. */
export interface PluginInstallable {
  install?(ctx: PluginContext): void | Promise<void>;
  routes?: PluginRoutes;
  settings?: PluginSettingsDescriptor;
  /** Search sub-sources (makes the plugin appear as N sources). */
  sources?: PluginSourcesDescriptor;
}

/** Union of all supported plugin shapes (+ installation SPI). */
export type AnyPlugin = (MediaProvider | TorrentSearchPlugin) &
  PluginInstallable;
