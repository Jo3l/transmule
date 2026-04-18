<template>
  <SDialog v-model="showSmartRenameDialog" :title="t('fileManager.smartRenameTitle')" width="980px">
    <p class="is-size-7 has-text-grey mb-3">
      {{ t("fileManager.smartRenameHint") }}
    </p>

    <div class="fm-sr-table-wrap">
      <table class="table is-fullwidth is-hoverable fm-sr-table">
        <tbody>
          <tr v-for="item in smartRenameItems" :key="item.originalPath">
            <td class="fm-sr-item-cell">
              <div class="fm-sr-original-row">
                <span class="fm-sr-label">{{ t("fileManager.srOriginal") }}</span>
                <div class="fm-sr-original" :title="item.original">
                  <span class="icon mr-1"><i :class="srIcon(item.type)"></i></span>
                  <span class="fm-sr-original-text">{{ item.original }}</span>
                </div>
              </div>

              <div class="fm-sr-new-row">
                <span class="fm-sr-label">{{ t("fileManager.srSuggested") }}</span>
              </div>

              <div class="fm-sr-proposals">
                <div class="fm-sr-proposal fm-sr-proposal-custom">
                  <span class="fm-sr-source">CUSTOM</span>
                  <div class="fm-sr-proposal-custom-editor">
                    <SInput
                      v-model="item.suggested"
                      class="fm-sr-input"
                      :placeholder="item.original"
                      :disabled="smartRenameApplying"
                      @enter="renameWithCustomName(item)"
                    />
                  </div>
                  <div class="fm-sr-actions">
                    <SButton
                      size="sm"
                      variant="primary"
                      :disabled="smartRenameApplying || !item.suggested?.trim()"
                      :loading="smartRenameApplying"
                      @click="renameWithCustomName(item)"
                    >
                      {{ t("fileManager.rename") }}
                    </SButton>
                  </div>
                </div>

                <div
                  v-for="proposal in srDisplayProposals(item)"
                  :key="`${item.originalPath}-${proposal.source}-${proposal.suggested || 'loading'}`"
                  class="fm-sr-proposal"
                  :class="{ 'is-loading': proposal.loading }"
                >
                  <span class="fm-sr-source">{{ srSourceLabel(proposal.source) }}</span>

                  <template v-if="proposal.loading">
                    <span class="fm-sr-proposal-loading">
                      <span class="mdi mdi-loading mdi-spin mr-1" />
                      {{ t("fileManager.smartRenameLoading") }}
                    </span>
                  </template>
                  <template v-else>
                    <span class="fm-sr-proposal-name" :title="proposal.suggested">
                      {{ proposal.suggested }}
                    </span>
                    <div class="fm-sr-actions">
                      <SButton
                        size="sm"
                        variant="primary"
                        :disabled="smartRenameApplying"
                        :loading="smartRenameApplying"
                        @click="renameWithProposal(item, proposal.suggested)"
                      >
                        {{ t("fileManager.rename") }}
                      </SButton>
                    </div>
                  </template>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <template #footer>
      <div class="flex-end gap-sm">
        <SButton :disabled="smartRenameApplying" @click="showSmartRenameDialog = false">
          {{ t("fileManager.cancel") }}
        </SButton>
        <SButton
          variant="primary"
          :disabled="smartRenameApplying || smartRenameItems.length === 0"
          :loading="smartRenameApplying"
          @click="doSmartRename"
        >
          {{ t("fileManager.smartRenameApply") }}
        </SButton>
      </div>
    </template>
  </SDialog>
</template>

<script setup lang="ts">
interface SmartRenameProposal {
  source: string;
  suggested: string;
}

interface SmartRenameDisplayProposal extends SmartRenameProposal {
  loading?: boolean;
}

interface SmartRenameItem {
  originalPath: string;
  original: string;
  suggested: string;
  proposals?: SmartRenameProposal[];
  type: string;
  tmdbLoading?: boolean;
  tvdbLoading?: boolean;
}

const emit = defineEmits<{
  (e: "renamed", payload?: { clearSelection?: boolean }): void;
}>();

const { t } = useI18n();
const { apiFetch, showToast } = useApi();

const showSmartRenameDialog = ref(false);
const smartRenameApplying = ref(false);
const smartRenameItems = ref<SmartRenameItem[]>([]);

const SMART_RENAME_SOURCE_ORDER: Record<string, number> = {
  cleanup: 0,
  tmdb: 1,
  tvdb: 2,
};

let smartRenameRunId = 0;

function basenameFromPath(relPath: string): string {
  const idx = relPath.lastIndexOf("/");
  return idx === -1 ? relPath : relPath.slice(idx + 1);
}

function sortSmartRenameProposals(proposals: SmartRenameProposal[]): SmartRenameProposal[] {
  return [...proposals].sort((a, b) => {
    const aOrder = SMART_RENAME_SOURCE_ORDER[a.source] ?? 99;
    const bOrder = SMART_RENAME_SOURCE_ORDER[b.source] ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.suggested.localeCompare(b.suggested, undefined, { sensitivity: "base" });
  });
}

function withIntegrationLoaders(item: SmartRenameItem): SmartRenameItem {
  return {
    ...item,
    proposals: sortSmartRenameProposals(item.proposals ?? []),
    tmdbLoading: true,
    tvdbLoading: true,
  };
}

function srDisplayProposals(item: SmartRenameItem): SmartRenameDisplayProposal[] {
  const proposals = sortSmartRenameProposals(item.proposals ?? []).map((proposal) => ({
    ...proposal,
    loading: false,
  }));

  if (item.tmdbLoading && !proposals.some((p) => p.source === "tmdb")) {
    proposals.push({ source: "tmdb", suggested: "", loading: true });
  }
  if (item.tvdbLoading && !proposals.some((p) => p.source === "tvdb")) {
    proposals.push({ source: "tvdb", suggested: "", loading: true });
  }

  return sortSmartRenameProposals(proposals);
}

function mergeIntegrationSuggestions(
  current: SmartRenameItem,
  incoming?: SmartRenameItem,
): SmartRenameItem {
  const existingCleanup = (current.proposals ?? []).filter(
    (proposal) => proposal.source === "cleanup",
  );
  const integrationProposals = (incoming?.proposals ?? []).filter(
    (proposal) => proposal.source !== "cleanup",
  );

  return {
    ...current,
    type: incoming?.type ?? current.type,
    proposals: sortSmartRenameProposals([...existingCleanup, ...integrationProposals]),
    tmdbLoading: false,
    tvdbLoading: false,
  };
}

function renamedPath(originalPath: string, newName: string): string {
  const idx = originalPath.lastIndexOf("/");
  if (idx === -1) return newName;
  return `${originalPath.slice(0, idx)}/${newName}`;
}

async function loadSmartRenameIntegrationsForPath(path: string, runId: number) {
  try {
    const res = await apiFetch<{ suggestions: SmartRenameItem[] }>("/api/files/smart-rename", {
      method: "POST",
      body: {
        paths: [path],
        includeCleanup: false,
        includeIntegrations: true,
      },
    });
    if (runId !== smartRenameRunId) return;

    const incoming = res.suggestions?.[0];
    smartRenameItems.value = smartRenameItems.value.map((item) =>
      item.originalPath === path ? mergeIntegrationSuggestions(item, incoming) : item,
    );
  } catch {
    if (runId !== smartRenameRunId) return;
    smartRenameItems.value = smartRenameItems.value.map((item) =>
      item.originalPath === path
        ? {
            ...item,
            tmdbLoading: false,
            tvdbLoading: false,
          }
        : item,
    );
  }
}

async function startForPaths(paths: string[]) {
  if (!paths.length) return;

  smartRenameRunId += 1;
  const runId = smartRenameRunId;

  showSmartRenameDialog.value = true;
  smartRenameItems.value = paths.map((relPath) =>
    withIntegrationLoaders({
      originalPath: relPath,
      original: basenameFromPath(relPath),
      suggested: basenameFromPath(relPath),
      proposals: [],
      type: "unknown",
    }),
  );

  try {
    const res = await apiFetch<{ suggestions: SmartRenameItem[] }>("/api/files/smart-rename", {
      method: "POST",
      body: {
        paths,
        includeCleanup: true,
        includeIntegrations: false,
      },
    });
    if (runId !== smartRenameRunId) return;

    smartRenameItems.value = res.suggestions.map((item) => withIntegrationLoaders(item));

    for (const path of paths) {
      loadSmartRenameIntegrationsForPath(path, runId);
    }
  } catch (err: any) {
    showToast(err?.data?.statusMessage ?? t("errors.middlewareError", { status: 0 }), "error");
    showSmartRenameDialog.value = false;
  }
}

async function doSmartRename() {
  smartRenameApplying.value = true;
  try {
    for (const item of smartRenameItems.value) {
      const cleanup = item.proposals?.find((p) => p.source === "cleanup")?.suggested;
      const newName = (cleanup ?? item.suggested).trim();
      if (!newName || newName === item.original) continue;
      await apiFetch("/api/files/rename", {
        method: "POST",
        body: { path: item.originalPath, name: newName },
      });
    }
    showSmartRenameDialog.value = false;
    emit("renamed", { clearSelection: true });
  } catch (err: any) {
    showToast(err?.data?.statusMessage ?? t("errors.middlewareError", { status: 0 }), "error");
  } finally {
    smartRenameApplying.value = false;
  }
}

async function renameWithProposal(item: SmartRenameItem, suggested: string) {
  const newName = suggested.trim();
  if (!newName || newName === item.original) return;

  smartRenameApplying.value = true;
  try {
    await apiFetch("/api/files/rename", {
      method: "POST",
      body: { path: item.originalPath, name: newName },
    });

    item.originalPath = renamedPath(item.originalPath, newName);
    item.original = newName;
    item.suggested = newName;

    smartRenameItems.value = smartRenameItems.value.filter((x) => x !== item);
    if (smartRenameItems.value.length === 0) {
      showSmartRenameDialog.value = false;
    }

    emit("renamed", { clearSelection: true });
  } catch (err: any) {
    showToast(err?.data?.statusMessage ?? t("errors.middlewareError", { status: 0 }), "error");
  } finally {
    smartRenameApplying.value = false;
  }
}

function renameWithCustomName(item: SmartRenameItem) {
  renameWithProposal(item, item.suggested);
}

function srSourceLabel(source: string): string {
  if (source === "cleanup") return "CLEANUP";
  if (source === "tmdb") return "TMDB";
  if (source === "tvdb") return "TVDB";
  return source.toUpperCase();
}

function srIcon(type: string): string {
  if (type === "tv") return "mdi-television-play fm-icon-video";
  if (type === "movie") return "mdi-movie fm-icon-video";
  return "mdi-file fm-icon-default";
}

defineExpose({
  startForPaths,
});
</script>

<style scoped>
.fm-sr-table-wrap {
  max-height: 400px;
  overflow-x: auto;
  overflow-y: auto;
  border: 1px solid var(--s-border);
  border-radius: 6px;
}

.fm-sr-table {
  width: 100%;
  margin-bottom: 0 !important;
}

.fm-sr-item-cell {
  padding-top: 0.7rem;
  padding-bottom: 0.8rem;
}

.fm-sr-original-row,
.fm-sr-new-row {
  margin-bottom: 0.4rem;
}

.fm-sr-original-row {
  padding: 1rem 0;
}

.fm-sr-label {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--s-text-secondary);
  margin-bottom: 0.22rem;
}

.fm-sr-original {
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  color: var(--s-text);
}

.fm-sr-original-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.fm-sr-input :deep(input) {
  font-size: 0.82rem !important;
}

.fm-sr-proposals {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.fm-sr-proposal {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--s-border);
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
  background: var(--s-bg-surface);
}

.fm-sr-proposal.is-loading {
  opacity: 0.8;
}

.fm-sr-proposal-custom {
  align-items: center;
}

.fm-sr-proposal-custom-editor {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.fm-sr-source {
  min-width: 58px;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--s-text-secondary);
}

.fm-sr-proposal-name {
  flex: 1;
  min-width: 0;
  font-size: 0.76rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 0.7rem;
}

.fm-sr-proposal-loading {
  display: inline-flex;
  align-items: center;
  color: var(--s-text-secondary);
  font-size: 0.82rem;
}

.fm-sr-actions {
  display: flex;
  gap: 0.35rem;
}
</style>
