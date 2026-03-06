/**
 * Tracks which files have been sent to download.
 * Uses server-persisted history so the state survives page reloads.
 *
 * State is stored as a plain array (serializable) and converted to a
 * Set only for fast lookups — avoids SSR hydration issues with Set.
 */
export function useDownloadHistory() {
  const { apiFetch } = useApi();

  // Plain arrays: safe for Nuxt useState SSR serialization
  const _downloadedUrls = useState<string[]>("_downloadedUrls", () => []);
  const _downloadedHashes = useState<string[]>("_downloadedHashes", () => []);
  // Tracks whether the history has been fetched this session — avoids redundant calls
  const _loaded = useState<boolean>("_downloadHistoryLoaded", () => false);

  /** Extract the btih hash from a magnet URI (lower-cased), or null. */
  function extractMagnetHash(url: string): string | null {
    const m = url.match(/urn:btih:([A-Za-z0-9]+)/i);
    return m ? m[1].toLowerCase() : null;
  }

  /** Populate the arrays from the server. No-op if already fetched this session. */
  async function loadDownloadHistory() {
    if (_loaded.value) return;
    try {
      const res = await apiFetch<{ urls: string[] }>("/api/download-history");
      const urls = res?.urls ?? [];
      _downloadedUrls.value = urls;
      _downloadedHashes.value = urls.map(extractMagnetHash).filter((h): h is string => h !== null);
      _loaded.value = true;
    } catch {
      // silent – missing history shouldn't break the page
    }
  }

  /** True if the exact URL was ever sent to download. */
  function isDownloaded(url: string): boolean {
    return !!url && _downloadedUrls.value.includes(url);
  }

  /** True if a magnet/torrent with this info-hash was ever sent to download. */
  function isDownloadedByHash(hash: string): boolean {
    return !!hash && _downloadedHashes.value.includes(hash.toLowerCase());
  }

  /**
   * Record a download optimistically (updates local state immediately)
   * and persists it to the server in the background.
   */
  async function recordDownload(url: string, title: string, service: string) {
    // Optimistic update — prepend so newest is first, cap at 50 matching server limit
    if (!_downloadedUrls.value.includes(url)) {
      _downloadedUrls.value = [url, ..._downloadedUrls.value].slice(0, 50);
    }
    const h = extractMagnetHash(url);
    if (h && !_downloadedHashes.value.includes(h)) {
      _downloadedHashes.value = [h, ..._downloadedHashes.value].slice(0, 50);
    }

    try {
      await apiFetch("/api/download-history", {
        method: "POST",
        body: { url, title, service },
      });
    } catch {
      // Don't fail the download if history recording fails
    }
  }

  return {
    loadDownloadHistory,
    isDownloaded,
    isDownloadedByHash,
    recordDownload,
  };
}
