<template>
  <Teleport to="body">
    <Transition name="setup-wizard" :duration="220">
      <aside
        v-if="open"
        class="setup-wizard"
        role="dialog"
        aria-live="polite"
        :aria-label="$t('setupWizard.title')"
      >
        <header class="sw-header">
          <span class="mdi mdi-rocket-launch-outline sw-header-icon" />
          <div class="sw-header-text">
            <strong>{{ $t("setupWizard.title") }}</strong>
            <span class="sw-counter">{{ $t("setupWizard.stepOf", { current: step + 1, total }) }}</span>
          </div>
          <button class="sw-close" :title="$t('setupWizard.close')" @click="dismiss">
            <span class="mdi mdi-close" />
          </button>
        </header>

        <nav class="sw-dots" :aria-label="$t('setupWizard.title')">
          <button
            v-for="(s, i) in steps"
            :key="s.id"
            class="sw-dot"
            :class="{ 'is-active': i === step, 'is-done': i < step }"
            :title="$t(`setupWizard.${s.id}.title`)"
            @click="goTo(i)"
          >
            <span class="mdi" :class="i < step ? 'mdi-check' : s.icon" />
          </button>
        </nav>

        <div class="sw-body">
          <h6 class="sw-title">{{ $t(`setupWizard.${current.id}.title`) }}</h6>
          <p class="sw-text">{{ $t(`setupWizard.${current.id}.body`) }}</p>

          <ul class="sw-points">
            <li>{{ $t(`setupWizard.${current.id}.point1`) }}</li>
            <li>{{ $t(`setupWizard.${current.id}.point2`) }}</li>
          </ul>

          <p v-if="statusDone" class="sw-status">
            <span class="mdi mdi-check-circle" /> {{ $t("setupWizard.statusDone") }}
          </p>

          <a
            v-if="current.id === 'about'"
            class="sw-star-link"
            href="https://github.com/Jo3l/transmule"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="mdi mdi-star" /> {{ $t("setupWizard.starOnGithub") }}
          </a>
        </div>

        <footer class="sw-footer">
          <SButton v-if="step > 0" size="sm" @click="previous">
            <span class="mdi mdi-arrow-left mr-1" />{{ $t("setupWizard.back") }}
          </SButton>
          <div class="sw-footer-right">
            <SButton v-if="!isLast" size="sm" @click="skip">{{ $t("setupWizard.skip") }}</SButton>
            <SButton size="sm" variant="primary" @click="primary">
              {{ isLast ? $t("setupWizard.finish") : $t(`setupWizard.${current.id}.action`) }}
              <span class="mdi mdi-arrow-right ml-1" />
            </SButton>
          </div>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { SetupWizardStepId } from "~/composables/useSetupWizard";

const auth = useAuth();
const router = useRouter();
const wizard = useSetupWizard();
const { open, step, steps, total, missingPlugins, missingMetadata } = wizard;

const isAdmin = computed(() => auth.user.value?.isAdmin === true);
const current = computed(() => steps[step.value] ?? steps[0]);
const isLast = computed(() => step.value === total - 1);

/** "Already done" badge for the steps the API can verify. */
const statusDone = computed(() => {
  if (current.value.id === "integrations") return !missingMetadata.value;
  if (current.value.id === "providers") return !missingPlugins.value;
  return false;
});

function openTab(target: SetupWizardStepId): void {
  router.push({ path: "/settings", hash: `#${target}` });
  if (import.meta.client) window.scrollTo({ top: 0, behavior: "smooth" });
}

function primary(): void {
  openTab(current.value.id);
  if (isLast.value) wizard.finish();
  else wizard.next();
}

function skip(): void {
  if (isLast.value) wizard.finish();
  else wizard.next();
}

function goTo(index: number): void {
  wizard.goTo(index);
}

function previous(): void {
  wizard.previous();
}

function dismiss(): void {
  wizard.dismiss();
}

onMounted(() => {
  if (!isAdmin.value) return;
  void wizard.maybeAutoOpen();
});

// Refresh the "already configured" badges whenever the step changes, so
// coming back from a settings tab reflects what the admin just saved.
watch(step, () => {
  void wizard.refreshStatus();
});
</script>

<style scoped>
.setup-wizard {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 1200;
  width: min(400px, calc(100vw - 2rem));
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  background: var(--s-bg-surface);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  font-size: 0.85rem;
}

.sw-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 0.85rem;
  border-bottom: 1px solid var(--s-border);
  background: var(--s-bg-elevated, var(--s-bg-surface));
}

.sw-header-icon {
  font-size: 1.35rem;
  color: var(--s-accent);
}

.sw-header-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  flex: 1;
  min-width: 0;
}

.sw-counter {
  font-size: 0.7rem;
  color: var(--s-text-secondary);
}

.sw-close {
  border: 0;
  background: transparent;
  color: var(--s-text-secondary);
  cursor: pointer;
  border-radius: var(--s-radius);
  padding: 0.15rem 0.3rem;
  line-height: 1;
}

.sw-close:hover {
  color: var(--s-accent);
}

.sw-dots {
  display: flex;
  gap: 0.4rem;
  padding: 0.6rem 0.85rem 0;
}

.sw-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
  border: 1px solid var(--s-border);
  background: transparent;
  color: var(--s-text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.sw-dot:hover {
  border-color: var(--s-accent);
  color: var(--s-accent);
}

.sw-dot.is-active {
  border-color: var(--s-accent);
  background: var(--s-accent);
  color: var(--s-bg-surface);
}

.sw-dot.is-done {
  border-color: var(--s-success, var(--s-accent));
  color: var(--s-success, var(--s-accent));
}

.sw-body {
  padding: 0.7rem 0.85rem 0.5rem;
}

.sw-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0 0 0.35rem;
  color: var(--s-text-primary, inherit);
}

.sw-text {
  margin: 0 0 0.5rem;
  color: var(--s-text-secondary);
  line-height: 1.45;
}

.sw-points {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--s-text-secondary);
  line-height: 1.5;
}

.sw-points li + li {
  margin-top: 0.2rem;
}

.sw-status {
  margin: 0.55rem 0 0;
  color: var(--s-success, var(--s-accent));
  font-size: 0.8rem;
}

.sw-star-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.55rem;
  color: var(--s-accent);
  font-size: 0.82rem;
}

.sw-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.6rem 0.85rem 0.75rem;
}

.sw-footer-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}

/* Slide up from the bottom-right corner */
.setup-wizard-enter-active,
.setup-wizard-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.setup-wizard-enter-from,
.setup-wizard-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 600px) {
  .setup-wizard {
    right: 0.5rem;
    left: 0.5rem;
    bottom: 0.5rem;
    width: auto;
  }
}
</style>
