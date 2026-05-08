/**
 * Unified composable for search tabs (torrent + aMule).
 *
 * Manages tab lifecycle (create/close/switch), persistence across routes,
 * and search-specific execution (SSE for torrent, polling for aMule).
 */
import { enrichWithNameTags } from "../utils/torrent-name-parser";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CoverDetails {
  title?: string;
  year?: string;
  rating?: number;
  genres?: string[];
  runtime?: number;
  director?: string;
  cast?: string[];
  overview?: string;
}

export interface SearchResult {
  name: string;
  magnet: string;
  infoHash: string;
  size: number | null;
  size_fmt: string;
  seeders: number;
  leechers: number;
  source: string;
  category: string | null;
  cover?: string | null;
  movieDetails?: CoverDetails | null;
  rawTitle?: string;
  tags?: Array<{ label: string; variant?: string; icon?: string; tooltip?: string }>;
}

/** A unified result row that can come from either torrent or aMule. */
export interface UnifiedItem {
  id: string;
  type: "torrent" | "amule";
  name: string;
  size_fmt: string;
  seedsOrSources: number;
  leechers?: number;
  category?: string;
  source: string;
  cover?: string | null;
  tags?: Array<{ label: string; variant?: string; icon?: string; tooltip?: string }>;
  movieDetails?: CoverDetails | null;
  rawTitle?: string;
  infoHash?: string;
  magnet?: string;
  hash?: string;
}

interface BaseTab {
  id: string;
  service: 'transmission' | 'amule' | 'unified';
  searchHash: string;
  query: string;
  status: "idle" | "searching" | "complete" | "error";
  error?: string;
  createdAt: number;
}

export interface TorrentTab extends BaseTab {
  type: "torrent";
  source: string;
  results: SearchResult[];
  sourcesCompleted: string[];
  totalResults: number;
}

export interface AmuleTab extends BaseTab {
  type: "amule";
  searchType: string;
  avail: string;
  minSize: string;
  minSizeUnit: string;
  maxSize: string;
  maxSizeUnit: string;
  results: any[];
  progress: number;
}

export type SearchTab = TorrentTab | AmuleTab | UnifiedTab;

export interface UnifiedTab extends BaseTab {
  type: "unified";
  service: 'unified';
  results: UnifiedItem[];
  sourcesCompleted: string[];
  totalResults: number;
  amuleProgress: number;
}

/** Poll timers tracked at module level so public API functions can access them. */
const _pollTimers = new Map<string, ReturnType<typeof setInterval>>();

function stopPollTimer(tabId: string) {
  const timer = _pollTimers.get(tabId);
  if (timer) { clearInterval(timer); _pollTimers.delete(tabId); }
}

export function useSearchTabs() {
  const config = useRuntimeConfig();
  const { apiFetch } = useApi();

  // ── Shared state ──────────────────────────────────────────────────────

  const tabs = useState<SearchTab[]>("searchTabs", () => []);
  const activeTabId = useState<string | null>("searchActiveTab", () => null);

  const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value) ?? null);
  const tabCount = computed(() => tabs.value.length);

  // Per-tab timers (polling for aMule) — not serialized
  // Uses module-level _pollTimers map

  // ── Common actions ────────────────────────────────────────────────────

  function closeTab(id: string) {
    const tab = tabs.value.find((t) => t.id === id);
    if (!tab) return;

    if (tab.type === "amule" && tab.status === "searching") {
      stopPollTimer(id);
      apiFetch("/api/amule/search", { method: "POST", body: { action: "stop" } }).catch(() => {});
    }
    if (tab.type === "unified" && tab.status === "searching") {
      // Stop aMule polling
      stopPollTimer(id);
      apiFetch("/api/amule/search", { method: "POST", body: { action: "stop" } }).catch(() => {});
      // Abort SSE stream
      _unifiedAbort.get(id)?.abort();
      _unifiedAbort.delete(id);
    }

    tabs.value = tabs.value.filter((t) => t.id !== id);
    if (activeTabId.value === id) {
      activeTabId.value = tabs.value.length > 0 ? tabs.value[tabs.value.length - 1].id : null;
    }
  }

  function switchTab(id: string) {
    activeTabId.value = id;
  }

  // ── Torrent search (SSE streaming) ───────────────────────────────────

  function createTorrentTab(query: string, source: string) {
    const hash = quickHash(`${query}|${source}|transmission`);
    // Reuse existing tab for same search
    const existing = tabs.value.find((t) => t.searchHash === hash);
    if (existing) { switchTab(existing.id); return existing.id; }

    const id = genId();
    const tab: TorrentTab = {
      type: "torrent", id, service: 'transmission', searchHash: hash, query, source,
      status: "searching",
      results: [],
      sourcesCompleted: [],
      totalResults: 0,
      createdAt: Date.now(),
    };
    pushTab(tab);
    startTorrentStream(tab);
    return id;
  }

  function startTorrentStream(tab: TorrentTab) {
    const params = new URLSearchParams({ q: tab.query, source: tab.source, limit: "100" });
    const base = config.public?.apiBase ?? "";
    fetch(`${base}/api/torrent-search/stream?${params}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.body) { updateTab(tab.id, { status: "error", error: "No response body" }); return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          // Keep the last part in the buffer — it may be an incomplete event
          // that straddles two TCP chunks.  Resetting buf = "" would discard it.
          buf = parts.pop() ?? "";
          // Process every complete event
          for (const ev of parts) {
            const lines = ev.split("\n");
            let type = "", data = "";
            for (const l of lines) {
              if (l.startsWith("event: ")) type = l.slice(7);
              else if (l.startsWith("data: ")) data = l.slice(6);
            }
            if (!type || !data) continue;
            try {
              const d = JSON.parse(data);
              if (type === "result") {
                appendTorrentResults(tab.id, (d.results ?? []).map((r: any) => ({
                  ...r,
                  size_fmt: fmtBytes(r.size),
                  category: r.category ?? "-",
                })));
              } else if (type === "complete") {
                updateTab(tab.id, { status: "complete", totalResults: d.total ?? 0 });
              }
            } catch { /* skip */ }
          }
        }
      })
      .catch((err) => updateTab(tab.id, { status: "error", error: err?.message ?? "Stream failed" }));
  }

  function appendTorrentResults(tabId: string, incoming: SearchResult[]) {
    tabs.value = tabs.value.map((t) => {
      if (t.id !== tabId || t.type !== "torrent") return t;
      const seen = new Set(t.results.map((r) => r.infoHash.toLowerCase()));
      const fresh = incoming.filter((r) => !seen.has(r.infoHash.toLowerCase()));
      return { ...t, results: [...t.results, ...fresh].sort((a, b) => b.seeders - a.seeders) };
    });
  }

  // ── aMule search (polling) ────────────────────────────────────────────

  function createAmuleTab(params: {
    query: string; searchType: string; avail: string;
    minSize: string; minSizeUnit: string; maxSize: string; maxSizeUnit: string;
  }) {
    const hash = quickHash(`${params.query}|${params.searchType}|${params.avail}|${params.minSize}|${params.maxSize}|amule`);
    // Reuse existing tab for same search
    const existing = tabs.value.find((t) => t.searchHash === hash);
    if (existing) { switchTab(existing.id); return existing.id; }

    // aMule only supports one search at a time — stop any other searching tabs
    for (const t of tabs.value) {
      if (t.type === "amule" && t.status === "searching") {
        stopPollTimer(t.id);
        updateTab(t.id, { status: "complete" } as any);
      }
    }

    const id = genId();
    const tab: AmuleTab = {
      type: "amule", id, service: 'amule', searchHash: hash, ...params,
      status: "searching",
      results: [],
      progress: 0,
      createdAt: Date.now(),
    };
    pushTab(tab);
    startAmuleSearch(tab);
    return id;
  }

  async function startAmuleSearch(tab: AmuleTab) {
    try {
      const body: Record<string, any> = { action: "search", query: tab.query, type: tab.searchType };
      if (tab.avail) body.avail = Number(tab.avail);
      const min = toBytes(tab.minSize, tab.minSizeUnit);
      if (min) body.min_size = min;
      const max = toBytes(tab.maxSize, tab.maxSizeUnit);
      if (max) body.max_size = max;
      await apiFetch("/api/amule/search", { method: "POST", body });
      startPolling(tab.id);
    } catch {
      updateTab(tab.id, { status: "error", error: "Failed to start search" });
    }
  }

  function startPolling(tabId: string) {
    stopPollTimer(tabId);
    setTimeout(() => pollAmule(tabId), 1500);
    _pollTimers.set(tabId, setInterval(() => pollAmule(tabId), 3000));
  }

  async function pollAmule(tabId: string) {
    const tab = tabs.value.find((t) => t.id === tabId && t.type === "amule") as AmuleTab | undefined;
    if (!tab || tab.status === "complete" || tab.status === "error") { stopPollTimer(tabId); return; }
    try {
      const res = await apiFetch<any>("/api/amule/search");
      const incoming = res?.results?.files || [];
      tabs.value = tabs.value.map((t) => {
        if (t.id !== tabId || t.type !== "amule") return t;
        const seen = new Map(t.results.map((r: any) => [r.hash, r]));
        for (const f of incoming) {
          const enr = enrichWithNameTags(f);
          const ex = seen.get(f.hash);
          ex ? Object.assign(ex, enr) : t.results.push(enr);
        }
        const progress = res?.progress ?? t.progress;
        const status = progress >= 1 ? "complete" : "searching";
        if (status === "complete") stopPollTimer(tabId);
        return { ...t, results: [...t.results], progress, status } as AmuleTab;
      });
    } catch { /* silent */ }
  }

  /** Download a file from aMule search results. */
  async function downloadAmuleHash(hash: string) {
    await apiFetch("/api/amule/search", {
      method: "POST", body: { action: "download", hashes: [hash] },
    });
  }

  // ── Unified search (torrent SSE + aMule polling) ─────────

  const _unifiedAbort = new Map<string, AbortController>();

  function createUnifiedTab(query: string) {
    const hash = quickHash(`${query}|unified`);
    const existing = tabs.value.find((t) => t.searchHash === hash);
    if (existing) { switchTab(existing.id); return existing.id; }

    const id = genId();
    const tab: UnifiedTab = {
      type: "unified", id, service: 'unified', searchHash: hash, query,
      status: "searching",
      results: [],
      sourcesCompleted: [],
      totalResults: 0,
      amuleProgress: 0,
      createdAt: Date.now(),
    };
    pushTab(tab);
    startUnifiedStream(tab);
    return id;
  }

  function startUnifiedStream(tab: UnifiedTab) {
    // 1. Torrent SSE
    const controller = new AbortController();
    _unifiedAbort.set(tab.id, controller);
    const params = new URLSearchParams({ q: tab.query, source: "all", limit: "100" });
    const base = config.public?.apiBase ?? "";
    fetch(`${base}/api/torrent-search/stream?${params}`, {
      credentials: "include", signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.body) { maybeCompleteUnified(tab.id); return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const ev of parts) {
            const lines = ev.split("\n");
            let type = "", data = "";
            for (const l of lines) {
              if (l.startsWith("event: ")) type = l.slice(7);
              else if (l.startsWith("data: ")) data = l.slice(6);
            }
            if (!type || !data) continue;
            try {
              const d = JSON.parse(data);
              if (type === "result") {
                appendUnifiedTorrentResults(tab.id, d.results ?? []);
              } else if (type === "complete") {
                updateTab(tab.id, { totalResults: d.total ?? 0 } as any);
              }
            } catch { /* skip */ }
          }
        }
      })
      .catch(() => { /* aborted or error */ })
      .finally(() => { _unifiedAbort.delete(tab.id); maybeCompleteUnified(tab.id); });

    // 2. aMule search + polling
    apiFetch("/api/amule/search", {
      method: "POST", body: { action: "search", query: tab.query, type: "Global" },
    }).then(() => {
      startUnifiedPolling(tab.id);
    }).catch(() => { /* silent */ });
  }

  function startUnifiedPolling(tabId: string) {
    stopPollTimer(tabId);
    setTimeout(() => pollUnifiedAmule(tabId), 1500);
    _pollTimers.set(tabId, setInterval(() => pollUnifiedAmule(tabId), 3000));
  }

  async function pollUnifiedAmule(tabId: string) {
    const tab = tabs.value.find((t) => t.id === tabId && t.type === "unified") as UnifiedTab | undefined;
    if (!tab || tab.status === "complete" || tab.status === "error") { stopPollTimer(tabId); return; }
    try {
      const res = await apiFetch<any>("/api/amule/search");
      const incoming: any[] = res?.results?.files || [];
      tabs.value = tabs.value.map((t) => {
        if (t.id !== tabId || t.type !== "unified") return t;
        const seen = new Map(t.results.map((r) => [r.id, r]));
        for (const f of incoming) {
          const itemId = f.hash;
          if (seen.has(itemId)) continue;
          t.results.push({
            id: itemId,
            type: "amule" as const,
            name: f.name ?? "desconocido",
            size_fmt: f.size_fmt ?? fmtBytes(f.sizeFull),
            seedsOrSources: f.sources ?? 0,
            source: "aMule",
            hash: f.hash,
          });
        }
        const progress = res?.progress ?? t.amuleProgress;
        const partial = { results: [...t.results], amuleProgress: progress } as Partial<UnifiedTab>;
        if (progress >= 1 || incoming.length === 0 && res?.results?.count === 0) {
          partial.amuleProgress = 1;
          stopPollTimer(tabId);
        }
        // Re-sort by seedsOrSources desc
        partial.results!.sort((a, b) => b.seedsOrSources - a.seedsOrSources);
        return { ...t, ...partial } as UnifiedTab;
      });
      maybeCompleteUnified(tabId);
    } catch { /* silent */ }
  }

  function appendUnifiedTorrentResults(tabId: string, incoming: any[]) {
    tabs.value = tabs.value.map((t) => {
      if (t.id !== tabId || t.type !== "unified") return t;
      const seen = new Set(t.results.map((r) => r.id));
      let changed = false;
      for (const r of incoming) {
        const itemId = `torrent_${r.infoHash}`;
        if (seen.has(itemId)) continue;
        seen.add(itemId);
        t.results.push({
          id: itemId,
          type: "torrent" as const,
          name: r.name,
          size_fmt: r.size_fmt ?? fmtBytes(r.size),
          seedsOrSources: r.seeders ?? 0,
          leechers: r.leechers ?? 0,
          category: r.category ?? null,
          source: r.source ?? "desconocido",
          cover: r.cover ?? null,
          tags: r.tags,
          movieDetails: r.movieDetails ?? null,
          rawTitle: r.rawTitle,
          infoHash: r.infoHash,
          magnet: r.magnet,
        });
        changed = true;
      }
      if (!changed) return t;
      t.results.sort((a, b) => b.seedsOrSources - a.seedsOrSources);
      return { ...t, totalResults: t.results.length, results: [...t.results] } as UnifiedTab;
    });
  }

  function maybeCompleteUnified(tabId: string) {
    const tab = tabs.value.find((t) => t.id === tabId) as UnifiedTab | undefined;
    if (!tab || tab.status !== "searching") return;
    const torrentDone = !_unifiedAbort.has(tabId);
    const amuleDone = tab.amuleProgress >= 1;
    if (torrentDone && amuleDone) {
      updateTab(tabId, { status: "complete" } as any);
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────

  function pushTab(tab: SearchTab) {
    if (tabs.value.length >= 10) tabs.value = tabs.value.slice(-9);
    tabs.value = [...tabs.value, tab];
    activeTabId.value = tab.id;
  }

  function updateTab(id: string, partial: Partial<SearchTab>) {
    tabs.value = tabs.value.map((t) => (t.id === id ? { ...t, ...partial } : t));
  }

  let _c = 0;
  function genId(): string { _c++; return `s_${Date.now()}_${_c}`; }

  function toBytes(val: string, unit: string): number | undefined {
    const n = Number(val); return n ? n * Number(unit) : undefined;
  }

  // Register cover callback (inside composable = safe useState context)
  _coverApiBase = config.public?.apiBase ?? "";
  setCoverCallback((tabId, itemId, entry) => {
    tabs.value = tabs.value.map((t) => {
      if (t.id !== tabId) return t;
      return {
        ...t,
        results: t.results.map((r: any) => {
          const rId = (r.infoHash ?? r.hash ?? "").toLowerCase();
          if (rId !== itemId.toLowerCase()) return r;
          // Always patch movieDetails — even if cover already exists
          // (e.g. native cover from TorrentClaw with no TMDB metadata yet)
          return {
            ...r,
            cover: r.cover || entry.poster,
            movieDetails: r.movieDetails || (entry.details ?? null),
          };
        }),
      } as SearchTab;
    });
  });

  return {
    tabs, activeTabId, activeTab, tabCount,
    createTorrentTab, createAmuleTab, createUnifiedTab,
    closeTab, switchTab, downloadAmuleHash,
  };
}

function fmtBytes(bytes: number | null): string {
  if (bytes == null) return "-";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ── Lazy cover loader ──────────────────────────────────────────────────────
// Processes cover requests one at a time — avoids hammering the API with
// concurrent requests when many results arrive at once.

interface CoverCacheEntry {
  poster: string;
  details?: CoverDetails;
}

const _coverCache = new Map<string, CoverCacheEntry>();
const _coverPending = new Set<string>();

let _onCoverFound: ((tabId: string, itemId: string, entry: CoverCacheEntry) => void) | null = null;

function setCoverCallback(cb: (tabId: string, itemId: string, entry: CoverCacheEntry) => void) {
  _onCoverFound = cb;
}

/** Public API: triggers a cover fetch for a result when user hovers the name. */
export function triggerCoverLoad(tabId: string, hash: string, name: string, rawTitle?: string) {
  lazyLoadCover(tabId, hash, name, rawTitle);
}

/** Public API: look up cached cover details by cleaned title. */
export function getCachedCoverDetails(cleanedTitle: string): CoverDetails | undefined {
  return _coverCache.get(cleanedTitle)?.details;
}

/** Public API: check if a cleaned title has a cached cover. */
export function hasCachedCover(cleanedTitle: string): boolean {
  return _coverCache.has(cleanedTitle);
}

/** Public API: stop an aMule search and mark the tab complete. */
export function stopAmuleSearch(tabId: string) {
  stopPollTimer(tabId);
  const tabs = useState<SearchTab[]>("searchTabs");
  tabs.value = tabs.value.map((t) =>
    t.id === tabId ? { ...t, status: "complete" } : t,
  ) as SearchTab[];
}

/** Serial queue for cover requests — one fetch at a time. */
const _coverQueue: Array<{ tabId: string; itemId: string; title: string }> = [];
let _coverBusy = false;
/** Base URL captured at setup time (safe useRuntimeConfig context). */
let _coverApiBase = "";

function enqueueCover(tabId: string, itemId: string, title: string) {
  _coverQueue.push({ tabId, itemId, title });
  if (!_coverBusy) processNextCover();
}

async function processNextCover() {
  if (_coverQueue.length === 0) {
    _coverBusy = false;
    return;
  }
  _coverBusy = true;
  const { tabId, itemId, title } = _coverQueue.shift()!;

  if (!_coverPending.has(title)) {
    _coverPending.add(title);
    try {
      const res = await fetch(`${_coverApiBase}/api/cover?title=${encodeURIComponent(title)}`, {
        credentials: "include",
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.poster) {
          const entry: CoverCacheEntry = {
            poster: data.poster,
            details: data.match
              ? {
                  title: data.match.title,
                  year: data.match.year,
                  rating: data.match.rating,
                  genres: data.match.genres,
                  runtime: data.match.runtime,
                  director: data.match.director,
                  cast: data.match.cast,
                  overview: data.match.overview,
                }
              : undefined,
          };
          _coverCache.set(title, entry);
          _onCoverFound?.(tabId, itemId, entry);
        }
      }
    } catch {
      // silent
    } finally {
      _coverPending.delete(title);
    }
  }

  // Schedule next
  setTimeout(processNextCover, 2000);
}

function lazyLoadCover(tabId: string, hash: string, itemName: string, rawTitle?: string) {
  // Only fetch covers for video files
  if (!isVideoExt(itemName)) return;

  // Use rawTitle from the provider (e.g. TorrentClaw) when available,
  // otherwise parse the filename to extract a clean search title.
  const title = rawTitle?.trim() || cleanTitle(itemName.replace(/\.[^.]+$/, ''));
  if (!title) return;

  if (_coverCache.has(title)) {
    _onCoverFound?.(tabId, hash, _coverCache.get(title)!);
    return;
  }
  if (_coverPending.has(title)) return;

  enqueueCover(tabId, hash, title);
}

/** Extract a clean movie/show title from a torrent file name. */
function cleanTitle(raw: string): string {
  // Remove common patterns: year, quality, codec, group, etc.
  let t = raw
    .replace(/[._]/g, " ")
    .replace(/-/g, " ")                              // hyphens → spaces
    .replace(/,/g, " ")
    .replace(/\[\s*\]/g, "")
    .replace(/\b(19|20)\d{2}\b/g, "")                // year
    .replace(/\b(2160p|4K|1080p|720p|480p)\b/gi, "") // quality
    .replace(/\b(BLURAY|WEB[-.]DL|HDRip|BRRip|DVDRip|BDRip|HDTV|CAM|TS|TC|WEBRip|HDTVRip)\b/gi, "")
    .replace(/\b(x265|x264|HEVC|AV1|DivX|XviD|AVC|h\.?264|h\.?265)\b/gi, "")
    .replace(/\b(TrueHD|DTS|AC3|EAC3|AAC|FLAC|MP3|OPUS|DDP5\.?1|DD5\.?1|Atmos)\b/gi, "")
    .replace(/\b(PROPER|REPACK|REMASTERED|EXTENDED|DIRECTORS?\s*CUT|UNCUT|UNRATED|IMAX|THEATRICAL)\b/gi, "")
    .replace(/\b(castellano|latino|espa[nñ]ol|spanish|subtitulado|subs?|dual|vose|multi|audio)\b/gi, "")
    .replace(/\b[Ss]\d{2}[Ee]\d{2}\b/g, "")          // S01E05
    .replace(/\b\d{3,4}p?\b/g, "")                    // stray resolution
    .replace(/\s+/g, " ")
    .trim();

  // Remove leading episode numbers (01, 02, etc.)
  t = t.replace(/^\d{1,3}\s+/, "").trim();

  // Remove trailing group name after dash/hyphen
  t = t.replace(/\s*[-–—].*$/, "").trim();
  // Remove parenthesized suffixes
  t = t.replace(/\s*\([^)]*\)\s*$/, "").trim();

  return t || raw;
}

/** Common video file extensions — covers are only fetched for these. */
const VIDEO_EXTS = new Set([
  ".avi", ".mkv", ".mp4", ".m4v", ".mov", ".mpg", ".mpeg",
  ".wmv", ".flv", ".webm", ".ts", ".m2ts", ".iso", ".vob",
  ".divx", ".xvid", ".3gp", ".ogm", ".rm", ".rmvb",
]);

export function isVideoExt(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return true;
  const ext = name.slice(dot).toLowerCase();
  return VIDEO_EXTS.has(ext);
}

// ── File-type icon detection ──────────────────────────────────────

const _FILE_ICONS: Record<string, string> = {
  video: "mdi-file-video",
  audio: "mdi-file-music",
  image: "mdi-file-image",
  archive: "mdi-zip-box",
  pdf: "mdi-file-pdf-box",
  subtitle: "mdi-subtitles",
  text: "mdi-file-document-outline",
  app: "mdi-application",
};

const _FILE_EXT_MAP: { exts: string[]; type: string }[] = [
  { exts: ["mkv","mp4","avi","mov","m4v","ts","m2ts","webm","flv","wmv","iso","divx","xvid","3gp","ogm","rm","rmvb"], type: "video" },
  { exts: ["mp3","flac","wav","aac","ogg","opus","m4a","wma"], type: "audio" },
  { exts: ["jpg","jpeg","png","gif","bmp","webp","svg"], type: "image" },
  { exts: ["zip","rar","7z","tar","gz","bz2","xz","zst"], type: "archive" },
  { exts: ["pdf","epub","mobi","cbr","cbz","djvu"], type: "pdf" },
  { exts: ["srt","sub","idx","ass","ssa","vtt"], type: "subtitle" },
  { exts: ["txt","nfo","md","log"], type: "text" },
  { exts: ["exe","msi","apk","dmg","AppImage","deb","rpm"], type: "app" },
];

export function detectFileIcon(name: string | undefined): string {
  if (!name) return "mdi-file";
  const dot = name.lastIndexOf(".");
  if (dot === -1) return "mdi-file";
  const ext = name.slice(dot + 1).toLowerCase();
  for (const ft of _FILE_EXT_MAP) {
    if (ft.exts.includes(ext)) return _FILE_ICONS[ft.type] ?? "mdi-file";
  }
  return "mdi-file";
}

/** Quick string hash for deduplicating identical searches. */
function quickHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
