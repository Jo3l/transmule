<template>
  <div id="page-files" class="fm-page" @click="hideCtxMenu" @keydown.esc.window="hideCtxMenu">
    <h1 class="title is-4 mb-4">{{ $t("fileManager.title") }}</h1>

    <!-- Not configured -->
    <SAlert v-if="notConfigured" variant="warning">
      {{ $t("fileManager.notConfigured") }}
    </SAlert>

    <template v-else>
      <!-- ── Toolbar ─────────────────────────────────────────────────── -->
      <div class="fm-toolbar mb-3">
        <!-- Breadcrumbs -->
        <nav class="breadcrumb fm-breadcrumb" aria-label="breadcrumbs">
          <ul>
            <li :class="{ 'is-active': !currentPath }">
              <a @click.prevent="navigate('')">
                <span class="mdi mdi-folder-home mr-1" />
                {{ $t("fileManager.root") }}
              </a>
            </li>
            <li
              v-for="(seg, i) in pathSegments"
              :key="i"
              :class="{ 'is-active': i === pathSegments.length - 1 }"
            >
              <a @click.prevent="navigate(pathSegments.slice(0, i + 1).join('/'))">
                {{ seg }}
              </a>
            </li>
          </ul>
        </nav>

        <!-- Action buttons -->
        <div class="fm-actions">
          <SButton size="sm" @click="showNewFolderDialog = true">
            <span class="mdi mdi-folder-plus mr-1" />{{ $t("fileManager.newFolder") }}
          </SButton>
          <SButton size="sm" @click="triggerFileInput">
            <span class="mdi mdi-upload mr-1" />{{ $t("fileManager.upload") }}
          </SButton>
          <SButton
            v-if="selectedFiles.length > 0"
            size="sm"
            variant="primary"
            @click="startSmartRenameForPaths(selectedFiles)"
          >
            <span class="mdi mdi-auto-fix mr-1" />{{ $t("fileManager.smartRename") }}
          </SButton>
          <SButton
            v-if="selectedItems.size > 0"
            size="sm"
            variant="danger"
            @click="confirmDeleteSelected"
          >
            <span class="mdi mdi-delete mr-1" />
            {{ $t("fileManager.deleteSelected", { count: selectedItems.size }) }}
          </SButton>
          <input ref="fileInputEl" type="file" multiple hidden @change="onFilesChosen" />
        </div>
      </div>

      <!-- Upload progress bar -->
      <div v-if="uploading" class="fm-upload-bar mb-2">
        <span class="is-size-7 has-text-grey mr-2">{{ $t("fileManager.uploading") }}</span>
        <progress
          class="progress is-primary is-small mb-0 flex-1"
          :value="uploadProgress"
          max="100"
        />
        <span class="is-size-7 has-text-grey ml-2">{{ uploadProgress }}%</span>
      </div>

      <!-- ── File table with drag-and-drop ────────────────────────────── -->
      <div
        class="fm-table-wrap"
        :class="{ 'fm-drag-over': dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
      >
        <!-- Drop overlay -->
        <div v-if="dragging" class="fm-drop-overlay">
          <span class="mdi mdi-cloud-upload icon-2xl" />
          <div>{{ $t("fileManager.dropToUpload") }}</div>
        </div>

        <SLoading v-if="loading && !items.length" />

        <table v-else class="table is-fullwidth is-hoverable fm-table">
          <thead>
            <tr>
              <th class="fm-th-check">
                <input
                  type="checkbox"
                  :checked="allSelected"
                  :indeterminate="someSelected && !allSelected"
                  :disabled="items.length === 0"
                  @change="toggleAll"
                />
              </th>
              <th>{{ $t("fileManager.name") }}</th>
              <th class="has-text-right fm-th-size">
                {{ $t("fileManager.size") }}
              </th>
              <th class="is-hidden-mobile fm-th-date">
                {{ $t("fileManager.modified") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- Go up -->
            <tr v-if="currentPath" class="fm-up-row">
              <td></td>
              <td colspan="3">
                <a class="fm-name-cell" @click.prevent="navigateUp">
                  <span class="mdi mdi-arrow-up-bold-circle fm-icon has-text-grey" />
                  <span class="has-text-grey">{{ $t("fileManager.goUp") }}</span>
                </a>
              </td>
            </tr>

            <!-- Directory / file rows -->
            <tr
              v-for="item in items"
              :key="item.name"
              :class="{ 'is-selected': selectedItems.has(item.name) }"
              @contextmenu.prevent="onRowContextMenu($event, item)"
            >
              <td class="fm-td-check">
                <input
                  type="checkbox"
                  :checked="selectedItems.has(item.name)"
                  @change="toggleSelect(item.name)"
                />
              </td>
              <td>
                <span class="fm-name-cell">
                  <span class="mdi fm-icon" :class="fileIcon(item)" />
                  <a
                    v-if="item.type === 'directory'"
                    @click.prevent="navigate(childPath(item.name))"
                    >{{ item.name }}</a
                  >
                  <span v-else class="fm-filename" :title="item.name">{{ item.name }}</span>
                </span>
              </td>
              <td class="has-text-right has-text-grey is-size-7">
                {{ item.type === "directory" ? "—" : fmtSize(item.size) }}
              </td>
              <td class="has-text-grey is-size-7 is-hidden-mobile">
                {{ fmtDate(item.modified) }}
              </td>
            </tr>

            <!-- Empty state -->
            <tr v-if="!loading && items.length === 0">
              <td colspan="4" class="has-text-centered has-text-grey py-5">
                <span class="mdi mdi-folder-open-outline fm-empty-icon" />
                {{ $t("fileManager.empty") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ── New Folder dialog ─────────────────────────────────────────── -->
    <SDialog v-model="showNewFolderDialog" :title="$t('fileManager.newFolder')">
      <SFormItem :label="$t('fileManager.folderName')">
        <SInput
          v-model="newFolderName"
          :placeholder="$t('fileManager.folderNamePlaceholder')"
          @enter="doNewFolder"
        />
      </SFormItem>
      <template #footer>
        <div class="flex-end gap-sm">
          <SButton @click="showNewFolderDialog = false">
            {{ $t("fileManager.cancel") }}
          </SButton>
          <SButton variant="primary" :loading="working" @click="doNewFolder">
            {{ $t("fileManager.create") }}
          </SButton>
        </div>
      </template>
    </SDialog>

    <!-- ── Rename dialog ─────────────────────────────────────────────── -->
    <SDialog v-model="showRenameDialog" :title="$t('fileManager.rename')">
      <SFormItem :label="$t('fileManager.newName')">
        <SInput v-model="renameValue" @enter="doRename" />
      </SFormItem>
      <template #footer>
        <div class="flex-end gap-sm">
          <SButton @click="showRenameDialog = false">
            {{ $t("fileManager.cancel") }}
          </SButton>
          <SButton variant="primary" :loading="working" @click="doRename">
            {{ $t("fileManager.ok") }}
          </SButton>
        </div>
      </template>
    </SDialog>

    <!-- ── Delete confirm dialog ─────────────────────────────────────── -->
    <SDialog v-model="showDeleteDialog" :title="$t('fileManager.delete')">
      <p>{{ deleteMessage }}</p>
      <template #footer>
        <div class="flex-end gap-sm">
          <SButton @click="showDeleteDialog = false">
            {{ $t("fileManager.cancel") }}
          </SButton>
          <SButton variant="danger" :loading="working" @click="doDelete">
            {{ $t("fileManager.delete") }}
          </SButton>
        </div>
      </template>
    </SDialog>
  </div>

  <!-- ── Context menu ──────────────────────────────────────────────────── -->
  <Teleport to="body">
    <div
      v-if="ctxMenu.visible"
      class="fm-ctx-menu"
      :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
      @click.stop
    >
      <!-- Multi-select mode header -->
      <div v-if="ctxIsMulti" class="fm-ctx-header">
        {{ $t("fileManager.ctxSelected", { count: selectedItems.size }) }}
      </div>

      <!-- Single item: directory -->
      <button
        v-if="!ctxIsMulti && ctxMenu.item?.type === 'directory'"
        class="fm-ctx-item"
        @click="
          navigate(childPath(ctxMenu.item.name));
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-folder-open mr-2" />{{ $t("fileManager.ctxOpen") }}
      </button>

      <!-- Play in Webamp (mp3 only) -->
      <button
        v-if="!ctxIsMulti && isMp3(ctxMenu.item)"
        class="fm-ctx-item fm-ctx-item--accent"
        @click="
          openInWebamp(ctxMenu.item!);
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-play mr-2" />{{ $t("fileManager.playInWebamp") }}
      </button>

      <!-- Download (file only) -->
      <a
        v-if="!ctxIsMulti && ctxMenu.item?.type === 'file'"
        class="fm-ctx-item"
        :href="downloadUrl(ctxMenu.item.name)"
        @click="hideCtxMenu()"
      >
        <span class="mdi mdi-download mr-2" />{{ $t("fileManager.download") }}
      </a>

      <!-- Smart Rename — single file -->
      <button
        v-if="!ctxIsMulti && ctxMenu.item?.type === 'file'"
        class="fm-ctx-item fm-ctx-item--accent"
        @click="
          startSmartRenameForPaths([childPath(ctxMenu.item.name)]);
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-auto-fix mr-2" />{{ $t("fileManager.smartRename") }}
      </button>

      <!-- Smart Rename — multi selection -->
      <button
        v-if="ctxIsMulti && selectedFiles.length > 0"
        class="fm-ctx-item fm-ctx-item--accent"
        @click="
          startSmartRenameForPaths(selectedFiles);
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-auto-fix mr-2" />
        {{ $t("fileManager.smartRenameSelected", { count: selectedFiles.length }) }}
      </button>

      <!-- Rename — single item -->
      <button
        v-if="!ctxIsMulti"
        class="fm-ctx-item"
        @click="
          startRename(ctxMenu.item!);
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-pencil mr-2" />{{ $t("fileManager.rename") }}
      </button>

      <div class="fm-ctx-sep" />

      <!-- Delete single -->
      <button
        v-if="!ctxIsMulti"
        class="fm-ctx-item fm-ctx-item--danger"
        @click="
          confirmDeleteOne(ctxMenu.item!);
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-delete mr-2" />{{ $t("fileManager.delete") }}
      </button>

      <!-- Delete selected -->
      <button
        v-if="ctxIsMulti"
        class="fm-ctx-item fm-ctx-item--danger"
        @click="
          confirmDeleteSelected();
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-delete mr-2" />
        {{ $t("fileManager.deleteSelected", { count: selectedItems.size }) }}
      </button>
    </div>
  </Teleport>

  <!-- ── Webamp player ──────────────────────────────────────────────── -->
  <ClientOnly>
    <Webamp v-if="webampTrack" :key="webampKey" :track="webampTrack" />
  </ClientOnly>

  <!-- ── Smart Rename dialog ───────────────────────────────────────── -->
  <SDialog
    v-model="showSmartRenameDialog"
    :title="$t('fileManager.smartRenameTitle')"
    width="700px"
  >
    <div v-if="smartRenameLoading" class="has-text-centered py-4">
      <SLoading />
      <p class="mt-2 has-text-grey is-size-7">{{ $t("fileManager.smartRenameLoading") }}</p>
    </div>
    <template v-else>
      <p class="mb-3 is-size-7 has-text-grey">{{ $t("fileManager.smartRenameHint") }}</p>
      <div class="fm-sr-table-wrap">
        <table class="table is-fullwidth is-narrow fm-sr-table">
          <thead>
            <tr>
              <th>{{ $t("fileManager.srOriginal") }}</th>
              <th class="fm-th-arrow"></th>
              <th>{{ $t("fileManager.srSuggested") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in smartRenameItems" :key="idx">
              <td class="fm-sr-original has-text-grey is-size-7">
                <span class="mdi fm-icon is-size-6 mr-1" :class="srIcon(item.type)" />
                {{ item.original }}
              </td>
              <td class="has-text-centered has-text-grey">
                <span class="mdi mdi-arrow-right" />
              </td>
              <td>
                <SInput v-model="item.suggested" size="sm" class="fm-sr-input" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <template #footer>
      <div class="flex-end gap-sm">
        <SButton @click="showSmartRenameDialog = false">
          {{ $t("fileManager.cancel") }}
        </SButton>
        <SButton
          variant="primary"
          :loading="smartRenameApplying"
          :disabled="smartRenameLoading || smartRenameItems.length === 0"
          @click="doSmartRename"
        >
          <span class="mdi mdi-check mr-1" />{{ $t("fileManager.smartRenameApply") }}
        </SButton>
      </div>
    </template>
  </SDialog>
</template>

<script setup lang="ts">
interface FileItem {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
}

interface SmartRenameItem {
  originalPath: string;
  original: string;
  suggested: string;
  type: string;
}

const { t } = useI18n();
const { apiFetch, showToast } = useApi();
const auth = useAuth();
const config = useRuntimeConfig();

// ── State ──────────────────────────────────────────────────────────────────
const currentPath = ref("");
const items = ref<FileItem[]>([]);
const loading = ref(false);
const notConfigured = ref(false);
const working = ref(false);

// ── Selection (reactive Set for O(1) lookups) ──────────────────────────────
const selectedItems = reactive(new Set<string>());
const allSelected = computed(
  () => items.value.length > 0 && items.value.every((i) => selectedItems.has(i.name)),
);
const someSelected = computed(() => selectedItems.size > 0);

/** Paths of selected items that are files (used for Smart Rename). */
const selectedFiles = computed(() =>
  Array.from(selectedItems)
    .filter((name) => items.value.find((i) => i.name === name)?.type === "file")
    .map((name) => childPath(name)),
);

// ── Upload state ───────────────────────────────────────────────────────────
const uploading = ref(false);
const uploadProgress = ref(0);
const dragging = ref(false);
const fileInputEl = ref<HTMLInputElement>();

// ── Dialog state ───────────────────────────────────────────────────────────
const showNewFolderDialog = ref(false);
const newFolderName = ref("");

const showRenameDialog = ref(false);
const renameTarget = ref<FileItem | null>(null);
const renameValue = ref("");

const showDeleteDialog = ref(false);
const deleteTargets = ref<string[]>([]);
const deleteMessage = computed(() =>
  deleteTargets.value.length === 1
    ? t("fileManager.confirmDelete", { name: deleteTargets.value[0].split("/").pop() })
    : t("fileManager.confirmDeleteMultiple", { count: deleteTargets.value.length }),
);

// ── Context menu ─────────────────────────────────────────────────────────────
const ctxMenu = ref({ visible: false, x: 0, y: 0, item: null as FileItem | null });
const ctxIsMulti = computed(() => selectedItems.size > 1);

// ── Webamp ────────────────────────────────────────────────────────────────
import type { Track } from "webamp";

const webampTrack = ref<Track | null>(null);
const webampKey = ref(0);

function isMp3(item: FileItem | null): boolean {
  return item?.type === "file" && item.name.toLowerCase().endsWith(".mp3");
}

function openInWebamp(item: FileItem) {
  const url = downloadUrl(item.name);
  const track: Track = { url, metaData: { title: item.name } };
  if (webampTrack.value !== null) {
    webampTrack.value = track;
  } else {
    webampTrack.value = track;
    webampKey.value++;
  }
}

function onRowContextMenu(e: MouseEvent, item: FileItem) {
  if (!selectedItems.has(item.name)) {
    selectedItems.clear();
    selectedItems.add(item.name);
  }
  ctxMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 210),
    y: Math.min(e.clientY, window.innerHeight - 270),
    item,
  };
}

function hideCtxMenu() {
  ctxMenu.value.visible = false;
}

// ── Smart Rename ──────────────────────────────────────────────────────────
const showSmartRenameDialog = ref(false);
const smartRenameLoading = ref(false);
const smartRenameApplying = ref(false);
const smartRenameItems = ref<SmartRenameItem[]>([]);

async function startSmartRenameForPaths(paths: string[]) {
  if (!paths.length) return;
  showSmartRenameDialog.value = true;
  smartRenameLoading.value = true;
  smartRenameItems.value = [];
  try {
    const res = await apiFetch<{ suggestions: SmartRenameItem[] }>("/api/files/smart-rename", {
      method: "POST",
      body: { paths },
    });
    smartRenameItems.value = res.suggestions;
  } catch (err: any) {
    showToast(err?.data?.statusMessage ?? t("errors.middlewareError", { status: 0 }), "error");
    showSmartRenameDialog.value = false;
  } finally {
    smartRenameLoading.value = false;
  }
}

async function doSmartRename() {
  smartRenameApplying.value = true;
  try {
    for (const item of smartRenameItems.value) {
      const newName = item.suggested.trim();
      if (!newName || newName === item.original) continue;
      await apiFetch("/api/files/rename", {
        method: "POST",
        body: { path: item.originalPath, name: newName },
      });
    }
    showSmartRenameDialog.value = false;
    selectedItems.clear();
    loadDir();
  } catch (err: any) {
    showToast(err?.data?.statusMessage ?? t("errors.middlewareError", { status: 0 }), "error");
  } finally {
    smartRenameApplying.value = false;
  }
}

function srIcon(type: string): string {
  if (type === "tv") return "mdi-television-play fm-icon-video";
  if (type === "movie") return "mdi-movie fm-icon-video";
  return "mdi-file fm-icon-default";
}

// ── Computed helpers ───────────────────────────────────────────────────────
const pathSegments = computed(() =>
  currentPath.value ? currentPath.value.split("/").filter(Boolean) : [],
);

function childPath(name: string) {
  return currentPath.value ? `${currentPath.value}/${name}` : name;
}

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(path: string) {
  currentPath.value = path;
  selectedItems.clear();
  loadDir();
}

function navigateUp() {
  const segs = pathSegments.value.slice(0, -1);
  navigate(segs.join("/"));
}

// ── Load directory ─────────────────────────────────────────────────────────
async function loadDir() {
  loading.value = true;
  notConfigured.value = false;
  try {
    const res = await apiFetch<{ path: string; items: FileItem[] }>(
      `/api/files/list?path=${encodeURIComponent(currentPath.value)}`,
    );
    items.value = res.items;
  } catch (err: any) {
    const status = err?.response?.status ?? err?.status ?? 0;
    if (status === 503) {
      notConfigured.value = true;
      items.value = [];
    } else {
      showToast(t("errors.middlewareError", { status }), "error");
    }
  } finally {
    loading.value = false;
  }
}

// ── Selection ──────────────────────────────────────────────────────────────
function toggleSelect(name: string) {
  if (selectedItems.has(name)) selectedItems.delete(name);
  else selectedItems.add(name);
}

function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  selectedItems.clear();
  if (checked) items.value.forEach((i) => selectedItems.add(i.name));
}

// ── Download URL (token in query param — browser anchor can't set headers) ──
function downloadUrl(filename: string): string {
  const base = (config.public.apiBase as string) || "";
  const rel = currentPath.value ? `${currentPath.value}/${filename}` : filename;
  return `${base}/api/files/download?path=${encodeURIComponent(rel)}&token=${encodeURIComponent(auth.token.value || "")}`;
}

// ── Upload ─────────────────────────────────────────────────────────────────
function triggerFileInput() {
  fileInputEl.value?.click();
}

function onFilesChosen(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (files?.length) uploadFiles(Array.from(files));
  (e.target as HTMLInputElement).value = "";
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) uploadFiles(files);
}

function onDragLeave(e: DragEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
    dragging.value = false;
  }
}

function uploadFiles(files: File[]) {
  uploading.value = true;
  uploadProgress.value = 0;

  const formData = new FormData();
  formData.append("dir", currentPath.value);
  for (const file of files) {
    formData.append("files", file, file.name);
  }

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener("progress", (e) => {
    if (e.lengthComputable) {
      uploadProgress.value = Math.round((e.loaded / e.total) * 100);
    }
  });

  xhr.addEventListener("load", () => {
    uploading.value = false;
    uploadProgress.value = 0;
    if (xhr.status >= 200 && xhr.status < 300) {
      loadDir();
    } else {
      showToast(t("errors.middlewareError", { status: xhr.status }), "error");
    }
  });

  xhr.addEventListener("error", () => {
    uploading.value = false;
    showToast(t("errors.middlewareError", { status: 0 }), "error");
  });

  const base = (config.public.apiBase as string) || "";
  xhr.open("POST", `${base}/api/files/upload`);
  xhr.setRequestHeader("Authorization", `Bearer ${auth.token.value}`);
  xhr.send(formData);
}

// ── New folder ─────────────────────────────────────────────────────────────
watch(showNewFolderDialog, (v) => {
  if (v) newFolderName.value = "";
});

async function doNewFolder() {
  const name = newFolderName.value.trim();
  if (!name) return;
  working.value = true;
  try {
    const path = currentPath.value ? `${currentPath.value}/${name}` : name;
    await apiFetch("/api/files/mkdir", { method: "POST", body: { path } });
    showNewFolderDialog.value = false;
    loadDir();
  } catch (err: any) {
    showToast(err?.data?.statusMessage ?? t("errors.middlewareError", { status: 0 }), "error");
  } finally {
    working.value = false;
  }
}

// ── Rename ─────────────────────────────────────────────────────────────────
function startRename(item: FileItem) {
  renameTarget.value = item;
  renameValue.value = item.name;
  showRenameDialog.value = true;
}

async function doRename() {
  const name = renameValue.value.trim();
  if (!name || !renameTarget.value) return;
  working.value = true;
  try {
    const path = currentPath.value
      ? `${currentPath.value}/${renameTarget.value.name}`
      : renameTarget.value.name;
    await apiFetch("/api/files/rename", { method: "POST", body: { path, name } });
    showRenameDialog.value = false;
    loadDir();
  } catch (err: any) {
    showToast(err?.data?.statusMessage ?? t("errors.middlewareError", { status: 0 }), "error");
  } finally {
    working.value = false;
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────
function confirmDeleteOne(item: FileItem) {
  deleteTargets.value = [childPath(item.name)];
  showDeleteDialog.value = true;
}

function confirmDeleteSelected() {
  deleteTargets.value = Array.from(selectedItems).map((name) => childPath(name));
  showDeleteDialog.value = true;
}

async function doDelete() {
  working.value = true;
  try {
    await apiFetch("/api/files/delete", {
      method: "POST",
      body: { paths: deleteTargets.value },
    });
    showDeleteDialog.value = false;
    selectedItems.clear();
    loadDir();
  } catch (err: any) {
    showToast(err?.data?.statusMessage ?? t("errors.middlewareError", { status: 0 }), "error");
  } finally {
    working.value = false;
  }
}

// ── Icon mapping ───────────────────────────────────────────────────────────
function fileIcon(item: FileItem): string {
  if (item.type === "directory") return "mdi-folder fm-icon-dir";
  const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    mp4: "mdi-file-video fm-icon-video",
    mkv: "mdi-file-video fm-icon-video",
    avi: "mdi-file-video fm-icon-video",
    wmv: "mdi-file-video fm-icon-video",
    mov: "mdi-file-video fm-icon-video",
    webm: "mdi-file-video fm-icon-video",
    flv: "mdi-file-video fm-icon-video",
    mp3: "mdi-file-music fm-icon-audio",
    flac: "mdi-file-music fm-icon-audio",
    wav: "mdi-file-music fm-icon-audio",
    ogg: "mdi-file-music fm-icon-audio",
    aac: "mdi-file-music fm-icon-audio",
    m4a: "mdi-file-music fm-icon-audio",
    jpg: "mdi-file-image fm-icon-image",
    jpeg: "mdi-file-image fm-icon-image",
    png: "mdi-file-image fm-icon-image",
    gif: "mdi-file-image fm-icon-image",
    webp: "mdi-file-image fm-icon-image",
    svg: "mdi-file-image fm-icon-image",
    zip: "mdi-zip-box fm-icon-archive",
    rar: "mdi-zip-box fm-icon-archive",
    "7z": "mdi-zip-box fm-icon-archive",
    tar: "mdi-zip-box fm-icon-archive",
    gz: "mdi-zip-box fm-icon-archive",
    bz2: "mdi-zip-box fm-icon-archive",
    pdf: "mdi-file-pdf-box fm-icon-pdf",
    doc: "mdi-file-word fm-icon-doc",
    docx: "mdi-file-word fm-icon-doc",
    txt: "mdi-file-document-outline fm-icon-doc",
    torrent: "mdi-magnet fm-icon-torrent",
    iso: "mdi-disc fm-icon-disc",
    img: "mdi-disc fm-icon-disc",
    srt: "mdi-subtitles fm-icon-sub",
    sub: "mdi-subtitles fm-icon-sub",
    ass: "mdi-subtitles fm-icon-sub",
    nfo: "mdi-information-outline fm-icon-doc",
  };
  return map[ext] ?? "mdi-file fm-icon-default";
}

// ── Formatters ─────────────────────────────────────────────────────────────
function fmtSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString() +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return iso;
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(loadDir);
</script>

<style scoped>
.fm-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Toolbar */
.fm-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.fm-breadcrumb {
  flex: 1;
  min-width: 0;
  margin-bottom: 0 !important;
}

.fm-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
  flex-wrap: wrap;
}

/* Upload bar */
.fm-upload-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.04);
}

/* Table wrap + drag-and-drop */
.fm-table-wrap {
  position: relative;
  border: 2px solid transparent;
  border-radius: 6px;
  transition: border-color 0.2s;
  overflow: auto;
  flex: 1;
}

.fm-table-wrap.fm-drag-over {
  border-color: #3273dc;
}

.fm-drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(50, 115, 220, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  z-index: 20;
  border-radius: 4px;
  pointer-events: none;
  color: #3273dc;
  font-size: 1rem;
}

.fm-table {
  margin-bottom: 0;
}

/* Row */
.fm-up-row {
  opacity: 0.6;
}

.fm-name-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.fm-icon {
  font-size: 1.15rem;
  flex-shrink: 0;
}

/* File type colors */
.fm-icon-dir {
  color: #f0a329;
}
.fm-icon-video {
  color: #e05050;
}
.fm-icon-audio {
  color: #9b59b6;
}
.fm-icon-image {
  color: #3498db;
}
.fm-icon-archive {
  color: #e67e22;
}
.fm-icon-pdf {
  color: #e74c3c;
}
.fm-icon-doc {
  color: #2980b9;
}
.fm-icon-torrent {
  color: #27ae60;
}
.fm-icon-disc {
  color: #95a5a6;
}
.fm-icon-sub {
  color: #16a085;
}
.fm-icon-default {
  color: #bdc3c7;
}

.fm-filename {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420px;
  display: inline-block;
  vertical-align: bottom;
}

/* ── Context menu ──────────────────────────────────────────────────────────── */
.fm-ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 190px;
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  padding: 4px 0;
  user-select: none;
}

.fm-ctx-header {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--s-text-muted);
  padding: 6px 14px 4px;
}

.fm-ctx-sep {
  height: 1px;
  background: var(--s-border);
  margin: 4px 0;
}

.fm-ctx-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 7px 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--s-text);
  text-align: left;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.1s;
}

.fm-ctx-item:hover {
  background: var(--s-bg-hover);
}

.fm-ctx-item--accent {
  color: var(--s-accent);
}
.fm-ctx-item--danger {
  color: var(--s-danger);
}

/* ── Smart Rename dialog table ──────────────────────────────────────────── */
.fm-sr-table-wrap {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--s-border);
  border-radius: 6px;
}

.fm-sr-table {
  margin-bottom: 0 !important;
}

.fm-sr-original {
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle !important;
}

.fm-sr-input :deep(input) {
  font-size: 0.82rem !important;
}
.fm-th-check {
  width: 36px;
  padding-right: 0;
}
.fm-th-size {
  width: 90px;
}
.fm-th-date {
  width: 160px;
}
.fm-th-arrow {
  width: 28px;
}
.fm-td-check {
  padding-right: 0;
}
.fm-empty-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 0.5rem;
}
</style>
