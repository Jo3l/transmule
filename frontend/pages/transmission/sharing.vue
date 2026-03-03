<template>
  <SLoading :loading="loading">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-share-variant mr-1" />
      {{ $t("transmission.sharing.title") }}
    </h1>

    <div class="box">
      <h6 class="title is-6 mb-3">
        {{ $t("transmission.sharing.seedRatio") }}
      </h6>
      <SFormItem :label="$t('transmission.sharing.stopAtRatio')">
        <SSwitch v-model="form.seedRatioLimited" @update:model-value="save" />
        <SInputNumber
          v-if="form.seedRatioLimited"
          v-model="form.seedRatioLimit"
          :min="0"
          :step="0.1"
          :precision="2"
          class="ml-3 w-140"
          @update:model-value="save"
        />
      </SFormItem>

      <SDivider />

      <h6 class="title is-6 mb-3">
        {{ $t("transmission.sharing.idleSeeding") }}
      </h6>
      <SFormItem :label="$t('transmission.sharing.stopIfIdle')">
        <SSwitch
          v-model="form.idleSeedingLimitEnabled"
          @update:model-value="save"
        />
        <SInputNumber
          v-if="form.idleSeedingLimitEnabled"
          v-model="form.idleSeedingLimit"
          :min="1"
          :step="5"
          class="ml-3 w-140"
          @update:model-value="save"
        />
        <span
          v-if="form.idleSeedingLimitEnabled"
          class="ml-2 has-text-grey is-size-7"
          >{{ $t("transmission.sharing.minutes") }}</span
        >
      </SFormItem>

      <SDivider />

      <h6 class="title is-6 mb-3">{{ $t("transmission.sharing.queue") }}</h6>
      <SFormItem :label="$t('transmission.sharing.limitDownQueue')">
        <SSwitch
          v-model="form.downloadQueueEnabled"
          @update:model-value="save"
        />
        <SInputNumber
          v-if="form.downloadQueueEnabled"
          v-model="form.downloadQueueSize"
          :min="1"
          :step="1"
          class="ml-3 w-120"
          @update:model-value="save"
        />
      </SFormItem>
      <SFormItem :label="$t('transmission.sharing.limitSeedQueue')">
        <SSwitch v-model="form.seedQueueEnabled" @update:model-value="save" />
        <SInputNumber
          v-if="form.seedQueueEnabled"
          v-model="form.seedQueueSize"
          :min="1"
          :step="1"
          class="ml-3 w-120"
          @update:model-value="save"
        />
      </SFormItem>
      <SFormItem :label="$t('transmission.sharing.stalledHandling')">
        <SSwitch
          v-model="form.queueStalledEnabled"
          @update:model-value="save"
        />
        <SInputNumber
          v-if="form.queueStalledEnabled"
          v-model="form.queueStalledMinutes"
          :min="1"
          :step="5"
          class="ml-3 w-120"
          @update:model-value="save"
        />
        <span
          v-if="form.queueStalledEnabled"
          class="ml-2 has-text-grey is-size-7"
          >{{ $t("transmission.sharing.minutesStalled") }}</span
        >
      </SFormItem>
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { transmissionRunning } = useServiceGuard();
const loading = ref(true);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const form = reactive({
  seedRatioLimited: false,
  seedRatioLimit: 2.0,
  idleSeedingLimitEnabled: false,
  idleSeedingLimit: 30,
  downloadQueueEnabled: true,
  downloadQueueSize: 5,
  seedQueueEnabled: false,
  seedQueueSize: 10,
  queueStalledEnabled: true,
  queueStalledMinutes: 30,
});

async function fetchSession() {
  if (!transmissionRunning.value) return;
  loading.value = true;
  try {
    const { raw } = await apiFetch<any>("/api/transmission/session");
    form.seedRatioLimited =
      raw.seedRatioLimited ?? raw["seed-ratio-limited"] ?? false;
    form.seedRatioLimit = raw.seedRatioLimit ?? raw["seed-ratio-limit"] ?? 2.0;
    form.idleSeedingLimitEnabled = raw["idle-seeding-limit-enabled"] ?? false;
    form.idleSeedingLimit = raw["idle-seeding-limit"] ?? 30;
    form.downloadQueueEnabled = raw["download-queue-enabled"] ?? true;
    form.downloadQueueSize = raw["download-queue-size"] ?? 5;
    form.seedQueueEnabled = raw["seed-queue-enabled"] ?? false;
    form.seedQueueSize = raw["seed-queue-size"] ?? 10;
    form.queueStalledEnabled = raw["queue-stalled-enabled"] ?? true;
    form.queueStalledMinutes = raw["queue-stalled-minutes"] ?? 30;
  } finally {
    loading.value = false;
  }
}

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 600);
}

async function doSave() {
  try {
    await apiFetch("/api/transmission/session", {
      method: "POST",
      body: {
        seedRatioLimited: form.seedRatioLimited,
        seedRatioLimit: form.seedRatioLimit,
        "idle-seeding-limit-enabled": form.idleSeedingLimitEnabled,
        "idle-seeding-limit": form.idleSeedingLimit,
        "download-queue-enabled": form.downloadQueueEnabled,
        "download-queue-size": form.downloadQueueSize,
        "seed-queue-enabled": form.seedQueueEnabled,
        "seed-queue-size": form.seedQueueSize,
        "queue-stalled-enabled": form.queueStalledEnabled,
        "queue-stalled-minutes": form.queueStalledMinutes,
      },
    });
  } catch {
    /* useApi shows error toast */
  }
}

onMounted(() => fetchSession());
</script>

