<template>
  <SLoading :loading="loading">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-speedometer mr-1" />
      {{ $t("transmission.speed.title") }}
    </h1>

    <div class="box">
      <h6 class="title is-6 mb-3 mt-3">{{ $t("transmission.speed.normal") }}</h6>

      <SFormItem :label="$t('transmission.speed.limitDown')">
        <SSwitch v-model="form.dlEnabled" @update:model-value="save" />
        <SInputNumber
          v-if="form.dlEnabled"
          v-model="form.dlSpeed"
          :min="0"
          :step="50"
          class="ml-3 w-160"
          @update:model-value="save"
        />
        <span v-if="form.dlEnabled" class="ml-2 has-text-grey is-size-7">{{
          $t("transmission.speed.kbs")
        }}</span>
      </SFormItem>

      <SFormItem :label="$t('transmission.speed.limitUp')">
        <SSwitch v-model="form.ulEnabled" @update:model-value="save" />
        <SInputNumber
          v-if="form.ulEnabled"
          v-model="form.ulSpeed"
          :min="0"
          :step="50"
          class="ml-3 w-160"
          @update:model-value="save"
        />
        <span v-if="form.ulEnabled" class="ml-2 has-text-grey is-size-7">{{
          $t("transmission.speed.kbs")
        }}</span>
      </SFormItem>

      <SDivider />

      <h6 class="title is-6 mb-3 mt-3">
        <span class="mdi mdi-turtle mr-1" /> {{ $t("transmission.speed.alt") }}
      </h6>

      <SFormItem :label="$t('transmission.speed.altEnabled')">
        <SSwitch v-model="form.altEnabled" @update:model-value="save" />
      </SFormItem>

      <SFormItem :label="$t('transmission.speed.altDown')">
        <SInputNumber
          v-model="form.altDown"
          :min="0"
          :step="10"
          class="w-160"
          @update:model-value="save"
        />
        <span class="ml-2 has-text-grey is-size-7">{{ $t("transmission.speed.kbs") }}</span>
      </SFormItem>

      <SFormItem :label="$t('transmission.speed.altUp')">
        <SInputNumber
          v-model="form.altUp"
          :min="0"
          :step="10"
          class="w-160"
          @update:model-value="save"
        />
        <span class="ml-2 has-text-grey is-size-7">{{ $t("transmission.speed.kbs") }}</span>
      </SFormItem>

      <SFormItem :label="$t('transmission.speed.scheduleAlt')">
        <SSwitch v-model="form.altTimeEnabled" @update:model-value="save" />
      </SFormItem>

      <template v-if="form.altTimeEnabled">
        <SFormItem :label="$t('transmission.speed.startTime')">
          <SInputNumber
            v-model="form.altTimeBegin"
            :min="0"
            :max="1439"
            class="w-160"
            @update:model-value="save"
          />
          <span class="ml-2 has-text-grey is-size-7">{{ fmtTime(form.altTimeBegin) }}</span>
        </SFormItem>

        <SFormItem :label="$t('transmission.speed.endTime')">
          <SInputNumber
            v-model="form.altTimeEnd"
            :min="0"
            :max="1439"
            class="w-160"
            @update:model-value="save"
          />
          <span class="ml-2 has-text-grey is-size-7">{{ fmtTime(form.altTimeEnd) }}</span>
        </SFormItem>

        <SFormItem :label="$t('transmission.speed.scheduledDays')">
          <SSelect
            v-model="form.altTimeDay"
            :options="dayOptions"
            class="w-200"
            @update:model-value="save"
          />
        </SFormItem>
      </template>
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { transmissionRunning } = useServiceGuard();
const { t } = useI18n();
const loading = ref(true);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const form = reactive({
  dlEnabled: false,
  dlSpeed: 0,
  ulEnabled: false,
  ulSpeed: 0,
  altEnabled: false,
  altDown: 0,
  altUp: 0,
  altTimeEnabled: false,
  altTimeBegin: 0,
  altTimeEnd: 0,
  altTimeDay: 127,
});

const dayOptions = computed(() => [
  { label: t("transmission.speed.days.every"), value: 127 },
  { label: t("transmission.speed.days.weekdays"), value: 62 },
  { label: t("transmission.speed.days.weekends"), value: 65 },
  { label: t("transmission.speed.days.sunday"), value: 1 },
  { label: t("transmission.speed.days.monday"), value: 2 },
  { label: t("transmission.speed.days.tuesday"), value: 4 },
  { label: t("transmission.speed.days.wednesday"), value: 8 },
  { label: t("transmission.speed.days.thursday"), value: 16 },
  { label: t("transmission.speed.days.friday"), value: 32 },
  { label: t("transmission.speed.days.saturday"), value: 64 },
]);

function fmtTime(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function fetchSession() {
  if (!transmissionRunning.value) return;
  loading.value = true;
  try {
    const { raw } = await apiFetch<any>("/api/transmission/session");
    form.dlEnabled = raw["speed-limit-down-enabled"] ?? false;
    form.dlSpeed = raw["speed-limit-down"] ?? 0;
    form.ulEnabled = raw["speed-limit-up-enabled"] ?? false;
    form.ulSpeed = raw["speed-limit-up"] ?? 0;
    form.altEnabled = raw["alt-speed-enabled"] ?? false;
    form.altDown = raw["alt-speed-down"] ?? 0;
    form.altUp = raw["alt-speed-up"] ?? 0;
    form.altTimeEnabled = raw["alt-speed-time-enabled"] ?? false;
    form.altTimeBegin = raw["alt-speed-time-begin"] ?? 0;
    form.altTimeEnd = raw["alt-speed-time-end"] ?? 0;
    form.altTimeDay = raw["alt-speed-time-day"] ?? 127;
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
        "speed-limit-down-enabled": form.dlEnabled,
        "speed-limit-down": form.dlSpeed,
        "speed-limit-up-enabled": form.ulEnabled,
        "speed-limit-up": form.ulSpeed,
        "alt-speed-enabled": form.altEnabled,
        "alt-speed-down": form.altDown,
        "alt-speed-up": form.altUp,
        "alt-speed-time-enabled": form.altTimeEnabled,
        "alt-speed-time-begin": form.altTimeBegin,
        "alt-speed-time-end": form.altTimeEnd,
        "alt-speed-time-day": form.altTimeDay,
      },
    });
  } catch {
    /* useApi shows error toast */
  }
}

onMounted(() => fetchSession());
</script>
