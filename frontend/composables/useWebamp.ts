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
  setSkinFromUrl: (url: string) => void;
  skinIsLoaded: () => Promise<void>;
  dispose: () => void;
  store: { dispatch: (action: any) => void };
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

/**
 * Build an absolute URL for a skin by name.
 */
function skinUrl(name: string): string {
  return `${window.location.origin}/api/webamp/skins/${encodeURIComponent(name)}`;
}

/**
 * Change the active skin on a running Webamp instance using the official API.
 * Calls setSkinFromUrl() and awaits skinIsLoaded() for confirmation.
 */
export async function changeWebampSkin(name: string) {
  localStorage.setItem("webampSkin", name);
  if (!_instance) {
    console.log("[webamp] changeWebampSkin: no running instance, skin saved for next open:", name);
    return;
  }
  const url = skinUrl(name);
  console.log("[webamp] changeWebampSkin: applying skin", name, "from", url);
  _instance.setSkinFromUrl(url);
  try {
    await _instance.skinIsLoaded();
    console.log("[webamp] skin loaded successfully:", name);
  } catch (e) {
    console.warn("[webamp] skinIsLoaded error:", e);
  }
}

/**
 * Reset to the built-in default skin.
 * Dispatches Webamp's internal LOAD_DEFAULT_SKIN action to reset to Base 2.4.
 */
export function resetToDefaultSkin() {
  localStorage.removeItem("webampSkin");
  if (!_instance) {
    console.log("[webamp] resetToDefaultSkin: no running instance");
    return;
  }
  console.log("[webamp] resetToDefaultSkin: dispatching LOAD_DEFAULT_SKIN");
  _instance.store.dispatch({ type: "LOAD_DEFAULT_SKIN" });
}

/**
 * Apply all Webamp window/size preferences from localStorage to a running instance.
 * Uses Webamp's internal Redux store to set equalizer, playlist, milkdrop, and 2x.
 */
export function applyWebampSettings() {
  if (!_instance) return;
  const store = _instance.store;
  const state = store.getState();

  const showEq = localStorage.getItem("webampShowEq") !== "false";
  const showPlaylist = localStorage.getItem("webampShowPlaylist") !== "false";
  const showMilkdrop = localStorage.getItem("webampShowMilkdrop") === "true";
  const doubleSize = localStorage.getItem("webampDoubleSize") === "true";

  console.log("[webamp] applyWebampSettings:", { showEq, showPlaylist, showMilkdrop, doubleSize });

  // Equalizer on/off
  store.dispatch({ type: showEq ? "SET_EQ_ON" : "SET_EQ_OFF" });

  // Toggle equalizer window visibility if needed
  const eqOpen = state.windows?.genWindows?.["equalizer"]?.open;
  if (eqOpen !== showEq) {
    store.dispatch({ type: "TOGGLE_WINDOW", windowId: "equalizer" });
  }

  // Toggle playlist window visibility if needed
  const plOpen = state.windows?.genWindows?.["playlist"]?.open;
  if (plOpen !== showPlaylist) {
    store.dispatch({ type: "TOGGLE_WINDOW", windowId: "playlist" });
  }

  // Milkdrop on/off
  const mdEnabled = !!(state.windows as any)?.milkdropEnabled;
  if (mdEnabled !== showMilkdrop) {
    store.dispatch({ type: "ENABLE_MILKDROP", open: showMilkdrop });
  }

  // Double size mode (toggle-based — read the `size` of the main window to infer)
  // The main window at 1x is 275x116; at 2x it's reported differently in state.
  // We just toggle if the current state doesn't match.
  // Infer from the main window's `size` array (first element > 275 means 2x)
  const mainSize = state.windows?.genWindows?.["main"]?.size;
  const isDouble = Array.isArray(mainSize) && mainSize[0] > 300;
  if (isDouble !== doubleSize) {
    store.dispatch({ type: "TOGGLE_DOUBLESIZE_MODE" });
  }
}

export function useWebamp() {
  /** Change skin on a running Webamp instance */
  async function changeWebampSkin(name: string) {
    localStorage.setItem("webampSkin", name);
    if (!_instance) return;
    const url = skinUrl(name);
    console.log("[webamp] useWebamp.changeWebampSkin:", name, url);
    _instance.setSkinFromUrl(url);
    try {
      await _instance.skinIsLoaded();
      console.log("[webamp] skin loaded successfully:", name);
    } catch (e) {
      console.warn("[webamp] skinIsLoaded error:", e);
    }
  }

  /** Reset to built-in default skin (Base 2.4). Uses internal Redux action. */
  function resetToDefaultSkin() {
    localStorage.removeItem("webampSkin");
    if (!_instance) return;
    _instance.store.dispatch({ type: "LOAD_DEFAULT_SKIN" });
  }

  /** Apply all window/size preferences from localStorage to the running instance. */
  function applyWebampSettings() {
    if (!_instance) return;
    const store = _instance.store;
    const state = store.getState();

    const showEq = localStorage.getItem("webampShowEq") !== "false";
    const showPlaylist = localStorage.getItem("webampShowPlaylist") !== "false";
    const showMilkdrop = localStorage.getItem("webampShowMilkdrop") === "true";
    const doubleSize = localStorage.getItem("webampDoubleSize") === "true";

    store.dispatch({ type: showEq ? "SET_EQ_ON" : "SET_EQ_OFF" });

    const eqOpen = state.windows?.genWindows?.["equalizer"]?.open;
    if (eqOpen !== showEq) store.dispatch({ type: "TOGGLE_WINDOW", windowId: "equalizer" });

    const plOpen = state.windows?.genWindows?.["playlist"]?.open;
    if (plOpen !== showPlaylist) store.dispatch({ type: "TOGGLE_WINDOW", windowId: "playlist" });

    const mdEnabled = !!(state.windows as any)?.milkdropEnabled;
    if (mdEnabled !== showMilkdrop) store.dispatch({ type: "ENABLE_MILKDROP", open: showMilkdrop });

    const mainSize = state.windows?.genWindows?.["main"]?.size;
    const isDouble = Array.isArray(mainSize) && mainSize[0] > 300;
    if (isDouble !== doubleSize) store.dispatch({ type: "TOGGLE_DOUBLESIZE_MODE" });
  }

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
    changeWebampSkin,
    resetToDefaultSkin,
    applyWebampSettings,
  };
}
