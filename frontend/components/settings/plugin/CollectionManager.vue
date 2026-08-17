<template>
  <div>
    <div class="pcm-head mb-2">
      <div>
        <h6 class="title is-6 mb-1">{{ descriptor.title ?? plugin.name }}</h6>
        <p v-if="descriptor.description" class="has-text-grey is-size-7 mb-0">
          {{ descriptor.description }}
        </p>
      </div>
      <div class="pcm-toolbar">
        <SButton
          v-for="action in visibleToolbar"
          :key="action.key"
          variant="default"
          size="sm"
          :icon="action.icon"
          :loading="toolbarLoading[action.key!]"
          @click="runToolbar(action)"
        >
          {{ action.label }}
        </SButton>
      </div>
    </div>

    <SInput
      v-model="filter"
      size="sm"
      class="mb-3"
      :placeholder="$t('settings.pluginCollection.filter')"
    >
      <template #prefix><span class="mdi mdi-magnify" /></template>
    </SInput>

    <SLoading v-if="loading" />

    <div v-else-if="filtered.length === 0" class="box has-text-centered">
      <p>
        <span class="mdi mdi-magnify-close is-size-2 has-text-grey-light" />
      </p>
      <p class="has-text-grey is-size-7">
        {{ $t("settings.pluginCollection.empty") }}
      </p>
    </div>

    <div v-else class="pcm-list">
      <div
        v-for="item in filtered"
        :key="item[list.idField]"
        class="provider-item"
        :class="{ 'is-disabled': !isEnabled(item) }"
      >
        <span class="provider-icon mdi" :class="plugin.icon || 'mdi-puzzle'" />
        <div class="provider-details">
          <div class="provider-name">
            {{ item[list.labelField] }}
            <STag
              v-for="mf in list.metaFields ?? []"
              :key="mf"
              size="sm"
              variant="default"
              class="ml-1"
            >
              {{ item[mf] }}
            </STag>
          </div>
          <div v-if="item.description" class="provider-desc">
            {{ item.description }}
          </div>
        </div>
        <SSwitch
          :model-value="isEnabled(item)"
          @update:model-value="(v: boolean) => toggle(item, v)"
        />
        <SButton size="sm" variant="default" @click="configure(item)">
          {{ list.addLabel ?? $t("settings.pluginCollection.configure") }}
        </SButton>
      </div>
    </div>

    <!-- Config modal -->
    <SDialog
      :model-value="modalOpen"
      :title="String(selectedItem?.[list.labelField] ?? '')"
      width="640px"
      @update:model-value="(v: boolean) => (modalOpen = v)"
    >
      <SLoading v-if="modalLoading" />
      <template v-else>
        <SAlert v-if="testResult" variant="info" size="sm" class="mb-3">
          {{ testResult }}
        </SAlert>
        <DynamicForm v-model="form" :fields="fields" />
      </template>
      <template #footer>
        <SButton
          v-if="selectedInstance"
          variant="default"
          :loading="testing"
          @click="test"
        >
          {{ $t("settings.pluginCollection.test") }}
        </SButton>
        <SButton variant="primary" :loading="saving" @click="save">
          {{ $t("settings.pluginCollection.save") }}
        </SButton>
      </template>
    </SDialog>
  </div>
</template>

<script setup lang="ts">
import DynamicForm from "./DynamicForm.vue";
import type {
  PluginFieldSchema,
  PluginSettingsAction,
  PluginSettingsDescriptor,
} from "~/composables/usePluginSettings";
import { usePluginApi } from "~/composables/usePluginSettings";
import { useProviders } from "~/composables/useProviders";

const props = defineProps<{
  plugin: {
    id: string;
    name: string;
    icon?: string;
    settings: PluginSettingsDescriptor;
  };
}>();

const { t } = useI18n();
const { addToast } = useToast();
const { fetch: pluginFetch } = usePluginApi(props.plugin.id);
const { invalidateSearchSources } = useProviders();

const descriptor = computed(() => props.plugin.settings);
const list = computed(() => descriptor.value.list);

const loading = ref(true);
const filter = ref("");
const items = ref<Record<string, any>[]>([]);
const configured = ref<Record<string, any>>({});
const toolbarLoading = ref<Record<string, boolean>>({});

const visibleToolbar = computed(() =>
  (descriptor.value.toolbar ?? []).filter(
    (a) => !a.hideWhenEmpty || items.value.length > 0,
  ),
);

const modalOpen = ref(false);
const modalLoading = ref(false);
const saving = ref(false);
const testing = ref(false);
const testResult = ref("");
const fields = ref<PluginFieldSchema[]>([]);
const form = ref<Record<string, unknown>>({});
const selectedItem = ref<Record<string, any> | null>(null);
const selectedInstance = ref<Record<string, any> | null>(null);

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return items.value;
  return items.value.filter(
    (it) =>
      String(it[list.value.labelField] ?? "").toLowerCase().includes(q) ||
      String(it.description ?? "").toLowerCase().includes(q),
  );
});

function isEnabled(item: Record<string, any>): boolean {
  return configured.value[item[list.value.idField]]?.enabled === true;
}

async function reload() {
  loading.value = true;
  try {
    const res = await pluginFetch(list.value);
    items.value = (res[list.value.itemsKey] as Record<string, any>[]) ?? [];
    configured.value =
      (res[list.value.configuredKey ?? ""] as Record<string, any>) ?? {};
  } catch {
    /* silent */
  } finally {
    loading.value = false;
  }
  invalidateSearchSources();
}

async function runToolbar(action: PluginSettingsAction) {
  const key = action.key ?? action.path;
  toolbarLoading.value[key] = true;
  try {
    const res = await pluginFetch(action);
    if (typeof res?.synced === "number") {
      addToast(
        t("settings.pluginCollection.refreshed", { count: res.synced }),
        "success",
      );
    } else if (typeof res?.added === "number") {
      addToast(
        t("settings.pluginCollection.enabled", { count: res.added }),
        "success",
      );
    }
    await reload();
  } catch (err: any) {
    addToast(
      err?.data?.statusMessage || err?.message || t("settings.saveFailed"),
      "error",
    );
  } finally {
    toolbarLoading.value[key] = false;
  }
}

function configure(item: Record<string, any>) {
  selectedItem.value = item;
  selectedInstance.value =
    configured.value[item[list.value.idField]] ?? null;
  testResult.value = "";
  modalOpen.value = true;
  void loadSchema(item);
}

async function loadSchema(item: Record<string, any>) {
  modalLoading.value = true;
  try {
    const detail = await pluginFetch(descriptor.value.item.schema, {
      id: String(item[list.value.idField]),
    });
    fields.value = (detail.configSchema as PluginFieldSchema[]) ?? [];
    const existing =
      (selectedInstance.value?.config as Record<string, unknown>) ?? {};
    const init: Record<string, unknown> = {};
    for (const f of fields.value) {
      init[f.name] = existing[f.name] ?? f.default ?? (f.type === "checkbox" ? false : "");
    }
    form.value = init;
  } catch (err: any) {
    addToast(
      err?.data?.statusMessage || err?.message || t("settings.saveFailed"),
      "error",
    );
  } finally {
    modalLoading.value = false;
  }
}

async function toggle(item: Record<string, any>, enabled: boolean) {
  const id = item[list.value.idField];
  const inst = configured.value[id];
  try {
    if (enabled && !inst) {
      configure(item);
      return;
    }
    if (inst) {
      await pluginFetch(
        descriptor.value.item.update,
        { id: inst.id },
        { enabled },
      );
      configured.value = { ...configured.value, [id]: { ...inst, enabled } };
      invalidateSearchSources();
    }
  } catch (err: any) {
    addToast(
      err?.data?.statusMessage || err?.message || t("settings.saveFailed"),
      "error",
    );
  }
}

async function save() {
  const item = selectedItem.value;
  if (!item) return;
  const inst = selectedInstance.value;
  saving.value = true;
  try {
    if (inst) {
      await pluginFetch(
        descriptor.value.item.update,
        { id: inst.id },
        { name: String(item[list.value.labelField]), config: form.value },
      );
    } else {
      await pluginFetch(descriptor.value.item.create, {}, {
        tracker_id: String(item[list.value.idField]),
        name: String(item[list.value.labelField]),
        config: form.value,
      });
    }
    addToast(t("settings.pluginCollection.saved"), "success");
    modalOpen.value = false;
    await reload();
  } catch (err: any) {
    addToast(
      err?.data?.statusMessage || err?.message || t("settings.saveFailed"),
      "error",
    );
  } finally {
    saving.value = false;
  }
}

async function test() {
  const inst = selectedInstance.value;
  if (!inst) return;
  testing.value = true;
  testResult.value = "";
  try {
    const res = await pluginFetch(descriptor.value.item.test!, { id: inst.id }, {});
    if (res?.ok) {
      testResult.value = t("settings.pluginCollection.testOk", {
        count: res.count,
      });
    } else {
      testResult.value = `${t("settings.pluginCollection.testFailed")}: ${res?.error ?? ""}`;
    }
  } catch (err: any) {
    testResult.value = `${t("settings.pluginCollection.testFailed")}: ${err?.message ?? ""}`;
  } finally {
    testing.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.pcm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.pcm-toolbar {
  display: flex;
  gap: 0.5rem;
}
.pcm-list {
  max-height: 55vh;
  overflow-y: auto;
  border: 1px solid var(--s-border, #2a2a4a);
  border-radius: 8px;
  padding: 4px;
}
.provider-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  transition: background 0.15s;
}
.provider-item:hover {
  background: var(--s-table-hover-bg, rgba(128, 128, 128, 0.05));
}
.provider-item.is-disabled {
  opacity: 0.45;
}
.provider-icon {
  font-size: 1.3rem;
  width: 1.6rem;
  text-align: center;
  flex-shrink: 0;
}
.provider-details {
  flex: 1;
  min-width: 0;
}
.provider-name {
  font-size: 0.85rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.provider-desc {
  font-size: 0.72rem;
  color: var(--s-text-muted);
  margin-top: 0.1rem;
}
</style>
