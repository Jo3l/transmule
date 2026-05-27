<template>
  <div class="box">
    <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.theme") }}</h6>
    <p class="has-text-grey is-size-7 mb-4">
      {{ $t("settings.themeDescription") }}
    </p>
    <SFormItem :label="$t('settings.theme')" class="mw-320">
      <SSelect v-model="selectedTheme">
        <option v-for="th in themes" :key="th.key" :value="th.key">
          {{ th.label }}
        </option>
      </SSelect>
    </SFormItem>

    <SFormItem :label="$t('settings.canvasEffects')" class="mt-4">
      <SSwitch :model-value="canvasEnabled" @update:model-value="setCanvasEnabled" />
    </SFormItem>
    <p class="has-text-grey is-size-7 mb-4">
      {{ $t("settings.canvasEffectsDescription") }}
    </p>

    <div class="flex-end">
      <SButton variant="primary" :loading="savingTheme" @click="applyTheme">
        <span class="mdi mdi-content-save mr-1" />
        {{ $t("settings.save") }}
      </SButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { currentTheme, setTheme, saveToServer, THEME_META, canvasEnabled, setCanvasEnabled } =
  useTheme();
const { apiFetch } = useApi();

const savingTheme = ref(false);

const themes = computed(() =>
  Object.entries(THEME_META).map(([key, meta]) => ({
    key,
    label: t(`themes.${key}.name`),
    icon: meta.icon.replace("mdi-", ""),
    desc: t(`themes.${key}.description`),
  })),
);
const selectedTheme = ref(currentTheme.value);
watch(currentTheme, (v) => {
  selectedTheme.value = v;
});

async function applyTheme() {
  savingTheme.value = true;
  try {
    await saveToServer(selectedTheme.value as any);
    localStorage.setItem("sark-theme", selectedTheme.value);
    window.location.reload();
  } finally {
    savingTheme.value = false;
  }
}
</script>
