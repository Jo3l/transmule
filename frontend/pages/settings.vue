<template>
  <SLoading :loading="loading">
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
            <select v-model="selectedTheme" class="s-select">
              <option v-for="th in themes" :key="th.key" :value="th.key">
                {{ th.label }}
              </option>
            </select>
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
            <select v-model="selectedLocale" class="s-select">
              <option
                v-for="lang in availableLocales"
                :key="lang.code"
                :value="lang.code"
              >
                {{ lang.name }}
              </option>
            </select>
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
        <div class="box" style="max-width: 480px">
          <h3 class="subtitle is-6 mb-4">
            {{ $t("settings.changePassword") }}
          </h3>
          <SFormItem :label="$t('settings.currentPassword')">
            <SInput
              v-model="selfPwCurrent"
              type="password"
              style="max-width: 320px"
            />
          </SFormItem>
          <SFormItem :label="$t('settings.newPassword')">
            <SInput
              v-model="selfPwNew"
              type="password"
              style="max-width: 320px"
            />
          </SFormItem>
          <SFormItem :label="$t('settings.confirmPassword')">
            <SInput
              v-model="selfPwConfirm"
              type="password"
              style="max-width: 320px"
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

      <!-- Folders (admin only) -->
      <STabPane
        v-if="isAdmin"
        name="folders"
        :label="$t('settings.folders')"
        :active="activeTab === 'folders'"
      >
        <div class="box">
          <p class="has-text-grey is-size-7 mb-4">
            {{ $t("settings.foldersDescription") }}
          </p>

          <SFormItem :label="$t('settings.downloadDir')">
            <SInput
              v-model="folders.downloadDir"
              :placeholder="$t('settings.downloadDirPlaceholder')"
              style="max-width: 500px"
            />
            <p class="is-size-7 has-text-grey mt-1">
              {{ $t("settings.downloadDirHelp") }}
            </p>
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('settings.tempDir')">
            <SInput
              v-model="folders.incompleteDir"
              :placeholder="$t('settings.tempDirPlaceholder')"
              style="max-width: 500px"
            />
            <p class="is-size-7 has-text-grey mt-1">
              {{ $t("settings.tempDirHelp") }}
            </p>
          </SFormItem>

          <SDivider />

          <SButton
            variant="primary"
            :loading="savingFolders"
            @click="saveFolders"
          >
            <span class="mdi mdi-content-save mr-1" />
            {{ $t("settings.saveFolders") }}
          </SButton>
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
              <div class="is-flex" style="gap: 6px">
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
                style="max-width: 280px"
              />
            </SFormItem>
            <SFormItem :label="$t('settings.confirmPassword')">
              <SInput
                v-model="pwConfirm"
                type="password"
                size="sm"
                style="max-width: 280px"
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
const savingFolders = ref(false);
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
    p.push({ name: "folders", label: t("settings.folders") });
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

// Folders
const folders = reactive({
  downloadDir: "",
  incompleteDir: "",
});

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

async function loadFolders() {
  if (!isAdmin.value) return;
  try {
    const res = await apiFetch<any>("/api/admin/folders");
    folders.downloadDir = res?.downloadDir || "";
    folders.incompleteDir = res?.incompleteDir || "";
  } catch {
    /* handled */
  }
}

async function saveFolders() {
  savingFolders.value = true;
  try {
    await apiFetch("/api/admin/folders", {
      method: "POST",
      body: {
        downloadDir: folders.downloadDir,
        incompleteDirEnabled: true,
        incompleteDir: folders.incompleteDir,
      },
    });
  } finally {
    savingFolders.value = false;
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

onMounted(async () => {
  loading.value = true;
  await Promise.all([loadFolders(), loadUsers()]);
  loading.value = false;
});
</script>

<style scoped>
.s-select {
  display: block;
  width: 100%;
  max-width: 340px;
  padding: 0.5rem 0.75rem;
  font-size: 0.95rem;
  color: var(--s-text);
  background: var(--s-bg);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  appearance: auto;
  cursor: pointer;
  transition: border-color 0.2s;
}
.s-select:focus {
  outline: none;
  border-color: var(--s-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--s-accent) 25%, transparent);
}
</style>
