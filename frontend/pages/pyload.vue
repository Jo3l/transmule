<template>
  <div>
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-download-circle-outline mr-1" />
      {{ $t("pyload.title") }}
    </h1>

    <!-- Status bar -->
    <div v-if="status" class="box mb-4">
      <div
        style="display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap"
      >
        <div>
          <span class="has-text-grey is-size-7"
            >{{ $t("pyload.speed") }}:
          </span>
          <strong>{{ status.speed_fmt }}</strong>
        </div>
        <div>
          <span class="has-text-grey is-size-7"
            >{{ $t("pyload.active") }}:
          </span>
          <strong>{{ status.active }}</strong>
        </div>
        <div>
          <span class="has-text-grey is-size-7"
            >{{ $t("pyload.queued") }}:
          </span>
          <strong>{{ status.queue }}</strong>
        </div>
        <div v-if="status.freeSpace_fmt">
          <span class="has-text-grey is-size-7"
            >{{ $t("pyload.freeSpace") }}:
          </span>
          <strong>{{ status.freeSpace_fmt }}</strong>
        </div>
        <div v-if="status.version" style="margin-left: auto">
          <span class="has-text-grey is-size-7">v{{ status.version }}</span>
        </div>

        <!-- Controls -->
        <div style="display: flex; gap: 0.5rem; margin-left: auto">
          <SButton
            :variant="status.paused ? 'success' : 'warning'"
            size="sm"
            :loading="controlling"
            :title="status.paused ? $t('pyload.resume') : $t('pyload.pause')"
            @click="control(status.paused ? 'unpause' : 'pause')"
          >
            <span :class="status.paused ? 'mdi mdi-play' : 'mdi mdi-pause'" />
            {{ status.paused ? $t("pyload.resume") : $t("pyload.pause") }}
          </SButton>
          <SButton
            variant="danger"
            size="sm"
            :loading="controlling"
            @click="control('stop_all')"
          >
            <span class="mdi mdi-stop" /> {{ $t("pyload.stopAll") }}
          </SButton>
          <SButton
            variant="warning"
            size="sm"
            :loading="controlling"
            @click="control('restart_failed')"
          >
            <span class="mdi mdi-restart" /> {{ $t("pyload.restartFailed") }}
          </SButton>
          <SButton
            variant="info"
            size="sm"
            :loading="controlling"
            @click="control('delete_finished')"
          >
            <span class="mdi mdi-broom" /> {{ $t("pyload.deleteFinished") }}
          </SButton>
        </div>
      </div>

      <!-- Paused badge -->
      <div v-if="status.paused" class="mt-2">
        <STag variant="warning">{{ $t("pyload.pausedLabel") }}</STag>
      </div>
    </div>

    <!-- Add package form -->
    <div class="box mb-4">
      <form @submit.prevent="addPackage">
        <div class="columns is-multiline">
          <div class="column is-4">
            <SFormItem :label="$t('pyload.packageName')">
              <SInput
                v-model="newPackage.name"
                :placeholder="$t('pyload.packageNamePlaceholder')"
              />
            </SFormItem>
          </div>
          <div class="column is-8">
            <SFormItem :label="$t('pyload.links')">
              <SInput
                v-model="newPackage.links"
                type="textarea"
                :rows="4"
                :placeholder="$t('pyload.linksPlaceholder')"
              />
            </SFormItem>
          </div>
        </div>
        <SButton variant="primary" native-type="submit" :loading="adding">
          <span class="mdi mdi-plus mr-1" /> {{ $t("pyload.addPackage") }}
        </SButton>
      </form>
    </div>

    <!-- Package list -->
    <SLoading :loading="loadingPackages">
      <div
        v-if="packages.length === 0 && !loadingPackages"
        class="has-text-centered py-5 has-text-grey"
      >
        <span class="mdi mdi-download-off-outline" style="font-size: 2rem" />
        <p class="mt-2">{{ $t("pyload.noPackages") }}</p>
      </div>

      <div v-for="pkg in packages" :key="pkg.pid" class="box mb-3">
        <!-- Package header -->
        <div
          style="
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex-wrap: wrap;
            margin-bottom: 0.5rem;
          "
        >
          <span class="mdi mdi-package-variant-closed" />
          <strong>{{ pkg.name }}</strong>
          <STag :variant="destVariant(pkg.dest)" size="sm">
            {{
              pkg.dest === "queue"
                ? $t("pyload.destQueue")
                : $t("pyload.destCollector")
            }}
          </STag>
          <span class="has-text-grey is-size-7">
            {{ pkg.linkCount }} {{ $t("pyload.linksLabel") }} &nbsp;·&nbsp;
            {{ pkg.totalSize_fmt }}
          </span>
          <span v-if="pkg.activeLinks > 0" class="has-text-success is-size-7">
            {{ pkg.activeLinks }} {{ $t("pyload.downloading") }}
          </span>
          <span v-if="pkg.failedLinks > 0" class="has-text-danger is-size-7">
            {{ pkg.failedLinks }} {{ $t("pyload.failed") }}
          </span>
          <STag
            v-if="
              pkg.finishedLinks === pkg.linkCount &&
              pkg.linkCount > 0 &&
              pkg.activeLinks === 0
            "
            variant="success"
            size="sm"
          >
            <span class="mdi mdi-check" /> {{ $t("pyload.finished") }}
          </STag>

          <!-- Package actions -->
          <div style="margin-left: auto; display: flex; gap: 0.5rem">
            <SButton
              v-if="pkg.dest === 'collector'"
              variant="primary"
              size="sm"
              @click="packageAction('move_to_queue', pkg.pid)"
            >
              <span class="mdi mdi-arrow-right" />
              {{ $t("pyload.moveToQueue") }}
            </SButton>
            <SButton
              v-if="pkg.activeLinks > 0"
              variant="warning"
              size="sm"
              :title="$t('pyload.stopPackage')"
              @click="packageAction('stop', pkg.pid)"
            >
              <span class="mdi mdi-pause" />
            </SButton>
            <SButton
              variant="warning"
              size="sm"
              :title="$t('pyload.restartPackage')"
              @click="packageAction('restart', pkg.pid)"
            >
              <span class="mdi mdi-restart" />
            </SButton>
            <SButton
              variant="danger"
              size="sm"
              :title="$t('pyload.deletePackage')"
              @click="packageAction('delete', pkg.pid)"
            >
              <span class="mdi mdi-delete" />
            </SButton>
          </div>
        </div>

        <!-- Package progress bar -->
        <div v-if="pkg.totalSize > 0" class="mb-2">
          <SProgress :percentage="pkg.progress" />
          <span class="is-size-7 has-text-grey"
            >{{ pkg.doneSize_fmt }} / {{ pkg.totalSize_fmt }} ({{
              pkg.progress.toFixed(1)
            }}%)</span
          >
        </div>

        <!-- Links table -->
        <STable
          :data="pkg.links"
          :columns="linkColumns"
          row-key="fid"
          size="sm"
          style="margin-top: 0.5rem"
        >
          <template #cell-status="{ row }">
            <STag :variant="statusVariant(row.statusCode)" size="sm">
              {{ row.status }}
            </STag>
          </template>
          <template #cell-progress="{ row }">
            <span>{{ row.progress.toFixed(1) }}%</span>
          </template>
          <template #cell-speed="{ row }">
            <span v-if="row.isDownloading" class="has-text-info">{{
              row.speed_fmt
            }}</span>
            <span v-else class="has-text-grey">—</span>
          </template>
          <template #empty>
            <span class="has-text-grey is-size-7">{{
              $t("pyload.noLinks")
            }}</span>
          </template>
        </STable>
      </div>
    </SLoading>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { pyloadRunning } = useServiceGuard();
const { t } = useI18n();
const { addToast } = useToast();

// ── Columns ──────────────────────────────────────────────────────────────────

const linkColumns = computed(() => [
  { prop: "name", label: t("pyload.columns.name"), sortable: true },
  { prop: "plugin", label: t("pyload.columns.plugin"), width: 120 },
  { prop: "size_fmt", label: t("pyload.columns.size"), width: 100 },
  {
    key: "progress",
    label: t("pyload.columns.progress"),
    width: 80,
    align: "right" as const,
  },
  {
    key: "speed",
    label: t("pyload.columns.speed"),
    width: 90,
    align: "right" as const,
  },
  { key: "status", label: t("pyload.columns.status"), width: 120 },
]);

// ── State ────────────────────────────────────────────────────────────────────

interface StatusData {
  paused: boolean;
  active: number;
  queue: number;
  speed_fmt: string;
  freeSpace_fmt: string | null;
  version: string | null;
}

interface LinkData {
  fid: number;
  name: string;
  plugin: string;
  size_fmt: string;
  done_fmt: string;
  progress: number;
  speed: number;
  speed_fmt: string;
  status: string;
  statusCode: number;
  isDownloading: boolean;
  isFailed: boolean;
  isFinished: boolean;
}

interface PackageData {
  pid: number;
  name: string;
  dest: string;
  linkCount: number;
  links: LinkData[];
  totalSize: number;
  totalSize_fmt: string;
  doneSize_fmt: string;
  progress: number;
  activeLinks: number;
  failedLinks: number;
  finishedLinks: number;
}

const status = ref<StatusData | null>(null);
const packages = ref<PackageData[]>([]);
const loadingPackages = ref(false);
const controlling = ref(false);
const adding = ref(false);

const newPackage = reactive({ name: "", links: "" });

let pollTimer: ReturnType<typeof setInterval> | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(
  code: number,
): "success" | "info" | "warning" | "danger" | "default" {
  if (code === 0) return "success"; // Finished
  if (code === 12) return "info"; // Downloading
  if (code === 8 || code === 1) return "danger"; // Failed / Offline
  if (code === 5 || code === 7) return "warning"; // Waiting / Starting
  return "default";
}

function destVariant(dest: string): "primary" | "info" {
  return dest === "queue" ? "primary" : "info";
}

// ── API calls ────────────────────────────────────────────────────────────────

async function fetchStatus() {
  try {
    const res = await apiFetch<any>("/api/pyload/status");
    if (!res?.connected || !res.status) {
      status.value = null;
      return;
    }
    status.value = {
      paused: res.status.paused,
      active: res.status.active,
      queue: res.status.queue,
      speed_fmt: res.status.speed_fmt,
      freeSpace_fmt: res.freeSpace_fmt,
      version: res.version,
    };
  } catch {
    status.value = null;
  }
}

async function fetchPackages() {
  try {
    const res = await apiFetch<any>("/api/pyload/packages");
    packages.value = res?.packages ?? [];
  } catch {
    /* silent */
  }
}

async function refresh() {
  if (!pyloadRunning.value) return;
  await Promise.all([fetchStatus(), fetchPackages()]);
}

async function control(action: string) {
  controlling.value = true;
  try {
    await apiFetch("/api/pyload/control", {
      method: "POST",
      body: { action },
    });
    await refresh();
    addToast(t("pyload.actionDone", { action }), "success");
  } catch (err: any) {
    addToast(err?.message ?? t("pyload.actionError"), "error");
  } finally {
    controlling.value = false;
  }
}

async function packageAction(action: string, pid: number) {
  try {
    await apiFetch("/api/pyload/packages", {
      method: "POST",
      body: action === "delete" ? { action, pids: [pid] } : { action, pid },
    });
    await refresh();
  } catch (err: any) {
    addToast(err?.message ?? t("pyload.actionError"), "error");
  }
}

async function addPackage() {
  const links = newPackage.links
    .split(/[\n\s,]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!newPackage.name.trim() || !links.length) return;

  adding.value = true;
  try {
    await apiFetch("/api/pyload/packages", {
      method: "POST",
      body: { action: "add", name: newPackage.name.trim(), links },
    });
    newPackage.name = "";
    newPackage.links = "";
    addToast(t("pyload.packageAdded"), "success");
    await refresh();
  } catch (err: any) {
    addToast(err?.message ?? t("pyload.addError"), "error");
  } finally {
    adding.value = false;
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  loadingPackages.value = true;
  await refresh();
  loadingPackages.value = false;
  pollTimer = setInterval(refresh, 5000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>
