<template>
  <SLoading id="page-settings" :loading="loading">
    <h1 class="title is-4 mb-4">{{ $t("settings.title") }}</h1>

    <STabs v-model="activeTab" variant="card" :panes="tabPanes">
      <!-- Theme selector -->
      <STabPane
        name="theme"
        :label="$t('settings.theme')"
        :active="activeTab === 'theme'"
      >
        <div class="box">
          <p class="has-text-grey is-size-7 mb-4">
            {{ $t("settings.themeDescription") }}
          </p>
          <SFormItem :label="$t('settings.theme')">
            <SSelect v-model="selectedTheme">
              <option v-for="th in themes" :key="th.key" :value="th.key">
                {{ th.label }}
              </option>
            </SSelect>
          </SFormItem>

          <SButton variant="primary" :loading="savingTheme" @click="applyTheme">
            <span class="mdi mdi-content-save mr-1" />
            {{ $t("settings.save") }}
          </SButton>
        </div>
      </STabPane>

      <!-- Language selector -->
      <STabPane
        name="language"
        :label="$t('settings.language')"
        :active="activeTab === 'language'"
      >
        <div class="box">
          <p class="has-text-grey is-size-7 mb-4">
            {{ $t("settings.languageDescription") }}
          </p>
          <SFormItem :label="$t('settings.language')">
            <SSelect v-model="selectedLocale">
              <option
                v-for="lang in availableLocales"
                :key="lang.code"
                :value="lang.code"
              >
                {{ lang.name }}
              </option>
            </SSelect>
          </SFormItem>

          <SButton
            variant="primary"
            :loading="savingLocale"
            @click="applyLocale"
          >
            <span class="mdi mdi-content-save mr-1" />
            {{ $t("settings.save") }}
          </SButton>
        </div>
      </STabPane>

      <!-- Account: change own password -->
      <STabPane
        name="account"
        :label="$t('settings.account')"
        :active="activeTab === 'account'"
      >
        <div class="box">
          <h3 class="subtitle is-6 mb-4">
            {{ $t("settings.changePassword") }}
          </h3>
          <SFormItem :label="$t('settings.currentPassword')">
            <SInput
              v-model="selfPwCurrent"
              type="password"
              class="mw-320"
            />
          </SFormItem>
          <SFormItem :label="$t('settings.newPassword')">
            <SInput
              v-model="selfPwNew"
              type="password"
              class="mw-320"
            />
          </SFormItem>
          <SFormItem :label="$t('settings.confirmPassword')">
            <SInput
              v-model="selfPwConfirm"
              type="password"
              class="mw-320"
            />
          </SFormItem>
          <p v-if="selfPwError" class="has-text-danger is-size-7 mb-3">
            {{ selfPwError }}
          </p>
          <SButton
            variant="primary"
            :loading="savingSelfPw"
            @click="submitSelfPw"
          >
            <span class="mdi mdi-content-save mr-1" />
            {{ $t("settings.save") }}
          </SButton>
        </div>
      </STabPane>

      <!-- Admin: Integrations -->
      <STabPane
        v-if="isAdmin"
        name="integrations"
        :label="$t('settings.integrations')"
        :active="activeTab === 'integrations'"
      >
        <div class="box">
          <h3 class="subtitle is-6 mb-2">{{ $t('settings.tvdbTitle') }}</h3>
          <p class="is-size-7 mb-3 text-muted">
            {{ $t('settings.tvdbDescription') }}
            <a href="https://thetvdb.com/api-information" target="_blank" rel="noopener">
              thetvdb.com/api-information
            </a>
          </p>

          <SAlert v-if="tvdbKeySet" variant="success" class="mb-3" size="sm">
            {{ $t('settings.tvdbKeySet') }}
          </SAlert>
          <SAlert v-else variant="warning" class="mb-3" size="sm">
            {{ $t('settings.tvdbKeyNotSet') }}
          </SAlert>

          <SFormItem :label="$t('settings.tvdbApiKey')">
            <SInput
              v-model="tvdbKeyInput"
              :placeholder="$t('settings.tvdbKeyPlaceholder')"
              class="mw-420"
            />
          </SFormItem>

          <div class="stt-btn-row">
            <SButton variant="primary" :loading="savingTvdb" @click="saveTvdbKey">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t('settings.save') }}
            </SButton>
            <SButton v-if="tvdbKeySet" variant="danger" :loading="savingTvdb" @click="clearTvdbKey">
              <span class="mdi mdi-delete mr-1" />
              {{ $t('settings.tvdbKeyClear') }}
            </SButton>
          </div>
        </div>
      </STabPane>

      <!-- Admin: Users -->
      <STabPane
        v-if="isAdmin"
        name="users"
        :label="$t('settings.users')"
        :active="activeTab === 'users'"
      >
        <div class="box">
          <STable :data="users" :columns="userCols" stripe>
            <template #cell-role="{ row }">
              <STag :variant="row.is_admin ? 'primary' : 'info'" size="sm">{{
                row.is_admin ? $t("settings.adminTag") : $t("settings.userTag")
              }}</STag>
            </template>
            <template #cell-actions="{ row }">
              <div class="stt-actions">
                <SButton
                  variant="warning"
                  size="sm"
                  :title="$t('settings.changePassword')"
                  @click="openChangePw(row)"
                >
                  <span class="mdi mdi-key" />
                </SButton>
                <SButton
                  v-if="row.id !== currentUserId"
                  variant="danger"
                  size="sm"
                  @click="removeUser(row.id)"
                >
                  <span class="mdi mdi-delete" />
                </SButton>
              </div>
            </template>
          </STable>

          <!-- Change password dialog -->
          <SDialog
            v-model="pwDialog"
            :title="$t('settings.changePwFor', { username: pwUsername })"
            width="400px"
          >
            <SFormItem :label="$t('settings.newPassword')">
              <SInput
                v-model="pwNew"
                type="password"
                size="sm"
                class="mw-280"
              />
            </SFormItem>
            <SFormItem :label="$t('settings.confirmPassword')">
              <SInput
                v-model="pwConfirm"
                type="password"
                size="sm"
                class="mw-280"
              />
            </SFormItem>
            <p v-if="pwMismatch" class="has-text-danger is-size-7 mt-1">
              {{ $t("settings.passwordsDoNotMatch") }}
            </p>
            <template #footer>
              <SButton
                variant="primary"
                :loading="savingPw"
                @click="submitChangePw"
              >
                <span class="mdi mdi-content-save mr-1" />
                {{ $t("settings.save") }}
              </SButton>
            </template>
          </SDialog>

          <SDivider />
          <h3 class="subtitle is-6">{{ $t("settings.addUser") }}</h3>
          <div class="columns">
            <div class="column is-4">
              <SFormItem :label="$t('settings.username')"
                ><SInput v-model="newUsername" size="sm"
              /></SFormItem>
            </div>
            <div class="column is-4">
              <SFormItem :label="$t('settings.password')"
                ><SInput v-model="newPassword" type="password" size="sm"
              /></SFormItem>
            </div>
            <div class="column is-2">
              <SFormItem :label="$t('settings.admin')"
                ><SCheckbox v-model="newIsAdmin"
              /></SFormItem>
            </div>
            <div class="column is-2 is-flex is-align-items-flex-end">
              <SButton variant="success" size="sm" @click="addUser">
                <span class="mdi mdi-account-plus mr-1" />
                {{ $t("settings.add") }}
              </SButton>
            </div>
          </div>
        </div>
      </STabPane>
    </STabs>
  </SLoading>
</template>

<script setup lang="ts">
import type { STableColumn } from "~/components/s/STable.vue";
import type { TabPaneDef } from "~/components/s/STabs.vue";

const { t, locale, locales } = useI18n();
const { apiFetch } = useApi();
const auth = useAuth();
const { currentTheme, setTheme, saveToServer, THEME_META } = useTheme();

const activeTab = ref("theme");
const loading = ref(false);
const savingTheme = ref(false);
const savingLocale = ref(false);

const isAdmin = computed(() => auth.user.value?.isAdmin === true);
const currentUserId = computed(() => auth.user.value?.id);

// Theme data
const themes = computed(() =>
  Object.entries(THEME_META).map(([key, meta]) => ({
    key,
    label: t(`themes.${key}.name`),
    icon: meta.icon.replace("mdi-", ""),
    desc: t(`themes.${key}.description`),
  })),
);
const selectedTheme = ref(currentTheme.value);

async function applyTheme() {
  savingTheme.value = true;
  try {
    setTheme(selectedTheme.value as any);
    await saveToServer(selectedTheme.value as any);
  } finally {
    savingTheme.value = false;
  }
}

// Language
const availableLocales = computed(() =>
  (locales.value as Array<{ code: string; name: string }>).map((l) => ({
    code: l.code,
    name: l.name,
  })),
);
const selectedLocale = ref(locale.value);

// Access the nuxt-i18n setLocale which handles lazy-loading + cookie
const { $i18n } = useNuxtApp();

async function applyLocale() {
  savingLocale.value = true;
  try {
    await ($i18n as any).setLocale(selectedLocale.value);
  } finally {
    savingLocale.value = false;
  }
}

// Tab panes (dynamic based on admin)
const tabPanes = computed<TabPaneDef[]>(() => {
  const p: TabPaneDef[] = [{ name: "theme", label: t("settings.theme") }];
  p.push({ name: "language", label: t("settings.language") });
  p.push({ name: "account", label: t("settings.account") });
  if (isAdmin.value) {
    p.push({ name: "integrations", label: t("settings.integrations") });
    p.push({ name: "users", label: t("settings.users") });
  }
  return p;
});

// User table columns
const userCols = computed<STableColumn[]>(() => [
  { prop: "username", label: t("settings.columns.username") },
  { key: "role", label: t("settings.columns.role"), width: 100 },
  { prop: "created_at", label: t("settings.columns.created"), width: 160 },
  { key: "actions", label: "", width: 120 },
]);

// Account: change own password
const selfPwCurrent = ref("");
const selfPwNew = ref("");
const selfPwConfirm = ref("");
const savingSelfPw = ref(false);
const selfPwError = ref("");

async function submitSelfPw() {
  selfPwError.value = "";
  if (!selfPwCurrent.value) {
    selfPwError.value = t("settings.currentPasswordRequired");
    return;
  }
  if (selfPwNew.value.length < 4) {
    selfPwError.value = t("settings.passwordTooShort");
    return;
  }
  if (selfPwNew.value !== selfPwConfirm.value) {
    selfPwError.value = t("settings.passwordsDoNotMatch");
    return;
  }
  savingSelfPw.value = true;
  try {
    await apiFetch("/api/users/password", {
      method: "PATCH",
      body: {
        currentPassword: selfPwCurrent.value,
        newPassword: selfPwNew.value,
      },
    });
    selfPwCurrent.value = "";
    selfPwNew.value = "";
    selfPwConfirm.value = "";
  } catch (err: any) {
    selfPwError.value =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      t("settings.saveFailed");
  } finally {
    savingSelfPw.value = false;
  }
}

// Admin: Users
const users = ref<any[]>([]);
const newUsername = ref("");
const newPassword = ref("");
const newIsAdmin = ref(false);

// Change-password dialog
const pwDialog = ref(false);
const pwUserId = ref<number | null>(null);
const pwUsername = ref("");
const pwNew = ref("");
const pwConfirm = ref("");
const savingPw = ref(false);
const pwMismatch = ref(false);

function openChangePw(row: any) {
  pwUserId.value = row.id;
  pwUsername.value = row.username;
  pwNew.value = "";
  pwConfirm.value = "";
  pwMismatch.value = false;
  pwDialog.value = true;
}

async function submitChangePw() {
  pwMismatch.value = pwNew.value !== pwConfirm.value;
  if (pwMismatch.value || !pwNew.value) return;
  savingPw.value = true;
  try {
    await apiFetch(`/api/admin/users/${pwUserId.value}`, {
      method: "PATCH",
      body: { password: pwNew.value },
    });
    pwDialog.value = false;
  } finally {
    savingPw.value = false;
  }
}

async function loadUsers() {
  if (!isAdmin.value) return;
  try {
    const res = await apiFetch<any>("/api/admin/users");
    users.value = res?.users || [];
  } catch {
    /* handled */
  }
}

async function addUser() {
  if (!newUsername.value || !newPassword.value) return;
  try {
    await apiFetch("/api/admin/users", {
      method: "POST",
      body: {
        username: newUsername.value,
        password: newPassword.value,
        isAdmin: newIsAdmin.value,
      },
    });
    newUsername.value = "";
    newPassword.value = "";
    newIsAdmin.value = false;
    await loadUsers();
  } catch {
    /* handled */
  }
}

async function removeUser(id: number) {
  try {
    await apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
    await loadUsers();
  } catch {
    /* handled */
  }
}

// Integrations: TVDB
const tvdbKeySet = ref(false);
const tvdbKeyInput = ref("");
const savingTvdb = ref(false);

async function loadIntegrations() {
  if (!isAdmin.value) return;
  try {
    const res = await apiFetch<{ tvdbApiKeySet: boolean }>("/api/admin/integrations");
    tvdbKeySet.value = res?.tvdbApiKeySet ?? false;
  } catch { /* handled */ }
}

async function saveTvdbKey() {
  savingTvdb.value = true;
  try {
    await apiFetch("/api/admin/integrations", {
      method: "POST",
      body: { tvdbApiKey: tvdbKeyInput.value },
    });
    tvdbKeyInput.value = "";
    await loadIntegrations();
  } finally {
    savingTvdb.value = false;
  }
}

async function clearTvdbKey() {
  savingTvdb.value = true;
  try {
    await apiFetch("/api/admin/integrations", {
      method: "POST",
      body: { tvdbApiKey: "" },
    });
    tvdbKeyInput.value = "";
    await loadIntegrations();
  } finally {
    savingTvdb.value = false;
  }
}

onMounted(async () => {
  loading.value = true;
  await Promise.all([loadUsers(), loadIntegrations()]);
  loading.value = false;
});
</script>

<style scoped>
.stt-btn-row { display: flex; gap: 8px; margin-top: 4px; }
.stt-actions { display: flex; gap: 6px; }
</style>
