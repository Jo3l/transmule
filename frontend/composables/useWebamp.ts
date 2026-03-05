/**
 * Global Webamp singleton state.
 *
 * Module-level variables are shared across every composable call so the
 * player survives route changes.  Webamp.vue registers its raw JS instance
 * here after renderWhenReady() resolves, which is the only reliable moment
 * appendTracks() can be called.
 */

import type { Track } from "webamp";

// ── Singleton state ────────────────────────────────────────────────────────
const webampTrack = ref<Track | null>(null);
const webampKey = ref(0);

// Raw Webamp JS instance — set by Webamp.vue after renderWhenReady() resolves
let _instance: { appendTracks: (t: Track[]) => void; dispose: () => void } | null = null;

// Tracks queued while Webamp is still mounting (openTracks called before ready)
const _pending: Track[] = [];

export function useWebamp() {
  /** Called by Webamp.vue once the instance is fully ready. */
  function registerInstance(inst: typeof _instance) {
    _instance = inst;
    if (_pending.length) {
      inst?.appendTracks(_pending.splice(0));
    }
  }

  /** Called by Webamp.vue on unmount. */
  function unregisterInstance() {
    _instance = null;
  }

  /** Returns true when the filename is an MP3. */
  function isMp3Name(name: string): boolean {
    return name.toLowerCase().endsWith(".mp3");
  }

  /**
   * Play or append a single track.
   * Appends if Webamp is already open, otherwise opens it.
   */
  function openTrack(track: Track) {
    if (_instance) {
      _instance.appendTracks([track]);
    } else {
      webampTrack.value = track;
      webampKey.value++;
    }
  }

  /**
   * Play or append several tracks.
   * Appends if Webamp is already open; otherwise opens with the first track
   * and queues the rest to be appended once the instance is ready.
   */
  function openTracks(tracks: Track[]) {
    if (!tracks.length) return;
    if (_instance) {
      _instance.appendTracks(tracks);
    } else {
      _pending.push(...tracks.slice(1));
      webampTrack.value = tracks[0];
      webampKey.value++;
    }
  }

  return {
    webampTrack,
    webampKey,
    isMp3Name,
    openTrack,
    openTracks,
    registerInstance,
    unregisterInstance,
  };
}
