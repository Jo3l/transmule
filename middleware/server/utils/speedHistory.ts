/**
 * In-memory speed history for the last 15 minutes.
 *
 * Each download endpoint calls updateServiceSpeed() after computing its
 * total speed. A combined data point is pushed once per ~3-second cycle
 * (when the first service updates after the cooldown expires).
 *
 * State lives on globalThis so it survives across Nitro module re-imports
 * in both dev and production.
 */

const WINDOW_MS = 15 * 60 * 1000;
const POINT_INTERVAL_MS = 2500; // minimum ms between data points

export interface SpeedPoint {
  t: number;
  amule: number;
  torrent: number;
  pyload: number;
  up: number;
}

interface SpeedState {
  history: SpeedPoint[];
  latest: { amule: number; torrent: number; pyload: number };
  latestUp: { amule: number; torrent: number };
  lastPushed: number;
}

const KEY = "__transmule_speed_state__";
function getState(): SpeedState {
  if (!(globalThis as any)[KEY]) {
    (globalThis as any)[KEY] = {
      history: [],
      latest: { amule: 0, torrent: 0, pyload: 0 },
      latestUp: { amule: 0, torrent: 0 },
      lastPushed: 0,
    } satisfies SpeedState;
  }
  const s = (globalThis as any)[KEY] as SpeedState;
  // Migrate old state that lacks latestUp
  if (!s.latestUp) s.latestUp = { amule: 0, torrent: 0 };
  return s;
}

/**
 * Called by each download API endpoint after computing its total speed.
 * Pushes a combined point once the cooldown has elapsed.
 */
export function updateServiceSpeed(
  service: "amule" | "torrent" | "pyload",
  speed: number,
): void {
  const state = getState();
  state.latest[service] = speed;

  const now = Date.now();
  if (now - state.lastPushed < POINT_INTERVAL_MS) return;
  state.lastPushed = now;

  state.history.push({
    t: now,
    ...state.latest,
    up: state.latestUp.amule + state.latestUp.torrent,
  });

  const cutoff = now - WINDOW_MS;
  const firstOk = state.history.findIndex((p) => p.t >= cutoff);
  if (firstOk > 0) state.history.splice(0, firstOk);
}

/** Called by upload-capable endpoints to record their current upload speed. */
export function updateServiceUploadSpeed(
  service: "amule" | "torrent",
  speed: number,
): void {
  getState().latestUp[service] = speed;
}

export function getSpeedHistory(): SpeedPoint[] {
  return getState().history.slice();
}
