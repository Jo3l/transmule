<template>
  <SLoading id="page-slskd-settings" :loading="loading">
    
    <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>
    <SAlert v-if="saved" variant="success" class="mb-4">{{ $t("slskd.settingsSaved") }}</SAlert>

    <STabs
      v-model="activeTab"
      :panes="[
        { name: 'credentials', label: $t('slskd.credentials') },
        { name: 'presence', label: $t('slskd.presence') },
        { name: 'log', label: $t('slskd.log') },
      ]"
    >
      <template #tab-credentials>
        <span class="mdi mdi-account-key mr-1" /> {{ $t("slskd.credentials") }}
      </template>
      <template #tab-presence>
        <span class="mdi mdi-account-multiple-check mr-1" /> {{ $t("slskd.presence") }}
      </template>
      <template #tab-log>
        <span class="mdi mdi-text-box-outline mr-1" /> {{ $t("slskd.log") }}
      </template>

      <!-- ── Credentials tab ─────────────────────────── -->
      <STabPane name="credentials" :active="activeTab === 'credentials'">
        <div class="box">
          <SFormItem :label="$t('slskd.username')">
            <SInput v-model="form.username" class="mw-400" :placeholder="$t('slskd.usernamePlaceholder')" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('slskd.password')">
            <SInput v-model="form.password" type="password" class="mw-400" :placeholder="passwordPlaceholder" />
          </SFormItem>

          <SDivider />

          <SAlert v-if="original.generated" variant="info" class="mb-3">
            {{ $t("slskd.credentialsGenerated") }}
          </SAlert>

          <p class="is-size-7 has-text-grey mb-3" style="max-width: 400px; line-height: 1.5;">
            <span class="mdi mdi-information-outline mr-1" />
            {{ $t("slskd.credentialsGuide") }}
          </p>

          <div class="flex-end">
            <SButton variant="primary" :loading="saving" :disabled="!hasChanges" @click="save" icon="mdi-content-save">
              {{ $t("common.save") }}
            </SButton>
          </div>
        </div>
      </STabPane>

      <!-- ── Presence tab ────────────────────────────── -->
      <STabPane name="presence" :active="activeTab === 'presence'">
        <div class="box">
          <SFormItem :label="$t('slskd.presenceEnabled')">
            <SSwitch
              :model-value="presence?.enabled ?? false"
              :disabled="presenceSaving || !presence"
              @update:model-value="setPresence"
            />
          </SFormItem>

          <p class="is-size-7 has-text-grey mb-3" style="max-width: 560px; line-height: 1.5;">
            <span class="mdi mdi-information-outline mr-1" />
            {{ $t("slskd.presenceHelp") }}
          </p>

          <p v-if="presence?.enabled" class="is-size-7 mb-0">
            <span class="mdi mdi-tag-outline mr-1" />
            {{ $t("slskd.presenceMarker", { marker: presence.marker }) }}
          </p>
        </div>

        <div class="box">
          <div class="flex-row align-items-center gap-sm mb-3">
            <span class="mdi mdi-account-multiple-check" />
            <strong>{{ $t("slskd.presenceCount") }}</strong>
            <SButton
              v-if="census?.joined"
              size="mini"
              variant="text"
              icon="mdi-refresh"
              :loading="censusLoading"
              :title="$t('slskd.refresh')"
              @click="loadCensus(true)"
            />
          </div>

          <template v-if="census?.joined">
            <div class="flex-row align-items-center gap-sm mb-2 flex-wrap">
              <STag variant="primary" size="sm">{{ census.transmule }}</STag>
              <span class="is-size-7 has-text-grey">{{ $t("slskd.presenceMembers", { n: census.members }) }}</span>
              <span v-if="census.skipped" class="is-size-7 has-text-grey">
                · {{ $t("slskd.presenceSkipped", { n: census.skipped }) }}
              </span>
              <span class="is-size-7 has-text-grey ml-auto">
                {{ $t("slskd.presenceFetchedAt", { time: censusTime }) }}
                <template v-if="census.cached"> · {{ $t("slskd.presenceCached") }}</template>
              </span>
            </div>

            <SAlert v-if="census.partial" variant="warning" class="mb-2">
              {{ $t("slskd.presencePartial") }}
            </SAlert>

            <div v-if="census.instances.length === 0" class="is-size-7 has-text-grey">
              {{ $t("slskd.presenceNone") }}
            </div>
            <div v-else class="presence-instances">
              <div v-for="inst in census.instances" :key="inst.username" class="presence-instance">
                <span class="mdi mdi-account" />
                <span class="presence-instance__user">{{ inst.username }}</span>
                <STag v-if="inst.version" size="sm">{{ inst.version }}</STag>
                <span v-if="inst.uptime" class="is-size-7 has-text-grey">
                  {{ $t("slskd.presenceUptime", { uptime: inst.uptime }) }}
                </span>
              </div>
            </div>
          </template>

          <template v-else>
            <p class="is-size-7 has-text-grey mb-3" style="max-width: 560px; line-height: 1.5;">
              {{ $t("slskd.presenceNotJoined") }}
            </p>
            <SButton
              size="sm"
              variant="primary"
              icon="mdi-account-group"
              :loading="censusLoading"
              @click="joinChannel"
            >
              {{ $t("slskd.presenceJoinChannel") }}
            </SButton>
          </template>
        </div>
      </STabPane>

      <!-- ── Log tab ─────────────────────────────────── -->
      <STabPane name="log" :active="activeTab === 'log'">
        <LogViewer endpoint="/api/slskd/logs" />
      </STabPane>
    </STabs>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch, showToast } = useApi();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

interface SettingsData {
  username: string;
  hasPassword: boolean;
  generated: boolean;
}

interface PresenceData {
  enabled: boolean;
  room: string;
  markerPrefix: string;
  version: string;
  marker: string;
  joined: boolean;
}

interface CensusInstance {
  username: string;
  version: string;
  uptime: string;
  description: string;
}

interface Census {
  room: string;
  joined: boolean;
  members: number;
  transmule: number;
  others: number;
  skipped: number;
  partial: boolean;
  instances: CensusInstance[];
  fetchedAt: string;
  cached: boolean;
}

// ── Tab state ────────────────────────────────────────
const VALID_TABS = ["credentials", "presence", "log"];
const activeTab = ref(VALID_TABS.includes(route.hash.slice(1)) ? route.hash.slice(1) : "credentials");
watch(activeTab, (tab) => {
  router.replace({ hash: `#${tab}` });
  if (tab === "presence") loadCensus(false);
});

// ── Credentials ──────────────────────────────────────
const form = ref({ username: "", password: "" });
const original = ref({ username: "", hasPassword: false, generated: false });
const saving = ref(false);
const saved = ref(false);
const loading = ref(false);
const errorMsg = ref("");

const hasChanges = computed(
  () => form.value.username !== original.value.username || form.value.password !== "",
);

const passwordPlaceholder = computed(() =>
  original.value.hasPassword ? "••••••••" : t("slskd.passwordPlaceholder"),
);

async function loadSettings() {
  try {
    const data = await apiFetch<SettingsData>("/api/slskd/settings");
    original.value = data;
    form.value.username = data.username;
    form.value.password = "";
  } catch { /* silent */ }
}

async function save() {
  saving.value = true;
  saved.value = false;
  errorMsg.value = "";
  try {
    await apiFetch("/api/slskd/settings", {
      method: "POST",
      body: { username: form.value.username, password: form.value.password },
    });
    original.value.username = form.value.username;
    original.value.hasPassword = !!form.value.password;
    original.value.generated = false;
    form.value.password = "";
    saved.value = true;
    showToast(t("slskd.settingsSaved"), "success", 2000);
  } catch (err: any) {
    errorMsg.value = err?.message || t("slskd.actionError");
  } finally {
    saving.value = false;
  }
}

// ── Presence + census ────────────────────────────────
const presence = ref<PresenceData | null>(null);
const presenceSaving = ref(false);
const census = ref<Census | null>(null);
const censusLoading = ref(false);

async function loadPresence() {
  try {
    presence.value = await apiFetch<PresenceData>("/api/slskd/presence");
  } catch { /* silent — the switch stays disabled if the state is unknown */ }
}

async function loadCensus(force = false) {
  censusLoading.value = true;
  try {
    census.value = await apiFetch<Census>(`/api/slskd/census${force ? "?refresh=1" : ""}`);
  } catch (err: any) {
    errorMsg.value = err?.message || t("slskd.actionError");
  } finally {
    censusLoading.value = false;
  }
}

async function setPresence(enabled: boolean) {
  presenceSaving.value = true;
  saved.value = false;
  errorMsg.value = "";
  try {
    await apiFetch("/api/slskd/presence", {
      method: "POST",
      body: { enabled, version: APP_VERSION },
    });
    await loadPresence();
    if (enabled) await loadCensus(true);
    else census.value = null;
    saved.value = true;
    showToast(t("slskd.settingsSaved"), "success", 2000);
  } catch (err: any) {
    errorMsg.value = err?.message || t("slskd.actionError");
    await loadPresence();
  } finally {
    presenceSaving.value = false;
  }
}

async function joinChannel() {
  censusLoading.value = true;
  try {
    await apiFetch("/api/slskd/rooms/join", {
      method: "POST",
      body: { roomName: presence.value?.room || "Transmule" },
    });
    await loadPresence();
    await loadCensus(true);
  } catch (err: any) {
    errorMsg.value = err?.message || t("slskd.actionError");
  } finally {
    censusLoading.value = false;
  }
}

const censusTime = computed(() =>
  census.value?.fetchedAt ? new Date(census.value.fetchedAt).toLocaleTimeString() : "",
);

/**
 * The marker carries the version and the version lives in the frontend bundle,
 * so an upgraded install refreshes the stored value the next time this page is
 * opened (the background uptime refresh cannot know about it).
 */
async function refreshStoredVersion() {
  const state = presence.value;
  if (!state?.enabled || state.version === APP_VERSION) return;
  try {
    await apiFetch("/api/slskd/presence", {
      method: "POST",
      body: { enabled: true, version: APP_VERSION },
    });
    await loadPresence();
  } catch { /* silent — it will be retried next time */ }
}

onMounted(async () => {
  loading.value = true;
  errorMsg.value = "";
  await Promise.all([loadSettings(), loadPresence()]);
  if (activeTab.value === "presence") await loadCensus(false);
  await refreshStoredVersion();
  loading.value = false;
});
</script>

<style scoped>
.presence-instances {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 260px;
  overflow-y: auto;
}
.presence-instance {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.presence-instance__user {
  font-weight: 600;
}
</style>
