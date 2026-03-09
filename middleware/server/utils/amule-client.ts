/**
 * AmuleClient — singleton EC protocol client for the aMule daemon.
 *
 * Connects directly to amuled via TCP port 4712 using the EC (External
 * Connector) binary protocol instead of the HTTP web interface.
 *
 * Benefits over the old HTTP approach:
 *  - Persistent TCP connection (no per-request overhead)
 *  - No dependency on amuleweb / PHP scripts
 *  - Eliminates single-threaded HTTP bottleneck (no more hanging)
 *  - Richer data: upload queue, friends, categories, etc.
 *  - ZLIB-compressed binary protocol (efficient)
 */

import {
  AmuleClient,
  type AmuleClientOptions,
  type StatsResponse,
  type SearchResultsResponse,
  type UpdateResponse,
  type AmuleTransferringFile,
  type AmuleFile,
  type AmuleServer,
  type AmuleUpDownClient,
  type AmuleFriend,
  type AmuleCategory,
  DownloadCommand,
  SearchType,
  ECDetailLevel,
  type SearchFilters,
  FileStatus,
  Packet,
  Flags,
  ECOpCode,
  ECTagName,
  EcPrefs,
  UByteTag,
  UIntTag,
  UShortTag,
  StringTag,
} from "amule-ec-client";

// ─── EC Preference request helpers ────────────────────────────────────────────

/**
 * Custom request class for EC_OP_GET_PREFERENCES (0x3F).
 * The amule-ec-client library doesn't wrap this opcode, so we build the
 * packet manually with the required EC_TAG_SELECT_PREFS bitmask.
 */
class GetPrefsRequest {
  opCode = 0x3f; // EC_OP_GET_PREFERENCES
  private sections: number;
  constructor(sections: number) {
    this.sections = sections;
  }
  buildPacket() {
    return new Packet(
      this.opCode,
      Flags.useUtf8Numbers(),
      [new UIntTag(0x1000, this.sections)], // EC_TAG_SELECT_PREFS
    );
  }
}

/**
 * Custom request class for EC_OP_SET_PREFERENCES (0x40).
 */
class SetPrefsRequest {
  opCode = 0x40; // EC_OP_SET_PREFERENCES
  private tags: any[];
  constructor(tags: any[]) {
    this.tags = tags;
  }
  buildPacket() {
    return new Packet(this.opCode, Flags.useUtf8Numbers(), this.tags);
  }
}

// ─── Preference data shapes ──────────────────────────────────────────────────

export interface AmulePrefsGeneral {
  userNick: string;
  checkNewVersion: boolean;
}

export interface AmulePrefsConnection {
  uploadCapacity: number; // KB/s
  downloadCapacity: number; // KB/s
  maxUploadSpeed: number; // KB/s  (0 = unlimited)
  maxDownloadSpeed: number; // KB/s  (0 = unlimited)
  slotAllocation: number;
  tcpPort: number;
  udpPort: number;
  maxFileSources: number;
  maxConnections: number;
  autoconnect: boolean;
  reconnect: boolean;
  networkED2K: boolean;
  networkKademlia: boolean;
}

export interface AmulePrefsServers {
  removeDead: boolean;
  deadRetries: number;
  useScoreSystem: boolean;
  smartIdCheck: boolean;
  updateUrl: string;
}

export interface AmulePrefsSecurity {
  canSeeShares: number; // 0=nobody, 1=friends, 2=everyone
  ipFilterClients: boolean;
  ipFilterServers: boolean;
  ipFilterAutoUpdate: boolean;
  ipFilterUpdateUrl: string;
  ipFilterLevel: number;
  filterLan: boolean;
  useSecIdent: boolean;
  obfuscationSupported: boolean;
  obfuscationRequested: boolean;
  obfuscationRequired: boolean;
}

export interface AmulePreferences {
  general: AmulePrefsGeneral;
  connection: AmulePrefsConnection;
  servers: AmulePrefsServers;
  security: AmulePrefsSecurity;
}

// ─── Tag parsing helpers ─────────────────────────────────────────────────────

/** Check if a tag value represents boolean "true" in EC protocol (empty Buffer = present = true) */
function isBoolTag(val: unknown): boolean {
  if (Buffer.isBuffer(val)) return true; // presence of tag = true
  return !!val;
}

/** Find a nested tag by its ECTagName code */
function findNested(tag: any, code: number): any | undefined {
  return tag.nestedTags?.find((t: any) => t.name === code);
}

/** Read a numeric nested tag value (default 0) */
function numNested(tag: any, code: number): number {
  const t = findNested(tag, code);
  if (!t) return 0;
  const v = t.value;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return 0;
}

/** Read a boolean nested tag value (present = true, absent = false) */
function boolNested(tag: any, code: number): boolean {
  return !!findNested(tag, code);
}

/** Read a string nested tag value (default "") */
function strNested(tag: any, code: number): string {
  const t = findNested(tag, code);
  return typeof t?.value === "string" ? t.value : "";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConnectionInfo {
  connected: boolean;
  error?: string;
  reconnecting: boolean;
}

// aMule chunk size: 9728000 bytes (9.28 MB)
const PARTSIZE = 9728000;

/** Per-chunk status values */
export const ChunkStatus = {
  /** No data, no sources for this chunk */
  UNAVAILABLE: 0,
  /** Incomplete but sources exist */
  AVAILABLE: 1,
  /** Fully downloaded */
  COMPLETE: 2,
  /** Currently being downloaded */
  DOWNLOADING: 3,
} as const;

export interface ChunkInfo {
  /** Array of chunk statuses (one per chunk) — see ChunkStatus */
  chunks: number[];
  /** Per-chunk source availability count (how many sources have each part) */
  availability: number[];
  /** Total number of chunks */
  partCount: number;
  /** Total file size in bytes */
  sizeFull: number;
}

// ─── Helper: Buffer hash → hex string ─────────────────────────────────────────

/**
 * RLE Decode — matches aMule's RLE_Data::Decode() in src/RLE.cpp
 *
 * Format: If two consecutive bytes are equal, it is a triple [val, val, count]
 * meaning `count` copies of `val`. Otherwise a single literal byte.
 */
function rleDecode(buf: Buffer): Buffer {
  const out: number[] = [];
  let i = 0;
  while (i < buf.length) {
    if (i < buf.length - 2 && buf[i + 1] === buf[i]) {
      // Sequence: val, val, count
      const val = buf[i];
      const count = buf[i + 2];
      for (let c = 0; c < count; c++) out.push(val);
      i += 3;
    } else {
      // Single literal byte
      out.push(buf[i]);
      i++;
    }
  }
  return Buffer.from(out);
}

/**
 * Decode PART_STATUS: RLE-encoded uint8 per part (uint16 clamped to 0xFF).
 * Returns per-part availability count array.
 *
 * @see aMule: RLE_Data::Encode(ArrayOfUInts16) in src/RLE.cpp
 *   — Clamps each uint16 to 0xFF, then byte-level RLE.
 * @see aMule: PartFileEncoderData::DecodeParts() in src/RLE.cpp
 */
function decodePartStatus(buf: Buffer): number[] {
  const decoded = rleDecode(buf);
  const result: number[] = new Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    result[i] = decoded[i]; // Each byte = availability count (0-255)
  }
  return result;
}

/**
 * Decode GAP_STATUS / REQ_STATUS: RLE-encoded byte-interleaved uint64 array.
 * Returns array of uint64-as-number values (gap pairs or request pairs).
 *
 * aMule interleaves bytes: for N uint64s, the buffer is N*8 bytes where
 * positions [0..N-1] are byte[0] of each u64, [N..2N-1] are byte[1], etc.
 * This helps RLE since higher bytes are often zero/similar.
 *
 * @see aMule: RLE_Data::Encode(ArrayOfUInts64) in src/RLE.cpp
 * @see aMule: RLE_Data::Decode(data, len, ArrayOfUInts64) in src/RLE.cpp
 */
function decodeUint64Array(buf: Buffer): number[] {
  const decoded = rleDecode(buf);
  if (decoded.length === 0 || decoded.length % 8 !== 0) return [];
  const size = decoded.length / 8; // Number of uint64 values
  const result: number[] = new Array(size);
  for (let i = 0; i < size; i++) {
    // De-interleave: reconstruct uint64 from spread-out bytes
    // Using Number since JS can handle up to 2^53 precisely
    let u = 0;
    for (let j = 7; j >= 0; j--) {
      u = u * 256 + decoded[i + j * size];
    }
    result[i] = u;
  }
  return result;
}

export function hashToHex(hash?: Buffer): string {
  if (!hash) return "";
  return Buffer.from(hash).toString("hex");
}

export function hexToHash(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

// ─── Helper: format bytes ─────────────────────────────────────────────────────

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatSpeed(bytesPerSec: number | undefined): string {
  if (!bytesPerSec || bytesPerSec === 0) return "0 B/s";
  return formatBytes(bytesPerSec) + "/s";
}

// ─── File status mapping ──────────────────────────────────────────────────────

export function fileStatusLabel(
  status?: FileStatus,
  stopped?: boolean,
): string {
  if (stopped) return "Paused";
  switch (status) {
    case FileStatus.READY:
      return "Downloading";
    case FileStatus.EMPTY:
      return "Waiting";
    case FileStatus.HASHING:
      return "Hashing";
    case FileStatus.ERROR:
      return "Error";
    case FileStatus.PAUSED:
      return "Paused";
    case FileStatus.COMPLETING:
      return "Completing";
    case FileStatus.COMPLETE:
      return "Complete";
    case FileStatus.ALLOCATING:
      return "Allocating";
    default:
      return "Unknown";
  }
}

// ─── Priority mapping ─────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<number, string> = {
  0: "Low",
  1: "Normal",
  2: "High",
  10: "Auto",
  11: "Auto (Low)",
  12: "Auto (Normal)",
  13: "Auto (High)",
};

export function priorityLabel(prio?: number): string {
  if (prio === undefined) return "Unknown";
  return PRIORITY_LABELS[prio] || `${prio}`;
}

// ─── Wrapper class ────────────────────────────────────────────────────────────

class AmuleECClient {
  private client: AmuleClient;
  private _connected = false;
  private _reconnecting = false;
  private _error: string | null = null;
  private _connectPromise: Promise<void> | null = null;

  constructor(private options: AmuleClientOptions) {
    this.client = new AmuleClient(options);
  }

  // ─── Connection management ────────────────────────────────────────────────

  get connected(): boolean {
    return this._connected;
  }

  get connectionInfo(): ConnectionInfo {
    return {
      connected: this._connected,
      error: this._error || undefined,
      reconnecting: this._reconnecting,
    };
  }

  /** Ensure the client is connected. Auto-connects on first call. */
  async ensureConnected(): Promise<void> {
    if (this._connected) return;
    if (this._connectPromise) return this._connectPromise;

    this._connectPromise = this._connect();
    try {
      await this._connectPromise;
    } finally {
      this._connectPromise = null;
    }
  }

  private async _connect(): Promise<void> {
    this._reconnecting = true;
    this._error = null;
    try {
      // Re-read config from DB in case admin changed it
      const dbHost = getConfig("amule_host");
      const dbPort = getConfig("amule_port");
      const dbPassword = getConfig("amule_password");

      if (dbHost || dbPort || dbPassword) {
        const opts: AmuleClientOptions = {
          host: dbHost || this.options.host,
          port: Number(dbPort) || this.options.port,
          password: dbPassword || this.options.password,
          timeout: this.options.timeout,
        };
        this.client = new AmuleClient(opts);
      }

      await this.client.reconnect();
      this._connected = true;
      this._reconnecting = false;
      console.log(
        `[EC] Connected to aMule at ${dbHost || this.options.host}:${dbPort || this.options.port}`,
      );
    } catch (err: any) {
      this._connected = false;
      this._reconnecting = false;
      this._error = err?.message || String(err);
      console.error(`[EC] Connection failed: ${this._error}`);
      throw err;
    }
  }

  /** Force a reconnect (e.g. after config change). */
  async reconnect(): Promise<void> {
    this._connected = false;
    return this.ensureConnected();
  }

  /** Execute an EC operation with auto-reconnect on failure. */
  private async exec<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureConnected();
    try {
      return await fn();
    } catch (err: any) {
      // If the connection dropped, try reconnecting once
      this._connected = false;
      this._error = err?.message || String(err);
      try {
        await this._connect();
        return await fn();
      } catch (retryErr: any) {
        this._error = retryErr?.message || String(retryErr);
        throw createError({
          statusCode: 502,
          statusMessage: `aMule EC error: ${this._error}`,
        });
      }
    }
  }

  // ─── Public API methods ───────────────────────────────────────────────────

  async getStats(): Promise<StatsResponse> {
    return this.exec(() => this.client.getStats());
  }

  async getDownloadQueue(): Promise<AmuleTransferringFile[]> {
    return this.exec(() => this.client.getDownloadQueue());
  }

  async getSharedFiles(): Promise<AmuleFile[]> {
    return this.exec(() => this.client.getSharedFiles());
  }

  async reloadSharedFiles(): Promise<void> {
    return this.exec(() => this.client.reloadSharedFiles());
  }

  async getServerList(): Promise<AmuleServer[]> {
    return this.exec(() => this.client.getServerList());
  }

  /**
   * Trigger aMule to download and import a server.met list from a URL.
   * Uses EC_OP_SERVER_UPDATE_FROM_URL with EC_TAG_SERVERS_UPDATE_URL.
   */
  async updateServerListFromUrl(url: string): Promise<void> {
    return this.exec(async () => {
      const req = {
        buildPacket() {
          return new Packet(
            ECOpCode.EC_OP_SERVER_UPDATE_FROM_URL,
            Flags.useUtf8Numbers(),
            [new StringTag(ECTagName.EC_TAG_SERVERS_UPDATE_URL, url)],
          );
        },
      };
      await (this.client as any).connection.sendRequest(req);
    });
  }

  async connectToServer(ip?: string, port?: number): Promise<void> {
    return this.exec(() => this.client.connectToServer(ip, port));
  }

  async disconnectFromServer(): Promise<void> {
    return this.exec(() => this.client.disconnectFromServer());
  }

  async getClientQueue(): Promise<AmuleUpDownClient[]> {
    return this.exec(() => this.client.getClientQueue());
  }

  async getCategories(): Promise<AmuleCategory[]> {
    return this.exec(() => this.client.getCategories());
  }

  async createCategory(cat: AmuleCategory): Promise<void> {
    return this.exec(() => this.client.createCategory(cat));
  }

  async updateCategory(id: number, cat: AmuleCategory): Promise<void> {
    return this.exec(() => this.client.updateCategory(id, cat));
  }

  async deleteCategory(id: number): Promise<void> {
    return this.exec(() => this.client.deleteCategory(id));
  }

  async setFileCategory(hash: Buffer, categoryId: number): Promise<void> {
    return this.exec(() => this.client.setFileCategory(hash, categoryId));
  }

  async searchAsync(
    query: string,
    searchType?: SearchType,
    filters?: SearchFilters,
  ): Promise<string> {
    return this.exec(() => this.client.searchAsync(query, searchType, filters));
  }

  async searchSync(
    query: string,
    searchType?: SearchType,
    filters?: SearchFilters,
    timeout?: number,
  ): Promise<SearchResultsResponse> {
    return this.exec(() =>
      this.client.searchSync(query, searchType, filters, timeout),
    );
  }

  async searchStatus(): Promise<number> {
    return this.exec(() => this.client.searchStatus());
  }

  async searchResults(): Promise<SearchResultsResponse> {
    return this.exec(() => this.client.searchResults());
  }

  async searchStop(): Promise<void> {
    return this.exec(() => this.client.searchStop());
  }

  async downloadSearchResult(hash: Buffer): Promise<void> {
    return this.exec(() => this.client.downloadSearchResult(hash));
  }

  async downloadEd2kLink(link: string): Promise<void> {
    return this.exec(() => this.client.downloadEd2kLink(link));
  }

  async pauseDownload(hash: Buffer): Promise<void> {
    return this.exec(() => this.client.pauseDownload(hash));
  }

  async resumeDownload(hash: Buffer): Promise<void> {
    return this.exec(() => this.client.resumeDownload(hash));
  }

  async stopDownload(hash: Buffer): Promise<void> {
    return this.exec(() => this.client.stopDownload(hash));
  }

  async deleteDownload(hash: Buffer): Promise<void> {
    return this.exec(() => this.client.deleteDownload(hash));
  }

  async sendDownloadCommand(
    hash: Buffer,
    command: DownloadCommand,
  ): Promise<void> {
    return this.exec(() => this.client.sendDownloadCommand(hash, command));
  }

  async getUpdate(detailLevel?: ECDetailLevel): Promise<UpdateResponse> {
    return this.exec(() => this.client.getUpdate(detailLevel));
  }

  // ─── Preference methods ───────────────────────────────────────────────────

  /**
   * Fetch aMule preferences from the daemon using EC_OP_GET_PREFERENCES.
   * Returns parsed preference objects for General, Connection, Servers, Security.
   */
  async getPreferences(): Promise<AmulePreferences> {
    return this.exec(async () => {
      const bitmask =
        EcPrefs.EC_PREFS_GENERAL |
        EcPrefs.EC_PREFS_CONNECTIONS |
        EcPrefs.EC_PREFS_SERVERS |
        EcPrefs.EC_PREFS_SECURITY;

      const req = new GetPrefsRequest(bitmask);
      const resp = await (this.client as any).connection.sendRequestNoAuth(req);

      // Parse response tags
      const generalTag = resp.tags?.find((t: any) => t.name === 0x1200); // EC_TAG_PREFS_GENERAL
      const connTag = resp.tags?.find((t: any) => t.name === 0x1300); // EC_TAG_PREFS_CONNECTIONS
      const serversTag = resp.tags?.find((t: any) => t.name === 0x1700); // EC_TAG_PREFS_SERVERS
      const securityTag = resp.tags?.find((t: any) => t.name === 0x1c00); // EC_TAG_PREFS_SECURITY

      const general: AmulePrefsGeneral = {
        userNick: generalTag ? strNested(generalTag, 0x1201) : "", // EC_TAG_USER_NICK
        checkNewVersion: generalTag ? boolNested(generalTag, 0x1204) : false, // EC_TAG_GENERAL_CHECK_NEW_VERSION
      };

      const connection: AmulePrefsConnection = {
        uploadCapacity: connTag ? numNested(connTag, 0x1302) : 0, // EC_TAG_CONN_UL_CAP
        downloadCapacity: connTag ? numNested(connTag, 0x1301) : 0, // EC_TAG_CONN_DL_CAP
        maxUploadSpeed: connTag ? numNested(connTag, 0x1304) : 0, // EC_TAG_CONN_MAX_UL
        maxDownloadSpeed: connTag ? numNested(connTag, 0x1303) : 0, // EC_TAG_CONN_MAX_DL
        slotAllocation: connTag ? numNested(connTag, 0x1305) : 2, // EC_TAG_CONN_SLOT_ALLOCATION
        tcpPort: connTag ? numNested(connTag, 0x1306) : 4662, // EC_TAG_CONN_TCP_PORT
        udpPort: connTag ? numNested(connTag, 0x1307) : 4672, // EC_TAG_CONN_UDP_PORT
        maxFileSources: connTag ? numNested(connTag, 0x1309) : 300, // EC_TAG_CONN_MAX_FILE_SOURCES
        maxConnections: connTag ? numNested(connTag, 0x130a) : 500, // EC_TAG_CONN_MAX_CONN
        autoconnect: connTag ? boolNested(connTag, 0x130b) : false, // EC_TAG_CONN_AUTOCONNECT
        reconnect: connTag ? boolNested(connTag, 0x130c) : false, // EC_TAG_CONN_RECONNECT
        networkED2K: connTag ? boolNested(connTag, 0x130d) : true, // EC_TAG_NETWORK_ED2K
        networkKademlia: connTag ? boolNested(connTag, 0x130e) : false, // EC_TAG_NETWORK_KADEMLIA
      };

      const servers: AmulePrefsServers = {
        removeDead: serversTag ? boolNested(serversTag, 0x1701) : true, // EC_TAG_SERVERS_REMOVE_DEAD
        deadRetries: serversTag ? numNested(serversTag, 0x1702) : 3, // EC_TAG_SERVERS_DEAD_SERVER_RETRIES
        useScoreSystem: serversTag ? boolNested(serversTag, 0x1707) : true, // EC_TAG_SERVERS_USE_SCORE_SYSTEM
        smartIdCheck: serversTag ? boolNested(serversTag, 0x1708) : true, // EC_TAG_SERVERS_SMART_ID_CHECK
        updateUrl: serversTag ? strNested(serversTag, 0x170c) : "", // EC_TAG_SERVERS_UPDATE_URL
      };

      const security: AmulePrefsSecurity = {
        canSeeShares: securityTag ? numNested(securityTag, 0x1c01) : 2, // EC_TAG_SECURITY_CAN_SEE_SHARES
        ipFilterClients: securityTag ? boolNested(securityTag, 0x1c02) : true, // EC_TAG_IPFILTER_CLIENTS
        ipFilterServers: securityTag ? boolNested(securityTag, 0x1c03) : true, // EC_TAG_IPFILTER_SERVERS
        ipFilterAutoUpdate: securityTag
          ? boolNested(securityTag, 0x1c04)
          : false, // EC_TAG_IPFILTER_AUTO_UPDATE
        ipFilterUpdateUrl: securityTag ? strNested(securityTag, 0x1c05) : "", // EC_TAG_IPFILTER_UPDATE_URL
        ipFilterLevel: securityTag ? numNested(securityTag, 0x1c06) : 127, // EC_TAG_IPFILTER_LEVEL
        filterLan: securityTag ? boolNested(securityTag, 0x1c07) : true, // EC_TAG_IPFILTER_FILTER_LAN
        useSecIdent: securityTag ? boolNested(securityTag, 0x1c08) : true, // EC_TAG_SECURITY_USE_SECIDENT
        obfuscationSupported: securityTag
          ? boolNested(securityTag, 0x1c09)
          : true, // EC_TAG_SECURITY_OBFUSCATION_SUPPORTED
        obfuscationRequested: securityTag
          ? boolNested(securityTag, 0x1c0a)
          : false, // EC_TAG_SECURITY_OBFUSCATION_REQUESTED
        obfuscationRequired: securityTag
          ? boolNested(securityTag, 0x1c0b)
          : false, // EC_TAG_SECURITY_OBFUSCATION_REQUIRED
      };

      return { general, connection, servers, security };
    });
  }

  /**
   * Save aMule preferences via EC_OP_SET_PREFERENCES.
   * Accepts a partial AmulePreferences object — only provided sections are sent.
   */
  async setPreferences(prefs: Partial<AmulePreferences>): Promise<void> {
    return this.exec(async () => {
      const topTags: any[] = [];

      if (prefs.general) {
        const g = prefs.general;
        const subs: any[] = [
          new StringTag(0x1201, g.userNick), // EC_TAG_USER_NICK
          new UByteTag(0x1204, g.checkNewVersion ? 1 : 0), // EC_TAG_GENERAL_CHECK_NEW_VERSION
        ];
        topTags.push(new UByteTag(0x1200, 0, subs)); // EC_TAG_PREFS_GENERAL
      }

      if (prefs.connection) {
        const c = prefs.connection;
        const subs: any[] = [
          new UIntTag(0x1302, c.uploadCapacity), // EC_TAG_CONN_UL_CAP
          new UIntTag(0x1301, c.downloadCapacity), // EC_TAG_CONN_DL_CAP
          new UIntTag(0x1304, c.maxUploadSpeed), // EC_TAG_CONN_MAX_UL
          new UIntTag(0x1303, c.maxDownloadSpeed), // EC_TAG_CONN_MAX_DL
          new UIntTag(0x1305, c.slotAllocation), // EC_TAG_CONN_SLOT_ALLOCATION
          new UShortTag(0x1306, c.tcpPort), // EC_TAG_CONN_TCP_PORT
          new UShortTag(0x1307, c.udpPort), // EC_TAG_CONN_UDP_PORT
          new UIntTag(0x1309, c.maxFileSources), // EC_TAG_CONN_MAX_FILE_SOURCES
          new UIntTag(0x130a, c.maxConnections), // EC_TAG_CONN_MAX_CONN
          new UByteTag(0x130b, c.autoconnect ? 1 : 0), // EC_TAG_CONN_AUTOCONNECT
          new UByteTag(0x130c, c.reconnect ? 1 : 0), // EC_TAG_CONN_RECONNECT
          new UByteTag(0x130d, c.networkED2K ? 1 : 0), // EC_TAG_NETWORK_ED2K
          new UByteTag(0x130e, c.networkKademlia ? 1 : 0), // EC_TAG_NETWORK_KADEMLIA
        ];
        topTags.push(new UByteTag(0x1300, 0, subs)); // EC_TAG_PREFS_CONNECTIONS
      }

      if (prefs.servers) {
        const s = prefs.servers;
        const subs: any[] = [
          new UByteTag(0x1701, s.removeDead ? 1 : 0), // EC_TAG_SERVERS_REMOVE_DEAD
          new UShortTag(0x1702, s.deadRetries), // EC_TAG_SERVERS_DEAD_SERVER_RETRIES
          new UByteTag(0x1707, s.useScoreSystem ? 1 : 0), // EC_TAG_SERVERS_USE_SCORE_SYSTEM
          new UByteTag(0x1708, s.smartIdCheck ? 1 : 0), // EC_TAG_SERVERS_SMART_ID_CHECK
          new StringTag(0x170c, s.updateUrl), // EC_TAG_SERVERS_UPDATE_URL
        ];
        topTags.push(new UByteTag(0x1700, 0, subs)); // EC_TAG_PREFS_SERVERS
      }

      if (prefs.security) {
        const sec = prefs.security;
        const subs: any[] = [
          new UByteTag(0x1c01, sec.canSeeShares), // EC_TAG_SECURITY_CAN_SEE_SHARES
          new UByteTag(0x1c02, sec.ipFilterClients ? 1 : 0), // EC_TAG_IPFILTER_CLIENTS
          new UByteTag(0x1c03, sec.ipFilterServers ? 1 : 0), // EC_TAG_IPFILTER_SERVERS
          new UByteTag(0x1c04, sec.ipFilterAutoUpdate ? 1 : 0), // EC_TAG_IPFILTER_AUTO_UPDATE
          new StringTag(0x1c05, sec.ipFilterUpdateUrl), // EC_TAG_IPFILTER_UPDATE_URL
          new UByteTag(0x1c06, sec.ipFilterLevel), // EC_TAG_IPFILTER_LEVEL
          new UByteTag(0x1c07, sec.filterLan ? 1 : 0), // EC_TAG_IPFILTER_FILTER_LAN
          new UByteTag(0x1c08, sec.useSecIdent ? 1 : 0), // EC_TAG_SECURITY_USE_SECIDENT
          new UByteTag(0x1c09, sec.obfuscationSupported ? 1 : 0), // EC_TAG_SECURITY_OBFUSCATION_SUPPORTED
          new UByteTag(0x1c0a, sec.obfuscationRequested ? 1 : 0), // EC_TAG_SECURITY_OBFUSCATION_REQUESTED
          new UByteTag(0x1c0b, sec.obfuscationRequired ? 1 : 0), // EC_TAG_SECURITY_OBFUSCATION_REQUIRED
        ];
        topTags.push(new UByteTag(0x1c00, 0, subs)); // EC_TAG_PREFS_SECURITY
      }

      if (topTags.length === 0) return;

      const req = new SetPrefsRequest(topTags);
      await (this.client as any).connection.sendRequestNoAuth(req);
    });
  }

  // ─── Raw EC methods (for data the library parser skips) ───────────────────

  /**
   * Fetch per-chunk progress data for download queue files.
   *
   * Faithfully reproduces aMule's CProgressImage::CreateSpan() algorithm:
   *  1. All chunks start as COMPLETE (no gap = downloaded).
   *  2. GAP_STATUS (uint64 LE pairs) marks byte ranges NOT yet downloaded.
   *     Chunks overlapping a gap become AVAILABLE (sources exist) or
   *     UNAVAILABLE (no sources), using per-part availability from PART_STATUS.
   *  3. PART_STATUS contains per-part source availability count
   *     (how many sources have each specific part).
   *  4. REQ_STATUS (uint64 LE pairs) marks actively downloading ranges → DOWNLOADING.
   *
   * @see https://github.com/amule-project/amule/blob/master/src/webserver/src/WebServer.cpp
   */
  async getFileChunks(fileHash?: string): Promise<Record<string, ChunkInfo>> {
    return this.exec(async () => {
      const conn = (this.client as any).connection;

      const packet = new Packet(
        ECOpCode.EC_OP_GET_DLOAD_QUEUE,
        Flags.useUtf8Numbers(),
        [
          new UByteTag(
            ECTagName.EC_TAG_DETAIL_LEVEL,
            ECDetailLevel.EC_DETAIL_FULL,
          ),
        ],
      );

      const response = await conn.sendRequest({ buildPacket: () => packet });
      const result: Record<string, ChunkInfo> = {};

      for (const fileTag of response.tags) {
        if (fileTag.name !== ECTagName.EC_TAG_PARTFILE) continue;

        const nested = fileTag.nestedTags || [];

        // ── File hash ──
        const hashTag = nested.find(
          (t: any) => t.name === ECTagName.EC_TAG_PARTFILE_HASH,
        );
        if (!hashTag) continue;
        const hexHash: string = hashTag.getValue().toString("hex");
        if (fileHash && hexHash !== fileHash) continue;

        // ── File size ──
        const sizeTag = nested.find(
          (t: any) => t.name === ECTagName.EC_TAG_PARTFILE_SIZE_FULL,
        );
        const sizeFull = sizeTag
          ? Number(
              typeof sizeTag.getLong === "function"
                ? sizeTag.getLong()
                : sizeTag.getValue() || 0,
            )
          : 0;

        const partCount = sizeFull > 0 ? Math.ceil(sizeFull / PARTSIZE) : 0;

        // ── Extract raw binary tag buffers ──
        const partStatusTag = nested.find(
          (t: any) => t.name === ECTagName.EC_TAG_PARTFILE_PART_STATUS,
        );
        const gapStatusTag = nested.find(
          (t: any) => t.name === ECTagName.EC_TAG_PARTFILE_GAP_STATUS,
        );
        const reqStatusTag = nested.find(
          (t: any) => t.name === ECTagName.EC_TAG_PARTFILE_REQ_STATUS,
        );

        const partStatusBuf: Buffer | null = partStatusTag
          ? Buffer.from(partStatusTag.getValue())
          : null;
        const gapStatusBuf: Buffer | null = gapStatusTag
          ? Buffer.from(gapStatusTag.getValue())
          : null;
        const reqStatusBuf: Buffer | null = reqStatusTag
          ? Buffer.from(reqStatusTag.getValue())
          : null;

        // ── Decode PART_STATUS (RLE-encoded per-part availability) ──
        // aMule encodes ArrayOfUInts16 → clamped to uint8 → RLE compressed.
        // After RLE decode, each byte = number of sources for that part.
        const availability = new Array(partCount).fill(0);
        if (partStatusBuf && partStatusBuf.length > 0) {
          const decoded = decodePartStatus(partStatusBuf);
          for (let p = 0; p < Math.min(decoded.length, partCount); p++) {
            availability[p] = decoded[p];
          }
        }

        // ── aMule CreateSpan algorithm ──
        // Step 1: All chunks start as COMPLETE (like m_ColorLine = 0x0 = black)
        const chunks = new Array(partCount).fill(ChunkStatus.COMPLETE);

        if (partCount === 0) {
          result[hexHash] = { chunks, availability, partCount, sizeFull };
          continue;
        }

        // Step 2: Decode GAP_STATUS (RLE-encoded, byte-interleaved uint64 pairs)
        // Each pair = [gapStart, gapEnd) marking incomplete byte ranges.
        if (gapStatusBuf && gapStatusBuf.length > 0) {
          const gapValues = decodeUint64Array(gapStatusBuf);
          for (let i = 0; i + 1 < gapValues.length; i += 2) {
            const gapStart = gapValues[i];
            const gapEnd = gapValues[i + 1];
            if (gapStart > sizeFull || gapEnd > sizeFull || gapStart >= gapEnd)
              continue;

            const pStart = Math.floor(gapStart / PARTSIZE);
            const pEnd = Math.min(Math.floor(gapEnd / PARTSIZE) + 1, partCount);

            for (let p = pStart; p < pEnd; p++) {
              const cStart = p * PARTSIZE;
              const cEnd = Math.min((p + 1) * PARTSIZE, sizeFull);
              if (gapStart < cEnd && gapEnd > cStart) {
                // aMule: if m_PartInfo[i] > 0 → blue (available), else → red (unavailable)
                chunks[p] =
                  availability[p] > 0
                    ? ChunkStatus.AVAILABLE
                    : ChunkStatus.UNAVAILABLE;
              }
            }
          }
        }

        // Step 3: Decode REQ_STATUS (RLE-encoded, byte-interleaved uint64 pairs)
        // Each pair = [reqStart, reqEnd) marking actively downloading ranges.
        if (reqStatusBuf && reqStatusBuf.length > 0) {
          const reqValues = decodeUint64Array(reqStatusBuf);
          for (let i = 0; i + 1 < reqValues.length; i += 2) {
            const rStart = reqValues[i];
            const rEnd = reqValues[i + 1];
            if (rStart > sizeFull || rEnd > sizeFull || rStart >= rEnd)
              continue;

            const pStart = Math.floor(rStart / PARTSIZE);
            const pEnd = Math.min(Math.floor(rEnd / PARTSIZE) + 1, partCount);

            for (let p = pStart; p < pEnd; p++) {
              if (chunks[p] !== ChunkStatus.COMPLETE) {
                const cStart = p * PARTSIZE;
                const cEnd = Math.min((p + 1) * PARTSIZE, sizeFull);
                if (rStart < cEnd && rEnd > cStart) {
                  chunks[p] = ChunkStatus.DOWNLOADING;
                }
              }
            }
          }
        }

        result[hexHash] = { chunks, availability, partCount, sizeFull };
      }

      return result;
    });
  }

  // ─── Per-file source extraction from raw download queue ─────────────────

  /**
   * Extract per-file source (client) data from the download queue.
   *
   * The library's DownloadQueueResponseParser only extracts aggregate
   * source counts. This method sends a raw EC_OP_GET_DLOAD_QUEUE with
   * full detail and manually extracts EC_TAG_CLIENT subtags nested
   * inside each EC_TAG_PARTFILE, as well as EC_TAG_PARTFILE_SOURCE_NAMES.
   */
  async getFileSources(fileHash: string): Promise<{
    sources: ParsedSource[];
    sourceNames: { name: string; count: number }[];
  }> {
    return this.exec(async () => {
      const conn = (this.client as any).connection;

      const packet = new Packet(
        ECOpCode.EC_OP_GET_DLOAD_QUEUE,
        Flags.useUtf8Numbers(),
        [
          new UByteTag(
            ECTagName.EC_TAG_DETAIL_LEVEL,
            ECDetailLevel.EC_DETAIL_FULL,
          ),
        ],
      );

      const response = await conn.sendRequest({ buildPacket: () => packet });

      const hashLower = fileHash.toLowerCase();
      const sources: ParsedSource[] = [];
      const sourceNames: { name: string; count: number }[] = [];

      for (const fileTag of response.tags) {
        if (fileTag.name !== ECTagName.EC_TAG_PARTFILE) continue;

        const nested = fileTag.nestedTags || [];

        // Match by hash
        const hashTag = nested.find(
          (t: any) => t.name === ECTagName.EC_TAG_PARTFILE_HASH,
        );
        if (!hashTag) continue;
        const hexHash: string = hashTag.getValue().toString("hex");
        if (hexHash !== hashLower) continue;

        // Extract EC_TAG_CLIENT subtags (per-file sources)
        for (const tag of nested) {
          if (tag.name !== ECTagName.EC_TAG_CLIENT) continue;
          const ct = tag.nestedTags || [];
          const findStr = (n: number) =>
            ct.find((t: any) => t.name === n)?.getValue?.() || "";
          const findNum = (n: number) => {
            const t = ct.find((x: any) => x.name === n);
            if (!t) return 0;
            if (typeof t.getLong === "function") {
              try {
                return Number(t.getLong());
              } catch {}
            }
            if (typeof t.getInt === "function") {
              try {
                return t.getInt();
              } catch {}
            }
            if (typeof t.getShort === "function") {
              try {
                return t.getShort();
              } catch {}
            }
            const v = t.getValue?.();
            return typeof v === "number"
              ? v
              : typeof v === "bigint"
                ? Number(v)
                : 0;
          };
          const findIP = (n: number) => {
            const t = ct.find((x: any) => x.name === n);
            if (!t) return "";
            const v = t.getValue?.();
            if (typeof v === "string") return v;
            if (typeof v === "number") {
              // Convert uint32 to dotted IP
              return `${(v >>> 24) & 0xff}.${(v >>> 16) & 0xff}.${(v >>> 8) & 0xff}.${v & 0xff}`;
            }
            return String(v || "");
          };
          const findHash = (n: number) => {
            const t = ct.find((x: any) => x.name === n);
            if (!t) return "";
            const v = t.getValue?.();
            if (Buffer.isBuffer(v)) return v.toString("hex");
            return String(v || "");
          };

          sources.push({
            clientName:
              findStr(ECTagName.EC_TAG_CLIENT_NAME) ||
              findStr(256) ||
              "Unknown",
            userHash: findHash(ECTagName.EC_TAG_CLIENT_HASH),
            software:
              findStr(ECTagName.EC_TAG_CLIENT_SOFTWARE) || findStr(1537),
            softwareVersion: findStr(ECTagName.EC_TAG_CLIENT_SOFT_VER_STR),
            score: findNum(ECTagName.EC_TAG_CLIENT_SCORE),
            uploadSpeed: findNum(ECTagName.EC_TAG_CLIENT_UP_SPEED),
            downloadSpeed: findNum(ECTagName.EC_TAG_CLIENT_DOWN_SPEED),
            uploadState: findNum(ECTagName.EC_TAG_CLIENT_UPLOAD_STATE),
            downloadState: findNum(ECTagName.EC_TAG_CLIENT_DOWNLOAD_STATE),
            ip: findIP(ECTagName.EC_TAG_CLIENT_USER_IP),
            port: findNum(ECTagName.EC_TAG_CLIENT_USER_PORT),
            remoteQueueRank: findNum(ECTagName.EC_TAG_CLIENT_REMOTE_QUEUE_RANK),
            waitingPosition: findNum(ECTagName.EC_TAG_CLIENT_WAITING_POSITION),
            identState: findNum(ECTagName.EC_TAG_CLIENT_IDENT_STATE),
            obfuscationStatus: findNum(
              ECTagName.EC_TAG_CLIENT_OBFUSCATION_STATUS,
            ),
            remoteFilename: findStr(ECTagName.EC_TAG_CLIENT_REMOTE_FILENAME),
            availableParts: findNum(ECTagName.EC_TAG_CLIENT_AVAILABLE_PARTS),
            sourceFrom: findNum(ECTagName.EC_TAG_CLIENT_FROM),
          });
        }

        // Extract EC_TAG_PARTFILE_SOURCE_NAMES (789) + COUNTS (796)
        const namesTag = nested.find(
          (t: any) =>
            t.name === ECTagName.EC_TAG_PARTFILE_SOURCE_NAMES || t.name === 789,
        );
        const countsTag = nested.find(
          (t: any) =>
            t.name === ECTagName.EC_TAG_PARTFILE_SOURCE_NAMES_COUNTS ||
            t.name === 796,
        );

        if (namesTag) {
          // SOURCE_NAMES contains nested string subtags
          const nameTags = namesTag.nestedTags || [];
          const countTags = countsTag?.nestedTags || [];

          for (let i = 0; i < nameTags.length; i++) {
            const nameVal = nameTags[i]?.getValue?.() || "";
            let countVal = 0;
            if (i < countTags.length) {
              const cv = countTags[i]?.getValue?.();
              countVal =
                typeof cv === "number"
                  ? cv
                  : typeof cv === "bigint"
                    ? Number(cv)
                    : 0;
            }
            if (nameVal) {
              sourceNames.push({ name: String(nameVal), count: countVal || 1 });
            }
          }
        }

        break; // Found our file, stop iterating
      }

      return { sources, sourceNames };
    });
  }
}

export interface ParsedSource {
  clientName: string;
  userHash: string;
  software: string;
  softwareVersion: string;
  score: number;
  uploadSpeed: number;
  downloadSpeed: number;
  uploadState: number;
  downloadState: number;
  ip: string;
  port: number;
  remoteQueueRank: number;
  waitingPosition: number;
  identState: number;
  obfuscationStatus: number;
  remoteFilename: string;
  availableParts: number;
  sourceFrom: number;
}

// Re-export useful types and enums
export { DownloadCommand, SearchType, FileStatus, ECDetailLevel };
export type {
  AmuleTransferringFile,
  AmuleFile,
  AmuleServer,
  AmuleUpDownClient,
  AmuleFriend,
  AmuleCategory,
  StatsResponse,
  SearchResultsResponse,
  UpdateResponse,
};
// ChunkInfo and ChunkStatus already exported above

// ─── Singleton accessor ───────────────────────────────────────────────────────

let _client: AmuleECClient | null = null;

export function useAmuleClient(): AmuleECClient {
  if (!_client) {
    const config = useRuntimeConfig();
    _client = new AmuleECClient({
      host: String(config.amuleHost || "192.168.31.89"),
      port: Number(config.amulePort) || 4712,
      password: String(config.amulePassword || ""),
      timeout: 30_000,
    });
  }
  return _client;
}

/** Force-reset the singleton (e.g. after admin changes connection settings). */
export function resetAmuleClient(): void {
  _client = null;
}
