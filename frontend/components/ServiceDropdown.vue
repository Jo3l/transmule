<template>
  <div id="comp-service-dropdown" v-if="isAdmin && loaded" class="service-dropdown" ref="dropdownRef">
    <SButton size="sm" @click="open = !open">
      <span class="mdi mdi-server-network" />
      <span class="service-dropdown__label">{{ $t("services.title") }}</span>
      <span class="mdi" :class="open ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
    </SButton>

    <Transition name="sd-fade">
      <div v-if="open" class="service-dropdown__panel">
        <!-- aMule -->
        <div class="service-dropdown__item">
          <div class="service-dropdown__row">
            <span class="mdi mdi-donkey service-dropdown__icon" />
            <span class="service-dropdown__name">aMule</span>
            <STag
              :variant="services?.amule?.running ? 'success' : 'danger'"
              size="sm"
            >
              {{
                services?.amule?.running
                  ? $t("services.running")
                  : $t("services.stopped")
              }}
            </STag>
          </div>
          <div
            v-if="services?.amule?.running && services.amule.startedAt"
            class="service-dropdown__uptime"
          >
            <span class="mdi mdi-clock-outline" />
            {{ $t("services.uptime") }}:
            {{ formatUptime(services.amule.startedAt) }}
          </div>
          <SButton
            :variant="services?.amule?.running ? 'danger' : 'success'"
            size="sm"
            block
            :loading="loading.amule"
            @click="toggle('amule')"
          >
            <span
              class="mdi"
              :class="services?.amule?.running ? 'mdi-stop' : 'mdi-play'"
            />
            {{
              services?.amule?.running
                ? $t("services.stop")
                : $t("services.start")
            }}
          </SButton>
        </div>

        <SDivider />

        <!-- Transmission -->
        <div class="service-dropdown__item">
          <div class="service-dropdown__row">
            <span class="mdi mdi-magnet service-dropdown__icon" />
            <span class="service-dropdown__name">Transmission</span>
            <STag
              :variant="services?.transmission?.running ? 'success' : 'danger'"
              size="sm"
            >
              {{
                services?.transmission?.running
                  ? $t("services.running")
                  : $t("services.stopped")
              }}
            </STag>
          </div>
          <div
            v-if="
              services?.transmission?.running && services.transmission.startedAt
            "
            class="service-dropdown__uptime"
          >
            <span class="mdi mdi-clock-outline" />
            {{ $t("services.uptime") }}:
            {{ formatUptime(services.transmission.startedAt) }}
          </div>
          <SButton
            :variant="services?.transmission?.running ? 'danger' : 'success'"
            size="sm"
            block
            :loading="loading.transmission"
            @click="toggle('transmission')"
          >
            <span
              class="mdi"
              :class="services?.transmission?.running ? 'mdi-stop' : 'mdi-play'"
            />
            {{
              services?.transmission?.running
                ? $t("services.stop")
                : $t("services.start")
            }}
          </SButton>
        </div>
        <SDivider />

        <!-- pyLoad -->
        <div class="service-dropdown__item">
          <div class="service-dropdown__row">
            <span class="mdi mdi-cloud-download service-dropdown__icon" />
            <span class="service-dropdown__name">pyLoad</span>
            <STag
              :variant="services?.pyload?.running ? 'success' : 'danger'"
              size="sm"
            >
              {{
                services?.pyload?.running
                  ? $t("services.running")
                  : $t("services.stopped")
              }}
            </STag>
          </div>
          <div
            v-if="services?.pyload?.running && services.pyload.startedAt"
            class="service-dropdown__uptime"
          >
            <span class="mdi mdi-clock-outline" />
            {{ $t("services.uptime") }}:
            {{ formatUptime(services.pyload.startedAt) }}
          </div>
          <SButton
            :variant="services?.pyload?.running ? 'danger' : 'success'"
            size="sm"
            block
            :loading="loading.pyload"
            @click="toggle('pyload')"
          >
            <span
              class="mdi"
              :class="services?.pyload?.running ? 'mdi-stop' : 'mdi-play'"
            />
            {{
              services?.pyload?.running
                ? $t("services.stop")
                : $t("services.start")
            }}
          </SButton>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
const { services, loading, loaded, isAdmin, toggle } = useServices();
const { t } = useI18n();

const open = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

// Close on outside click
function onClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener("click", onClickOutside));
onUnmounted(() => document.removeEventListener("click", onClickOutside));

function formatUptime(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  let secs = Math.floor((now - start) / 1000);
  if (secs < 0) secs = 0;

  const days = Math.floor(secs / 86400);
  secs %= 86400;
  const hours = Math.floor(secs / 3600);
  secs %= 3600;
  const mins = Math.floor(secs / 60);

  if (days > 0) return t("services.uptimeDHM", { d: days, h: hours, m: mins });
  if (hours > 0) return t("services.uptimeHM", { h: hours, m: mins });
  return t("services.uptimeM", { m: mins });
}
</script>

<style scoped>
.service-dropdown {
  position: relative;
}

.service-dropdown__label {
  margin: 0 0.25rem;
}

.service-dropdown__panel {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 100;
  min-width: 260px;
  padding: 0.75rem;
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: 0.5rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.service-dropdown__item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.service-dropdown__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.service-dropdown__icon {
  font-size: 1.1rem;
}

.service-dropdown__name {
  font-weight: 600;
  font-size: 0.85rem;
  flex: 1;
}

.service-dropdown__uptime {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--s-text-muted, #888);
}

/* Transition */
.sd-fade-enter-active,
.sd-fade-leave-active {
  transition:
    opacity 0.15s,
    transform 0.15s;
}
.sd-fade-enter-from,
.sd-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
