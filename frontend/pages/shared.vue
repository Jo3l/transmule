<template>
  <div>
    <div class="level mb-4">
      <div class="level-left">
        <h1 class="title is-4 mb-0">{{ $t("shared.title") }}</h1>
      </div>
      <div class="level-right">
        <SButton size="sm" @click="doReload" :loading="loading">
          <span class="mdi mdi-refresh mr-1" /> {{ $t("shared.reload") }}
        </SButton>
      </div>
    </div>

    <div class="box py-3 mb-4" v-if="sharedTotals">
      <div class="totals-bar">
        <div class="total-item">
          <span class="mdi mdi-file-multiple" />
          {{ data?.shared?.count || 0 }} {{ $t("shared.files") }}
        </div>
        <div class="total-item">
          <span class="mdi mdi-harddisk" /> {{ sharedTotals.size_fmt || "0" }}
        </div>
        <div class="total-item">
          <span class="mdi mdi-upload" /> {{ $t("shared.session") }}
          {{ sharedTotals.xfer_fmt || "0" }}
        </div>
        <div class="total-item">
          <span class="mdi mdi-upload-multiple" /> {{ $t("shared.allTime") }}
          {{ sharedTotals.xfer_all_fmt || "0" }}
        </div>
      </div>
    </div>

    <STable
      :data="files"
      :columns="columns"
      :loading="loading"
      @select="(rows: any[]) => (selected = rows)"
    >
      <template #empty>
        <div class="has-text-centered py-5 has-text-grey">
          {{ $t("shared.noFiles") }}
        </div>
      </template>
    </STable>

    <div class="buttons mt-3" v-if="selected.length > 0">
      <p class="has-text-grey is-size-7">
        {{ selected.length }} {{ $t("shared.selected") }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { t } = useI18n();
const data = ref<any>(null);
const files = ref<any[]>([]);
const sharedTotals = ref<any>(null);
const selected = ref<any[]>([]);
const loading = ref(false);

const columns = computed(() => [
  { type: "selection" as const, width: 40 },
  { prop: "name", label: t("shared.columns.name"), sortable: true },
  { prop: "size_fmt", label: t("shared.columns.size"), width: 100 },
  { prop: "xfer_fmt", label: t("shared.columns.transferred"), width: 100 },
  { prop: "xfer_all_fmt", label: t("shared.columns.allTime"), width: 100 },
  {
    prop: "req",
    label: t("shared.columns.requests"),
    width: 80,
    align: "right" as const,
  },
  { prop: "priority", label: t("shared.columns.priority"), width: 90 },
]);

async function refresh() {
  loading.value = true;
  try {
    const res = await apiFetch<any>("/api/amule/shared");
    data.value = res;
    files.value = res?.shared?.files || [];
    sharedTotals.value = res?.shared?.totals || null;
  } finally {
    loading.value = false;
  }
}

async function doReload() {
  loading.value = true;
  try {
    await apiFetch("/api/amule/shared", {
      method: "POST",
      body: { action: "reload" },
    });
    await refresh();
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
