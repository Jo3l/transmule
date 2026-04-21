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
        <!-- Tree toggle -->
        <button
          class="fm-tree-toggle"
          :class="{ 'is-active': treeVisible }"
          :title="$t('fileManager.folderTree')"
          @click.stop="treeVisible = !treeVisible"
        >
          <span class="mdi mdi-file-tree" />
        </button>
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
          <SButton v-if="isAdmin" size="sm" @click="showNewFolderDialog = true">
            <span class="mdi mdi-folder-plus mr-1" />{{ $t("fileManager.newFolder") }}
          </SButton>
          <SButton v-if="isAdmin" size="sm" @click="triggerFileInput">
            <span class="mdi mdi-upload mr-1" />{{ $t("fileManager.upload") }}
          </SButton>
          <SButton
            v-if="isAdmin && selectedFiles.length > 0"
            size="sm"
            variant="primary"
            @click="startSmartRenameForPaths(selectedFiles)"
          >
            <span class="mdi mdi-auto-fix mr-1" />{{ $t("fileManager.smartRename") }}
          </SButton>
          <SButton
            v-if="isAdmin && selectedItems.size > 1"
            size="sm"
            @click="openTransferDialog(Array.from(selectedItems).map(childPath), 'move')"
          >
            <span class="mdi mdi-folder-move mr-1" />
            {{ $t("fileManager.moveSelected", { count: selectedItems.size }) }}
          </SButton>
          <SButton v-if="selectedItems.size > 0" size="sm" @click="openCompressDialog">
            <span class="mdi mdi-archive-arrow-up-outline mr-1" />
            {{ $t("fileManager.compressSelected", { count: selectedItems.size }) }}
          </SButton>
          <SButton
            v-if="isAdmin && selectedItems.size > 0"
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

      <!-- ── Body: tree column + file table ─────────────────────────────── -->
      <div class="fm-body">
        <!-- Folder tree sidebar column -->
        <FolderTreeSidebar
          v-if="treeVisible"
          ref="folderTreeRef"
          :current-path="currentPath"
          @navigate="navigate"
          @close="treeVisible = false"
          @transfer="onTreeTransfer"
          @ctx-menu="onTreeCtxMenu"
        />

        <!-- File table with drag-and-drop -->
        <div
          class="fm-table-wrap"
          :class="{ 'fm-drag-over': dragging }"
          @click="
            selectedItems.clear();
            lastClickedItem = null;
          "
          @dragover.prevent="
            (e: DragEvent) => {
              if (isAdmin && !e.dataTransfer?.types.includes('application/x-fm-paths'))
                dragging = true;
            }
          "
          @dragleave="onDragLeave"
          @drop.prevent="onDrop"
        >
          <!-- Drop overlay -->
          <div v-if="dragging" class="fm-drop-overlay">
            <span class="mdi mdi-cloud-upload icon-2xl" />
            <div>{{ $t("fileManager.dropToUpload") }}</div>
          </div>

          <!-- Loading overlay: locks and dims the list while fetching -->
          <div v-if="loading" class="fm-loading-overlay">
            <span class="mdi mdi-loading mdi-spin s-loading-spinner" />
          </div>

          <!-- ── Mobile file cards (≤768px) ──────────────────────────── -->
          <div class="is-hidden-tablet fm-mobile-list">
            <div v-if="currentPath" class="fm-mobile-up" @click.stop="navigateUp">
              <span class="mdi mdi-arrow-up-bold-circle fm-icon has-text-grey" />
              <span class="has-text-grey">{{ $t("fileManager.goUp") }}</span>
            </div>
            <div
              v-if="!loading && sortedItems.length === 0"
              class="has-text-centered has-text-grey py-5"
            >
              <span class="mdi mdi-folder-open-outline fm-empty-icon" />
              {{ $t("fileManager.empty") }}
            </div>
            <div
              v-for="item in sortedItems"
              :key="item.name"
              class="fm-mobile-card"
              :class="{ 'is-open': mobileOpenedItem === item.name }"
              @click.stop="onMobileCardTap(item)"
            >
              <div class="fm-mc-header">
                <span class="mdi fm-icon" :class="fileIcon(item)" />
                <span class="fm-mc-name">{{ item.name }}</span>
                <span class="fm-mc-size">{{ item.type === "file" ? fmtSize(item.size) : "" }}</span>
                <span
                  class="mdi fm-mc-chevron"
                  :class="mobileOpenedItem === item.name ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                />
              </div>
              <div v-if="mobileOpenedItem === item.name" class="fm-mc-panel" @click.stop>
                <!-- Open (directory only) -->
                <button
                  v-if="item.type === 'directory'"
                  class="fm-mc-action"
                  @click="
                    navigate(childPath(item.name));
                    mobileOpenedItem = null;
                  "
                >
                  <span class="mdi mdi-folder-open mr-2" />{{ $t("fileManager.ctxOpen") }}
                </button>
                <!-- View image -->
                <button
                  v-if="isImage(item)"
                  class="fm-mc-action fm-mc-action--accent"
                  @click="
                    openImagePreview(item);
                    mobileOpenedItem = null;
                  "
                >
                  <span class="mdi mdi-image-outline mr-2" />{{ $t("fileManager.viewImage") }}
                </button>
                <!-- Play video -->
                <button
                  v-if="isVideo(item)"
                  class="fm-mc-action fm-mc-action--accent"
                  @click="
                    openVideoPreview(item);
                    mobileOpenedItem = null;
                  "
                >
                  <span class="mdi mdi-play-circle-outline mr-2" />{{ $t("fileManager.playVideo") }}
                </button>
                <!-- Play in Webamp -->
                <button
                  v-if="isMp3(item)"
                  class="fm-mc-action fm-mc-action--accent"
                  @click="
                    openInWebamp(item);
                    mobileOpenedItem = null;
                  "
                >
                  <span class="mdi mdi-play mr-2" />{{ $t("fileManager.playInWebamp") }}
                </button>
                <!-- Download (file only) -->
                <a
                  v-if="item.type === 'file'"
                  class="fm-mc-action"
                  :href="downloadUrl(item.name)"
                  @click="mobileOpenedItem = null"
                >
                  <span class="mdi mdi-download mr-2" />{{ $t("fileManager.download") }}
                </a>
                <!-- Smart rename (admin + file) -->
                <button
                  v-if="isAdmin && item.type === 'file'"
                  class="fm-mc-action fm-mc-action--accent"
                  @click="
                    startSmartRenameForPaths([childPath(item.name)]);
                    mobileOpenedItem = null;
                  "
                >
                  <span class="mdi mdi-auto-fix mr-2" />{{ $t("fileManager.smartRename") }}
                </button>
                <!-- Move (admin) -->
                <button
                  v-if="isAdmin"
                  class="fm-mc-action"
                  @click="
                    openTransferDialog([childPath(item.name)], 'move');
                    mobileOpenedItem = null;
                  "
                >
                  <span class="mdi mdi-folder-move mr-2" />{{ $t("fileManager.move") }}
                </button>
                <!-- Copy -->
                <button
                  class="fm-mc-action"
                  @click="
                    openTransferDialog([childPath(item.name)], 'copy');
                    mobileOpenedItem = null;
                  "
                >
                  <span class="mdi mdi-content-copy mr-2" />{{ $t("fileManager.copy") }}
                </button>
                <!-- Compress -->
                <button
                  class="fm-mc-action"
                  @click="
                    openCompressDialogForSources([childPath(item.name)], item.name);
                    mobileOpenedItem = null;
                  "
                >
                  <span class="mdi mdi-archive-arrow-up-outline mr-2" />{{
                    $t("fileManager.compress")
                  }}
                </button>
                <!-- Archive actions -->
                <template v-if="item.type === 'file' && isArchive(item.name)">
                  <div class="fm-mc-sep" />
                  <button
                    class="fm-mc-action"
                    @click="
                      doExtractHere(childPath(item.name));
                      mobileOpenedItem = null;
                    "
                  >
                    <span class="mdi mdi-archive-arrow-down-outline mr-2" />{{
                      $t("fileManager.extractHere")
                    }}
                  </button>
                  <button
                    class="fm-mc-action"
                    @click="
                      doExtractToFolder(childPath(item.name), archiveBasename(item.name));
                      mobileOpenedItem = null;
                    "
                  >
                    <span class="mdi mdi-archive-arrow-down-outline mr-2" />{{
                      $t("fileManager.extractToFolder", { name: archiveBasename(item.name) })
                    }}
                  </button>
                  <button
                    class="fm-mc-action"
                    @click="
                      openExtractDialog(childPath(item.name));
                      mobileOpenedItem = null;
                    "
                  >
                    <span class="mdi mdi-archive-arrow-down-outline mr-2" />{{
                      $t("fileManager.extractTo")
                    }}
                  </button>
                </template>
                <!-- Rename (admin) -->
                <div v-if="isAdmin" class="fm-mc-sep" />
                <button
                  v-if="isAdmin"
                  class="fm-mc-action"
                  @click="
                    startRename(item);
                    mobileOpenedItem = null;
                  "
                >
                  <span class="mdi mdi-pencil mr-2" />{{ $t("fileManager.rename") }}
                </button>
                <!-- Delete (admin) -->
                <button
                  v-if="isAdmin"
                  class="fm-mc-action fm-mc-action--danger"
                  @click="
                    confirmDeleteOne(item);
                    mobileOpenedItem = null;
                  "
                >
                  <span class="mdi mdi-delete mr-2" />{{ $t("fileManager.delete") }}
                </button>
              </div>
            </div>
          </div>

          <table v-if="!loading || items.length" class="fm-table is-hidden-mobile">
            <thead>
              <tr>
                <th>
                  <button
                    class="fm-sort-btn"
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
                <th class="has-text-right fm-th-size">
                  <button
                    class="fm-sort-btn"
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
                <th class="is-hidden-mobile fm-th-date">
                  <button
                    class="fm-sort-btn"
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
              <!-- Go up -->
              <tr v-if="currentPath" class="fm-up-row">
                <td colspan="3">
                  <a class="fm-name-cell" @click.prevent="navigateUp">
                    <span class="mdi mdi-arrow-up-bold-circle fm-icon has-text-grey" />
                    <span class="has-text-grey">{{ $t("fileManager.goUp") }}</span>
                  </a>
                </td>
              </tr>

              <!-- Directory / file rows -->
              <tr
                v-for="item in sortedItems"
                :key="item.name"
                :draggable="isAdmin"
                :class="{
                  'is-selected': selectedItems.has(item.name),
                  'is-drop-target':
                    isAdmin && item.type === 'directory' && dropTargetRow === item.name,
                }"
                class="fm-row"
                @click.stop="onRowClick($event, item)"
                @contextmenu.prevent="onRowContextMenu($event, item)"
                @dragstart="onRowDragStart($event, item)"
                @dragover.prevent="item.type === 'directory' && onRowDragOver($event, item)"
                @dragleave="onRowDragLeave($event, item)"
                @drop.prevent="item.type === 'directory' && onRowDrop($event, item)"
              >
                <td>
                  <span class="fm-name-cell">
                    <span class="mdi fm-icon" :class="fileIcon(item)" />
                    <a
                      v-if="item.type === 'directory'"
                      @click.prevent="handleFolderClick($event, item)"
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
                <td colspan="3" class="has-text-centered has-text-grey py-5">
                  <span class="mdi mdi-folder-open-outline fm-empty-icon" />
                  {{ $t("fileManager.empty") }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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

  <!-- ── Image preview dialog ──────────────────────────────────────────── -->
  <SDialog v-model="showImageDialog" :title="previewImageName" width="90vw">
    <div class="fm-img-preview">
      <button
        v-if="previewImages.length > 1"
        class="fm-img-nav fm-img-nav--prev"
        :disabled="previewIndex === 0"
        @click="prevImage"
      >
        <span class="mdi mdi-chevron-left" />
      </button>
      <img :src="previewImageUrl" :alt="previewImageName" class="fm-img-preview__img" />
      <button
        v-if="previewImages.length > 1"
        class="fm-img-nav fm-img-nav--next"
        :disabled="previewIndex === previewImages.length - 1"
        @click="nextImage"
      >
        <span class="mdi mdi-chevron-right" />
      </button>
    </div>
    <div v-if="previewImages.length > 1" class="fm-img-counter">
      {{ previewIndex + 1 }} / {{ previewImages.length }}
    </div>
    <template #footer>
      <div class="flex-end gap-sm">
        <a class="s-btn" :href="previewImageUrl" download @click="showImageDialog = false">
          <span class="mdi mdi-download mr-1" />{{ $t("fileManager.download") }}
        </a>
        <SButton @click="showImageDialog = false">{{ $t("fileManager.cancel") }}</SButton>
      </div>
    </template>
  </SDialog>

  <!-- ── Video preview dialog ──────────────────────────────────────────── -->
  <SDialog
    v-model="showVideoDialog"
    :title="previewVideoName"
    width="90vw"
    @update:model-value="onVideoDialogClose"
  >
    <div class="fm-video-preview">
      <video
        ref="videoEl"
        :src="previewVideoUrl"
        class="fm-video-preview__video"
        controls
        autoplay
      />
    </div>
    <template #footer>
      <div class="flex-end gap-sm">
        <a class="s-btn" :href="previewVideoUrl" download @click="showVideoDialog = false">
          <span class="mdi mdi-download mr-1" />{{ $t("fileManager.download") }}
        </a>
        <SButton @click="showVideoDialog = false">{{ $t("fileManager.cancel") }}</SButton>
      </div>
    </template>
  </SDialog>

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

      <!-- View image (browser-supported images only) -->
      <button
        v-if="!ctxIsMulti && isImage(ctxMenu.item)"
        class="fm-ctx-item fm-ctx-item--accent"
        @click="
          openImagePreview(ctxMenu.item!);
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-image-outline mr-2" />{{ $t("fileManager.viewImage") }}
      </button>

      <!-- Play video -->
      <button
        v-if="!ctxIsMulti && isVideo(ctxMenu.item)"
        class="fm-ctx-item fm-ctx-item--accent"
        @click="
          openVideoPreview(ctxMenu.item!);
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-play-circle-outline mr-2" />{{ $t("fileManager.playVideo") }}
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

      <!-- Play all MP3s with Webamp — multi selection -->
      <button
        v-if="ctxIsMulti && selectedMp3s.length > 0"
        class="fm-ctx-item fm-ctx-item--accent"
        @click="
          openMp3sInWebamp(selectedMp3s);
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-playlist-play mr-2" />
        {{ $t("fileManager.playAllWithWebamp", { count: selectedMp3s.length }) }}
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
        v-if="isAdmin && !ctxIsMulti && ctxMenu.item?.type === 'file'"
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
        v-if="isAdmin && ctxIsMulti && selectedFiles.length > 0"
        class="fm-ctx-item fm-ctx-item--accent"
        @click="
          startSmartRenameForPaths(selectedFiles);
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-auto-fix mr-2" />
        {{ $t("fileManager.smartRenameSelected", { count: selectedFiles.length }) }}
      </button>

      <!-- Move / Copy — single item -->
      <button
        v-if="isAdmin && !ctxIsMulti"
        class="fm-ctx-item"
        @click="
          openTransferDialog([childPath(ctxMenu.item!.name)], 'move');
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-folder-move mr-2" />{{ $t("fileManager.move") }}
      </button>
      <button
        v-if="!ctxIsMulti"
        class="fm-ctx-item"
        @click="
          openTransferDialog([childPath(ctxMenu.item!.name)], 'copy');
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-content-copy mr-2" />{{ $t("fileManager.copy") }}
      </button>

      <!-- Compress — single item -->
      <button
        v-if="!ctxIsMulti"
        class="fm-ctx-item"
        @click="
          openCompressDialogForSources([childPath(ctxMenu.item!.name)], ctxMenu.item!.name);
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-archive-arrow-up-outline mr-2" />{{ $t("fileManager.compress") }}
      </button>

      <!-- Extract (archive files only) -->
      <template v-if="!ctxIsMulti && ctxMenu.item?.type === 'file' && isArchive(ctxMenu.item.name)">
        <div class="fm-ctx-sep" />
        <button
          class="fm-ctx-item"
          @click="
            doExtractHere(childPath(ctxMenu.item!.name));
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-archive-arrow-down-outline mr-2" />{{
            $t("fileManager.extractHere")
          }}
        </button>
        <button
          class="fm-ctx-item"
          @click="
            doExtractToFolder(childPath(ctxMenu.item!.name), archiveBasename(ctxMenu.item!.name));
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-archive-arrow-down-outline mr-2" />
          {{ $t("fileManager.extractToFolder", { name: archiveBasename(ctxMenu.item!.name) }) }}
        </button>
        <button
          class="fm-ctx-item"
          @click="
            openExtractDialog(childPath(ctxMenu.item!.name));
            hideCtxMenu();
          "
        >
          <span class="mdi mdi-archive-arrow-down-outline mr-2" />{{ $t("fileManager.extractTo") }}
        </button>
        <div class="fm-ctx-sep" />
      </template>

      <!-- Move / Copy — multi-selection -->
      <button
        v-if="isAdmin && ctxIsMulti"
        class="fm-ctx-item"
        @click="
          openTransferDialog(Array.from(selectedItems).map(childPath), 'move');
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-folder-move mr-2" />{{
          $t("fileManager.moveSelected", { count: selectedItems.size })
        }}
      </button>
      <button
        v-if="ctxIsMulti"
        class="fm-ctx-item"
        @click="
          openTransferDialog(Array.from(selectedItems).map(childPath), 'copy');
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-content-copy mr-2" />{{
          $t("fileManager.copySelected", { count: selectedItems.size })
        }}
      </button>
      <button
        v-if="ctxIsMulti"
        class="fm-ctx-item"
        @click="
          openCompressDialog();
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-archive-arrow-up-outline mr-2" />{{
          $t("fileManager.compressSelected", { count: selectedItems.size })
        }}
      </button>

      <!-- Rename — single item -->
      <button
        v-if="isAdmin && !ctxIsMulti"
        class="fm-ctx-item"
        @click="
          startRename(ctxMenu.item!);
          hideCtxMenu();
        "
      >
        <span class="mdi mdi-pencil mr-2" />{{ $t("fileManager.rename") }}
      </button>

      <div v-if="isAdmin" class="fm-ctx-sep" />

      <!-- Delete single -->
      <button
        v-if="isAdmin && !ctxIsMulti"
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
        v-if="isAdmin && ctxIsMulti"
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

  <!-- ── Tree folder context menu ────────────────────────────────────────── -->
  <Teleport to="body">
    <div
      v-if="treeCtxMenu.visible"
      class="fm-ctx-menu"
      :style="{ top: treeCtxMenu.y + 'px', left: treeCtxMenu.x + 'px' }"
      @click.stop
    >
      <!-- Open -->
      <button
        class="fm-ctx-item"
        @click="
          navigate(treeCtxMenu.path);
          hideTreeCtxMenu();
        "
      >
        <span class="mdi mdi-folder-open mr-2" />{{ $t("fileManager.ctxOpen") }}
      </button>

      <template v-if="isAdmin && treeCtxMenu.path">
        <!-- Move / Copy -->
        <button
          class="fm-ctx-item"
          @click="
            openTransferDialog([treeCtxMenu.path], 'move');
            hideTreeCtxMenu();
          "
        >
          <span class="mdi mdi-folder-move mr-2" />{{ $t("fileManager.move") }}
        </button>
        <button
          class="fm-ctx-item"
          @click="
            openTransferDialog([treeCtxMenu.path], 'copy');
            hideTreeCtxMenu();
          "
        >
          <span class="mdi mdi-content-copy mr-2" />{{ $t("fileManager.copy") }}
        </button>

        <!-- Compress -->
        <button
          class="fm-ctx-item"
          @click="
            openCompressDialogForSources([treeCtxMenu.path], treeCtxMenu.name);
            hideTreeCtxMenu();
          "
        >
          <span class="mdi mdi-archive-arrow-up-outline mr-2" />{{ $t("fileManager.compress") }}
        </button>

        <!-- Rename -->
        <button
          class="fm-ctx-item"
          @click="
            renameTarget = { name: treeCtxMenu.name, type: 'directory', size: 0, modified: '' };
            renameValue = treeCtxMenu.name;
            renamePathOverride = treeCtxMenu.path;
            showRenameDialog = true;
            hideTreeCtxMenu();
          "
        >
          <span class="mdi mdi-pencil mr-2" />{{ $t("fileManager.rename") }}
        </button>

        <div class="fm-ctx-sep" />

        <!-- Delete -->
        <button
          class="fm-ctx-item fm-ctx-item--danger"
          @click="
            deleteTargets = [treeCtxMenu.path];
            showDeleteDialog = true;
            hideTreeCtxMenu();
          "
        >
          <span class="mdi mdi-delete mr-2" />{{ $t("fileManager.delete") }}
        </button>
      </template>
    </div>
  </Teleport>

  <!-- ── Move / Copy dialog ───────────────────────────────────────── -->
  <SDialog
    v-model="showTransferDialog"
    :title="transferMode === 'move' ? $t('fileManager.moveTitle') : $t('fileManager.copyTitle')"
    width="480px"
  >
    <p class="is-size-7 has-text-grey mb-3">
      {{
        $t("fileManager.transferHint", {
          count: transferSources.length,
          mode: $t(`fileManager.${transferMode}`),
        })
      }}
    </p>
    <FolderPicker v-model="transferDest" />
    <template #footer>
      <div class="flex-end gap-sm">
        <SButton @click="showTransferDialog = false">{{ $t("fileManager.cancel") }}</SButton>
        <SButton
          :variant="transferMode === 'move' ? 'warning' : 'primary'"
          :disabled="!transferDest && transferDest !== ''"
          @click="doTransfer"
        >
          <span
            :class="
              transferMode === 'move' ? 'mdi mdi-folder-move mr-1' : 'mdi mdi-content-copy mr-1'
            "
          />
          {{ transferMode === "move" ? $t("fileManager.move") : $t("fileManager.copy") }}
        </SButton>
      </div>
    </template>
  </SDialog>

  <!-- ── Webamp player ──────────────────────────────────────────────── -->
  <!-- Mounted in default.vue layout so it survives route changes -->

  <!-- ── Extract to… dialog ──────────────────────────────────────── -->
  <SDialog v-model="showExtractDialog" :title="$t('fileManager.extractTitle')" width="480px">
    <p class="is-size-7 has-text-grey mb-3">
      {{ $t("fileManager.extractHint", { name: extractSource.split("/").pop() }) }}
    </p>
    <FolderPicker v-model="extractDest" />
    <SFormItem :label="$t('fileManager.password')" class="mt-3">
      <SInput
        v-model="extractPassword"
        type="password"
        :placeholder="$t('fileManager.passwordPlaceholder')"
      />
    </SFormItem>
    <template #footer>
      <div class="flex-end gap-sm">
        <SButton @click="showExtractDialog = false">{{ $t("fileManager.cancel") }}</SButton>
        <SButton
          variant="primary"
          :disabled="extractDest === undefined || extractDest === null"
          @click="doExtract"
        >
          <span class="mdi mdi-archive-arrow-down-outline mr-1" />
          {{ $t("fileManager.extract") }}
        </SButton>
      </div>
    </template>
  </SDialog>

  <!-- ── Compress dialog ──────────────────────────────────────────── -->
  <SDialog v-model="showCompressDialog" :title="$t('fileManager.compressTitle')" width="480px">
    <SFormItem :label="$t('fileManager.compressName')">
      <SInput v-model="compressArchiveName" placeholder="archive" @enter="doCompress" />
    </SFormItem>
    <SFormItem :label="$t('fileManager.compressFormat')">
      <SSelect v-model="compressFormat" :options="compressFormatOptions" />
    </SFormItem>
    <SFormItem :label="$t('fileManager.destination')">
      <FolderPicker v-model="compressDest" />
    </SFormItem>
    <template v-if="compressFormat === 'zip'">
      <SFormItem>
        <SCheckbox v-model="compressUsePassword" :label="$t('fileManager.compressUsePassword')" />
      </SFormItem>
      <SFormItem v-if="compressUsePassword" :label="$t('fileManager.password')">
        <SInput
          v-model="compressPassword"
          type="password"
          :placeholder="$t('fileManager.passwordPlaceholder')"
        />
      </SFormItem>
    </template>
    <template #footer>
      <div class="flex-end gap-sm">
        <SButton @click="showCompressDialog = false">{{ $t("fileManager.cancel") }}</SButton>
        <SButton variant="primary" :disabled="!compressArchiveName" @click="doCompress">
          <span class="mdi mdi-archive-arrow-up-outline mr-1" />
          {{ $t("fileManager.compress") }}
        </SButton>
      </div>
    </template>
  </SDialog>

  <SmartRenameDialog ref="smartRenameDialogRef" @renamed="onSmartRenameRenamed" />
</template>

<script setup lang="ts">
interface FileItem {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
}

interface CompressFormatOption {
  value: string;
  label: string;
  extension: string;
}

interface ArchiveCapabilitiesResponse {
  compressFormats: CompressFormatOption[];
  extractExtensions: string[];
}

const { t } = useI18n();
const { apiFetch, showToast } = useApi();
const auth = useAuth();
const isAdmin = computed(() => auth.user.value?.isAdmin === true);
const config = useRuntimeConfig();
const { enqueueTransfers, enqueueExtract, enqueueCompress, addUploadJob } = useTransferJobs();
const route = useRoute();
const router = useRouter();

/**
 * Strip any path-traversal segments from a user-supplied relative path.
 * Removes empty segments, '.' and '..' so a crafted URL like
 * ?path=../../etc/passwd is collapsed to '' (root).
 */
function sanitizePath(raw: string): string {
  return (raw || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((s) => s !== "" && s !== "." && s !== "..")
    .join("/");
}

// ── State ──────────────────────────────────────────────────────────────────
const currentPath = computed(() => sanitizePath((route.query.path as string) || ""));
const items = ref<FileItem[]>([]);
const loading = ref(false);
const notConfigured = ref(false);
const working = ref(false);
const treeVisible = ref(false);
const folderTreeRef = ref<{ refresh: () => void } | null>(null);

// Refreshes both the file list and the folder-tree sidebar.
// Use this as the post-action callback for any operation that may add,
// remove, or rename a folder (delete, move, rename, mkdir).
function loadDirAndTree() {
  loadDir();
  folderTreeRef.value?.refresh();
}

// Persist tree visibility to user preferences
{
  const { apiFetch: _apiFetch } = useApi();
  onMounted(async () => {
    try {
      const prefs = await _apiFetch<Record<string, string>>("/api/users/preferences");
      if (prefs?.fileTreeVisible === "true") treeVisible.value = true;
    } catch {
      /* silent */
    }
  });
  watch(treeVisible, (v) => {
    _apiFetch("/api/users/preferences", {
      method: "POST",
      body: { fileTreeVisible: String(v) },
    }).catch(() => {});
  });
}

// ── Sorting ────────────────────────────────────────────────────────────────
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

watchEffect(() => {
  // Reset sort when navigating to a new directory
  // (track currentPath so the watch fires on nav)
  void currentPath.value;
  // Don't reset sort preference — user keeps their chosen column
});

// ── Selection (reactive Set for O(1) lookups) ──────────────────────────────
const selectedItems = reactive(new Set<string>());
const someSelected = computed(() => selectedItems.size > 0);
const lastClickedItem = ref<string | null>(null);

/** Paths of selected items that are files (used for Smart Rename). */
const selectedFiles = computed(() =>
  Array.from(selectedItems)
    .filter((name) => items.value.find((i) => i.name === name)?.type === "file")
    .map((name) => childPath(name)),
);

// ── Upload state ───────────────────────────────────────────────────────────
const dragging = ref(false);
const dropTargetRow = ref<string | null>(null);
const fileInputEl = ref<HTMLInputElement>();

// ── Dialog state ───────────────────────────────────────────────────────────
const showNewFolderDialog = ref(false);
const newFolderName = ref("");

const showRenameDialog = ref(false);
const renameTarget = ref<FileItem | null>(null);
const renameValue = ref("");
const renamePathOverride = ref<string | null>(null);

const showDeleteDialog = ref(false);
const deleteTargets = ref<string[]>([]);
const deleteMessage = computed(() =>
  deleteTargets.value.length === 1
    ? t("fileManager.confirmDelete", { name: deleteTargets.value[0].split("/").pop() })
    : t("fileManager.confirmDeleteMultiple", { count: deleteTargets.value.length }),
);

// ── Transfer (move / copy) dialog state ───────────────────────────────
const showTransferDialog = ref(false);
const transferMode = ref<"move" | "copy">("move");
const transferSources = ref<string[]>([]);
const transferDest = ref("");

// ── Extract dialog state ──────────────────────────────────────────────
const showExtractDialog = ref(false);
const extractSource = ref("");
const extractDest = ref("");
const extractPassword = ref("");

// ── Compress dialog state ─────────────────────────────────────────────
const showCompressDialog = ref(false);
const compressSources = ref<string[]>([]);
const compressArchiveName = ref("");
const compressFormat = ref("zip");
const compressDest = ref("");
const compressUsePassword = ref(false);
const compressPassword = ref("");

watch(compressFormat, (newFormat) => {
  if (newFormat !== "zip") {
    compressUsePassword.value = false;
    compressPassword.value = "";
  }
});

function openTransferDialog(sources: string[], mode: "move" | "copy") {
  transferSources.value = sources;
  transferMode.value = mode;
  // Default destination to current directory
  transferDest.value = currentPath.value;
  showTransferDialog.value = true;
}

function doTransfer() {
  if (transferMode.value === "move") {
    const dest = transferDest.value.replace(/\/+$/, "");
    const allSame = transferSources.value.every((src) => {
      const parent = src.includes("/") ? src.replace(/\/[^/]+$/, "") : "";
      return parent === dest;
    });
    if (allSame) {
      showTransferDialog.value = false;
      return;
    }
  }
  enqueueTransfers(transferSources.value, transferDest.value, transferMode.value, loadDirAndTree);
  showTransferDialog.value = false;
  selectedItems.clear();
  showToast(
    t("fileManager.transferStarted", { mode: t(`fileManager.${transferMode.value}`) }),
    "success",
  );
}

// ── Archive helpers ───────────────────────────────────────────────────────────
const extractExtensions = ref<string[]>([]);
const compressFormats = ref<CompressFormatOption[]>([]);
const compressFormatOptions = computed(() =>
  compressFormats.value.map((f) => ({ label: f.label, value: f.value })),
);

const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg|ico|tiff?)$/i;
const VIDEO_RE = /\.(mp4|webm|ogg|ogv|mov|m4v)$/i;

function isImage(item: FileItem | null): boolean {
  return item?.type === "file" && IMAGE_RE.test(item.name);
}

function isVideo(item: FileItem | null): boolean {
  return item?.type === "file" && VIDEO_RE.test(item.name);
}

function isArchive(name: string): boolean {
  const lower = name.toLowerCase();
  return extractExtensions.value.some((ext) => lower.endsWith(ext));
}

function archiveBasename(name: string): string {
  return name
    .replace(/\.(tar\.gz|tar\.bz2|tar\.xz|tar\.lzma|tar\.z|part\d+\.rar)$/i, "")
    .replace(/\.[^.]+$/, "");
}

// ── Extract actions ──────────────────────────────────────────────────────────
function doExtractHere(sourceRelPath: string) {
  enqueueExtract(sourceRelPath, currentPath.value, undefined, loadDir);
  showToast(t("fileManager.extractStarted"), "success");
}

function doExtractToFolder(sourceRelPath: string, folderName: string) {
  const dest = currentPath.value ? `${currentPath.value}/${folderName}` : folderName;
  enqueueExtract(sourceRelPath, dest, undefined, loadDir);
  showToast(t("fileManager.extractStarted"), "success");
}

function openExtractDialog(sourceRelPath: string) {
  extractSource.value = sourceRelPath;
  extractDest.value = currentPath.value;
  extractPassword.value = "";
  showExtractDialog.value = true;
}

function doExtract() {
  enqueueExtract(
    extractSource.value,
    extractDest.value,
    extractPassword.value || undefined,
    loadDir,
  );
  showExtractDialog.value = false;
  showToast(t("fileManager.extractStarted"), "success");
}

// ── Compress actions ─────────────────────────────────────────────────────────
function openCompressDialog() {
  openCompressDialogForSources(
    Array.from(selectedItems).map(childPath),
    Array.from(selectedItems)[0] ?? "archive",
  );
}

function openCompressDialogForSources(sources: string[], seedName = "archive") {
  compressSources.value = sources;
  const seedBase = seedName.split("/").pop() || "archive";
  compressArchiveName.value = archiveBasename(seedBase) || "archive";
  compressFormat.value = compressFormats.value[0]?.value || "zip";
  const first = sources[0] || "";
  compressDest.value = first.includes("/") ? first.replace(/\/[^/]+$/, "") : currentPath.value;
  compressUsePassword.value = false;
  compressPassword.value = "";
  showCompressDialog.value = true;
}

function doCompress() {
  if (!compressFormats.value.some((f) => f.value === compressFormat.value)) {
    compressFormat.value = compressFormats.value[0]?.value || "zip";
  }
  const pw =
    compressUsePassword.value && compressFormat.value === "zip"
      ? compressPassword.value || undefined
      : undefined;
  enqueueCompress(
    compressSources.value,
    compressDest.value,
    compressArchiveName.value || "archive",
    compressFormat.value,
    pw,
    loadDir,
  );
  showCompressDialog.value = false;
  selectedItems.clear();
  showToast(t("fileManager.compressStarted"), "success");
}

async function loadArchiveCapabilities() {
  try {
    const caps = await apiFetch<ArchiveCapabilitiesResponse>("/api/files/capabilities");

    if (Array.isArray(caps.extractExtensions) && caps.extractExtensions.length) {
      extractExtensions.value = caps.extractExtensions
        .map((ext) => (ext || "").toLowerCase())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    }

    if (Array.isArray(caps.compressFormats) && caps.compressFormats.length) {
      compressFormats.value = caps.compressFormats;
      if (!compressFormats.value.some((f) => f.value === compressFormat.value)) {
        compressFormat.value = compressFormats.value[0].value;
      }
    }
  } catch {
    extractExtensions.value = [];
    compressFormats.value = [];
  }
}

// ── Image preview ─────────────────────────────────────────────────────────
const showImageDialog = ref(false);
const previewImageUrl = ref("");
const previewImageName = ref("");
const previewIndex = ref(0);

const previewImages = computed(() =>
  items.value.filter((i) => i.type === "file" && IMAGE_RE.test(i.name)),
);

// ── Video preview ─────────────────────────────────────────────────────────
const showVideoDialog = ref(false);
const previewVideoUrl = ref("");
const previewVideoName = ref("");
const videoEl = ref<HTMLVideoElement | null>(null);

function openVideoPreview(item: FileItem) {
  previewVideoUrl.value = downloadUrl(item.name);
  previewVideoName.value = item.name;
  showVideoDialog.value = true;
}

function onVideoDialogClose(open: boolean) {
  if (!open) videoEl.value?.pause();
}

function openImagePreview(item: FileItem) {
  const idx = previewImages.value.findIndex((i) => i.name === item.name);
  previewIndex.value = idx >= 0 ? idx : 0;
  setPreviewByIndex(previewIndex.value);
  showImageDialog.value = true;
}

function setPreviewByIndex(idx: number) {
  const img = previewImages.value[idx];
  if (!img) return;
  previewImageUrl.value = downloadUrl(img.name);
  previewImageName.value = img.name;
}

function prevImage() {
  if (previewIndex.value > 0) {
    previewIndex.value--;
    setPreviewByIndex(previewIndex.value);
  }
}

function nextImage() {
  if (previewIndex.value < previewImages.value.length - 1) {
    previewIndex.value++;
    setPreviewByIndex(previewIndex.value);
  }
}

function onPreviewKeydown(e: KeyboardEvent) {
  if (!showImageDialog.value) return;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    prevImage();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    nextImage();
  }
}

onMounted(() => window.addEventListener("keydown", onPreviewKeydown));
onMounted(() => {
  void loadArchiveCapabilities();
});
onBeforeUnmount(() => window.removeEventListener("keydown", onPreviewKeydown));

// ── Context menu ─────────────────────────────────────────────────────────────
const mobileOpenedItem = ref<string | null>(null);

function onMobileCardTap(item: FileItem) {
  mobileOpenedItem.value = mobileOpenedItem.value === item.name ? null : item.name;
}

const ctxMenu = ref({ visible: false, x: 0, y: 0, item: null as FileItem | null });
const ctxIsMulti = computed(() => selectedItems.size > 1);

// ── Tree context menu ─────────────────────────────────────────────────────────
const treeCtxMenu = ref({ visible: false, x: 0, y: 0, path: "", name: "" });

function onTreeCtxMenu(payload: { path: string; name: string; x: number; y: number }) {
  hideCtxMenu();
  treeCtxMenu.value = { visible: true, ...payload };
}

function hideTreeCtxMenu() {
  treeCtxMenu.value.visible = false;
}

// ── Webamp ────────────────────────────────────────────────────────────────
const { webampTrack, isMp3Name, openTrack, openTracks } = useWebamp();

/** MP3 files among the current selection. */
const selectedMp3s = computed(() =>
  items.value.filter((i) => i.type === "file" && isMp3Name(i.name) && selectedItems.has(i.name)),
);

function isMp3(item: FileItem | null): boolean {
  return item?.type === "file" && isMp3Name(item.name);
}

function openInWebamp(item: FileItem) {
  openTrack({ url: downloadUrl(item.name), metaData: { artist: "", title: item.name } });
}

function openMp3sInWebamp(mp3s: FileItem[]) {
  openTracks(
    mp3s.map((i) => ({ url: downloadUrl(i.name), metaData: { artist: "", title: i.name } })),
  );
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
  treeCtxMenu.value.visible = false;
}

// ── Smart Rename ──────────────────────────────────────────────────────────
const smartRenameDialogRef = ref<{
  startForPaths: (paths: string[]) => Promise<void>;
} | null>(null);

function startSmartRenameForPaths(paths: string[]) {
  if (!paths.length) return;
  smartRenameDialogRef.value?.startForPaths(paths);
}

function onSmartRenameRenamed(payload?: { clearSelection?: boolean }) {
  if (payload?.clearSelection) selectedItems.clear();
  loadDir();
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
  const safe = sanitizePath(path);
  selectedItems.clear();
  router.replace({ query: safe ? { path: safe } : {} });
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
    } else if ((status === 403 || status === 404) && currentPath.value) {
      // Navigate back to parent and show a specific error
      const msg =
        status === 403 ? t("fileManager.errorPermission") : t("fileManager.errorNotFound");
      showToast(msg, "error");
      const parentSegs = pathSegments.value.slice(0, -1);
      router.replace({ query: parentSegs.length ? { path: parentSegs.join("/") } : {} });
    } else {
      showToast(err?.data?.statusMessage ?? t("errors.middlewareError", { status }), "error");
    }
  } finally {
    loading.value = false;
  }
}

// ── Selection ──────────────────────────────────────────────────────────────
function onRowClick(e: MouseEvent, item: FileItem) {
  if (e.shiftKey && lastClickedItem.value) {
    const names = sortedItems.value.map((i) => i.name);
    const a = names.indexOf(lastClickedItem.value);
    const b = names.indexOf(item.name);
    if (a !== -1 && b !== -1) {
      const [from, to] = a < b ? [a, b] : [b, a];
      // Keep existing selection if Ctrl is also held, otherwise restart
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

/** Ctrl+click on a folder selects it; plain click navigates. */
function handleFolderClick(e: MouseEvent, item: FileItem) {
  if (e.ctrlKey || e.metaKey) {
    e.stopPropagation();
    if (selectedItems.has(item.name)) selectedItems.delete(item.name);
    else selectedItems.add(item.name);
  } else {
    e.stopPropagation();
    navigate(childPath(item.name));
  }
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

function onRowDragStart(e: DragEvent, item: FileItem) {
  if (!isAdmin.value) {
    e.preventDefault();
    return;
  }
  const paths = selectedItems.has(item.name)
    ? Array.from(selectedItems).map(childPath)
    : [childPath(item.name)];
  e.dataTransfer!.effectAllowed = "copyMove";
  e.dataTransfer!.setData("application/x-fm-paths", JSON.stringify(paths));
}

function onRowDragOver(e: DragEvent, item: FileItem) {
  if (!isAdmin.value || item.type !== "directory") return;
  if (!e.dataTransfer?.types.includes("application/x-fm-paths")) return;
  dropTargetRow.value = item.name;
  e.dataTransfer.dropEffect = e.ctrlKey || e.shiftKey ? "copy" : "move";
}

function onRowDragLeave(e: DragEvent, item: FileItem) {
  if (
    dropTargetRow.value === item.name &&
    !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)
  ) {
    dropTargetRow.value = null;
  }
}

function onRowDrop(e: DragEvent, item: FileItem) {
  dropTargetRow.value = null;
  if (!isAdmin.value || item.type !== "directory") return;
  const fmData = e.dataTransfer?.getData("application/x-fm-paths");
  if (!fmData) return;
  try {
    const sources: string[] = JSON.parse(fmData);
    doQuickTransfer(sources, childPath(item.name), e.ctrlKey || e.shiftKey);
  } catch {
    /* ignore */
  }
}

function doQuickTransfer(sources: string[], dest: string, copy: boolean) {
  if (!copy) {
    const normalDest = dest.replace(/\/+$/, "");
    const allSame = sources.every((src) => {
      const parent = src.includes("/") ? src.replace(/\/[^/]+$/, "") : "";
      return parent === normalDest;
    });
    if (allSame) return;
  }
  enqueueTransfers(sources, dest, copy ? "copy" : "move", loadDirAndTree);
  selectedItems.clear();
  showToast(
    t("fileManager.transferStarted", { mode: t(`fileManager.${copy ? "copy" : "move"}`) }),
    "success",
  );
}

function onTreeTransfer(payload: { sources: string[]; dest: string; copy: boolean }) {
  doQuickTransfer(payload.sources, payload.dest, payload.copy);
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  if (!isAdmin.value) return;
  // Internal FM drag — move/copy to current directory
  const fmData = e.dataTransfer?.getData("application/x-fm-paths");
  if (fmData) {
    try {
      const sources: string[] = JSON.parse(fmData);
      doQuickTransfer(sources, currentPath.value, e.ctrlKey || e.shiftKey);
    } catch {
      /* ignore */
    }
    return;
  }
  // OS file drop → upload
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) uploadFiles(files);
}

function onDragLeave(e: DragEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
    dragging.value = false;
  }
}

function uploadFiles(files: File[]) {
  const name =
    files.length === 1
      ? files[0].name
      : t("fileManager.uploadingMultiple", { count: files.length });

  const { setPercent, setDone, setError } = addUploadJob(name, currentPath.value);

  const formData = new FormData();
  formData.append("dir", currentPath.value);
  for (const file of files) {
    formData.append("files", file, file.name);
  }

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener("progress", (e) => {
    if (e.lengthComputable) {
      setPercent(Math.round((e.loaded / e.total) * 100));
    }
  });

  xhr.addEventListener("load", () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      setDone(loadDir);
    } else {
      setError(t("errors.middlewareError", { status: xhr.status }));
    }
  });

  xhr.addEventListener("error", () => {
    setError(t("errors.middlewareError", { status: 0 }));
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
    folderTreeRef.value?.refresh();
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
    const path =
      renamePathOverride.value ??
      (currentPath.value
        ? `${currentPath.value}/${renameTarget.value.name}`
        : renameTarget.value.name);
    renamePathOverride.value = null;
    await apiFetch("/api/files/rename", { method: "POST", body: { path, name } });
    showRenameDialog.value = false;
    loadDirAndTree();
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
    loadDirAndTree();
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
watch(
  () => route.query.path,
  () => loadDir(),
  { immediate: true },
);
</script>

<style scoped>
.fm-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* Toolbar */
.fm-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* ── Folder tree column layout ───────────────────────────────────────────── */
.fm-body {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  gap: 0;
}

.fm-body .fm-table-wrap {
  flex: 1;
  min-width: 0;
}

.fm-tree-toggle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--s-border);
  border-radius: 6px;
  background: var(--s-bg-surface);
  color: var(--s-text-secondary);
  cursor: pointer;
  font-size: 1rem;
  transition:
    border-color 0.15s,
    color 0.15s,
    background 0.15s;
}
.fm-tree-toggle:hover,
.fm-tree-toggle.is-active {
  border-color: var(--s-accent);
  color: var(--s-accent);
  background: color-mix(in oklab, var(--s-accent) 10%, transparent);
}

/* ── Breadcrumb address bar ──────────────────────────────────────────────── */
.fm-breadcrumb {
  flex: 1;
  min-width: 0;
  min-height: 32px;
  margin-bottom: 0 !important;
  background: color-mix(in oklab, var(--s-border) 20%, var(--s-bg-surface));
  border: 1px solid var(--s-border);
  border-radius: 6px;
  padding: 0 0.6rem !important;
  display: flex !important;
  align-items: center;
  overflow: hidden;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.fm-breadcrumb:hover {
  border-color: color-mix(in oklab, var(--s-accent) 40%, var(--s-border));
}

/* Scrollable segment list — no wrapping, hidden scrollbar */
.fm-breadcrumb ul {
  display: flex !important;
  flex-wrap: nowrap !important;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  align-items: center;
  margin: 0 !important;
  padding: 0 !important;
  gap: 0;
}

.fm-breadcrumb ul::-webkit-scrollbar {
  display: none;
}

.fm-breadcrumb li {
  display: inline-flex !important;
  align-items: center;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Chevron separator */
.fm-breadcrumb li + li::before {
  content: "›" !important;
  color: var(--s-text-muted, #aaa) !important;
  font-size: 1rem !important;
  line-height: 1 !important;
  padding: 0 !important;
  margin: 0 0.15rem !important;
  pointer-events: none;
}

/* Segment links */
.fm-breadcrumb li a {
  display: inline-flex !important;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.82rem !important;
  color: var(--s-text-secondary, var(--s-text)) !important;
  text-decoration: none !important;
  padding: 0.15rem 0.35rem !important;
  border-radius: 4px;
  transition:
    color 0.1s,
    background 0.1s;
  cursor: pointer;
  line-height: 1.3;
}

.fm-breadcrumb li a:hover {
  color: var(--s-accent) !important;
  background: color-mix(in oklab, var(--s-accent) 8%, transparent);
}

/* Active (current) segment — not clickable, bold */
.fm-breadcrumb li.is-active a {
  color: var(--s-text) !important;
  font-weight: 600 !important;
  cursor: default;
  pointer-events: none;
  background: transparent !important;
}

/* Home/root icon */
.fm-breadcrumb li:first-child a .mdi {
  font-size: 1rem;
  color: #f0a329;
  line-height: 1;
}

.fm-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
  flex-wrap: wrap;
}

/* Table wrap + drag-and-drop */
.fm-table-wrap {
  position: relative;
  border: 2px solid transparent;
  border-radius: 6px;
  transition: border-color 0.2s;
  overflow: auto;
  flex: 1;
  min-height: 120px;
  /* Match STable wrapper */
  outline: 1px solid var(--s-table-border);
  outline-offset: -1px;
}

.fm-table-wrap.fm-drag-over {
  border-color: var(--s-accent);
}

.fm-loading-overlay {
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

.fm-drop-overlay {
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

.fm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  margin-bottom: 0;
}

/* Header */
.fm-table thead th {
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

/* Body cells */
.fm-table tbody td {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--s-border-light);
  color: var(--s-text);
  vertical-align: middle;
}

/* Even-row stripe */
.fm-table tbody tr:nth-child(even) td {
  background: var(--s-table-stripe-bg);
}

/* Hover */
.fm-table tbody tr {
  transition: background 0.1s;
}
.fm-table tbody tr:hover td {
  background: var(--s-table-hover-bg);
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
  max-width: 80%;
  display: inline-block;
  vertical-align: bottom;
}

/* ── Context menu ──────────────────────────────────────────────────────────── */
.fm-ctx-menu {
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

.fm-th-size {
  width: 90px;
}
.fm-th-date {
  width: 160px;
}
.fm-th-arrow {
  width: 28px;
}
.fm-row {
  cursor: pointer;
  user-select: none;
}
.fm-row.is-drop-target td {
  background: color-mix(in oklab, var(--s-accent) 14%, transparent) !important;
  outline: 2px solid var(--s-accent);
  outline-offset: -2px;
}
.fm-row.is-selected td {
  background: var(--s-accent-subtle) !important;
  color: var(--s-text);
}
.fm-sort-btn {
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
.fm-sort-btn:hover {
  color: var(--s-text);
}
.fm-sort-btn.is-active {
  color: var(--s-accent);
  font-weight: 600;
}
.fm-sort-btn .mdi {
  font-size: 0.85rem;
  opacity: 0.6;
}
.fm-sort-btn.is-active .mdi {
  opacity: 1;
}

/* ── Mobile file cards ─────────────────────────────────────────────────── */
.fm-mobile-list {
  display: flex;
  flex-direction: column;
  padding: 0.4rem;
  gap: 0.4rem;
}
.fm-mobile-up {
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
.fm-mobile-up:hover {
  background: var(--s-bg-hover);
  opacity: 1;
}
.fm-mobile-card {
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s;
}
.fm-mobile-card.is-open {
  border-color: color-mix(in oklab, var(--s-accent) 40%, var(--s-border));
}
.fm-mc-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.75rem;
}
.fm-mc-name {
  flex: 1;
  font-size: 0.875rem;
  word-break: break-word;
  line-height: 1.35;
}
.fm-mc-size {
  font-size: 0.75rem;
  color: var(--s-text-muted);
  flex-shrink: 0;
}
.fm-mc-chevron {
  font-size: 1rem;
  color: var(--s-text-muted);
  flex-shrink: 0;
}
.fm-mc-panel {
  border-top: 1px solid var(--s-border);
  display: flex;
  flex-direction: column;
}
.fm-mc-action {
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
.fm-mc-action:hover {
  background: var(--s-bg-hover);
}
.fm-mc-action--accent {
  color: var(--s-accent);
}
.fm-mc-action--danger {
  color: var(--s-danger);
}
.fm-mc-sep {
  height: 1px;
  background: var(--s-border);
  margin: 2px 0;
}

.fm-empty-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 0.5rem;
}

/* ── Image preview ──────────────────────────────────────────────── */
.fm-img-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  max-height: 75vh;
  overflow: auto;
  background: var(--s-bg);
  border-radius: var(--s-radius);
  position: relative;
}
.fm-img-preview__img {
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
  display: block;
}

/* ── Video preview ────────────────────────────────────────────────── */
.fm-video-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: var(--s-radius);
  overflow: hidden;
}
.fm-video-preview__video {
  width: 100%;
  max-height: 75vh;
  display: block;
  outline: none;
}
.fm-img-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  background: color-mix(in oklab, var(--s-bg-surface) 80%, transparent);
  border: 1px solid var(--s-border);
  border-radius: 50%;
  width: 2.2rem;
  height: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1.3rem;
  color: var(--s-text);
  transition:
    background 0.15s,
    opacity 0.15s;
  opacity: 0.75;
}
.fm-img-nav:hover:not(:disabled) {
  background: var(--s-bg-surface);
  opacity: 1;
}
.fm-img-nav:disabled {
  opacity: 0.2;
  cursor: default;
}
.fm-img-nav--prev {
  left: 0.5rem;
}
.fm-img-nav--next {
  right: 0.5rem;
}
.fm-img-counter {
  text-align: center;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--s-text-secondary);
}
</style>
