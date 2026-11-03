<template>
  <div class="share-entry">
    <div class="share-entry__card">
      <span class="mdi mdi-qrcode share-entry__icon" />
      <h1 class="share-entry__title">{{ $t("share.public.codeTitle") }}</h1>
      <p class="share-entry__hint">{{ $t("share.public.codeHint") }}</p>

      <form class="share-entry__form" @submit.prevent="submit">
        <input
          v-model="code"
          class="share-entry__input"
          inputmode="text"
          autocomplete="one-time-code"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="8"
          :placeholder="$t('share.public.codePlaceholder')"
          @input="onInput"
        />
        <SButton nativeType="submit" variant="primary" :loading="loading">
          {{ $t("share.public.open") }}
        </SButton>
      </form>

      <p v-if="error" class="share-entry__error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "share" });

const { t } = useI18n();
const sharePublic = useSharePublic();

const code = ref("");
const error = ref("");
const loading = ref(false);

function onInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const normalized = input.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
  code.value = normalized;
  input.value = normalized;
}

async function submit() {
  error.value = "";
  if (code.value.length !== 6) {
    error.value = t("share.public.badCode");
    return;
  }
  loading.value = true;
  try {
    const resolved = await sharePublic.resolveCode(code.value);
    sharePublic.storeSession(resolved.id, resolved.ticket, resolved.roots);
    await navigateTo(`/s/${resolved.id}`);
  } catch (err) {
    const status = shareErrorStatus(err);
    error.value =
      status === 404
        ? t("share.public.notFound")
        : status === 410
          ? t("share.public.gone")
          : status === 429
            ? t("share.public.locked")
            : t("share.public.wrongCode");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.share-entry {
  width: 100%;
  display: flex;
  justify-content: center;
}

.share-entry__card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem 1.5rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.share-entry__icon {
  font-size: 2rem;
  color: #22d3ee;
}

.share-entry__title {
  font-size: 1.15rem;
  font-weight: 600;
}

.share-entry__hint {
  font-size: 0.85rem;
  color: var(--text-muted, #9ca3af);
  text-align: center;
}

.share-entry__form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
}

.share-entry__input {
  width: 100%;
  text-align: center;
  font-size: 1.5rem;
  letter-spacing: 0.4rem;
  text-transform: uppercase;
  padding: 0.5rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
}

.share-entry__error {
  font-size: 0.82rem;
  color: #f87171;
}
</style>
