/**
 * TransMule presence + instance census over the Soulseek network.
 *
 * Alternative 1 of the census design: the instance publishes a marker in its
 * Soulseek description ("TransMule 1.175 · up 3h12m") and auto-joins a public
 * channel ("Transmule"). Any instance in that channel can then count how many
 * TransMule instances are online right now by reading the member list and
 * pulling each member's user info — no messages, no central server.
 *
 * Verified against slskd's source (master):
 *   - `soulseek.description` has no [RequiresReconnect] → a config change shows
 *     up on the next GetUserInfo, no reconnect needed (Core/Options.cs).
 *   - slskd serves it live from options: Application.cs → UserInfoResolver()
 *     builds `new UserInfo(description: Options.Soulseek.Description, …)`.
 *   - `GET /users/{username}/info` returns it (UsersController.Info →
 *     Users/Types/Info.cs).
 *   - `rooms` is a top-level option ("a list of rooms to automatically join")
 *     that RoomService joins on every login; the runtime-joined set lives in
 *     memory, so slskd's config file is the durable store.
 *
 * What the number means: instances **in that channel** with the marker enabled.
 * It is not "installations" — TransMule also runs against aMule / Transmission /
 * pyLoad without slskd, and nobody counts while disconnected.
 */

import type { SlskdClient } from "./slskd-client";
import { getConfig } from "./database";

/** Public channel the instances gather in. Keep the spelling stable. */
export const PRESENCE_ROOM = "Transmule";
/** First token of the description marker — what the census matches on. */
export const MARKER_PREFIX = "TransMule";

/** Config keys (stored in TransMule's own SQLite config table). */
export const PRESENCE_CONFIG_KEY = "slskd_presence";
export const APP_VERSION_CONFIG_KEY = "app_version";

/** A census is reused for an hour: it costs one user-info call per member. */
const CENSUS_TTL_MS = 60 * 60 * 1000;
/** Give up on stragglers after this long and report a partial count. */
const CENSUS_BUDGET_MS = 45_000;
const CENSUS_CONCURRENCY = 8;
const CENSUS_PER_USER_TIMEOUT_MS = 15_000;
/** Hard cap on members probed in one census. */
const CENSUS_MAX_USERS = 400;

export function isPresenceEnabled(): boolean {
  return getConfig(PRESENCE_CONFIG_KEY) === "1";
}

/**
 * App version used in the marker. The frontend owns the version constant
 * (`frontend/utils/constants.ts` → APP_VERSION) and hands it over when the
 * presence switch is saved, or when the settings page notices a new version.
 */
export function getAppVersion(): string {
  return (getConfig(APP_VERSION_CONFIG_KEY) || "").trim();
}

/** Human-readable uptime of the middleware process, e.g. "3h12m". */
export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;

  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;

  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${String(m % 60).padStart(2, "0")}m`;

  const d = Math.floor(h / 24);
  return `${d}d${String(h % 24).padStart(2, "0")}h`;
}

/**
 * The public identity string other instances read back. The prefix is what the
 * census matches, so it must stay stable across versions.
 */
export function buildMarker(version: string, uptimeSeconds = process.uptime()): string {
  const v = (version || "").trim();
  return `${MARKER_PREFIX}${v ? " " + v : ""} · up ${formatUptime(uptimeSeconds)}`;
}

/** Split a marker back into its parts; null when the description is not ours. */
export function parseMarker(description: string): { version: string; uptime: string } | null {
  const desc = (description || "").trim();
  if (!desc.startsWith(MARKER_PREFIX)) return null;

  const rest = desc.slice(MARKER_PREFIX.length).replace(/^[\s·]+/, "");
  const match = rest.match(/^(?:(\S+)\s+·\s*)?up\s+(.+)$/);
  if (!match) return { version: rest.trim(), uptime: "" };
  return { version: (match[1] || "").trim(), uptime: (match[2] || "").trim() };
}

export interface PresenceState {
  enabled: boolean;
  room: string;
  version: string;
  marker: string;
  applied: boolean;
}

/**
 * Publish (or stop publishing) this instance.
 *
 * Enabling writes the marker + the channel into slskd's config file and joins
 * the channel right away (slskd only joins configured rooms at login).
 * Disabling removes both and leaves the channel.
 */
export async function applyPresence(client: SlskdClient, enabled: boolean): Promise<PresenceState> {
  const version = getAppVersion();
  const marker = buildMarker(version);
  let applied = false;

  if (enabled) {
    applied = await client.updateConfig({ description: marker, ensureRoom: PRESENCE_ROOM });
    try {
      await client.joinRoom(PRESENCE_ROOM);
    } catch (err: any) {
      console.warn("[slskd] presence: could not join the channel:", err?.message);
    }
  } else {
    applied = await client.updateConfig({ description: null, removeRoom: PRESENCE_ROOM });
    try {
      await client.leaveRoom(PRESENCE_ROOM);
    } catch (err: any) {
      console.warn("[slskd] presence: could not leave the channel:", err?.message);
    }
  }

  clearCensusCache();
  return { enabled, room: PRESENCE_ROOM, version, marker, applied };
}

/**
 * Keep the uptime in the marker roughly current. slskd re-reads the description
 * on every user-info request, so a config write is enough (no reconnect).
 */
export async function refreshPresenceMarker(client: SlskdClient): Promise<boolean> {
  if (!isPresenceEnabled()) return false;
  return client.updateConfig({ description: buildMarker(getAppVersion()) });
}

export interface CensusInstance {
  username: string;
  version: string;
  uptime: string;
  description: string;
}

export interface Census {
  room: string;
  /** false when this instance is not in the channel — nothing can be counted. */
  joined: boolean;
  /** Members of the channel, TransMule or not. */
  members: number;
  /** Members whose description carries the marker. */
  transmule: number;
  /** Members counted as "not TransMule" (includes those that did not answer). */
  others: number;
  /** Members whose info request failed or ran out of time. */
  skipped: number;
  partial: boolean;
  instances: CensusInstance[];
  fetchedAt: string;
  cached: boolean;
}

let _censusCache: { at: number; data: Census } | null = null;

export function clearCensusCache(): void {
  _censusCache = null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await fn(items[index]);
    }
  });

  await Promise.all(workers);
  return out;
}

/**
 * Count TransMule instances in the channel right now.
 *
 * Reading the member list requires being **in** the channel (slskd only exposes
 * `/rooms/joined/{room}/users`), so an instance that is not joined reports
 * `joined: false` instead of silently joining a public channel.
 */
export async function getCensus(client: SlskdClient, force = false): Promise<Census> {
  if (!force && _censusCache && Date.now() - _censusCache.at < CENSUS_TTL_MS) {
    return { ..._censusCache.data, cached: true };
  }

  const joinedRooms = await client.getJoinedRooms();
  const joined = (joinedRooms ?? []).some(
    (room: any) => String(room).toLowerCase() === PRESENCE_ROOM.toLowerCase(),
  );

  if (!joined) {
    return {
      room: PRESENCE_ROOM,
      joined: false,
      members: 0,
      transmule: 0,
      others: 0,
      skipped: 0,
      partial: false,
      instances: [],
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
  }

  // slskd 0.26 can list the same user twice (RoomTracker.TryAddUser does not
  // dedupe); collapse before probing.
  const seen = new Set<string>();
  const usernames: string[] = [];
  for (const entry of await client.getRoomUsers(PRESENCE_ROOM)) {
    const name = typeof entry === "string" ? entry : entry?.username;
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    usernames.push(name);
  }

  const probed = usernames.slice(0, CENSUS_MAX_USERS);
  const deadline = Date.now() + CENSUS_BUDGET_MS;
  let skipped = 0;

  const results = await mapLimit(probed, CENSUS_CONCURRENCY, async (username) => {
    if (Date.now() > deadline) {
      skipped++;
      return null;
    }

    try {
      const info = await client.getUserInfo(username, CENSUS_PER_USER_TIMEOUT_MS);
      return { username, description: String(info?.description ?? "") };
    } catch {
      skipped++;
      return null;
    }
  });

  const instances: CensusInstance[] = [];
  for (const result of results) {
    if (!result) continue;
    const parsed = parseMarker(result.description);
    if (!parsed) continue;
    instances.push({
      username: result.username,
      version: parsed.version,
      uptime: parsed.uptime,
      description: result.description,
    });
  }

  instances.sort((a, b) => a.username.localeCompare(b.username));

  const data: Census = {
    room: PRESENCE_ROOM,
    joined: true,
    members: usernames.length,
    transmule: instances.length,
    others: Math.max(0, usernames.length - instances.length),
    skipped,
    partial: skipped > 0 || usernames.length > CENSUS_MAX_USERS,
    instances,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };

  _censusCache = { at: Date.now(), data };
  return data;
}
