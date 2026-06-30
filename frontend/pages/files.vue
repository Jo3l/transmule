<template>
  <div id="page-files" class="fm-page" @click="hideCtxMenu" @keydown.esc.window="hideCtxMenu">
    <div class="fm-header-row mb-4">
      <h1 class="title is-4">{{ $t("fileManager.title") }}</h1>
    </div>

    <!-- Not configured -->
    <SAlert v-if="notConfigured" variant="warning">
      {{ $t("fileManager.notConfigured") }}
    </SAlert>

    <template v-else>
      <!-- ── Toolbar ─────────────────────────────────────────────────── -->
      <div class="fm-toolbar mb-3">
        <!-- Tree toggle -->
        <button
          class="fm-tree-toggle is-hidden-mobile"
          :class="{ 'is-active': treeVisible }"
          :title="$t('fileManager.folderTree')"
          @click.stop="treeVisible = !treeVisible"
        >
          <span class="mdi mdi-file-tree" />
        </button>
        <!-- Split toggle -->
        <button
          class="fm-split-toggle is-hidden-mobile"
          :class="{ 'is-active': splitActive }"
          :title="$t('fileManager.splitToggle')"
          @click.stop="splitActive = !splitActive"
        >
          <span class="mdi mdi-view-column-outline" />
        </button>
        <!-- Breadcrumbs -->
        <nav class="breadcrumb fm-breadcrumb" aria-label="breadcrumbs">
          <ul>
            <li :class="{ 'is-active': !activePath }">
              <a @click.prevent="navigate('')"
                 @dragover="onBcDragOver($event, '')"
                 @dragleave="onBcDragLeave($event)"
                 @drop.prevent="onBcDrop($event, '')"
                 :class="{
                   'is-drop-target': dropTargetBc === '',
                   'is-drop-target-copy': dropTargetBc === '' && isCopyKey,
                 }">
                <span class="mdi mdi-folder-home mr-1" />
                {{ $t("fileManager.root") }}
              </a>
            </li>
            <li
              v-for="(seg, i) in pathSegments"
              :key="i"
              :class="{ 'is-active': i === pathSegments.length - 1 }"
            >
              <a @click.prevent="navigate(pathSegments.slice(0, i + 1).join('/'))"
                 @dragover="onBcDragOver($event, pathSegments.slice(0, i + 1).join('/'))"
                 @dragleave="onBcDragLeave($event)"
                 @drop.prevent="onBcDrop($event, pathSegments.slice(0, i + 1).join('/'))"
                 :class="{
                   'is-drop-target': dropTargetBc === pathSegments.slice(0, i + 1).join('/'),
                   'is-drop-target-copy': dropTargetBc === pathSegments.slice(0, i + 1).join('/') && isCopyKey,
                 }">
                {{ displaySeg(seg) }}
              </a>
            </li>
          </ul>
        </nav>

        <!-- Action buttons -->
        <div class="fm-actions">
          <!-- Add remote folder dropdown -->
          <div v-if="isAdmin" class="fm-dropdown">
            <SButton size="sm" @click="showRemoteDropdown = !showRemoteDropdown">
              <span class="mdi mdi-cloud-plus mr-1" />{{ $t("fileManager.addRemoteFolder") }}
              <span class="mdi mdi-chevron-down ml-1" />
            </SButton>
            <div v-if="showRemoteDropdown" class="fm-dropdown-menu">
              <button class="fm-dropdown-item" @click="openRemoteModal">
                <span class="mdi mdi-server-network mr-2" />{{ $t("fileManager.smb") }}
              </button>

            </div>
          </div>

          <SButton v-if="isAdmin" size="sm" @click="showNewFolderDialog = true">
            <span class="mdi mdi-folder-plus mr-1" />{{ $t("fileManager.newFolder") }}
          </SButton>
          <SButton v-if="isAdmin" size="sm" @click="triggerFileInput">
            <span class="mdi mdi-upload mr-1" />{{ $t("fileManager.upload") }}
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
          :current-path="splitActive ? (activePanelIndex === 0 ? leftPanelPath : rightPanelPath) : currentPath"
          @navigate="navigate"
          @close="treeVisible = false"
          @transfer="onTreeTransfer"
          @ctx-menu="onTreeCtxMenu"
        />

        <!-- Panel(s) -->
        <div v-if="!splitActive" class="fm-panel-wrap">
          <FileManagerPanel
            ref="leftPanelRef"
            :current-path="currentPath"
            :is-admin="isAdmin"
            :extract-extensions="extractExtensions"
            :compress-formats="compressFormats"
            :remote-mounts="remoteMounts"
            :active="false"
            :winamp-icon="winampIcon"
            :bolt-icon="boltIcon"
            @update:current-path="onSinglePanelPathChange"
            @activate="activePanelIndex = 0"
            @transfer="onPanelTransfer"
            @rename-item="onPanelRenameItem"
            @delete-paths="onPanelDelete"
            @open-transfer-dialog="onPanelOpenTransferDialog"
            @compress-sources="onPanelCompressSources"
            @extract-here="onPanelExtractHere"
            @extract-to-folder="onPanelExtractToFolder"
            @open-extract-dialog="onPanelOpenExtractDialog"
            @open-image-preview="onPanelOpenImagePreview"
            @open-text-editor="onPanelOpenTextEditor"
            @open-video-preview="onPanelOpenVideoPreview"
            @play-in-webamp="onPanelPlayInWebamp"
            @open-comic="onPanelOpenComic"
            @download-file="onPanelDownloadFile"
            @smart-rename-paths="onPanelSmartRenamePaths"
            @upload-files="onPanelUploadFiles"
            @unmount-item="onPanelUnmountItem"
          />
        </div>
        <div v-else class="fm-split-layout">
          <FileManagerPanel
            ref="leftPanelRef"
            v-model:current-path="leftPanelPath"
            :is-admin="isAdmin"
            :extract-extensions="extractExtensions"
            :compress-formats="compressFormats"
            :remote-mounts="remoteMounts"
            :active="activePanelIndex === 0"
            :winamp-icon="winampIcon"
            :bolt-icon="boltIcon"
            :style="{ flex: `${leftFlex} 1 0` }"
            class="fm-split-panel"
            @activate="activePanelIndex = 0"
            @transfer="onPanelTransfer"
            @rename-item="onPanelRenameItem"
            @delete-paths="onPanelDelete"
            @open-transfer-dialog="onPanelOpenTransferDialog"
            @compress-sources="onPanelCompressSources"
            @extract-here="onPanelExtractHere"
            @extract-to-folder="onPanelExtractToFolder"
            @open-extract-dialog="onPanelOpenExtractDialog"
            @open-image-preview="onPanelOpenImagePreview"
            @open-text-editor="onPanelOpenTextEditor"
            @open-video-preview="onPanelOpenVideoPreview"
            @play-in-webamp="onPanelPlayInWebamp"
            @open-comic="onPanelOpenComic"
            @download-file="onPanelDownloadFile"
            @smart-rename-paths="onPanelSmartRenamePaths"
            @upload-files="onPanelUploadFiles"
            @unmount-item="onPanelUnmountItem"
          />
          <div
            class="fm-split-divider"
            @mousedown.prevent="onDividerMouseDown"
          />
          <FileManagerPanel
            ref="rightPanelRef"
            v-model:current-path="rightPanelPath"
            :is-admin="isAdmin"
            :extract-extensions="extractExtensions"
            :compress-formats="compressFormats"
            :remote-mounts="remoteMounts"
            :active="activePanelIndex === 1"
            :winamp-icon="winampIcon"
            :bolt-icon="boltIcon"
            class="fm-split-panel"
            @activate="activePanelIndex = 1"
            @transfer="onPanelTransfer"
            @rename-item="onPanelRenameItem"
            @delete-paths="onPanelDelete"
            @open-transfer-dialog="onPanelOpenTransferDialog"
            @compress-sources="onPanelCompressSources"
            @extract-here="onPanelExtractHere"
            @extract-to-folder="onPanelExtractToFolder"
            @open-extract-dialog="onPanelOpenExtractDialog"
            @open-image-preview="onPanelOpenImagePreview"
            @open-text-editor="onPanelOpenTextEditor"
            @open-video-preview="onPanelOpenVideoPreview"
            @play-in-webamp="onPanelPlayInWebamp"
            @open-comic="onPanelOpenComic"
            @download-file="onPanelDownloadFile"
            @smart-rename-paths="onPanelSmartRenamePaths"
            @upload-files="onPanelUploadFiles"
            @unmount-item="onPanelUnmountItem"
          />
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

    <!-- ── Overwrite confirm dialog ─────────────────────────────────── -->
    <SDialog v-model="showOverwriteDialog" :title="$t('fileManager.overwriteTitle')" width="520px">
      <p class="mb-2">{{ $t("fileManager.overwriteMessage") }}</p>
      <ul class="fm-overwrite-list">
        <li v-for="path in overwriteConflicts" :key="path" class="fm-overwrite-item">
          <span class="mdi mdi-file-outline mr-1" />{{ path }}
        </li>
      </ul>
      <template #footer>
        <div class="flex-end gap-sm">
          <SButton @click="cancelOverwrite">
            {{ $t("fileManager.cancel") }}
          </SButton>
          <SButton variant="warning" @click="confirmOverwrite">
            <span class="mdi mdi-alert-outline mr-1" />{{ $t("fileManager.overwriteConfirm") }}
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
      <div class="flex-end-center">
        <a
          class="s-btn inline-flex-center"
          :href="previewImageUrl"
          download
          @click="showImageDialog = false"
        >
          <span class="mdi mdi-download mr-1" />{{ $t("fileManager.download") }}
        </a>
        <SButton @click="showImageDialog = false">{{ $t("fileManager.close") }}</SButton>
      </div>
    </template>
  </SDialog>

  <!-- ── Text editor dialog ─────────────────────────────────────────────── -->
  <SDialog
    :model-value="showTextDialog"
    :title="textEditorName"
    width="90vw"
    @update:model-value="closeTextEditor"
  >
    <textarea
      v-model="textEditorContent"
      class="fm-text-editor"
      :placeholder="$t('fileManager.editTextPlaceholder')"
      spellcheck="false"
    />
    <template #footer>
      <div class="flex-end-center">
        <SButton variant="primary" :loading="savingText" @click="saveTextFile">
          <span class="mdi mdi-content-save mr-1" />{{ $t("fileManager.save") }}
        </SButton>
        <SButton @click="closeTextEditor">{{ $t("fileManager.close") }}</SButton>
      </div>
    </template>
  </SDialog>

  <!-- ── Discard changes confirmation ─────────────────────────────────── -->
  <SDialog v-model="showDiscardDialog" :title="$t('fileManager.discardTitle')" width="420px">
    <p>{{ $t("fileManager.discardMessage") }}</p>
    <template #footer>
      <div class="flex-end-center">
        <SButton variant="danger" @click="confirmDiscard">{{
          $t("fileManager.discardConfirm")
        }}</SButton>
        <SButton @click="showDiscardDialog = false">{{ $t("fileManager.cancel") }}</SButton>
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

  <!-- ── Tree folder context menu ────────────────────────────────────────── -->

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
        <template v-if="!remoteMounts.some((m) => m.name === treeCtxMenu.name)">
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
        </template>

        <!-- Copy is always allowed (even for mount roots) -->
        <button
          class="fm-ctx-item"
          @click="
            openTransferDialog([treeCtxMenu.path], 'copy');
            hideTreeCtxMenu();
          "
        >
          <span class="mdi mdi-content-copy mr-2" />{{ $t("fileManager.copy") }}
        </button>

        <template v-if="!remoteMounts.some((m) => m.name === treeCtxMenu.name)">
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

        <!-- Unmount (remote mount) -->
        <button
          v-if="remoteMounts.some((m) => m.name === treeCtxMenu.name)"
          class="fm-ctx-item fm-ctx-item--danger"
          @click="onTreeUnmount"
        >
          <span class="mdi mdi-eject mr-2" />{{ $t("fileManager.unmount") }}
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
    <FolderPicker v-model="transferDest" :key="'fp-transfer-' + showTransferDialog" />
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
    <FolderPicker v-model="extractDest" :key="'fp-extract-' + showExtractDialog" />
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

  <!-- ── Extract error dialog ─────────────────────────────────────── -->
  <SDialog
    v-model="showExtractErrorDialog"
    :title="$t('fileManager.extractErrorTitle')"
    width="480px"
  >
    <SAlert variant="error" class="mb-2">
      <span class="mdi mdi-alert-circle-outline mr-1" />
      {{ extractErrorMessage }}
    </SAlert>
    <template #footer>
      <div class="flex-end gap-sm">
        <SButton variant="primary" @click="showExtractErrorDialog = false">{{
          $t("fileManager.close")
        }}</SButton>
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
      <FolderPicker v-model="compressDest" :key="'fp-compress-' + showCompressDialog" />
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

  <!-- ── Add remote mount dialog ─────────────────────────────────────────────── -->
  <SDialog v-model="showRemoteDialog" :title="$t('fileManager.addRemoteFolder')" width="480px">
    <div class="flex-row gap-md">
      <SFormItem :label="$t('fileManager.protocol')" class="flex-1" style="margin-bottom:0">
        <SSelect v-model="remoteForm.type" :options="protocolOptions" />
      </SFormItem>
      <SFormItem :label="$t('fileManager.readOnly')" style="margin-bottom:0">
        <SSwitch v-model="remoteForm.readOnly" />
      </SFormItem>
    </div>
    
    <SFormItem :label="$t('fileManager.mountName')">
      <SInput v-model="remoteForm.name" :placeholder="$t('fileManager.mountName')" />
    </SFormItem>
    
    <!-- SMB fields -->
    <template v-if="remoteForm.type === 'smb'">
      <div class="flex-row gap-md">
        <SFormItem :label="$t('fileManager.host')" class="flex-1" style="margin-bottom:0">
          <SInput v-model="remoteForm.host" placeholder="192.168.1.100" />
        </SFormItem>
        <SFormItem :label="$t('fileManager.share')" class="flex-1" style="margin-bottom:0">
          <SInput v-model="remoteForm.share" placeholder="downloads" />
        </SFormItem>
      </div>
      <div class="flex-row gap-md">
        <SFormItem :label="$t('fileManager.domain')" class="flex-1" style="margin-bottom:0">
          <SInput v-model="remoteForm.domain" :placeholder="$t('fileManager.domain')" />
        </SFormItem>
        <SFormItem :label="$t('fileManager.remotePath')" class="flex-1" style="margin-bottom:0">
          <SInput v-model="remoteForm.path" :placeholder="$t('fileManager.remotePathOptional')" />
        </SFormItem>
      </div>
    </template>
    

    <div class="flex-row gap-md">
      <SFormItem :label="$t('fileManager.username')" class="flex-1" style="margin-bottom:0">
        <SInput v-model="remoteForm.username" :placeholder="$t('fileManager.username')" />
      </SFormItem>
      <SFormItem label="Password" class="flex-1" style="margin-bottom:0">
        <SInput v-model="remoteForm.password" type="password" placeholder="Password" />
      </SFormItem>
    </div>
    <template #footer>
      <div class="flex-end gap-sm">
        <SButton variant="info" :loading="validating" @click="validateRemote">
          <span class="mdi mdi-connection mr-1" />{{ $t("fileManager.validate") }}
        </SButton>
        <SButton @click="showRemoteDialog = false">{{ $t("fileManager.cancel") }}</SButton>
        <SButton variant="primary" :loading="working" @click="doCreateRemote">
          {{ $t("fileManager.create") }}
        </SButton>
      </div>
    </template>
  </SDialog>

  <!-- ── Unmount confirm dialog ───────────────────────────────────────────── -->
  <SDialog v-model="showUnmountDialog" :title="$t('fileManager.unmount')" width="420px">
    <p>{{ $t("fileManager.confirmUnmount", { name: unmountTarget?.name }) }}</p>
    <template #footer>
      <div class="flex-end gap-sm">
        <SButton @click="showUnmountDialog = false">{{ $t("fileManager.cancel") }}</SButton>
        <SButton variant="danger" :loading="working" @click="doUnmount">
          <span class="mdi mdi-eject mr-1" />{{ $t("fileManager.unmount") }}
        </SButton>
      </div>
    </template>
  </SDialog>

  <ComicReader
    :visible="!!comicFilePath"
    :file-path="comicFilePath"
    :file-name="comicFileName"
    :initial-page="comicInitialPage || undefined"
    @close="onComicClose"
    @page-change="onComicPageChange"
    @request-next-comic="onComicRequestNext"
    @request-prev-comic="onComicRequestPrev"
  />
</template>

<script setup lang="ts">
import winampIcon from "~/assets/icons/Winamp-logo.svg";
import boltIcon from "~/assets/icons/bolt.svg";
import ComicReader from "~/components/ComicReader.vue";
import FileManagerPanel from "~/components/FileManagerPanel.vue";

interface FileItem {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  isRemoteMount?: boolean;
  homeFolder?: boolean;
  /** Relative path from the search root (only present in search results) */
  relpath?: string;
}

interface RemoteMount {
  id: string;
  name: string;
  type: "smb";
  host?: string;
  share?: string;
  path?: string;
  domain?: string;    // SMB
  username: string;
  password?: string;
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
const { enqueueTransfers, enqueueExtract, enqueueCompress, addUploadJob, hasActive } = useTransferJobs();
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
const folderTreeRef = ref<{ refresh: () => void; refreshNow: () => void } | null>(null);
const leftPanelRef = ref<any>(null);
const rightPanelRef = ref<any>(null);

// ── Drag-and-drop state ─────────────────────────────────────────────────
const dropTargetBc = ref<string | null>(null);
const currentBcDragEl = ref<HTMLElement | null>(null);
const isCopyKey = ref(false);
const splitActive = ref(false);
const leftPanelPath = ref("");
const rightPanelPath = ref("");
const activePanelIndex = ref(0);
const splitRatio = ref(0.5);
const leftFlex = computed(() => {
  const r = splitRatio.value;
  if (r >= 1) return 999;
  if (r <= 0) return 0;
  return r / (1 - r);
});
let _isDragging = false;

watch(splitActive, (isActive) => {
  if (isActive) {
    // Split activating: left panel keeps the current path, right panel gets root
    leftPanelPath.value = currentPath.value;
    rightPanelPath.value = "";
  } else {
    // Split deactivating: single panel resumes the left panel's path
    navigate(leftPanelPath.value);
  }
});

function onDividerMouseDown(e: MouseEvent) {
  _isDragging = true;
  const layout = (e.currentTarget as HTMLElement).parentElement!;
  const rect = layout.getBoundingClientRect();

  function onMouseMove(ev: MouseEvent) {
    if (!_isDragging) return;
    const x = ev.clientX - rect.left;
    splitRatio.value = Math.max(0.2, Math.min(0.8, x / rect.width));
  }

  function onMouseUp() {
    _isDragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

// ── Split panel bridge functions ─────────────────────────────────────────────
function onSinglePanelPathChange(path: string) {
  navigate(path);
}
function onPanelTransfer(payload: { sources: string[]; dest: string; copy: boolean }) {
  doQuickTransfer(payload.sources, payload.dest, payload.copy);
}
function onPanelRenameItem(payload: { item: FileItem; currentPath: string }) {
  if (payload.item) startRename(payload.item);
}
function onPanelDelete(paths: string[]) {
  if (paths.length === 1) {
    const name = paths[0].split("/").pop() || paths[0];
    const item = items.value.find((i) => i.name === name);
    if (item) confirmDeleteOne(item);
  } else {
    deleteTargets.value = paths;
    showDeleteDialog.value = true;
  }
}
function onPanelOpenTransferDialog(payload: { sources: string[]; mode: "move" | "copy" }) {
  openTransferDialog(payload.sources, payload.mode);
}
function onPanelCompressSources(payload: { sources: string[]; seedName: string }) {
  openCompressDialogForSources(payload.sources, payload.seedName);
}
function onPanelExtractHere(path: string) {
  doExtractHere(path);
}
function onPanelExtractToFolder(payload: { path: string; folder: string }) {
  doExtractToFolder(payload.path, payload.folder);
}
function onPanelOpenExtractDialog(path: string) {
  openExtractDialog(path);
}
function onPanelOpenImagePreview(item: FileItem) {
  openImagePreview(item);
}
function onPanelOpenTextEditor(item: FileItem) {
  openTextEditor(item);
}
function onPanelOpenVideoPreview(item: FileItem) {
  openVideoPreview(item);
}
function onPanelPlayInWebamp(item: FileItem) {
  openInWebamp(item);
}
function onPanelOpenComic(item: FileItem) {
  openComic(item);
}
function onPanelDownloadFile(name: string) {
  downloadFile(name);
}
function onPanelSmartRenamePaths(paths: string[]) {
  startSmartRenameForPaths(paths);
}
function onPanelUploadFiles(files: File[]) {
  uploadFiles(files);
}
function onPanelUnmountItem(item: FileItem) {
  confirmUnmount(item);
}

// ── Search ──────────────────────────────────────────────────────────────────
const searchQuery = ref("");
const searchResults = ref<FileItem[]>([]);
const searching = ref(false);
const hasSearched = computed(() => searchResults.value.length > 0 || (searching.value && searchQuery.value.trim().length > 0));

const displayItems = computed(() =>
  hasSearched.value ? searchResults.value : sortedItems.value,
);

async function doSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;
  searching.value = true;
  try {
    const res = await apiFetch<{ results: FileItem[] }>(
      `/api/files/search?path=${encodeURIComponent(currentPath.value)}&q=${encodeURIComponent(q)}`,
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

// Refreshes both the file list and the folder-tree sidebar.
// Use this as the post-action callback for any operation that may add,
// remove, or rename a folder (delete, move, rename, mkdir).
async function loadDirAndTree() {
  loadDirNow();
  // Refresh split panels if they exist
  (leftPanelRef as any)?.value?.refresh?.();
  (rightPanelRef as any)?.value?.refresh?.();
  try {
    await apiFetch("/api/files/cache-invalidate", { method: "POST", query: { reason: "file-op" } });
  } catch { /* ignore */ }
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

// ── Remote mounts state ────────────────────────────────────────────────────
const remoteMounts = ref<RemoteMount[]>([]);
const showRemoteDropdown = ref(false);

// ── Remote mount dialog state ──────────────────────────────────────────────
const showRemoteDialog = ref(false);
const remoteForm = reactive({
  type: "smb" as "smb",
  name: "",
  host: "",
  share: "",
  url: "",
  path: "",
  domain: "",
  username: "",
  password: "",
  readOnly: false,
});

const protocolOptions = [
  { label: "SMB/CIFS", value: "smb" },
];
const validating = ref(false);

// ── Unmount dialog state ───────────────────────────────────────────────────
const showUnmountDialog = ref(false);
const unmountTarget = ref<RemoteMount | null>(null);

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

// ── Overwrite confirm dialog state ─────────────────────────────────
const showOverwriteDialog = ref(false);
const overwriteConflicts = ref<string[]>([]);
/** Transfer params saved while the overwrite dialog is open */
let pendingOverwriteSources: string[] = [];
let pendingOverwriteDest = "";
let pendingOverwriteMode: "move" | "copy" = "move";

// ── Extract dialog state ──────────────────────────────────────────────
const showExtractDialog = ref(false);
const extractSource = ref("");
const extractDest = ref("");
const extractPassword = ref("");

// ── Extract error modal ───────────────────────────────────────────────
const showExtractErrorDialog = ref(false);
const extractErrorMessage = ref("");

function onExtractSettled(error?: string) {
  loadDir();
  if (error) {
    extractErrorMessage.value = error;
    showExtractErrorDialog.value = true;
  }
}

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
  // Default destination to root so user can pick from the top
  transferDest.value = "";
  showTransferDialog.value = true;
}

async function doTransfer() {
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

  // Check for conflicts before adding the job
  try {
    const { conflicts } = await apiFetch<{ conflicts: string[] }>(
      "/api/files/check-conflicts",
      {
        query: {
          sources: transferSources.value,
          destination: transferDest.value,
        },
      },
    );

    if (conflicts.length > 0) {
      // Save transfer params and show overwrite dialog
      overwriteConflicts.value = conflicts;
      pendingOverwriteSources = [...transferSources.value];
      pendingOverwriteDest = transferDest.value;
      pendingOverwriteMode = transferMode.value;
      showTransferDialog.value = false;
      showOverwriteDialog.value = true;
      return;
    }
  } catch {
    // If check fails (e.g. network error), proceed anyway
  }

  doEnqueueTransfer();
}

function doEnqueueTransfer() {
  enqueueTransfers(transferSources.value, transferDest.value, transferMode.value);
  showTransferDialog.value = false;
  selectedItems.clear();
  showToast(
    t("fileManager.transferStarted", { mode: t(`fileManager.${transferMode.value}`) }),
    "success",
  );
}

function cancelOverwrite() {
  showOverwriteDialog.value = false;
  overwriteConflicts.value = [];
}

function confirmOverwrite() {
  showOverwriteDialog.value = false;
  overwriteConflicts.value = [];
  // Use the saved transfer params
  enqueueTransfers(pendingOverwriteSources, pendingOverwriteDest, pendingOverwriteMode);
  selectedItems.clear();
  showToast(
    t("fileManager.transferStarted", { mode: t(`fileManager.${pendingOverwriteMode}`) }),
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
  enqueueExtract(sourceRelPath, currentPath.value, undefined, onExtractSettled);
  showToast(t("fileManager.extractStarted"), "success");
}

function doExtractToFolder(sourceRelPath: string, folderName: string) {
  const dest = currentPath.value ? `${currentPath.value}/${folderName}` : folderName;
  enqueueExtract(sourceRelPath, dest, undefined, onExtractSettled);
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
    onExtractSettled,
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

// ── Text editor ───────────────────────────────────────────────────────────
const TEXT_EDIT_RE = /\.(txt|cfg|conf|ini|log|json|yaml|yml|toml|md|env|sh|csv)$/i;

function isTextEditable(item: FileItem | null): boolean {
  return item?.type === "file" && TEXT_EDIT_RE.test(item.name);
}

const showTextDialog = ref(false);
const showDiscardDialog = ref(false);
const textEditorName = ref("");
const textEditorPath = ref("");
const textEditorContent = ref("");
const textEditorOriginal = ref("");
const savingText = ref(false);

const textEditorDirty = computed(() => textEditorContent.value !== textEditorOriginal.value);

async function openTextEditor(item: FileItem) {
  const rel = currentPath.value ? `${currentPath.value}/${item.name}` : item.name;
  try {
    const data = await apiFetch<{ content: string }>(
      `/api/files/text?path=${encodeURIComponent(rel)}`,
    );
    textEditorPath.value = rel;
    textEditorName.value = item.name;
    textEditorContent.value = data.content;
    textEditorOriginal.value = data.content;
    showTextDialog.value = true;
  } catch (e: any) {
    showToast(e?.data?.statusMessage || t("fileManager.editTextLoadError"), "error");
  }
}

async function saveTextFile() {
  savingText.value = true;
  try {
    await apiFetch("/api/files/text", {
      method: "POST",
      body: { path: textEditorPath.value, content: textEditorContent.value },
    });
    textEditorOriginal.value = textEditorContent.value;
    showToast(t("fileManager.editTextSaved"), "success");
  } catch (e: any) {
    showToast(e?.data?.statusMessage || t("fileManager.editTextSaveError"), "error");
  } finally {
    savingText.value = false;
  }
}

function closeTextEditor() {
  if (textEditorDirty.value) {
    showDiscardDialog.value = true;
  } else {
    showTextDialog.value = false;
  }
}

function confirmDiscard() {
  showDiscardDialog.value = false;
  showTextDialog.value = false;
}

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
  void loadRemoteMounts();
  restoreComicFromHash();
});
onMounted(() => {
  // Track Ctrl/Shift for drag-and-drop copy mode
  const onDndKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Control" || e.key === "Shift") {
      isCopyKey.value = true;
      if (currentBcDragEl.value) {
        currentBcDragEl.value.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
      }
    }
  };
  const onDndKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Control" || e.key === "Shift") {
      isCopyKey.value = false;
      if (currentBcDragEl.value) {
        currentBcDragEl.value.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
      }
    }
  };
  window.addEventListener("keydown", onDndKeyDown);
  window.addEventListener("keyup", onDndKeyUp);
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onDndKeyDown);
    window.removeEventListener("keyup", onDndKeyUp);
  });
});

// ── Auto-refresh panels every 3s to pick up background task changes ────────
let _refreshTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  _refreshTimer = setInterval(() => {
    (leftPanelRef as any)?.value?.silentRefresh?.();
    (rightPanelRef as any)?.value?.silentRefresh?.();
  }, 3000);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onPreviewKeydown);
  if (_refreshTimer) clearInterval(_refreshTimer);
});

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
const { webampTrack, isMp3Name, openTrack, openTracks, setPendingDragTracks } = useWebamp();

/** Comic file extensions */
const COMIC_EXTS = new Set(["cbr", "cbz", "pdf"]);

/** Currently open comic path/name for ComicReader component */
const comicFilePath = ref("");
const comicFileName = ref("");
const comicInitialPage = ref(0);

function isComicFile(item: FileItem | null): boolean {
  if (!item || item.type !== "file" || item.isRemoteMount) return false;
  const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
  return COMIC_EXTS.has(ext);
}

function openComic(item: FileItem, initialPage?: number) {
  comicFilePath.value = downloadUrl(item.name);
  comicFileName.value = item.name;
  comicInitialPage.value = initialPage ?? 0;
  // Persist to URL hash for refresh recovery
  const relPath = currentPath.value ? `${currentPath.value}/${item.name}` : item.name;
  const hashPage = initialPage && initialPage > 0 ? initialPage : 1;
  history.replaceState(null, '', `#comic=${encodeURIComponent(relPath)}|${hashPage}`);
}

function onComicClose() {
  comicFilePath.value = "";
  comicFileName.value = "";
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

function onComicPageChange(page: number) {
  // Update page number in hash, keeping the path intact
  const hash = window.location.hash;
  if (hash.startsWith("#comic=")) {
    const parts = hash.slice(7).split("|");
    if (parts.length >= 2) {
      // parts[0] is already URL-encoded — reuse as-is to avoid double encoding
      history.replaceState(null, '', `#comic=${parts[0]}|${page}`);
    }
  }
}

async function onComicRequestNext() {
  const current = comicFileName.value;
  if (!current) return;
  try {
    const res = await apiFetch<{ items: FileItem[] }>(
      `/api/files/list?path=${encodeURIComponent(currentPath.value)}`,
    );
    const comicFiles = (res.items ?? [])
      .filter((item) => item.type === "file" && isComicFile(item))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const idx = comicFiles.findIndex((f) => f.name === current);
    if (idx !== -1 && idx < comicFiles.length - 1) {
      openComic(comicFiles[idx + 1]);
    }
  } catch {
    // Silently ignore — if the listing fails, just stay on the current comic
  }
}

async function onComicRequestPrev() {
  const current = comicFileName.value;
  if (!current) return;
  try {
    const res = await apiFetch<{ items: FileItem[] }>(
      `/api/files/list?path=${encodeURIComponent(currentPath.value)}`,
    );
    const comicFiles = (res.items ?? [])
      .filter((item) => item.type === "file" && isComicFile(item))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const idx = comicFiles.findIndex((f) => f.name === current);
    if (idx !== -1 && idx > 0) {
      // Open previous comic on its LAST page (-1 sentinel)
      openComic(comicFiles[idx - 1], -1);
    }
  } catch {
    // Silently ignore
  }
}

/** Parse comic hash on mount and restore reader state. */
function restoreComicFromHash() {
  const hash = window.location.hash;
  if (!hash.startsWith("#comic=")) return;
  const parts = hash.slice(7).split("|");
  if (parts.length < 2) return;
  const relPath = decodeURIComponent(parts[0]);
  const page = parseInt(parts[1], 10);
  if (!relPath || isNaN(page)) return;
  // Reconstruct download URL from the stored path
  const base = (config.public.apiBase as string) || "";
  comicFilePath.value = `${base}/api/files/download?path=${encodeURIComponent(relPath)}&token=${encodeURIComponent(auth.token.value || "")}`;
  comicFileName.value = relPath.split("/").pop() || relPath;
  comicInitialPage.value = page;
}

/** MP3 files among the current selection. */
const selectedMp3s = computed(() =>
  items.value.filter((i) => i.type === "file" && isMp3Name(i.name) && selectedItems.has(i.name)),
);

function isMp3(item: FileItem | null): boolean {
  return item?.type === "file" && isMp3Name(item.name);
}

function isWebampAudio(item: FileItem | null): boolean {
  if (!item || item.type !== "file") return false;
  const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
  return WINAMP_EXTS.has(ext);
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

function onTreeUnmount() {
  const mount = remoteMounts.value.find((m) => m.name === treeCtxMenu.value.name);
  if (mount) {
    unmountTarget.value = mount;
    showUnmountDialog.value = true;
  }
  hideTreeCtxMenu();
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
const activePath = computed(() =>
  splitActive.value
    ? (activePanelIndex.value === 0 ? leftPanelPath.value : rightPanelPath.value)
    : currentPath.value,
);
const pathSegments = computed(() =>
  activePath.value ? activePath.value.split("/").filter(Boolean) : [],
);
/** Translate path segments for display (e.g. "home" → "descargas" in es) */
function displaySeg(seg: string): string {
  if (seg === "home") return t("fileManager.homeFolder");
  return seg;
}

function childPath(name: string) {
  return currentPath.value ? `${currentPath.value}/${name}` : name;
}

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(path: string) {
  const safe = sanitizePath(path);
  selectedItems.clear();
  router.push({ query: safe ? { path: safe } : {} });
}

function navigateUp() {
  const segs = pathSegments.value.slice(0, -1);
  navigate(segs.join("/"));
}

// ── Debounced loadDir (3s window) ─────────────────────────────────────────
let _loadDirTimer: ReturnType<typeof setTimeout> | null = null;

async function _doLoadDir() {
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

async function loadDir() {
  if (_loadDirTimer) clearTimeout(_loadDirTimer);
  _loadDirTimer = setTimeout(() => {
    _loadDirTimer = null;
    _doLoadDir();
  }, 3000);
}

/** Force an immediate loadDir (skips debounce) */
async function loadDirNow() {
  if (_loadDirTimer) {
    clearTimeout(_loadDirTimer);
    _loadDirTimer = null;
  }
  await _doLoadDir();
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

function onRowDblClick(_e: MouseEvent, item: FileItem) {
  const handler = getFileHandler(item);
  if (handler) handler.action(item);
}

// ── Centralized file-type → handler mapping ────────────────────────────
interface FileHandler {
  exts: RegExp;
  action: (item: FileItem) => void;
}

const FILE_HANDLERS: FileHandler[] = [
  { exts: IMAGE_RE, action: openImagePreview },
  { exts: TEXT_EDIT_RE, action: openTextEditor },
  { exts: VIDEO_RE, action: openVideoPreview },
  { exts: /\.(mp3|wav|flac|ogg|m4a|opus|aac|wma)$/i, action: openInWebamp },
  { exts: /\.(cbr|cbz|pdf)$/i, action: openComic },
];

function getFileHandler(item: FileItem): FileHandler | undefined {
  if (item.type !== "file") return undefined;
  return FILE_HANDLERS.find((h) => h.exts.test(item.name));
}

// ── Download URL (token in query param — browser anchor can't set headers) ──
function downloadUrl(filename: string): string {
  const base = (config.public.apiBase as string) || "";
  const rel = currentPath.value ? `${currentPath.value}/${filename}` : filename;
  return `${base}/api/files/download?path=${encodeURIComponent(rel)}&token=${encodeURIComponent(auth.token.value || "")}`;
}

/**
 * Download a file by fetching it as a blob and creating a temporary anchor.
 * This allows better error handling for remote SMB files.
 */
async function downloadFile(filename: string) {
  const url = downloadUrl(filename);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.statusMessage || t("fileManager.downloadError"));
    }
    const blob = await response.blob();
    const downloadUrlObj = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrlObj;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrlObj);
  } catch (err: any) {
    showToast(err.message || t("fileManager.downloadError"), "error");
  }
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
  e.dataTransfer!.effectAllowed = "all";
  e.dataTransfer!.setData("application/x-fm-paths", JSON.stringify(paths));

  // Support dragging audio files to Webamp
  const audioExts = [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".opus"];
  const ext = "." + item.name.split(".").pop()?.toLowerCase();
  if (audioExts.includes(ext)) {
    const tracks = selectedItems.has(item.name)
      ? Array.from(selectedItems)
          .filter((n) => {
            const e = "." + n.split(".").pop()?.toLowerCase();
            return audioExts.includes(e);
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

// ── Breadcrumb drag-and-drop ─────────────────────────────────────────────

function onBcDragOver(e: DragEvent, path: string) {
  if (!isAdmin.value) return;
  if (!e.dataTransfer) return;
  e.preventDefault();
  currentBcDragEl.value = e.currentTarget as HTMLElement;
  if (!e.dataTransfer.types.includes("application/x-fm-paths")) return;
  dropTargetBc.value = path;
  const copy = e.ctrlKey || e.shiftKey || isCopyKey.value;
  e.dataTransfer.dropEffect = copy ? "copy" : "move";
}

function onBcDragLeave(e: DragEvent) {
  if (
    dropTargetBc.value !== null &&
    !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)
  ) {
    dropTargetBc.value = null;
    currentBcDragEl.value = null;
  }
}

function onBcDrop(e: DragEvent, path: string) {
  dropTargetBc.value = null;
  currentBcDragEl.value = null;
  if (!isAdmin.value) return;
  const fmData = e.dataTransfer?.getData("application/x-fm-paths");
  if (!fmData) return;
  try {
    const sources: string[] = JSON.parse(fmData);
    const copy = e.ctrlKey || e.shiftKey || isCopyKey.value;
    doQuickTransfer(sources, path, copy);
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
  enqueueTransfers(sources, dest, copy ? "copy" : "move");
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
  // JWT is sent via the auth_token cookie — do NOT add Authorization: Bearer
  // as that would overwrite the nginx Basic auth header.
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

// ── Remote mounts ──────────────────────────────────────────────────────────
async function loadRemoteMounts() {
  try {
    remoteMounts.value = await apiFetch<RemoteMount[]>("/api/files/remote-mounts");
  } catch {
    remoteMounts.value = [];
  }
}

function openRemoteModal() {
  showRemoteDropdown.value = false;
  remoteForm.type = "smb";
  remoteForm.name = "";
  remoteForm.host = "";
  remoteForm.share = "";
  remoteForm.path = "";
  remoteForm.domain = "";
  remoteForm.username = "";
  remoteForm.password = "";
  remoteForm.readOnly = false;
  showRemoteDialog.value = true;
}

async function validateRemote() {
  validating.value = true;
  try {
    const body: any = {
      host: remoteForm.host.trim(),
      share: remoteForm.share.trim(),
      path: remoteForm.path.trim() || undefined,
      domain: remoteForm.domain.trim() || undefined,
      username: remoteForm.username.trim(),
      password: remoteForm.password,
    };

    // Test connection without creating a mount
    const res = await apiFetch<{ ok: boolean; error?: string }>(
      "/api/files/remote-mounts/validate",
      { method: "POST", body },
    );
    if (res.ok) {
      showToast(t("fileManager.validationOk"), "success");
    } else {
      showToast(t("fileManager.validationFailed", { error: res.error || "" }), "error");
    }
  } catch (err: any) {
    showToast(err?.data?.statusMessage ?? t("errors.middlewareError", { status: 0 }), "error");
  } finally {
    validating.value = false;
  }
}

async function doCreateRemote() {
  const name = remoteForm.name.trim();
  if (!name || !remoteForm.username.trim() || !remoteForm.password) {
    showToast(t("fileManager.missingFields"), "error");
    return;
  }
  
  if (!remoteForm.host.trim() || !remoteForm.share.trim()) {
    showToast(t("fileManager.missingSmbFields"), "error");
    return;
  }

  
  working.value = true;
  try {
    const body: any = {
      name,
      type: remoteForm.type,
      username: remoteForm.username.trim(),
      password: remoteForm.password,
    };
    
    body.host = remoteForm.host.trim();
    body.share = remoteForm.share.trim();
    body.path = remoteForm.path.trim() || undefined;
    body.domain = remoteForm.domain.trim() || undefined;
    body.readOnly = remoteForm.readOnly;

    await apiFetch("/api/files/remote-mounts", {
      method: "POST",
      body,
    });
    showToast(t("fileManager.mountCreated"), "success");
    showRemoteDialog.value = false;
    await loadRemoteMounts();
    loadDir();
    folderTreeRef.value?.refresh();
  } catch (err: any) {
    showToast(err?.data?.statusMessage ?? t("fileManager.mountError", { error: err?.data?.statusMessage || "" }), "error");
  } finally {
    working.value = false;
  }
}

function confirmUnmount(item: FileItem) {
  const mount = remoteMounts.value.find((m) => m.name === item.name);
  if (!mount) return;
  if (hasActive.value) {
    showToast(t("fileManager.unmountBlocked"), "warning");
    return;
  }
  unmountTarget.value = mount;
  showUnmountDialog.value = true;
}

async function doUnmount() {
  if (!unmountTarget.value) return;
  working.value = true;
  try {
    await apiFetch(`/api/files/remote-mounts/${unmountTarget.value.id}`, { method: "DELETE" });
    showToast(t("fileManager.mountRemoved"), "success");
    showUnmountDialog.value = false;
    unmountTarget.value = null;
    await loadRemoteMounts();
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
const WINAMP_EXTS = new Set(["mp3", "wav", "flac", "ogg", "m4a", "opus", "aac", "wma"]);

function isAudioFile(item: FileItem): boolean {
  if (item.type !== "file") return false;
  const ext = item.name.split(".").pop()?.toLowerCase() ?? "";
  return WINAMP_EXTS.has(ext);
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
// Initial load bypasses debounce so the directory shows immediately
loadDirNow();</script>

<style scoped>
.fm-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ── Header row (title + search) ──────────────────────────────────────────── */
.fm-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.fm-header-search {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.fm-header-search .s-input {
  width: 220px;
}
@media (max-width: 480px) {
  .fm-header-search .s-input {
    width: 140px;
  }
}
.fm-relpath {
  color: var(--s-text-secondary);
  font-size: 0.85em;
  cursor: pointer;
}
.fm-relpath:hover {
  color: var(--s-accent);
  text-decoration: underline;
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

/* ── Split panel layout ────────────────────────────────────────── */
.fm-panel-wrap {
  flex: 1;
  min-width: 0;
}
.fm-split-layout {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  gap: 0;
}
.fm-split-panel {
  min-width: 0;
  flex: 1 1 0;
  overflow: hidden;
}
.fm-split-divider {
  width: 5px;
  flex-shrink: 0;
  cursor: col-resize;
  background: var(--s-border);
  border-radius: 3px;
  transition: background 0.15s;
}
.fm-split-divider:hover {
  background: var(--s-accent);
}
.fm-split-toggle {
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
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.fm-split-toggle:hover,
.fm-split-toggle.is-active {
  border-color: var(--s-accent);
  color: var(--s-accent);
  background: color-mix(in oklab, var(--s-accent) 10%, transparent);
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

/* Drag-and-drop highlight on breadcrumb segments */
.fm-breadcrumb li a.is-drop-target {
  background: color-mix(in oklab, var(--s-accent) 18%, transparent) !important;
  outline: 2px solid var(--s-accent);
  outline-offset: -1px;
}
.fm-breadcrumb li a.is-drop-target-copy {
  outline-color: var(--s-success, #22c55e);
  background: color-mix(in oklab, var(--s-success, #22c55e) 14%, transparent) !important;
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

.fm-icon-winamp {
  width: 1.2rem;
  height: 1.2rem;
  object-fit: contain;
}

.fm-icon-comic {
  width: 1.2rem;
  height: 1.2rem;
  object-fit: contain;
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
  max-height: calc(80vh - 10rem);
  overflow: hidden;
  background: var(--s-bg);
  border-radius: var(--s-radius);
  position: relative;
}
.fm-img-preview__img {
  max-width: 100%;
  max-height: calc(80vh - 10rem);
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

/* ── Text editor ──────────────────────────────────────────────────── */
.fm-text-editor {
  width: 100%;
  min-height: 50vh;
  max-height: calc(80vh - 10rem);
  resize: vertical;
  background: var(--s-bg-input);
  color: var(--s-text);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  padding: 0.75rem;
  font-family: "Courier New", Courier, monospace;
  font-size: 0.82rem;
  line-height: 1.55;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;

  &:focus {
    border-color: var(--s-accent);
  }
}

/* ── Remote folder dropdown ─────────────────────────────────────────── */
.fm-dropdown {
  position: relative;
  display: inline-block;
}
.fm-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 100;
  min-width: 180px;
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  padding: 4px 0;
}
.fm-dropdown-item {
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
.fm-dropdown-item:hover {
  background: var(--s-bg-hover);
}

/* ── Overwrite confirm dialog ─────────────────────────────────────── */
.fm-overwrite-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: 6px;
}
.fm-overwrite-item {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  font-size: 0.8125rem;
  color: var(--s-text-secondary);
  border-bottom: 1px solid var(--s-border);
}
.fm-overwrite-item:last-child {
  border-bottom: none;
}
.fm-overwrite-item .mdi {
  color: var(--s-warning, #f59e0b);
  flex-shrink: 0;
}
</style>
