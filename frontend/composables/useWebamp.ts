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
let _instance: {
  appendTracks: (t: Track[]) => void;
  reopen: () => void;
  play: () => void;
  setCurrentTrack: (index: number) => void;
  getPlaylistTracks: () => any[];
  dispose: () => void;
} | null = null;

// Tracks queued while Webamp is still mounting (openTracks called before ready)
const _pending: Track[] = [];

/** Set to true when Webamp is closed (via onClose callback). Cleared on reopen. */
let _webampClosed = false;

export function onWebampClose() {
  _webampClosed = true;
}

export function isWebampClosed(): boolean {
  return _webampClosed;
}

/** Shared state for FM → Webamp drag & drop (avoids dataTransfer MIME type issues). */
let _pendingDragTracks: Track[] | null = null;

/** Reactive flag: true while the user is dragging an audio file over the page. */
const isDraggingFile = ref(false);

export function setPendingDragTracks(tracks: Track[]) {
  _pendingDragTracks = tracks;
}

/** Check if there are pending drag tracks without consuming them. */
export function hasPendingDragTracks(): boolean {
  return _pendingDragTracks !== null && _pendingDragTracks.length > 0;
}

function consumePendingDragTracks(): Track[] | null {
  const t = _pendingDragTracks;
  _pendingDragTracks = null;
  return t;
}

export { consumePendingDragTracks, isDraggingFile };

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
      if (_webampClosed) {
        _webampClosed = false;
        _instance.reopen();
        _instance.appendTracks([track]);
        // Jump to and play the newly added track
        const pl = _instance.getPlaylistTracks();
        if (pl.length > 0) _instance.setCurrentTrack(pl.length - 1);
        _instance.play();
      } else {
        _instance.appendTracks([track]);
      }
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
      if (_webampClosed) {
        _webampClosed = false;
        _instance.reopen();
        const prevLen = _instance.getPlaylistTracks().length;
        _instance.appendTracks(tracks);
        _instance.setCurrentTrack(prevLen);
        _instance.play();
      } else {
        _instance.appendTracks(tracks);
      }
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
    setPendingDragTracks,
  };
}
