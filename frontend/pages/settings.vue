<template>
  <SLoading id="page-settings" :loading="loading">
    <h1 class="title is-4 mb-4">{{ $t("settings.title") }}</h1>

    <STabs v-model="activeTab" variant="card" :panes="tabPanes">
      <!-- Theme selector -->
      <STabPane name="theme" :label="$t('settings.theme')" :active="activeTab === 'theme'">
        <div class="box">
          <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.theme") }}</h6>
          <p class="has-text-grey is-size-7 mb-4">
            {{ $t("settings.themeDescription") }}
          </p>
          <SFormItem :label="$t('settings.theme')">
            <SSelect v-model="selectedTheme">
              <option v-for="th in themes" :key="th.key" :value="th.key">
                {{ th.label }}
              </option>
            </SSelect>
          </SFormItem>

          <SFormItem :label="$t('settings.canvasEffects')" class="mt-4">
            <SSwitch :model-value="canvasEnabled" @update:model-value="setCanvasEnabled" />
          </SFormItem>
          <p class="has-text-grey is-size-7 mb-4">
            {{ $t("settings.canvasEffectsDescription") }}
          </p>

          <SButton variant="primary" :loading="savingTheme" @click="applyTheme">
            <span class="mdi mdi-content-save mr-1" />
            {{ $t("settings.save") }}
          </SButton>
        </div>
      </STabPane>

      <!-- Language selector -->
      <STabPane name="language" :label="$t('settings.language')" :active="activeTab === 'language'">
        <div class="box">
          <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.language") }}</h6>
          <p class="has-text-grey is-size-7 mb-4">
            {{ $t("settings.languageDescription") }}
          </p>
          <SFormItem :label="$t('settings.language')">
            <SSelect v-model="selectedLocale">
              <option v-for="lang in availableLocales" :key="lang.code" :value="lang.code">
                {{ lang.name }}
              </option>
            </SSelect>
          </SFormItem>

          <SButton variant="primary" :loading="savingLocale" @click="applyLocale">
            <span class="mdi mdi-content-save mr-1" />
            {{ $t("settings.save") }}
          </SButton>
        </div>
      </STabPane>

      <!-- Account: change own password -->
      <STabPane name="account" :label="$t('settings.account')" :active="activeTab === 'account'">
        <div class="box">
          <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.changePassword") }}</h6>
          <SFormItem :label="$t('settings.currentPassword')">
            <SInput v-model="selfPwCurrent" type="password" class="mw-320" />
          </SFormItem>
          <SFormItem :label="$t('settings.newPassword')">
            <SInput v-model="selfPwNew" type="password" class="mw-320" />
          </SFormItem>
          <SFormItem :label="$t('settings.confirmPassword')">
            <SInput v-model="selfPwConfirm" type="password" class="mw-320" />
          </SFormItem>
          <p v-if="selfPwError" class="has-text-danger is-size-7 mb-3">
            {{ selfPwError }}
          </p>
          <SButton variant="primary" :loading="savingSelfPw" @click="submitSelfPw">
            <span class="mdi mdi-content-save mr-1" />
            {{ $t("settings.save") }}
          </SButton>
        </div>
      </STabPane>

      <!-- Admin: Integrations -->
      <STabPane
        v-if="isAdmin"
        name="integrations"
        :label="$t('settings.integrations')"
        :active="activeTab === 'integrations'"
      >
        <div class="box">
          <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.tvdbTitle") }}</h6>
          <p class="is-size-7 mb-3 text-muted">
            {{ $t("settings.tvdbDescription") }}
            <a href="https://thetvdb.com/api-information" target="_blank" rel="noopener">
              thetvdb.com/api-information
            </a>
          </p>

          <SAlert v-if="tvdbKeySet" variant="success" class="mb-3" size="sm">
            {{ $t("settings.tvdbKeySet") }}
          </SAlert>
          <SAlert v-else variant="warning" class="mb-3" size="sm">
            {{ $t("settings.tvdbKeyNotSet") }}
          </SAlert>

          <SFormItem :label="$t('settings.tvdbApiKey')">
            <SInput
              v-model="tvdbKeyInput"
              :placeholder="$t('settings.tvdbKeyPlaceholder')"
              class="mw-420"
            />
          </SFormItem>

          <div class="stt-btn-row">
            <SButton variant="primary" :loading="savingTvdb" @click="saveTvdbKey">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t("settings.save") }}
            </SButton>
            <SButton v-if="tvdbKeySet" variant="danger" :loading="savingTvdb" @click="clearTvdbKey">
              <span class="mdi mdi-delete mr-1" />
              {{ $t("settings.tvdbKeyClear") }}
            </SButton>
          </div>

          <br />

          <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.tmdbTitle") }}</h6>
          <p class="is-size-7 mb-3 text-muted">
            {{ $t("settings.tmdbDescription") }}
            <a
              href="https://developer.themoviedb.org/docs/getting-started"
              target="_blank"
              rel="noopener"
            >
              developer.themoviedb.org/docs/getting-started
            </a>
          </p>

          <SAlert v-if="tmdbKeySet" variant="success" class="mb-3" size="sm">
            {{ $t("settings.tmdbKeySet") }}
          </SAlert>
          <SAlert v-else variant="warning" class="mb-3" size="sm">
            {{ $t("settings.tmdbKeyNotSet") }}
          </SAlert>

          <SFormItem :label="$t('settings.tmdbApiKey')">
            <SInput
              v-model="tmdbKeyInput"
              :placeholder="$t('settings.tmdbKeyPlaceholder')"
              class="mw-420"
            />
          </SFormItem>

          <div class="stt-btn-row">
            <SButton variant="primary" :loading="savingTmdb" @click="saveTmdbKey">
              <span class="mdi mdi-content-save mr-1" />
              {{ $t("settings.save") }}
            </SButton>
            <SButton v-if="tmdbKeySet" variant="danger" :loading="savingTmdb" @click="clearTmdbKey">
              <span class="mdi mdi-delete mr-1" />
              {{ $t("settings.tmdbKeyClear") }}
            </SButton>
          </div>
        </div>
      </STabPane>

      <!-- Admin: Users -->
      <STabPane
        v-if="isAdmin"
        name="users"
        :label="$t('settings.users')"
        :active="activeTab === 'users'"
      >
        <div class="box">
          <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.users") }}</h6>
          <STable :data="users" :columns="userCols" stripe>
            <template #cell-role="{ row }">
              <STag :variant="row.is_admin ? 'primary' : 'info'" size="sm">{{
                row.is_admin ? $t("settings.adminTag") : $t("settings.userTag")
              }}</STag>
            </template>
            <template #cell-actions="{ row }">
              <div class="stt-actions">
                <SButton
                  variant="warning"
                  size="sm"
                  :title="$t('settings.changePassword')"
                  @click="openChangePw(row)"
                >
                  <span class="mdi mdi-key" />
                </SButton>
                <SButton
                  v-if="row.id !== currentUserId"
                  variant="danger"
                  size="sm"
                  @click="removeUser(row.id)"
                >
                  <span class="mdi mdi-delete" />
                </SButton>
              </div>
            </template>
          </STable>

          <!-- Change password dialog -->
          <SDialog
            v-model="pwDialog"
            :title="$t('settings.changePwFor', { username: pwUsername })"
            width="400px"
          >
            <SFormItem :label="$t('settings.newPassword')">
              <SInput v-model="pwNew" type="password" size="sm" class="mw-280" />
            </SFormItem>
            <SFormItem :label="$t('settings.confirmPassword')">
              <SInput v-model="pwConfirm" type="password" size="sm" class="mw-280" />
            </SFormItem>
            <p v-if="pwMismatch" class="has-text-danger is-size-7 mt-1">
              {{ $t("settings.passwordsDoNotMatch") }}
            </p>
            <template #footer>
              <SButton variant="primary" :loading="savingPw" @click="submitChangePw">
                <span class="mdi mdi-content-save mr-1" />
                {{ $t("settings.save") }}
              </SButton>
            </template>
          </SDialog>

          <SDivider />
          <h6 class="title is-6 mb-3 mt-3">{{ $t("settings.addUser") }}</h6>
          <div class="columns">
            <div class="column is-4">
              <SFormItem :label="$t('settings.username')"
                ><SInput v-model="newUsername" size="sm"
              /></SFormItem>
            </div>
            <div class="column is-4">
              <SFormItem :label="$t('settings.password')"
                ><SInput v-model="newPassword" type="password" size="sm"
              /></SFormItem>
            </div>
            <div class="column is-2">
              <SFormItem :label="$t('settings.admin')"
                ><SCheckbox v-model="newIsAdmin"
              /></SFormItem>
            </div>
            <div class="column is-2 is-flex is-align-items-flex-end">
              <SButton variant="success" size="sm" @click="addUser">
                <span class="mdi mdi-account-plus mr-1" />
                {{ $t("settings.add") }}
              </SButton>
            </div>
          </div>
        </div>
      </STabPane>

      <!-- Download History -->
      <STabPane
        name="downloadHistory"
        :label="$t('settings.downloadHistory')"
        :active="activeTab === 'downloadHistory'"
      >
        <div class="box">
          <div class="dh-header">
            <div>
              <h6 class="title is-6 mb-1 mt-3">{{ $t("settings.downloadHistoryTitle") }}</h6>
              <p class="has-text-grey is-size-7 mb-3">
                {{ $t("settings.downloadHistoryDescription") }}
              </p>
            </div>
          </div>

          <SLoading v-if="historyLoading" />

          <p v-else-if="!historyEntries.length" class="has-text-muted is-size-7">
            {{ $t("settings.downloadHistoryEmpty") }}
          </p>

          <template v-else>
            <STable :data="historyEntries" :columns="historyCols" stripe>
              <template #cell-title="{ row }">
                <span class="dh-title" :title="row.url">{{ row.title || row.url }}</span>
              </template>
              <template #cell-service="{ row }">
                <STag size="sm" :variant="historyServiceVariant(row.service)">
                  {{ historyServiceLabel(row.service) }}
                </STag>
              </template>
              <template #cell-date="{ row }">
                <span class="is-size-7 has-text-grey">{{ formatHistoryDate(row.sent_at) }}</span>
              </template>
              <template #cell-actions="{ row }">
                <div class="stt-actions">
                  <SButton
                    variant="primary"
                    size="sm"
                    :loading="historyRedownloading === row.id"
                    :disabled="!!historyRedownloading"
                    :title="$t('settings.downloadHistoryReDownload')"
                    @click="reDownload(row)"
                  >
                    <span class="mdi mdi-download mr-1" />
                    {{ $t("settings.downloadHistoryReDownload") }}
                  </SButton>
                  <SButton
                    variant="danger"
                    size="sm"
                    :loading="historyRemoving === row.id"
                    :disabled="!!historyRemoving"
                    :title="$t('settings.downloadHistoryRemove')"
                    @click="removeHistoryEntry(row)"
                  >
                    <span class="mdi mdi-delete mr-1" />
                    {{ $t("settings.downloadHistoryRemove") }}
                  </SButton>
                </div>
              </template>
            </STable>

            <!-- Pagination -->
            <div class="dh-pagination">
              <SButton
                size="sm"
                :disabled="historyPage <= 1"
                @click="gotoHistoryPage(historyPage - 1)"
              >
                <span class="mdi mdi-chevron-left mr-1" />{{ $t("settings.downloadHistoryPrev") }}
              </SButton>
              <span class="dh-page-info">
                {{ $t("settings.downloadHistoryPage", { page: historyPage, pages: historyPages }) }}
              </span>
              <SButton
                size="sm"
                :disabled="historyPage >= historyPages"
                @click="gotoHistoryPage(historyPage + 1)"
              >
                {{ $t("settings.downloadHistoryNext") }}<span class="mdi mdi-chevron-right ml-1" />
              </SButton>
            </div>
          </template>
        </div>
      </STabPane>

      <!-- Public Port Status -->
      <STabPane name="ports" :label="$t('ports.title')" :active="activeTab === 'ports'">
        <div class="box">
          <div class="ports-panel-header">
            <div>
              <h6 class="title is-6 mb-1 mt-3">{{ $t("ports.title") }}</h6>
              <p class="has-text-grey is-size-7 mb-3">{{ $t("ports.description") }}</p>
            </div>
            <SButton variant="default" size="sm" :loading="checking" @click="refresh">
              <span class="mdi mdi-refresh mr-1" />
              {{ $t("ports.refresh") }}
            </SButton>
          </div>

          <div class="port-flow-list">
            <div v-for="p in ports" :key="`${p.port}-${p.proto}`" class="port-flow-row">
              <div class="port-flow-service">
                <span class="port-proto-tag" :class="p.proto.toLowerCase()">{{ p.proto }}</span>
                {{ p.label }}
              </div>
              <div class="port-flow-diagram">
                <div class="port-node private">
                  <div class="port-node-title">{{ $t("ports.nodePrivate") }}</div>
                  <div class="port-node-ip">{{ privateIp || "—" }}</div>
                  <div class="port-node-port">:{{ p.port }}</div>
                </div>
                <span class="port-flow-arrow mdi mdi-arrow-right" />
                <div class="port-node public">
                  <div class="port-node-title">{{ $t("ports.nodePublic") }}</div>
                  <div class="port-node-ip">{{ publicIp || "—" }}</div>
                  <div class="port-node-port">:{{ p.port }}</div>
                </div>
                <span class="port-flow-arrow mdi mdi-arrow-right" />
                <div
                  class="port-node internet"
                  :class="{
                    'is-open': p.open === true,
                    'is-closed': p.open === false,
                    'is-checking': p.checkable && p.open === null,
                    'is-udp': !p.checkable && p.open === null,
                  }"
                >
                  <div class="port-node-title">{{ $t("ports.nodeInternet") }}</div>
                  <span
                    v-if="!p.checkable && p.open === null"
                    class="port-status-icon mdi mdi-minus-circle-outline"
                    :title="$t('ports.udpNote')"
                  />
                  <span
                    v-else-if="p.open === null"
                    class="port-status-icon mdi mdi-loading mdi-spin"
                  />
                  <span v-else-if="p.open" class="port-status-icon mdi mdi-check-circle" />
                  <span v-else class="port-status-icon mdi mdi-close-circle" />
                  <div class="port-node-label">
                    <template v-if="!p.checkable && p.open === null">{{
                      $t("ports.udpNote")
                    }}</template>
                    <template v-else-if="p.open === null">{{ $t("ports.checking") }}</template>
                    <template v-else-if="p.open">{{ $t("ports.open") }}</template>
                    <template v-else>{{ $t("ports.closed") }}</template>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p class="has-text-grey is-size-7 mt-4">
            {{ $t("ports.poweredBy") }}
            <a href="https://portchecker.io" target="_blank" rel="noopener">portchecker.io</a>
          </p>
        </div>
      </STabPane>

      <!-- Providers -->
      <STabPane
        name="providers"
        :label="$t('settings.providers')"
        :active="activeTab === 'providers'"
      >
        <div class="box">
          <div class="providers-header">
            <div>
              <h6 class="title is-6 mb-1 mt-3">{{ $t("settings.providersTitle") }}</h6>
              <p class="has-text-grey is-size-7 mb-0">
                {{ $t("settings.providersDescription") }}
              </p>
            </div>
            <SButton
              v-if="isAdmin"
              variant="primary"
              size="sm"
              icon="mdi-upload"
              :loading="pluginUploading"
              @click="triggerPluginUpload"
            >
              {{ $t("settings.pluginUpload") }}
            </SButton>
            <input
              v-if="isAdmin"
              ref="pluginFileInput"
              type="file"
              accept=".js"
              style="display: none"
              @change="onPluginFileSelected"
            />
          </div>

          <!-- Docs collapsible -->
          <details class="plugin-docs mt-3 mb-3">
            <summary class="plugin-docs-summary">
              <span class="mdi mdi-book-open-outline mr-1" />
              {{ $t("settings.pluginDocTitle") }}
            </summary>
            <div class="plugin-docs-body">
              <p class="is-size-7 mb-2">{{ $t("settings.pluginDocIntro") }}</p>
              <pre class="plugin-docs-code"><code>// my-provider.js
export default {
  meta: {
    id: "my-provider",          // unique string id
    name: "My Provider",        // display name
    icon: "mdi-magnify",        // MDI icon class
    mediaType: "movies",        // any string, e.g. "movies", "shows", "games"
    description: "Optional."
  },
  // Required: returns items + pagination info
  async list({ query, page, filters }) {
    // fetch from your source...
    return { items: [], hasMore: false };
  },
  // Optional: returns full MediaItem detail
  async detail(url) {
    return { id: url, title: "...", links: [] };
  }
};

// Torrent-search plugin (pluginType: "torrent-search"):
export default {
  meta: {
    id: "my-search",
    name: "My Search",
    icon: "mdi-magnify",
    pluginType: "torrent-search",
    description: "Optional."
  },
  async search(query, limit, extraTrackers) {
    // return TorrentSearchResult[]
    return [];
  }
};</code></pre>
              <p class="is-size-7 mt-2 has-text-muted">
                {{ $t("settings.pluginDocNote") }}
              </p>
              <p class="is-size-7 mt-1">
                <a
                  href="https://github.com/Jo3l/transmule/blob/main/PROVIDER_PLUGIN.md"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span class="mdi mdi-open-in-new mr-1" />
                  {{ $t("settings.pluginDocReadMore") }}
                </a>
              </p>
            </div>
          </details>

          <SLoading v-if="providersLoading" />

          <template v-else>
            <!-- Media content providers -->
            <template v-if="mediaProviderList.length">
              <p class="is-size-7 has-text-grey mb-2 mt-1">
                <span class="mdi mdi-filmstrip mr-1" />{{ $t("settings.providersMediaTitle") }}
              </p>
              <div class="providers-list mb-4">
                <div
                  v-for="p in mediaProviderList"
                  :key="p.id"
                  class="provider-item"
                  :class="{ 'is-disabled': !p.enabled }"
                >
                  <span class="provider-icon mdi" :class="p.icon" />
                  <div class="provider-details">
                    <div class="provider-name">
                      {{ p.name }}
                      <STag v-if="p.version" size="sm" variant="default" class="ml-1"
                        >v{{ p.version }}</STag
                      >
                    </div>
                    <div class="provider-desc">
                      {{ p.description }}
                      <STag size="sm" variant="info" class="ml-2">{{ p.mediaType }}</STag>
                    </div>
                  </div>
                  <SSwitch
                    :model-value="p.enabled"
                    @update:model-value="onToggleProvider(p.id, $event)"
                  />
                  <SButton
                    v-if="isAdmin && pluginUpdates[p.id]"
                    variant="primary"
                    size="sm"
                    :loading="pluginUpdating === p.id"
                    :title="
                      $t('settings.pluginUpdateAvailable', {
                        version: pluginUpdates[p.id]?.latestVersion,
                      })
                    "
                    @click="onUpdatePlugin(p.id, pluginUpdates[p.id]!.url)"
                  >
                    <span class="mdi mdi-arrow-up-circle mr-1" />
                    {{ $t("settings.pluginUpdate") }}
                  </SButton>
                  <SButton
                    v-if="isAdmin && !p.sourceRepoId"
                    variant="warning"
                    size="sm"
                    @click="onDeletePlugin(p.id, p.name)"
                  >
                    {{ $t("settings.pluginDelete") }}
                  </SButton>
                </div>
              </div>
            </template>

            <!-- Torrent-search plugins -->
            <template v-if="torrentSearchProviderList.length">
              <p class="is-size-7 has-text-grey mb-2">
                <span class="mdi mdi-magnify mr-1" />{{
                  $t("settings.providersTorrentSearchTitle")
                }}
              </p>
              <div class="providers-list mb-4">
                <div
                  v-for="p in torrentSearchProviderList"
                  :key="p.id"
                  class="provider-item"
                  :class="{ 'is-disabled': !p.enabled }"
                >
                  <span class="provider-icon mdi" :class="p.icon" />
                  <div class="provider-details">
                    <div class="provider-name">
                      {{ p.name }}
                      <STag v-if="p.version" size="sm" variant="default" class="ml-1"
                        >v{{ p.version }}</STag
                      >
                    </div>
                    <div class="provider-desc">
                      {{ p.description }}
                      <STag size="sm" variant="warning" class="ml-2">torrent-search</STag>
                    </div>
                  </div>
                  <SSwitch
                    :model-value="p.enabled"
                    @update:model-value="onToggleProvider(p.id, $event)"
                  />
                  <SButton
                    v-if="isAdmin && pluginUpdates[p.id]"
                    variant="primary"
                    size="sm"
                    :loading="pluginUpdating === p.id"
                    :title="
                      $t('settings.pluginUpdateAvailable', {
                        version: pluginUpdates[p.id]?.latestVersion,
                      })
                    "
                    @click="onUpdatePlugin(p.id, pluginUpdates[p.id]!.url)"
                  >
                    <span class="mdi mdi-arrow-up-circle mr-1" />
                    {{ $t("settings.pluginUpdate") }}
                  </SButton>
                  <SButton
                    v-if="isAdmin && !p.sourceRepoId"
                    variant="warning"
                    size="sm"
                    @click="onDeletePlugin(p.id, p.name)"
                  >
                    {{ $t("settings.pluginDelete") }}
                  </SButton>
                </div>
              </div>
            </template>

            <p
              v-if="!mediaProviderList.length && !torrentSearchProviderList.length"
              class="has-text-muted is-size-7"
            >
              {{ $t("settings.providersEmpty") }}
            </p>
          </template>

          <!-- Plugin Repositories -->
          <SDivider v-if="isAdmin" class="my-4" />
          <template v-if="isAdmin">
            <div class="providers-header mb-3">
              <div>
                <h6 class="title is-6 mb-1">{{ $t("settings.reposTitle") }}</h6>
                <p class="has-text-grey is-size-7 mb-0">
                  {{ $t("settings.reposDescription") }}
                </p>
              </div>
            </div>

            <!-- Add repo input -->
            <div class="repo-add-row mb-4">
              <SInput
                v-model="newRepoUrl"
                :placeholder="$t('settings.reposAddPlaceholder')"
                size="sm"
                class="repo-add-input"
                @keydown.enter="onAddRepo"
              />
              <SButton variant="primary" size="sm" :loading="repoAdding" @click="onAddRepo">
                <span class="mdi mdi-plus mr-1" />
                {{ $t("settings.reposAdd") }}
              </SButton>
            </div>

            <SLoading v-if="reposLoading" />

            <template v-else-if="repos.length">
              <div v-for="repo in repos" :key="repo.id" class="repo-block mb-4">
                <!-- Repo header -->
                <div class="repo-header" @click="toggleRepoExpanded(repo.id)">
                  <span class="mdi mdi-source-repository mr-2" />
                  <span class="repo-name">{{ repo.name || repo.url }}</span>
                  <span class="repo-url has-text-grey is-size-7 ml-2" v-if="repo.name">{{
                    repo.url
                  }}</span>
                  <div class="repo-header-actions ml-auto">
                    <SButton
                      variant="default"
                      size="sm"
                      :loading="repoRefreshing === repo.id"
                      :title="$t('settings.reposRefresh')"
                      @click.stop="loadRepoPlugins(repo.id)"
                    >
                      <span class="mdi mdi-refresh" />
                    </SButton>
                    <SButton
                      variant="danger"
                      size="sm"
                      :title="$t('settings.reposRemove')"
                      @click.stop="onRemoveRepo(repo)"
                    >
                      <span class="mdi mdi-delete" />
                    </SButton>
                    <span
                      class="mdi repo-chevron"
                      :class="expandedRepos[repo.id] ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                    />
                  </div>
                </div>

                <!-- Repo plugin list -->
                <div v-if="expandedRepos[repo.id]" class="repo-plugins">
                  <SLoading v-if="repoRefreshing === repo.id" />
                  <p v-else-if="repoPluginsError[repo.id]" class="has-text-danger is-size-7 p-2">
                    {{ repoPluginsError[repo.id] }}
                  </p>
                  <template v-else-if="repoPluginsData[repo.id]">
                    <p
                      v-if="!repoPluginsData[repo.id]?.plugins.length"
                      class="has-text-muted is-size-7 p-2"
                    >
                      {{ $t("settings.reposEmpty") }}
                    </p>
                    <div
                      v-for="rp in repoPluginsData[repo.id]?.plugins"
                      :key="rp.id"
                      class="repo-plugin-item"
                    >
                      <span class="provider-icon mdi" :class="rp.icon || 'mdi-puzzle'" />
                      <div class="provider-details">
                        <div class="provider-name">
                          {{ rp.name }}
                          <STag size="sm" variant="default" class="ml-1">v{{ rp.version }}</STag>
                          <STag
                            v-if="rp.pluginType === 'torrent-search'"
                            size="sm"
                            variant="warning"
                            class="ml-1"
                            >torrent-search</STag
                          >
                          <STag v-else-if="rp.pluginType" size="sm" variant="info" class="ml-1">{{
                            rp.pluginType
                          }}</STag>
                        </div>
                        <div v-if="rp.description" class="provider-desc">{{ rp.description }}</div>
                      </div>
                      <STag v-if="rp.installed && !rp.hasUpdate" size="sm" variant="success">
                        {{ $t("settings.reposPluginInstalled") }}
                      </STag>
                      <SButton
                        v-if="rp.hasUpdate"
                        variant="primary"
                        size="sm"
                        :loading="repoInstalling === rp.id"
                        @click="onInstallRepoPlugin(rp)"
                      >
                        <span class="mdi mdi-arrow-up-circle mr-1" />
                        {{ $t("settings.pluginUpdate") }}
                      </SButton>
                      <SButton
                        v-else-if="!rp.installed"
                        variant="success"
                        size="sm"
                        :loading="repoInstalling === rp.id"
                        @click="onInstallRepoPlugin(rp)"
                      >
                        <span class="mdi mdi-download mr-1" />
                        {{ $t("settings.reposPluginInstall") }}
                      </SButton>
                    </div>
                  </template>
                </div>
              </div>
            </template>

            <p v-else class="has-text-muted is-size-7">
              {{ $t("settings.reposNone") }}
            </p>

            <!-- Plugins installed from repositories -->
            <template v-if="repoInstalledProviderList.length">
              <SDivider class="my-4" />
              <h6 class="title is-6 mb-2">{{ $t("settings.reposInstalledTitle") }}</h6>
              <p class="has-text-grey is-size-7 mb-3">
                {{ $t("settings.reposInstalledDescription") }}
              </p>
              <div class="providers-list">
                <div
                  v-for="p in repoInstalledProviderList"
                  :key="p.id"
                  class="provider-item"
                  :class="{ 'is-disabled': !p.enabled }"
                >
                  <span class="provider-icon mdi" :class="p.icon" />
                  <div class="provider-details">
                    <div class="provider-name">
                      {{ p.name }}
                      <STag v-if="p.version" size="sm" variant="default" class="ml-1"
                        >v{{ p.version }}</STag
                      >
                      <STag
                        v-if="p.pluginType === 'torrent-search'"
                        size="sm"
                        variant="warning"
                        class="ml-1"
                        >torrent-search</STag
                      >
                      <STag v-else-if="p.mediaType" size="sm" variant="info" class="ml-1">{{
                        p.mediaType
                      }}</STag>
                    </div>
                    <div class="provider-desc">
                      {{ p.description }}
                      <STag
                        v-if="p.sourceRepoId && repoNameById[p.sourceRepoId]"
                        size="sm"
                        variant="default"
                        class="ml-2"
                      >
                        <span class="mdi mdi-source-repository mr-1" />{{
                          repoNameById[p.sourceRepoId]
                        }}
                      </STag>
                    </div>
                  </div>
                  <SSwitch
                    :model-value="p.enabled"
                    @update:model-value="onToggleProvider(p.id, $event)"
                  />
                  <SButton
                    v-if="isAdmin && pluginUpdates[p.id]"
                    variant="primary"
                    size="sm"
                    :loading="pluginUpdating === p.id"
                    :title="
                      $t('settings.pluginUpdateAvailable', {
                        version: pluginUpdates[p.id]?.latestVersion,
                      })
                    "
                    @click="onUpdatePlugin(p.id, pluginUpdates[p.id]!.url)"
                  >
                    <span class="mdi mdi-arrow-up-circle mr-1" />
                    {{ $t("settings.pluginUpdate") }}
                  </SButton>
                </div>
              </div>
            </template>
          </template>
        </div>
      </STabPane>
    </STabs>
  </SLoading>
</template>

<script setup lang="ts">
import type { STableColumn } from "~/components/s/STable.vue";
import type { TabPaneDef } from "~/components/s/STabs.vue";

const { t, locale, locales } = useI18n();
const { apiFetch } = useApi();
const auth = useAuth();
const { currentTheme, setTheme, saveToServer, THEME_META, canvasEnabled, setCanvasEnabled } =
  useTheme();
const route = useRoute();
const router = useRouter();

const VALID_TABS = [
  "theme",
  "language",
  "account",
  "integrations",
  "users",
  "downloadHistory",
  "providers",
  "ports",
];
const activeTab = ref(VALID_TABS.includes(route.hash.slice(1)) ? route.hash.slice(1) : "theme");
watch(activeTab, (tab) => router.replace({ hash: `#${tab}` }));
const loading = ref(false);
const savingTheme = ref(false);
const savingLocale = ref(false);

const isAdmin = computed(() => auth.user.value?.isAdmin === true);
const currentUserId = computed(() => auth.user.value?.id);

// Theme data
const themes = computed(() =>
  Object.entries(THEME_META).map(([key, meta]) => ({
    key,
    label: t(`themes.${key}.name`),
    icon: meta.icon.replace("mdi-", ""),
    desc: t(`themes.${key}.description`),
  })),
);
const selectedTheme = ref(currentTheme.value);
watch(currentTheme, (v) => {
  selectedTheme.value = v;
});

async function applyTheme() {
  savingTheme.value = true;
  try {
    setTheme(selectedTheme.value as any);
    await saveToServer(selectedTheme.value as any);
  } finally {
    savingTheme.value = false;
  }
}

// Language
const availableLocales = computed(() =>
  (locales.value as Array<{ code: string; name: string }>).map((l) => ({
    code: l.code,
    name: l.name,
  })),
);
const selectedLocale = ref(locale.value);

// Access the nuxt-i18n setLocale which handles lazy-loading + cookie
const { $i18n } = useNuxtApp();

async function applyLocale() {
  savingLocale.value = true;
  try {
    await ($i18n as any).setLocale(selectedLocale.value);
  } finally {
    savingLocale.value = false;
  }
}

// Tab panes (dynamic based on admin)
const tabPanes = computed<TabPaneDef[]>(() => {
  const p: TabPaneDef[] = [{ name: "theme", label: t("settings.theme") }];
  p.push({ name: "language", label: t("settings.language") });
  p.push({ name: "account", label: t("settings.account") });
  if (isAdmin.value) {
    p.push({ name: "integrations", label: t("settings.integrations") });
    p.push({ name: "users", label: t("settings.users") });
  }
  p.push({ name: "downloadHistory", label: t("settings.downloadHistory") });
  p.push({ name: "providers", label: t("settings.providers") });
  p.push({ name: "ports", label: t("ports.title") });
  return p;
});

// User table columns
const userCols = computed<STableColumn[]>(() => [
  { prop: "username", label: t("settings.columns.username") },
  { key: "role", label: t("settings.columns.role"), width: 100 },
  { prop: "created_at", label: t("settings.columns.created"), width: 160 },
  { key: "actions", label: "", width: 120 },
]);

// Account: change own password
const selfPwCurrent = ref("");
const selfPwNew = ref("");
const selfPwConfirm = ref("");
const savingSelfPw = ref(false);
const selfPwError = ref("");

async function submitSelfPw() {
  selfPwError.value = "";
  if (!selfPwCurrent.value) {
    selfPwError.value = t("settings.currentPasswordRequired");
    return;
  }
  if (selfPwNew.value.length < 4) {
    selfPwError.value = t("settings.passwordTooShort");
    return;
  }
  if (selfPwNew.value !== selfPwConfirm.value) {
    selfPwError.value = t("settings.passwordsDoNotMatch");
    return;
  }
  savingSelfPw.value = true;
  try {
    await apiFetch("/api/users/password", {
      method: "PATCH",
      body: {
        currentPassword: selfPwCurrent.value,
        newPassword: selfPwNew.value,
      },
    });
    selfPwCurrent.value = "";
    selfPwNew.value = "";
    selfPwConfirm.value = "";
  } catch (err: any) {
    selfPwError.value = err?.data?.statusMessage || err?.statusMessage || t("settings.saveFailed");
  } finally {
    savingSelfPw.value = false;
  }
}

// Admin: Users
const users = ref<any[]>([]);
const newUsername = ref("");
const newPassword = ref("");
const newIsAdmin = ref(false);

// Change-password dialog
const pwDialog = ref(false);
const pwUserId = ref<number | null>(null);
const pwUsername = ref("");
const pwNew = ref("");
const pwConfirm = ref("");
const savingPw = ref(false);
const pwMismatch = ref(false);

function openChangePw(row: any) {
  pwUserId.value = row.id;
  pwUsername.value = row.username;
  pwNew.value = "";
  pwConfirm.value = "";
  pwMismatch.value = false;
  pwDialog.value = true;
}

async function submitChangePw() {
  pwMismatch.value = pwNew.value !== pwConfirm.value;
  if (pwMismatch.value || !pwNew.value) return;
  savingPw.value = true;
  try {
    await apiFetch(`/api/admin/users/${pwUserId.value}`, {
      method: "PATCH",
      body: { password: pwNew.value },
    });
    pwDialog.value = false;
  } finally {
    savingPw.value = false;
  }
}

async function loadUsers() {
  if (!isAdmin.value) return;
  try {
    const res = await apiFetch<any>("/api/admin/users");
    users.value = res?.users || [];
  } catch {
    /* handled */
  }
}

async function addUser() {
  if (!newUsername.value || !newPassword.value) return;
  try {
    await apiFetch("/api/admin/users", {
      method: "POST",
      body: {
        username: newUsername.value,
        password: newPassword.value,
        isAdmin: newIsAdmin.value,
      },
    });
    newUsername.value = "";
    newPassword.value = "";
    newIsAdmin.value = false;
    await loadUsers();
  } catch {
    /* handled */
  }
}

async function removeUser(id: number) {
  try {
    await apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
    await loadUsers();
  } catch {
    /* handled */
  }
}

// Download History
interface HistoryEntry {
  id: number;
  url: string;
  title: string | null;
  service: string;
  sent_at: string;
}

const historyEntries = ref<HistoryEntry[]>([]);
const historyTotal = ref(0);
const historyPage = ref(1);
const historyPages = ref(1);
const historyLoading = ref(false);
const historyRedownloading = ref<number | null>(null);
const historyRemoving = ref<number | null>(null);
const { addToast } = useToast();

const historyCols = computed<STableColumn[]>(() => [
  { key: "title", label: t("settings.downloadHistoryColumns.title") },
  { key: "service", label: t("settings.downloadHistoryColumns.service"), width: 110 },
  { key: "date", label: t("settings.downloadHistoryColumns.date"), width: 160 },
  { key: "actions", label: "", width: 200 },
]);

const SERVICE_LABELS: Record<string, string> = {
  transmission: "Torrent",
  amule: "ED2K",
  pyload: "Direct",
  // legacy keys from earlier versions
  "dontorrent-movies": "Torrent",
  "dontorrent-shows": "Torrent",
  "transmission-search": "Torrent",
  yts: "Torrent",
  showrss: "Torrent",
};

function historyServiceLabel(service: string): string {
  return SERVICE_LABELS[service] ?? service;
}

function historyServiceVariant(
  service: string,
): "primary" | "success" | "warning" | "info" | "default" {
  const map: Record<string, "primary" | "success" | "warning" | "info"> = {
    transmission: "success",
    amule: "warning",
    pyload: "info",
    "dontorrent-movies": "success",
    "dontorrent-shows": "success",
    "transmission-search": "success",
    yts: "success",
    showrss: "success",
  };
  return map[service] ?? "default";
}

function formatHistoryDate(raw: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(raw));
  } catch {
    return raw;
  }
}

async function loadHistory(page = historyPage.value) {
  historyLoading.value = true;
  try {
    const res = await apiFetch<{
      entries: HistoryEntry[];
      total: number;
      page: number;
      pages: number;
    }>(`/api/download-history-list?page=${page}`);
    historyEntries.value = res.entries;
    historyTotal.value = res.total;
    historyPage.value = res.page;
    historyPages.value = res.pages;
  } catch {
    /* silent */
  } finally {
    historyLoading.value = false;
  }
}

async function gotoHistoryPage(page: number) {
  await loadHistory(page);
}

async function reDownload(entry: HistoryEntry) {
  historyRedownloading.value = entry.id;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: { action: "add", filename: entry.url },
    });
    addToast(t("settings.downloadHistorySent"), "success");
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.saveFailed"), "error");
  } finally {
    historyRedownloading.value = null;
  }
}

async function removeHistoryEntry(entry: HistoryEntry) {
  historyRemoving.value = entry.id;
  try {
    await apiFetch("/api/download-history-list", {
      method: "DELETE",
      body: { id: entry.id },
    });
    // Remove from local list optimistically
    historyEntries.value = historyEntries.value.filter((e) => e.id !== entry.id);
    historyTotal.value = Math.max(0, historyTotal.value - 1);
    addToast(t("settings.downloadHistoryRemoved"), "success");
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.saveFailed"), "error");
  } finally {
    historyRemoving.value = null;
  }
}

// Integrations: TVDB
const tvdbKeySet = ref(false);
const tvdbKeyInput = ref("");
const savingTvdb = ref(false);
const tmdbKeySet = ref(false);
const tmdbKeyInput = ref("");
const savingTmdb = ref(false);

async function loadIntegrations() {
  if (!isAdmin.value) return;
  try {
    const res = await apiFetch<{ tvdbApiKeySet: boolean; tmdbApiKeySet: boolean }>(
      "/api/admin/integrations",
    );
    tvdbKeySet.value = res?.tvdbApiKeySet ?? false;
    tmdbKeySet.value = res?.tmdbApiKeySet ?? false;
  } catch {
    /* handled */
  }
}

async function saveTvdbKey() {
  savingTvdb.value = true;
  try {
    await apiFetch("/api/admin/integrations", {
      method: "POST",
      body: { tvdbApiKey: tvdbKeyInput.value },
    });
    tvdbKeyInput.value = "";
    await loadIntegrations();
  } finally {
    savingTvdb.value = false;
  }
}

async function clearTvdbKey() {
  savingTvdb.value = true;
  try {
    await apiFetch("/api/admin/integrations", {
      method: "POST",
      body: { tvdbApiKey: "" },
    });
    tvdbKeyInput.value = "";
    await loadIntegrations();
  } finally {
    savingTvdb.value = false;
  }
}

async function saveTmdbKey() {
  savingTmdb.value = true;
  try {
    await apiFetch("/api/admin/integrations", {
      method: "POST",
      body: { tmdbApiKey: tmdbKeyInput.value },
    });
    tmdbKeyInput.value = "";
    await loadIntegrations();
  } finally {
    savingTmdb.value = false;
  }
}

async function clearTmdbKey() {
  savingTmdb.value = true;
  try {
    await apiFetch("/api/admin/integrations", {
      method: "POST",
      body: { tmdbApiKey: "" },
    });
    tmdbKeyInput.value = "";
    await loadIntegrations();
  } finally {
    savingTmdb.value = false;
  }
}

// ── Providers ─────────────────────────────────────────────────────────────
import type { ProviderMeta, UpdateInfo } from "~/composables/useProviders";
import type { RepoPluginEntry, RepoPluginsResult } from "~/composables/usePluginRepos";

const { loadProviders, toggleProvider, uploadPlugin, deletePlugin, installFromUrl, checkUpdates } =
  useProviders();
const { repos, reposLoading, loadRepos, addRepo, removeRepo, fetchRepoPlugins } = usePluginRepos();
const providerList = ref<ProviderMeta[]>([]);
const providersLoading = ref(false);
const pluginUploading = ref(false);
const pluginFileInput = ref<HTMLInputElement | null>(null);

// Update tracking
const pluginUpdates = ref<Record<string, UpdateInfo>>({});
const pluginUpdating = ref<string | null>(null);

const mediaProviderList = computed(() =>
  providerList.value.filter((p) => p.pluginType !== "torrent-search" && !p.sourceRepoId),
);
const torrentSearchProviderList = computed(() =>
  providerList.value.filter((p) => p.pluginType === "torrent-search" && !p.sourceRepoId),
);
const repoInstalledProviderList = computed(() =>
  providerList.value.filter((p) => p.sourceRepoId != null),
);
const repoNameById = computed(() =>
  Object.fromEntries(repos.value.map((r) => [r.id, r.name || r.url])),
);

async function loadProviderList() {
  providersLoading.value = true;
  try {
    providerList.value = await loadProviders(true);
    // Check for updates in background (no await, silent fail)
    checkUpdates()
      .then((updates) => {
        pluginUpdates.value = Object.fromEntries(
          updates.filter((u) => u.hasUpdate).map((u) => [u.id, u]),
        );
      })
      .catch(() => {});
  } catch {
    /* silent */
  } finally {
    providersLoading.value = false;
  }
}

async function onToggleProvider(id: string, enabled: boolean) {
  try {
    await toggleProvider(id, enabled);
    providerList.value = providerList.value.map((p) => (p.id === id ? { ...p, enabled } : p));
  } catch {
    /* silent */
  }
}

function triggerPluginUpload() {
  pluginFileInput.value?.click();
}

async function onPluginFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  pluginUploading.value = true;
  try {
    await uploadPlugin(file);
    await loadProviderList();
  } catch {
    /* silent */
  } finally {
    pluginUploading.value = false;
    if (pluginFileInput.value) pluginFileInput.value.value = "";
  }
}

async function onDeletePlugin(id: string, name: string) {
  if (!confirm(t("settings.pluginDeleteConfirm", { name }))) return;
  try {
    await deletePlugin(id);
    providerList.value = providerList.value.filter((p) => p.id !== id);
    delete pluginUpdates.value[id];
  } catch {
    /* silent */
  }
}

async function onUpdatePlugin(id: string, url: string) {
  if (
    !confirm(
      t("settings.pluginUpdateConfirm", {
        name: providerList.value.find((p) => p.id === id)?.name ?? id,
      }),
    )
  )
    return;
  pluginUpdating.value = id;
  try {
    await installFromUrl(url);
    addToast(t("settings.pluginUpdateSuccess"), "success");
    delete pluginUpdates.value[id];
    await loadProviderList();
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.saveFailed"), "error");
  } finally {
    pluginUpdating.value = null;
  }
}

// ── Plugin Repositories ────────────────────────────────────────────────────

const newRepoUrl = ref("");
const repoAdding = ref(false);
const repoRefreshing = ref<number | null>(null);
const repoInstalling = ref<string | null>(null);
const expandedRepos = ref<Record<number, boolean>>({});
const repoPluginsData = ref<Record<number, RepoPluginsResult | null>>({});
const repoPluginsError = ref<Record<number, string>>({});

function toggleRepoExpanded(id: number) {
  if (expandedRepos.value[id]) {
    expandedRepos.value[id] = false;
  } else {
    expandedRepos.value[id] = true;
    if (!repoPluginsData.value[id]) {
      loadRepoPlugins(id);
    }
  }
}

async function loadRepoPlugins(repoId: number) {
  repoRefreshing.value = repoId;
  delete repoPluginsError.value[repoId];
  try {
    repoPluginsData.value[repoId] = await fetchRepoPlugins(repoId);
  } catch (err: any) {
    repoPluginsError.value[repoId] =
      err?.data?.statusMessage || err?.message || t("settings.reposFetchError");
  } finally {
    repoRefreshing.value = null;
  }
}

async function onAddRepo() {
  const url = newRepoUrl.value.trim();
  if (!url) return;
  repoAdding.value = true;
  try {
    const repo = await addRepo(url);
    newRepoUrl.value = "";
    await loadProviderList();
    // Auto-expand and load plugins for the newly added repo
    expandedRepos.value[repo.id] = true;
    loadRepoPlugins(repo.id);
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.saveFailed"), "error");
  } finally {
    repoAdding.value = false;
  }
}

async function onRemoveRepo(repo: { id: number; name: string | null; url: string }) {
  const label = repo.name || repo.url;
  if (!confirm(t("settings.reposRemoveConfirm", { name: label }))) return;
  try {
    await removeRepo(repo.id);
    delete repoPluginsData.value[repo.id];
    delete repoPluginsError.value[repo.id];
    delete expandedRepos.value[repo.id];
    await loadProviderList();
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.saveFailed"), "error");
  }
}

async function onInstallRepoPlugin(rp: RepoPluginEntry) {
  repoInstalling.value = rp.id;
  try {
    await installFromUrl(rp.url);
    addToast(t("settings.reposInstallSuccess"), "success");
    await loadProviderList();
    // Refresh all expanded repos to update installed/hasUpdate states
    for (const repoId of Object.keys(expandedRepos.value).map(Number)) {
      if (expandedRepos.value[repoId]) loadRepoPlugins(repoId);
    }
  } catch (err: any) {
    addToast(err?.data?.statusMessage || err?.message || t("settings.reposInstallError"), "error");
  } finally {
    repoInstalling.value = null;
  }
}

onMounted(async () => {
  loading.value = true;
  await Promise.all([loadUsers(), loadIntegrations()]);
  loading.value = false;
  // Load history after main content so it doesn't block the UI
  if (activeTab.value === "downloadHistory") loadHistory();
  if (activeTab.value === "providers") {
    loadProviderList();
    if (isAdmin.value) loadRepos();
  }
});
watch(activeTab, (tab) => {
  if (tab === "downloadHistory" && !historyEntries.value.length && !historyLoading.value) {
    loadHistory();
  }
  if (tab === "providers" && !providerList.value.length && !providersLoading.value) {
    loadProviderList();
    if (isAdmin.value && !repos.value.length) loadRepos();
  }
  if (tab === "ports") refresh();
});

// Port status
const { ports, privateIp, publicIp, checking, refresh } = usePortStatus();
</script>

<style scoped>
.stt-btn-row {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

/* Port status panel */
.ports-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.port-flow-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.port-flow-row {
  background: var(--s-bg-card, var(--s-bg-hover));
  border: 1px solid var(--s-border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.port-flow-service {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--s-text-muted);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.port-proto-tag {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.1em 0.4em;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--s-border);
  color: var(--s-text-muted);
  &.tcp {
    background: rgba(99, 179, 237, 0.18);
    color: #63b3ed;
  }
  &.udp {
    background: rgba(154, 117, 234, 0.18);
    color: #9a75ea;
  }
}

.port-flow-diagram {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.port-flow-arrow {
  color: var(--s-text-muted);
  opacity: 0.45;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.port-node {
  flex: 1;
  min-width: 110px;
  border: 1px solid var(--s-border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;

  .port-node-title {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.5;
  }

  .port-node-ip {
    font-size: 0.8rem;
    font-weight: 500;
    font-family: monospace;
  }

  .port-node-port {
    font-size: 0.75rem;
    font-family: monospace;
    opacity: 0.65;
  }

  &.private {
    border-color: rgba(99, 179, 237, 0.35);
    background: rgba(99, 179, 237, 0.05);
  }

  &.public {
    border-color: rgba(246, 173, 85, 0.35);
    background: rgba(246, 173, 85, 0.05);
  }

  &.internet {
    align-items: center;
    text-align: center;
    min-width: 90px;
    flex: 0 0 auto;
    transition:
      border-color 0.3s,
      background 0.3s;

    .port-status-icon {
      font-size: 1.6rem;
      transition: color 0.3s;
    }

    .port-node-label {
      font-size: 0.7rem;
      font-weight: 600;
    }

    &.is-open {
      border-color: rgba(34, 197, 94, 0.5);
      background: rgba(34, 197, 94, 0.07);
      .port-status-icon {
        color: #22c55e;
      }
      .port-node-label {
        color: #22c55e;
      }
    }

    &.is-closed {
      border-color: rgba(239, 68, 68, 0.5);
      background: rgba(239, 68, 68, 0.07);
      .port-status-icon {
        color: #ef4444;
      }
      .port-node-label {
        color: #ef4444;
      }
    }

    &.is-checking .port-status-icon {
      color: var(--s-text-muted);
    }

    &.is-udp {
      opacity: 0.5;
      .port-status-icon {
        color: var(--s-text-muted);
      }
    }
  }
}

.stt-actions {
  display: flex;
  gap: 6px;
}
.dh-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.dh-title {
  display: block;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
}
.dh-pagination {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
  justify-content: flex-end;
}
.dh-page-info {
  font-size: 0.82rem;
  color: var(--s-text-muted);
  white-space: nowrap;
}

/* Providers */
.providers-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.providers-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.provider-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  transition: opacity 0.15s;

  &.is-disabled {
    opacity: 0.5;
  }
}
.provider-icon {
  font-size: 1.6rem;
  color: var(--s-accent);
  flex-shrink: 0;
}
.provider-details {
  flex: 1;
  min-width: 0;
}
.provider-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--s-text);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.provider-desc {
  font-size: 0.78rem;
  color: var(--s-text-muted);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.plugin-docs {
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  overflow: hidden;
}
.plugin-docs-summary {
  padding: 0.5rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  color: var(--s-text-muted);
  background: var(--s-bg-surface);

  &:hover {
    color: var(--s-text);
  }
}
.plugin-docs-body {
  padding: 0.75rem;
  background: var(--s-bg);
  border-top: 1px solid var(--s-border);
}
.plugin-docs-code {
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  padding: 0.75rem;
  font-size: 0.78rem;
  overflow-x: auto;
  margin: 0;
  tab-size: 2;
  white-space: pre;
}

/* ── Plugin Repositories ───────────────────────────────────────── */
.repo-add-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.repo-add-input {
  flex: 1;
  min-width: 0;
}
.repo-block {
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  overflow: hidden;
}
.repo-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.75rem;
  background: var(--s-bg-surface);
  cursor: pointer;
  user-select: none;
  font-size: 0.84rem;
  font-weight: 600;

  &:hover {
    background: var(--s-bg-hover);
  }
}
.repo-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.repo-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.repo-header-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.repo-chevron {
  color: var(--s-text-muted);
  font-size: 1rem;
  flex-shrink: 0;
}
.repo-plugins {
  border-top: 1px solid var(--s-border);
  background: var(--s-bg);
}
.repo-plugin-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--s-border);
  &:last-child {
    border-bottom: none;
  }
}
</style>
