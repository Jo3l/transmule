<template>
  <div>
    <h1 class="title is-4 mb-4">{{ $t("servers.title") }}</h1>

    <STable :data="servers" :columns="columns" :loading="loading">
      <template #cell-users="{ row }">{{
        row.users?.toLocaleString()
      }}</template>
      <template #cell-files="{ row }">{{
        row.files?.toLocaleString()
      }}</template>
      <template #cell-actions="{ row }">
        <SButton variant="success" size="sm" @click="doAction('connect', row)">
          <span class="mdi mdi-lan-connect mr-1" /> {{ $t("servers.connect") }}
        </SButton>
      </template>
      <template #empty>
        <div class="has-text-centered py-5 has-text-grey">
          {{ $t("servers.noServers") }}
        </div>
      </template>
    </STable>

    <div class="buttons mt-3">
      <SButton variant="warning" size="sm" @click="disconnect">
        <span class="mdi mdi-lan-disconnect mr-1" />
        {{ $t("servers.disconnect") }}
      </SButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { t } = useI18n();
const servers = ref<any[]>([]);
const loading = ref(false);

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
  { key: "actions", label: t("servers.columns.actions"), width: 120 },
]);

async function refresh() {
  loading.value = true;
  try {
    const res = await apiFetch<any>("/api/amule/servers");
    servers.value = res?.servers?.list || [];
  } finally {
    loading.value = false;
  }
}

async function doAction(action: string, server: any) {
  loading.value = true;
  try {
    await apiFetch("/api/amule/servers", {
      method: "POST",
      body: { action, ip: server.ip, port: server.port },
    });
    await refresh();
  } finally {
    loading.value = false;
  }
}

async function disconnect() {
  loading.value = true;
  try {
    await apiFetch("/api/amule/servers", {
      method: "POST",
      body: { action: "disconnect" },
    });
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
