/**
 * In-memory speed history for the last 15 minutes.
 * Populated by the speed-poller plugin (server/plugins/speed-poller.ts).
 * Served by GET /api/speed-history.
 *
 * State is stored on globalThis so that both the plugin and the API handler
 * always reference the same array, regardless of how Nitro bundles/imports
 * the module.
 */

const WINDOW_MS = 15 * 60 * 1000;

export interface SpeedPoint {
  t: number;
  amule: number;
  torrent: number;
  pyload: number;
}

const KEY = "__transmule_speed_history__";
if (!(globalThis as any)[KEY]) (globalThis as any)[KEY] = [] as SpeedPoint[];
const _history: SpeedPoint[] = (globalThis as any)[KEY];

export function pushSpeedPoint(point: SpeedPoint): void {
  _history.push(point);
  // Trim entries older than the window
  const cutoff = point.t - WINDOW_MS;
  const firstOk = _history.findIndex((p) => p.t >= cutoff);
  if (firstOk > 0) _history.splice(0, firstOk);
}

export function getSpeedHistory(): SpeedPoint[] {
  return _history.slice();
}
