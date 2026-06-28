<template>
  <SLoading id="page-amule-settings" :loading="loading">
    <h1 class="title is-4 mb-4">{{ $t("amuleSettings.title") }}</h1>

    <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>
    <SAlert v-if="saved" variant="success" class="mb-4">{{ $t("amuleSettings.saved") }}</SAlert>

    <STabs v-model="activeTab" :panes="tabPanes">
      <template #tab-stats>
        <span class="mdi mdi-chart-bar mr-1" />
        {{ $t('stats.title') }}
      </template>
      <template #tab-general>
        <span class="mdi mdi-tune mr-1" />
        {{ $t('amuleSettings.general') }}
      </template>
      <template #tab-connection>
        <span class="mdi mdi-lan-connect mr-1" />
        {{ $t('amuleSettings.connection') }}
      </template>
      <template #tab-servers>
        <span class="mdi mdi-server mr-1" />
        {{ $t('amuleSettings.servers') }}
      </template>
      <template #tab-security>
        <span class="mdi mdi-shield mr-1" />
        {{ $t('amuleSettings.security') }}
      </template>
      <template #tab-sharing>
        <span class="mdi mdi-folder-network mr-1" />
        {{ $t('amuleSettings.sharing', 'Compartir') }}
      </template>
      <!-- Stats -->
      <STabPane
        name="stats"
        :active="activeTab === 'stats'"
      >
        <SLoading :loading="statsLoading">
          <div class="columns is-multiline" v-if="amuleStats">
            <div class="column is-6">
              <div class="box">
                <h2 class="subtitle is-5 mb-3">{{ $t("stats.connection") }}</h2>
                <div class="kv-list">
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.server") }}</span>
                    <span class="kv-value">{{ amuleStats.serv_name || "—" }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.address") }}</span>
                    <span class="kv-value">{{ amuleStats.serv_addr || "—" }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.ed2kId") }}</span>
                    <span class="kv-value">{{ amuleStats.ed2kId || amuleStats.id || "—" }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.kad") }}</span>
                    <span class="kv-value">{{ connStatus?.kad?.connected ? $t("stats.connected") : $t("stats.disconnected") }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="column is-6">
              <div class="box">
                <h2 class="subtitle is-5 mb-3">{{ $t("stats.transfer") }}</h2>
                <div class="kv-list">
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.downloadSpeed") }}</span>
                    <span class="kv-value">{{ amuleStats.downloadSpeed_fmt || "0 B/s" }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.uploadSpeed") }}</span>
                    <span class="kv-value">{{ amuleStats.uploadSpeed_fmt || "0 B/s" }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.totalDownloaded") }}</span>
                    <span class="kv-value">{{ amuleStats.totalReceivedBytes_fmt || "0 B" }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.totalUploaded") }}</span>
                    <span class="kv-value">{{ amuleStats.totalSentBytes_fmt || "0 B" }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="column is-6">
              <div class="box">
                <h2 class="subtitle is-5 mb-3">{{ $t("stats.network") }}</h2>
                <div class="kv-list">
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.ed2kUsers") }}</span>
                    <span class="kv-value">{{ (amuleStats.ed2kUsers || 0).toLocaleString() }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.ed2kFiles") }}</span>
                    <span class="kv-value">{{ (amuleStats.ed2kFiles || 0).toLocaleString() }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.kadUsers") }}</span>
                    <span class="kv-value">{{ (amuleStats.kadUsers || 0).toLocaleString() }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.kadFiles") }}</span>
                    <span class="kv-value">{{ (amuleStats.kadFiles || 0).toLocaleString() }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.kadNodes") }}</span>
                    <span class="kv-value">{{ (amuleStats.kadNodes || 0).toLocaleString() }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="column is-6">
              <div class="box">
                <h2 class="subtitle is-5 mb-3">{{ $t("stats.queue") }}</h2>
                <div class="kv-list">
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.uploadQueue") }}</span>
                    <span class="kv-value">{{ amuleStats.uploadQueueLength || 0 }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.totalSources") }}</span>
                    <span class="kv-value">{{ amuleStats.totalSourceCount || 0 }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.sharedFiles") }}</span>
                    <span class="kv-value">{{ amuleStats.sharedFileCount || 0 }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-label">{{ $t("stats.bannedClients") }}</span>
                    <span class="kv-value">{{ amuleStats.bannedCount || 0 }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="box" v-if="statsTree && statsTree.length > 0">
            <h2 class="subtitle is-5 mb-3">{{ $t("stats.statsTree") }}</h2>
            <StatsTree :nodes="statsTree" />
          </div>

          <div v-if="!amuleStats && !statsLoading" class="has-text-centered py-5 has-text-grey">
            {{ $t("stats.noStats") }}
          </div>
        </SLoading>
      </STabPane>

      <!-- General -->
      <STabPane
        name="general"
        :active="activeTab === 'general'"
      >
        <div class="box">
          <SFormItem :label="$t('amuleSettings.userNick')">
            <SInput v-model="form.general.userNick" class="mw-400" />
          </SFormItem>

          <SDivider />

          <div class="flex-end">
            <SButton variant="primary" :loading="saving" @click="save('general')">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t("amuleSettings.save") }}
            </SButton>
          </div>
        </div>
      </STabPane>

      <!-- Connection -->
      <STabPane
        name="connection"
        :active="activeTab === 'connection'"
      >
        <div class="box">
          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.downloadCapacity')">
                <SInputNumber v-model="form.connection.downloadCapacity" class="mw-200" />
                <p class="is-size-7 has-text-grey mt-1">
                  {{ $t("amuleSettings.capacityHelp") }}
                </p>
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.uploadCapacity')">
                <SInputNumber v-model="form.connection.uploadCapacity" class="mw-200" />
                <p class="is-size-7 has-text-grey mt-1">
                  {{ $t("amuleSettings.capacityHelp") }}
                </p>
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.maxDownloadSpeed')">
                <SInputNumber v-model="form.connection.maxDownloadSpeed" class="mw-200" />
                <p class="is-size-7 has-text-grey mt-1">
                  {{ $t("amuleSettings.speedLimitHelp") }}
                </p>
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.maxUploadSpeed')">
                <SInputNumber v-model="form.connection.maxUploadSpeed" class="mw-200" />
                <p class="is-size-7 has-text-grey mt-1">
                  {{ $t("amuleSettings.speedLimitHelp") }}
                </p>
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.maxFileSources')">
                <SInputNumber v-model="form.connection.maxFileSources" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.maxConnections')">
                <SInputNumber v-model="form.connection.maxConnections" />
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.slotAllocation')">
            <SInputNumber v-model="form.connection.slotAllocation" />
          </SFormItem>

          <SDivider />

          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.autoconnect')">
                <SSwitch v-model="form.connection.autoconnect" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.reconnect')">
                <SSwitch v-model="form.connection.reconnect" />
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.networkED2K')">
                <SSwitch v-model="form.connection.networkED2K" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.networkKademlia')">
                <SSwitch v-model="form.connection.networkKademlia" />
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <div class="flex-end">
            <SButton variant="primary" :loading="saving" @click="save('connection')">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t("amuleSettings.save") }}
            </SButton>
          </div>
        </div>
      </STabPane>

      <!-- Servers -->
      <STabPane
        name="servers"
        :active="activeTab === 'servers'"
      >
        <div class="box">
          <SFormItem :label="$t('amuleSettings.removeDead')">
            <SSwitch v-model="form.servers.removeDead" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.deadRetries')">
            <SInputNumber v-model="form.servers.deadRetries" class="w-120" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.useScoreSystem')">
            <SSwitch v-model="form.servers.useScoreSystem" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.smartIdCheck')">
            <SSwitch v-model="form.servers.smartIdCheck" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.updateUrl')">
            <SInput
              v-model="form.servers.updateUrl"
              class="mw-500"
              placeholder="http://peerates.net/servers.met"
            />
            <p class="is-size-7 has-text-grey mt-1">{{ $t("amuleSettings.updateUrlHelp") }}</p>
          </SFormItem>

          <SDivider />

          <div class="flex-end">
            <SButton variant="primary" :loading="saving" @click="save('servers')">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t("amuleSettings.save") }}
            </SButton>
          </div>
        </div>
      </STabPane>

      <!-- Security -->
      <STabPane
        name="security"
        :active="activeTab === 'security'"
      >
        <div class="box">
          <SFormItem :label="$t('amuleSettings.canSeeShares')">
            <SSelect v-model="form.security.canSeeShares" :number="true">
              <option :value="0">{{ $t("amuleSettings.sharesNobody") }}</option>
              <option :value="1">
                {{ $t("amuleSettings.sharesFriends") }}
              </option>
              <option :value="2">
                {{ $t("amuleSettings.sharesEveryone") }}
              </option>
            </SSelect>
          </SFormItem>

          <SDivider />

          <h3 class="subtitle is-6">
            {{ $t("amuleSettings.ipFilter") }}
          </h3>

          <div class="columns is-multiline">
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.ipFilterClients')">
                <SSwitch v-model="form.security.ipFilterClients" />
              </SFormItem>
            </div>
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.ipFilterServers')">
                <SSwitch v-model="form.security.ipFilterServers" />
              </SFormItem>
            </div>
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.filterLan')">
                <SSwitch v-model="form.security.filterLan" />
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.ipFilterAutoUpdate')">
            <SSwitch v-model="form.security.ipFilterAutoUpdate" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.ipFilterUpdateUrl')">
            <SInput v-model="form.security.ipFilterUpdateUrl" class="mw-500" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.ipFilterLevel')">
            <SInputNumber v-model="form.security.ipFilterLevel" class="w-120" />
            <p class="is-size-7 has-text-grey mt-1">
              {{ $t("amuleSettings.ipFilterLevelHelp") }}
            </p>
          </SFormItem>

          <SDivider />

          <h3 class="subtitle is-6">
            {{ $t("amuleSettings.protocolObfuscation") }}
          </h3>

          <div class="columns is-multiline">
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.obfuscationSupported')">
                <SSwitch v-model="form.security.obfuscationSupported" />
              </SFormItem>
            </div>
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.obfuscationRequested')">
                <SSwitch v-model="form.security.obfuscationRequested" />
              </SFormItem>
            </div>
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.obfuscationRequired')">
                <SSwitch v-model="form.security.obfuscationRequired" />
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.useSecIdent')">
            <SSwitch v-model="form.security.useSecIdent" />
          </SFormItem>

          <SDivider />

          <div class="flex-end">
            <SButton variant="primary" :loading="saving" @click="save('security')">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t("amuleSettings.save") }}
            </SButton>
          </div>
        </div>
      </STabPane>

      <!-- Sharing -->
      <STabPane
        name="sharing"
        :active="activeTab === 'sharing'"
      >
        <div class="box">
          <p class="has-text-grey is-size-7 mb-3">{{ $t("amuleSettings.sharingDescription", "Configura c\u00f3mo aMule comparte archivos.") }}</p>

          <div class="kv-list mb-3">
            <div class="kv-row">
              <span class="kv-label">{{ $t("amuleSettings.sharedFileCount", "Archivos compartidos") }}</span>
              <span class="kv-value">{{ amuleStats?.sharedFileCount ?? "\u2014" }}</span>
            </div>
          </div>

          <SDivider />

          <SCheckbox v-model="sharingPrefs.includeSubdirs">
            {{ $t("amuleSettings.includeSubdirs", "Buscar archivos en subcarpetas") }}
          </SCheckbox>
          <p class="has-text-grey is-size-7 mt-1">{{ $t("amuleSettings.includeSubdirsHelp", "Al escanear archivos compartidos, incluye tambi\u00e9n los de subdirectorios.") }}</p>

          <div class="mt-4">
            <SButton variant="default" size="sm" :loading="reloadingShared" @click="reloadShared">
              <span class="mdi mdi-refresh mr-1" />
              {{ $t("amuleSettings.reloadShared", "Recargar archivos compartidos") }}
            </SButton>
            <SButton variant="primary" class="ml-2" :loading="saving" @click="saveSharing">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t("amuleSettings.save") }}
            </SButton>
          </div>
        </div>
      </STabPane>
    </STabs>
  </SLoading>
</template>

<script setup lang="ts">
import type { TabPaneDef } from "~/components/s/STabs.vue";

interface PrefsGeneral {
  userNick: string;
  checkNewVersion: boolean;
}
interface PrefsConnection {
  uploadCapacity: number;
  downloadCapacity: number;
  maxUploadSpeed: number;
  maxDownloadSpeed: number;
  slotAllocation: number;
  maxFileSources: number;
  maxConnections: number;
  autoconnect: boolean;
  reconnect: boolean;
  networkED2K: boolean;
  networkKademlia: boolean;
}
interface PrefsServers {
  removeDead: boolean;
  deadRetries: number;
  useScoreSystem: boolean;
  smartIdCheck: boolean;
  updateUrl: string;
}
interface PrefsSecurity {
  canSeeShares: number;
  ipFilterClients: boolean;
  ipFilterServers: boolean;
  ipFilterAutoUpdate: boolean;
  ipFilterUpdateUrl: string;
  ipFilterLevel: number;
  filterLan: boolean;
  useSecIdent: boolean;
  obfuscationSupported: boolean;
  obfuscationRequested: boolean;
  obfuscationRequired: boolean;
}
interface AmulePreferences {
  general: PrefsGeneral;
  connection: PrefsConnection;
  servers: PrefsServers;
  security: PrefsSecurity;
}

const { t } = useI18n();
const { apiFetch } = useApi();
const { addToast } = useToast();
const { amuleRunning } = useServiceGuard();
const route = useRoute();
const router = useRouter();

const VALID_TABS = ["stats", "general", "connection", "servers", "security", "sharing"];
const activeTab = ref(VALID_TABS.includes(route.hash.slice(1)) ? route.hash.slice(1) : "stats");
watch(activeTab, (tab) => router.replace({ hash: `#${tab}` }));
const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const errorMsg = ref("");
const sharingPrefs = reactive({ includeSubdirs: true });
const reloadingShared = ref(false);

async function loadSharingPrefs() {
  try {
    const data = await apiFetch<any>("/api/amule/sharing");
    if (data) sharingPrefs.includeSubdirs = data.includeSubdirs !== false;
  } catch { /* silent */ }
}

async function reloadShared() {
  reloadingShared.value = true;
  try {
    await apiFetch("/api/amule/shared", {
      method: "POST",
      body: { action: "reload" },
    });
    addToast("Archivos compartidos recargados", "success");
  } catch { /* silent */ }
  reloadingShared.value = false;
}

async function saveSharing() {
  saving.value = true;
  try {
    await apiFetch("/api/amule/sharing", {
      method: "POST",
      body: { includeSubdirs: sharingPrefs.includeSubdirs },
    });
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 3000);
  } catch { /* silent */ }
  saving.value = false;
}

const form = reactive<AmulePreferences>({
  general: {
    userNick: "",
    checkNewVersion: false,
  },
  connection: {
    uploadCapacity: 100,
    downloadCapacity: 300,
    maxUploadSpeed: 0,
    maxDownloadSpeed: 0,
    slotAllocation: 2,
    maxFileSources: 300,
    maxConnections: 500,
    autoconnect: false,
    reconnect: false,
    networkED2K: true,
    networkKademlia: false,
  },
  servers: {
    removeDead: true,
    deadRetries: 3,
    useScoreSystem: true,
    smartIdCheck: true,
    updateUrl: "",
  },
  security: {
    canSeeShares: 2,
    ipFilterClients: true,
    ipFilterServers: true,
    ipFilterAutoUpdate: false,
    ipFilterUpdateUrl: "",
    ipFilterLevel: 127,
    filterLan: true,
    useSecIdent: true,
    obfuscationSupported: true,
    obfuscationRequested: false,
    obfuscationRequired: false,
  },
});

const tabPanes = computed<TabPaneDef[]>(() => [
  { name: "stats", label: t("stats.title") },
  { name: "general", label: t("amuleSettings.general") },
  { name: "connection", label: t("amuleSettings.connection") },
  { name: "servers", label: t("amuleSettings.servers") },
  { name: "security", label: t("amuleSettings.security") },
  { name: "sharing", label: t("amuleSettings.sharing", "Compartir") },
]);

async function loadPrefs() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const data = await apiFetch<AmulePreferences>("/api/amule/prefs");
    if (data.general) Object.assign(form.general, data.general);
    if (data.connection) Object.assign(form.connection, data.connection);
    if (data.servers) Object.assign(form.servers, data.servers);
    if (data.security) Object.assign(form.security, data.security);
  } catch (e: any) {
    errorMsg.value = e?.data?.message || e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function save(section: keyof AmulePreferences) {
  saving.value = true;
  saved.value = false;
  errorMsg.value = "";
  if (section === "servers" && form.servers.updateUrl.startsWith("https://")) {
    form.servers.updateUrl = form.servers.updateUrl.replace("https://", "http://");
  }
  try {
    await apiFetch("/api/amule/prefs", {
      method: "POST",
      body: { [section]: form[section] },
    });
    // If a server list URL is set, trigger aMule to fetch it immediately
    if (section === "servers" && form.servers.updateUrl) {
      await apiFetch("/api/amule/servers", {
        method: "POST",
        body: { action: "update-from-url", url: form.servers.updateUrl },
      });
    }
    saved.value = true;
    setTimeout(() => {
      saved.value = false;
    }, 3000);
  } catch (e: any) {
    errorMsg.value = e?.data?.message || e?.message || String(e);
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadPrefs();
  loadSharingPrefs();
});

// ── Stats ──────────────────────────────────────────────
const amuleStats = ref<any>(null);
const connStatus = ref<any>(null);
const statsTree = ref<any[]>([]);
const statsLoading = ref(false);

async function refreshStats() {
  if (!amuleRunning.value) return;
  statsLoading.value = true;
  try {
    const [statsRes, treeRes] = await Promise.all([
      apiFetch<any>("/api/amule/stats"),
      apiFetch<any>("/api/amule/raw/stats-tree").catch(() => null),
    ]);
    amuleStats.value = statsRes?.stats || null;
    connStatus.value = statsRes?.connection_status || null;
    statsTree.value = treeRes?.tree || [];
  } finally {
    statsLoading.value = false;
  }
}

let statsInterval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  refreshStats();
  statsInterval = setInterval(refreshStats, 8000);
});
onUnmounted(() => {
  if (statsInterval) clearInterval(statsInterval);
});
</script>
