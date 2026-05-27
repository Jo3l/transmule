<template>
  <div class="box">
    <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.language") }}</h6>
    <p class="has-text-grey is-size-7 mb-4">
      {{ $t("settings.languageDescription") }}
    </p>
    <SFormItem :label="$t('settings.language')" class="mw-320">
      <SSelect v-model="selectedLocale">
        <option v-for="lang in availableLocales" :key="lang.code" :value="lang.code">
          {{ lang.name }}
        </option>
      </SSelect>
    </SFormItem>

    <div class="flex-end">
      <SButton variant="primary" :loading="savingLocale" @click="applyLocale">
        <span class="mdi mdi-content-save mr-1" />
        {{ $t("settings.save") }}
      </SButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t, locale, locales } = useI18n();

const savingLocale = ref(false);

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
</script>
