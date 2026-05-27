<template>
  <div class="box">
    <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.changePassword") }}</h6>
    <SFormItem :label="$t('settings.currentPassword')">
      <SInput v-model="selfPwCurrent" type="password" class="mw-320" />
    </SFormItem>
    <SFormItem :label="$t('settings.newPassword')">
      <SInput v-model="selfPwNew" type="password" class="mw-320" />
    </SFormItem>
    <SFormItem :label="$t('settings.confirmPassword')">
      <SInput v-model="selfPwConfirm" type="password" class="mw-320" />
    </SFormItem>
    <p v-if="selfPwError" class="has-text-danger is-size-7 mb-3">
      {{ selfPwError }}
    </p>
    <div class="flex-end">
      <SButton variant="primary" :loading="savingSelfPw" @click="submitSelfPw">
        <span class="mdi mdi-content-save mr-1" />
        {{ $t("settings.save") }}
      </SButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { apiFetch } = useApi();

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
    selfPwError.value = err?.data?.statusMessage || err?.statusMessage || t("settings.saveFailed");
  } finally {
    savingSelfPw.value = false;
  }
}
</script>
