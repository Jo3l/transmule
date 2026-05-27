<template>
  <div class="box">
    <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.tvdbTitle") }}</h6>
    <p class="is-size-7 mb-3 text-muted">
      {{ $t("settings.tvdbDescription") }}
      <a href="https://thetvdb.com/api-information" target="_blank" rel="noopener">
        thetvdb.com/api-information
      </a>
    </p>

    <SAlert v-if="tvdbKeySet" variant="success" class="mb-3" size="sm">
      {{ $t("settings.tvdbKeySet") }}
    </SAlert>
    <SAlert v-else variant="warning" class="mb-3" size="sm">
      {{ $t("settings.tvdbKeyNotSet") }}
    </SAlert>

    <SFormItem :label="$t('settings.tvdbApiKey')">
      <SInput
        v-model="tvdbKeyInput"
        :placeholder="$t('settings.tvdbKeyPlaceholder')"
        class="mw-420"
      />
    </SFormItem>

    <SFormItem :label="$t('settings.integrationPreferredLocale')">
      <SSelect v-model="tvdbLocaleChoice" class="mw-320">
        <option value="">
          {{ $t("settings.integrationLocaleAppFallback", { locale }) }}
        </option>
        <option
          v-for="loc in integrationLocaleOptions"
          :key="`tvdb-${loc.code}`"
          :value="loc.code"
        >
          {{ loc.name }}
        </option>
      </SSelect>
    </SFormItem>
    <p class="has-text-grey is-size-7 mb-3">
      {{ $t("settings.integrationPreferredLocaleHelp") }}
    </p>

    <div class="stt-btn-row">
      <SButton variant="primary" :loading="savingTvdb" @click="saveTvdbKey">
        <span class="mdi mdi-content-save mr-1" />
        {{ $t("settings.save") }}
      </SButton>
      <SButton v-if="tvdbKeySet" variant="danger" :loading="savingTvdb" @click="clearTvdbKey">
        <span class="mdi mdi-delete mr-1" />
        {{ $t("settings.tvdbKeyClear") }}
      </SButton>
    </div>

    <br />

    <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.tmdbTitle") }}</h6>
    <p class="is-size-7 mb-3 text-muted">
      {{ $t("settings.tmdbDescription") }}
      <a
        href="https://developer.themoviedb.org/docs/getting-started"
        target="_blank"
        rel="noopener"
      >
        developer.themoviedb.org/docs/getting-started
      </a>
    </p>

    <SAlert v-if="tmdbKeySet" variant="success" class="mb-3" size="sm">
      {{ $t("settings.tmdbKeySet") }}
    </SAlert>
    <SAlert v-else variant="warning" class="mb-3" size="sm">
      {{ $t("settings.tmdbKeyNotSet") }}
    </SAlert>

    <SFormItem :label="$t('settings.tmdbApiKey')">
      <SInput
        v-model="tmdbKeyInput"
        :placeholder="$t('settings.tmdbKeyPlaceholder')"
        class="mw-420"
      />
    </SFormItem>

    <SFormItem :label="$t('settings.integrationPreferredLocale')">
      <SSelect v-model="tmdbLocaleChoice" class="mw-320">
        <option value="">
          {{ $t("settings.integrationLocaleAppFallback", { locale }) }}
        </option>
        <option
          v-for="loc in integrationLocaleOptions"
          :key="`tmdb-${loc.code}`"
          :value="loc.code"
        >
          {{ loc.name }}
        </option>
      </SSelect>
    </SFormItem>
    <p class="has-text-grey is-size-7 mb-3">
      {{ $t("settings.integrationPreferredLocaleHelp") }}
    </p>

    <div class="stt-btn-row">
      <SButton variant="primary" :loading="savingTmdb" @click="saveTmdbKey">
        <span class="mdi mdi-content-save mr-1" />
        {{ $t("settings.save") }}
      </SButton>
      <SButton v-if="tmdbKeySet" variant="danger" :loading="savingTmdb" @click="clearTmdbKey">
        <span class="mdi mdi-delete mr-1" />
        {{ $t("settings.tmdbKeyClear") }}
      </SButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t, locale } = useI18n();
const { apiFetch, showToast } = useApi();

const SUPPORTED_PROVIDER_LOCALES = [
  "en", "es", "it", "pt", "fr", "de", "ru", "ja", "ko", "zh",
] as const;
const SUPPORTED_PROVIDER_LOCALE_SET = new Set<string>(SUPPORTED_PROVIDER_LOCALES);

function normalizeLocaleCode(raw: string): string | null {
  const cleaned = raw.trim().replace(/_/g, "-");
  if (!cleaned) return null;
  const parts = cleaned.split("-").filter(Boolean);
  if (parts.length === 0) return null;
  const language = parts[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(language)) return null;
  const region = parts.find((p, idx) => idx > 0 && /^(?:[a-z]{2}|\d{3})$/i.test(p));
  return region ? `${language}-${region.toUpperCase()}` : language;
}

function normalizeProviderLocaleChoice(raw?: string): string {
  const normalized = normalizeLocaleCode(raw ?? "");
  if (!normalized) return "";
  const language = normalized.split("-")[0]?.toLowerCase() ?? "";
  if (!SUPPORTED_PROVIDER_LOCALE_SET.has(language)) return "";
  return language;
}

const integrationLocaleOptions = computed(() => {
  return SUPPORTED_PROVIDER_LOCALES.map((language) => {
    let languageName = language.toUpperCase();
    try {
      const displayNames = new Intl.DisplayNames([locale.value || "en"], {
        type: "language",
      });
      languageName = displayNames.of(language) || languageName;
    } catch {
      // ignore
    }
    return { code: language, name: `${languageName} (${language})` };
  });
});

const tvdbKeySet = ref(false);
const tvdbKeyInput = ref("");
const tvdbLocaleChoice = ref("");
const savingTvdb = ref(false);
const tmdbKeySet = ref(false);
const tmdbKeyInput = ref("");
const tmdbLocaleChoice = ref("");
const savingTmdb = ref(false);

onMounted(async () => {
  try {
    const res = await apiFetch<{
      tvdbApiKeySet: boolean;
      tmdbApiKeySet: boolean;
      tvdbApiKey?: string;
      tmdbApiKey?: string;
      tvdbLocale?: string;
      tmdbLocale?: string;
    }>("/api/admin/integrations");
    tvdbKeySet.value = res?.tvdbApiKeySet ?? false;
    tmdbKeySet.value = res?.tmdbApiKeySet ?? false;
    tvdbKeyInput.value = res?.tvdbApiKey ?? "";
    tmdbKeyInput.value = res?.tmdbApiKey ?? "";
    tvdbLocaleChoice.value = normalizeProviderLocaleChoice(res?.tvdbLocale);
    tmdbLocaleChoice.value = normalizeProviderLocaleChoice(res?.tmdbLocale);
  } catch {
    /* handled */
  }
});

async function saveTvdbKey() {
  savingTvdb.value = true;
  try {
    await apiFetch("/api/admin/integrations", {
      method: "POST",
      body: { tvdbApiKey: tvdbKeyInput.value, tvdbLocale: tvdbLocaleChoice.value },
    });
    // reload
    const res = await apiFetch<any>("/api/admin/integrations");
    tvdbKeySet.value = res?.tvdbApiKeySet ?? false;
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
    tvdbKeySet.value = false;
  } finally {
    savingTvdb.value = false;
  }
}

async function saveTmdbKey() {
  savingTmdb.value = true;
  try {
    await apiFetch("/api/admin/integrations", {
      method: "POST",
      body: { tmdbApiKey: tmdbKeyInput.value, tmdbLocale: tmdbLocaleChoice.value },
    });
    const res = await apiFetch<any>("/api/admin/integrations");
    tmdbKeySet.value = res?.tmdbApiKeySet ?? false;
  } finally {
    savingTmdb.value = false;
  }
}

async function clearTmdbKey() {
  savingTmdb.value = true;
  try {
    await apiFetch("/api/admin/integrations", {
      method: "POST",
      body: { tmdbApiKey: "" },
    });
    tmdbKeyInput.value = "";
    tmdbKeySet.value = false;
  } finally {
    savingTmdb.value = false;
  }
}
</script>

<style scoped>
.stt-btn-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
