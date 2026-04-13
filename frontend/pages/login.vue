<template>
  <Teleport to="body">
    <canvas v-if="canvasEnabled" id="c" aria-label="Scene" role="img">Scene</canvas>
  </Teleport>
  <div id="page-login" class="box">
    <div class="has-text-centered mb-5">
      <img src="~/assets/logo/logo128.png" alt="TransMule" class="auth-logo" />
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
        <SInput v-model="password" type="password" :placeholder="$t('login.password')">
          <template #prefix><span class="mdi mdi-lock" /></template>
        </SInput>
      </SFormItem>

      <SButton variant="primary" native-type="submit" :loading="loading" block class="mt-4">
        {{ $t("login.signIn") }}
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

async function doLogin() {
  loading.value = true;
  error.value = "";
  try {
    const data = await apiFetch<{ token: string; user: any }>("/api/users/login", {
      method: "POST",
      body: { username: username.value, password: password.value },
    });
    auth.setAuth(data.token, data.user);
    navigateTo("/");
  } catch (err: any) {
    error.value =
      err?.statusMessage ||
      err?.data?.statusMessage ||
      err?.data?.message ||
      err?.message ||
      t("login.failed");
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

<style scoped>
#c {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

#page-login {
  position: relative;
  z-index: 1;
}
</style>
