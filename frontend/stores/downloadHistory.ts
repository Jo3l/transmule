/**
 * Download history — shared singleton.
 *
 * Loads the history ONCE (first call to `loadDownloadHistory()`).
 * Call `reloadDownloadHistory()` after adding a new download to refresh.
 */
import { ref } from "vue";

const _titles = ref<string[]>([]);
const _urls = ref<string[]>([]);
const _hashes = ref<string[]>([]);
let _loaded = false;
let _fetchPromise: Promise<void> | null = null;

async function fetchFromServer() {
  const res: { titles: string[]; urls: string[]; hashes: string[] } = await $fetch(
    "/api/download-history",
  ) as any;
  _titles.value = res?.titles ?? [];
  _urls.value = res?.urls ?? [];
  _hashes.value = res?.hashes ?? [];
}

/** Load history on first call, safe to call many times. */
export function loadDownloadHistory() {
  if (_loaded) return;
  if (_fetchPromise) return;
  _fetchPromise = fetchFromServer().then(() => { _loaded = true; }).catch(() => {
    _loaded = false;
    _fetchPromise = null;
  });
}

/** Re-fetch after adding a download. */
export function reloadDownloadHistory() {
  _loaded = false;
  _fetchPromise = null;
  loadDownloadHistory();
  // Return promise so callers can await if needed
  return _fetchPromise;
}

export const titles = _titles;
export const urls = _urls;
export const hashes = _hashes;

function extractHash(url: string): string | null {
  // Magnet: urn:btih:HASH
  const m = url.match(/urn:btih:([A-Za-z0-9]+)/i);
  if (m) return m[1].toLowerCase();
  // ED2K: ed2k:XXXX... or ed2k://|file|...|HASH|/
  const ed2k = url.match(/ed2k[:\/]+([a-fA-F0-9]{32})/);
  if (ed2k) return ed2k[1].toLowerCase();
  return null;
}

/** Record a download optimistically (local state + server persist). */
export function recordDownload(url: string, title: string, service: string) {
  if (!_urls.value.includes(url)) {
    _urls.value = [url, ..._urls.value].slice(0, 500);
  }
  if (title && !_titles.value.includes(title)) {
    _titles.value = [title, ..._titles.value].slice(0, 500);
  }
  const h = extractHash(url);
  if (h && !_hashes.value.includes(h)) {
    _hashes.value = [h, ..._hashes.value].slice(0, 500);
  }
  // Persist to server in background
  $fetch("/api/download-history", {
    method: "POST",
    body: { url, title, service },
  }).catch(() => {});
}
