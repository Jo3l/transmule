<template>
  <div id="page-amule-categories">
    <div class="level mb-4">
      <div class="level-left">
        <h1 class="title is-4 mb-0">{{ $t("categories.title") }}</h1>
      </div>
      <div class="level-right">
        <SButton variant="primary" size="sm" @click="openCreate">
          <span class="mdi mdi-plus mr-1" /> {{ $t("categories.newCategory") }}
        </SButton>
      </div>
    </div>

    <STable :data="categories" :columns="columns" :loading="loading">
      <template #cell-name="{ row }">
        <span class="has-text-weight-medium">{{ row.name }}</span>
      </template>
      <template #cell-path="{ row }">
        <span class="is-family-monospace is-size-7">{{ row.path || "—" }}</span>
      </template>
      <template #cell-comment="{ row }">{{ row.comment || "—" }}</template>
      <template #cell-actions="{ row }">
        <div class="buttons" v-if="row.id > 0">
          <SButton size="sm" @click="openEdit(row)"
            ><span class="mdi mdi-pencil"
          /></SButton>
          <SButton variant="danger" size="sm" @click="doDelete(row.id)"
            ><span class="mdi mdi-delete"
          /></SButton>
        </div>
        <span v-else class="has-text-grey is-size-7">{{
          $t("categories.default")
        }}</span>
      </template>
      <template #empty>
        <div class="has-text-centered py-5 has-text-grey">
          <span class="mdi mdi-tag-off icon-lg" />
          <p>{{ $t("categories.noCategories") }}</p>
        </div>
      </template>
    </STable>

    <SDialog
      v-model="showModal"
      :title="
        editing ? $t('categories.editTitle') : $t('categories.newCategory')
      "
      width="500px"
    >
      <SFormItem :label="$t('categories.name')"
        ><SInput v-model="form.name"
      /></SFormItem>
      <SFormItem :label="$t('categories.path')"
        ><SInput
          v-model="form.path"
          :placeholder="$t('categories.pathPlaceholder')"
      /></SFormItem>
      <SFormItem :label="$t('categories.comment')"
        ><SInput v-model="form.comment"
      /></SFormItem>
      <SFormItem :label="$t('categories.priority')">
        <SSelect
          v-model="form.priority"
          :options="[
            { label: $t('categories.low'), value: 0 },
            { label: $t('categories.normal'), value: 1 },
            { label: $t('categories.high'), value: 2 },
          ]"
        />
      </SFormItem>
      <template #footer>
        <SButton variant="primary" @click="saveCategory" :loading="saving">{{
          editing ? $t("categories.update") : $t("categories.create")
        }}</SButton>
        <SButton @click="showModal = false">{{
          $t("categories.cancel")
        }}</SButton>
      </template>
    </SDialog>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { amuleRunning } = useServiceGuard();
const { t } = useI18n();
const categories = ref<any[]>([]);
const loading = ref(false);
const showModal = ref(false);
const editing = ref(false);
const saving = ref(false);

const columns = computed(() => [
  {
    prop: "id",
    label: t("categories.columns.id"),
    width: 60,
    align: "right" as const,
  },
  { prop: "name", label: t("categories.columns.name"), sortable: true },
  { key: "path", label: t("categories.columns.path") },
  { key: "comment", label: t("categories.columns.comment") },
  { prop: "priority", label: t("categories.columns.priority"), width: 90 },
  { key: "actions", label: t("categories.columns.actions"), width: 140 },
]);

const form = ref({ id: 0, name: "", path: "", comment: "", priority: 1 });

async function refresh() {
  if (!amuleRunning.value) return;
  loading.value = true;
  try {
    const res = await apiFetch<any>("/api/amule/categories");
    categories.value = res?.categories || [];
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = false;
  form.value = { id: 0, name: "", path: "", comment: "", priority: 1 };
  showModal.value = true;
}
function openEdit(cat: any) {
  editing.value = true;
  form.value = { ...cat };
  showModal.value = true;
}

async function saveCategory() {
  if (!form.value.name) return;
  saving.value = true;
  try {
    const body = editing.value
      ? { action: "update", ...form.value }
      : { action: "create", ...form.value };
    await apiFetch("/api/amule/categories", { method: "POST", body });
    showModal.value = false;
    await refresh();
  } finally {
    saving.value = false;
  }
}

async function doDelete(id: number) {
  loading.value = true;
  try {
    await apiFetch("/api/amule/categories", {
      method: "POST",
      body: { action: "delete", id },
    });
    await refresh();
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
