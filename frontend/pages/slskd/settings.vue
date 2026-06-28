<template>
  <SLoading id="page-slskd-settings" :loading="loading">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-cog-outline mr-1" />
      {{ $t("nav.slskdSettings") }}
    </h1>

    <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>
    <SAlert v-if="saved" variant="success" class="mb-4">{{ $t("slskd.settingsSaved") }}</SAlert>

    <STabs
      v-model="activeTab"
      :panes="[
        { name: 'credentials', label: $t('slskd.credentials') },
        { name: 'log', label: $t('slskd.log') },
      ]"
    >
      <template #tab-credentials>
        <span class="mdi mdi-account-key mr-1" /> {{ $t("slskd.credentials") }}
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

          <p class="is-size-7 has-text-grey mb-3" style="max-width: 400px; line-height: 1.5;">
            <span class="mdi mdi-information-outline mr-1" />
            {{ $t("slskd.credentialsGuide") }}
          </p>

          <div class="flex-end">
            <SButton variant="primary" :loading="saving" :disabled="!hasChanges" @click="save">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t("common.save") }}
            </SButton>
          </div>
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
}

// ── Tab state ────────────────────────────────────────
const VALID_TABS = ["credentials", "log"];
const activeTab = ref(VALID_TABS.includes(route.hash.slice(1)) ? route.hash.slice(1) : "credentials");
watch(activeTab, (tab) => router.replace({ hash: `#${tab}` }));

// ── Credentials ──────────────────────────────────────
const form = ref({ username: "", password: "" });
const original = ref({ username: "", hasPassword: false });
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
    form.value.password = "";
    saved.value = true;
    showToast(t("slskd.settingsSaved"), "success", 2000);
  } catch (err: any) {
    errorMsg.value = err?.message || t("slskd.actionError");
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  loading.value = true;
  errorMsg.value = "";
  await loadSettings();
  loading.value = false;
});
</script>

<style scoped>
</style>
