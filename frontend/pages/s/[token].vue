<template>
  <div class="share-page">
    <div v-if="busy && !meta" class="share-page__card share-page__card--center">
      <span class="mdi mdi-loading mdi-spin share-page__icon" />
      <p>{{ $t("share.public.loading") }}</p>
    </div>

    <div v-else-if="fatal" class="share-page__card share-page__card--center">
      <span class="mdi mdi-link-variant-off share-page__icon share-page__icon--muted" />
      <p>{{ fatal }}</p>
    </div>

    <div v-else-if="meta" class="share-page__card">
      <header class="share-page__head">
        <h1 class="share-page__title">{{ meta.label }}</h1>
        <p class="share-page__sub">
          <span v-if="meta.kind === 'folder'" class="mdi mdi-folder-outline mr-1" />
          <span v-else-if="meta.kind === 'selection'" class="mdi mdi-file-multiple-outline mr-1" />
          <span v-else class="mdi mdi-file-outline mr-1" />
          {{ $t("share.public.expiresAt") }} {{ expiresLabel }}
        </p>
      </header>

      <!-- Code gate -->
      <form v-if="!ticket" class="share-page__gate" @submit.prevent="submitCode">
        <p class="share-page__hint">{{ $t("share.public.enterCode") }}</p>
        <input
          v-model="codeInput"
          class="share-page__code"
          inputmode="text"
          autocomplete="one-time-code"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="8"
          :placeholder="$t('share.public.codePlaceholder')"
          @input="onCodeInput"
        />
        <p v-if="error" class="share-page__error">{{ error }}</p>
        <SButton nativeType="submit" variant="primary" :loading="busy">
          {{ $t("share.public.open") }}
        </SButton>
      </form>

      <template v-else>
        <!-- Single file -->
        <div v-if="singleFile" class="share-page__single">
          <span class="mdi mdi-file-outline share-page__file-icon" />
          <a class="share-page__download" :href="downloadHref(singleFile.path)" download>
            <span class="mdi mdi-download" /> {{ $t("share.public.download") }}
          </a>
        </div>

        <template v-else>
          <nav class="share-page__crumbs">
            <button type="button" class="share-page__crumb" @click="goRoot()">
              <span class="mdi mdi-home-outline" />
            </button>
            <template v-for="(crumb, index) in crumbs" :key="crumb + index">
              <span class="share-page__crumb-sep">/</span>
              <button type="button" class="share-page__crumb" @click="goTo(index)">
                {{ crumb }}
              </button>
            </template>
          </nav>

          <ul v-if="entries.length" class="share-page__list">
            <li v-for="entry in entries" :key="entry.name" class="share-page__item">
              <button
                v-if="entry.type === 'dir'"
                type="button"
                class="share-page__row"
                @click="enter(entry.name)"
              >
                <span class="mdi mdi-folder share-page__row-icon" />
                <span class="share-page__row-name">{{ entry.name }}</span>
                <span class="mdi mdi-chevron-right share-page__row-chevron" />
              </button>
              <a
                v-else
                class="share-page__row"
                :href="downloadHref(joinPath(entry.name))"
                download
              >
                <span class="mdi mdi-file-outline share-page__row-icon" />
                <span class="share-page__row-name">{{ entry.name }}</span>
                <span class="share-page__row-size">{{ formatShareSize(entry.size) }}</span>
                <span class="mdi mdi-download share-page__row-chevron" />
              </a>
            </li>
          </ul>
          <p v-else-if="!busy" class="share-page__hint">{{ $t("share.public.empty") }}</p>

          <p v-if="error" class="share-page__error">{{ error }}</p>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "share" });

import type { ShareEntry, ShareMeta, ShareRoot } from "~/composables/useSharePublic";

const route = useRoute();
const { t } = useI18n();
const sharePublic = useSharePublic();

const shareRef = String(route.params.token ?? "");

const meta = ref<ShareMeta | null>(null);
const ticket = ref("");
const roots = ref<ShareRoot[]>([]);
const currentPath = ref("");
const entries = ref<ShareEntry[]>([]);
const showingRoots = ref(false);

const busy = ref(false);
const fatal = ref("");
const error = ref("");
const codeInput = ref("");

const singleFile = computed(() =>
  roots.value.length === 1 && roots.value[0]?.type === "file" ? roots.value[0] : null,
);

const activeRoot = computed(
  () => roots.value.find((root) => root.type === "dir" && isWithin(root.path, currentPath.value)) ?? null,
);

const crumbs = computed(() => {
  const root = activeRoot.value;
  if (!root) return [];
  return currentPath.value
    .slice(root.path.length)
    .split("/")
    .filter(Boolean);
});

const expiresLabel = computed(() =>
  meta.value ? new Date(meta.value.expiresAt).toLocaleString() : "",
);

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}

function joinPath(name: string): string {
  return currentPath.value ? `${currentPath.value}/${name}` : name;
}

function downloadHref(path: string): string {
  return sharePublic.fileUrl(shareRef, path, ticket.value);
}

function mapFatal(err: any): string {
  const status = shareErrorStatus(err);
  if (status === 410) return t("share.public.gone");
  if (status === 404) return t("share.public.notFound");
  return t("share.public.unavailable");
}

onMounted(init);

async function init() {
  busy.value = true;
  try {
    meta.value = await sharePublic.meta(shareRef);
  } catch (err) {
    fatal.value = mapFatal(err);
    busy.value = false;
    return;
  }

  const cachedTicket = sharePublic.readTicket(meta.value.id);
  const cachedRoots = sharePublic.readRoots(meta.value.id);
  if (cachedTicket && cachedRoots.length) {
    ticket.value = cachedTicket;
    roots.value = cachedRoots;
    await openRoots();
  } else if (!meta.value.needsCode) {
    await doUnlock();
  }
  busy.value = false;
}

function onCodeInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const normalized = input.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
  codeInput.value = normalized;
  input.value = normalized;
}

async function submitCode() {
  error.value = "";
  if (codeInput.value.length !== 6) {
    error.value = t("share.public.badCode");
    return;
  }
  busy.value = true;
  try {
    await doUnlock(codeInput.value);
  } catch (err) {
    const status = shareErrorStatus(err);
    error.value =
      status === 401
        ? t("share.public.wrongCode")
        : status === 429
          ? t("share.public.locked")
          : status === 410
            ? t("share.public.gone")
            : t("share.public.unavailable");
  } finally {
    busy.value = false;
  }
}

async function doUnlock(code?: string) {
  if (!meta.value) return;
  const unlocked = await sharePublic.unlock(shareRef, code);
  ticket.value = unlocked.ticket;
  roots.value = unlocked.roots;
  sharePublic.storeSession(meta.value.id, unlocked.ticket, unlocked.roots);
  await openRoots();
}

async function openRoots() {
  error.value = "";
  if (singleFile.value) return;

  if (roots.value.length === 1 && roots.value[0]?.type === "dir") {
    currentPath.value = roots.value[0].path;
    await loadList();
    return;
  }

  // Multi-root selection: show the selected items as a first listing.
  showingRoots.value = true;
  entries.value = roots.value.map((root) => ({ name: root.name, type: root.type, size: 0 }));
}

async function loadList() {
  if (!ticket.value) return;
  try {
    const listing = await sharePublic.list(shareRef, currentPath.value, ticket.value);
    entries.value = listing.entries;
    showingRoots.value = false;
    error.value = "";
  } catch (err) {
    if (shareErrorStatus(err) === 403) {
      // Ticket expired: ask for the code again.
      ticket.value = "";
      entries.value = [];
      if (meta.value) sharePublic.clearTicket(meta.value.id);
      return;
    }
    error.value = mapFatal(err);
  }
}

async function enter(name: string) {
  const target = showingRoots.value
    ? (roots.value.find((root) => root.name === name)?.path ?? "")
    : joinPath(name);
  if (!target) return;
  currentPath.value = target;
  await loadList();
}

async function goRoot() {
  const root = activeRoot.value;
  if (!root) return;
  currentPath.value = root.path;
  await loadList();
}

async function goTo(index: number) {
  const root = activeRoot.value;
  if (!root) return;
  const parts = [root.path, ...crumbs.value.slice(0, index + 1)];
  currentPath.value = parts.join("/");
  await loadList();
}
</script>

<style scoped>
.share-page {
  width: 100%;
  display: flex;
  justify-content: center;
}

.share-page__card {
  width: 100%;
  max-width: 620px;
  padding: 1.5rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.share-page__card--center {
  align-items: center;
  text-align: center;
  gap: 0.5rem;
}

.share-page__icon {
  font-size: 2rem;
  color: #22d3ee;
}

.share-page__icon--muted {
  color: var(--text-muted, #9ca3af);
}

.share-page__title {
  font-size: 1.25rem;
  font-weight: 600;
  word-break: break-word;
}

.share-page__sub {
  font-size: 0.8rem;
  color: var(--text-muted, #9ca3af);
}

.share-page__hint {
  font-size: 0.85rem;
  color: var(--text-muted, #9ca3af);
}

.share-page__gate {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  align-items: stretch;
}

.share-page__code {
  text-align: center;
  font-size: 1.5rem;
  letter-spacing: 0.4rem;
  text-transform: uppercase;
  padding: 0.5rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
}

.share-page__error {
  font-size: 0.82rem;
  color: #f87171;
}

.share-page__single {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 0;
}

.share-page__file-icon {
  font-size: 2.5rem;
  color: #22d3ee;
}

.share-page__download {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1.1rem;
  border-radius: 10px;
  background: #22d3ee;
  color: #05202a;
  font-weight: 600;
}

.share-page__crumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.15rem;
  font-size: 0.8rem;
  color: var(--text-muted, #9ca3af);
}

.share-page__crumb {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0.1rem 0.25rem;
  border-radius: 6px;
}

.share-page__crumb:hover {
  color: #22d3ee;
}

.share-page__list {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.share-page__item {
  list-style: none;
}

.share-page__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.6rem;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.share-page__row:hover {
  background: rgba(34, 211, 238, 0.08);
}

.share-page__row-icon {
  color: #22d3ee;
  flex-shrink: 0;
}

.share-page__row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-page__row-size,
.share-page__row-chevron {
  font-size: 0.78rem;
  color: var(--text-muted, #9ca3af);
  flex-shrink: 0;
}
</style>
