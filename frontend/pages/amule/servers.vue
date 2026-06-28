<template>
  <div id="page-amule-servers">
    <h1 class="title is-4 mb-4">{{ $t("servers.title") }}</h1>

    <STabs
      v-model="activeTab"
      :panes="[
        { name: 'servers', label: $t('servers.title') },
        { name: 'kad', label: $t('kad.title') },
        { name: 'amule', label: $t('log.amuleLog') },
      ]"
    >
      <template #tab-servers
        ><span class="mdi mdi-server mr-1" /> {{ $t("servers.title") }}</template
      >
      <template #tab-amule
        ><span class="mdi mdi-text-box mr-1" /> {{ $t("log.amuleLog") }}</template
      >
      <template #tab-kad
        ><span class="mdi mdi-wan mr-1" /> {{ $t("kad.title") }}</template
      >

      <!-- ── Servers tab ──────────────────────────────────── -->
      <STabPane name="servers" :active="activeTab === 'servers'">
        <div class="box py-2 px-3 mb-3 is-flex is-align-items-center gap-sm">
          <span class="mdi mdi-server"></span>
          <span class="is-size-7">{{ serverConnectedMsg }}</span>
        </div>
        <STable :data="servers" :columns="columns" :loading="serversLoading" :row-class="rowClass">
          <template #cell-users="{ row }">{{ row.users?.toLocaleString() }}</template>
          <template #cell-files="{ row }">{{ row.files?.toLocaleString() }}</template>
          <template #cell-actions="{ row }">
            <div class="flex-end">
              <SButton
                variant="success"
                size="sm"
                :disabled="row.connected || connecting"
                :loading="connecting && !row.connected"
                @click="doAction('connect', row)"
              >
                <span
                  :class="row.connected ? 'mdi mdi-check-circle mr-1' : 'mdi mdi-lan-connect mr-1'"
                />
                {{ row.connected ? $t("servers.connected") : $t("servers.connect") }}
              </SButton>
            </div>
          </template>
          <template #empty>
            <div class="has-text-centered py-5 has-text-grey">
              {{ $t("servers.noServers") }}
            </div>
          </template>
        </STable>

        <div class="flex-end mt-3">
          <SButton
            v-if="isConnectedToServer"
            variant="warning"
            @click="disconnect"
            :loading="connecting"
            :disabled="connecting"
          >
            <span class="mdi mdi-lan-disconnect mr-1" />
            {{ $t("servers.disconnect") }}
          </SButton>
          <SButton v-else variant="success" @click="autoConnect" :loading="connecting" :disabled="connecting">
            <span class="mdi mdi-lan-connect mr-1" />
            {{ $t("servers.connect") }}
          </SButton>
        </div>
      </STabPane>

      <!-- ── KAD tab ─────────────────────────────────────── -->
      <STabPane name="kad" :active="activeTab === 'kad'">
        <SLoading :loading="kadLoading">
          <div class="box mb-4">
            <div class="columns is-vcentered">
              <div class="column">
                <h2 class="subtitle is-5 mb-2">{{ $t("kad.status") }}</h2>
                <p>
                  <STag :variant="kadConnected ? 'success' : 'danger'" size="lg">
                    {{ kadConnected ? $t("kad.connected") : $t("kad.disconnected") }}
                  </STag>
                </p>
                <div class="mt-3" v-if="kadConnected">
                  <div class="kv-list">
                    <div class="kv-row">
                      <span class="kv-label">{{ $t("kad.kadUsers") }}</span>
                      <span class="kv-value">{{ (kadUsers || 0).toLocaleString() }}</span>
                    </div>
                    <div class="kv-row">
                      <span class="kv-label">{{ $t("kad.kadFiles") }}</span>
                      <span class="kv-value">{{ (kadFiles || 0).toLocaleString() }}</span>
                    </div>
                    <div class="kv-row">
                      <span class="kv-label">{{ $t("kad.kadNodes") }}</span>
                      <span class="kv-value">{{ (kadNodes || 0).toLocaleString() }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="box">
            <h2 class="subtitle is-5 mb-3">{{ $t("kad.bootstrap") }}</h2>
            <p class="has-text-grey is-size-7 mb-3">
              {{ $t("kad.bootstrapNote") }}
            </p>
            <form @submit.prevent="doBootstrap">
              <div class="columns">
                <div class="column is-6">
                  <SFormItem :label="$t('kad.ipAddress')">
                    <SInput v-model="bootstrapIp" :placeholder="$t('kad.ipPlaceholder')">
                      <template #prefix><span class="mdi mdi-ip-network" /></template>
                    </SInput>
                  </SFormItem>
                </div>
                <div class="column is-3">
                  <SFormItem :label="$t('kad.port')">
                    <SInput
                      v-model="bootstrapPort"
                      type="number"
                      :placeholder="$t('kad.portPlaceholder')"
                    />
                  </SFormItem>
                </div>
              </div>
              <div class="flex-end">
                <SButton variant="primary" native-type="submit" :loading="kadLoading">
                  <span class="mdi mdi-connection mr-1" />
                  {{ $t("kad.bootstrapButton") }}
                </SButton>
              </div>
            </form>
          </div>
        </SLoading>
      </STabPane>

      <!-- ── aMule Log tab ──────────────────────────────── -->
      <STabPane name="amule" :active="activeTab === 'amule'">
        <LogViewer
          endpoint="/api/amule/log"
          :fetch-condition="amuleRunning"
        />
      </STabPane>

    </STabs>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { amuleRunning } = useServiceGuard();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

// ── Tab state ────────────────────────────────────────
const VALID_TABS = ["servers", "kad", "amule"];
const activeTab = ref(VALID_TABS.includes(route.hash.slice(1)) ? route.hash.slice(1) : "servers");
watch(activeTab, (tab) => router.replace({ hash: `#${tab}` }));

// ── Servers ──────────────────────────────────────────
const servers = ref<any[]>([]);
const serversLoading = ref(false);

function rowClass(row: any) {
  return row.connected ? "is-connected-server" : "";
}

const columns = computed(() => [
  { prop: "name", label: t("servers.columns.name"), sortable: true },
  { prop: "desc", label: t("servers.columns.description") },
  { prop: "addr", label: t("servers.columns.address"), width: 160 },
  {
    prop: "users",
    label: t("servers.columns.users"),
    width: 90,
    sortable: true,
    align: "right" as const,
  },
  {
    prop: "files",
    label: t("servers.columns.files"),
    width: 90,
    sortable: true,
    align: "right" as const,
  },
  { key: "actions", label: "" },
]);

async function refreshServers() {
  if (!amuleRunning.value) return;
  serversLoading.value = true;
  try {
    const res = await apiFetch<any>("/api/amule/servers");
    servers.value = res?.servers?.list || [];
  } finally {
    serversLoading.value = false;
  }
}

async function doAction(action: string, server: any) {
  connecting.value = true;
  try {
    await apiFetch("/api/amule/servers", {
      method: "POST",
      body: { action, ip: server.ip, port: server.port },
    });
    if (action === "connect") {
      // Poll until actually connected
      for (let i = 0; i < 15; i++) {
        await refreshServers();
        if (servers.value.some((s) => s.connected)) return;
        await new Promise((r) => setTimeout(r, 1000));
      }
    } else {
      await refreshServers();
    }
  } finally {
    connecting.value = false;
  }
}

async function disconnect() {
  connecting.value = true;
  try {
    await apiFetch("/api/amule/servers", {
      method: "POST",
      body: { action: "disconnect" },
    });
    await refreshServers();
  } finally {
    connecting.value = false;
  }
}

// ── KAD ──────────────────────────────────────────────
const kadConnected = ref(false);
const kadUsers = ref(0);
const kadFiles = ref(0);
const kadNodes = ref(0);
const bootstrapIp = ref("");
const bootstrapPort = ref("");
const kadLoading = ref(false);

async function refreshKad() {
  if (!amuleRunning.value) return;
  kadLoading.value = true;
  try {
    const res = await apiFetch<any>("/api/amule/kad");
    kadConnected.value = res?.kad_status?.connected ?? false;
    kadUsers.value = res?.kad_status?.kadUsers || 0;
    kadFiles.value = res?.kad_status?.kadFiles || 0;
    kadNodes.value = res?.kad_status?.kadNodes || 0;
  } finally {
    kadLoading.value = false;
  }
}

async function doBootstrap() {
  kadLoading.value = true;
  try {
    await apiFetch("/api/amule/kad", {
      method: "POST",
      body: {
        action: "bootstrap",
        ip: bootstrapIp.value,
        port: Number(bootstrapPort.value) || 4672,
      },
    });
    await refreshKad();
  } finally {
    kadLoading.value = false;
  }
}

// ── Server connection info ──────────────────────────
const isConnectedToServer = computed(() => servers.value.some((s) => s.connected));
const connecting = ref(false);

const serverConnectedMsg = computed(() => {
  const connected = servers.value.find((s) => s.connected);
  if (connected) return `Connected to: ${connected.name} (${connected.addr})`;
  return "Not connected to any server";
});

async function autoConnect() {
  connecting.value = true;
  try {
    // Pick the first server with highest priority and lowest fail count
    const candidates = servers.value
      .filter((s) => s.ip && s.port)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || (a.failedCount ?? 0) - (b.failedCount ?? 0));
    const target = candidates[0];
    if (!target) return;

    await apiFetch("/api/amule/servers", {
      method: "POST",
      body: { action: "connect", ip: target.ip, port: target.port },
    });

    // Poll until connected or timeout
    for (let i = 0; i < 15; i++) {
      await refreshServers();
      if (servers.value.some((s) => s.connected)) return;
      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    connecting.value = false;
  }
}

let serversPoll: ReturnType<typeof setInterval> | null = null;
let kadPoll: ReturnType<typeof setInterval> | null = null;

function startKadPolling() {
  stopKadPolling();
  kadPoll = setInterval(refreshKad, 8000);
}

function stopKadPolling() {
  if (kadPoll) {
    clearInterval(kadPoll);
    kadPoll = null;
  }
}

onMounted(() => {
  refreshServers();
  serversPoll = setInterval(refreshServers, 8000);
  // Start kad polling if kad tab is active
  if (activeTab.value === "kad") {
    refreshKad();
    startKadPolling();
  }
});

// Poll when tab switches
watch(activeTab, (tab) => {
  stopKadPolling();
  if (tab === "kad") {
    refreshKad();
    startKadPolling();
  }
});

onUnmounted(() => {
  if (serversPoll) clearInterval(serversPoll);
  stopKadPolling();
});
</script>

<style scoped>
/* ── Servers ──────────────────────────── */
.is-connected-server {
  background: var(--s-info-bg) !important;
}
</style>
