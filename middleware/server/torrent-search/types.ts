/**
 * Shared types for the torrent search module.
 *
 * TorrentSearchResult and TorrentSearchPlugin now live in providers/types.ts
 * so the loader can validate torrent-search plugins.
 */

// Keep TorrentSource as a plain string alias so existing code compiles
export type TorrentSource = string;

// Re-export from the canonical location
export type { TorrentSearchResult, TorrentSearchPlugin } from "../providers/types";
