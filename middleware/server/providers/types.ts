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

export type MediaType = "movies" | "shows";

export interface ProviderMeta {
  /** Machine-name slug (must match filename, e.g. "yts") */
  id: string;
  /** Human-readable name shown in the UI */
  name: string;
  /** MDI icon class (e.g. "mdi-filmstrip") */
  icon: string;
  /** What kind of content it supplies */
  mediaType: MediaType;
  /** Short description for the settings panel */
  description?: string;
}

export interface ProviderSearchParams {
  [key: string]: string | undefined;
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
