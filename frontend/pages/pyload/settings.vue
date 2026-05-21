<template>
  <SLoading id="page-pyload-settings" :loading="loading">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-cog mr-1" />
      {{ $t("pyloadSettings.title") }}
    </h1>

    <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>
    <SAlert v-if="saved" variant="success" class="mb-4">{{ $t("pyloadSettings.saved") }}</SAlert>

    <STabs v-model="activeTab" :panes="tabPanes">
      <template #tab-downloads>
        <span class="mdi mdi-download mr-1" />
        {{ $t("pyloadSettings.downloads") }}
      </template>
      <STabPane
        name="downloads"
        :active="activeTab === 'downloads'"
      >
        <div class="box">
          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.downloadFields.chunks')">
                <SInputNumber v-model="downloadForm.chunks" :min="1" :step="1" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.downloadFields.maxDownloads')">
                <SInputNumber v-model="downloadForm.maxDownloads" :min="1" :step="1" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.downloadFields.maxSpeed')">
                <SInputNumber v-model="downloadForm.maxSpeed" :min="-1" :step="10" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.downloadFields.limitSpeed')">
                <SSwitch v-model="downloadForm.limitSpeed" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.downloadFields.interface')">
                <SInput v-model="downloadForm.interface" class="mw-320" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.downloadFields.ipv6')">
                <SSwitch v-model="downloadForm.ipv6" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.downloadFields.skipExisting')">
                <SSwitch v-model="downloadForm.skipExisting" />
              </SFormItem>
            </div>
            <div class="column is-6" />
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.downloadFields.startTime')">
                <SInput v-model="downloadForm.startTime" class="mw-200" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.downloadFields.endTime')">
                <SInput v-model="downloadForm.endTime" class="mw-200" />
              </SFormItem>
            </div>
          </div>

          <p class="has-text-grey is-size-7 mb-4">
            {{ $t("pyloadSettings.downloadHint") }}
          </p>

          <div class="flex-end">
            <SButton variant="primary" :loading="saving" @click="saveDownloads">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t("settings.save") }}
            </SButton>
          </div>
        </div>
      </STabPane>

      <template #tab-proxy>
        <span class="mdi mdi-web mr-1" />
        {{ $t("pyloadSettings.proxy") }}
      </template>
      <STabPane name="proxy" :active="activeTab === 'proxy'">
        <div class="box">
          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.proxyFields.enabled')">
                <SSwitch v-model="proxyForm.enabled" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.proxyFields.type')">
                <SSelect v-model="proxyForm.type" :options="proxyTypeOptions" class="mw-200" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.proxyFields.host')">
                <SInput v-model="proxyForm.host" class="mw-320" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.proxyFields.port')">
                <SInputNumber v-model="proxyForm.port" :min="0" :step="1" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.proxyFields.socksResolveDns')">
                <SSwitch v-model="proxyForm.socksResolveDns" />
              </SFormItem>
            </div>
            <div class="column is-6" />
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.proxyFields.username')">
                <SInput v-model="proxyForm.username" class="mw-320" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.proxyFields.password')">
                <SInput v-model="proxyForm.password" type="password" class="mw-320" />
              </SFormItem>
            </div>
          </div>

          <p class="has-text-grey is-size-7 mb-4">
            {{ $t("pyloadSettings.proxyHint") }}
          </p>

          <div class="flex-end">
            <SButton variant="primary" :loading="saving" @click="saveProxy">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t("settings.save") }}
            </SButton>
          </div>
        </div>
      </STabPane>

      <template #tab-reconnection>
        <span class="mdi mdi-lan-disconnect mr-1" />
        {{ $t("pyloadSettings.reconnection") }}
      </template>
      <STabPane
        name="reconnection"
        :active="activeTab === 'reconnection'"
      >
        <div class="box">
          <div class="columns is-multiline">
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.reconnectionFields.enabled')">
                <SSwitch v-model="reconnectionForm.enabled" />
              </SFormItem>
            </div>
            <div class="column is-6" />
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.reconnectionFields.script')">
                <SInput v-model="reconnectionForm.script" class="mw-320" />
              </SFormItem>
            </div>
            <div class="column is-6" />
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.reconnectionFields.startTime')">
                <SInput v-model="reconnectionForm.startTime" class="mw-200" />
              </SFormItem>
            </div>
            <div class="column is-6">
              <SFormItem :label="$t('pyloadSettings.reconnectionFields.endTime')">
                <SInput v-model="reconnectionForm.endTime" class="mw-200" />
              </SFormItem>
            </div>
          </div>

          <p class="has-text-grey is-size-7 mb-4">
            {{ $t("pyloadSettings.reconnectionHint") }}
          </p>

          <div class="flex-end">
            <SButton variant="primary" :loading="saving" @click="saveReconnection">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t("settings.save") }}
            </SButton>
          </div>
        </div>
      </STabPane>

      <template #tab-plugins>
        <span class="mdi mdi-puzzle mr-1" />
        {{ $t("pyloadSettings.plugins") }}
      </template>
      <STabPane
        name="plugins"
        :active="activeTab === 'plugins'"
      >
        <div class="box">
          <div class="pyload-plugin-layout">
            <div class="pyload-plugin-sidebar">
              <SFormItem :label="$t('pyloadSettings.pluginsSearch')">
                <SInput v-model="pluginQuery" :placeholder="$t('pyloadSettings.pluginsSearch')" />
              </SFormItem>

              <div
                v-if="filteredPlugins.length === 0"
                class="pyload-plugin-empty has-text-grey is-size-7"
              >
                {{ $t("pyloadSettings.pluginsEmpty") }}
              </div>

              <button
                v-for="plugin in filteredPlugins"
                :key="plugin.name"
                type="button"
                class="pyload-plugin-item"
                :class="{ 'is-active': plugin.name === selectedPluginName }"
                @click="selectedPluginName = plugin.name"
              >
                {{ plugin.name }}
              </button>
            </div>

            <div class="pyload-plugin-detail">
              <template v-if="selectedPlugin">
                <h3 class="title is-6 mb-2">{{ selectedPlugin.description }}</h3>
                <p v-if="selectedPlugin.outline" class="has-text-grey is-size-7 mb-4">
                  {{ selectedPlugin.outline }}
                </p>

                <div class="columns is-multiline">
                  <div
                    v-for="field in selectedPlugin.fields"
                    :key="`${selectedPlugin.name}-${field.key}`"
                    class="column is-6"
                  >
                    <SFormItem :label="field.label">
                      <SSwitch v-if="isBooleanField(field)" v-model="field.value" />
                      <SSelect
                        v-else-if="isSelectField(field)"
                        :model-value="String(field.value ?? '')"
                        @update:model-value="onPluginSelectChange(field, $event)"
                        :options="field.options.map((option) => ({ label: option, value: option }))"
                        class="mw-320"
                      />
                      <SInputNumber
                        v-else-if="isNumericField(field)"
                        :model-value="Number(field.value ?? 0)"
                        @update:model-value="onPluginNumberChange(field, $event)"
                      />
                      <SInput
                        v-else
                        :model-value="String(field.value ?? '')"
                        @update:model-value="onPluginInputChange(field, $event)"
                        :type="isPasswordField(field) ? 'password' : 'text'"
                        class="mw-320"
                      />
                    </SFormItem>
                  </div>
                </div>

                <div class="flex-end">
                  <SButton variant="primary" :loading="saving" @click="saveSelectedPlugin">
                    {{ $t("settings.save") }}
                  </SButton>
                </div>
              </template>

              <div v-else class="has-text-grey is-size-7">
                {{ $t("pyloadSettings.pluginsChoose") }}
              </div>
            </div>
          </div>

          <p class="has-text-grey is-size-7 mt-4">
            {{ $t("pyloadSettings.pluginsHint") }}
          </p>
        </div>
      </STabPane>

      <template #tab-accounts>
        <span class="mdi mdi-account-group mr-1" />
        {{ $t("pyloadSettings.accounts") }}
      </template>
      <STabPane
        name="accounts"
        :active="activeTab === 'accounts'"
      >
        <div class="box">
          <div class="table-container">
            <table class="table is-fullwidth is-striped is-hoverable">
              <thead>
                <tr>
                  <th>{{ $t("pyloadSettings.accountsFields.plugin") }}</th>
                  <th>{{ $t("pyloadSettings.accountsFields.name") }}</th>
                  <th>{{ $t("pyloadSettings.accountsFields.password") }}</th>
                  <th>{{ $t("pyloadSettings.accountsFields.status") }}</th>
                  <th>{{ $t("pyloadSettings.accountsFields.premium") }}</th>
                  <th>{{ $t("pyloadSettings.accountsFields.validUntil") }}</th>
                  <th>{{ $t("pyloadSettings.accountsFields.trafficLeft") }}</th>
                  <th>{{ $t("pyloadSettings.accountsFields.time") }}</th>
                  <th>{{ $t("pyloadSettings.accountsFields.maxParallel") }}</th>
                  <th class="accounts-actions-col"></th>
                  <th class="accounts-actions-col"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="account in accounts" :key="`${account.type}:${account.login}`">
                  <td>{{ account.type }}</td>
                  <td>{{ account.login }}</td>
                  <td>••••••••</td>
                  <td>{{ account.valid ? $t("common.enabled") : $t("common.disabled") }}</td>
                  <td>{{ account.premium ? $t("common.yes") : $t("common.no") }}</td>
                  <td>{{ formatValidUntil(account.validuntil) }}</td>
                  <td>{{ formatTrafficLeft(account.trafficleft) }}</td>
                  <td>{{ account.time || "-" }}</td>
                  <td>{{ account.maxParallel || "0" }}</td>
                  <td class="accounts-actions-col">
                    <SButton size="sm" variant="info" @click="openEditAccount(account)">
                      {{ $t("pyloadSettings.editAccount") }}
                    </SButton>
                  </td>
                  <td class="accounts-actions-col">
                    <SButton
                      size="sm"
                      variant="danger"
                      :loading="deletingAccountKey === `${account.type}:${account.login}`"
                      @click="deleteAccount(account)"
                    >
                      {{ $t("pyloadSettings.deleteAccount") }}
                    </SButton>
                  </td>
                </tr>
                <tr v-if="accounts.length === 0">
                  <td colspan="11" class="has-text-grey">
                    {{ $t("pyloadConfig.noAccounts") }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex-end mt-4">
            <SButton variant="primary" @click="openAddAccount">
              <span class="mdi mdi-plus mr-1" />
              {{ $t("pyloadSettings.addAccount") }}
            </SButton>
          </div>
        </div>
      </STabPane>

      <template #tab-logs>
        <span class="mdi mdi-text-box-outline mr-1" />
        {{ $t("pyloadLogs.title") }}
      </template>
      <!-- ── Logs tab ──────────────────────────────────── -->
      <STabPane
        name="logs"
        :active="activeTab === 'logs'"
      >
        <SLoading :loading="logInitialLoading">
          <SAlert v-if="logErrorMsg" variant="error" class="mb-4">{{ logErrorMsg }}</SAlert>

          <div class="box mb-4">
            <div class="columns is-multiline">
              <div class="column is-5">
                <SFormItem :label="$t('pyloadLogs.search')">
                  <SInput v-model="logSearchText" :placeholder="$t('pyloadLogs.searchPlaceholder')" />
                </SFormItem>
              </div>
              <div class="column is-3">
                <SFormItem :label="$t('pyloadLogs.level')">
                  <SSelect v-model="logSelectedLevel" :options="logLevelOptions" class="mw-200" />
                </SFormItem>
              </div>
              <div class="column is-2">
                <SFormItem :label="$t('pyloadLogs.limit')">
                  <SInputNumber v-model="logLineLimit" :min="10" :step="50" />
                </SFormItem>
              </div>
              <div class="column is-2">
                <SFormItem :label="$t('pyloadLogs.interval')">
                  <SSelect v-model="logRefreshMs" :options="logIntervalOptions" class="mw-200" />
                </SFormItem>
              </div>
            </div>

            <div class="flex-end">
              <SCheckbox v-model="logAutoRefresh">{{ $t("pyloadLogs.autoRefresh") }}</SCheckbox>
            </div>
          </div>

          <div class="box">
            <div class="flex-row gap-sm align-center mb-3">
              <span class="has-text-grey is-size-7">
                {{ $t("pyloadLogs.source") }}: <strong>{{ logSourceLabel }}</strong>
              </span>
              <span class="has-text-grey is-size-7">
                {{ $t("pyloadLogs.updated") }}: <strong>{{ logLastUpdated || "-" }}</strong>
              </span>
            </div>

            <div v-if="logFilteredItems.length === 0" class="has-text-grey is-size-7">
              {{ $t("pyloadLogs.empty") }}
            </div>

            <div v-else class="log-content">
              <div
                v-for="entry in logFilteredItems"
                :key="entry.id"
                class="log-line"
                :class="`is-${entry.level}`"
              >
                <span class="log-ts">{{ entry.timestamp }}</span>
                <span class="log-level">{{ entry.level.toUpperCase() }}</span>
                <span class="log-msg">{{ entry.message }}</span>
              </div>
            </div>
          </div>
        </SLoading>
      </STabPane>
    </STabs>

    <SDialog
      v-model="showAccountDialog"
      :title="
        editingAccount
          ? $t('pyloadSettings.editAccountTitle')
          : $t('pyloadSettings.addAccountTitle')
      "
      width="560px"
    >
      <p class="is-size-7 has-text-grey mb-4">
        {{ $t("pyloadSettings.accountDialogHint") }}
      </p>

      <SFormItem :label="$t('pyloadSettings.accountLogin')">
        <SInput v-model="accountForm.login" class="mw-320" :disabled="!!editingAccount" />
      </SFormItem>

      <SFormItem :label="$t('pyloadSettings.accountPassword')">
        <SInput
          v-model="accountForm.password"
          type="password"
          class="mw-320"
          :placeholder="editingAccount ? $t('pyloadSettings.accountPasswordKeep') : ''"
        />
      </SFormItem>

      <SFormItem :label="$t('pyloadSettings.accountType')">
        <SSelect
          v-model="accountForm.type"
          :options="accountTypeOptions"
          class="mw-320"
          :disabled="!!editingAccount"
        />
      </SFormItem>

      <div class="columns is-multiline">
        <div class="column is-6">
          <SFormItem :label="$t('pyloadSettings.accountsFields.time')">
            <SInput v-model="accountForm.time" class="mw-200" />
          </SFormItem>
        </div>
        <div class="column is-6">
          <SFormItem :label="$t('pyloadSettings.accountsFields.maxParallel')">
            <SInputNumber v-model="accountForm.maxParallel" :min="0" :step="1" />
          </SFormItem>
        </div>
      </div>

      <template #footer>
        <div class="flex-end gap-sm">
          <SButton @click="showAccountDialog = false">
            {{ $t("downloads.addPyloadDialog.cancel") }}
          </SButton>
          <SButton variant="primary" :loading="savingAccount" @click="submitAccount">
            {{ editingAccount ? $t("settings.save") : $t("pyloadSettings.addAccount") }}
          </SButton>
        </div>
      </template>
    </SDialog>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch, showToast } = useApi();
const { t } = useI18n();

interface PyLoadPluginField {
  key: string;
  label: string;
  type: string;
  value: string | number | boolean;
  options: string[];
}

interface PyLoadPlugin {
  name: string;
  description: string;
  outline: string;
  fields: PyLoadPluginField[];
}

interface PyLoadAccount {
  type: string;
  login: string;
  valid: boolean;
  premium: boolean;
  validuntil: number | null;
  trafficleft: number | null;
  options?: Record<string, string[] | string | number | boolean>;
  time?: string;
  maxParallel?: string;
}

const loading = ref(false);
const saving = ref(false);
const savingAccount = ref(false);
const saved = ref(false);
const errorMsg = ref("");
const route = useRoute();
const router = useRouter();
const VALID_TABS = ["downloads", "proxy", "reconnection", "plugins", "accounts", "logs"];
const activeTab = ref(VALID_TABS.includes(route.hash.slice(1)) ? route.hash.slice(1) : "downloads");
watch(activeTab, (tab) => router.replace({ hash: `#${tab}` }));
const pluginQuery = ref("");
const selectedPluginName = ref("");
const plugins = ref<PyLoadPlugin[]>([]);
const accounts = ref<PyLoadAccount[]>([]);
const accountTypes = ref<string[]>([]);
const showAccountDialog = ref(false);
const editingAccount = ref<PyLoadAccount | null>(null);
const deletingAccountKey = ref("");

const accountForm = reactive({
  login: "",
  password: "",
  type: "",
  time: "",
  maxParallel: 0,
});

const downloadForm = reactive({
  chunks: 3,
  maxDownloads: 3,
  maxSpeed: -1,
  limitSpeed: false,
  interface: "",
  ipv6: false,
  skipExisting: false,
  startTime: "0:00",
  endTime: "0:00",
});

const proxyForm = reactive({
  enabled: false,
  host: "localhost",
  port: 7070,
  type: "http",
  socksResolveDns: false,
  username: "",
  password: "",
});

const reconnectionForm = reactive({
  enabled: false,
  script: "",
  startTime: "0:00",
  endTime: "0:00",
});

const tabPanes = computed(() => [
  { name: "downloads", label: t("pyloadSettings.downloads") },
  { name: "proxy", label: t("pyloadSettings.proxy") },
  { name: "reconnection", label: t("pyloadSettings.reconnection") },
  { name: "plugins", label: t("pyloadSettings.plugins") },
  { name: "accounts", label: t("pyloadSettings.accounts") },
  { name: "logs", label: t("pyloadLogs.title") },
]);

const accountTypeOptions = computed(() =>
  accountTypes.value.map((plugin) => ({ label: plugin, value: plugin })),
);

const proxyTypeOptions = [
  { label: "http", value: "http" },
  { label: "https", value: "https" },
  { label: "socks4", value: "socks4" },
  { label: "socks5", value: "socks5" },
];

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "on", "yes"].includes(normalized)) return true;
    if (["false", "0", "off", "no", ""].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizePluginFieldValue(type: string, value: unknown): string | number | boolean {
  if (type === "bool") return normalizeBoolean(value, false);
  if (["int", "float", "double"].includes(type)) return normalizeNumber(value, 0);
  return normalizeString(value, "");
}

function isBooleanField(field: PyLoadPluginField): field is PyLoadPluginField & { value: boolean } {
  return field.type === "bool";
}

function isNumericField(field: PyLoadPluginField): field is PyLoadPluginField & { value: number } {
  return ["int", "float", "double"].includes(field.type);
}

function isPasswordField(field: PyLoadPluginField): boolean {
  return field.type === "password";
}

function isSelectField(field: PyLoadPluginField): boolean {
  return field.options.length > 0;
}

function onPluginSelectChange(field: PyLoadPluginField, value: string | number) {
  field.value = String(value);
}

function onPluginNumberChange(field: PyLoadPluginField, value: number) {
  field.value = value;
}

function onPluginInputChange(field: PyLoadPluginField, value: string | number) {
  field.value = String(value);
}

const filteredPlugins = computed(() => {
  const query = pluginQuery.value.trim().toLowerCase();
  if (!query) return plugins.value;
  return plugins.value.filter((plugin) => plugin.name.toLowerCase().includes(query));
});

const selectedPlugin = computed(() => {
  return plugins.value.find((plugin) => plugin.name === selectedPluginName.value) || null;
});

function applyDownloadConfig(config: unknown) {
  const values = (config || {}) as Record<string, unknown>;
  downloadForm.chunks = normalizeNumber(values.chunks, 3);
  downloadForm.maxDownloads = normalizeNumber(values.max_downloads, 3);
  downloadForm.maxSpeed = normalizeNumber(values.max_speed, -1);
  downloadForm.limitSpeed = normalizeBoolean(values.limit_speed, false);
  downloadForm.interface = normalizeString(values.interface, "");
  downloadForm.ipv6 = normalizeBoolean(values.ipv6, false);
  downloadForm.skipExisting = normalizeBoolean(values.skip_existing, false);
  downloadForm.startTime = normalizeString(values.start_time, "0:00");
  downloadForm.endTime = normalizeString(values.end_time, "0:00");
}

function applyProxyConfig(config: unknown) {
  const values = (config || {}) as Record<string, unknown>;
  proxyForm.enabled = normalizeBoolean(values.enabled, false);
  proxyForm.host = normalizeString(values.host, "localhost");
  proxyForm.port = normalizeNumber(values.port, 7070);
  proxyForm.type = normalizeString(values.type, "http");
  proxyForm.socksResolveDns = normalizeBoolean(values.socks_resolve_dns, false);
  proxyForm.username = normalizeString(values.username, "");
  proxyForm.password = normalizeString(values.password, "");
}

function applyReconnectionConfig(config: unknown) {
  const values = (config || {}) as Record<string, unknown>;
  reconnectionForm.enabled = normalizeBoolean(values.enabled, false);
  reconnectionForm.script = normalizeString(values.script, "");
  reconnectionForm.startTime = normalizeString(values.start_time, "0:00");
  reconnectionForm.endTime = normalizeString(values.end_time, "0:00");
}

function applyPluginConfig(config: unknown) {
  const pluginList = Array.isArray(config) ? (config as PyLoadPlugin[]) : [];
  plugins.value = pluginList.map((plugin) => ({
    ...plugin,
    fields: (plugin.fields || []).map((field) => ({
      ...field,
      options: Array.isArray(field.options) ? field.options : [],
      value: normalizePluginFieldValue(field.type, field.value),
    })),
  }));

  if (!plugins.value.some((plugin) => plugin.name === selectedPluginName.value)) {
    selectedPluginName.value = plugins.value[0]?.name || "";
  }
}

function extractAccountOption(
  options: Record<string, string[] | string | number | boolean> | undefined,
  key: string,
): string {
  const value = options?.[key];
  if (Array.isArray(value)) return String(value[0] ?? "");
  if (value == null) return "";
  return String(value);
}

function applyAccountsData(list: unknown) {
  const accountList = Array.isArray(list) ? (list as PyLoadAccount[]) : [];
  accounts.value = accountList.map((account) => {
    const options = account.options && typeof account.options === "object" ? account.options : {};

    return {
      ...account,
      valid: Boolean(account.valid),
      premium: Boolean(account.premium),
      validuntil: typeof account.validuntil === "number" ? account.validuntil : null,
      trafficleft: typeof account.trafficleft === "number" ? account.trafficleft : null,
      options,
      time: extractAccountOption(options, "time"),
      maxParallel: extractAccountOption(options, "limit_dl"),
    };
  });
}

function applyAccountTypesData(list: unknown) {
  accountTypes.value = Array.isArray(list)
    ? list
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
    : [];
}

function formatValidUntil(value: number | null) {
  if (value == null || value <= 0) return "-";
  try {
    return new Date(value * 1000).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatTrafficLeft(value: number | null) {
  if (value == null) return "-";
  if (value < 0) return t("pyloadSettings.unlimited");
  return String(value);
}

function resetAccountForm() {
  accountForm.login = "";
  accountForm.password = "";
  accountForm.type = accountTypes.value[0] || "";
  accountForm.time = "";
  accountForm.maxParallel = 0;
}

function openAddAccount() {
  editingAccount.value = null;
  resetAccountForm();
  showAccountDialog.value = true;
}

function openEditAccount(account: PyLoadAccount) {
  editingAccount.value = account;
  accountForm.login = account.login;
  accountForm.password = "";
  accountForm.type = account.type;
  accountForm.time = account.time || "";
  accountForm.maxParallel = Number(account.maxParallel || 0);
  showAccountDialog.value = true;
}

async function submitAccount() {
  if (!accountForm.login.trim() || !accountForm.type.trim()) {
    showToast(t("pyloadSettings.accountRequired"), "warning", 3000);
    return;
  }

  savingAccount.value = true;
  errorMsg.value = "";

  try {
    await apiFetch("/api/pyload/accounts", {
      method: "POST",
      body: {
        plugin: accountForm.type,
        login: accountForm.login,
        password: accountForm.password,
        time: accountForm.time,
        limitDl: String(Math.max(0, accountForm.maxParallel)),
      },
    });

    showAccountDialog.value = false;
    await loadAccountsData();
    showToast(t("pyloadSettings.saved"), "success", 3000);
  } catch (err: any) {
    errorMsg.value =
      err?.data?.statusMessage || err?.statusMessage || t("pyloadSettings.saveError");
  } finally {
    savingAccount.value = false;
  }
}

async function deleteAccount(account: PyLoadAccount) {
  const key = `${account.type}:${account.login}`;
  deletingAccountKey.value = key;
  errorMsg.value = "";
  try {
    await apiFetch("/api/pyload/accounts", {
      method: "DELETE",
      body: {
        plugin: account.type,
        login: account.login,
      },
    });
    await loadAccountsData();
    showToast(t("pyloadSettings.saved"), "success", 3000);
  } catch (err: any) {
    errorMsg.value =
      err?.data?.statusMessage || err?.statusMessage || t("pyloadSettings.saveError");
  } finally {
    deletingAccountKey.value = "";
  }
}

async function loadAccountsData() {
  const [accountsData, accountTypeData] = await Promise.all([
    apiFetch("/api/pyload/accounts").catch(() => null),
    apiFetch("/api/pyload/account-types").catch(() => null),
  ]);

  applyAccountsData(accountsData);
  applyAccountTypesData(accountTypeData);

  if (!accountForm.type) {
    accountForm.type = accountTypes.value[0] || "";
  }
}

async function saveConfig(
  category: string,
  values: Record<string, string | number | boolean>,
  section = "core",
) {
  saving.value = true;
  saved.value = false;
  errorMsg.value = "";

  try {
    await apiFetch("/api/pyload/config", {
      method: "POST",
      body: {
        section,
        category,
        values,
      },
    });

    saved.value = true;
    showToast(t("pyloadSettings.saved"), "success", 4000);
    setTimeout(() => {
      saved.value = false;
    }, 2500);
  } catch (err: any) {
    errorMsg.value =
      err?.data?.statusMessage || err?.statusMessage || t("pyloadSettings.saveError");
  } finally {
    saving.value = false;
  }
}

async function saveDownloads() {
  await saveConfig("download", {
    chunks: downloadForm.chunks,
    max_downloads: downloadForm.maxDownloads,
    max_speed: downloadForm.maxSpeed,
    limit_speed: downloadForm.limitSpeed,
    interface: downloadForm.interface,
    ipv6: downloadForm.ipv6,
    skip_existing: downloadForm.skipExisting,
    start_time: downloadForm.startTime,
    end_time: downloadForm.endTime,
  });
}

async function saveProxy() {
  await saveConfig("proxy", {
    enabled: proxyForm.enabled,
    host: proxyForm.host,
    port: proxyForm.port,
    type: proxyForm.type,
    socks_resolve_dns: proxyForm.socksResolveDns,
    username: proxyForm.username,
    password: proxyForm.password,
  });
}

async function saveReconnection() {
  await saveConfig("reconnect", {
    enabled: reconnectionForm.enabled,
    script: reconnectionForm.script,
    start_time: reconnectionForm.startTime,
    end_time: reconnectionForm.endTime,
  });
}

async function saveSelectedPlugin() {
  if (!selectedPlugin.value) return;

  const values = Object.fromEntries(
    selectedPlugin.value.fields.map((field) => [field.key, field.value]),
  ) as Record<string, string | number | boolean>;

  await saveConfig(selectedPlugin.value.name, values, "plugin");
}

async function loadData() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const [downloadConfig, proxyConfig, reconnectionConfig, pluginConfig] = await Promise.all([
      apiFetch("/api/pyload/config", {
        query: { category: "download", section: "core" },
      }).catch(() => null),
      apiFetch("/api/pyload/config", {
        query: { category: "proxy", section: "core" },
      }).catch(() => null),
      apiFetch("/api/pyload/config", {
        query: { category: "reconnect", section: "core" },
      }).catch(() => null),
      apiFetch("/api/pyload/plugins").catch(() => null),
    ]);

    applyDownloadConfig(downloadConfig);
    applyProxyConfig(proxyConfig);
    applyReconnectionConfig(reconnectionConfig);
    applyPluginConfig(pluginConfig);
    await loadAccountsData();
  } catch (err: any) {
    console.error("Failed to load pyLoad settings:", err);
    errorMsg.value = t("common.loadFailed");
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

// ── Log viewer ───────────────────────────────────────
type PyLoadLogLevel = "debug" | "info" | "warning" | "error" | "critical" | "other";

interface PyLoadLogEntry {
  id: string;
  timestamp: string;
  level: PyLoadLogLevel;
  message: string;
}

const logInitialLoading = ref(true);
const logErrorMsg = ref("");
const logSource = ref("");
const logLastUpdated = ref("");
const logItems = ref<PyLoadLogEntry[]>([]);
const logSearchText = ref("");
const logSelectedLevel = ref("all");
const logLineLimit = ref(400);
const logAutoRefresh = ref(true);
const logRefreshMs = ref("5000");
let logRefreshTimer: ReturnType<typeof setInterval> | null = null;

const logLevelOptions = computed(() => [
  { label: t("pyloadLogs.levelAll"), value: "all" },
  { label: "DEBUG", value: "debug" },
  { label: "INFO", value: "info" },
  { label: "WARNING", value: "warning" },
  { label: "ERROR", value: "error" },
  { label: "CRITICAL", value: "critical" },
  { label: t("pyloadLogs.levelOther"), value: "other" },
]);

const logIntervalOptions = computed(() => [
  { label: "5s", value: "5000" },
  { label: "10s", value: "10000" },
  { label: "15s", value: "15000" },
  { label: "30s", value: "30000" },
  { label: "60s", value: "60000" },
]);

const logSourceLabel = computed(() => {
  if (!logSource.value) return "-";
  if (logSource.value.startsWith("docker:")) return t("pyloadLogs.sourceDocker");
  if (logSource.value === "unavailable") return t("pyloadLogs.sourceUnavailable");
  return t("pyloadLogs.sourceApi", { command: logSource.value });
});

const logFilteredItems = computed(() => {
  const query = logSearchText.value.trim().toLowerCase();
  return logItems.value.filter((entry) => {
    if (logSelectedLevel.value !== "all" && entry.level !== logSelectedLevel.value) return false;
    if (!query) return true;
    return (
      entry.message.toLowerCase().includes(query) ||
      entry.timestamp.toLowerCase().includes(query) ||
      entry.level.toLowerCase().includes(query)
    );
  });
});

function stopLogTimer() {
  if (!logRefreshTimer) return;
  clearInterval(logRefreshTimer);
  logRefreshTimer = null;
}

function startLogTimer() {
  stopLogTimer();
  if (!logAutoRefresh.value) return;
  const interval = Number.parseInt(logRefreshMs.value, 10);
  if (!Number.isFinite(interval) || interval < 1000) return;
  logRefreshTimer = setInterval(() => refreshLogs(true), interval);
}

async function refreshLogs(silent = false) {
  if (!silent) {
    logErrorMsg.value = "";
  }

  try {
    const response = await apiFetch<{
      source?: string;
      items?: PyLoadLogEntry[];
      fetchedAt?: string;
      warning?: string;
    }>("/api/pyload/logs", {
      query: {
        limit: String(Math.max(10, logLineLimit.value || 400)),
      },
    });

    logItems.value = Array.isArray(response?.items) ? response.items : [];
    logSource.value = String(response?.source || "");
    if (!silent) {
      const hasLogs = logItems.value.length > 0;
      const usingDockerFallback = logSource.value.startsWith("docker:");
      const warningText = String(response?.warning || "");
      const apiUnavailableWarning = warningText
        .toLowerCase()
        .includes("pyload api log endpoint unavailable");
      logErrorMsg.value =
        warningText && !(hasLogs && usingDockerFallback)
          ? apiUnavailableWarning
            ? t("pyloadLogs.apiUnavailable")
            : warningText
          : "";
    }
    logLastUpdated.value = response?.fetchedAt
      ? new Date(response.fetchedAt).toLocaleTimeString()
      : new Date().toLocaleTimeString();
  } catch (err: any) {
    if (!silent) {
      logErrorMsg.value = err?.data?.statusMessage || err?.statusMessage || t("pyloadLogs.loadError");
    }
  } finally {
    logInitialLoading.value = false;
  }
}

watch([logAutoRefresh, logRefreshMs], () => {
  startLogTimer();
});

watch(logLineLimit, () => {
  refreshLogs();
});

// Start log timer on mount
onMounted(async () => {
  await refreshLogs();
  startLogTimer();
});

onBeforeUnmount(() => {
  stopLogTimer();
});
</script>

<style scoped>
.table-container {
  overflow-x: auto;
}

.accounts-actions-col {
  width: 1%;
  white-space: nowrap;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.pyload-plugin-layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
}

.pyload-plugin-sidebar {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 25rem);
  overflow-y: auto;
}

.pyload-plugin-detail {
  min-width: 0;
}

.pyload-plugin-empty {
  padding: 0.75rem 0;
}

.pyload-plugin-item {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.55rem 0.7rem;
  text-align: left;
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  background: var(--s-bg-surface);
  color: var(--s-text);
  cursor: pointer;
}

.pyload-plugin-item:hover,
.pyload-plugin-item.is-active {
  border-color: var(--s-border-focus);
  background: var(--s-bg-hover);
}

@media (max-width: 900px) {
  .pyload-plugin-layout {
    grid-template-columns: 1fr;
  }

  .pyload-plugin-sidebar {
    max-height: none;
    overflow-y: visible;
  }
}

/* ── Log viewer ──────────────────────────────── */
.log-content {
  background: var(--s-bg-surface-alt);
  border-radius: var(--s-radius);
  padding: 0.85rem;
  max-height: 560px;
  overflow: auto;
  border: 1px solid var(--s-border);
  font-family: "Fira Code", "Cascadia Code", monospace;
  font-size: 0.78rem;
  line-height: 1.45;
}

.log-line {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 0.6rem;
  padding: 0.15rem 0;
  color: var(--s-text);
}

.log-line.is-debug {
  color: var(--s-text-muted);
}

.log-line.is-info {
  color: var(--s-info);
}

.log-line.is-warning {
  color: var(--s-warning);
}

.log-line.is-error,
.log-line.is-critical {
  color: var(--s-danger);
}

.log-ts {
  color: var(--s-text-muted);
  white-space: nowrap;
}

.log-level {
  min-width: 70px;
  font-weight: 600;
}

.log-msg {
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .log-line {
    grid-template-columns: 1fr;
    gap: 0.2rem;
  }

  .log-level {
    min-width: 0;
  }
}
</style>
