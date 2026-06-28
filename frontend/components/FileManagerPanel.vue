<template>
  <div
    class="fmp-wrap"
    :class="{
      'is-active': active,
      'fmp-drag-over': dragging,
    }"
    tabindex="0"
    @click.stop="$emit('activate')"
    @keydown="onKeyDown"
    @dragover.prevent="
      (e: DragEvent) => {
        if (isAdmin && !readOnlyActive && !e.dataTransfer?.types.includes('application/x-fm-paths'))
          dragging = true;
      }
    "
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Drop overlay (OS file drop) -->
    <div v-if="dragging" class="fmp-drop-overlay">
      <span class="mdi mdi-cloud-upload icon-2xl" />
      <div>{{ $t("fileManager.dropToUpload") }}</div>
    </div>

    <!-- Loading overlay -->
    <div v-if="loading" class="fmp-loading-overlay">
      <span class="mdi mdi-loading mdi-spin s-loading-spinner" />
    </div>

    <!-- ── Mobile file cards (≤768px) ──────────────────────────── -->
    <div class="is-hidden-tablet fmp-mobile-list">
      <div v-if="currentPath && !hasSearched" class="fmp-mobile-up" @click.stop="navigateUp">
        <span class="mdi mdi-arrow-up-bold-circle fm-icon has-text-grey" />
        <span class="has-text-grey">{{ $t("fileManager.goUp") }}</span>
      </div>
      <div
        v-if="!loading && displayItems.length === 0"
        class="has-text-centered has-text-grey py-5"
      >
        <span class="mdi mdi-folder-open-outline fmp-empty-icon" />
        {{ hasSearched ? $t("fileManager.searchEmpty") : $t("fileManager.empty") }}
      </div>
      <div
        v-for="item in displayItems"
        :key="item.name"
        class="fmp-mobile-card"
        :class="{ 'is-open': mobileOpenedItem === item.name }"
        @click.stop="onMobileCardTap(item)"
      >
        <div class="fmp-mc-header">
          <img v-if="isAudioFile(item)" :src="winampIcon" class="fmp-icon fmp-icon-winamp" alt="" />
          <img
            v-else-if="isComicFile(item)"
            :src="boltIcon"
            class="fmp-icon fmp-icon-comic"
            alt=""
          />
          <span v-else class="mdi fmp-icon" :class="fileIcon(item)" />
          <span class="fmp-mc-name">
            <span v-if="item.relpath" class="fm-relpath">{{ item.relpath }}/</span>
            {{ item.name }}
          </span>
          <span class="fmp-mc-size">{{ item.type === "file" ? fmtSize(item.size) : "" }}</span>
          <span
            class="mdi fmp-mc-chevron"
            :class="mobileOpenedItem === item.name ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          />
        </div>
        <div v-if="mobileOpenedItem === item.name" class="fmp-mc-panel" @click.stop>
          <button
            v-if="item.type === 'directory'"
            class="fmp-mc-action"
            @click="
              navigate(childPath(item.name));
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-folder-open mr-2" />{{ $t("fileManager.ctxOpen") }}
          </button>
          <button
            v-if="isImage(item) && !item.isRemoteMount"
            class="fmp-mc-action fmp-mc-action--accent"
            @click="
              emitOpenImagePreview(item);
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-image-outline mr-2" />{{ $t("fileManager.viewImage") }}
          </button>
          <button
            v-if="isTextEditable(item) && !item.isRemoteMount"
            class="fmp-mc-action fmp-mc-action--accent"
            @click="
              emitOpenTextEditor(item);
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-file-edit-outline mr-2" />{{ $t("fileManager.editText") }}
          </button>
          <button
            v-if="isVideo(item) && !item.isRemoteMount"
            class="fmp-mc-action fmp-mc-action--accent"
            @click="
              $emit('open-video-preview', item);
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-play-circle-outline mr-2" />{{ $t("fileManager.playVideo") }}
          </button>
          <button
            v-if="isMp3(item) && !item.isRemoteMount"
            class="fmp-mc-action fmp-mc-action--accent"
            @click="
              $emit('play-in-webamp', item);
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-play mr-2" />{{ $t("fileManager.playInWebamp") }}
          </button>
          <button
            v-if="isComicFile(item) && !item.isRemoteMount"
            class="fmp-mc-action fmp-mc-action--accent"
            @click="
              emitOpenComic(item);
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-book-open-variant-outline mr-2" />{{ $t("fileManager.viewComic") }}
          </button>
          <button
            v-if="item.type === 'file'"
            class="fmp-mc-action"
            @click="
              $emit('download-file', item.name);
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-download mr-2" />{{ $t("fileManager.download") }}
          </button>
          <button
            v-if="isAdmin && item.type === 'file' && !item.isRemoteMount"
            class="fmp-mc-action fmp-mc-action--accent"
            :disabled="readOnlyActive"
            @click="
              $emit('smart-rename-paths', [childPath(item.name)]);
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-auto-fix mr-2" />{{ $t("fileManager.smartRename") }}
          </button>
          <button
            v-if="isAdmin && !item.isRemoteMount"
            class="fmp-mc-action"
            :disabled="readOnlyActive"
            @click="
              $emit('open-transfer-dialog', { sources: [childPath(item.name)], mode: 'move' });
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-folder-move mr-2" />{{ $t("fileManager.move") }}
          </button>
          <button
            class="fmp-mc-action"
            @click="
              $emit('open-transfer-dialog', { sources: [childPath(item.name)], mode: 'copy' });
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-content-copy mr-2" />{{ $t("fileManager.copy") }}
          </button>
          <button
            :disabled="readOnlyActive"
            class="fmp-mc-action"
            @click="
              $emit('compress-sources', { sources: [childPath(item.name)], seedName: item.name });
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-archive-arrow-up-outline mr-2" />{{ $t("fileManager.compress") }}
          </button>
          <template v-if="item.type === 'file' && isArchive(item.name) && !item.isRemoteMount">
            <div class="fmp-mc-sep" />
            <button
              :disabled="readOnlyActive"
              class="fmp-mc-action"
              @click="
                $emit('extract-here', childPath(item.name));
                mobileOpenedItem = null;
              "
            >
              <span class="mdi mdi-archive-arrow-down-outline mr-2" />{{
                $t("fileManager.extractHere")
              }}
            </button>
            <button
              :disabled="readOnlyActive"
              class="fmp-mc-action"
              @click="
                $emit('extract-to-folder', {
                  path: childPath(item.name),
                  folder: archiveBasename(item.name),
                });
                mobileOpenedItem = null;
              "
            >
              <span class="mdi mdi-archive-arrow-down-outline mr-2" />{{
                $t("fileManager.extractToFolder", { name: archiveBasename(item.name) })
              }}
            </button>
            <button
              :disabled="readOnlyActive"
              class="fmp-mc-action"
              @click="
                $emit('open-extract-dialog', childPath(item.name));
                mobileOpenedItem = null;
              "
            >
              <span class="mdi mdi-archive-arrow-down-outline mr-2" />{{
                $t("fileManager.extractTo")
              }}
            </button>
          </template>
          <div v-if="isAdmin && !item.isRemoteMount" class="fmp-mc-sep" />
          <button
            v-if="isAdmin && !item.isRemoteMount"
            class="fmp-mc-action"
            :disabled="readOnlyActive"
            @click="
              $emit('rename-item', { item, currentPath });
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-pencil mr-2" />{{ $t("fileManager.rename") }}
          </button>
          <button
            v-if="isAdmin && item.isRemoteMount"
            class="fmp-mc-action fmp-mc-action--danger"
            @click="
              $emit('unmount-item', item);
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-eject mr-2" />{{ $t("fileManager.unmount") }}
          </button>
          <button
            v-if="isAdmin && !item.isRemoteMount"
            class="fmp-mc-action fmp-mc-action--danger"
            :disabled="readOnlyActive"
            @click="
              $emit('delete-paths', [childPath(item.name)]);
              mobileOpenedItem = null;
            "
          >
            <span class="mdi mdi-delete mr-2" />{{ $t("fileManager.delete") }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Desktop table ────────────────────────────────────────────── -->
    <table v-if="!loading || items.length" class="fmp-table is-hidden-mobile">
      <thead>
        <tr>
          <th>
            <button
              class="fmp-sort-btn"
              :class="{ 'is-active': sortCol === 'name' }"
              @click="toggleSort('name')"
            >
              {{ $t("fileManager.name") }}
              <span
                class="mdi"
                :class="
                  sortCol === 'name'
                    ? sortDir === 'asc'
                      ? 'mdi-arrow-up'
                      : 'mdi-arrow-down'
                    : 'mdi-unfold-more-horizontal'
                "
              />
            </button>
          </th>
          <th class="has-text-right fmp-th-size fmp-col-size">
            <button
              class="fmp-sort-btn"
              :class="{ 'is-active': sortCol === 'size' }"
              @click="toggleSort('size')"
            >
              {{ $t("fileManager.size") }}
              <span
                class="mdi"
                :class="
                  sortCol === 'size'
                    ? sortDir === 'asc'
                      ? 'mdi-arrow-up'
                      : 'mdi-arrow-down'
                    : 'mdi-unfold-more-horizontal'
                "
              />
            </button>
          </th>
          <th class="fmp-th-date fmp-col-date">
            <button
              class="fmp-sort-btn"
              :class="{ 'is-active': sortCol === 'modified' }"
              @click="toggleSort('modified')"
            >
              {{ $t("fileManager.modified") }}
              <span
                class="mdi"
                :class="
                  sortCol === 'modified'
                    ? sortDir === 'asc'
                      ? 'mdi-arrow-up'
                      : 'mdi-arrow-down'
                    : 'mdi-unfold-more-horizontal'
                "
              />
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-if="currentPath && !hasSearched"
          class="fmp-row"
          :class="{
            'is-keyboard-focused': focusedIndex === -1 && displayItems.length > 0,
            'is-drop-target': dropTargetRow === '..',
            'is-drop-target-copy': dropTargetRow === '..' && isCopyKey,
          }"
          @click.prevent="navigateUp"
          @dblclick.prevent="navigateUp"
          @dragover="onParentDragOver($event)"
          @dragleave="onParentDragLeave($event)"
          @drop.prevent="onParentDrop($event)"
        >
          <td>
            <span class="fmp-name-cell">
              <span class="mdi mdi-folder-upload-outline fmp-icon fm-icon-dir" />
              <span class="fmp-filename">...</span>
            </span>
          </td>
          <td class="has-text-right has-text-grey is-size-7 fmp-col-size">&mdash;</td>
          <td class="has-text-grey is-size-7 fmp-col-date"></td>
        </tr>
        <tr
          v-for="(item, idx) in displayItems"
          :key="item.name"
          :draggable="isAdmin"
          :class="{
            'is-selected': selectedItems.has(item.name),
            'is-drop-target': isAdmin && item.type === 'directory' && dropTargetRow === item.name,
            'is-drop-target-copy':
              isAdmin && item.type === 'directory' && dropTargetRow === item.name && isCopyKey,
            'is-keyboard-focused': focusedIndex === idx,
          }"
          class="fmp-row"
          @click.stop="onRowClick($event, item)"
          @dblclick.stop="onRowDblClick($event, item)"
          @contextmenu.prevent="onRowContextMenu($event, item)"
          @dragstart="onRowDragStart($event, item)"
          @dragover.prevent="item.type === 'directory' && onRowDragOver($event, item)"
          @dragleave="onRowDragLeave($event, item)"
          @drop.prevent="item.type === 'directory' && onRowDrop($event, item)"
        >
          <td>
            <span class="fmp-name-cell">
              <img
                v-if="isAudioFile(item)"
                :src="winampIcon"
                class="fmp-icon fmp-icon-winamp"
                alt=""
              />
              <img
                v-else-if="isComicFile(item)"
                :src="boltIcon"
                class="fmp-icon fmp-icon-comic"
                alt=""
              />
              <span v-else class="mdi fmp-icon" :class="fileIcon(item)" />
              <template v-if="item.relpath">
                <a class="fm-relpath" @click.prevent="navigate(item.relpath)"
                  >{{ item.relpath }}/</a
                >
              </template>
              <span v-if="item.type === 'directory'" class="fmp-filename">{{ item.name }}</span>
              <span v-else class="fmp-filename" :title="item.name">{{ item.name }}</span>
            </span>
          </td>
          <td class="has-text-right has-text-grey is-size-7 fmp-col-size">
            {{ item.type === "directory" ? "—" : fmtSize(item.size) }}
          </td>
          <td class="has-text-grey is-size-7 fmp-col-date">
            {{ fmtDate(item.modified) }}
          </td>
        </tr>
        <tr v-if="!loading && displayItems.length === 0">
          <td colspan="3" class="has-text-centered has-text-grey py-5">
            <span class="mdi mdi-folder-open-outline fmp-empty-icon" />
            {{ hasSearched ? $t("fileManager.searchEmpty") : $t("fileManager.empty") }}
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Hidden file input -->
    <input ref="fileInputEl" type="file" multiple hidden @change="onFilesChosen" />

    <!-- ── Context menu (Teleport to body) ──────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.visible"
        ref="ctxMenuRef"
        class="fmp-ctx-menu"
        tabindex="-1"
        :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
        @click.stop
        @keydown="onCtxKeyDown"
      >
        <div v-if="ctxIsMulti" class="fmp-ctx-header">
          {{ $t("fileManager.ctxSelected", { count: selectedItems.size }) }}
        </div>
        <button
          v-if="!ctxIsMulti && ctxMenu.item?.type === 'directory'"
          class="fmp-ctx-item"
          @click="
            navigate(childPath(ctxMenu.item.name));
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-folder-open mr-2" />{{ $t("fileManager.ctxOpen") }}
        </button>
        <button
          v-if="isImage(ctxMenu.item) && !ctxMenu.item?.isRemoteMount"
          class="fmp-ctx-item fmp-ctx-item--accent"
          @click="
            emitOpenImagePreview(ctxMenu.item);
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-image-outline mr-2" />{{ $t("fileManager.viewImage") }}
        </button>
        <button
          v-if="isTextEditable(ctxMenu.item) && !ctxMenu.item?.isRemoteMount"
          class="fmp-ctx-item fmp-ctx-item--accent"
          @click="
            emitOpenTextEditor(ctxMenu.item);
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-file-edit-outline mr-2" />{{ $t("fileManager.editText") }}
        </button>
        <button
          v-if="isVideo(ctxMenu.item) && !ctxMenu.item?.isRemoteMount"
          class="fmp-ctx-item fmp-ctx-item--accent"
          @click="
            emitOpenVideoPreview(ctxMenu.item);
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-play-circle-outline mr-2" />{{ $t("fileManager.playVideo") }}
        </button>
        <button
          v-if="isMp3(ctxMenu.item) && !ctxMenu.item?.isRemoteMount"
          class="fmp-ctx-item fmp-ctx-item--accent"
          @click="
            emitPlayInWebamp(ctxMenu.item);
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-play mr-2" />{{ $t("fileManager.playInWebamp") }}
        </button>
        <button
          v-if="isComicFile(ctxMenu.item) && !ctxMenu.item?.isRemoteMount"
          class="fmp-ctx-item fmp-ctx-item--accent"
          @click="
            emitOpenComic(ctxMenu.item);
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-book-open-variant-outline mr-2" />{{ $t("fileManager.viewComic") }}
        </button>
        <button
          v-if="ctxIsMulti && selectedMp3s.length > 0"
          class="fmp-ctx-item fmp-ctx-item--accent"
          @click="
            $emit('webamp-tracks', getSelectedMp3Tracks());
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-playlist-music mr-2" />{{ $t("fileManager.playInWebamp", 2) }}
        </button>
        <button
          v-if="!ctxIsMulti && ctxMenu.item?.type === 'file'"
          class="fmp-ctx-item"
          @click="
            $emit('download-file', ctxMenu.item.name);
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-download mr-2" />{{ $t("fileManager.download") }}
        </button>
        <button
          v-if="!ctxIsMulti && ctxMenu.item && !ctxMenu.item?.isRemoteMount"
          class="fmp-ctx-item"
          :disabled="readOnlyActive"
          @click="
            $emit('rename-item', { item: ctxMenu.item, currentPath: currentPath });
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-pencil mr-2" />{{ $t("fileManager.rename") }}
        </button>
        <button
          v-if="!ctxIsMulti && ctxMenu.item && ctxMenu.item.isRemoteMount"
          class="fmp-ctx-item fmp-ctx-item--danger"
          @click="
            $emit('unmount-item', ctxMenu.item);
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-eject mr-2" />{{ $t("fileManager.unmount") }}
        </button>
        <div class="fmp-ctx-sep" />
        <button
          :disabled="readOnlyActive"
          class="fmp-ctx-item"
          @click="
            ctxIsMulti
              ? $emit('open-transfer-dialog', { sources: getSelectedPaths(), mode: 'move' })
              : $emit('open-transfer-dialog', {
                  sources: [childPath(ctxMenu.item!.name)],
                  mode: 'move',
                });
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-folder-move mr-2" />{{ $t("fileManager.move") }}
        </button>
        <button
          class="fmp-ctx-item"
          @click="
            ctxIsMulti
              ? $emit('open-transfer-dialog', { sources: getSelectedPaths(), mode: 'copy' })
              : $emit('open-transfer-dialog', {
                  sources: [childPath(ctxMenu.item!.name)],
                  mode: 'copy',
                });
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-content-copy mr-2" />{{ $t("fileManager.copy") }}
        </button>
        <button
          :disabled="readOnlyActive"
          class="fmp-ctx-item"
          @click="
            ctxIsMulti
              ? $emit('compress-sources', {
                  sources: getSelectedPaths(),
                  seedName: ctxMenu.item?.name ?? 'archive',
                })
              : $emit('compress-sources', {
                  sources: [childPath(ctxMenu.item!.name)],
                  seedName: ctxMenu.item!.name,
                });
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-archive-arrow-up-outline mr-2" />{{ $t("fileManager.compress") }}
        </button>
        <div class="fmp-ctx-sep" />
        <template
          v-if="
            !ctxIsMulti &&
            ctxMenu.item &&
            isArchive(ctxMenu.item.name) &&
            !ctxMenu.item.isRemoteMount
          "
        >
          <button
            class="fmp-ctx-item"
            :disabled="readOnlyActive"
            @click="
              emit('extract-here', childPath(ctxMenu.item.name));
              hideCtxMenu();
            "
          >
            <span class="mdi mdi-archive-arrow-down-outline mr-2" />{{
              $t("fileManager.extractHere")
            }}
          </button>
          <button
            class="fmp-ctx-item"
            :disabled="readOnlyActive"
            @click="
              emit('extract-to-folder', {
                path: childPath(ctxMenu.item.name),
                folder: archiveBasename(ctxMenu.item.name),
              });
              hideCtxMenu();
            "
          >
            <span class="mdi mdi-archive-arrow-down-outline mr-2" />{{
              $t("fileManager.extractToFolder", { name: archiveBasename(ctxMenu.item.name) })
            }}
          </button>
          <button
            class="fmp-ctx-item"
            :disabled="readOnlyActive"
            @click="
              emit('open-extract-dialog', childPath(ctxMenu.item.name));
              hideCtxMenu();
            "
          >
            <span class="mdi mdi-archive-arrow-down-outline mr-2" />{{
              $t("fileManager.extractTo")
            }}
          </button>
          <div class="fmp-ctx-sep" />
        </template>
        <button
          v-if="
            !ctxIsMulti &&
            ctxMenu.item &&
            ctxMenu.item.type === 'file' &&
            !ctxMenu.item.isRemoteMount
          "
          class="fmp-ctx-item fmp-ctx-item--accent"
          :disabled="readOnlyActive"
          @click="
            $emit('smart-rename-paths', [childPath(ctxMenu.item.name)]);
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-auto-fix mr-2" />{{ $t("fileManager.smartRename") }}
        </button>
        <button
          :disabled="readOnlyActive"
          class="fmp-ctx-item"
          @click="
            ctxIsMulti
              ? $emit('delete-paths', getSelectedPaths())
              : $emit('delete-paths', [childPath(ctxMenu.item!.name)]);
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-delete mr-2" />{{ $t("fileManager.delete") }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from "vue";

interface FileItem {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  isRemoteMount?: boolean;
  /** Relative path from the search root (only present in search results) */
  relpath?: string;
}

const props = defineProps<{
  currentPath: string;
  isAdmin: boolean;
  extractExtensions: string[];
  compressFormats: { value: string; label: string; extension: string }[];
  remoteMounts: { id: string; name: string; type: string; readOnly?: boolean }[];
  active: boolean;
  winampIcon: string;
  boltIcon: string;
}>();

const emit = defineEmits<{
  activate: [];
  "update:currentPath": [path: string];
  transfer: [payload: { sources: string[]; dest: string; copy: boolean }];
  "rename-item": [payload: { item: FileItem; currentPath: string }];
  "delete-paths": [paths: string[]];
  "open-transfer-dialog": [payload: { sources: string[]; mode: "move" | "copy" }];
  "compress-sources": [payload: { sources: string[]; seedName: string }];
  "extract-here": [path: string];
  "extract-to-folder": [payload: { path: string; folder: string }];
  "open-extract-dialog": [path: string];
  "open-image-preview": [item: FileItem];
  "open-text-editor": [item: FileItem];
  "open-video-preview": [item: FileItem];
  "play-in-webamp": [item: FileItem];
  "open-comic": [item: FileItem];
  "webamp-tracks": [tracks: { url: string; metaData: { artist: string; title: string } }[]];
  "download-file": [name: string];
  "smart-rename-paths": [paths: string[]];
  "upload-files": [files: File[]];
  "unmount-item": [item: FileItem];
}>();

const { t } = useI18n();
const { apiFetch, showToast } = useApi();
const { setPendingDragTracks } = useWebamp();

// ── Read-only detection — check if current path is inside a read-only mount ──
const readOnlyActive = computed(() => {
  if (!props.currentPath) return false;
  const firstSeg = props.currentPath.split("/")[0];
  const mount = props.remoteMounts.find((m) => m.name === firstSeg);
  return mount?.readOnly === true;
});

// ── State ──────────────────────────────────────────────────────────────────
const items = ref<FileItem[]>([]);
const loading = ref(false);
const selectedItems = reactive(new Set<string>());
const lastClickedItem = ref<string | null>(null);

// Sorting
type SortCol = "name" | "size" | "modified";
const sortCol = ref<SortCol>("name");
const sortDir = ref<"asc" | "desc">("asc");

function toggleSort(col: SortCol) {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortCol.value = col;
    sortDir.value = col === "modified" ? "desc" : "asc";
  }
}

const sortedItems = computed(() => {
  const dirs = items.value.filter((i) => i.type === "directory");
  const files = items.value.filter((i) => i.type === "file");
  function cmp(a: FileItem, b: FileItem): number {
    let v = 0;
    if (sortCol.value === "name") {
      v = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    } else if (sortCol.value === "size") {
      v = (a.size ?? 0) - (b.size ?? 0);
    } else {
      v = (a.modified ?? "").localeCompare(b.modified ?? "");
    }
    return sortDir.value === "asc" ? v : -v;
  }
  return [...dirs.sort(cmp), ...files.sort(cmp)];
});

// Search
const searchQuery = ref("");
const searchResults = ref<FileItem[]>([]);
const searching = ref(false);
const hasSearched = computed(
  () => searchResults.value.length > 0 || (searching.value && searchQuery.value.trim().length > 0),
);

const displayItems = computed(() => (hasSearched.value ? searchResults.value : sortedItems.value));

async function doSearch(query?: string) {
  const q = (query ?? searchQuery.value).trim();
  if (!q) return;
  if (query !== undefined) searchQuery.value = query;
  searching.value = true;
  try {
    const res = await apiFetch<{ results: FileItem[] }>(
      `/api/files/search?path=${encodeURIComponent(props.currentPath)}&q=${encodeURIComponent(q)}`,
    );
    searchResults.value = res.results;
  } catch (err: any) {
    showToast(err?.data?.statusMessage ?? "Search failed", "error");
    searchResults.value = [];
  } finally {
    searching.value = false;
  }
}

function clearSearch() {
  searchQuery.value = "";
  searchResults.value = [];
}

// Drag state
const dragging = ref(false);
const dropTargetRow = ref<string | null>(null);
const currentDragEl = ref<HTMLElement | null>(null);
const isCopyKey = ref(false);
const fileInputEl = ref<HTMLInputElement | null>(null);

// Context menu
const ctxMenu = ref<{ visible: boolean; x: number; y: number; item: FileItem | null }>({
  visible: false,
  x: 0,
  y: 0,
  item: null,
});
const ctxIsMulti = computed(() => selectedItems.size > 1);

function hideCtxMenu() {
  ctxMenu.value.visible = false;
}

// ── Context menu keyboard navigation ───────────────────────────────────────
const ctxMenuRef = ref<HTMLElement | null>(null);
const ctxFocusIndex = ref(0);

function focusCtxItem(idx: number) {
  ctxFocusIndex.value = idx;
  if (!ctxMenuRef.value) return;
  const items = ctxMenuRef.value.querySelectorAll<HTMLElement>(".fmp-ctx-item:not([disabled])");
  const target = items[idx];
  if (target) target.focus();
}

function onCtxKeyDown(e: KeyboardEvent) {
  if (!ctxMenuRef.value) return;
  const items = ctxMenuRef.value.querySelectorAll<HTMLElement>(".fmp-ctx-item:not([disabled])");
  if (items.length === 0) return;

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (ctxFocusIndex.value < items.length - 1) {
        focusCtxItem(ctxFocusIndex.value + 1);
      } else {
        focusCtxItem(0);
      }
      break;
    case "ArrowUp":
      e.preventDefault();
      if (ctxFocusIndex.value > 0) {
        focusCtxItem(ctxFocusIndex.value - 1);
      } else {
        focusCtxItem(items.length - 1);
      }
      break;
    case "Enter":
      e.preventDefault();
      if (items[ctxFocusIndex.value]) {
        items[ctxFocusIndex.value].click();
      }
      break;
    case "Escape":
      e.preventDefault();
      hideCtxMenu();
      // Return focus to the panel
      (e.currentTarget as HTMLElement)
        ?.closest?.("#page-files")
        ?.querySelector<HTMLElement>(".fmp-wrap[tabindex]")
        ?.focus();
      break;
  }
}

// ── Emit wrappers (for template type-safety) ───────────────────────────────
function emitOpenImagePreview(item: FileItem | null) {
  if (item) emit("open-image-preview", item);
}
function emitOpenTextEditor(item: FileItem | null) {
  if (item) emit("open-text-editor", item);
}
function emitOpenVideoPreview(item: FileItem | null) {
  if (item) emit("open-video-preview", item);
}
function emitPlayInWebamp(item: FileItem | null) {
  if (item) emit("play-in-webamp", item);
}
function emitOpenComic(item: FileItem | null) {
  if (item) emit("open-comic", item);
}
function emitRenameItem(item: FileItem | null) {
  if (item) emit("rename-item", { item, currentPath: props.currentPath });
}
function emitUnmountItem(item: FileItem | null) {
  if (item) emit("unmount-item", item);
}
function emitDeletePaths(paths: string | string[]) {
  emit("delete-paths", Array.isArray(paths) ? paths : [paths]);
}
function emitTransferDialog(sources: string[], mode: "move" | "copy") {
  emit("open-transfer-dialog", { sources, mode });
}
function emitCompressSources(sources: string[], seedName: string) {
  emit("compress-sources", { sources, seedName });
}

const selectedMp3s = computed(() =>
  items.value.filter((i) => i.type === "file" && isMp3Name(i.name) && selectedItems.has(i.name)),
);

function getSelectedMp3Tracks() {
  return selectedMp3s.value.map((i) => ({
    url: downloadUrl(i.name),
    metaData: { artist: "", title: i.name },
  }));
}

function getSelectedPaths(): string[] {
  return Array.from(selectedItems).map((name) => childPath(name));
}

// ── Mobile ─────────────────────────────────────────────────────────────────
const mobileOpenedItem = ref<string | null>(null);

function onMobileCardTap(item: FileItem) {
  mobileOpenedItem.value = mobileOpenedItem.value === item.name ? null : item.name;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function childPath(name: string) {
  return props.currentPath ? `${props.currentPath}/${name}` : name;
}

function navigate(path: string) {
  selectedItems.clear();
  emit("update:currentPath", path);
}

function navigateUp() {
  const segs = (props.currentPath || "").split("/").filter(Boolean).slice(0, -1);
  navigate(segs.join("/"));
}

async function loadDir() {
  loading.value = true;
  try {
    const res = await apiFetch<{ path: string; items: FileItem[] }>(
      `/api/files/list?path=${encodeURIComponent(props.currentPath)}`,
    );
    items.value = res.items;
    loading.value = false;
  } catch (err: any) {
    const status = err?.response?.status ?? err?.status ?? 0;
    const msg = err?.data?.statusMessage ?? err?.response?._data?.statusMessage ?? "";
    if (
      (status === 403 ||
        status === 404 ||
        status === 0 ||
        /not.?found|not.?exist|denied/i.test(msg)) &&
      props.currentPath
    ) {
      // Path doesn't exist — silently navigate up to parent;
      // the watch on currentPath will trigger loadDir again
      const segs = props.currentPath.split("/").filter(Boolean).slice(0, -1);
      const parent = segs.join("/");
      loading.value = false;
      emit("update:currentPath", parent);
    } else {
      showToast(err?.data?.statusMessage ?? t("errors.middlewareError", { status }), "error");
      loading.value = false;
    }
  }
}

/**
 * Same as loadDir but without showing the loading overlay — no flicker.
 * Instead of replacing the entire items array (which would lose the selected file
 * and keyboard focus), compares old vs new lists and applies only incremental
 * changes: removes items that no longer exist, adds new items, preserving
 * existing item references so Vue's :key="item.name" maintains DOM continuity.
 */
async function silentRefresh() {
  try {
    const res = await apiFetch<{ path: string; items: FileItem[] }>(
      `/api/files/list?path=${encodeURIComponent(props.currentPath)}`,
    );

    const newItems = res.items;
    const current = items.value;

    // Quick identity check — if both lists have the same set of names, skip entirely
    if (current.length === newItems.length) {
      const curNames = new Set(current.map((i) => i.name));
      if (newItems.every((i) => curNames.has(i.name))) return;
    }

    const newNames = new Set(newItems.map((i) => i.name));

    // Remove items that no longer exist on the backend
    for (let i = current.length - 1; i >= 0; i--) {
      if (!newNames.has(current[i].name)) {
        current.splice(i, 1);
      }
    }

    // Add new items (preserving existing references)
    const existingNames = new Set(current.map((i) => i.name));
    for (const newItem of newItems) {
      if (!existingNames.has(newItem.name)) {
        current.push(newItem);
      }
    }
  } catch (err: any) {
    // fall back to regular loadDir for error handling (nav up, toast)
    loadDir();
  }
}

defineExpose({
  refresh: loadDir,
  silentRefresh,
  selectedItems,
  triggerFileInput: () => fileInputEl.value?.click(),
  doSearch,
  clearSearch,
  searchQuery,
  searchResults,
});

watch(
  () => props.currentPath,
  () => {
    clearSearch();
    loadDir();
  },
  { immediate: true },
);

// ── Selection ──────────────────────────────────────────────────────────────

// Keyboard navigation
const focusedIndex = ref(-1);

function onKeyDown(e: KeyboardEvent) {
  const items = displayItems.value;
  if (items.length === 0) return;
  const hasUpRow = !!props.currentPath && !hasSearched.value;

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (focusedIndex.value < items.length - 1) {
        focusedIndex.value++;
        if (e.shiftKey) {
          if (focusedIndex.value >= 0) selectedItems.add(items[focusedIndex.value].name);
        } else {
          selectedItems.clear();
          if (focusedIndex.value >= 0) selectedItems.add(items[focusedIndex.value].name);
        }
        if (focusedIndex.value >= 0) lastClickedItem.value = items[focusedIndex.value].name;
        scrollIntoView(focusedIndex.value);
      } else if (focusedIndex.value === -1 && hasUpRow) {
        // From "go up" row to first item
        focusedIndex.value = 0;
        selectedItems.clear();
        selectedItems.add(items[0].name);
        lastClickedItem.value = items[0].name;
        scrollIntoView(0);
      }
      break;
    case "ArrowUp":
      e.preventDefault();
      if (focusedIndex.value > 0) {
        focusedIndex.value--;
        if (e.shiftKey) {
          selectedItems.add(items[focusedIndex.value].name);
        } else {
          selectedItems.clear();
          selectedItems.add(items[focusedIndex.value].name);
        }
        lastClickedItem.value = items[focusedIndex.value].name;
        scrollIntoView(focusedIndex.value);
      } else if (focusedIndex.value === 0) {
        // From first item to "go up" row
        if (hasUpRow) {
          focusedIndex.value = -1;
          selectedItems.clear();
        } else {
          // No up row, stay at 0
        }
      }
      break;
    case " ": // Space
      e.preventDefault();
      if (focusedIndex.value === -1 && hasUpRow) {
        // On "go up" row — navigate up
        navigateUp();
      } else if (focusedIndex.value >= 0 && focusedIndex.value < items.length) {
        const item = items[focusedIndex.value];
        if (!selectedItems.has(item.name)) {
          selectedItems.clear();
          selectedItems.add(item.name);
        }
        // Position context menu near the focused row
        const rowEl = document.querySelector<HTMLElement>(
          `.fmp-wrap[tabindex] .fmp-row:nth-child(${focusedIndex.value + 2})`, // +2 for header + go-up
        );
        if (rowEl) {
          const rect = rowEl.getBoundingClientRect();
          ctxMenu.value = {
            visible: true,
            x: Math.min(rect.left + rect.width / 2 - 105, window.innerWidth - 210),
            y: Math.min(rect.top, window.innerHeight - 270),
            item,
          };
        } else {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          ctxMenu.value = {
            visible: true,
            x: Math.min(rect.left + rect.width / 2 - 105, window.innerWidth - 210),
            y: Math.min(rect.top + rect.height / 3, window.innerHeight - 270),
            item,
          };
        }
        // Focus first context menu item
        nextTick(() => focusCtxItem(0));
      }
      break;
    case "Enter":
      e.preventDefault();
      if (focusedIndex.value === -1 && hasUpRow) {
        navigateUp();
      } else if (focusedIndex.value >= 0 && focusedIndex.value < items.length) {
        const item = items[focusedIndex.value];
        if (item.type === "directory") {
          navigate(childPath(item.name));
        } else {
          const handler = getFileHandler(item);
          if (handler) handler.action(item);
        }
      }
      break;
    case "Backspace":
      e.preventDefault();
      if (props.currentPath) navigateUp();
      break;
  }
}

function scrollIntoView(index: number) {
  nextTick(() => {
    const panel = document.querySelector(`.fmp-wrap[tabindex]`);
    if (!panel) return;
    const rows = panel.querySelectorAll(".fmp-row");
    const target = rows[index];
    if (target) target.scrollIntoView({ block: "nearest" });
  });
}

// Reset keyboard focus when items change (new directory loaded)
watch(displayItems, () => {
  focusedIndex.value = -1;
});

function onRowClick(e: MouseEvent, item: FileItem) {
  // Activate this panel
  emit("activate");
  // Sync keyboard focus with mouse click
  const idx = displayItems.value.findIndex((i) => i.name === item.name);
  if (idx >= 0) focusedIndex.value = idx;

  if (e.shiftKey && lastClickedItem.value) {
    const names = sortedItems.value.map((i) => i.name);
    const a = names.indexOf(lastClickedItem.value);
    const b = names.indexOf(item.name);
    if (a !== -1 && b !== -1) {
      const [from, to] = a < b ? [a, b] : [b, a];
      if (!e.ctrlKey && !e.metaKey) selectedItems.clear();
      for (let i = from; i <= to; i++) selectedItems.add(names[i]);
      return;
    }
  }
  if (e.ctrlKey || e.metaKey) {
    if (selectedItems.has(item.name)) selectedItems.delete(item.name);
    else selectedItems.add(item.name);
  } else {
    selectedItems.clear();
    selectedItems.add(item.name);
  }
  lastClickedItem.value = item.name;
}

function onRowDblClick(_e: MouseEvent, item: FileItem) {
  if (item.type === "directory") {
    navigate(childPath(item.name));
    return;
  }
  const handler = getFileHandler(item);
  if (handler) handler.action(item);
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

// ── Drag-and-drop ──────────────────────────────────────────────────────────

function onRowDragStart(e: DragEvent, item: FileItem) {
  if (!props.isAdmin) {
    e.preventDefault();
    return;
  }
  const paths = selectedItems.has(item.name)
    ? Array.from(selectedItems).map(childPath)
    : [childPath(item.name)];
  e.dataTransfer!.effectAllowed = "all";
  e.dataTransfer!.setData("application/x-fm-paths", JSON.stringify(paths));

  const audioExts = [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".opus"];
  const ext = "." + item.name.split(".").pop()?.toLowerCase();
  if (audioExts.includes(ext)) {
    const tracks = selectedItems.has(item.name)
      ? Array.from(selectedItems)
          .filter((n) => {
            const e2 = "." + n.split(".").pop()?.toLowerCase();
            return audioExts.includes(e2);
          })
          .map((n) => ({ url: downloadUrl(n), name: n }))
      : [{ url: downloadUrl(item.name), name: item.name }];
    setPendingDragTracks(
      tracks.map((t) => ({
        url: t.url,
        metaData: { artist: "", title: t.name },
      })),
    );
  }
}

function onRowDragOver(e: DragEvent, item: FileItem) {
  if (!props.isAdmin || item.type !== "directory") return;
  if (!e.dataTransfer) return;
  currentDragEl.value = e.currentTarget as HTMLElement;
  if (!e.dataTransfer.types.includes("application/x-fm-paths")) return;
  dropTargetRow.value = item.name;
  const copy = e.ctrlKey || e.shiftKey || isCopyKey.value;
  e.dataTransfer.dropEffect = copy ? "copy" : "move";
}

function onRowDragLeave(e: DragEvent, item: FileItem) {
  if (
    dropTargetRow.value === item.name &&
    !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)
  ) {
    dropTargetRow.value = null;
    currentDragEl.value = null;
  }
}

function onRowDrop(e: DragEvent, item: FileItem) {
  dropTargetRow.value = null;
  currentDragEl.value = null;
  if (!props.isAdmin || item.type !== "directory") return;
  const fmData = e.dataTransfer?.getData("application/x-fm-paths");
  if (!fmData) return;
  try {
    const sources: string[] = JSON.parse(fmData);
    const copy = e.ctrlKey || e.shiftKey || isCopyKey.value;
    emit("transfer", { sources, dest: childPath(item.name), copy });
  } catch {
    /* ignore */
  }
}

function onParentDragOver(e: DragEvent) {
  if (!props.isAdmin) return;
  if (!e.dataTransfer) return;
  e.preventDefault();
  currentDragEl.value = e.currentTarget as HTMLElement;
  if (!e.dataTransfer.types.includes("application/x-fm-paths")) return;
  dropTargetRow.value = "..";
  const copy = e.ctrlKey || e.shiftKey || isCopyKey.value;
  e.dataTransfer.dropEffect = copy ? "copy" : "move";
}

function onParentDragLeave(e: DragEvent) {
  if (
    dropTargetRow.value === ".." &&
    !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)
  ) {
    dropTargetRow.value = null;
    currentDragEl.value = null;
  }
}

function onParentDrop(e: DragEvent) {
  dropTargetRow.value = null;
  currentDragEl.value = null;
  if (!props.isAdmin) return;
  const fmData = e.dataTransfer?.getData("application/x-fm-paths");
  if (!fmData) return;
  try {
    const sources: string[] = JSON.parse(fmData);
    const segs = (props.currentPath || "").split("/").filter(Boolean).slice(0, -1);
    const dest = segs.join("/");
    const copy = e.ctrlKey || e.shiftKey || isCopyKey.value;
    emit("transfer", { sources, dest, copy });
  } catch {
    /* ignore */
  }
}

function onDragLeave(e: DragEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
    dragging.value = false;
    currentDragEl.value = null;
  }
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  currentDragEl.value = null;
  if (!props.isAdmin || readOnlyActive.value) return;
  const fmData = e.dataTransfer?.getData("application/x-fm-paths");
  if (fmData) {
    try {
      const sources: string[] = JSON.parse(fmData);
      const copy = e.ctrlKey || e.shiftKey || isCopyKey.value;
      emit("transfer", { sources, dest: props.currentPath, copy });
    } catch {
      /* ignore */
    }
    return;
  }
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) emit("upload-files", files);
}

function onFilesChosen(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (files?.length) emit("upload-files", Array.from(files));
  (e.target as HTMLInputElement).value = "";
}

// ── Utility functions (pure, no instance deps beyond props) ─────────────────

const WINAMP_EXTS = new Set(["mp3", "wav", "flac", "ogg", "m4a", "opus", "aac", "wma"]);

function isAudioFile(item: FileItem): boolean {
  if (item.type !== "file") return false;
  const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
  return WINAMP_EXTS.has(ext);
}

function isMp3Name(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "mp3";
}

function isMp3(item: FileItem | null): boolean {
  return item?.type === "file" && isMp3Name(item.name);
}

function isWebampAudio(item: FileItem | null): boolean {
  if (!item || item.type !== "file") return false;
  const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
  return WINAMP_EXTS.has(ext);
}

const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg|ico|tiff?)$/i;
const VIDEO_RE = /\.(mp4|webm|ogg|ogv|mov|m4v)$/i;
const TEXT_EDIT_RE = /\.(txt|cfg|conf|ini|log|json|yaml|yml|toml|md|env|sh|csv)$/i;
const COMIC_EXTS = new Set(["cbr", "cbz", "pdf"]);

function isImage(item: FileItem | null): boolean {
  return item?.type === "file" && IMAGE_RE.test(item.name);
}
function isVideo(item: FileItem | null): boolean {
  return item?.type === "file" && VIDEO_RE.test(item.name);
}
function isTextEditable(item: FileItem | null): boolean {
  return item?.type === "file" && TEXT_EDIT_RE.test(item.name);
}
function isComicFile(item: FileItem | null): boolean {
  if (!item || item.type !== "file" || item.isRemoteMount) return false;
  const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
  return COMIC_EXTS.has(ext);
}
function isArchive(name: string): boolean {
  const lower = name.toLowerCase();
  return props.extractExtensions.some((ext) => lower.endsWith(ext));
}
function archiveBasename(name: string): string {
  return name
    .replace(/\.(tar\.gz|tar\.bz2|tar\.xz|tar\.lzma|tar\.z|part\d+\.rar)$/i, "")
    .replace(/\.[^.]+$/, "");
}

function fileIcon(item: FileItem): string {
  if (item.isRemoteMount) return "mdi-folder-network fm-icon-dir";
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
    return "—";
  }
}

const config = useRuntimeConfig();
function downloadUrl(filename: string): string {
  const base = (config.public.apiBase as string) || "";
  const rel = props.currentPath ? `${props.currentPath}/${filename}` : filename;
  const auth = useAuth();
  return `${base}/api/files/download?path=${encodeURIComponent(rel)}&token=${encodeURIComponent(auth.token.value || "")}`;
}

// ── File handler mapping ───────────────────────────────────────────────────
interface FileHandler {
  exts: RegExp;
  action: (item: FileItem) => void;
}

const FILE_HANDLERS: FileHandler[] = [
  { exts: IMAGE_RE, action: (item) => emit("open-image-preview", item) },
  { exts: TEXT_EDIT_RE, action: (item) => emit("open-text-editor", item) },
  { exts: VIDEO_RE, action: (item) => emit("open-video-preview", item) },
  {
    exts: /\.(mp3|wav|flac|ogg|m4a|opus|aac|wma)$/i,
    action: (item) => emit("play-in-webamp", item),
  },
  { exts: /\.(cbr|cbz|pdf)$/i, action: (item) => emit("open-comic", item) },
];

function getFileHandler(item: FileItem): FileHandler | undefined {
  if (item.type !== "file") return undefined;
  return FILE_HANDLERS.find((h) => h.exts.test(item.name));
}

// ── Keyboard escape ────────────────────────────────────────────────────────
onMounted(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") hideCtxMenu();
  };

  // Track Ctrl/Shift for drag-and-drop copy mode
  const onDndKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Control" || e.key === "Shift") {
      isCopyKey.value = true;
      if (currentDragEl.value) {
        currentDragEl.value.dispatchEvent(
          new DragEvent("dragover", { bubbles: true, cancelable: true }),
        );
      }
    }
  };
  const onDndKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Control" || e.key === "Shift") {
      isCopyKey.value = false;
      if (currentDragEl.value) {
        currentDragEl.value.dispatchEvent(
          new DragEvent("dragover", { bubbles: true, cancelable: true }),
        );
      }
    }
  };
  const clickOutside = (e: MouseEvent) => {
    if (ctxMenu.value.visible && ctxMenuRef.value && !ctxMenuRef.value.contains(e.target as Node)) {
      hideCtxMenu();
    }
  };
  window.addEventListener("keydown", handler);
  window.addEventListener("keydown", onDndKeyDown);
  window.addEventListener("keyup", onDndKeyUp);
  document.addEventListener("mousedown", clickOutside);
  // Cleanup
  onUnmounted(() => {
    window.removeEventListener("keydown", handler);
    window.removeEventListener("keydown", onDndKeyDown);
    window.removeEventListener("keyup", onDndKeyUp);
    document.removeEventListener("mousedown", clickOutside);
  });
});
</script>

<style lang="scss" scoped>
/* ── Panel wrapper ────────────────────────────────────────────────── */
.fmp-wrap {
  position: relative;
  border: 2px solid transparent;
  border-radius: 6px;
  transition: border-color 0.2s;
  overflow: auto;
  flex: 1;
  min-height: 120px;
  container-type: inline-size;
  outline: 1px solid var(--s-table-border);
  outline-offset: -1px;
}
.fmp-wrap.is-active {
  outline-color: var(--s-accent);
  outline-width: 1px;
}
.fmp-wrap.fmp-drag-over {
  border-color: var(--s-accent);
}

/* Loading overlay */
.fmp-loading-overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--s-bg-surface) 80%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 15;
  border-radius: 4px;
  pointer-events: all;
}
.fmp-drop-overlay {
  position: absolute;
  inset: 0;
  background: var(--s-accent-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  z-index: 20;
  border-radius: 4px;
  pointer-events: none;
  color: var(--s-accent);
  font-size: 1rem;
}

/* Table */
.fmp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  margin-bottom: 0;
}
.fmp-table thead th {
  background: var(--s-table-header-bg);
  color: var(--s-text-secondary);
  font-weight: 600;
  font-size: 0.8rem;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--s-table-border);
  text-align: left;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}
.fmp-table tbody td {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--s-border-light);
  color: var(--s-text);
  vertical-align: middle;
}
.fmp-table tbody tr:nth-child(even) td {
  background: var(--s-table-stripe-bg);
}
.fmp-table tbody tr {
  transition: background 0.1s;
}
.fmp-table tbody tr:hover td {
  background: var(--s-table-hover-bg);
}

.fmp-name-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.fmp-icon {
  font-size: 1.15rem;
  flex-shrink: 0;
}
.fm-icon-dir {
  color: var(--s-warning, #f0a329);
}
.fmp-icon-winamp {
  width: 1.2rem;
  height: 1.2rem;
  object-fit: contain;
}
.fmp-icon-comic {
  width: 1.2rem;
  height: 1.2rem;
  object-fit: contain;
}
.fmp-filename {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 80%;
  display: inline-block;
  vertical-align: bottom;
}
.fmp-th-size {
  width: 90px;
}
.fmp-th-date {
  width: 160px;
}
.fmp-row {
  cursor: pointer;
  user-select: none;
}
.fmp-row.is-drop-target {
  background: color-mix(in oklab, var(--s-accent) 14%, transparent) !important;
  outline: 2px solid var(--s-accent);
  outline-offset: -2px;
}
.fmp-row.is-drop-target-copy {
  background: color-mix(in oklab, var(--s-success, #22c55e) 12%, transparent);
  outline-color: var(--s-success, #22c55e);
}
.fmp-row.is-selected td {
  background: var(--s-accent-subtle) !important;
  color: var(--s-text);
}
.fmp-row.is-keyboard-focused {
  outline: 1px solid var(--s-accent);
  outline-offset: 0px;
}
.fmp-sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: inherit;
  color: var(--s-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.fmp-sort-btn:hover {
  color: var(--s-text);
}
.fmp-sort-btn.is-active {
  color: var(--s-accent);
  font-weight: 600;
}
.fmp-sort-btn .mdi {
  font-size: 0.85rem;
  opacity: 0.6;
}
.fmp-sort-btn.is-active .mdi {
  opacity: 1;
}

/* Mobile cards */
.fmp-mobile-list {
  display: flex;
  flex-direction: column;
  padding: 0.4rem;
  gap: 0.4rem;
}
.fmp-mobile-up {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.6rem;
  font-size: 0.875rem;
  cursor: pointer;
  border-radius: 6px;
  opacity: 0.65;
  transition: background 0.1s;
}
.fmp-mobile-up:hover {
  background: var(--s-bg-hover);
  opacity: 1;
}
.fmp-mobile-card {
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s;
}
.fmp-mobile-card.is-open {
  border-color: color-mix(in oklab, var(--s-accent) 40%, var(--s-border));
}
.fmp-mc-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.75rem;
}
.fmp-mc-name {
  flex: 1;
  font-size: 0.875rem;
  word-break: break-word;
  line-height: 1.35;
}
.fmp-mc-size {
  font-size: 0.75rem;
  color: var(--s-text-muted);
  flex-shrink: 0;
}
.fmp-mc-chevron {
  font-size: 1rem;
  color: var(--s-text-muted);
  flex-shrink: 0;
}
.fmp-mc-panel {
  border-top: 1px solid var(--s-border);
  display: flex;
  flex-direction: column;
}
.fmp-mc-action {
  display: flex;
  align-items: center;
  padding: 0.6rem 0.9rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--s-text);
  text-align: left;
  text-decoration: none;
  transition: background 0.1s;
  width: 100%;
}
.fmp-mc-action:hover {
  background: var(--s-bg-hover);
}
.fmp-mc-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}
.fmp-mc-action--accent {
  color: var(--s-accent);
}
.fmp-mc-action--danger {
  color: var(--s-danger);
}
.fmp-mc-sep {
  height: 1px;
  background: var(--s-border);
  margin: 2px 0;
}
.fmp-empty-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 0.5rem;
}

/* Context menu */
.fmp-ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 190px;
  background: color-mix(in oklab, var(--s-bg-surface) 45%, transparent);
  backdrop-filter: blur(5px);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  padding: 4px 0;
  user-select: none;
}
.fmp-ctx-header {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--s-text-muted);
  padding: 6px 14px 4px;
}
.fmp-ctx-sep {
  height: 1px;
  background: var(--s-border);
  margin: 4px 0;
  & + .fmp-ctx-sep {
    display: none;
  }
}
.fmp-ctx-item {
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
.fmp-ctx-item:hover {
  background: var(--s-bg-hover);
}
.fmp-ctx-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}
.fmp-ctx-item:focus-visible {
  outline: 2px solid var(--s-accent);
  outline-offset: -2px;
  background: var(--s-bg-hover);
}
.fmp-ctx-item--accent {
  color: var(--s-accent);
}
.fmp-ctx-item--danger {
  color: var(--s-danger);
}

/* ── Responsive columns — hide size/date when panel < 650px ─────── */
@container (max-width: 649px) {
  .fmp-col-size,
  .fmp-col-date {
    display: none;
  }
}
</style>
