<template>
  <Teleport to="body">
    <canvas v-if="canvasEnabled" id="c" aria-label="Scene" role="img">Scene</canvas>
  </Teleport>
  <div id="page-setup" class="box">
    <div class="has-text-centered mb-5">
      <img src="~/assets/logo/logo128.png" alt="TransMule" class="auth-logo" />
      <h1 class="title is-4 mt-2">{{ $t("setup.title") }}</h1>
      <p class="subtitle is-6 has-text-grey">
        {{ $t("setup.subtitle") }}
      </p>
    </div>

    <SAlert v-if="error" variant="error" :title="error" class="mb-4" />

    <form @submit.prevent="doSetup">
      <SFormItem :label="$t('setup.adminUsername')">
        <SInput v-model="username" :placeholder="$t('setup.usernamePlaceholder')">
          <template #prefix><span class="mdi mdi-account" /></template>
        </SInput>
      </SFormItem>

      <SFormItem :label="$t('setup.adminPassword')">
        <SInput v-model="password" type="password" :placeholder="$t('setup.passwordPlaceholder')">
          <template #prefix><span class="mdi mdi-lock" /></template>
        </SInput>
      </SFormItem>

      <SFormItem :label="$t('setup.confirmPassword')">
        <SInput
          v-model="passwordConfirm"
          type="password"
          :placeholder="$t('setup.repeatPlaceholder')"
        >
          <template #prefix><span class="mdi mdi-lock-check" /></template>
        </SInput>
      </SFormItem>

      <SButton variant="primary" native-type="submit" :loading="loading" block class="mt-4">
        {{ $t("setup.create") }}
      </SButton>
    </form>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "auth" });

import { init as initSceneDefault } from "~/assets/scenes/scene.js";
import { init as initSceneLumon } from "~/assets/scenes/scene-lumon.js";
import { init as initSceneMatrix } from "~/assets/scenes/scene-matrix.js";

const { t } = useI18n();
const { apiFetch } = useApi();
const auth = useAuth();

const username = ref("");
const password = ref("");
const passwordConfirm = ref("");
const loading = ref(false);
const error = ref("");

const { canvasEnabled, currentTheme } = useTheme();

let destroyScene: (() => void) | null = null;
onUnmounted(() => destroyScene?.());

async function ensureScene() {
  if (!canvasEnabled.value) {
    destroyScene?.();
    destroyScene = null;
    return;
  }

  await nextTick();
  const canvas = document.getElementById("c") as HTMLCanvasElement | null;
  if (!canvas) return;

  destroyScene?.();
  const theme = document.documentElement.getAttribute("data-theme") || currentTheme.value;
  const initScene =
    theme === "matrix"
      ? initSceneMatrix
      : theme === "lumon"
        ? initSceneLumon
        : initSceneDefault;
  destroyScene = initScene(canvas);
}

watch([canvasEnabled, currentTheme], ensureScene, { immediate: true, flush: "post" });

async function doSetup() {
  error.value = "";
  if (password.value !== passwordConfirm.value) {
    error.value = t("setup.mismatch");
    return;
  }
  loading.value = true;
  try {
    const config = useRuntimeConfig();
    const data = await $fetch<{ token: string; user: any }>("/api/users/setup", {
      baseURL: config.public.apiBase,
      method: "POST",
      body: { username: username.value, password: password.value },
    });
    auth.setAuth(data.token, data.user);
    navigateTo("/");
  } catch (err: any) {
    error.value = err?.data?.error || err?.message || t("setup.failed");
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    const config = useRuntimeConfig();
    const status = await $fetch<{ hasUsers: boolean }>("/api/users/status", {
      baseURL: config.public.apiBase,
    });
    if (status.hasUsers) navigateTo("/login");
  } catch {
    /* ignore */
  }
});
</script>

<style scoped>
#c {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

#page-setup {
  position: relative;
  z-index: 1;
}
</style>
