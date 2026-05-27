<template>
  <div class="box">
    <h6 class="title is-6 mb-3 mt-3">Webamp</h6>

    <!-- Default windows -->
    <p class="has-text-grey is-size-7 mb-3">{{ $t("settings.webampDefaultWindows") }}</p>
    <div class="field">
      <SSwitch v-model="webampShowEq">{{ $t("settings.webampEqualizer") }}</SSwitch>
    </div>
    <div class="field">
      <SSwitch v-model="webampShowPlaylist">{{ $t("settings.webampPlaylist") }}</SSwitch>
    </div>
    <div class="field">
      <SSwitch v-model="webampShowMilkdrop">{{ $t("settings.webampMilkdrop") }}</SSwitch>
    </div>
    <div class="field">
      <SSwitch v-model="webampDoubleSize">{{ $t("settings.webampDoubleSize") }}</SSwitch>
    </div>

    <p class="has-text-grey is-size-7 mb-3">
      {{ $t("settings.webampSkinsGuideBefore") }}
      <a href="https://skins.webamp.org" target="_blank" rel="noopener">skins.webamp.org</a>
      {{ $t("settings.webampSkinsGuideAfter") }}
    </p>

    <div class="webamp-install-row">
      <SInput
        v-model="skinInstallUrl"
        type="url"
        :placeholder="$t('settings.webampInstallPlaceholder')"
        class="webamp-install-input"
      />
      <SButton variant="primary" size="sm" :loading="installingSkin" @click="installSkin">
        {{ $t("settings.webampInstall") }}
      </SButton>
    </div>

    <div v-if="skins.length === 0 && !loadingSkins" class="has-text-grey is-size-7 mb-3">
      {{ $t("settings.webampNoSkins") }}
    </div>

    <!-- Default skin (always present) -->
    <div class="skin-row">
      <div class="skin-info">
        <strong class="skin-name">{{ $t("settings.webampDefaultSkin") }}</strong>
        <span class="skin-size">{{ $t("settings.webampBuiltin") }}</span>
      </div>
      <div class="skin-actions">
        <SButton
          :variant="!activeWebampSkin || skins.length === 0 ? 'warning' : 'default'"
          size="mini"
          @click="selectDefaultSkin"
        >
          {{
            !activeWebampSkin || skins.length === 0
              ? $t("settings.webampActive")
              : $t("settings.webampUse")
          }}
        </SButton>
      </div>
    </div>

    <!-- Installed skins -->
    <div v-for="s in skins" :key="s.name" class="skin-row">
      <div class="skin-info">
        <strong class="skin-name">{{ s.name }}</strong>
        <span class="skin-size">{{ formatSize(s.size) }}</span>
      </div>
      <div class="skin-actions">
        <SButton
          :variant="s.name === activeWebampSkin ? 'warning' : 'default'"
          size="mini"
          @click="selectSkin(s.name)"
        >
          {{
            s.name === activeWebampSkin
              ? $t("settings.webampActive")
              : $t("settings.webampUse")
          }}
        </SButton>
        <SButton
          variant="danger"
          size="mini"
          :loading="deletingSkin === s.name"
          @click="deleteSkin(s.name)"
        >
          {{ $t("settings.webampDelete") }}
        </SButton>
      </div>
    </div>

    <div class="webamp-save-row">
      <SButton variant="primary" :loading="savingWebamp" @click="saveWebamp">
        {{ $t("settings.save") }}
      </SButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { apiFetch } = useApi();

const webampShowEq = ref(localStorage.getItem("webampShowEq") !== "false");
const webampShowPlaylist = ref(localStorage.getItem("webampShowPlaylist") !== "false");
const webampShowMilkdrop = ref(localStorage.getItem("webampShowMilkdrop") === "true");
const webampDoubleSize = ref(localStorage.getItem("webampDoubleSize") === "true");
const activeWebampSkin = ref(localStorage.getItem("webampSkin") || "");

watch(webampShowEq, (v) => localStorage.setItem("webampShowEq", String(v)));
watch(webampShowPlaylist, (v) => localStorage.setItem("webampShowPlaylist", String(v)));
watch(webampShowMilkdrop, (v) => localStorage.setItem("webampShowMilkdrop", String(v)));
watch(webampDoubleSize, (v) => localStorage.setItem("webampDoubleSize", String(v)));
watch(activeWebampSkin, (v) => {
  if (v) localStorage.setItem("webampSkin", v);
  else localStorage.removeItem("webampSkin");
});

// Skin management
const skins = ref<{ name: string; file: string; size: number }[]>([]);
const loadingSkins = ref(false);
const skinInstallUrl = ref("");
const installingSkin = ref(false);
const deletingSkin = ref("");
const savingWebamp = ref(false);

onMounted(() => {
  loadSkins();
});

async function loadSkins() {
  loadingSkins.value = true;
  try {
    const res = await apiFetch("/api/webamp/skins");
    skins.value = res.skins || [];
  } catch {
    /* ignore */
  }
  loadingSkins.value = false;
}

async function installSkin() {
  if (!skinInstallUrl.value.trim()) return;
  installingSkin.value = true;
  try {
    await apiFetch("/api/webamp/skins", {
      method: "POST",
      body: { url: skinInstallUrl.value.trim() },
    });
    skinInstallUrl.value = "";
    await loadSkins();
  } catch (e: any) {
    const msg = e.data?.statusMessage || e.message || String(e);
    console.error("Install skin failed:", msg);
    alert("Install failed: " + msg);
  }
  installingSkin.value = false;
}

function selectDefaultSkin() {
  activeWebampSkin.value = "";
  import("~/composables/useWebamp").then(({ resetToDefaultSkin }) => {
    resetToDefaultSkin();
  });
}

async function selectSkin(name: string) {
  activeWebampSkin.value = name;
  try {
    const { changeWebampSkin } = await import("~/composables/useWebamp");
    changeWebampSkin(name);
  } catch (e: any) {
    console.error("Live skin change failed:", e);
    alert("Skin change failed: " + (e.message || e));
  }
}

async function deleteSkin(name: string) {
  deletingSkin.value = name;
  try {
    await apiFetch(`/api/webamp/skins/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (activeWebampSkin.value === name) activeWebampSkin.value = "";
    await loadSkins();
  } catch (e: any) {
    console.error("Delete skin failed:", e.message || e);
  }
  deletingSkin.value = "";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function saveWebamp() {
  savingWebamp.value = true;
  try {
    const { applyWebampSettings } = await import("~/composables/useWebamp");
    applyWebampSettings();
  } catch (e: any) {
    console.error("Apply Webamp settings failed:", e);
  }
  if (activeWebampSkin.value) {
    try {
      const { changeWebampSkin } = await import("~/composables/useWebamp");
      changeWebampSkin(activeWebampSkin.value);
    } catch (e: any) {
      console.error("Live skin change failed:", e);
    }
  } else {
    try {
      const { resetToDefaultSkin } = await import("~/composables/useWebamp");
      resetToDefaultSkin();
    } catch (e: any) {
      console.error("Reset to default skin failed:", e);
    }
  }
  await new Promise((r) => setTimeout(r, 300));
  savingWebamp.value = false;
}
</script>

<style scoped>
.webamp-install-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.webamp-install-input {
  flex: 1;
  max-width: 360px;
}
.webamp-save-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}
.skin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--s-border);
  gap: 0.5rem;
}
.skin-row:last-child {
  border-bottom: none;
}
.skin-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.skin-name {
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skin-size {
  font-size: 0.7rem;
  color: var(--s-text-muted);
}
.skin-actions {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}
.field {
  margin-bottom: 0.5rem;
}
</style>
