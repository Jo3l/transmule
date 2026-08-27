<template>
  <SDialog
    :model-value="modelValue"
    :title="mediaType === 'series' ? $t('planner.addSeries') : $t('planner.addMovie')"
    width="760px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <!-- Búsqueda -->
    <div class="planner-search-bar mb-2">
      <SInput
        v-model="query"
        size="md"
        :placeholder="$t('planner.searchPlaceholder')"
        @keyup.enter="doSearch"
      >
        <template #prefix>
          <span class="mdi mdi-magnify" />
        </template>
      </SInput>
      <SButton variant="primary" :loading="isSearching" @click="doSearch">
        {{ $t("planner.search") }}
      </SButton>
    </div>
    <p class="has-text-grey is-size-7 mb-3">{{ $t("planner.searchHint") }}</p>

    <!-- Advanced Settings (colapsable, como MediaManager) -->
    <div class="planner-advanced mb-3">
      <button class="planner-advanced-toggle" @click="showAdvanced = !showAdvanced">
        <span class="mdi" :class="showAdvanced ? 'mdi-chevron-down' : 'mdi-chevron-right'" />
        {{ $t("planner.advancedSettings") }}
      </button>
      <div v-show="showAdvanced" class="planner-advanced-body">
        <SFormItem :label="$t('planner.minQuality')">
          <SSelect v-model="minQuality">
            <option value="uhd">4K (Ultra HD)</option>
            <option value="fullhd">1080p (Full HD)</option>
            <option value="hd">720p (HD)</option>
            <option value="sd">480p (SD)</option>
          </SSelect>
        </SFormItem>
        <SFormItem :label="$t('planner.maxSize')">
          <SSelect v-model="maxSize">
            <option value="">{{ $t("planner.sizeNoLimit") }}</option>
            <option value="256">~256 MB</option>
            <option value="600">~600 MB</option>
            <option value="1024">~1 GB</option>
          </SSelect>
        </SFormItem>
        <SFormItem :label="$t('planner.rootFolder')">
          <div class="planner-folder-row">
            <SInput v-model="rootFolder" class="planner-folder-input" />
            <SButton
              variant="default"
              icon="mdi-folder-open"
              :title="$t('planner.chooseFolder')"
              @click="openFolderPicker"
            />
          </div>
        </SFormItem>
        <div class="planner-post-tasks">
          <p class="planner-post-tasks-title">{{ $t("planner.postDownloadTasks") }}</p>
          <div class="planner-post-tasks-body">
            <SFormItem :label="$t('planner.smartRename')">
              <SSwitch v-model="smartRename" />
            </SFormItem>
            <SFormItem :label="$t('planner.plexScan')">
              <SSwitch v-model="plexScan" />
            </SFormItem>
          </div>
        </div>
      </div>
    </div>

    <SAlert v-if="errorMsg" variant="error" size="sm" class="mb-3">{{ errorMsg }}</SAlert>

    <!-- Confirmación de idioma (series): cargar traducciones TVDB -->
    <div v-if="confirming" class="planner-confirm">
      <p class="title is-6 mb-1">
        {{ rName(confirming.result) }}
        <span v-if="rYear(confirming.result)" class="has-text-grey-light is-size-7">({{ rYear(confirming.result) }})</span>
      </p>
      <p class="has-text-grey is-size-7 mb-3">{{ $t("planner.chooseLanguage") }}</p>
      <p v-if="confirming.loading" class="has-text-grey is-size-7 py-2">{{ $t("planner.loadingLanguages") }}</p>
      <template v-else>
        <SFormItem :label="$t('planner.language')">
          <SSelect v-model="confirming.selectedLanguage">
            <option value="">{{ $t("planner.languageAny") }}</option>
            <option v-for="lang in confirming.languages" :key="lang.code" :value="lang.code">
              {{ lang.name }} ({{ lang.code }})
            </option>
          </SSelect>
        </SFormItem>
        <div class="planner-confirm-actions">
          <SButton
            variant="primary"
            :loading="addingId === confirming.result.id"
            @click="confirmAdd"
          >
            {{ $t("planner.add") }}
          </SButton>
          <SButton variant="default" @click="confirming = null">
            {{ $t("planner.cancel") }}
          </SButton>
        </div>
      </template>
    </div>

    <!-- Objetivo directo (click en calendario): sin buscador, card única -->
    <div v-else-if="targetResult" class="planner-target">
      <div class="planner-card planner-card--target">
        <div class="planner-card-media">
          <figure class="image is-2by3">
            <img v-if="rPoster(targetResult)" :src="rPoster(targetResult)" :alt="rName(targetResult)" />
            <div v-else class="planner-card-fallback">
              <span
                class="mdi"
                :class="props.mediaType === 'series' ? 'mdi-television-play' : 'mdi-movie-open'"
              />
            </div>
          </figure>
        </div>
        <div>
          <p class="title is-6 mb-1">
            {{ rName(targetResult) }}
            <span v-if="rYear(targetResult)" class="has-text-grey-light is-size-7">({{ rYear(targetResult) }})</span>
          </p>
          <p class="subtitle is-7 mb-2 has-text-grey planner-overview">
            {{ rOverview(targetResult) || $t("planner.noOverview") }}
          </p>
          <div class="planner-card-actions">
            <SButton
              variant="primary"
              size="sm"
              icon="mdi-plus"
              block
              :loading="addingId === targetResult.id"
              @click="addMedia(targetResult)"
            >
              {{ $t("planner.add") }}
            </SButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Resultados: scroll interno, grid compacto -->
    <div v-else class="planner-results">
      <div v-if="results.length === 0 && !isSearching" class="has-text-centered py-5">
        <p><span class="mdi mdi-magnify-close is-size-2 has-text-grey-light" /></p>
        <p class="has-text-grey is-size-7">{{ $t("planner.searchEmpty") }}</p>
      </div>
      <div v-else class="columns is-multiline">
        <div
          v-for="r in results"
          :key="`${r.id}-${rName(r)}`"
          class="column"
        >
          <div class="planner-card">
            <div class="planner-card-media">
              <figure class="image is-2by3">
                <img v-if="rPoster(r)" :src="rPoster(r)" :alt="rName(r)" loading="lazy" />
                <div v-else class="planner-card-fallback">
                  <span
                    class="mdi"
                    :class="mediaType === 'series' ? 'mdi-television-play' : 'mdi-movie-open'"
                  />
                </div>
              </figure>
            </div>
            <div>
              <p class="title is-6 mb-1">
                {{ rName(r) }}
                <span v-if="rYear(r)" class="has-text-grey-light is-size-7">({{ rYear(r) }})</span>
              </p>
              <p class="subtitle is-7 mb-2 has-text-grey planner-overview">
                {{ rOverview(r) || $t("planner.noOverview") }}
              </p>
              <div class="planner-card-actions">
                <SButton
                  v-if="!isAdded(r)"
                  variant="primary"
                  size="sm"
                  icon="mdi-plus"
                  block
                  :loading="addingId === r.id"
                  @click="addMedia(r)"
                >
                  {{ $t("planner.add") }}
                </SButton>
                <SButton
                  v-else
                  variant="success"
                  size="sm"
                  icon="mdi-check"
                  block
                  @click="emit('added', existingId(r))"
                >
                  {{ $t("planner.addedAlready") }}
                </SButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SDialog>

  <!-- Selector de carpeta de destino (mismo componente que el file manager:
       incluye 'home' (descargas) y las carpetas SMB montadas) -->
  <SDialog v-model="showFolderPicker" :title="$t('planner.chooseFolder')" width="480px">
    <FolderPicker v-model="pickerPath" :key="'fp-planner-' + showFolderPicker" />
    <template #footer>
      <div class="flex-end gap-sm">
        <SButton @click="showFolderPicker = false">{{ $t("planner.cancel") }}</SButton>
        <SButton variant="primary" @click="confirmFolder">
          {{ $t("planner.useFolder") }}
        </SButton>
      </div>
    </template>
  </SDialog>
</template>

<script setup lang="ts">
import type { TvdbSearchResult, TmdbSearchResult } from "~/composables/usePlanner";

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    mediaType?: "series" | "movie";
    /** Evento del calendario (discover) → se muestra como objetivo directo sin buscador */
    initialResult?: any;
  }>(),
  { modelValue: false, mediaType: "series", initialResult: null },
);

const emit = defineEmits<{
  "update:modelValue": [val: boolean];
  /** Se emite con el id de la suscripción cuando el usuario abre una ya añadida */
  added: [subId: number];
}>();

const { t } = useI18n();
const { searchTmdb, searchSeries, createSubscription, refreshSubscription, listSubscriptions, getTvdbTranslations, getTmdbTranslations } = usePlanner();
const { showToast } = useApi();

const query = ref("");
const isSearching = ref(false);
const errorMsg = ref("");
const results = ref<(TvdbSearchResult | TmdbSearchResult)[]>([]);
const seriesSource = ref<"tvdb" | "tmdb">("tvdb");

const showAdvanced = ref(true);
const minQuality = ref("fullhd");
const maxSize = ref(""); // "" = sin límite
// Carpeta por defecto = raíz de descargas ("downloads", visible y estable);
// nunca "/" ni "home" (jerga interna del virtual FS).
const rootFolder = ref("downloads");
const smartRename = ref(false);
const plexScan = ref(false);

// ── Selector de carpeta de destino (FolderPicker, como el file manager) ────
const showFolderPicker = ref(false);
const pickerPath = ref("");

function openFolderPicker() {
  let cur = rootFolder.value.replace(/^\/+/, "").replace(/\/+$/, "");
  // Abrir el picker en jerga interna del virtual FS: "downloads" (default) y
  // valores antiguos ("", "/", "home", "home/x") → "home[/x]". Así la fila
  // "Descargas" queda seleccionada y el listado arranca en la raíz.
  if (!cur || cur === "home" || cur === "downloads") cur = "home";
  else cur = cur.replace(/^downloads\//, "home/");
  pickerPath.value = cur;
  showFolderPicker.value = true;
}

function confirmFolder() {
  let p = pickerPath.value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  // La raíz de descargas se representa como "downloads" (visible y estable);
  // "downloads" (por defecto) y "home" (jerga interna) se normalizan a ella.
  if (!p || p === "home" || p === "downloads") p = "downloads";
  else if (p.startsWith("home/")) p = "downloads/" + p.slice(5);
  rootFolder.value = p;
  showFolderPicker.value = false;
}

const addingId = ref<number | null>(null);
const existing = ref<Map<number, number>>(new Map()); // externalId → subId

const confirming = ref<null | {
  result: TvdbSearchResult | TmdbSearchResult;
  languages: { code: string; name: string }[];
  selectedLanguage: string;
  loading: boolean;
}>(null);

// ── Acceso genérico a campos según mediaType ────────────────────────────────

function rName(r: TvdbSearchResult | TmdbSearchResult): string {
  return "name" in r ? r.name : r.title;
}
function rPoster(r: TvdbSearchResult | TmdbSearchResult): string | undefined {
  return ("image_url" in r ? r.image_url : r.poster_url) ?? undefined;
}
function rYear(r: TvdbSearchResult | TmdbSearchResult): string | null {
  if ("year" in r && r.year) return r.year;
  if ("release_date" in r && r.release_date) return r.release_date.slice(0, 4);
  return null;
}
function rOverview(r: TvdbSearchResult | TmdbSearchResult): string | null {
  return r.overview;
}

/**
 * Normaliza el initialResult (evento del calendario) a shape de búsqueda:
 * { id, title/name, year, image_url/poster_url, overview }
 */
const targetResult = computed<TvdbSearchResult | TmdbSearchResult | null>(() => {
  const ir = props.initialResult;
  if (!ir) return null;

  const year = ir.date ? ir.date.slice(0, 4) : null;
  const base = {
    id: ir.external_id ?? ir.id,
    year,
    poster_url: ir.poster_url ?? null,
    image_url: ir.poster_url ?? null,
    overview: ir.overview ?? null,
    vote_average: ir.vote_average ?? null,
  };
  if (props.mediaType === "series") {
    return { ...base, name: ir.title ?? "", first_air_time: ir.date ?? null, status: null } as any;
  }
  return { ...base, title: ir.title ?? "", release_date: ir.date ?? null } as any;
});

// ── Carga de suscripciones existentes ───────────────────────────────────────

async function loadExisting() {
  try {
    const subs = await listSubscriptions({ type: props.mediaType });
    const m = new Map<number, number>();
    for (const s of subs) {
      const ext = props.mediaType === "series" ? s.tvdb_id : s.tmdb_id;
      if (ext) m.set(ext, s.id);
    }
    existing.value = m;
  } catch {
    // silencioso
  }
}

function isAdded(r: TvdbSearchResult | TmdbSearchResult): boolean {
  return existing.value.has(r.id);
}
function existingId(r: TvdbSearchResult | TmdbSearchResult): number {
  return existing.value.get(r.id) ?? 0;
}

// ── Búsqueda ────────────────────────────────────────────────────────────────

async function doSearch() {
  const q = query.value.trim();
  if (!q) return;
  isSearching.value = true;
  errorMsg.value = "";
  try {
    if (props.mediaType === "series") {
      const res = await searchSeries(q);
      seriesSource.value = res.source;
      results.value = res.results;
    } else {
      results.value = await searchTmdb(q, { type: "movie" });
    }
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    isSearching.value = false;
  }
}

// ── Añadir ──────────────────────────────────────────────────────────────────

/** ¿La serie que se añade usa tvdb_id (vs tmdb_id)? */
function seriesUsesTvdb(): boolean {
  const ir = props.initialResult;
  if (ir) return ir.source === "tvmaze";
  return seriesSource.value === "tvdb";
}

async function addMedia(r: TvdbSearchResult | TmdbSearchResult) {
  errorMsg.value = "";
  if (props.mediaType === "series" && seriesUsesTvdb()) {
    // Pedir idioma (series TVDB): cargar las traducciones de TVDB.
    confirming.value = { result: r, languages: [], selectedLanguage: "", loading: true };
    try {
      confirming.value.languages = await getTvdbTranslations(r.id);
    } catch {
      confirming.value.languages = [];
    }
    confirming.value.loading = false;
  } else if (props.mediaType === "movie") {
    // Pedir idioma (películas): cargar las traducciones de TMDB.
    confirming.value = { result: r, languages: [], selectedLanguage: "", loading: true };
    try {
      confirming.value.languages = await getTmdbTranslations(r.id);
    } catch {
      confirming.value.languages = [];
    }
    confirming.value.loading = false;
  } else {
    await doCreate(r, null);
  }
}

async function confirmAdd() {
  const c = confirming.value;
  if (!c) return;
  await doCreate(c.result, c.selectedLanguage || null);
  confirming.value = null;
}

async function doCreate(r: TvdbSearchResult | TmdbSearchResult, language: string | null) {
  addingId.value = r.id;
  errorMsg.value = "";
  try {
    // Serie desde calendario: TVmaze → external_id es tvdb_id; TMDB → tmdb_id
    const useTvdbId = props.mediaType === "series" && seriesUsesTvdb();
    const body =
      props.mediaType === "series"
        ? {
            type: "series",
            title: rName(r),
            ...(useTvdbId ? { tvdb_id: r.id } : { tmdb_id: r.id }),
            year: rYear(r) ? Number(rYear(r)) : null,
            poster_url: rPoster(r),
            overview: rOverview(r),
            min_quality: minQuality.value,
            max_size_mb: maxSize.value ? Number(maxSize.value) : null,
            root_folder: rootFolder.value,
            smart_rename: smartRename.value,
            plex_scan: plexScan.value,
            monitored: true,
            search_services_json: JSON.stringify(["direct-plugin", "slskd", "amule"]),
            language,
          }
        : {
            type: "movie",
            title: rName(r),
            tmdb_id: r.id,
            year: rYear(r) ? Number(rYear(r)) : null,
            poster_url: rPoster(r),
            overview: rOverview(r),
            min_quality: minQuality.value,
            max_size_mb: maxSize.value ? Number(maxSize.value) : null,
            root_folder: rootFolder.value,
            smart_rename: smartRename.value,
            plex_scan: plexScan.value,
            monitored: true,
            search_services_json: JSON.stringify(["direct-plugin", "slskd", "amule"]),
            language,
          };

    const sub = await createSubscription(body);
    await refreshSubscription(sub.id);
    showToast(t("planner.added"), "success", 3000);
    existing.value.set(r.id, sub.id);
    emit("added", sub.id);
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    addingId.value = null;
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      // Reset por apertura
      query.value = "";
      results.value = [];
      errorMsg.value = "";
      confirming.value = null;
      loadExisting();
    }
  },
);
</script>

<style scoped>
.planner-folder-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.planner-folder-input {
  flex: 1;
  min-width: 0;
}
.planner-search-bar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.planner-search-bar .s-input-wrap {
  flex: 1;
}
.planner-advanced {
  border: 1px solid var(--s-border, #2a2a4a);
  border-radius: 8px;
  overflow: hidden;
}
.planner-advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.85rem;
  color: var(--s-text, #d0d0f0);
}
.planner-advanced-toggle:hover {
  background: var(--s-bg-hover, #1a1a30);
}
.planner-advanced-body {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--s-border, #2a2a4a);
}
.planner-post-tasks {
  grid-column: 1 / -1;
  border-top: 1px solid var(--s-border, #2a2a4a);
  padding-top: 12px;
  margin-top: 6px;
}
.planner-post-tasks-title {
  margin: 0 0 10px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--s-text-secondary, #999);
}
.planner-post-tasks-body {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.planner-results {
  max-height: 55vh;
  overflow-y: auto;
  padding-right: 4px;
}
.planner-card {
  display: flex;
  flex-direction: column;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  overflow: hidden;
  height: 100%;
}
.planner-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}
.planner-card-media {
  padding: 8px;
  background: var(--s-bg-hover, #1a1a30);
}
figure.image.is-2by3 {
  border-radius: 4px;
  overflow: hidden;
}
figure.image.is-2by3 img {
  max-width: 12rem;
  width: auto;
  height: 100%;
  object-fit: contain;
}
.planner-card-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--s-bg-hover, #1a1a30);
  color: var(--s-text-muted, #999);
  font-size: 2rem;
}
.planner-overview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.4em;
}
.planner-card-actions {
  margin-top: auto;
}
.planner-confirm {
  border: 1px solid var(--s-border, #2a2a4a);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 12px;
}
.planner-confirm-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  align-items: center;
}
</style>
