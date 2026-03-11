<template>
  <nav id="comp-app-sidebar" class="app-sidebar" :class="{ 'is-open': open }">
    <canvas v-if="canvasEnabled" ref="sidebarCanvas" class="sidebar-scene" aria-hidden="true" />
    <div v-if="canvasEnabled" class="sidebar-scene-fade" aria-hidden="true" />
    <div class="sidebar-content">
      <div class="sidebar-brand">
        <img src="~/assets/logo/logo64.png" alt="TransMule" class="sidebar-logo" />
        <div class="sidebar-brand-text">
          {{ $t("app.title") }}
          <span class="sidebar-version">v{{ APP_VERSION }}</span>
        </div>
      </div>
      <div class="menu">
        <ul class="menu-list">
          <li>
            <NuxtLink to="/" @click="$emit('close')">
              <span class="mdi mdi-download"></span> {{ $t("nav.downloads") }}
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/uploads" @click="$emit('close')">
              <span class="mdi mdi-upload"></span> {{ $t("nav.uploads") }}
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/files" @click="$emit('close')">
              <span class="mdi mdi-folder-multiple"></span> {{ $t("nav.files") }}
            </NuxtLink>
          </li>
          <li>
            <NuxtLink to="/settings" @click="$emit('close')">
              <span class="mdi mdi-cog"></span> {{ $t("nav.settings") }}
            </NuxtLink>
          </li>
        </ul>

        <!-- Dynamic media-type sections (one per unique provider mediaType) -->
        <div
          v-for="group in mediaGroups"
          :key="group.type"
          class="sidebar-section"
          :class="{ 'is-expanded': isSectionOpen(group.type) }"
        >
          <a class="sidebar-section-header" @click="toggleSection(group.type)">
            <span class="mdi" :class="mediaIcon(group.type)"></span>
            {{ mediaLabel(group.type) }}
            <span
              class="mdi sidebar-section-chevron"
              :class="isSectionOpen(group.type) ? 'mdi-chevron-down' : 'mdi-chevron-right'"
            />
          </a>
          <ul v-show="isSectionOpen(group.type)" class="menu-list sidebar-section-list">
            <li v-for="p in group.list" :key="p.id">
              <NuxtLink :to="`/media/${group.type}/${p.id}`" @click="$emit('close')">
                <span class="mdi" :class="p.icon"></span> {{ p.name }}
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- aMule collapsible section -->
        <div
          class="sidebar-section"
          :class="{ 'is-expanded': amuleOpen, 'is-disabled': amuleDisabled }"
        >
          <a class="sidebar-section-header" @click="!amuleDisabled && (amuleOpen = !amuleOpen)">
            <span class="mdi mdi-server-network"></span>
            {{ $t("nav.amule") }}
            <span v-if="amuleDisabled" class="sidebar-section-badge">{{ $t("nav.disabled") }}</span>
            <span
              v-else
              class="mdi sidebar-section-chevron"
              :class="amuleOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'"
            />
          </a>
          <ul v-show="amuleOpen && !amuleDisabled" class="menu-list sidebar-section-list">
            <li>
              <NuxtLink to="/amule/search" @click="$emit('close')">
                <span class="mdi mdi-magnify"></span> {{ $t("nav.search") }}
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/amule/servers" @click="$emit('close')">
                <span class="mdi mdi-server"></span> {{ $t("nav.servers") }}
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/amule/shared" @click="$emit('close')">
                <span class="mdi mdi-folder-network"></span>
                {{ $t("nav.sharedFiles") }}
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/amule/stats" @click="$emit('close')">
                <span class="mdi mdi-chart-bar"></span> {{ $t("nav.statistics") }}
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/amule/kad" @click="$emit('close')">
                <span class="mdi mdi-wan"></span> {{ $t("nav.kad") }}
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/amule/log" @click="$emit('close')">
                <span class="mdi mdi-text-box-outline"></span> {{ $t("nav.log") }}
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/amule/settings" @click="$emit('close')">
                <span class="mdi mdi-cog-outline"></span>
                {{ $t("nav.amuleSettings") }}
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Transmission collapsible section -->
        <div
          class="sidebar-section"
          :class="{ 'is-expanded': transmissionOpen, 'is-disabled': transmissionDisabled }"
        >
          <a
            class="sidebar-section-header"
            @click="!transmissionDisabled && (transmissionOpen = !transmissionOpen)"
          >
            <span class="mdi mdi-magnet"></span>
            {{ $t("nav.transmission") }}
            <span v-if="transmissionDisabled" class="sidebar-section-badge">{{
              $t("nav.disabled")
            }}</span>
            <span
              v-else
              class="mdi sidebar-section-chevron"
              :class="transmissionOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'"
            />
          </a>
          <ul
            v-show="transmissionOpen && !transmissionDisabled"
            class="menu-list sidebar-section-list"
          >
            <li>
              <NuxtLink to="/transmission/search" @click="$emit('close')">
                <span class="mdi mdi-magnify"></span>
                {{ $t("nav.torrentSearch") }}
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/transmission/stats" @click="$emit('close')">
                <span class="mdi mdi-chart-line"></span>
                {{ $t("nav.statistics") }}
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/transmission/settings" @click="$emit('close')">
                <span class="mdi mdi-cog-outline"></span>
                {{ $t("nav.transmissionSettings") }}
              </NuxtLink>
            </li>
          </ul>
        </div>
        <!-- pyLoad collapsible section -->
        <div
          class="sidebar-section"
          :class="{ 'is-expanded': pyloadOpen, 'is-disabled': pyloadDisabled }"
        >
          <a class="sidebar-section-header" @click="!pyloadDisabled && (pyloadOpen = !pyloadOpen)">
            <span class="mdi mdi-cloud-download"></span>
            {{ $t("nav.pyload") }}
            <span v-if="pyloadDisabled" class="sidebar-section-badge">{{
              $t("nav.disabled")
            }}</span>
            <span
              v-else
              class="mdi sidebar-section-chevron"
              :class="pyloadOpen ? 'mdi-chevron-down' : 'mdi-chevron-right'"
            />
          </a>
          <ul v-show="pyloadOpen && !pyloadDisabled" class="menu-list sidebar-section-list">
            <li>
              <NuxtLink to="/pyload" @click="$emit('close')">
                <span class="mdi mdi-download-multiple"></span>
                {{ $t("nav.pyloadDownloads") }}
              </NuxtLink>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { APP_VERSION } from "~/utils/constants";
import type { ProviderMeta } from "~/composables/useProviders";

defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();

const sidebarCanvas = ref<HTMLCanvasElement | null>(null);
let destroyScene: (() => void) | null = null;
let sceneInit: ((canvas: HTMLCanvasElement) => (() => void) | null) | null = null;
let themeTimer: ReturnType<typeof setTimeout> | null = null;

const { canvasEnabled } = useTheme();

async function resolveSceneInit(): Promise<(canvas: HTMLCanvasElement) => (() => void) | null> {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme === "matrix") {
    const { init } = await import("~/assets/scenes/scene-matrix.js");
    return init;
  }
  const { init } = await import("~/assets/scenes/scene.js");
  return init;
}

function reinitScene() {
  if (themeTimer) clearTimeout(themeTimer);
  themeTimer = setTimeout(async () => {
    if (!sidebarCanvas.value) return;
    destroyScene?.();
    sceneInit = await resolveSceneInit();
    if (sceneInit && sidebarCanvas.value) destroyScene = sceneInit(sidebarCanvas.value);
  }, 1000);
}

watch(canvasEnabled, async (enabled) => {
  if (enabled) {
    await nextTick();
    if (!sidebarCanvas.value) return;
    sceneInit = await resolveSceneInit();
    if (sceneInit) destroyScene = sceneInit(sidebarCanvas.value);
  } else {
    destroyScene?.();
    destroyScene = null;
  }
});

onUnmounted(() => {
  if (themeTimer) clearTimeout(themeTimer);
  window.removeEventListener("app-theme-change", reinitScene);
  destroyScene?.();
});

const sectionsOpen = ref<Record<string, boolean>>({});
const amuleOpen = ref(true);
const transmissionOpen = ref(true);
const pyloadOpen = ref(true);

const { services, loaded } = useServices();

// Provider-driven sidebar
const { loadProviders, providers } = useProviders();

// Group enabled providers by mediaType, preserving insertion order
const mediaGroups = computed(() => {
  const groups = new Map<string, ProviderMeta[]>();
  for (const p of (providers.value ?? []).filter((p) => p.enabled)) {
    if (!groups.has(p.mediaType)) groups.set(p.mediaType, []);
    groups.get(p.mediaType)!.push(p);
  }
  return [...groups.entries()].map(([type, list]) => ({ type, list }));
});

const MEDIA_ICONS: Record<string, string> = {
  movies: "mdi-movie-open",
  shows: "mdi-television-play",
};

function mediaIcon(type: string): string {
  return MEDIA_ICONS[type] ?? "mdi-package-variant-closed";
}

function mediaLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function isSectionOpen(type: string): boolean {
  return sectionsOpen.value[type] !== false;
}

function toggleSection(type: string) {
  sectionsOpen.value = { ...sectionsOpen.value, [type]: !isSectionOpen(type) };
}

onMounted(async () => {
  if (!canvasEnabled.value || !sidebarCanvas.value) {
    // no canvas init needed
  } else {
    sceneInit = await resolveSceneInit();
    destroyScene = sceneInit(sidebarCanvas.value);
  }
  window.addEventListener("app-theme-change", reinitScene);

  // Load providers for sidebar
  try {
    await loadProviders();
  } catch {
    // Fallback: show nothing, user hasn't logged in yet
  }
});

// A section is disabled only once we have data and the service is not running.
// While loading (loaded=false) or for non-admin users (services=null), show all.
const amuleDisabled = computed(
  () => loaded.value && services.value !== null && !services.value.amule.running,
);
const transmissionDisabled = computed(
  () => loaded.value && services.value !== null && !services.value.transmission.running,
);
const pyloadDisabled = computed(
  () => loaded.value && services.value !== null && !services.value.pyload.running,
);
</script>
