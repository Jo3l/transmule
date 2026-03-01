/**
 * TransmissionClient — Transmission RPC client.
 *
 * Uses the Transmission custom JSON-RPC protocol with automatic
 * CSRF session-id handling and HTTP Basic Auth.
 * Compatible with Transmission 3.x (rpc-version 16) and later.
 *
 * Reference: https://github.com/transmission/transmission/blob/main/docs/rpc-spec.md
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransmissionConfig {
  /** Full URL, e.g. "http://192.168.31.89:9091/transmission/rpc" */
  url: string;
  /** HTTP Basic Auth username (empty string → no auth) */
  username: string;
  /** HTTP Basic Auth password */
  password: string;
}

export interface TransmissionTorrent {
  id: number;
  name: string;
  hashString: string;
  status: number;
  statusLabel: string;
  totalSize: number;
  totalSize_fmt: string;
  sizeWhenDone: number;
  sizeWhenDone_fmt: string;
  leftUntilDone: number;
  percentDone: number;
  rateDownload: number;
  rateDownload_fmt: string;
  rateUpload: number;
  rateUpload_fmt: string;
  uploadRatio: number;
  eta: number;
  eta_fmt: string;
  addedDate: number;
  doneDate: number;
  error: number;
  errorString: string;
  peersConnected: number;
  peersGettingFromUs: number;
  peersSendingToUs: number;
  downloadDir: string;
  isFinished: boolean;
  isStalled: boolean;
  queuePosition: number;
  uploadedEver: number;
  uploadedEver_fmt: string;
  downloadedEver: number;
  downloadedEver_fmt: string;
  labels: string[];
  magnetLink: string;
  comment: string;
  creator: string;
  dateCreated: number;
  pieceCount: number;
  pieceSize: number;
  /** Available for detail views */
  files?: TransmissionFile[];
  fileStats?: TransmissionFileStat[];
  peers?: TransmissionPeer[];
  trackers?: TransmissionTracker[];
  trackerStats?: TransmissionTrackerStat[];
  pieces?: string;
  availability?: number[];
}

export interface TransmissionFile {
  name: string;
  length: number;
  bytesCompleted: number;
}

export interface TransmissionFileStat {
  bytesCompleted: number;
  wanted: boolean;
  priority: number;
}

export interface TransmissionPeer {
  address: string;
  clientName: string;
  port: number;
  progress: number;
  rateToClient: number;
  rateToPeer: number;
  flagStr: string;
  isEncrypted: boolean;
  isDownloadingFrom: boolean;
  isUploadingTo: boolean;
}

export interface TransmissionTracker {
  id: number;
  announce: string;
  scrape: string;
  sitename: string;
  tier: number;
}

export interface TransmissionTrackerStat {
  id: number;
  announce: string;
  sitename: string;
  seederCount: number;
  leecherCount: number;
  lastAnnounceSucceeded: boolean;
  lastAnnounceResult: string;
  lastAnnouncePeerCount: number;
}

export interface TransmissionSessionStats {
  activeTorrentCount: number;
  downloadSpeed: number;
  downloadSpeed_fmt: string;
  pausedTorrentCount: number;
  torrentCount: number;
  uploadSpeed: number;
  uploadSpeed_fmt: string;
  cumulativeStats: {
    uploadedBytes: number;
    downloadedBytes: number;
    filesAdded: number;
    secondsActive: number;
    sessionCount: number;
  };
  currentStats: {
    uploadedBytes: number;
    downloadedBytes: number;
    filesAdded: number;
    secondsActive: number;
    sessionCount: number;
  };
}

export interface TransmissionSession {
  version: string;
  downloadDir: string;
  peerPort: number;
  speedLimitDown: number;
  speedLimitDownEnabled: boolean;
  speedLimitUp: number;
  speedLimitUpEnabled: boolean;
  downloadQueueSize: number;
  downloadQueueEnabled: boolean;
  seedQueueSize: number;
  seedQueueEnabled: boolean;
  seedRatioLimit: number;
  seedRatioLimited: boolean;
  rpcVersionSemver: string;
}

export interface TransmissionUploadPeer {
  torrentId: number;
  torrentName: string;
  torrentHash: string;
  address: string;
  clientName: string;
  port: number;
  /** Remote peer's download progress of this torrent (0.0–1.0) */
  progress: number;
  /** Bytes/s we are uploading to this peer */
  rateToPeer: number;
  rateToPeer_fmt: string;
  flagStr: string;
  isEncrypted: boolean;
}

// ─── Status label mapping ─────────────────────────────────────────────────────

const STATUS_MAP: Record<number, string> = {
  0: "Stopped",
  1: "Queued (verify)",
  2: "Verifying",
  3: "Queued (download)",
  4: "Downloading",
  5: "Queued (seed)",
  6: "Seeding",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function fmtSpeed(bps: number | undefined): string {
  if (!bps || bps === 0) return "0 B/s";
  return fmtBytes(bps) + "/s";
}

function fmtEta(seconds: number): string {
  if (seconds < 0) return "∞";
  if (seconds === 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Fields we always request for list views ──────────────────────────────────

const LIST_FIELDS = [
  "id",
  "name",
  "hashString",
  "status",
  "totalSize",
  "sizeWhenDone",
  "leftUntilDone",
  "percentDone",
  "rateDownload",
  "rateUpload",
  "uploadRatio",
  "eta",
  "addedDate",
  "doneDate",
  "error",
  "errorString",
  "peersConnected",
  "peersGettingFromUs",
  "peersSendingToUs",
  "downloadDir",
  "isFinished",
  "isStalled",
  "queuePosition",
  "uploadedEver",
  "downloadedEver",
  "labels",
  "magnetLink",
  "comment",
  "creator",
  "dateCreated",
  "pieceCount",
  "pieceSize",
];

const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  "files",
  "fileStats",
  "peers",
  "trackers",
  "trackerStats",
  "pieces",
  "availability",
];

// ─── Client class ─────────────────────────────────────────────────────────────

export class TransmissionRPCClient {
  private config: TransmissionConfig;
  private sessionId: string = "";
  private rpcId: number = 0;
  private _lastError: string = "";

  constructor(config: TransmissionConfig) {
    this.config = config;
  }

  get lastError(): string {
    return this._lastError;
  }

  // ── Low-level RPC call ──────────────────────────────────────────────────

  private async rpc(method: string, args?: Record<string, any>): Promise<any> {
    const payload: Record<string, any> = { method };
    if (args && Object.keys(args).length > 0) payload.arguments = args;
    payload.tag = ++this.rpcId;
    const body = JSON.stringify(payload);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.sessionId) {
      headers["X-Transmission-Session-Id"] = this.sessionId;
    }

    if (this.config.username) {
      const creds = Buffer.from(
        `${this.config.username}:${this.config.password}`,
      ).toString("base64");
      headers["Authorization"] = `Basic ${creds}`;
    }

    const doFetch = async (retry: boolean): Promise<any> => {
      const res = await fetch(this.config.url, {
        method: "POST",
        headers,
        body,
      });

      // Handle CSRF 409 — grab session ID and retry once
      if (res.status === 409 && retry) {
        const newId = res.headers.get("x-transmission-session-id");
        if (newId) {
          this.sessionId = newId;
          headers["X-Transmission-Session-Id"] = newId;
        }
        return doFetch(false);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Transmission HTTP ${res.status}: ${text.slice(0, 200)}`,
        );
      }

      return res.json();
    };

    const json = await doFetch(true);

    // Transmission returns { result: "success" | "error string", arguments: {...} }
    if (json.result && json.result !== "success") {
      this._lastError = json.result;
      throw new Error(`Transmission RPC error: ${json.result}`);
    }

    this._lastError = "";
    return json.arguments ?? {};
  }

  // ── Torrent list ────────────────────────────────────────────────────────

  async getTorrents(
    ids?: number[] | "recently_active",
  ): Promise<TransmissionTorrent[]> {
    const params: any = { fields: LIST_FIELDS };
    if (ids) params.ids = ids;

    const result = await this.rpc("torrent-get", params);
    return (result.torrents || []).map(mapTorrent);
  }

  // ── Single torrent detail ───────────────────────────────────────────────

  async getTorrentDetail(
    id: number | string,
  ): Promise<TransmissionTorrent | null> {
    const ids = typeof id === "number" ? [id] : [id];
    const result = await this.rpc("torrent-get", {
      fields: DETAIL_FIELDS,
      ids,
    });
    const torrents = result.torrents || [];
    return torrents.length > 0 ? mapTorrentDetail(torrents[0]) : null;
  }

  // ── Add torrent ─────────────────────────────────────────────────────────

  async addTorrent(opts: {
    /** magnet link, URL, or local file path */
    filename?: string;
    /** base64-encoded .torrent file content */
    metainfo?: string;
    downloadDir?: string;
    paused?: boolean;
    labels?: string[];
  }): Promise<{ id: number; name: string; hashString: string } | null> {
    const params: any = {};
    if (opts.filename) params.filename = opts.filename;
    if (opts.metainfo) params.metainfo = opts.metainfo;
    if (opts.downloadDir) params["download-dir"] = opts.downloadDir;
    if (opts.paused !== undefined) params.paused = opts.paused;
    if (opts.labels) params.labels = opts.labels;

    const result = await this.rpc("torrent-add", params);
    const added = result["torrent-added"] || result["torrent-duplicate"];
    if (!added) return null;
    return {
      id: added.id,
      name: added.name,
      hashString: added.hashString,
    };
  }

  // ── Torrent actions ─────────────────────────────────────────────────────

  async startTorrents(ids: (number | string)[]): Promise<void> {
    await this.rpc("torrent-start", { ids });
  }

  async stopTorrents(ids: (number | string)[]): Promise<void> {
    await this.rpc("torrent-stop", { ids });
  }

  async removeTorrents(
    ids: (number | string)[],
    deleteData = false,
  ): Promise<void> {
    await this.rpc("torrent-remove", { ids, "delete-local-data": deleteData });
  }

  async verifyTorrents(ids: (number | string)[]): Promise<void> {
    await this.rpc("torrent-verify", { ids });
  }

  async reannounceTorrents(ids: (number | string)[]): Promise<void> {
    await this.rpc("torrent-reannounce", { ids });
  }

  // ── Torrent mutator ─────────────────────────────────────────────────────

  async setTorrent(
    ids: (number | string)[],
    settings: Record<string, any>,
  ): Promise<void> {
    await this.rpc("torrent-set", { ids, ...settings });
  }

  // ── Session info ────────────────────────────────────────────────────────

  async getSession(): Promise<TransmissionSession> {
    // Don't pass fields — let Transmission return everything
    // (avoids kebab-case vs camelCase field name issues across versions)
    const r = await this.rpc("session-get");
    return {
      version: r.version || "",
      downloadDir: r["download-dir"] || "",
      peerPort: r["peer-port"] || 0,
      speedLimitDown: r["speed-limit-down"] || 0,
      speedLimitDownEnabled: r["speed-limit-down-enabled"] || false,
      speedLimitUp: r["speed-limit-up"] || 0,
      speedLimitUpEnabled: r["speed-limit-up-enabled"] || false,
      downloadQueueSize: r["download-queue-size"] || 0,
      downloadQueueEnabled: r["download-queue-enabled"] || false,
      seedQueueSize: r["seed-queue-size"] || 0,
      seedQueueEnabled: r["seed-queue-enabled"] || false,
      seedRatioLimit: r.seedRatioLimit || r["seed-ratio-limit"] || 0,
      seedRatioLimited: r.seedRatioLimited ?? r["seed-ratio-limited"] ?? false,
      rpcVersionSemver: r["rpc-version-semver"] || `${r["rpc-version"] || "?"}`,
    };
  }

  // ── Session stats ───────────────────────────────────────────────────────

  async getSessionStats(): Promise<TransmissionSessionStats> {
    const r = await this.rpc("session-stats");
    return {
      activeTorrentCount: r.activeTorrentCount || 0,
      downloadSpeed: r.downloadSpeed || 0,
      downloadSpeed_fmt: fmtSpeed(r.downloadSpeed),
      pausedTorrentCount: r.pausedTorrentCount || 0,
      torrentCount: r.torrentCount || 0,
      uploadSpeed: r.uploadSpeed || 0,
      uploadSpeed_fmt: fmtSpeed(r.uploadSpeed),
      cumulativeStats: mapStats(r["cumulative-stats"]),
      currentStats: mapStats(r["current-stats"]),
    };
  }

  // ── Free space ──────────────────────────────────────────────────────────

  async getFreeSpace(
    path: string,
  ): Promise<{ path: string; sizeBytes: number; totalSize: number }> {
    const r = await this.rpc("free-space", { path });
    return {
      path: r.path,
      sizeBytes: r["size-bytes"] || 0,
      totalSize: r["total-size"] || 0,
    };
  }

  // ── Session set ─────────────────────────────────────────────────────────

  /**
   * Update Transmission session settings.
   * Keys must use the raw Transmission kebab-case names, e.g.:
   *   "speed-limit-down", "download-dir", "peer-port", etc.
   */
  async setSession(settings: Record<string, unknown>): Promise<void> {
    await this.rpc("session-set", settings);
  }

  // ── Session get (raw) ──────────────────────────────────────────────────

  /**
   * Return the raw session-get result without any mapping.
   * Useful for settings pages that need every available field.
   */
  async getSessionRaw(): Promise<Record<string, any>> {
    return await this.rpc("session-get");
  }

  // ── Blocklist update ───────────────────────────────────────────────────

  async updateBlocklist(): Promise<number> {
    const r = await this.rpc("blocklist-update");
    return r["blocklist-size"] || 0;
  }

  // ── Port test ──────────────────────────────────────────────────────────

  async testPort(): Promise<boolean> {
    const r = await this.rpc("port-test");
    return r["port-is-open"] ?? false;
  }

  // ── Upload peers (peers downloading from us) ──────────────────────────

  /**
   * Return peers that are downloading from us across all torrents.
   * Uses a single RPC call with minimal fields for efficiency.
   */
  async getUploadPeers(): Promise<TransmissionUploadPeer[]> {
    const result = await this.rpc("torrent-get", {
      fields: [
        "id",
        "name",
        "hashString",
        "peers",
        "peersGettingFromUs",
        "rateUpload",
      ],
    });

    const peers: TransmissionUploadPeer[] = [];
    for (const t of result.torrents || []) {
      if (!t.peers || t.peers.length === 0) continue;
      for (const p of t.peers) {
        if (p.isUploadingTo || p.rateToPeer > 0) {
          peers.push({
            torrentId: t.id,
            torrentName: t.name || "",
            torrentHash: t.hashString || "",
            address: p.address || "",
            clientName: p.clientName || "",
            port: p.port || 0,
            progress: p.progress || 0,
            rateToPeer: p.rateToPeer || 0,
            rateToPeer_fmt: fmtSpeed(p.rateToPeer),
            flagStr: p.flagStr || "",
            isEncrypted: p.isEncrypted || false,
          });
        }
      }
    }
    return peers;
  }
}

// ─── Response mappers ─────────────────────────────────────────────────────────

function mapStats(s: any) {
  return {
    uploadedBytes: s?.uploadedBytes || 0,
    downloadedBytes: s?.downloadedBytes || 0,
    filesAdded: s?.filesAdded || 0,
    secondsActive: s?.secondsActive || 0,
    sessionCount: s?.sessionCount || 0,
  };
}

function mapTorrent(t: any): TransmissionTorrent {
  return {
    id: t.id,
    name: t.name || "",
    hashString: t.hashString || "",
    status: t.status ?? 0,
    statusLabel: STATUS_MAP[t.status] || "Unknown",
    totalSize: t.totalSize || 0,
    totalSize_fmt: fmtBytes(t.totalSize),
    sizeWhenDone: t.sizeWhenDone || 0,
    sizeWhenDone_fmt: fmtBytes(t.sizeWhenDone),
    leftUntilDone: t.leftUntilDone || 0,
    percentDone: t.percentDone || 0,
    rateDownload: t.rateDownload || 0,
    rateDownload_fmt: fmtSpeed(t.rateDownload),
    rateUpload: t.rateUpload || 0,
    rateUpload_fmt: fmtSpeed(t.rateUpload),
    uploadRatio: t.uploadRatio || 0,
    eta: t.eta ?? -1,
    eta_fmt: fmtEta(t.eta ?? -1),
    addedDate: t.addedDate || 0,
    doneDate: t.doneDate || 0,
    error: t.error || 0,
    errorString: t.errorString || "",
    peersConnected: t.peersConnected || 0,
    peersGettingFromUs: t.peersGettingFromUs || 0,
    peersSendingToUs: t.peersSendingToUs || 0,
    downloadDir: t.downloadDir || "",
    isFinished: t.isFinished || false,
    isStalled: t.isStalled || false,
    queuePosition: t.queuePosition || 0,
    uploadedEver: t.uploadedEver || 0,
    uploadedEver_fmt: fmtBytes(t.uploadedEver),
    downloadedEver: t.downloadedEver || 0,
    downloadedEver_fmt: fmtBytes(t.downloadedEver),
    labels: t.labels || [],
    magnetLink: t.magnetLink || "",
    comment: t.comment || "",
    creator: t.creator || "",
    dateCreated: t.dateCreated || 0,
    pieceCount: t.pieceCount || 0,
    pieceSize: t.pieceSize || 0,
  };
}

function mapTorrentDetail(t: any): TransmissionTorrent {
  const base = mapTorrent(t);
  return {
    ...base,
    files: (t.files || []).map((f: any) => ({
      name: f.name || "",
      length: f.length || 0,
      bytesCompleted: f.bytesCompleted || 0,
    })),
    fileStats: (t.fileStats || []).map((fs: any) => ({
      bytesCompleted: fs.bytesCompleted || 0,
      wanted: fs.wanted ?? true,
      priority: fs.priority ?? 0,
    })),
    peers: (t.peers || []).map((p: any) => ({
      address: p.address || "",
      clientName: p.clientName || "",
      port: p.port || 0,
      progress: p.progress || 0,
      rateToClient: p.rateToClient || 0,
      rateToPeer: p.rateToPeer || 0,
      flagStr: p.flagStr || "",
      isEncrypted: p.isEncrypted || false,
      isDownloadingFrom: p.isDownloadingFrom || false,
      isUploadingTo: p.isUploadingTo || false,
    })),
    trackers: (t.trackers || []).map((tr: any) => ({
      id: tr.id,
      announce: tr.announce || "",
      scrape: tr.scrape || "",
      sitename: tr.sitename || "",
      tier: tr.tier || 0,
    })),
    trackerStats: (t.trackerStats || []).map((ts: any) => ({
      id: ts.id,
      announce: ts.announce || "",
      sitename: ts.sitename || "",
      seederCount: ts.seederCount || 0,
      leecherCount: ts.leecherCount || 0,
      lastAnnounceSucceeded: ts.lastAnnounceSucceeded || false,
      lastAnnounceResult: ts.lastAnnounceResult || "",
      lastAnnouncePeerCount: ts.lastAnnouncePeerCount || 0,
    })),
    pieces: t.pieces || "",
    availability: t.availability || [],
  };
}

// ─── Singleton accessor ───────────────────────────────────────────────────────

let _client: TransmissionRPCClient | null = null;

export function useTransmissionClient(): TransmissionRPCClient {
  if (!_client) {
    const config = useRuntimeConfig();
    _client = new TransmissionRPCClient({
      url: String(
        config.transmissionUrl || "http://192.168.31.89:9091/transmission/rpc",
      ),
      username: String(config.transmissionUsername || ""),
      password: String(config.transmissionPassword || ""),
    });
  }
  return _client;
}

/** Force-reset the singleton (e.g. after admin changes connection settings). */
export function resetTransmissionClient(): void {
  _client = null;
}
