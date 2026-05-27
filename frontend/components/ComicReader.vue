<template>
  <Teleport to="body">
    <div v-if="visible" class="cr-overlay" @keydown="onKeydown" tabindex="0" ref="overlayRef" @click="closeDropdown">
      <header class="cr-header" :class="{ 'cr-header-hidden': !showHeader }">
        <div class="cr-header-left">
          <button class="cr-btn cr-btn-icon" @click="close" title="Close (Esc)">
            <span class="mdi mdi-close" />
          </button>
          <span class="cr-title">{{ fileName }}</span>
        </div>
        <div class="cr-header-center">
          <span v-if="!loading" class="cr-page-indicator">{{ currentPage + 1 }} / {{ totalPages }}</span>
        </div>
        <div class="cr-header-right">
          <div class="cr-dropdown">
            <button class="cr-btn cr-btn-icon" ref="viewMenuBtnRef" @click.stop="showViewMenu = !showViewMenu" title="View options">
              <span class="mdi mdi-cog-outline" />
            </button>
          </div>
          <button class="cr-btn cr-btn-icon" @click="toggleFullscreen" title="Fullscreen (F)">
            <span class="mdi mdi-fullscreen" />
          </button>
        </div>
      </header>

      <div v-if="showViewMenu" class="cr-dropdown-menu" :style="menuStyle" @click.stop>
              <button class="cr-menu-item" @click="rotateRight">
                <span class="mdi mdi-rotate-right cr-menu-icon" />
                <span class="cr-menu-text">Rotate Right</span>
                <span class="cr-menu-key">R</span>
              </button>
              <button class="cr-menu-item" @click="rotateLeft">
                <span class="mdi mdi-rotate-left cr-menu-icon" />
                <span class="cr-menu-text">Rotate Left</span>
                <span class="cr-menu-key">L</span>
              </button>
              <hr class="cr-menu-sep" />
              <button class="cr-menu-item" :class="{ 'is-active': viewMode === 'single' }" @click="viewMode = 'single'">
                <span class="cr-menu-check" :class="{ 'is-checked': viewMode === 'single' }">
                  <span v-if="viewMode === 'single'" class="mdi mdi-check" />
                </span>
                <span class="cr-menu-text">1-page viewer</span>
                <span class="cr-menu-key">1</span>
              </button>
              <button class="cr-menu-item" :class="{ 'is-active': viewMode === 'double' }" @click="viewMode = 'double'">
                <span class="cr-menu-check" :class="{ 'is-checked': viewMode === 'double' }">
                  <span v-if="viewMode === 'double'" class="mdi mdi-check" />
                </span>
                <span class="cr-menu-text">2-page viewer</span>
                <span class="cr-menu-key">2</span>
              </button>
              <button class="cr-menu-item" :class="{ 'is-active': viewMode === 'strip-v' }" @click="viewMode = 'strip-v'">
                <span class="cr-menu-check" :class="{ 'is-checked': viewMode === 'strip-v' }">
                  <span v-if="viewMode === 'strip-v'" class="mdi mdi-check" />
                </span>
                <span class="cr-menu-text">Long Strip</span>
                <span class="cr-menu-key">3</span>
              </button>
              <button class="cr-menu-item" :class="{ 'is-active': viewMode === 'strip-h' }" @click="viewMode = 'strip-h'">
                <span class="cr-menu-check" :class="{ 'is-checked': viewMode === 'strip-h' }">
                  <span v-if="viewMode === 'strip-h'" class="mdi mdi-check" />
                </span>
                <span class="cr-menu-text">Wide Strip</span>
                <span class="cr-menu-key">4</span>
              </button>
              <hr class="cr-menu-sep" />
              <button class="cr-menu-item" :class="{ 'is-active': fitMode === 'best' }" @click="fitMode = 'best'">
                <span class="cr-menu-check" :class="{ 'is-checked': fitMode === 'best' }">
                  <span v-if="fitMode === 'best'" class="mdi mdi-check" />
                </span>
                <span class="cr-menu-text">Best Fit</span>
                <span class="cr-menu-key">B</span>
              </button>
              <button class="cr-menu-item" :class="{ 'is-active': fitMode === 'height' }" @click="fitMode = 'height'">
                <span class="cr-menu-check" :class="{ 'is-checked': fitMode === 'height' }">
                  <span v-if="fitMode === 'height'" class="mdi mdi-check" />
                </span>
                <span class="cr-menu-text">Fit to Height</span>
                <span class="cr-menu-key">H</span>
              </button>
              <button class="cr-menu-item" :class="{ 'is-active': fitMode === 'width' }" @click="fitMode = 'width'">
                <span class="cr-menu-check" :class="{ 'is-checked': fitMode === 'width' }">
                  <span v-if="fitMode === 'width'" class="mdi mdi-check" />
                </span>
                <span class="cr-menu-text">Fit to Width</span>
                <span class="cr-menu-key">W</span>
              </button>
              <hr class="cr-menu-sep" />
              <button class="cr-menu-item" :class="{ 'is-active': !showHeader }" @click="showHeader = !showHeader">
                <span class="cr-menu-check" :class="{ 'is-checked': !showHeader }">
                  <span v-if="!showHeader" class="mdi mdi-check" />
                </span>
                <span class="cr-menu-text">Hide header</span>
                <span class="cr-menu-key">P</span>
            </button>
      </div>

      <div v-if="extracting" class="cr-extracting-bar" :title="`Extracting ${loadingProgress.toFixed(0)}%`">
        <div class="cr-extracting-fill" :style="{ width: loadingProgress + '%' }" />
      </div>

      <div v-if="loading" class="cr-loading">
        <div class="cr-loading-spinner"><span class="mdi mdi-loading mdi-spin" /></div>
        <div class="cr-loading-text">{{ loadingText }}</div>
        <div class="cr-progress-track">
          <div class="cr-progress-bar" :style="{ width: loadingProgress + '%' }" />
        </div>
      </div>

      <div v-else-if="error" class="cr-error">
        <span class="mdi mdi-alert-circle-outline cr-error-icon" />
        <p>{{ error }}</p>
        <button class="cr-btn cr-btn-primary" @click="close">Close</button>
      </div>

      <div
        v-else
        class="cr-body"
        :class="{
          'cr-body--hide-header': !showHeader,
          'cr-body--strip-v': viewMode === 'strip-v',
          'cr-body--strip-h': viewMode === 'strip-h',
          'cr-body--double': viewMode === 'double',
        }"
        @click="onBodyClick"
        @touchstart.passive="onSwipeStart"
        @touchend.passive="onSwipeEnd"
        @mousedown="onSwipeStart"
        @mouseup="onSwipeEnd"
      >
        <template v-if="viewMode === 'single'">
          <div class="cr-single-wrap" :class="'cr-fit--' + fitMode">
            <img
              v-if="images[currentPage]"
              :src="images[currentPage]"
              class="cr-page-img"
              :style="{ transform: 'rotate(' + rotation + 'deg)' }"
              :alt="'Page ' + (currentPage + 1)"
              draggable="false"
              @click.stop="nextPage"
            />
            <div v-else class="cr-empty-page">
              <span class="mdi mdi-file-image-outline" />
              <p>Page could not be loaded</p>
            </div>
          </div>
        </template>

        <template v-else-if="viewMode === 'double'">
          <div class="cr-double-wrap" :class="'cr-fit--' + fitMode">
            <img
              v-if="images[currentPage]"
              :src="images[currentPage]"
              class="cr-page-img cr-page-left"
              :style="{ transform: 'rotate(' + rotation + 'deg)' }"
              :alt="'Page ' + (currentPage + 1)"
              draggable="false"
              @click.stop="prevPage"
            />
            <img
              v-if="images[currentPage + 1]"
              :src="images[currentPage + 1]"
              class="cr-page-img cr-page-right"
              :style="{ transform: 'rotate(' + rotation + 'deg)' }"
              :alt="'Page ' + (currentPage + 2)"
              draggable="false"
              @click.stop="nextPage"
            />
            <div v-if="!images[currentPage + 1]" class="cr-double-empty" @click.stop="nextPage">
              <span class="mdi mdi-chevron-right" />
            </div>
          </div>
        </template>

        <div v-else-if="viewMode === 'strip-v'" ref="stripWrapRef" class="cr-strip-v">
          <div
            v-for="(src, i) in images"
            :key="i"
            :ref="(el) => setStripRef(i, el)"
            class="cr-strip-page"
          >
            <div class="cr-strip-label">Page {{ i + 1 }}</div>
            <img :src="src" class="cr-strip-img" :style="{ transform: 'rotate(' + rotation + 'deg)' }" loading="lazy" draggable="false" />
          </div>
        </div>

        <div v-else-if="viewMode === 'strip-h'" ref="stripWrapRef" class="cr-strip-h" :class="'cr-fit--' + fitMode" @scroll="onStripScroll">
          <div
            v-for="(src, i) in images"
            :key="i"
            :ref="(el) => setStripRef(i, el)"
            class="cr-strip-h-page"
            @click="goToPage(i)"
          >
            <div class="cr-strip-label">{{ i + 1 }}</div>
            <img :src="src" class="cr-strip-h-img" :style="{ transform: 'rotate(' + rotation + 'deg)' }" loading="lazy" draggable="false" />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue";

const props = defineProps<{
  visible: boolean;
  filePath: string;
  fileName: string;
  initialPage?: number;
}>();

const emit = defineEmits<{
  close: [];
  pageChange: [page: number];
}>();

// ── State
const images = ref<string[]>([]);
const currentPage = ref(0);
const loading = ref(false);
const extracting = ref(false);
const loadingProgress = ref(0);
const loadingText = ref("");
const error = ref("");
const totalPages = computed(() => images.value.length);
const overlayRef = ref<HTMLDivElement | null>(null);

// ── View options
const viewMode = ref<"single" | "double" | "strip-v" | "strip-h">("single");
const fitMode = ref<"best" | "height" | "width">("best");
const rotation = ref(0);
const showHeader = ref(true);
const showViewMenu = ref(false);
const viewMenuBtnRef = ref<HTMLButtonElement | null>(null);
const stripWrapRef = ref<HTMLDivElement | null>(null);
const stripPageRefs = ref<HTMLElement[]>([]);

// ── Dropdown
const menuStyle = computed(() => {
  if (!viewMenuBtnRef.value) return {};
  const rect = viewMenuBtnRef.value.getBoundingClientRect();
  return {
    top: rect.bottom + "px",
    right: window.innerWidth - rect.right + "px",
  };
});

// ── Dropdown
function closeDropdown() { showViewMenu.value = false; }

function setStripRef(index: number, el: any) {
  if (el instanceof HTMLElement) stripPageRefs.value[index] = el;
}
function scrollToCurrentPage() {
  const el = stripPageRefs.value[currentPage.value];
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
}
function onStripScroll() {
  if (viewMode.value !== "strip-h") return;
  const wrap = stripWrapRef.value;
  if (!wrap) return;
  const cx = wrap.scrollLeft + wrap.clientWidth / 2;
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < stripPageRefs.value.length; i++) {
    const el = stripPageRefs.value[i];
    if (!el) continue;
    const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - cx);
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  if (best !== currentPage.value) currentPage.value = best;
}

// ── Swipe
let _swipeStartX = 0, _swipeStartY = 0, _swipeFired = false;

function onSwipeStart(e: TouchEvent | MouseEvent) {
  _swipeFired = false;
  if ("touches" in e) { _swipeStartX = e.touches[0].clientX; _swipeStartY = e.touches[0].clientY; }
  else { _swipeStartX = e.clientX; _swipeStartY = e.clientY; }
}

function onSwipeEnd(e: TouchEvent | MouseEvent) {
  let clientX: number, clientY: number;
  if ("changedTouches" in e) { clientX = e.changedTouches[0].clientX; clientY = e.changedTouches[0].clientY; }
  else { clientX = (e as MouseEvent).clientX; clientY = (e as MouseEvent).clientY; }
  const dx = clientX - _swipeStartX, dy = clientY - _swipeStartY;
  if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.5) {
    // Vertical swipe — toggle header
    _swipeFired = true;
    showHeader.value = dy < 0 ? false : true;
  } else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    _swipeFired = true;
    if (dx < 0) nextPage(); else prevPage();
  }
}

// ── Navigation
function prevPage() {
  if (currentPage.value <= 0) return;
  if (viewMode.value === "double") currentPage.value = Math.max(0, currentPage.value - 2);
  else currentPage.value--;
  if (viewMode.value === "strip-v" || viewMode.value === "strip-h") nextTick(() => scrollToCurrentPage());
}
function nextPage() {
  if (currentPage.value >= totalPages.value - 1) return;
  if (viewMode.value === "double" && currentPage.value < totalPages.value - 1) currentPage.value++;
  else currentPage.value++;
  if (viewMode.value === "strip-v" || viewMode.value === "strip-h") nextTick(() => scrollToCurrentPage());
}
function goToPage(n: number) {
  if (n >= 0 && n < totalPages.value) { currentPage.value = n; if (viewMode.value === "strip-v" || viewMode.value === "strip-h") nextTick(() => scrollToCurrentPage()); }
}
function onBodyClick(e: MouseEvent) {
  if (_swipeFired) return;
  if (viewMode.value === "single" || viewMode.value === "double") {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.3) prevPage();
    else if (x > rect.width * 0.7) nextPage();
  }
}

function rotateLeft() { rotation.value = (rotation.value - 90 + 360) % 360; showViewMenu.value = false; }
function rotateRight() { rotation.value = (rotation.value + 90) % 360; showViewMenu.value = false; }
function toggleFullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
  else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") prevPage();
  else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") nextPage();
  else if (e.key === "Home") goToPage(0);
  else if (e.key === "End") goToPage(totalPages.value - 1);
  else if (e.key === "f" || e.key === "F") toggleFullscreen();
  else if (e.key === "1") viewMode.value = "single";
  else if (e.key === "2") viewMode.value = "double";
  else if (e.key === "3") viewMode.value = "strip-v";
  else if (e.key === "4") viewMode.value = "strip-h";
  else if (e.key === "b" || e.key === "B") fitMode.value = "best";
  else if (e.key === "h" || e.key === "H") fitMode.value = "height";
  else if (e.key === "w" || e.key === "W") fitMode.value = "width";
  else if (e.key === "r" || e.key === "R") rotateRight();
  else if (e.key === "l" || e.key === "L") rotateLeft();
  else if (e.key === "p" || e.key === "P") showHeader.value = !showHeader.value;
}

function close() {
  _cancelled = true;
  for (const url of images.value) { if (url && url.startsWith("blob:")) URL.revokeObjectURL(url); }
  images.value = []; currentPage.value = 0; error.value = ""; extracting.value = false; showViewMenu.value = false;
  emit("close");
}

// ── Library
let _libsLoaded = false, _libsLoading = false;
const _libsCallbacks: Array<() => void> = [];
let _cancelled = false;

function waitForLibs(): Promise<void> {
  if (_libsLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    if (_libsLoading) _libsCallbacks.push(resolve);
    else { _libsLoading = true; _libsCallbacks.push(resolve); loadLibs(); }
  });
}

function loadLibs() {
  const script = document.createElement("script");
  script.src = "/lib/uncompress.js";
  script.onload = () => {
    (window as any).loadArchiveFormats(["rar", "zip"], () => {
      _libsLoaded = true; _libsLoading = false;
      for (const cb of _libsCallbacks) cb();
      _libsCallbacks.length = 0;
    });
  };
  script.onerror = () => { error.value = "Failed to load archive libraries"; loading.value = false; _libsLoading = false; };
  document.head.appendChild(script);
}

// ── Open file
async function openFile() {
  if (!props.filePath) return;
  _cancelled = false;
  loading.value = true; loadingProgress.value = 0; error.value = "";
  images.value = []; currentPage.value = 0;
  viewMode.value = "single"; fitMode.value = "best"; rotation.value = 0; showHeader.value = true;
  const ext = props.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") await openPdf();
  else await openArchive();
}

async function openArchive() {
  try {
    await waitForLibs();
    loadingText.value = "Downloading..."; loadingProgress.value = 5;
    const resp = await fetch(props.filePath, { credentials: "include" });
    if (!resp.ok) throw new Error("Failed to download: " + resp.status);
    const blob = await resp.blob();
    loadingText.value = "Opening archive..."; loadingProgress.value = 15;
    const file = new File([blob], props.fileName);
    await new Promise<void>((resolve, reject) => {
      (window as any).archiveOpenFile(file, null, (archive: any, err: any) => {
        if (err) return reject(err);
        if (!archive) return reject(new Error("Failed to open archive"));
        loadingText.value = "Extracting pages...";
        let entries = archive.entries.filter((e: any) => e.is_file);
        if (entries.length === 0) return reject(new Error("No files found"));
        // Sort by filename so pages appear in correct order as they load
        entries.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        // Pre-allocate so totalPages is accurate from the start
        images.value = new Array(entries.length).fill(null);
        if (props.initialPage) currentPage.value = Math.min(props.initialPage - 1, entries.length - 1);
        let processed = 0;
        let firstPageShown = false;
        entries.forEach((entry: any, index: number) => {
          entry.readData((data: ArrayBuffer | null) => {
            if (_cancelled) return;
            processed++;
            loadingProgress.value = 15 + (processed / entries.length) * 80;
            if (data) {
              const ext = entry.name.split(".").pop()?.toLowerCase() ?? "jpeg";
              const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
              const imgBlob = new Blob([data], { type: mime });
              images.value[index] = URL.createObjectURL(imgBlob);
              if (!firstPageShown) {
                firstPageShown = true;
                extracting.value = true;
                loading.value = false; // Show viewer as soon as first page is ready
              }
            }
            if (processed >= entries.length) {
              extracting.value = false;
              loadingProgress.value = 100;
              resolve();
            }
          });
        });
      });
    });
  } catch (e: any) { error.value = e?.message ?? "Failed to open archive"; loading.value = false; }
}

async function openPdf() {
  try {
    loadingText.value = "Downloading PDF..."; loadingProgress.value = 10;
    const resp = await fetch(props.filePath, { credentials: "include" });
    if (!resp.ok) throw new Error("Failed to download: " + resp.status);
    const buf = await resp.arrayBuffer();
    loadingText.value = "Loading PDF engine..."; loadingProgress.value = 30;
    const pdfjs = await loadPdfJs();
    loadingText.value = "Rendering pages..."; loadingProgress.value = 40;
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    // Pre-allocate so totalPages is accurate immediately
    images.value = new Array(pdf.numPages).fill(null);
    if (props.initialPage) currentPage.value = Math.min(props.initialPage - 1, pdf.numPages - 1);
    let firstPageShown = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      if (_cancelled) { pdf.destroy(); return; }
      loadingProgress.value = 40 + (i / pdf.numPages) * 55;
      loadingText.value = "Rendering page " + i + "/" + pdf.numPages + "...";
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      images.value[i - 1] = canvas.toDataURL("image/jpeg", 0.9);
      if (!firstPageShown) {
        firstPageShown = true;
        extracting.value = true;
        loading.value = false; // Show viewer as soon as first page is ready
      }
    }
    extracting.value = false; loadingProgress.value = 100;
    pdf.destroy();
  } catch (e: any) { error.value = e?.message ?? "Failed to open PDF"; loading.value = false; extracting.value = false; }
}

let _pdfJsPromise: Promise<any> | null = null;
function loadPdfJs(): Promise<any> {
  if ((window as any).pdfjsLib) return Promise.resolve((window as any).pdfjsLib);
  if (_pdfJsPromise) return _pdfJsPromise;
  _pdfJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => resolve((window as any).pdfjsLib);
    s.onerror = () => reject(new Error("Failed to load PDF.js"));
    document.head.appendChild(s);
  });
  return _pdfJsPromise;
}

watch(() => props.visible, (v) => { if (v) { nextTick(() => openFile()); nextTick(() => overlayRef.value?.focus()); } });
watch(currentPage, (p) => { if (images.value.length > 0) emit("pageChange", p + 1); });
</script>

<style scoped>
.cr-overlay { position: fixed; inset: 0; z-index: 100000; display: flex; flex-direction: column; background: #111; color: #eee; font-family: system-ui, -apple-system, sans-serif; outline: none; }
.cr-header { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.75rem; background: #1a1a1a; border-bottom: 1px solid #333; flex-shrink: 0; gap: 0.5rem; transition: max-height 0.2s, opacity 0.2s, padding 0.2s, border-width 0.2s; overflow: hidden; max-height: 50px; }
.cr-header-hidden { max-height: 0; padding-top: 0; padding-bottom: 0; opacity: 0; border-bottom-width: 0; pointer-events: none; }
.cr-header-left, .cr-header-center, .cr-header-right { display: flex; align-items: center; gap: 0.4rem; }
.cr-header-center { flex: 1; justify-content: center; }
.cr-title { font-size: 0.9rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
.cr-page-indicator { font-size: 0.85rem; color: #999; }

.cr-dropdown { position: relative; }
.cr-dropdown-menu { position: fixed; z-index: 100001; min-width: 220px; background: #222; border: 1px solid #444; border-radius: 6px; padding: 0.3rem 0; box-shadow: 0 4px 20px rgba(0,0,0,0.6); }
.cr-menu-item { display: flex; align-items: center; width: 100%; gap: 0.5rem; padding: 0.35rem 0.75rem; border: none; background: transparent; color: #ccc; font-size: 0.82rem; text-align: left; cursor: pointer; white-space: nowrap; }
.cr-menu-item:hover, .cr-menu-item.is-active:hover { background: #333; }
.cr-menu-item.is-active { background: #2a2a2a; }
.cr-menu-icon { width: 1.1rem; text-align: center; font-size: 1rem; flex-shrink: 0; }
.cr-menu-check { width: 1.1rem; height: 1.1rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cr-menu-check.is-checked { color: #4a90d9; }
.cr-menu-text { flex: 1; }
.cr-menu-key { color: #666; font-size: 0.75rem; font-family: monospace; }
.cr-menu-sep { border: none; border-top: 1px solid #333; margin: 0.25rem 0.5rem; }
.cr-menu-progress { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.75rem 0.5rem; }
.cr-menu-progress-track { flex: 1; height: 3px; }
.cr-menu-progress-text { font-size: 0.75rem; color: #888; min-width: 2.5rem; text-align: right; }

.cr-btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.75rem; border: 1px solid #444; border-radius: 4px; background: #222; color: #ddd; font-size: 0.8rem; cursor: pointer; transition: background 0.15s; }
.cr-btn:hover:not(:disabled) { background: #333; }
.cr-btn:disabled { opacity: 0.35; cursor: default; }
.cr-btn-icon { padding: 0.35rem; border: none; background: transparent; font-size: 1.1rem; }
.cr-btn-icon:hover { background: rgba(255,255,255,0.08); }
.cr-btn-primary { background: #4a90d9; border-color: #4a90d9; color: #fff; }
.cr-btn-primary:hover { background: #357abd; }

.cr-loading { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; }
.cr-loading-spinner { font-size: 2.5rem; color: #4a90d9; }
.cr-loading-text { font-size: 0.95rem; color: #aaa; }
.cr-progress-track { width: 280px; height: 4px; background: #333; border-radius: 2px; overflow: hidden; }
.cr-progress-bar { height: 100%; background: linear-gradient(90deg, #4a90d9, #67b1f0); transition: width 0.3s; border-radius: 2px; }

.cr-extracting-bar { height: 2px; background: #222; flex-shrink: 0; overflow: hidden; }
.cr-extracting-fill { height: 100%; background: linear-gradient(90deg, #4a90d9, #67b1f0); transition: width 0.3s; }

.cr-error { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; padding: 2rem; }
.cr-error-icon { font-size: 3rem; color: #e74c3c; }
.cr-error p { color: #ccc; font-size: 0.9rem; text-align: center; }

.cr-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; cursor: pointer; }
.cr-body--hide-header { cursor: none; }
.cr-body--strip-v, .cr-body--strip-h { cursor: auto; }

.cr-single-wrap { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.cr-page-img { max-width: 100%; max-height: 100%; object-fit: contain; user-select: none; -webkit-user-drag: none; }
.cr-fit--height .cr-page-img { max-width: none; height: 100%; width: auto; }
.cr-fit--width .cr-page-img { max-height: none; width: 100%; height: auto; }
.cr-empty-page { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; color: #666; font-size: 2rem; }

.cr-double-wrap { flex: 1; display: flex; overflow: hidden; }
.cr-double-wrap .cr-page-img { width: 50%; height: 100%; object-fit: contain; cursor: pointer; }
.cr-double-wrap.cr-fit--height .cr-page-img { object-fit: cover; }
.cr-double-wrap.cr-fit--width .cr-page-img { object-fit: fill; }
.cr-page-left { border-right: 1px solid #222; }
.cr-double-empty { width: 50%; display: flex; align-items: center; justify-content: center; color: #444; font-size: 3rem; cursor: pointer; }

.cr-strip-v { flex: 1; overflow-y: auto; display: flex; flex-direction: column; align-items: center; gap: 2rem; padding: 1.5rem 1rem 3rem; }
.cr-strip-page { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; max-width: 100%; }
.cr-strip-label { font-size: 0.8rem; color: #666; font-weight: 500; }
.cr-strip-img { max-width: 100%; height: auto; border-radius: 2px; box-shadow: 0 2px 12px rgba(0,0,0,0.5); user-select: none; -webkit-user-drag: none; }

.cr-strip-h { flex: 1; overflow-x: auto; display: flex; gap: 1rem; padding: 1rem 1.5rem; align-items: flex-start; }
.cr-strip-h-page { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; flex-shrink: 0; }
.cr-strip-h-img { height: 85vh; width: auto; border-radius: 2px; box-shadow: 0 2px 12px rgba(0,0,0,0.5); user-select: none; -webkit-user-drag: none; }
.cr-strip-h.cr-fit--height { align-items: stretch; }
.cr-strip-h.cr-fit--height .cr-strip-h-page { height: auto; justify-content: center; }
.cr-strip-h.cr-fit--height .cr-strip-h-img { height: calc(100vh - 4rem); width: auto; }
.cr-strip-h.cr-fit--width .cr-strip-h-img { height: auto; max-height: 85vh; width: auto; max-width: 90vw; }
.cr-strip-h.cr-fit--best .cr-strip-h-img { height: 85vh; width: auto; max-width: 100vw; }

@media (max-width: 600px) {
  .cr-title { max-width: 120px; font-size: 0.8rem; }
  .cr-btn { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
}
</style>
