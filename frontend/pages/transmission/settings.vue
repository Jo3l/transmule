<template>
  <SLoading id="page-transmission-settings" :loading="loading">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-cog mr-1" />
      {{ $t("transmission.settings.title") }}
    </h1>

    <STabs v-model="activeTab" variant="card" :panes="tabPanes">

      <!-- ── Speed ── -->
      <STabPane name="speed" :label="$t('transmission.speed.title')" :active="activeTab === 'speed'">
        <div class="box">
          <h6 class="title is-6 mb-3">{{ $t("transmission.speed.normal") }}</h6>

          <SFormItem :label="$t('transmission.speed.limitDown')">
            <SSwitch v-model="speed.dlEnabled" @update:model-value="saveSpeed" />
            <SInputNumber
              v-if="speed.dlEnabled"
              v-model="speed.dlSpeed"
              :min="0"
              :step="50"
              class="ml-3 w-160"
              @update:model-value="saveSpeed"
            />
            <span v-if="speed.dlEnabled" class="ml-2 has-text-grey is-size-7">{{
              $t("transmission.speed.kbs")
            }}</span>
          </SFormItem>

          <SFormItem :label="$t('transmission.speed.limitUp')">
            <SSwitch v-model="speed.ulEnabled" @update:model-value="saveSpeed" />
            <SInputNumber
              v-if="speed.ulEnabled"
              v-model="speed.ulSpeed"
              :min="0"
              :step="50"
              class="ml-3 w-160"
              @update:model-value="saveSpeed"
            />
            <span v-if="speed.ulEnabled" class="ml-2 has-text-grey is-size-7">{{
              $t("transmission.speed.kbs")
            }}</span>
          </SFormItem>

          <SDivider />

          <h6 class="title is-6 mb-3">
            <span class="mdi mdi-turtle mr-1" />{{ $t("transmission.speed.alt") }}
          </h6>

          <SFormItem :label="$t('transmission.speed.altEnabled')">
            <SSwitch v-model="speed.altEnabled" @update:model-value="saveSpeed" />
          </SFormItem>
          <SFormItem :label="$t('transmission.speed.altDown')">
            <SInputNumber
              v-model="speed.altDown"
              :min="0"
              :step="10"
              class="w-160"
              @update:model-value="saveSpeed"
            />
            <span class="ml-2 has-text-grey is-size-7">{{ $t("transmission.speed.kbs") }}</span>
          </SFormItem>
          <SFormItem :label="$t('transmission.speed.altUp')">
            <SInputNumber
              v-model="speed.altUp"
              :min="0"
              :step="10"
              class="w-160"
              @update:model-value="saveSpeed"
            />
            <span class="ml-2 has-text-grey is-size-7">{{ $t("transmission.speed.kbs") }}</span>
          </SFormItem>

          <SFormItem :label="$t('transmission.speed.scheduleAlt')">
            <SSwitch v-model="speed.altTimeEnabled" @update:model-value="saveSpeed" />
          </SFormItem>

          <template v-if="speed.altTimeEnabled">
            <SFormItem :label="$t('transmission.speed.startTime')">
              <SInputNumber
                v-model="speed.altTimeBegin"
                :min="0"
                :max="1439"
                class="w-160"
                @update:model-value="saveSpeed"
              />
              <span class="ml-2 has-text-grey is-size-7">{{ fmtTime(speed.altTimeBegin) }}</span>
            </SFormItem>
            <SFormItem :label="$t('transmission.speed.endTime')">
              <SInputNumber
                v-model="speed.altTimeEnd"
                :min="0"
                :max="1439"
                class="w-160"
                @update:model-value="saveSpeed"
              />
              <span class="ml-2 has-text-grey is-size-7">{{ fmtTime(speed.altTimeEnd) }}</span>
            </SFormItem>
            <SFormItem :label="$t('transmission.speed.scheduledDays')">
              <SSelect
                v-model="speed.altTimeDay"
                :options="dayOptions"
                class="w-200"
                @update:model-value="saveSpeed"
              />
            </SFormItem>
          </template>
        </div>
      </STabPane>

      <!-- ── Folders ── -->
      <STabPane name="folders" :label="$t('transmission.folders.title')" :active="activeTab === 'folders'">
        <div class="box">
          <SFormItem :label="$t('transmission.folders.startWhenAdded')">
            <SSwitch v-model="folders.startAdded" @update:model-value="saveFolders" />
          </SFormItem>
          <SFormItem :label="$t('transmission.folders.renamePartial')">
            <SSwitch v-model="folders.renamePartial" @update:model-value="saveFolders" />
          </SFormItem>
          <SFormItem :label="$t('transmission.folders.trashTorrent')">
            <SSwitch v-model="folders.trashOriginal" @update:model-value="saveFolders" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('transmission.folders.cacheSize')">
            <SInputNumber
              v-model="folders.cacheSizeMb"
              :min="0"
              :step="1"
              class="w-120"
              @update:model-value="saveFolders"
            />
            <span class="ml-2 has-text-grey is-size-7">{{ $t("transmission.folders.mb") }}</span>
          </SFormItem>

          <SDivider />

          <h6 class="title is-6 mb-3">{{ $t("transmission.folders.scriptSection") }}</h6>

          <SFormItem :label="$t('transmission.folders.runScript')">
            <SSwitch v-model="folders.scriptEnabled" @update:model-value="saveFolders" />
          </SFormItem>
          <SFormItem v-if="folders.scriptEnabled" :label="$t('transmission.folders.scriptPath')">
            <SInput
              v-model="folders.scriptFilename"
              :placeholder="$t('transmission.folders.scriptPlaceholder')"
              class="mw-400"
              @blur="saveFolders"
            />
          </SFormItem>
        </div>
      </STabPane>

      <!-- ── Sharing ── -->
      <STabPane name="sharing" :label="$t('transmission.sharing.title')" :active="activeTab === 'sharing'">
        <div class="box">
          <h6 class="title is-6 mb-3">{{ $t("transmission.sharing.seedRatio") }}</h6>
          <SFormItem :label="$t('transmission.sharing.stopAtRatio')">
            <SSwitch v-model="sharing.seedRatioLimited" @update:model-value="saveSharing" />
            <SInputNumber
              v-if="sharing.seedRatioLimited"
              v-model="sharing.seedRatioLimit"
              :min="0"
              :step="0.1"
              :precision="2"
              class="ml-3 w-140"
              @update:model-value="saveSharing"
            />
          </SFormItem>

          <SDivider />

          <h6 class="title is-6 mb-3">{{ $t("transmission.sharing.idleSeeding") }}</h6>
          <SFormItem :label="$t('transmission.sharing.stopIfIdle')">
            <SSwitch v-model="sharing.idleSeedingLimitEnabled" @update:model-value="saveSharing" />
            <SInputNumber
              v-if="sharing.idleSeedingLimitEnabled"
              v-model="sharing.idleSeedingLimit"
              :min="1"
              :step="5"
              class="ml-3 w-140"
              @update:model-value="saveSharing"
            />
            <span v-if="sharing.idleSeedingLimitEnabled" class="ml-2 has-text-grey is-size-7">{{
              $t("transmission.sharing.minutes")
            }}</span>
          </SFormItem>

          <SDivider />

          <h6 class="title is-6 mb-3">{{ $t("transmission.sharing.queue") }}</h6>
          <SFormItem :label="$t('transmission.sharing.limitDownQueue')">
            <SSwitch v-model="sharing.downloadQueueEnabled" @update:model-value="saveSharing" />
            <SInputNumber
              v-if="sharing.downloadQueueEnabled"
              v-model="sharing.downloadQueueSize"
              :min="1"
              :step="1"
              class="ml-3 w-120"
              @update:model-value="saveSharing"
            />
          </SFormItem>
          <SFormItem :label="$t('transmission.sharing.limitSeedQueue')">
            <SSwitch v-model="sharing.seedQueueEnabled" @update:model-value="saveSharing" />
            <SInputNumber
              v-if="sharing.seedQueueEnabled"
              v-model="sharing.seedQueueSize"
              :min="1"
              :step="1"
              class="ml-3 w-120"
              @update:model-value="saveSharing"
            />
          </SFormItem>
          <SFormItem :label="$t('transmission.sharing.stalledHandling')">
            <SSwitch v-model="sharing.queueStalledEnabled" @update:model-value="saveSharing" />
            <SInputNumber
              v-if="sharing.queueStalledEnabled"
              v-model="sharing.queueStalledMinutes"
              :min="1"
              :step="5"
              class="ml-3 w-120"
              @update:model-value="saveSharing"
            />
            <span v-if="sharing.queueStalledEnabled" class="ml-2 has-text-grey is-size-7">{{
              $t("transmission.sharing.minutesStalled")
            }}</span>
          </SFormItem>
        </div>
      </STabPane>

      <!-- ── Privacy ── -->
      <STabPane name="privacy" :label="$t('transmission.privacy.title')" :active="activeTab === 'privacy'">
        <div class="box">
          <h6 class="title is-6 mb-3">{{ $t("transmission.privacy.encryption") }}</h6>
          <SFormItem :label="$t('transmission.privacy.encryptionMode')">
            <SSelect
              v-model="privacy.encryption"
              :options="encryptionOptions"
              class="w-200"
              @update:model-value="savePrivacy"
            />
          </SFormItem>

          <SDivider />

          <h6 class="title is-6 mb-3">{{ $t("transmission.privacy.peerDiscovery") }}</h6>
          <SFormItem :label="$t('transmission.privacy.dht')">
            <SSwitch v-model="privacy.dhtEnabled" @update:model-value="savePrivacy" />
          </SFormItem>
          <SFormItem :label="$t('transmission.privacy.pex')">
            <SSwitch v-model="privacy.pexEnabled" @update:model-value="savePrivacy" />
          </SFormItem>
          <SFormItem :label="$t('transmission.privacy.lpd')">
            <SSwitch v-model="privacy.lpdEnabled" @update:model-value="savePrivacy" />
          </SFormItem>

          <SDivider />

          <h6 class="title is-6 mb-3">{{ $t("transmission.privacy.blocklist") }}</h6>
          <SFormItem :label="$t('transmission.privacy.enableBlocklist')">
            <SSwitch v-model="privacy.blocklistEnabled" @update:model-value="savePrivacy" />
          </SFormItem>
          <template v-if="privacy.blocklistEnabled">
            <SFormItem :label="$t('transmission.privacy.blocklistUrl')">
              <SInput
                v-model="privacy.blocklistUrl"
                placeholder="https://..."
                class="mw-400"
                @blur="savePrivacy"
              />
            </SFormItem>
            <SFormItem :label="$t('transmission.privacy.blocklistSize')">
              <span>{{ privacy.blocklistSize.toLocaleString() }} {{ $t("transmission.privacy.rules") }}</span>
              <SButton size="sm" class="ml-3" :loading="updatingBlocklist" @click="updateBlocklist">
                <span class="mdi mdi-refresh mr-1" />
                {{ $t("transmission.privacy.updateNow") }}
              </SButton>
            </SFormItem>
          </template>
        </div>
      </STabPane>

      <!-- ── Network ── -->
      <STabPane name="network" :label="$t('transmission.network.title')" :active="activeTab === 'network'">
        <div class="box">
          <h6 class="title is-6 mb-3">{{ $t("transmission.network.listeningPort") }}</h6>
          <SFormItem :label="$t('transmission.network.peerPort')">
            <SInputNumber
              v-model="network.peerPort"
              :min="1024"
              :max="65535"
              class="w-160"
              @update:model-value="saveNetwork"
            />
            <SButton size="sm" class="ml-3" :loading="testingPort" @click="testPort">
              <span class="mdi mdi-lan-check mr-1" />
              {{ $t("transmission.network.testPort") }}
            </SButton>
            <STag
              v-if="portTestResult !== null"
              :variant="portTestResult ? 'success' : 'danger'"
              size="sm"
              class="ml-2"
            >
              {{ portTestResult ? $t("transmission.network.open") : $t("transmission.network.closed") }}
            </STag>
          </SFormItem>
          <SFormItem :label="$t('transmission.network.randomizePort')">
            <SSwitch v-model="network.randomPort" @update:model-value="saveNetwork" />
          </SFormItem>
          <SFormItem :label="$t('transmission.network.enablePortForwarding')">
            <SSwitch v-model="network.portForwarding" @update:model-value="saveNetwork" />
          </SFormItem>

          <SDivider />

          <h6 class="title is-6 mb-3">{{ $t("transmission.network.protocol") }}</h6>
          <SFormItem :label="$t('transmission.network.enableUtp')">
            <SSwitch v-model="network.utpEnabled" @update:model-value="saveNetwork" />
          </SFormItem>

          <SDivider />

          <h6 class="title is-6 mb-3">{{ $t("transmission.network.peerLimits") }}</h6>
          <SFormItem :label="$t('transmission.network.globalPeerLimit')">
            <SInputNumber
              v-model="network.peerLimitGlobal"
              :min="1"
              :step="10"
              class="w-160"
              @update:model-value="saveNetwork"
            />
          </SFormItem>
          <SFormItem :label="$t('transmission.network.perTorrentPeerLimit')">
            <SInputNumber
              v-model="network.peerLimitPerTorrent"
              :min="1"
              :step="5"
              class="w-160"
              @update:model-value="saveNetwork"
            />
          </SFormItem>
        </div>
      </STabPane>

    </STabs>
  </SLoading>
</template>

<script setup lang="ts">
import type { TabPaneDef } from "~/components/s/STabs.vue";

const { apiFetch, showToast } = useApi();
const { transmissionRunning } = useServiceGuard();
const { t } = useI18n();

const activeTab = ref("speed");
const loading = ref(true);
const updatingBlocklist = ref(false);
const testingPort = ref(false);
const portTestResult = ref<boolean | null>(null);

const timers: Record<string, ReturnType<typeof setTimeout> | null> = {
  speed: null,
  folders: null,
  sharing: null,
  privacy: null,
  network: null,
};

function debounce(key: string, fn: () => void) {
  if (timers[key]) clearTimeout(timers[key]!);
  timers[key] = setTimeout(fn, 600);
}

// ── Tab panes ────────────────────────────────────────────────────────────────

const tabPanes = computed<TabPaneDef[]>(() => [
  { name: "speed", label: t("transmission.speed.title") },
  { name: "folders", label: t("transmission.folders.title") },
  { name: "sharing", label: t("transmission.sharing.title") },
  { name: "privacy", label: t("transmission.privacy.title") },
  { name: "network", label: t("transmission.network.title") },
]);

// ── Speed ────────────────────────────────────────────────────────────────────

const speed = reactive({
  dlEnabled: false, dlSpeed: 0,
  ulEnabled: false, ulSpeed: 0,
  altEnabled: false, altDown: 0, altUp: 0,
  altTimeEnabled: false, altTimeBegin: 0, altTimeEnd: 0, altTimeDay: 127,
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

function saveSpeed() {
  debounce("speed", async () => {
    await apiFetch("/api/transmission/session", {
      method: "POST",
      body: {
        "speed-limit-down-enabled": speed.dlEnabled,
        "speed-limit-down": speed.dlSpeed,
        "speed-limit-up-enabled": speed.ulEnabled,
        "speed-limit-up": speed.ulSpeed,
        "alt-speed-enabled": speed.altEnabled,
        "alt-speed-down": speed.altDown,
        "alt-speed-up": speed.altUp,
        "alt-speed-time-enabled": speed.altTimeEnabled,
        "alt-speed-time-begin": speed.altTimeBegin,
        "alt-speed-time-end": speed.altTimeEnd,
        "alt-speed-time-day": speed.altTimeDay,
      },
    });
  });
}

// ── Folders ──────────────────────────────────────────────────────────────────

const folders = reactive({
  startAdded: true, renamePartial: true, trashOriginal: false,
  cacheSizeMb: 4, scriptEnabled: false, scriptFilename: "",
});

function saveFolders() {
  debounce("folders", async () => {
    await apiFetch("/api/transmission/session", {
      method: "POST",
      body: {
        "start-added-torrents": folders.startAdded,
        "rename-partial-files": folders.renamePartial,
        "trash-original-torrent-files": folders.trashOriginal,
        "cache-size-mb": folders.cacheSizeMb,
        "script-torrent-done-enabled": folders.scriptEnabled,
        "script-torrent-done-filename": folders.scriptFilename,
      },
    });
  });
}

// ── Sharing ──────────────────────────────────────────────────────────────────

const sharing = reactive({
  seedRatioLimited: false, seedRatioLimit: 2.0,
  idleSeedingLimitEnabled: false, idleSeedingLimit: 30,
  downloadQueueEnabled: true, downloadQueueSize: 5,
  seedQueueEnabled: false, seedQueueSize: 10,
  queueStalledEnabled: true, queueStalledMinutes: 30,
});

function saveSharing() {
  debounce("sharing", async () => {
    await apiFetch("/api/transmission/session", {
      method: "POST",
      body: {
        seedRatioLimited: sharing.seedRatioLimited,
        seedRatioLimit: sharing.seedRatioLimit,
        "idle-seeding-limit-enabled": sharing.idleSeedingLimitEnabled,
        "idle-seeding-limit": sharing.idleSeedingLimit,
        "download-queue-enabled": sharing.downloadQueueEnabled,
        "download-queue-size": sharing.downloadQueueSize,
        "seed-queue-enabled": sharing.seedQueueEnabled,
        "seed-queue-size": sharing.seedQueueSize,
        "queue-stalled-enabled": sharing.queueStalledEnabled,
        "queue-stalled-minutes": sharing.queueStalledMinutes,
      },
    });
  });
}

// ── Privacy ──────────────────────────────────────────────────────────────────

const privacy = reactive({
  encryption: "preferred",
  dhtEnabled: true, pexEnabled: true, lpdEnabled: false,
  blocklistEnabled: false, blocklistUrl: "", blocklistSize: 0,
});

const encryptionOptions = computed(() => [
  { label: t("transmission.privacy.preferEncryption"), value: "preferred" },
  { label: t("transmission.privacy.requireEncryption"), value: "required" },
  { label: t("transmission.privacy.allowUnencrypted"), value: "tolerated" },
]);

function savePrivacy() {
  debounce("privacy", async () => {
    await apiFetch("/api/transmission/session", {
      method: "POST",
      body: {
        encryption: privacy.encryption,
        "dht-enabled": privacy.dhtEnabled,
        "pex-enabled": privacy.pexEnabled,
        "lpd-enabled": privacy.lpdEnabled,
        "blocklist-enabled": privacy.blocklistEnabled,
        "blocklist-url": privacy.blocklistUrl,
      },
    });
  });
}

async function updateBlocklist() {
  updatingBlocklist.value = true;
  try {
    const res = await apiFetch<any>("/api/transmission/session", {
      method: "POST",
      body: { _action: "blocklist-update" },
    });
    privacy.blocklistSize = res.blocklistSize || 0;
    showToast(
      t("transmission.privacy.blocklistUpdated", { n: privacy.blocklistSize.toLocaleString() }),
      "success",
    );
  } finally {
    updatingBlocklist.value = false;
  }
}

// ── Network ──────────────────────────────────────────────────────────────────

const network = reactive({
  peerPort: 51413, randomPort: false, portForwarding: true,
  utpEnabled: true, peerLimitGlobal: 200, peerLimitPerTorrent: 50,
});

function saveNetwork() {
  debounce("network", async () => {
    await apiFetch("/api/transmission/session", {
      method: "POST",
      body: {
        "peer-port": network.peerPort,
        "peer-port-random-on-start": network.randomPort,
        "port-forwarding-enabled": network.portForwarding,
        "utp-enabled": network.utpEnabled,
        "peer-limit-global": network.peerLimitGlobal,
        "peer-limit-per-torrent": network.peerLimitPerTorrent,
      },
    });
  });
}

async function testPort() {
  testingPort.value = true;
  portTestResult.value = null;
  try {
    const res = await apiFetch<any>("/api/transmission/session", {
      method: "POST",
      body: { _action: "port-test" },
    });
    portTestResult.value = res.portIsOpen ?? false;
    showToast(
      res.portIsOpen ? t("transmission.network.portOpen") : t("transmission.network.portClosed"),
      res.portIsOpen ? "success" : "warning",
    );
  } finally {
    testingPort.value = false;
  }
}

// ── Load session ─────────────────────────────────────────────────────────────

async function fetchSession() {
  if (!transmissionRunning.value) return;
  loading.value = true;
  try {
    const { raw } = await apiFetch<any>("/api/transmission/session");

    // Speed
    speed.dlEnabled = raw["speed-limit-down-enabled"] ?? false;
    speed.dlSpeed = raw["speed-limit-down"] ?? 0;
    speed.ulEnabled = raw["speed-limit-up-enabled"] ?? false;
    speed.ulSpeed = raw["speed-limit-up"] ?? 0;
    speed.altEnabled = raw["alt-speed-enabled"] ?? false;
    speed.altDown = raw["alt-speed-down"] ?? 0;
    speed.altUp = raw["alt-speed-up"] ?? 0;
    speed.altTimeEnabled = raw["alt-speed-time-enabled"] ?? false;
    speed.altTimeBegin = raw["alt-speed-time-begin"] ?? 0;
    speed.altTimeEnd = raw["alt-speed-time-end"] ?? 0;
    speed.altTimeDay = raw["alt-speed-time-day"] ?? 127;

    // Folders
    folders.startAdded = raw["start-added-torrents"] ?? true;
    folders.renamePartial = raw["rename-partial-files"] ?? true;
    folders.trashOriginal = raw["trash-original-torrent-files"] ?? false;
    folders.cacheSizeMb = raw["cache-size-mb"] ?? 4;
    folders.scriptEnabled = raw["script-torrent-done-enabled"] ?? false;
    folders.scriptFilename = raw["script-torrent-done-filename"] || "";

    // Sharing
    sharing.seedRatioLimited = raw["seed-ratio-limited"] ?? false;
    sharing.seedRatioLimit = raw["seed-ratio-limit"] ?? 2.0;
    sharing.idleSeedingLimitEnabled = raw["idle-seeding-limit-enabled"] ?? false;
    sharing.idleSeedingLimit = raw["idle-seeding-limit"] ?? 30;
    sharing.downloadQueueEnabled = raw["download-queue-enabled"] ?? true;
    sharing.downloadQueueSize = raw["download-queue-size"] ?? 5;
    sharing.seedQueueEnabled = raw["seed-queue-enabled"] ?? false;
    sharing.seedQueueSize = raw["seed-queue-size"] ?? 10;
    sharing.queueStalledEnabled = raw["queue-stalled-enabled"] ?? true;
    sharing.queueStalledMinutes = raw["queue-stalled-minutes"] ?? 30;

    // Privacy
    privacy.encryption = raw.encryption || "preferred";
    privacy.dhtEnabled = raw["dht-enabled"] ?? true;
    privacy.pexEnabled = raw["pex-enabled"] ?? true;
    privacy.lpdEnabled = raw["lpd-enabled"] ?? false;
    privacy.blocklistEnabled = raw["blocklist-enabled"] ?? false;
    privacy.blocklistUrl = raw["blocklist-url"] || "";
    privacy.blocklistSize = raw["blocklist-size"] || 0;

    // Network
    network.peerPort = raw["peer-port"] ?? 51413;
    network.randomPort = raw["peer-port-random-on-start"] ?? false;
    network.portForwarding = raw["port-forwarding-enabled"] ?? true;
    network.utpEnabled = raw["utp-enabled"] ?? true;
    network.peerLimitGlobal = raw["peer-limit-global"] ?? 200;
    network.peerLimitPerTorrent = raw["peer-limit-per-torrent"] ?? 50;
  } finally {
    loading.value = false;
  }
}

onMounted(() => fetchSession());
</script>

