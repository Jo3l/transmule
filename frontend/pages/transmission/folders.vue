<template>
  <SLoading :loading="loading">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-folder-cog mr-1" />
      {{ $t("transmission.folders.title") }}
    </h1>

    <div class="box">
      <SFormItem :label="$t('transmission.folders.downloadDir')">
        <SInput
          v-model="form.downloadDir"
          :placeholder="$t('transmission.folders.downloadDirPlaceholder')"
          style="max-width: 400px"
          @blur="save"
        />
        <span v-if="freeSpace !== null" class="ml-3 has-text-grey is-size-7"
          >{{ formatSize(freeSpace) }}
          {{ $t("transmission.folders.free") }}</span
        >
      </SFormItem>

      <SDivider />

      <SFormItem :label="$t('transmission.folders.useIncompleteDir')">
        <SSwitch
          v-model="form.incompleteDirEnabled"
          @update:model-value="save"
        />
      </SFormItem>
      <SFormItem
        v-if="form.incompleteDirEnabled"
        :label="$t('transmission.folders.incompleteDir')"
      >
        <SInput
          v-model="form.incompleteDir"
          :placeholder="$t('transmission.folders.incompleteDirPlaceholder')"
          style="max-width: 400px"
          @blur="save"
        />
      </SFormItem>

      <SDivider />

      <SFormItem :label="$t('transmission.folders.startWhenAdded')">
        <SSwitch v-model="form.startAdded" @update:model-value="save" />
      </SFormItem>
      <SFormItem :label="$t('transmission.folders.renamePartial')">
        <SSwitch v-model="form.renamePartial" @update:model-value="save" />
      </SFormItem>
      <SFormItem :label="$t('transmission.folders.trashTorrent')">
        <SSwitch v-model="form.trashOriginal" @update:model-value="save" />
      </SFormItem>

      <SDivider />

      <SFormItem :label="$t('transmission.folders.cacheSize')">
        <SInputNumber
          v-model="form.cacheSizeMb"
          :min="0"
          :step="1"
          style="width: 160px"
          @update:model-value="save"
        />
        <span class="ml-2 has-text-grey is-size-7">{{
          $t("transmission.folders.mb")
        }}</span>
      </SFormItem>

      <SDivider />

      <h6 class="title is-6 mb-3">
        {{ $t("transmission.folders.scriptSection") }}
      </h6>

      <SFormItem :label="$t('transmission.folders.runScript')">
        <SSwitch v-model="form.scriptEnabled" @update:model-value="save" />
      </SFormItem>
      <SFormItem
        v-if="form.scriptEnabled"
        :label="$t('transmission.folders.scriptPath')"
      >
        <SInput
          v-model="form.scriptFilename"
          :placeholder="$t('transmission.folders.scriptPlaceholder')"
          style="max-width: 400px"
          @blur="save"
        />
      </SFormItem>
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { transmissionRunning } = useServiceGuard();
const loading = ref(true);
const freeSpace = ref<number | null>(null);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const form = reactive({
  downloadDir: "",
  incompleteDirEnabled: false,
  incompleteDir: "",
  startAdded: true,
  renamePartial: true,
  trashOriginal: false,
  cacheSizeMb: 4,
  scriptEnabled: false,
  scriptFilename: "",
});

function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0,
    v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

async function fetchSession() {
  if (!transmissionRunning.value) return;
  loading.value = true;
  try {
    const { raw } = await apiFetch<any>("/api/transmission/session");
    form.downloadDir = raw["download-dir"] || "";
    form.incompleteDirEnabled = raw["incomplete-dir-enabled"] ?? false;
    form.incompleteDir = raw["incomplete-dir"] || "";
    form.startAdded = raw["start-added-torrents"] ?? true;
    form.renamePartial = raw["rename-partial-files"] ?? true;
    form.trashOriginal = raw["trash-original-torrent-files"] ?? false;
    form.cacheSizeMb = raw["cache-size-mb"] ?? 4;
    form.scriptEnabled = raw["script-torrent-done-enabled"] ?? false;
    form.scriptFilename = raw["script-torrent-done-filename"] || "";
    freeSpace.value = raw["download-dir-free-space"] ?? null;
  } finally {
    loading.value = false;
  }
}

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 600);
}

async function doSave() {
  try {
    await apiFetch("/api/transmission/session", {
      method: "POST",
      body: {
        "download-dir": form.downloadDir,
        "incomplete-dir-enabled": form.incompleteDirEnabled,
        "incomplete-dir": form.incompleteDir,
        "start-added-torrents": form.startAdded,
        "rename-partial-files": form.renamePartial,
        "trash-original-torrent-files": form.trashOriginal,
        "cache-size-mb": form.cacheSizeMb,
        "script-torrent-done-enabled": form.scriptEnabled,
        "script-torrent-done-filename": form.scriptFilename,
      },
    });
  } catch {
    /* useApi shows error toast */
  }
}

onMounted(() => fetchSession());
</script>
