<template>
  <SLoading id="page-settings" :loading="loading">
    <h1 class="title is-4 mb-4">{{ $t("settings.title") }}</h1>

    <STabs v-model="activeTab" :panes="tabPanes">
      <template #tab-theme
        ><span class="mdi mdi-palette mr-1" /> {{ $t("settings.theme") }}</template
      >
      <template #tab-language
        ><span class="mdi mdi-translate mr-1" /> {{ $t("settings.language") }}</template
      >
      <template #tab-account
        ><span class="mdi mdi-account mr-1" /> {{ $t("settings.account") }}</template
      >
      <template #tab-integrations
        ><span class="mdi mdi-puzzle mr-1" /> {{ $t("settings.integrations") }}</template
      >
      <template #tab-users
        ><span class="mdi mdi-account-group mr-1" /> {{ $t("settings.users") }}</template
      >
      <template #tab-downloadHistory
        ><span class="mdi mdi-download mr-1" /> {{ $t("settings.downloadHistory") }}</template
      >
      <template #tab-providers
        ><span class="mdi mdi-application-cog mr-1" /> {{ $t("settings.providers") }}</template
      >
      <template #tab-ports><span class="mdi mdi-lan mr-1" /> {{ $t("ports.title") }}</template>
      <template #tab-webamp
        ><span class="mdi mdi-music mr-1" /> {{ $t("settings.webamp") }}</template
      >
      <template #tab-about
        ><span class="mdi mdi-information mr-1" /> {{ $t("settings.about") }}</template
      >

      <STabPane name="theme" :active="activeTab === 'theme'">
        <SettingsThemeTab />
      </STabPane>

      <STabPane name="language" :active="activeTab === 'language'">
        <SettingsLanguageTab />
      </STabPane>

      <STabPane name="account" :active="activeTab === 'account'">
        <SettingsAccountTab />
      </STabPane>

      <STabPane v-if="isAdmin" name="integrations" :active="activeTab === 'integrations'">
        <SettingsIntegrationsTab />
      </STabPane>

      <STabPane v-if="isAdmin" name="users" :active="activeTab === 'users'">
        <SettingsUsersTab />
      </STabPane>

      <STabPane name="downloadHistory" :active="activeTab === 'downloadHistory'">
        <SettingsDownloadHistoryTab />
      </STabPane>

      <STabPane name="providers" :active="activeTab === 'providers'">
        <SettingsProvidersTab />
      </STabPane>

      <STabPane name="ports" :active="activeTab === 'ports'">
        <SettingsPortsTab />
      </STabPane>

      <STabPane name="webamp" :active="activeTab === 'webamp'">
        <SettingsWebampTab />
      </STabPane>

      <STabPane name="about" :active="activeTab === 'about'">
        <SettingsAboutTab />
      </STabPane>
    </STabs>
  </SLoading>
</template>

<script setup lang="ts">
import type { TabPaneDef } from "~/components/s/STabs.vue";

const { t } = useI18n();
const auth = useAuth();
const route = useRoute();
const router = useRouter();

const VALID_TABS = [
  "theme", "language", "account", "integrations", "users",
  "downloadHistory", "providers", "ports", "webamp", "about",
];
const activeTab = ref(VALID_TABS.includes(route.hash.slice(1)) ? route.hash.slice(1) : "theme");
watch(activeTab, (tab) => router.replace({ hash: `#${tab}` }));
const loading = ref(false);

const isAdmin = computed(() => auth.user.value?.isAdmin === true);

// Tab panes (dynamic based on admin)
const tabPanes = computed<TabPaneDef[]>(() => {
  const p: TabPaneDef[] = [
    { name: "theme", label: t("settings.theme") },
    { name: "language", label: t("settings.language") },
    { name: "account", label: t("settings.account") },
  ];
  if (isAdmin.value) {
    p.push({ name: "integrations", label: t("settings.integrations") });
    p.push({ name: "users", label: t("settings.users") });
  }
  p.push({ name: "downloadHistory", label: t("settings.downloadHistory") });
  p.push({ name: "providers", label: t("settings.providers") });
  p.push({ name: "ports", label: t("ports.title") });
  p.push({ name: "webamp", label: t("settings.webamp") });
  p.push({ name: "about", label: t("settings.about") });
  return p;
});
</script>
