/**
 * In-memory speed history for the last 15 minutes.
 * Populated by the speed-poller plugin (server/plugins/speed-poller.ts).
 * Served by GET /api/speed-history.
 */

const WINDOW_MS = 15 * 60 * 1000;

export interface SpeedPoint {
  t: number;
  amule: number;
  torrent: number;
  pyload: number;
}

const _history: SpeedPoint[] = [];

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
