<template>
  <SLoading id="page-amule-settings" :loading="loading">
    <h1 class="title is-4 mb-4">{{ $t("amuleSettings.title") }}</h1>

    <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>
    <SAlert v-if="saved" variant="success" class="mb-4">{{
      $t("amuleSettings.saved")
    }}</SAlert>

    <STabs v-model="activeTab" variant="card" :panes="tabPanes">
      <!-- General -->
      <STabPane
        name="general"
        :label="$t('amuleSettings.general')"
        :active="activeTab === 'general'"
      >
        <div class="box">
          <SFormItem :label="$t('amuleSettings.userNick')">
            <SInput v-model="form.general.userNick" class="mw-400" />
          </SFormItem>

          <SDivider />

          <SButton variant="primary" :loading="saving" @click="save('general')">
            <span class="mdi mdi-content-save mr-1" />
            {{ $t("amuleSettings.save") }}
          </SButton>
        </div>
      </STabPane>

      <!-- Connection -->
      <STabPane
        name="connection"
        :label="$t('amuleSettings.connection')"
        :active="activeTab === 'connection'"
      >
        <div class="box">
          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.downloadCapacity')">
                <SInput
                  v-model.number="form.connection.downloadCapacity"
                  type="number"
                  class="mw-200"
                />
                <p class="is-size-7 has-text-grey mt-1">
                  {{ $t("amuleSettings.capacityHelp") }}
                </p>
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.uploadCapacity')">
                <SInput
                  v-model.number="form.connection.uploadCapacity"
                  type="number"
                  class="mw-200"
                />
                <p class="is-size-7 has-text-grey mt-1">
                  {{ $t("amuleSettings.capacityHelp") }}
                </p>
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.maxDownloadSpeed')">
                <SInput
                  v-model.number="form.connection.maxDownloadSpeed"
                  type="number"
                  class="mw-200"
                />
                <p class="is-size-7 has-text-grey mt-1">
                  {{ $t("amuleSettings.speedLimitHelp") }}
                </p>
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.maxUploadSpeed')">
                <SInput
                  v-model.number="form.connection.maxUploadSpeed"
                  type="number"
                  class="mw-200"
                />
                <p class="is-size-7 has-text-grey mt-1">
                  {{ $t("amuleSettings.speedLimitHelp") }}
                </p>
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.maxFileSources')">
                <SInput
                  v-model.number="form.connection.maxFileSources"
                  type="number"
                  class="w-160"
                />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.maxConnections')">
                <SInput
                  v-model.number="form.connection.maxConnections"
                  type="number"
                  class="w-160"
                />
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.slotAllocation')">
            <SInput
              v-model.number="form.connection.slotAllocation"
              type="number"
              class="w-160"
            />
          </SFormItem>

          <SDivider />

          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.autoconnect')">
                <SSwitch v-model="form.connection.autoconnect" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.reconnect')">
                <SSwitch v-model="form.connection.reconnect" />
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.networkED2K')">
                <SSwitch v-model="form.connection.networkED2K" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('amuleSettings.networkKademlia')">
                <SSwitch v-model="form.connection.networkKademlia" />
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <SButton
            variant="primary"
            :loading="saving"
            @click="save('connection')"
          >
            <span class="mdi mdi-content-save mr-1" />
            {{ $t("amuleSettings.save") }}
          </SButton>
        </div>
      </STabPane>

      <!-- Servers -->
      <STabPane
        name="servers"
        :label="$t('amuleSettings.servers')"
        :active="activeTab === 'servers'"
      >
        <div class="box">
          <SFormItem :label="$t('amuleSettings.removeDead')">
            <SSwitch v-model="form.servers.removeDead" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.deadRetries')">
            <SInput
              v-model.number="form.servers.deadRetries"
              type="number"
              class="w-120"
            />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.useScoreSystem')">
            <SSwitch v-model="form.servers.useScoreSystem" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.smartIdCheck')">
            <SSwitch v-model="form.servers.smartIdCheck" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.updateUrl')">
            <SInput v-model="form.servers.updateUrl" class="mw-500" />
          </SFormItem>

          <SDivider />

          <SButton variant="primary" :loading="saving" @click="save('servers')">
            <span class="mdi mdi-content-save mr-1" />
            {{ $t("amuleSettings.save") }}
          </SButton>
        </div>
      </STabPane>

      <!-- Security -->
      <STabPane
        name="security"
        :label="$t('amuleSettings.security')"
        :active="activeTab === 'security'"
      >
        <div class="box">
          <SFormItem :label="$t('amuleSettings.canSeeShares')">
            <SSelect
              v-model="form.security.canSeeShares"
              :number="true"
            >
              <option :value="0">{{ $t("amuleSettings.sharesNobody") }}</option>
              <option :value="1">
                {{ $t("amuleSettings.sharesFriends") }}
              </option>
              <option :value="2">
                {{ $t("amuleSettings.sharesEveryone") }}
              </option>
            </SSelect>
          </SFormItem>

          <SDivider />

          <h3 class="subtitle is-6">
            {{ $t("amuleSettings.ipFilter") }}
          </h3>

          <div class="columns is-multiline">
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.ipFilterClients')">
                <SSwitch v-model="form.security.ipFilterClients" />
              </SFormItem>
            </div>
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.ipFilterServers')">
                <SSwitch v-model="form.security.ipFilterServers" />
              </SFormItem>
            </div>
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.filterLan')">
                <SSwitch v-model="form.security.filterLan" />
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.ipFilterAutoUpdate')">
            <SSwitch v-model="form.security.ipFilterAutoUpdate" />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.ipFilterUpdateUrl')">
            <SInput
              v-model="form.security.ipFilterUpdateUrl"
              class="mw-500"
            />
          </SFormItem>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.ipFilterLevel')">
            <SInput
              v-model.number="form.security.ipFilterLevel"
              type="number"
              class="w-120"
            />
            <p class="is-size-7 has-text-grey mt-1">
              {{ $t("amuleSettings.ipFilterLevelHelp") }}
            </p>
          </SFormItem>

          <SDivider />

          <h3 class="subtitle is-6">
            {{ $t("amuleSettings.protocolObfuscation") }}
          </h3>

          <div class="columns is-multiline">
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.obfuscationSupported')">
                <SSwitch v-model="form.security.obfuscationSupported" />
              </SFormItem>
            </div>
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.obfuscationRequested')">
                <SSwitch v-model="form.security.obfuscationRequested" />
              </SFormItem>
            </div>
            <div class="column is-4">
              <SFormItem :label="$t('amuleSettings.obfuscationRequired')">
                <SSwitch v-model="form.security.obfuscationRequired" />
              </SFormItem>
            </div>
          </div>

          <SDivider />

          <SFormItem :label="$t('amuleSettings.useSecIdent')">
            <SSwitch v-model="form.security.useSecIdent" />
          </SFormItem>

          <SDivider />

          <SButton
            variant="primary"
            :loading="saving"
            @click="save('security')"
          >
            <span class="mdi mdi-content-save mr-1" />
            {{ $t("amuleSettings.save") }}
          </SButton>
        </div>
      </STabPane>
    </STabs>
  </SLoading>
</template>

<script setup lang="ts">
import type { TabPaneDef } from "~/components/s/STabs.vue";

interface PrefsGeneral {
  userNick: string;
  checkNewVersion: boolean;
}
interface PrefsConnection {
  uploadCapacity: number;
  downloadCapacity: number;
  maxUploadSpeed: number;
  maxDownloadSpeed: number;
  slotAllocation: number;
  maxFileSources: number;
  maxConnections: number;
  autoconnect: boolean;
  reconnect: boolean;
  networkED2K: boolean;
  networkKademlia: boolean;
}
interface PrefsServers {
  removeDead: boolean;
  deadRetries: number;
  useScoreSystem: boolean;
  smartIdCheck: boolean;
  updateUrl: string;
}
interface PrefsSecurity {
  canSeeShares: number;
  ipFilterClients: boolean;
  ipFilterServers: boolean;
  ipFilterAutoUpdate: boolean;
  ipFilterUpdateUrl: string;
  ipFilterLevel: number;
  filterLan: boolean;
  useSecIdent: boolean;
  obfuscationSupported: boolean;
  obfuscationRequested: boolean;
  obfuscationRequired: boolean;
}
interface AmulePreferences {
  general: PrefsGeneral;
  connection: PrefsConnection;
  servers: PrefsServers;
  security: PrefsSecurity;
}

const { t } = useI18n();
const { apiFetch } = useApi();

const activeTab = ref("general");
const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const errorMsg = ref("");

const form = reactive<AmulePreferences>({
  general: {
    userNick: "",
    checkNewVersion: false,
  },
  connection: {
    uploadCapacity: 100,
    downloadCapacity: 300,
    maxUploadSpeed: 0,
    maxDownloadSpeed: 0,
    slotAllocation: 2,
    maxFileSources: 300,
    maxConnections: 500,
    autoconnect: false,
    reconnect: false,
    networkED2K: true,
    networkKademlia: false,
  },
  servers: {
    removeDead: true,
    deadRetries: 3,
    useScoreSystem: true,
    smartIdCheck: true,
    updateUrl: "",
  },
  security: {
    canSeeShares: 2,
    ipFilterClients: true,
    ipFilterServers: true,
    ipFilterAutoUpdate: false,
    ipFilterUpdateUrl: "",
    ipFilterLevel: 127,
    filterLan: true,
    useSecIdent: true,
    obfuscationSupported: true,
    obfuscationRequested: false,
    obfuscationRequired: false,
  },
});

const tabPanes = computed<TabPaneDef[]>(() => [
  { name: "general", label: t("amuleSettings.general") },
  { name: "connection", label: t("amuleSettings.connection") },
  { name: "servers", label: t("amuleSettings.servers") },
  { name: "security", label: t("amuleSettings.security") },
]);

async function loadPrefs() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const data = await apiFetch<AmulePreferences>("/api/amule/prefs");
    if (data.general) Object.assign(form.general, data.general);
    if (data.connection) Object.assign(form.connection, data.connection);
    if (data.servers) Object.assign(form.servers, data.servers);
    if (data.security) Object.assign(form.security, data.security);
  } catch (e: any) {
    errorMsg.value = e?.data?.message || e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

async function save(section: keyof AmulePreferences) {
  saving.value = true;
  saved.value = false;
  errorMsg.value = "";
  try {
    await apiFetch("/api/amule/prefs", {
      method: "POST",
      body: { [section]: form[section] },
    });
    saved.value = true;
    setTimeout(() => {
      saved.value = false;
    }, 3000);
  } catch (e: any) {
    errorMsg.value = e?.data?.message || e?.message || String(e);
  } finally {
    saving.value = false;
  }
}

onMounted(() => loadPrefs());
</script>

