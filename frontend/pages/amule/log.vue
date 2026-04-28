<template>
  <SLoading id="page-amule-log" :loading="loading">
    <h1 class="title is-4 mb-4">{{ $t("log.title") }}</h1>

    <STabs
      v-model="activeTab"
      :panes="[
        { name: 'amule', label: $t('log.amuleLog') },
        { name: 'server', label: $t('log.serverLog') },
      ]"
    >
      <template #tab-amule
        ><span class="mdi mdi-text-box mr-1" /> {{ $t("log.amuleLog") }}</template
      >
      <template #tab-server
        ><span class="mdi mdi-server mr-1" /> {{ $t("log.serverLog") }}</template
      >

      <STabPane name="amule" :active="activeTab === 'amule'">
        <div class="log-content">
          <pre>{{ amuleLog || $t("log.noData") }}</pre>
        </div>
        <div class="flex-end mt-3">
          <SButton variant="primary" size="sm" @click="refresh" :loading="loading">
            <span class="mdi mdi-refresh mr-1" /> {{ $t("log.refresh") }}
          </SButton>
        </div>
      </STabPane>

      <STabPane name="server" :active="activeTab === 'server'">
        <div class="log-content">
          <pre>{{ serverLog || $t("log.noData") }}</pre>
        </div>
        <div class="flex-end mt-3">
          <SButton variant="primary" size="sm" @click="refresh" :loading="loading">
            <span class="mdi mdi-refresh mr-1" /> {{ $t("log.refresh") }}
          </SButton>
        </div>
      </STabPane>
    </STabs>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { amuleRunning } = useServiceGuard();
const route = useRoute();
const router = useRouter();

const VALID_TABS = ["amule", "server"];
const activeTab = ref(VALID_TABS.includes(route.hash.slice(1)) ? route.hash.slice(1) : "amule");
watch(activeTab, (tab) => router.replace({ hash: `#${tab}` }));
const amuleLog = ref("");
const serverLog = ref("");
const loading = ref(false);

async function refresh() {
  if (!amuleRunning.value) return;
  loading.value = true;
  try {
    const res = await apiFetch<any>("/api/amule/log");
    amuleLog.value = res?.amule_log?.content || "";
    serverLog.value = res?.server_log?.content || "";
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<style scoped>
.log-content {
  background: var(--s-bg-surface-alt);
  color: var(--s-success);
  border-radius: var(--s-radius);
  padding: 1rem;
  max-height: 500px;
  overflow: auto;
  font-family: "Fira Code", "Cascadia Code", monospace;
  font-size: 0.8rem;
  line-height: 1.5;
  border: 1px solid var(--s-border);
}
.log-content pre {
  background: transparent;
  color: inherit;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
