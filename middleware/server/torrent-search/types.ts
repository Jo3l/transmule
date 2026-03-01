/**
 * Shared types for the torrent search module.
 *
 * This module lives in its own folder so it can be easily removed or replaced
 * when a better search method becomes available.
 */

export type TorrentSource = "tpb" | "nyaa" | "yts";

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
  source: TorrentSource;
  /** Human-readable category */
  category: string | null;
}
