<template>
  <div class="box">
    <div class="providers-header">
      <div>
        <h6 class="title is-6 mb-1 mt-3">{{ $t("settings.providersTitle") }}</h6>
        <p class="has-text-grey is-size-7 mb-0">
          {{ $t("settings.providersDescription") }}
        </p>
      </div>
      <SButton
        v-if="isAdmin"
        variant="primary"
        size="sm"
        icon="mdi-upload"
        :loading="pluginUploading"
        @click="triggerPluginUpload"
      >
        {{ $t("settings.pluginUpload") }}
      </SButton>
      <input
        v-if="isAdmin"
        ref="pluginFileInput"
        type="file"
        accept=".js"
        class="hidden"
        @change="onPluginFileSelected"
      />
    </div>

    <!-- Docs collapsible -->
    <details class="plugin-docs mt-3 mb-3">
      <summary class="plugin-docs-summary">
        <span class="mdi mdi-book-open-outline mr-1" />
        {{ $t("settings.pluginDocTitle") }}
      </summary>
      <div class="plugin-docs-body">
        <p class="is-size-7 mb-2">{{ $t("settings.pluginDocIntro") }}</p>
        <pre class="plugin-docs-code"><code>// my-provider.js
export default {
  meta: {
    id: "my-provider",          // unique string id
    name: "My Provider",        // display name
    icon: "mdi-magnify",        // MDI icon class
    mediaType: "movies",        // any string, e.g. "movies", "shows", "games"
    description: "Optional."
  },
  // Required: returns items + pagination info
  async list({ query, page, filters }) {
    // fetch from your source...
    return { items: [], hasMore: false };
  },
  // Optional: returns full MediaItem detail
  async detail(url) {
    return { id: url, title: "...", links: [] };
  }
};

// Torrent-search plugin (pluginType: "torrent-search"):
export default {
  meta: {
    id: "my-search",
    name: "My Search",
    icon: "mdi-magnify",
    pluginType: "torrent-search",
    description: "Optional."
  },
  async search(query, limit, extraTrackers) {
    // return TorrentSearchResult[]
    return [];
  }
};</code></pre>
        <p class="is-size-7 mt-2 has-text-muted">
          {{ $t("settings.pluginDocNote") }}
        </p>
        <p class="is-size-7 mt-1">
          <a
            href="https://github.com/Jo3l/transmule/blob/main/PROVIDER_PLUGIN.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="mdi mdi-open-in-new mr-1" />
            {{ $t("settings.pluginDocReadMore") }}
          </a>
        </p>
      </div>
    </details>

    <SLoading v-if="providersLoading" />

    <template v-else>
      <!-- Media content providers -->
      <template v-if="mediaProviderList.length">
        <p class="is-size-7 has-text-grey mb-2 mt-1">
          <span class="mdi mdi-filmstrip mr-1" />{{ $t("settings.providersMediaTitle") }}
        </p>
        <div class="providers-list mb-4">
          <div
            v-for="p in mediaProviderList"
            :key="p.id"
            class="provider-item"
            :class="{ 'is-disabled': !p.enabled }"
          >
            <span class="provider-icon mdi" :class="p.icon" />
            <div class="provider-details">
              <div class="provider-name">
                {{ p.name }}
                <STag v-if="p.version" size="sm" variant="default" class="ml-1"
                  >v{{ p.version }}</STag
                >
              </div>
              <div class="provider-desc">
                {{ p.description }}
                <STag size="sm" variant="info" class="ml-2">{{ p.mediaType }}</STag>
              </div>
            </div>
            <SSwitch
              :model-value="p.enabled"
              @update:model-value="onToggleProvider(p.id, $event)"
            />
            <SButton
              v-if="isAdmin && pluginUpdates[p.id]"
              variant="primary"
              size="sm"
              :loading="pluginUpdating === p.id"
              :title="$t('settings.pluginUpdateAvailable', { version: pluginUpdates[p.id]?.latestVersion })"
              @click="onUpdatePlugin(p.id, pluginUpdates[p.id]!.url)"
            >
              <span class="mdi mdi-arrow-up-circle mr-1" />
              {{ $t("settings.pluginUpdate") }}
            </SButton>
            <SButton
              v-if="isAdmin && !p.sourceRepoId"
              variant="warning"
              size="sm"
              @click="onDeletePlugin(p.id, p.name)"
            >
              {{ $t("settings.pluginDelete") }}
            </SButton>
          </div>
        </div>
      </template>

      <!-- Torrent-search plugins -->
      <template v-if="torrentSearchProviderList.length">
        <p class="is-size-7 has-text-grey mb-2">
          <span class="mdi mdi-magnify mr-1" />{{ $t("settings.providersTorrentSearchTitle") }}
        </p>
        <div class="providers-list mb-4">
          <div
            v-for="p in torrentSearchProviderList"
            :key="p.id"
            class="provider-item"
            :class="{ 'is-disabled': !p.enabled }"
          >
            <span class="provider-icon mdi" :class="p.icon" />
            <div class="provider-details">
              <div class="provider-name">
                {{ p.name }}
                <STag v-if="p.version" size="sm" variant="default" class="ml-1">v{{ p.version }}</STag>
              </div>
              <div class="provider-desc">
                {{ p.description }}
                <STag size="sm" variant="warning" class="ml-2">torrent-search</STag>
              </div>
            </div>
            <SSwitch
              :model-value="p.enabled"
              @update:model-value="onToggleProvider(p.id, $event)"
            />
            <SButton
              v-if="isAdmin && pluginUpdates[p.id]"
              variant="primary"
              size="sm"
              :loading="pluginUpdating === p.id"
              :title="$t('settings.pluginUpdateAvailable', { version: pluginUpdates[p.id]?.latestVersion })"
              @click="onUpdatePlugin(p.id, pluginUpdates[p.id]!.url)"
            >
              <span class="mdi mdi-arrow-up-circle mr-1" />
              {{ $t("settings.pluginUpdate") }}
            </SButton>
            <SButton
              v-if="isAdmin && !p.sourceRepoId"
              variant="warning"
              size="sm"
              @click="onDeletePlugin(p.id, p.name)"
            >
              {{ $t("settings.pluginDelete") }}
            </SButton>
          </div>
        </div>
      </template>

      <p
        v-if="!mediaProviderList.length && !torrentSearchProviderList.length"
        class="has-text-muted is-size-7"
      >
        {{ $t("settings.providersEmpty") }}
      </p>
    </template>

    <!-- Plugin Repositories -->
    <SDivider v-if="isAdmin" class="my-4" />
    <template v-if="isAdmin">
      <div class="providers-header mb-3">
        <div>
          <h6 class="title is-6 mb-1">{{ $t("settings.reposTitle") }}</h6>
          <p class="has-text-grey is-size-7 mb-0">
            {{ $t("settings.reposDescription") }}
          </p>
        </div>
      </div>

      <!-- Add repo input -->
      <div class="repo-add-row mb-4">
        <SInput
          v-model="newRepoUrl"
          :placeholder="$t('settings.reposAddPlaceholder')"
          size="sm"
          class="repo-add-input"
          @keydown.enter="onAddRepo"
        />
        <SButton variant="primary" size="sm" :loading="repoAdding" @click="onAddRepo">
          <span class="mdi mdi-plus mr-1" />
          {{ $t("settings.reposAdd") }}
        </SButton>
      </div>

      <SLoading v-if="reposLoading" />

      <template v-else-if="repos.length">
        <div v-for="repo in repos" :key="repo.id" class="repo-block mb-4">
          <div class="repo-header" @click="toggleRepoExpanded(repo.id)">
            <span class="mdi mdi-source-repository mr-2" />
            <span class="repo-name">{{ repo.name || repo.url }}</span>
            <span class="repo-url has-text-grey is-size-7 ml-2" v-if="repo.name">{{ repo.url }}</span>
            <div class="repo-header-actions ml-auto">
              <SButton
                variant="default"
                size="sm"
                :loading="repoRefreshing === repo.id"
                :title="$t('settings.reposRefresh')"
                @click.stop="loadRepoPlugins(repo.id)"
              >
                <span class="mdi mdi-refresh" />
              </SButton>
              <SButton
                variant="danger"
                size="sm"
                :title="$t('settings.reposRemove')"
                @click.stop="onRemoveRepo(repo)"
              >
                <span class="mdi mdi-delete" />
              </SButton>
              <span
                class="mdi repo-chevron"
                :class="expandedRepos[repo.id] ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              />
            </div>
          </div>

          <div v-if="expandedRepos[repo.id]" class="repo-plugins">
            <SLoading v-if="repoRefreshing === repo.id" />
            <p v-else-if="repoPluginsError[repo.id]" class="has-text-danger is-size-7 p-2">
              {{ repoPluginsError[repo.id] }}
            </p>
            <template v-else-if="repoPluginsData[repo.id]">
              <p v-if="!repoPluginsData[repo.id]?.plugins.length" class="has-text-muted is-size-7 p-2">
                {{ $t("settings.reposEmpty") }}
              </p>
              <div
                v-for="rp in repoPluginsData[repo.id]?.plugins"
                :key="rp.id"
                class="repo-plugin-item"
              >
                <span class="provider-icon mdi" :class="rp.icon || 'mdi-puzzle'" />
                <div class="provider-details">
                  <div class="provider-name">
                    {{ rp.name }}
                    <STag size="sm" variant="default" class="ml-1">v{{ rp.version }}</STag>
                    <STag
                      v-if="rp.pluginType === 'torrent-search'"
                      size="sm" variant="warning" class="ml-1"
                    >torrent-search</STag>
                    <STag v-else-if="rp.pluginType" size="sm" variant="info" class="ml-1">{{ rp.pluginType }}</STag>
                  </div>
                  <div v-if="rp.description" class="provider-desc">{{ rp.description }}</div>
                </div>
                <STag v-if="rp.installed && !rp.hasUpdate" size="sm" variant="success">
                  {{ $t("settings.reposPluginInstalled") }}
                </STag>
                <SButton
                  v-if="rp.hasUpdate"
                  variant="primary" size="sm"
                  :loading="repoInstalling === rp.id"
                  @click="onInstallRepoPlugin(rp)"
                >
                  <span class="mdi mdi-arrow-up-circle mr-1" />
                  {{ $t("settings.pluginUpdate") }}
                </SButton>
                <SButton
                  v-else-if="!rp.installed"
                  variant="success" size="sm"
                  :loading="repoInstalling === rp.id"
                  @click="onInstallRepoPlugin(rp)"
                >
                  <span class="mdi mdi-download mr-1" />
                  {{ $t("settings.reposPluginInstall") }}
                </SButton>
              </div>
            </template>
          </div>
        </div>
      </template>

      <p v-else class="has-text-muted is-size-7">
        {{ $t("settings.reposNone") }}
      </p>

      <!-- Plugins installed from repositories -->
      <template v-if="repoInstalledProviderList.length">
        <SDivider class="my-4" />
        <h6 class="title is-6 mb-2">{{ $t("settings.reposInstalledTitle") }}</h6>
        <p class="has-text-grey is-size-7 mb-3">
          {{ $t("settings.reposInstalledDescription") }}
        </p>
        <div class="providers-list">
          <div
            v-for="p in repoInstalledProviderList"
            :key="p.id"
            class="provider-item"
            :class="{ 'is-disabled': !p.enabled }"
          >
            <span class="provider-icon mdi" :class="p.icon" />
            <div class="provider-details">
              <div class="provider-name">
                {{ p.name }}
                <STag v-if="p.version" size="sm" variant="default" class="ml-1">v{{ p.version }}</STag>
                <STag v-if="p.pluginType === 'torrent-search'" size="sm" variant="warning" class="ml-1">torrent-search</STag>
                <STag v-else-if="p.mediaType" size="sm" variant="info" class="ml-1">{{ p.mediaType }}</STag>
              </div>
              <div class="provider-desc">
                {{ p.description }}
                <STag v-if="p.sourceRepoId && repoNameById[p.sourceRepoId]" size="sm" variant="default" class="ml-2">
                  <span class="mdi mdi-source-repository mr-1" />{{ repoNameById[p.sourceRepoId] }}
                </STag>
              </div>
            </div>
            <SSwitch :model-value="p.enabled" @update:model-value="onToggleProvider(p.id, $event)" />
            <SButton
              v-if="isAdmin && pluginUpdates[p.id]"
              variant="primary" size="sm"
              :loading="pluginUpdating === p.id"
              :title="$t('settings.pluginUpdateAvailable', { version: pluginUpdates[p.id]?.latestVersion })"
              @click="onUpdatePlugin(p.id, pluginUpdates[p.id]!.url)"
            >
              <span class="mdi mdi-arrow-up-circle mr-1" />
              {{ $t("settings.pluginUpdate") }}
            </SButton>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ProviderMeta, UpdateInfo } from "~/composables/useProviders";
import type { RepoPluginEntry, RepoPluginsResult } from "~/composables/usePluginRepos";

const { t } = useI18n();
const { apiFetch } = useApi();
const { addToast } = useToast();
const auth = useAuth();

const isAdmin = computed(() => auth.user.value?.isAdmin === true);

const { loadProviders, toggleProvider, uploadPlugin, deletePlugin, installFromUrl, checkUpdates } =
  useProviders();
const { repos, reposLoading, loadRepos, addRepo, removeRepo, fetchRepoPlugins } = usePluginRepos();
const providerList = ref<ProviderMeta[]>([]);
const providersLoading = ref(false);
const pluginUploading = ref(false);
const pluginFileInput = ref<HTMLInputElement | null>(null);

// Update tracking
const pluginUpdates = ref<Record<string, UpdateInfo>>({});
const pluginUpdating = ref<string | null>(null);

const mediaProviderList = computed(() =>
  providerList.value.filter((p) => p.pluginType !== "torrent-search" && !p.sourceRepoId),
);
const torrentSearchProviderList = computed(() =>
  providerList.value.filter((p) => p.pluginType === "torrent-search" && !p.sourceRepoId),
);
const repoInstalledProviderList = computed(() =>
  providerList.value.filter((p) => p.sourceRepoId != null),
);
const repoNameById = computed(() =>
  Object.fromEntries(repos.value.map((r) => [r.id, r.name || r.url])),
);

async function loadProviderList() {
  providersLoading.value = true;
  try {
    providerList.value = await loadProviders(true);
    checkUpdates()
      .then((updates) => {
        pluginUpdates.value = Object.fromEntries(
          updates.filter((u) => u.hasUpdate).map((u) => [u.id, u]),
        );
      })
      .catch(() => {});
  } catch {
    /* silent */
  } finally {
    providersLoading.value = false;
  }
}

async function onToggleProvider(id: string, enabled: boolean) {
  try {
    await toggleProvider(id, enabled);
    providerList.value = providerList.value.map((p) => (p.id === id ? { ...p, enabled } : p));
  } catch {
    /* silent */
  }
}

function triggerPluginUpload() {
  pluginFileInput.value?.click();
}

async function onPluginFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  pluginUploading.value = true;
  try {
    await uploadPlugin(file);
    await loadProviderList();
  } catch {
    /* silent */
  } finally {
    pluginUploading.value = false;
    if (pluginFileInput.value) pluginFileInput.value.value = "";
  }
}

async function onDeletePlugin(id: string, name: string) {
  if (!confirm(t("settings.pluginDeleteConfirm", { name }))) return;
  try {
    await deletePlugin(id);
    providerList.value = providerList.value.filter((p) => p.id !== id);
    delete pluginUpdates.value[id];
  } catch {
    /* silent */
  }
}

async function onUpdatePlugin(id: string, url: string) {
  if (!confirm(t("settings.pluginUpdateConfirm", { name: providerList.value.find((p) => p.id === id)?.name ?? id }))) return;
  pluginUpdating.value = id;
  try {
    await installFromUrl(url);
    addToast(t("settings.pluginUpdateSuccess"), "success");
    delete pluginUpdates.value[id];
    await loadProviderList();
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.saveFailed"), "error");
  } finally {
    pluginUpdating.value = null;
  }
}

// ── Plugin Repositories ────────────────────────────────────────────────────

const newRepoUrl = ref("");
const repoAdding = ref(false);
const repoRefreshing = ref<number | null>(null);
const repoInstalling = ref<string | null>(null);
const expandedRepos = ref<Record<number, boolean>>({});
const repoPluginsData = ref<Record<number, RepoPluginsResult | null>>({});
const repoPluginsError = ref<Record<number, string>>({});

function toggleRepoExpanded(id: number) {
  if (expandedRepos.value[id]) {
    expandedRepos.value[id] = false;
  } else {
    expandedRepos.value[id] = true;
    if (!repoPluginsData.value[id]) {
      loadRepoPlugins(id);
    }
  }
}

async function loadRepoPlugins(repoId: number) {
  repoRefreshing.value = repoId;
  delete repoPluginsError.value[repoId];
  try {
    repoPluginsData.value[repoId] = await fetchRepoPlugins(repoId);
  } catch (err: any) {
    repoPluginsError.value[repoId] =
      err?.data?.statusMessage || err?.message || t("settings.reposFetchError");
  } finally {
    repoRefreshing.value = null;
  }
}

async function onAddRepo() {
  const url = newRepoUrl.value.trim();
  if (!url) return;
  repoAdding.value = true;
  try {
    const repo = await addRepo(url);
    newRepoUrl.value = "";
    await loadProviderList();
    expandedRepos.value[repo.id] = true;
    loadRepoPlugins(repo.id);
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.saveFailed"), "error");
  } finally {
    repoAdding.value = false;
  }
}

async function onRemoveRepo(repo: { id: number; name: string | null; url: string }) {
  const label = repo.name || repo.url;
  if (!confirm(t("settings.reposRemoveConfirm", { name: label }))) return;
  try {
    await removeRepo(repo.id);
    delete repoPluginsData.value[repo.id];
    delete repoPluginsError.value[repo.id];
    delete expandedRepos.value[repo.id];
    await loadProviderList();
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.saveFailed"), "error");
  }
}

async function onInstallRepoPlugin(rp: RepoPluginEntry) {
  repoInstalling.value = rp.id;
  try {
    await installFromUrl(rp.url);
    addToast(t("settings.reposInstallSuccess"), "success");
    await loadProviderList();
    for (const repoId of Object.keys(expandedRepos.value).map(Number)) {
      if (expandedRepos.value[repoId]) loadRepoPlugins(repoId);
    }
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.reposInstallError"), "error");
  } finally {
    repoInstalling.value = null;
  }
}

onMounted(async () => {
  loadProviderList();
  if (isAdmin.value) loadRepos();
});
</script>

<style scoped>
.providers-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.providers-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.provider-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  transition: background 0.15s;
}
.provider-item:hover {
  background: var(--s-table-hover-bg, rgba(128, 128, 128, 0.05));
}
.provider-item.is-disabled {
  opacity: 0.45;
}
.provider-icon {
  font-size: 1.3rem;
  width: 1.6rem;
  text-align: center;
  flex-shrink: 0;
}
.provider-details {
  flex: 1;
  min-width: 0;
}
.provider-name {
  font-size: 0.85rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.provider-desc {
  font-size: 0.72rem;
  color: var(--s-text-muted);
  margin-top: 0.1rem;
}
.plugin-docs {
  border: 1px solid var(--s-border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}
.plugin-docs-summary {
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  user-select: none;
}
.plugin-docs-body {
  margin-top: 0.75rem;
}
.plugin-docs-code {
  font-size: 0.7rem;
  max-height: 300px;
  overflow: auto;
  border-radius: 4px;
}
.repo-add-row {
  display: flex;
  gap: 0.5rem;
}
.repo-add-input {
  flex: 1;
  max-width: 400px;
}
.repo-block {
  border: 1px solid var(--s-border);
  border-radius: 6px;
  overflow: hidden;
}
.repo-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  user-select: none;
  font-size: 0.85rem;
}
.repo-header:hover {
  background: var(--s-table-hover-bg, rgba(128, 128, 128, 0.05));
}
.repo-name {
  font-weight: 500;
}
.repo-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.repo-header-actions {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.repo-chevron {
  color: var(--s-text-muted);
  font-size: 1.1rem;
}
.repo-plugins {
  border-top: 1px solid var(--s-border);
  padding: 0.5rem 0.75rem;
}
.repo-plugin-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0;
}
.hidden {
  display: none;
}
</style>
