<template>
  <div class="box">
    <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.users") }}</h6>
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
        <SInput v-model="pwNew" type="password" size="sm" class="mw-280" />
      </SFormItem>
      <SFormItem :label="$t('settings.confirmPassword')">
        <SInput v-model="pwConfirm" type="password" size="sm" class="mw-280" />
      </SFormItem>
      <p v-if="pwMismatch" class="has-text-danger is-size-7 mt-1">
        {{ $t("settings.passwordsDoNotMatch") }}
      </p>
      <template #footer>
        <SButton variant="primary" :loading="savingPw" @click="submitChangePw">
          <span class="mdi mdi-content-save mr-1" />
          {{ $t("settings.save") }}
        </SButton>
      </template>
    </SDialog>

    <SDivider />
    <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.addUser") }}</h6>
    <div class="add-user-form">
      <div class="add-user-fields">
        <SFormItem :label="$t('settings.username')"
          ><SInput v-model="newUsername" size="sm"
        /></SFormItem>
        <SFormItem :label="$t('settings.password')"
          ><SInput v-model="newPassword" type="password" size="sm"
        /></SFormItem>
        <SFormItem :label="$t('settings.admin')"
          ><SCheckbox v-model="newIsAdmin"
        /></SFormItem>
      </div>
      <div class="add-user-action">
        <SButton variant="success" size="sm" @click="addUser">
          <span class="mdi mdi-account-plus mr-1" />
          {{ $t("settings.add") }}
        </SButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { STableColumn } from "~/components/s/STable.vue";

const { t } = useI18n();
const { apiFetch } = useApi();
const auth = useAuth();

const isAdmin = computed(() => auth.user.value?.isAdmin === true);
const currentUserId = computed(() => auth.user.value?.id);

const userCols = computed<STableColumn[]>(() => [
  { prop: "username", label: t("settings.columns.username") },
  { key: "role", label: t("settings.columns.role"), width: 100 },
  { prop: "created_at", label: t("settings.columns.created"), width: 160 },
  { key: "actions", label: "", width: 120 },
]);

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

onMounted(async () => {
  await loadUsers();
});

async function loadUsers() {
  if (!isAdmin.value) return;
  try {
    const res = await apiFetch<any>("/api/admin/users");
    users.value = res?.users || [];
  } catch {
    /* handled */
  }
}

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

async function addUser() {
  if (!newUsername.value || !newPassword.value) return;
  try {
    await apiFetch("/api/admin/users", {
      method: "POST",
      body: { username: newUsername.value, password: newPassword.value, isAdmin: newIsAdmin.value },
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
</script>

<style scoped>
.add-user-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.add-user-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.add-user-fields > * {
  flex: 1 1 160px;
  min-width: 120px;
}
.add-user-action {
  display: flex;
  justify-content: flex-end;
}
.stt-actions {
  display: flex;
  gap: 0.4rem;
}
</style>
