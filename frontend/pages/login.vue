<template>
  <div class="box">
    <div class="has-text-centered mb-5">
      <span
        class="mdi mdi-download-network"
        style="font-size: 3rem; color: var(--s-accent)"
      />
      <h1 class="title is-4 mt-2">{{ $t("login.title") }}</h1>
      <p class="subtitle is-6 has-text-grey">{{ $t("login.subtitle") }}</p>
    </div>

    <SAlert v-if="error" variant="error" :title="error" class="mb-4" />

    <form @submit.prevent="doLogin">
      <SFormItem :label="$t('login.username')">
        <SInput v-model="username" :placeholder="$t('login.username')">
          <template #prefix><span class="mdi mdi-account" /></template>
        </SInput>
      </SFormItem>

      <SFormItem :label="$t('login.password')">
        <SInput
          v-model="password"
          type="password"
          :placeholder="$t('login.password')"
        >
          <template #prefix><span class="mdi mdi-lock" /></template>
        </SInput>
      </SFormItem>

      <SButton
        variant="primary"
        native-type="submit"
        :loading="loading"
        block
        class="mt-4"
      >
        {{ $t("login.signIn") }}
      </SButton>
    </form>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "auth" });

const { t } = useI18n();
const { apiFetch } = useApi();
const auth = useAuth();

const username = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

async function doLogin() {
  loading.value = true;
  error.value = "";
  try {
    const data = await apiFetch<{ token: string; user: any }>(
      "/api/users/login",
      {
        method: "POST",
        body: { username: username.value, password: password.value },
      },
    );
    auth.setAuth(data.token, data.user);
    navigateTo("/");
  } catch (err: any) {
    error.value = err?.data?.error || err?.message || t("login.failed");
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (auth.token.value) {
    const valid = await auth.fetchUser();
    if (valid) navigateTo("/");
  }
});
</script>
