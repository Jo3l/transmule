<template>
  <div id="page-downloads">
    <div class="level mb-4">
      <div class="level-left">
              </div>
      <div class="level-right flex-row gap-sm">
        <SButton
          variant="primary"
          size="sm"
          :disabled="transmissionStopped"
          @click="showAddTorrent = true"
          icon="mdi-magnet"
        >
          {{ $t("downloads.addTorrent") }}
        </SButton>
        <SButton variant="primary" size="sm" :disabled="amuleStopped" @click="showAddLink = true" icon="mdi-donkey">
          {{ $t("downloads.addEd2k") }}
        </SButton>
        <SButton
          variant="primary"
          size="sm"
          :disabled="pyloadStopped"
          @click="showAddPyload = true"
          icon="mdi-download"
        >
          {{ $t("downloads.addPyload") }}
        </SButton>
      </div>
    </div>

    <!-- Totals -->
    <div class="box py-3 mb-4" v-if="amuleTotals || torrentTotals || pyloadTotals">
      <div class="totals-bar">
        <div class="total-item" v-if="amuleTotals">
          <span class="mdi mdi-donkey icon-sm" />
          <strong>{{ amuleTotals.speed_fmt || "0" }}</strong>
          <span class="has-text-grey is-size-7 ml-1">({{ amuleCount }} {{ $t("nav.files") }})</span>
        </div>
        <div class="total-item" v-if="torrentTotals">
          <span class="mdi mdi-magnet" />
          <strong
            >&#8595;{{ torrentTotals.speed_down_fmt || "0" }} &#8593;{{
              torrentTotals.speed_up_fmt || "0"
            }}</strong
          >
          <span class="has-text-grey is-size-7 ml-1"
            >({{ torrentCount }} {{ $t("downloads.torrents") }})</span
          >
        </div>
        <div class="total-item" v-if="pyloadTotals">
          <span class="mdi mdi-cloud-download" />
          <strong>{{ pyloadTotals.totalSpeed_fmt || "0" }}</strong>
          <span class="has-text-grey is-size-7 ml-1"
            >({{ pyloadCount }} {{ $t("downloads.packages") }})</span
          >
        </div>
        <div class="total-item" v-if="slskdTotals">
          <span class="mdi mdi-account-music" />
          <strong>{{ slskdSpeedFmt }}</strong>
          <span class="has-text-grey is-size-7 ml-1">({{ slskdCount }} Soulseek)</span>
        </div>
        <div class="total-item">
          <span class="mdi mdi-file-multiple" />
          {{ allFiles.length }} {{ $t("downloads.total") }}
        </div>
      </div>
      <SpeedGraph ref="speedGraphRef" :history="speedHistory" />
    </div>

    <!-- Filters -->
    <div class="columns is-mobile mb-2 is-vcentered">
      <div class="column is-narrow">
        <SFormItem :label="$t('downloads.filter.source')">
          <SSelect
            v-model="filterSource"
            :options="sourceOptions"
            clearable
            :placeholder="$t('downloads.filter.all')"
            class="w-130"
            @update:model-value="applyFilter"
          />
        </SFormItem>
      </div>
      <div class="column is-narrow">
        <SFormItem :label="$t('downloads.filter.status')">
          <SSelect
            v-model="filterStatus"
            :options="statusOptions"
            clearable
            :placeholder="$t('downloads.filter.all')"
            class="w-150"
            @update:model-value="applyFilter"
          />
        </SFormItem>
      </div>
      <div class="column is-narrow">
        <SFormItem :label="$t('downloads.filter.sort')">
          <SSelect
            v-model="sortBy"
            :options="sortOptions"
            clearable
            :placeholder="$t('downloads.filter.default')"
            class="w-140"
            @update:model-value="applyFilter"
          />
        </SFormItem>
      </div>
      <!-- Spacer -->
      <div class="column"></div>
      <!-- Clear downloaded button -->
      <div class="column is-narrow is-align-self-flex-end pb-3">
        <SButton
          size="sm"
          variant="default"
          :loading="clearingDownloaded"
          :title="$t('downloads.clearDownloaded')"
          @click="clearDownloaded"
          icon="mdi-broom"
        >
          {{ $t("downloads.clearDownloaded") }}
        </SButton>
      </div>
      <!-- Action buttons (desktop only, shown when items selected) -->
      <div
        class="column is-narrow is-hidden-mobile"
        v-if="totalSelected > 0"
      >
        <div class="buttons mb-0">
          <span class="is-size-7 has-text-grey mr-1 is-align-self-center"
            >{{ totalSelected }} selected:</span
          >
          <SButton variant="success" size="sm" @click="doUnifiedAction('start')" icon="mdi-play">
            {{ $t("downloads.actions.start") }}
          </SButton>
          <SButton variant="warning" size="sm" @click="doUnifiedAction('stop')" icon="mdi-pause">
            {{ $t("downloads.actions.stop") }}
          </SButton>
          <SButton variant="danger" size="sm" @click="doUnifiedAction('cancel')" icon="mdi-delete">
            {{ $t("downloads.actions.cancel") }}
          </SButton>
        </div>
      </div>
    </div>

    <!-- Mobile cards (≤768px) -->
    <div class="is-hidden-tablet" @click.stop>
      <div v-if="loading" class="has-text-centered py-5 has-text-grey">
        <span class="mdi mdi-loading mdi-spin icon-lg" />
      </div>
      <div v-else-if="filteredFiles.length === 0" class="has-text-centered py-5 has-text-grey">
        <span class="mdi mdi-tray-alert icon-lg" />
        <p>{{ $t("downloads.noDownloads") }}</p>
      </div>
      <div v-else class="mobile-cards">
        <div
          v-for="row in filteredFiles"
          :key="row._uid"
          class="download-card"
          :class="{ 'is-expanded': isOpen(row._uid) }"
          @click="toggleDetail(row)"
        >
          <!-- type + name + status + chevron -->
          <div class="card-header-row">
            <span v-if="row._type === 'amule'" class="mdi mdi-donkey card-type-icon text-warning" />
            <span
              v-else-if="row._type === 'torrent'"
              class="mdi mdi-magnet card-type-icon text-accent"
            />
            <span v-else-if="row._type === 'pyload'" class="mdi mdi-cloud-download card-type-icon text-info" />
            <span v-else-if="row._type === 'slskd'" class="mdi mdi-bird card-type-icon text-primary" />
            <span class="card-name">{{ row.name }}</span>
            <STag v-if="row._type === 'amule'" :variant="amuleStatusType(row.status)" size="sm">{{
              row.status
            }}</STag>
            <STag
              v-else-if="row._type === 'torrent'"
              :variant="torrentStatusType(row.status)"
              size="sm"
              >{{ row.statusLabel }}</STag
            >
            <STag
              v-else-if="row._type === 'pyload'"
              :variant="
                row.activeLinks > 0
                  ? 'info'
                  : row.failedLinks > 0
                    ? 'danger'
                    : row.finishedLinks === row.linkCount && row.linkCount > 0
                      ? 'success'
                      : 'default'
              "
              size="sm"
              >{{
                row.activeLinks > 0
                  ? $t("pyload.downloading")
                  : row.failedLinks > 0
                    ? $t("pyload.failed")
                    : row.finishedLinks === row.linkCount && row.linkCount > 0
                      ? $t("pyload.finished")
                      : row.dest === "queue"
                        ? $t("pyload.destQueue")
                        : $t("pyload.destCollector")
              }}</STag
            >
            <STag v-else-if="row._type === 'slskd'" variant="default" size="sm">{{
              row.status
            }}</STag>
            <span
              class="mdi card-chevron"
              :class="isOpen(row._uid) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            />
          </div>

          <!-- Progress bar -->
          <div>
            <template v-if="row._type === 'amule'">
              <ChunkProgressBar
                v-if="chunkData[row.hash]"
                :chunks="chunkData[row.hash].chunks"
                :availability="chunkData[row.hash].availability"
              />
              <SProgress
                v-else
                :percentage="row.progress || 0"
                :color="amuleProgressColor(row.status)"
                :height="10"
              />
            </template>
            <SProgress
              v-else-if="row._type === 'torrent'"
              :percentage="Math.round(row.percentDone * 100)"
              :color="torrentProgressColor(row.status)"
              :height="10"
            />
            <SProgress
              v-else-if="row._type === 'pyload'"
              :percentage="row.progress || 0"
              :color="
                row.activeLinks > 0
                  ? 'var(--s-info)'
                  : row.failedLinks > 0
                    ? 'var(--s-danger)'
                    : 'var(--s-text-muted)'
              "
              :height="10"
            />
            <SProgress
              v-else-if="row._type === 'slskd'"
              :percentage="row.progress || 0"
              :color="row.status === 'Downloading' ? 'var(--s-info)' : row.status === 'Complete' ? 'var(--s-success)' : 'var(--s-text-muted)'"
              :height="10"
            />
            <div class="card-progress-label">
              <template v-if="row._type === 'amule'"
                >{{ row.size_done_fmt }} / {{ row.size_fmt }} ({{ row.progress || 0 }}%)</template
              >
              <template v-else-if="row._type === 'torrent'"
                >{{ Math.round(row.percentDone * 100) }}% &mdash; {{ row.totalSize_fmt }}</template
              >
              <template v-else-if="row._type === 'pyload'"
                >{{ row.doneSize_fmt }} / {{ row.totalSize_fmt }} ({{
                  (row.progress || 0).toFixed(1)
                }}%)</template
              >
              <template v-else-if="row._type === 'slskd'"
                >{{ row.doneSize_fmt }} / {{ row.totalSize_fmt }} ({{
                  (row.progress || 0).toFixed(1)
                }}%)</template
              >
            </div>
          </div>

          <!-- Stats row -->
          <div class="card-stats">
            <span class="card-stat">
              <span class="mdi mdi-download" />
              {{
                row._type === "amule"
                  ? row.speed_fmt
                  : row._type === "torrent"
                    ? row.rateDownload_fmt
                    : row.speed_fmt
              }}
            </span>
            <span v-if="row._type === 'amule' || row._type === 'torrent'" class="card-stat">
              <span class="mdi mdi-account-group" />
              <template v-if="row._type === 'amule'"
                >{{ row.sourceCountXfer || 0 }}/{{ row.sourceCount || 0 }}</template
              >
              <template v-else
                >{{ row.peersSendingToUs || 0 }}/{{ row.peersConnected || 0 }}</template
              >
            </span>
            <span v-if="row._type === 'pyload' && row.activeLinks > 0" class="card-stat">
              <span class="mdi mdi-link" />
              {{ row.activeLinks }} {{ $t("pyload.downloading") }}
            </span>
          </div>

          <!-- Expandable detail panel -->
          <div v-if="isOpen(row._uid)" class="card-detail" @click.stop>
            <!-- Action buttons at top -->
            <div class="card-actions">
              <template v-if="row._type === 'amule'">
                <SButton
                  v-if="row.status !== 'Paused'"
                  variant="warning"
                  size="sm"
                  @click="doCardAction(row, 'pause')"
                  icon="mdi-pause"
                />
                <SButton v-else variant="success" size="sm" @click="doCardAction(row, 'resume')" icon="mdi-play" />
                <SButton variant="danger" size="sm" @click="doCardAction(row, 'cancel')" icon="mdi-close-circle" />
              </template>
              <template v-else-if="row._type === 'torrent'">
                <SButton variant="success" size="sm" @click="doCardAction(row, 'start')" icon="mdi-play" />
                <SButton variant="warning" size="sm" @click="doCardAction(row, 'stop')" icon="mdi-pause" />
                <SButton variant="danger" size="sm" @click="doCardAction(row, 'remove_data')" icon="mdi-delete" />
              </template>
              <template v-else>
                <SButton variant="success" size="sm" @click="doCardAction(row, 'restart')" icon="mdi-play" />
                <SButton
                  v-if="row.activeLinks > 0"
                  variant="warning"
                  size="sm"
                  @click="doCardAction(row, 'stop')"
                  icon="mdi-pause"
                />
                <SButton variant="danger" size="sm" @click="doCardAction(row, 'delete')" icon="mdi-delete" />
              </template>
            </div>

            <!-- Info key-values -->
            <div class="card-kv-list">
              <!-- Hash / ID -->
              <div class="card-kv-row">
                <span class="card-kv-label">{{ $t("downloads.info.hash") }}</span>
                <span class="card-kv-value card-kv-hash">{{
                  row._type === "amule"
                    ? row.hash
                    : row._type === "pyload"
                      ? "pkg-" + row.pid
                      : row.hashString
                }}</span>
              </div>
              <!-- Size -->
              <div class="card-kv-row">
                <span class="card-kv-label">{{ $t("downloads.info.size") }}</span>
                <span class="card-kv-value">
                  <template v-if="row._type === 'amule'"
                    >{{ row.size_fmt }} ({{ row.size_done_fmt }}
                    {{ $t("downloads.info.done") }})</template
                  >
                  <template v-else>{{ row.totalSize_fmt }}</template>
                </span>
              </div>
              <!-- Speed -->
              <div class="card-kv-row">
                <span class="card-kv-label">{{ $t("downloads.info.speed") }}</span>
                <span class="card-kv-value">{{
                  row._type === "torrent" ? row.rateDownload_fmt : row.speed_fmt
                }}</span>
              </div>
              <!-- aMule-specific -->
              <template v-if="row._type === 'amule'">
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.info.sources") }}</span>
                  <span class="card-kv-value"
                    >{{ row.sourceCountXfer || 0 }}/{{ row.sourceCount || 0 }} ({{
                      row.sourceCountA4AF || 0
                    }}
                    {{ $t("downloads.info.a4af") }})</span
                  >
                </div>
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.info.priority") }}</span>
                  <span class="card-kv-value">{{ row.priority }}</span>
                </div>
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.info.category") }}</span>
                  <span class="card-kv-value">{{ row.category }}</span>
                </div>
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.info.lastSeenComplete") }}</span>
                  <span class="card-kv-value">{{ formatTimestamp(row.lastSeenComplete) }}</span>
                </div>
              </template>
              <!-- Torrent-specific -->
              <template v-if="row._type === 'torrent'">
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.info.peers") }}</span>
                  <span class="card-kv-value"
                    >{{ row.peersSendingToUs }} {{ $t("downloads.info.sending") }},
                    {{ row.peersGettingFromUs }} {{ $t("downloads.info.receiving") }} ({{
                      row.peersConnected
                    }}
                    {{ $t("downloads.info.connected") }})</span
                  >
                </div>
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.info.eta") }}</span>
                  <span class="card-kv-value">{{ row.eta_fmt }}</span>
                </div>
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.info.uploaded") }}</span>
                  <span class="card-kv-value"
                    >{{ row.uploadedEver_fmt }} ({{
                      row.uploadRatio >= 0 ? row.uploadRatio.toFixed(2) : "—"
                    }})</span
                  >
                </div>
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.info.location") }}</span>
                  <span class="card-kv-value">{{ row.downloadDir }}</span>
                </div>
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.info.added") }}</span>
                  <span class="card-kv-value">{{ formatTimestamp(row.addedDate) }}</span>
                </div>
              </template>
              <!-- pyLoad-specific -->
              <template v-if="row._type === 'pyload'">
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.pyload.folder") }}</span>
                  <span class="card-kv-value">{{ row.folder }}</span>
                </div>
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.pyload.activeLinks") }}</span>
                  <span class="card-kv-value has-text-success">{{ row.activeLinks }}</span>
                </div>
                <div v-if="row.failedLinks > 0" class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.pyload.failedLinks") }}</span>
                  <span class="card-kv-value has-text-danger">{{ row.failedLinks }}</span>
                </div>
                <div class="card-kv-row">
                  <span class="card-kv-label">{{ $t("downloads.pyload.finishedLinks") }}</span>
                  <span class="card-kv-value">{{ row.finishedLinks }} / {{ row.linkCount }}</span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Desktop table + action buttons (≥769px) -->
    <div class="is-hidden-mobile" @click.stop>
      <!-- Unified downloads table -->
      <STable
        :data="filteredFiles"
        :columns="mainColumns"
        :loading="loading"
        row-key="_uid"
        :expand-keys="openedDetails"
        :row-class="dlRowClass"
        stripe
        size="md"
        @row-click="onDlRowClick"
        @row-contextmenu="onDlRowContextmenu"
      >
        <!-- Type icon cell -->
        <template #cell-icon="{ row }">
          <span
            v-if="row._type === 'amule'"
            class="mdi mdi-donkey type-icon text-warning"
            :title="$t('downloads.tooltip.amule')"
          />
          <span
            v-else-if="row._type === 'torrent'"
            class="mdi mdi-magnet type-icon text-accent"
            :title="$t('downloads.tooltip.torrent')"
          />
          <span
            v-else-if="row._type === 'pyload'"
            class="mdi mdi-cloud-download type-icon text-info"
            :title="$t('downloads.tooltip.pyload')"
          />
          <span
            v-else-if="row._type === 'slskd'"
            class="mdi mdi-bird type-icon text-primary"
            title="Soulseek"
          />
        </template>

        <!-- Name cell (clickable for expand) -->
        <template #cell-name="{ row }">
          <a class="file-name-link" href="#" @click.prevent="toggleDetail(row)">
            <span
              class="mdi mdi-chevron-right detail-chevron"
              :class="{ 'is-open': isOpen(row._uid) }"
            />
            {{ row.name }}
          </a>
        </template>

        <!-- Size cell -->
        <template #cell-size="{ row }">
          {{ row._type === "amule" ? row.size_fmt : row.totalSize_fmt }}
        </template>

        <!-- Progress cell -->
        <template #cell-progress="{ row }">
          <template v-if="row._type === 'amule'">
            <ChunkProgressBar
              v-if="chunkData[row.hash]"
              :chunks="chunkData[row.hash].chunks"
              :availability="chunkData[row.hash].availability"
            />
            <SProgress
              v-else
              :percentage="row.progress || 0"
              :color="amuleProgressColor(row.status)"
              :height="12"
            />
            <span class="is-size-7 has-text-grey ml-1">{{ row.progress || 0 }}%</span>
          </template>
          <SProgress
            v-else-if="row._type === 'torrent'"
            :percentage="Math.round(row.percentDone * 100)"
            :color="torrentProgressColor(row.status)"
            :height="12"
          />
          <SProgress
            v-else-if="row._type === 'pyload'"
            :percentage="row.progress || 0"
            :color="
              row.activeLinks > 0
                ? 'var(--s-info)'
                : row.failedLinks > 0
                  ? 'var(--s-danger)'
                  : 'var(--s-text-muted)'
            "
            :height="12"
          />
          <SProgress
            v-else-if="row._type === 'slskd'"
            :percentage="row.progress || 0"
            :color="row.status === 'Downloading' ? 'var(--s-info)' : row.status === 'Complete' ? 'var(--s-success)' : 'var(--s-text-muted)'"
            :height="12"
          />
        </template>

        <!-- Speed cell -->
        <template #cell-speed="{ row }">
          <template v-if="row._type === 'amule'">{{ row.speed_fmt }}</template>
          <template v-else-if="row._type === 'torrent'">{{ row.rateDownload_fmt }}</template>
          <template v-else-if="row._type === 'pyload'">{{ row.speed_fmt }}</template>
          <template v-else-if="row._type === 'slskd'">{{ row.speed_fmt }}</template>
        </template>

        <!-- Peers cell -->
        <template #cell-peers="{ row }">
          <template v-if="row._type === 'amule'"
            >{{ row.sourceCountXfer || 0 }}/{{ row.sourceCount || 0 }}</template
          >
          <template v-else-if="row._type === 'slskd'">&mdash;&nbsp;/&nbsp;&mdash;</template>
          <template v-else>{{ row.peersSendingToUs || 0 }}/{{ row.peersConnected || 0 }}</template>
        </template>

        <!-- Status cell -->
        <template #cell-status="{ row }">
          <STag v-if="row._type === 'amule'" :variant="amuleStatusType(row.status)" size="sm">{{
            row.status
          }}</STag>
          <STag
            v-else-if="row._type === 'torrent'"
            :variant="torrentStatusType(row.status)"
            size="sm"
            >{{ row.statusLabel }}</STag
          >
          <STag
            v-else-if="row._type === 'pyload'"
            :variant="
              row.activeLinks > 0
                ? 'info'
                : row.failedLinks > 0
                  ? 'danger'
                  : row.finishedLinks === row.linkCount && row.linkCount > 0
                    ? 'success'
                    : 'default'
            "
            size="sm"
            >{{
              row.activeLinks > 0
                ? $t("pyload.downloading")
                : row.failedLinks > 0
                  ? $t("pyload.failed")
                  : row.finishedLinks === row.linkCount && row.linkCount > 0
                    ? $t("pyload.finished")
                    : row.dest === "queue"
                      ? $t("pyload.destQueue")
                      : $t("pyload.destCollector")
            }}</STag
          >
          <STag v-else-if="row._type === 'slskd'" size="sm" :variant="row.status === 'Downloading' ? 'info' : row.status === 'Complete' ? 'success' : row.status === 'Waiting' ? 'default' : 'default'">{{ row.status }}</STag>
        </template>

        <!-- ═══ EXPAND SLOT ═══ -->
        <template #expand="{ row }">
          <div class="detail-panel">
            <STabs
              v-model="detailTab[row._uid]"
              variant="card"
              :panes="
                row._type === 'amule'
                  ? amulePanes
                  : row._type === 'pyload'
                    ? pyloadPanes
                    : row._type === 'slskd'
                      ? slskdPanes
                      : torrentPanes
              "
            >
              <!-- ── Info tab (both types) ── -->
              <STabPane
                name="info"
                :label="$t('downloads.info.title')"
                :active="detailTab[row._uid] === 'info'"
              >
                <div class="columns is-multiline">
                  <div class="column is-6">
                    <h6 class="title is-6 mb-2">
                      {{ $t("downloads.info.title") }}
                    </h6>
                    <div class="kv-list">
                      <div class="kv-row">
                        <span class="kv-label">{{ $t("downloads.info.hash") }}</span>
                        <span class="kv-value hash-cell">{{
                          row._type === "amule"
                            ? row.hash
                            : row._type === "pyload"
                              ? "pkg-" + row.pid
                              : row._type === "slskd"
                                ? row.id
                                : row.hashString
                        }}</span>
                      </div>
                      <div class="kv-row">
                        <span class="kv-label">{{ $t("downloads.info.size") }}</span>
                        <span class="kv-value">
                          <template v-if="row._type === 'amule'">
                            {{ row.size_fmt }} ({{ row.size_done_fmt }}
                            {{ $t("downloads.info.done") }})
                          </template>
                          <template v-else>
                            {{ row.totalSize_fmt }}
                          </template>
                        </span>
                      </div>
                      <!-- aMule-specific fields -->
                      <template v-if="row._type === 'amule'">
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.partName") }}</span>
                          <span class="kv-value">{{ row.partMetID }}.part.met</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.priority") }}</span>
                          <span class="kv-value">{{ row.priority }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.category") }}</span>
                          <span class="kv-value">{{ row.category }}</span>
                        </div>
                      </template>
                      <!-- pyLoad-specific fields -->
                      <template v-if="row._type === 'pyload'">
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.pyload.folder") }}</span>
                          <span class="kv-value">{{ row.folder }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.pyload.destination") }}</span>
                          <span class="kv-value">{{
                            row.dest === "queue"
                              ? $t("pyload.destQueue")
                              : $t("pyload.destCollector")
                          }}</span>
                        </div>
                      </template>
                      <!-- slskd-specific fields -->
                      <template v-if="row._type === 'slskd'">
                        <div class="kv-row">
                          <span class="kv-label">User</span>
                          <span class="kv-value">{{ row.username }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">Folder</span>
                          <span class="kv-value is-size-7">{{ row.folder || row.remoteFilename || "" }}</span>
                        </div>
                      </template>
                      <!-- Torrent-specific fields -->
                      <template v-if="row._type === 'torrent'">
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.downloaded") }}</span>
                          <span class="kv-value">{{ row.downloadedEver_fmt }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.uploaded") }}</span>
                          <span class="kv-value">{{ row.uploadedEver_fmt }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.ratio") }}</span>
                          <span class="kv-value">{{
                            row.uploadRatio >= 0 ? row.uploadRatio.toFixed(2) : "&mdash;"
                          }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.location") }}</span>
                          <span class="kv-value is-size-7">{{ row.downloadDir }}</span>
                        </div>
                        <div v-if="row.comment" class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.comment") }}</span>
                          <span class="kv-value is-size-7">{{ row.comment }}</span>
                        </div>
                        <div v-if="row.creator" class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.creator") }}</span>
                          <span class="kv-value">{{ row.creator }}</span>
                        </div>
                      </template>
                    </div>
                  </div>
                  <div class="column is-6">
                    <h6 class="title is-6 mb-2">
                      {{ $t("downloads.info.transfer") }}
                    </h6>
                    <div class="kv-list">
                      <div class="kv-row">
                        <span class="kv-label">{{ $t("downloads.info.status") }}</span>
                        <span class="kv-value">{{
                          row._type === "amule"
                            ? row.status
                            : row._type === "pyload"
                              ? row.dest === "queue"
                                ? $t("pyload.destQueue")
                                : $t("pyload.destCollector")
                              : row._type === "slskd"
                                ? row.status
                                : row.statusLabel
                        }}</span>
                      </div>
                      <div class="kv-row">
                        <span class="kv-label">{{ $t("downloads.info.progress") }}</span>
                        <span class="kv-value"
                          >{{
                            row._type === "amule" || row._type === "pyload" || row._type === "slskd"
                              ? row.progress
                              : Math.round(row.percentDone * 100)
                          }}%</span
                        >
                      </div>
                      <!-- pyLoad-specific transfer -->
                      <template v-if="row._type === 'pyload'">
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.speed") }}</span>
                          <span class="kv-value">{{ row.speed_fmt }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.pyload.activeLinks") }}</span>
                          <span class="kv-value has-text-success">{{ row.activeLinks }}</span>
                        </div>
                        <div class="kv-row" v-if="row.failedLinks > 0">
                          <span class="kv-label">{{ $t("downloads.pyload.failedLinks") }}</span>
                          <span class="kv-value has-text-danger">{{ row.failedLinks }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.pyload.finishedLinks") }}</span>
                          <span class="kv-value"
                            >{{ row.finishedLinks }} / {{ row.linkCount }}</span
                          >
                        </div>
                      </template>
                      <!-- aMule-specific transfer -->
                      <template v-if="row._type === 'amule'">
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.speed") }}</span>
                          <span class="kv-value">{{ row.speed_fmt }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.sources") }}</span>
                          <span class="kv-value">
                            {{ row.sourceCountXfer || 0 }} / {{ row.sourceCount || 0 }} ({{
                              row.sourceCountA4AF || 0
                            }}
                            {{ $t("downloads.info.a4af") }})
                          </span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.lastSeenComplete") }}</span>
                          <span class="kv-value">{{ formatTimestamp(row.lastSeenComplete) }}</span>
                        </div>
                      </template>
                      <!-- Torrent-specific transfer -->
                      <template v-if="row._type === 'torrent'">
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.peers") }}</span>
                          <span class="kv-value">
                            {{ row.peersSendingToUs }}
                            {{ $t("downloads.info.sending") }},
                            {{ row.peersGettingFromUs }}
                            {{ $t("downloads.info.receiving") }} ({{ row.peersConnected }}
                            {{ $t("downloads.info.connected") }})
                          </span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.eta") }}</span>
                          <span class="kv-value">{{ row.eta_fmt }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.added") }}</span>
                          <span class="kv-value">{{ formatTimestamp(row.addedDate) }}</span>
                        </div>
                        <div v-if="row.doneDate > 0" class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.completed") }}</span>
                          <span class="kv-value">{{ formatTimestamp(row.doneDate) }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.pieces") }}</span>
                          <span class="kv-value">
                            {{ row.pieceCount }} &times;
                            {{ formatBytes(row.pieceSize) }}
                          </span>
                        </div>
                        <div v-if="row.labels && row.labels.length" class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.labels") }}</span>
                          <span class="kv-value">
                            <STag
                              v-for="label in row.labels"
                              :key="label"
                              size="sm"
                              variant="info"
                              class="mr-1"
                            >
                              {{ label }}
                            </STag>
                          </span>
                        </div>
                      </template>
                      <!-- slskd-specific transfer -->
                      <template v-if="row._type === 'slskd'">
                        <div class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.speed") }}</span>
                          <span class="kv-value">{{ row.speed_fmt }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">File</span>
                          <span class="kv-value is-size-7">{{ row.fullFilename || row.filename }}</span>
                        </div>
                        <div class="kv-row">
                          <span class="kv-label">ETA</span>
                          <span class="kv-value">{{ row.eta_fmt || "\u2014" }}</span>
                        </div>
                        <div v-if="row.startTime" class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.added") }}</span>
                          <span class="kv-value">{{ formatTimestamp(row.startTime) }}</span>
                        </div>
                        <div v-if="row.endTime" class="kv-row">
                          <span class="kv-label">{{ $t("downloads.info.completed") }}</span>
                          <span class="kv-value">{{ formatTimestamp(row.endTime) }}</span>
                        </div>
                      </template>
                    </div>
                  </div>
                </div>
                <!-- Copy links at bottom of info tab -->
                <div class="mt-2" v-if="row._type === 'amule' && row.ed2kLink">
                  <SButton size="sm" @click="copyToClipboard(row.ed2kLink)" icon="mdi-donkey">
                    {{ $t("downloads.info.copyEd2k") }}
                  </SButton>
                </div>
                <div class="mt-2" v-if="row._type === 'torrent' && row.magnetLink">
                  <SButton size="sm" @click="copyToClipboard(row.magnetLink)" icon="mdi-magnet">
                    {{ $t("downloads.info.copyMagnet") }}
                  </SButton>
                </div>
              </STabPane>

              <!-- ── Files tab (slskd only) ── -->
              <STabPane
                v-if="row._type === 'slskd' && row._files?.length"
                name="files"
                :label="t('downloads.slskd.files', 'Archivos') + ' (' + row._files.length + ')'"
                :active="detailTab[row._uid] === 'files'"
              >
                <div class="slskd-files-table-wrap">
                  <STable
                    :data="row._files"
                    :columns="slskdFileColumns"
                    row-key="_fileIndex"
                    size="sm"
                    class="slskd-files-table"
                  >
                    <template #cell-filename="{ row: fr }">
                      <span class="is-size-7" :title="fr.fullFilename">{{ fr.filename }}</span>
                    </template>
                    <template #cell-size="{ row: fr }">
                      <span class="is-size-7">{{ fr.size_fmt }}</span>
                    </template>
                    <template #cell-progress="{ row: fr }">
                      <div class="flex-row gap-sm align-items-center">
                        <SProgress :percentage="fr.progress" :height="6" style="width: 80px" />
                        <span class="is-size-7 has-text-grey">{{ fr.progress }}%</span>
                      </div>
                    </template>
                    <template #cell-speed="{ row: fr }">
                      <span class="is-size-7">{{ fr.speed_fmt }}</span>
                    </template>
                    <template #cell-state="{ row: fr }">
                      <STag
                        size="sm"
                        :variant="fr.state?.includes('Completed') ? 'success' : fr.state?.includes('InProgress') || fr.state?.includes('Transferring') ? 'info' : 'default'"
                      >{{ fr.state }}</STag>
                    </template>
                  </STable>
                </div>
              </STabPane>

              <!-- ── Chunks tab (aMule only) ── -->
              <STabPane
                v-if="row._type === 'amule'"
                name="chunks"
                :label="$t('downloads.chunks.title')"
                :active="detailTab[row._uid] === 'chunks'"
              >
                <div class="mb-3">
                  <ChunkProgressBar
                    v-if="chunkData[row.hash]"
                    :chunks="chunkData[row.hash].chunks"
                    :availability="chunkData[row.hash].availability"
                    :show-legend="true"
                  />
                  <div v-else class="has-text-grey is-size-7">
                    <span class="mdi mdi-loading mdi-spin" />
                    {{ $t("downloads.chunks.loading") }}
                  </div>
                </div>

                <!-- Part availability grid -->
                <template v-if="sourceData[row.hash] && sourceData[row.hash].availability">
                  <div class="avail-grid mb-3">
                    <div class="avail-grid-row">
                      <span class="avail-label">{{ $t("downloads.chunks.parts") }}</span>
                      <span class="avail-value">{{
                        sourceData[row.hash].availability.partCount
                      }}</span>
                    </div>
                    <div class="avail-grid-row">
                      <span class="avail-label">
                        <span class="avail-dot avail-dot--complete" />
                        {{ $t("downloads.chunks.complete") }}</span
                      >
                      <span class="avail-value">{{
                        sourceData[row.hash].availability.partsComplete
                      }}</span>
                    </div>
                    <div class="avail-grid-row">
                      <span class="avail-label">
                        <span class="avail-dot avail-dot--downloading" />
                        {{ $t("downloads.chunks.downloading") }}</span
                      >
                      <span class="avail-value">{{
                        sourceData[row.hash].availability.partsDownloading
                      }}</span>
                    </div>
                    <div class="avail-grid-row">
                      <span class="avail-label">
                        <span class="avail-dot avail-dot--available" />
                        {{ $t("downloads.chunks.available") }}</span
                      >
                      <span class="avail-value">{{
                        sourceData[row.hash].availability.partsAvailable
                      }}</span>
                    </div>
                    <div class="avail-grid-row">
                      <span class="avail-label">
                        <span class="avail-dot avail-dot--empty" />
                        {{ $t("downloads.chunks.unavailable") }}</span
                      >
                      <span class="avail-value">{{
                        sourceData[row.hash].availability.partsEmpty
                      }}</span>
                    </div>
                    <div class="avail-grid-row avail-grid-separator">
                      <span class="avail-label">{{ $t("downloads.chunks.sourcesPerPart") }}</span>
                      <span class="avail-value">
                        {{ sourceData[row.hash].availability.minSourcesPerPart }}
                        &ndash;
                        {{ sourceData[row.hash].availability.maxSourcesPerPart }}
                        <span class="has-text-grey"
                          >(avg {{ sourceData[row.hash].availability.avgSourcesPerPart }})</span
                        >
                      </span>
                    </div>
                    <div
                      v-if="sourceData[row.hash].availability.partsWithZeroSources > 0"
                      class="avail-grid-row"
                    >
                      <span class="avail-label has-text-danger">
                        <span class="mdi mdi-alert" />
                        {{ $t("downloads.chunks.zeroSourceParts") }}
                      </span>
                      <span class="avail-value has-text-danger">{{
                        sourceData[row.hash].availability.partsWithZeroSources
                      }}</span>
                    </div>
                  </div>

                  <!-- Per-part availability bar -->
                  <div
                    v-if="sourceData[row.hash].availability.perPartAvailability"
                    class="avail-bar-wrapper"
                  >
                    <div class="avail-bar">
                      <div
                        v-for="(a, aidx) in sourceData[row.hash].availability.perPartAvailability"
                        :key="aidx"
                        class="avail-bar-segment"
                        :style="{
                          backgroundColor: availColor(
                            a,
                            sourceData[row.hash].availability.maxSourcesPerPart,
                          ),
                          width: 100 / sourceData[row.hash].availability.partCount + '%',
                        }"
                        :title="'Part ' + aidx + ': ' + a + ' source' + (a !== 1 ? 's' : '')"
                      />
                    </div>
                    <div class="avail-bar-legend">
                      <span><span class="avail-dot avail-dot--zero" /> 0</span>
                      <span
                        ><span class="avail-dot avail-dot--low" />
                        {{ $t("downloads.chunks.low") }}</span
                      >
                      <span
                        ><span class="avail-dot avail-dot--med" />
                        {{ $t("downloads.chunks.medium") }}</span
                      >
                      <span
                        ><span class="avail-dot avail-dot--high" />
                        {{ $t("downloads.chunks.high") }}</span
                      >
                    </div>
                  </div>
                </template>
              </STabPane>

              <!-- ── Sources tab (aMule only) ── -->
              <STabPane
                v-if="row._type === 'amule'"
                name="sources"
                :label="$t('downloads.sourcesTab.title')"
                :active="detailTab[row._uid] === 'sources'"
              >
                <div class="mb-2 flex-center gap-sm">
                  <span v-if="sourceLoading[row.hash]" class="mdi mdi-loading mdi-spin" />
                  <SButton size="sm" variant="text" @click="fetchSources(row.hash)" icon="mdi-refresh">
                    {{ $t("downloads.sourcesTab.refresh") }}
                  </SButton>
                </div>

                <div
                  v-if="!sourceData[row.hash] && !sourceLoading[row.hash]"
                  class="has-text-grey is-size-7"
                >
                  {{ $t("downloads.sourcesTab.noData") }}
                </div>

                <template v-if="sourceData[row.hash]">
                  <!-- Source count cards -->
                  <div class="source-cards mb-4" v-if="sourceData[row.hash].sources">
                    <div class="source-card">
                      <div class="source-card-value">
                        {{ sourceData[row.hash].sources.total }}
                      </div>
                      <div class="source-card-label">
                        {{ $t("downloads.sourcesTab.totalSources") }}
                      </div>
                    </div>
                    <div class="source-card source-card--success">
                      <div class="source-card-value">
                        {{ sourceData[row.hash].sources.transferring }}
                      </div>
                      <div class="source-card-label">
                        {{ $t("downloads.sourcesTab.transferring") }}
                      </div>
                    </div>
                    <div class="source-card source-card--info">
                      <div class="source-card-value">
                        {{ sourceData[row.hash].sources.queued }}
                      </div>
                      <div class="source-card-label">
                        {{ $t("downloads.sourcesTab.queued") }}
                      </div>
                    </div>
                    <div class="source-card source-card--warning">
                      <div class="source-card-value">
                        {{ sourceData[row.hash].sources.a4af }}
                      </div>
                      <div class="source-card-label">
                        {{ $t("downloads.sourcesTab.a4af") }}
                      </div>
                    </div>
                    <div class="source-card source-card--primary">
                      <div class="source-card-value">
                        {{ sourceData[row.hash].sources.complete }}
                      </div>
                      <div class="source-card-label">
                        {{ $t("downloads.sourcesTab.complete") }}
                      </div>
                    </div>
                  </div>

                  <!-- Transfer health & timing -->
                  <div class="columns is-multiline mb-3" v-if="sourceData[row.hash].file">
                    <div class="column is-6">
                      <p class="is-size-7 has-text-weight-bold mb-2">
                        <span class="mdi mdi-shield-check" />
                        {{ $t("downloads.sourcesTab.transferHealth") }}
                      </p>
                      <div class="avail-grid">
                        <div class="avail-grid-row">
                          <span class="avail-label">{{
                            $t("downloads.sourcesTab.transferred")
                          }}</span>
                          <span class="avail-value">{{
                            sourceData[row.hash].file.size_xfer_fmt
                          }}</span>
                        </div>
                        <div class="avail-grid-row">
                          <span class="avail-label">{{
                            $t("downloads.sourcesTab.downloaded")
                          }}</span>
                          <span class="avail-value">{{
                            sourceData[row.hash].file.size_done_fmt
                          }}</span>
                        </div>
                        <div class="avail-grid-row">
                          <span class="avail-label">{{
                            $t("downloads.sourcesTab.lostToCorruption")
                          }}</span>
                          <span
                            class="avail-value"
                            :class="{
                              'has-text-danger': sourceData[row.hash].file.lostCorruption > 0,
                            }"
                          >
                            {{ sourceData[row.hash].file.lostCorruption_fmt }}
                          </span>
                        </div>
                        <div class="avail-grid-row">
                          <span class="avail-label">{{
                            $t("downloads.sourcesTab.gainedByCompression")
                          }}</span>
                          <span
                            class="avail-value"
                            :class="{
                              'has-text-success': sourceData[row.hash].file.gainCompression > 0,
                            }"
                          >
                            {{ sourceData[row.hash].file.gainCompression_fmt }}
                          </span>
                        </div>
                        <div class="avail-grid-row">
                          <span class="avail-label">{{
                            $t("downloads.sourcesTab.savedByICH")
                          }}</span>
                          <span class="avail-value">{{ sourceData[row.hash].file.savedICH }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="column is-6">
                      <p class="is-size-7 has-text-weight-bold mb-2">
                        <span class="mdi mdi-clock-outline" />
                        {{ $t("downloads.sourcesTab.timing") }}
                      </p>
                      <div class="avail-grid">
                        <div class="avail-grid-row">
                          <span class="avail-label">{{
                            $t("downloads.sourcesTab.downloadActiveTime")
                          }}</span>
                          <span class="avail-value">{{
                            formatDuration(sourceData[row.hash].file.downloadActiveTime)
                          }}</span>
                        </div>
                        <div class="avail-grid-row">
                          <span class="avail-label">{{
                            $t("downloads.sourcesTab.lastSeenComplete")
                          }}</span>
                          <span class="avail-value">{{
                            formatTimestamp(sourceData[row.hash].file.lastSeenComplete)
                          }}</span>
                        </div>
                        <div class="avail-grid-row">
                          <span class="avail-label">{{
                            $t("downloads.sourcesTab.lastModified")
                          }}</span>
                          <span class="avail-value">{{
                            formatTimestamp(sourceData[row.hash].file.lastDateChanged)
                          }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Source names -->
                  <div
                    v-if="
                      sourceData[row.hash].sourceNames &&
                      sourceData[row.hash].sourceNames.length > 0
                    "
                    class="mb-3"
                  >
                    <p class="is-size-7 has-text-weight-bold mb-1">
                      <span class="mdi mdi-tag-multiple" />
                      {{ $t("downloads.sourcesTab.sourceNames") }}
                    </p>
                    <div class="tags">
                      <STag
                        v-for="(sn, si) in sourceData[row.hash].sourceNames"
                        :key="si"
                        size="sm"
                        variant="info"
                        class="mr-1 mb-1"
                      >
                        {{ sn.name }}
                        <span class="has-text-grey-light ml-1">({{ sn.count }})</span>
                      </STag>
                    </div>
                  </div>

                  <!-- Uploading to me -->
                  <div v-if="sourceData[row.hash].uploadingToMeCount > 0" class="mb-4">
                    <p class="is-size-7 has-text-weight-bold mb-1">
                      <span class="mdi mdi-arrow-down-bold has-text-success" />
                      {{ $t("downloads.sourcesTab.uploadingToMe") }} ({{
                        sourceData[row.hash].uploadingToMeCount
                      }})
                    </p>
                    <STable
                      :data="sourceData[row.hash].uploadingToMe"
                      :columns="srcUpCols"
                      size="sm"
                    >
                      <template #cell-software="{ row: r }">
                        {{ r.software }}
                        {{ r.softwareVersion }}
                      </template>
                      <template #cell-dlspeed="{ row: r }">{{ r.downloadSpeed_fmt }}</template>
                      <template #cell-srcip="{ row: r }">
                        {{ r.ip }}{{ r.port ? ":" + r.port : "" }}
                      </template>
                    </STable>
                  </div>

                  <!-- Downloading from me -->
                  <div v-if="sourceData[row.hash].downloadingFromMeCount > 0">
                    <p class="is-size-7 has-text-weight-bold mb-1">
                      <span class="mdi mdi-arrow-up-bold has-text-info" />
                      {{ $t("downloads.sourcesTab.downloadingFromMe") }} ({{
                        sourceData[row.hash].downloadingFromMeCount
                      }})
                    </p>
                    <STable
                      :data="sourceData[row.hash].downloadingFromMe"
                      :columns="srcDownCols"
                      size="sm"
                    >
                      <template #cell-software="{ row: r }">
                        {{ r.software }}
                        {{ r.softwareVersion }}
                      </template>
                      <template #cell-ulspeed="{ row: r }">{{ r.uploadSpeed_fmt }}</template>
                      <template #cell-srcip="{ row: r }"> {{ r.ip }}:{{ r.port }} </template>
                    </STable>
                  </div>
                </template>
              </STabPane>

              <!-- ── Links tab (pyLoad only) ── -->
              <STabPane
                v-if="row._type === 'pyload'"
                name="links"
                :label="$t('downloads.pyload.links')"
                :active="detailTab[row._uid] === 'links'"
              >
                <STable :data="row.links" :columns="pyloadLinkCols" size="sm" :max-height="300">
                  <template #cell-lstatus="{ row: lnk }">
                    <STag :variant="pyloadLinkStatusVariant(lnk.statusCode)" size="sm">{{
                      lnk.status
                    }}</STag>
                  </template>
                  <template #cell-lprogress="{ row: lnk }">{{ lnk.progress.toFixed(1) }}%</template>
                  <template #cell-lspeed="{ row: lnk }">
                    <span v-if="lnk.isDownloading" class="has-text-info">{{ lnk.speed_fmt }}</span>
                    <span v-else class="has-text-grey">—</span>
                  </template>
                </STable>
              </STabPane>

              <!-- ═══ Files tab (Torrent only) ═══ -->
              <STabPane
                v-if="row._type === 'torrent'"
                name="files"
                :label="$t('downloads.files.title')"
                :active="detailTab[row._uid] === 'files'"
              >
                <template v-if="torrentDetail[row._torrentId]">
                  <STable
                    :data="torrentDetail[row._torrentId]?.files || []"
                    :columns="filesCols"
                    size="sm"
                    :max-height="300"
                  >
                    <template #cell-fname="{ row: f }">
                      <span class="is-size-7">{{ f.name }}</span>
                    </template>
                    <template #cell-fsize="{ row: f }">{{ formatBytes(f.length) }}</template>
                    <template #cell-fprogress="{ row: f }">
                      <SProgress
                        :percentage="
                          f.length > 0 ? Math.round((f.bytesCompleted / f.length) * 100) : 0
                        "
                        :height="10"
                        color="var(--s-success)"
                      />
                    </template>
                  </STable>
                </template>
                <div v-else class="has-text-grey is-size-7">
                  <span class="mdi mdi-loading mdi-spin" />
                  {{ $t("downloads.files.loading") }}
                </div>
              </STabPane>

              <!-- ── Peers tab (Torrent only) ── -->
              <STabPane
                v-if="row._type === 'torrent'"
                name="peers"
                :label="$t('downloads.peersTab.title')"
                :active="detailTab[row._uid] === 'peers'"
              >
                <template v-if="torrentDetail[row._torrentId]">
                  <STable
                    :data="torrentDetail[row._torrentId]?.peers || []"
                    :columns="peersCols"
                    size="sm"
                    :max-height="300"
                  >
                    <template #cell-pdown="{ row: p }">{{
                      p.isDownloadingFrom ? formatSpeed(p.rateToClient) : "&mdash;"
                    }}</template>
                    <template #cell-pup="{ row: p }">{{
                      p.isUploadingTo ? formatSpeed(p.rateToPeer) : "&mdash;"
                    }}</template>
                    <template #cell-pprogress="{ row: p }">
                      {{ (p.progress * 100).toFixed(0) }}%
                    </template>
                    <template #empty>
                      <div class="has-text-centered py-2 has-text-grey is-size-7">
                        {{ $t("downloads.peersTab.noPeers") }}
                      </div>
                    </template>
                  </STable>
                </template>
                <div v-else class="has-text-grey is-size-7">
                  <span class="mdi mdi-loading mdi-spin" />
                  {{ $t("downloads.peersTab.loading") }}
                </div>
              </STabPane>

              <!-- ── Trackers tab (Torrent only) ── -->
              <STabPane
                v-if="row._type === 'torrent'"
                name="trackers"
                :label="$t('downloads.trackers.title')"
                :active="detailTab[row._uid] === 'trackers'"
              >
                <template v-if="torrentDetail[row._torrentId]">
                  <STable
                    :data="torrentDetail[row._torrentId]?.trackerStats || []"
                    :columns="trackerCols"
                    size="sm"
                    :max-height="300"
                  >
                    <template #cell-seeds="{ row: ts }">{{
                      ts.seederCount >= 0 ? ts.seederCount : "?"
                    }}</template>
                    <template #cell-leechers="{ row: ts }">{{
                      ts.leecherCount >= 0 ? ts.leecherCount : "?"
                    }}</template>
                    <template #cell-announce_status="{ row: ts }">
                      <STag :variant="ts.lastAnnounceSucceeded ? 'success' : 'danger'" size="sm">
                        {{
                          ts.lastAnnounceSucceeded
                            ? $t("downloads.trackers.ok")
                            : $t("downloads.trackers.fail")
                        }}
                      </STag>
                      <span class="is-size-7 ml-1">({{ ts.lastAnnouncePeerCount }})</span>
                    </template>
                    <template #cell-announce_url="{ row: ts }">
                      <span class="is-size-7">{{ ts.announce }}</span>
                    </template>
                  </STable>
                </template>
                <div v-else class="has-text-grey is-size-7">
                  <span class="mdi mdi-loading mdi-spin" />
                  {{ $t("downloads.trackers.loading") }}
                </div>
              </STabPane>
            </STabs>
          </div>
        </template>

        <template #empty>
          <div class="has-text-centered py-5 has-text-grey">
            <span class="mdi mdi-tray-alert icon-lg" />
            <p>{{ $t("downloads.noDownloads") }}</p>
          </div>
        </template>
      </STable>
    </div>
    <!-- /.is-hidden-mobile -->

    <!-- Add ED2K Link dialog -->
    <SDialog v-model="showAddLink" :title="$t('downloads.addEd2kDialog.title')" width="500px">
      <SFormItem :label="$t('downloads.addEd2kDialog.label')">
        <SInput
          v-model="ed2kLink"
          type="textarea"
          :placeholder="$t('downloads.addEd2kDialog.placeholder')"
          :rows="3"
        />
      </SFormItem>
      <template #footer>
        <SButton @click="showAddLink = false">{{ $t("downloads.addEd2kDialog.cancel") }}</SButton>
        <SButton variant="primary" :loading="addingLink" @click="addLink">{{
          $t("downloads.addEd2kDialog.add")
        }}</SButton>
      </template>
    </SDialog>

    <!-- Add Torrent dialog -->
    <SDialog v-model="showAddTorrent" :title="$t('downloads.addTorrentDialog.title')" width="500px">
      <SFormItem :label="$t('downloads.addTorrentDialog.label')">
        <SInput
          v-model="torrentForm.url"
          type="textarea"
          :placeholder="$t('downloads.addTorrentDialog.placeholder')"
          :rows="3"
        />
      </SFormItem>
      <SCheckbox
        v-model="torrentForm.paused"
        :label="$t('downloads.addTorrentDialog.addPaused')"
        class="mb-3"
      />
      <template #footer>
        <SButton @click="showAddTorrent = false">{{
          $t("downloads.addTorrentDialog.cancel")
        }}</SButton>
        <SButton variant="primary" :loading="addingTorrent" @click="addTorrent">{{
          $t("downloads.addTorrentDialog.add")
        }}</SButton>
      </template>
    </SDialog>
    <SDialog v-model="showAddPyload" :title="$t('downloads.addPyloadDialog.title')" width="520px">
      <SFormItem :label="$t('downloads.addPyloadDialog.nameLabel')">
        <SInput
          v-model="pyloadForm.name"
          :placeholder="$t('downloads.addPyloadDialog.namePlaceholder')"
        />
      </SFormItem>
      <SFormItem :label="$t('downloads.addPyloadDialog.linksLabel')">
        <SInput
          v-model="pyloadForm.links"
          type="textarea"
          :placeholder="$t('downloads.addPyloadDialog.linksPlaceholder')"
          :rows="5"
        />
      </SFormItem>
      <template #footer>
        <SButton @click="showAddPyload = false">{{
          $t("downloads.addPyloadDialog.cancel")
        }}</SButton>
        <SButton variant="primary" :loading="addingPyload" @click="addPyloadPackage">{{
          $t("downloads.addPyloadDialog.add")
        }}</SButton>
      </template>
    </SDialog>
    <SDialog v-model="showCancelDialog" title="Cancel downloads?" width="400px">
      <p>Cancel {{ cancelTotal }} selected download{{ cancelTotal !== 1 ? 's' : '' }}?</p>
      <template #footer>
        <SButton variant="danger" :loading="cancelling" @click="doCancel" icon="mdi-delete">
          {{ $t("downloads.actions.cancel") }}
        </SButton>
        <SButton @click="showCancelDialog = false">No</SButton>
      </template>
    </SDialog>

    <!-- Context menu (aMule client) -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      @click="contextMenu.visible = false"
    >
      <div class="context-menu-item" @click="copyToClipboard(contextMenu.client?.userHash || '')">
        <span class="mdi mdi-content-copy" />
        {{ $t("downloads.contextMenu.copyUserHash") }}
      </div>
      <div class="context-menu-item" @click="copyToClipboard(contextMenu.client?.ip || '')">
        <span class="mdi mdi-ip-network" />
        {{ $t("downloads.contextMenu.copyIP") }}
      </div>
    </div>
  </div>

  <!-- Download row context menu -->
  <Teleport to="body">
    <div
      v-if="dlCtxMenu.visible"
      class="context-menu"
      :style="{ top: dlCtxMenu.y + 'px', left: dlCtxMenu.x + 'px' }"
      @click.stop
    >
      <div v-if="dlCtxSelectedCount > 1" class="context-menu-header">
        {{ dlCtxSelectedCount }} {{ $t("downloads.sources." + dlCtxMenu.row?._type) }}
      </div>

      <!-- aMule actions -->
      <template v-if="dlCtxMenu.row?._type === 'amule'">
        <div
          class="context-menu-item"
          @click="
            doAmuleAction('pause');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-pause" /> {{ $t("downloads.actions.stop") }}
        </div>
        <div
          class="context-menu-item"
          @click="
            doAmuleAction('resume');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-play" /> {{ $t("downloads.actions.start") }}
        </div>
        <div class="context-menu-sep" />
        <div
          class="context-menu-item context-menu-item--danger"
          @click="
            doAmuleAction('cancel');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-close-circle" /> {{ $t("downloads.actions.cancel") }}
        </div>
        <template v-if="dlCtxSelectedCount === 1 && dlCtxMenu.row?.ed2kLink">
          <div class="context-menu-sep" />
          <div
            class="context-menu-item"
            @click="
              copyToClipboard(dlCtxMenu.row.ed2kLink);
              dlCtxMenu.visible = false;
            "
          >
            <span class="mdi mdi-donkey" /> {{ $t("downloads.info.copyEd2k") }}
          </div>
        </template>
      </template>

      <!-- Torrent actions -->
      <template v-else-if="dlCtxMenu.row?._type === 'torrent'">
        <div
          class="context-menu-item"
          @click="
            doTorrentAction('start');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-play" /> {{ $t("downloads.actions.start") }}
        </div>
        <div
          class="context-menu-item"
          @click="
            doTorrentAction('stop');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-pause" /> {{ $t("downloads.actions.stop") }}
        </div>
        <div class="context-menu-sep" />
        <div
          class="context-menu-item context-menu-item--danger"
          @click="
            confirmCancel();
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-delete" /> {{ $t("downloads.actions.cancel") }}
        </div>
        <template v-if="dlCtxSelectedCount === 1 && dlCtxMenu.row?.magnetLink">
          <div class="context-menu-sep" />
          <div
            class="context-menu-item"
            @click="
              copyToClipboard(dlCtxMenu.row.magnetLink);
              dlCtxMenu.visible = false;
            "
          >
            <span class="mdi mdi-magnet" /> {{ $t("downloads.info.copyMagnet") }}
          </div>
        </template>
      </template>

      <!-- pyLoad actions -->
      <template v-else-if="dlCtxMenu.row?._type === 'pyload'">
        <div
          class="context-menu-item"
          @click="
            doPyloadAction('restart');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-play" /> {{ $t("downloads.actions.start") }}
        </div>
        <div
          class="context-menu-item"
          @click="
            doPyloadAction('stop');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-pause" /> {{ $t("downloads.actions.stop") }}
        </div>
        <div class="context-menu-sep" />
        <div
          class="context-menu-item context-menu-item--danger"
          @click="
            doPyloadAction('delete');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-delete" /> {{ $t("downloads.actions.cancel") }}
        </div>
      </template>

      <!-- slskd actions -->
      <template v-else-if="dlCtxMenu.row?._type === 'slskd'">
        <div
          class="context-menu-item"
          @click="
            doSlskdAction('retry');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-refresh" /> {{ $t("downloads.actions.retry", "Reintentar") }}
        </div>
        <div class="context-menu-sep" />
        <div
          class="context-menu-item context-menu-item--danger"
          @click="
            doSlskdAction('cancel');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-close-circle" /> {{ $t("downloads.actions.cancel") }}
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { STableColumn } from "~/components/s/STable.vue";
import type { TabPaneDef } from "~/components/s/STabs.vue";

const { apiFetch } = useApi();
const { t } = useI18n();
const { addToast } = useToast();
const { lastStopped, services, loaded } = useServices();
import { recordDownload } from "~/stores/downloadHistory";

const amuleStopped = computed(
  () => loaded.value && services.value !== null && !services.value.amule.running,
);
const transmissionStopped = computed(
  () => loaded.value && services.value !== null && !services.value.transmission.running,
);
const pyloadStopped = computed(
  () => loaded.value && services.value !== null && !services.value.pyload.running,
);
const slskdStopped = computed(
  () => loaded.value && services.value !== null && !services.value.slskd.running,
);

// Clear the relevant list immediately when a service is stopped
watch(lastStopped, (ev) => {
  if (!ev) return;
  if (ev.service === "amule") {
    amuleFiles.value = [];
    amuleTotals.value = null;
  } else if (ev.service === "transmission") {
    torrentFiles.value = [];
    torrentTotals.value = null;
  } else if (ev.service === "pyload") {
    pyloadFiles.value = [];
    pyloadTotals.value = null;
  } else if (ev.service === "slskd") {
    slskdFiles.value = [];
    slskdTotals.value = null;
  }
  applySortAndFilter();
});

// ── Column definitions ────────────────────────────────────────────────
const mainColumns = computed<STableColumn[]>(() => [
  { key: "icon", label: "", width: 40 },
  { key: "name", label: t("downloads.columns.name") },
  { key: "size", label: t("downloads.columns.size"), width: 100 },
  { key: "progress", label: t("downloads.columns.progress"), width: 200 },
  { key: "speed", label: t("downloads.columns.speed"), width: 100 },
  { key: "peers", label: t("downloads.columns.peers"), width: 80 },
  { key: "status", label: t("downloads.columns.status"), width: 120 },
]);

const srcUpCols = computed<STableColumn[]>(() => [
  { prop: "clientName", label: t("downloads.sourceColumns.client") },
  { key: "software", label: t("downloads.sourceColumns.software"), width: 120 },
  { key: "dlspeed", label: t("downloads.sourceColumns.speed"), width: 90 },
  { key: "srcip", label: t("downloads.sourceColumns.ip"), width: 140 },
]);

const srcDownCols = computed<STableColumn[]>(() => [
  { prop: "clientName", label: t("downloads.sourceColumns.client") },
  { key: "software", label: t("downloads.sourceColumns.software"), width: 120 },
  { key: "ulspeed", label: t("downloads.sourceColumns.upSpeed"), width: 90 },
  { key: "srcip", label: t("downloads.sourceColumns.ip"), width: 140 },
]);

const filesCols = computed<STableColumn[]>(() => [
  { key: "fname", label: t("downloads.files.name") },
  { key: "fsize", label: t("downloads.files.size"), width: 90 },
  { key: "fprogress", label: t("downloads.files.progress"), width: 160 },
]);

const peersCols = computed<STableColumn[]>(() => [
  { prop: "address", label: t("downloads.peersTab.address"), width: 140 },
  { prop: "clientName", label: t("downloads.peersTab.client") },
  { key: "pdown", label: t("downloads.peersTab.down"), width: 90 },
  { key: "pup", label: t("downloads.peersTab.up"), width: 90 },
  { key: "pprogress", label: t("downloads.peersTab.progress"), width: 80 },
  { prop: "flagStr", label: t("downloads.peersTab.flags"), width: 80 },
]);

const trackerCols = computed<STableColumn[]>(() => [
  { prop: "sitename", label: t("downloads.trackers.site"), width: 160 },
  { key: "seeds", label: t("downloads.trackers.seeds"), width: 80 },
  { key: "leechers", label: t("downloads.trackers.leechers"), width: 80 },
  {
    key: "announce_status",
    label: t("downloads.trackers.announce"),
    width: 120,
  },
  { key: "announce_url", label: t("downloads.trackers.url") },
]);

const amulePanes = computed<TabPaneDef[]>(() => [
  { name: "info", label: t("downloads.info.title") },
  { name: "chunks", label: t("downloads.chunks.title") },
  { name: "sources", label: t("downloads.sourcesTab.title") },
]);
const torrentPanes = computed<TabPaneDef[]>(() => [
  { name: "info", label: t("downloads.info.title") },
  { name: "files", label: t("downloads.files.title") },
  { name: "peers", label: t("downloads.peersTab.title") },
  { name: "trackers", label: t("downloads.trackers.title") },
]);
const pyloadPanes = computed<TabPaneDef[]>(() => [
  { name: "info", label: t("downloads.info.title") },
  { name: "links", label: t("downloads.pyload.links") },
]);
const slskdPanes = computed<TabPaneDef[]>(() => [
  { name: "info", label: t("downloads.info.title") },
  { name: "files", label: t("downloads.slskd.files", "Archivos") },
]);

const slskdFileColumns = computed<STableColumn[]>(() => [
  { key: "filename", label: t("downloads.slskd.fileName", "Archivo") },
  { key: "size", label: t("downloads.columns.size"), width: 90 },
  { key: "progress", label: t("downloads.columns.progress"), width: 180 },
  { key: "speed", label: t("downloads.columns.speed"), width: 90 },
  { key: "state", label: t("downloads.columns.status"), width: 110 },
]);
const pyloadLinkCols = computed<STableColumn[]>(() => [
  { prop: "name", label: t("pyload.columns.name") },
  { prop: "plugin", label: t("pyload.columns.plugin"), width: 120 },
  { prop: "size_fmt", label: t("pyload.columns.size"), width: 100 },
  {
    key: "lprogress",
    label: t("pyload.columns.progress"),
    width: 80,
    align: "right" as const,
  },
  {
    key: "lspeed",
    label: t("pyload.columns.speed"),
    width: 90,
    align: "right" as const,
  },
  { key: "lstatus", label: t("pyload.columns.status"), width: 120 },
]);
function pyloadLinkStatusVariant(code: number): TagVariant {
  if (code === 0) return "success";
  if (code === 12) return "info";
  if (code === 8 || code === 1) return "danger";
  if (code === 5 || code === 7) return "warning";
  return "default";
}

// ── Filter options ────────────────────────────────────────────────────
const sourceOptions = computed(() => [
  { label: t("downloads.sources.amule"), value: "amule" },
  { label: t("downloads.sources.torrent"), value: "torrent" },
  { label: t("downloads.sources.pyload"), value: "pyload" },
  { label: "Soulseek", value: "slskd" },
]);
const statusOptions = computed(() => [
  { label: t("downloads.statusFilter.downloading"), value: "Downloading" },
  { label: t("downloads.statusFilter.pausedStopped"), value: "Paused" },
  { label: t("downloads.statusFilter.seeding"), value: "Seeding" },
  { label: t("downloads.statusFilter.complete"), value: "Complete" },
  { label: t("downloads.statusFilter.waitingQueued"), value: "Waiting" },
  { label: t("downloads.statusFilter.verifying"), value: "Verifying" },
]);
const sortOptions = computed(() => [
  { label: t("downloads.sortOptions.name"), value: "name" },
  { label: t("downloads.sortOptions.size"), value: "size" },
  { label: t("downloads.sortOptions.speed"), value: "speed" },
  { label: t("downloads.sortOptions.progress"), value: "progress" },
]);

// ── Data ──────────────────────────────────────────────────────────────
const amuleData = ref<any>(null);
const torrentData = ref<any>(null);
const amuleFiles = ref<any[]>([]);
const torrentFiles = ref<any[]>([]);
const pyloadFiles = ref<any[]>([]);
const allFiles = computed(() => [...amuleFiles.value, ...torrentFiles.value, ...pyloadFiles.value, ...slskdFiles.value]);
const filteredFiles = ref<any[]>([]);
const amuleTotals = ref<any>(null);
const torrentTotals = ref<any>(null);
const pyloadTotals = ref<any>(null);
const speedGraphRef = ref<{ draw: () => void } | null>(null);
const speedHistory = ref<
  { t: number; amule: number; torrent: number; pyload: number; slskd: number; up: number }[]
>([]);
const amuleCount = computed(() => amuleFiles.value.length);
const torrentCount = computed(() => torrentFiles.value.length);
const pyloadCount = computed(() => pyloadFiles.value.length);
const slskdFiles = ref<any[]>([]);
const slskdTotals = ref<any>(null);
const slskdCount = computed(() => slskdFiles.value.length);
const slskdSpeedFmt = computed(() =>
  formatSpeed(slskdFiles.value.reduce((s: number, f: any) => s + (f.averageSpeed || 0), 0)),
);
const selectedItems = reactive(new Set<string>());
const lastClickedRow = ref<string | null>(null);
const loading = ref(false);
const sortBy = ref("");
const filterStatus = ref("");
const filterSource = ref("");

// ── Add dialogs ───────────────────────────────────────────────────────
const showAddLink = ref(false);
const ed2kLink = ref("");
const addingLink = ref(false);
const showAddTorrent = ref(false);
const torrentForm = reactive({ url: "", paused: false });
const addingTorrent = ref(false);
const showAddPyload = ref(false);
const pyloadForm = reactive({ name: "", links: "" });
const addingPyload = ref(false);

// ── Cancel dialog ─────────────────────────────────────────────────────
const showCancelDialog = ref(false);
const cancelling = ref(false);
/** Captures selected IDs at dialog-open time so the action still works
 *  if the selection changes before the user confirms. */
const cancelTargets = ref<{
  amule: string[];
  torrent: number[];
  pyload: number[];
}>({ amule: [], torrent: [], pyload: [] });
const cancelTotal = computed(() =>
  cancelTargets.value.amule.length + cancelTargets.value.torrent.length + cancelTargets.value.pyload.length,
);

// ── Detail panel state ────────────────────────────────────────────────
const openedDetails = ref<string[]>([]);
const chunkData = ref<
  Record<
    string,
    {
      chunks: number[];
      availability: number[];
      partCount: number;
      sizeFull: number;
    }
  >
>({});
const sourceData = ref<Record<string, any>>({});
const sourceLoading = ref<Record<string, boolean>>({});
const torrentDetail = ref<Record<number, any>>({});
const detailTab = ref<Record<string, string>>({});

// ── Context menu ──────────────────────────────────────────────────────
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  client: null as any,
});
const dlCtxMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  row: null as any,
});
const dlCtxSelectedCount = computed(() => {
  if (!dlCtxMenu.row) return 0;
  const type = dlCtxMenu.row._type;
  if (type === "amule") return selectedAmule.value.length;
  if (type === "torrent") return selectedTorrents.value.length;
  if (type === "pyload") return selectedPyload.value.length;
  return 0;
});

let refreshInterval: ReturnType<typeof setInterval> | null = null;

// ── Selection by type ─────────────────────────────────────────────────
const selectedAmule = computed(() =>
  filteredFiles.value.filter((r: any) => r._type === "amule" && selectedItems.has(r._uid)),
);
const selectedTorrents = computed(() =>
  filteredFiles.value.filter((r: any) => r._type === "torrent" && selectedItems.has(r._uid)),
);
const selectedPyload = computed(() =>
  filteredFiles.value.filter((r: any) => r._type === "pyload" && selectedItems.has(r._uid)),
);
const selectedPyloadHasFailed = computed(() =>
  selectedPyload.value.some((p: any) => (p.failedLinks || 0) > 0),
);

const totalSelected = computed(() =>
  selectedAmule.value.length + selectedTorrents.value.length + selectedPyload.value.length,
);

async function doSlskdAction(action: 'retry' | 'cancel') {
  let hadError = false;
  for (const uid of selectedItems) {
    const row = allFiles.value.find((r: any) => r._uid === uid);
    if (!row || row._type !== 'slskd') continue;
    const files = row._files ?? [];
    if (files.length === 0) continue;
    try {
      // Only process files that have proper username and id
      const validFiles = files.filter((f: any) => f.username && f.id);
      if (validFiles.length === 0) {
        addToast(t('downloads.slskd.noValidFiles', 'No valid files to cancel'), 'error');
        continue;
      }
      if (action === 'cancel') {
        // Cancel all valid files in this group
        for (const f of validFiles) {
          await apiFetch(`/api/slskd/transfers/${encodeURIComponent(f.username)}/${encodeURIComponent(f.id)}?remove=true`, {
            method: 'DELETE',
          }).catch(() => { hadError = true; });
        }
      } else if (action === 'retry') {
        // Remove all files and re-queue via the transfer endpoint
        for (const f of validFiles) {
          await apiFetch(`/api/slskd/transfers/${encodeURIComponent(f.username)}/${encodeURIComponent(f.id)}?remove=true`, {
            method: 'DELETE',
          }).catch(() => { hadError = true; });
        }
        const fileList = validFiles.map((f: any) => ({ filename: f.fullFilename, size: f.size }));
        await apiFetch('/api/slskd/transfers', {
          method: 'POST',
          body: { username: validFiles[0].username, files: fileList },
        }).catch(() => { hadError = true; });
      }
    } catch { hadError = true; }
  }
  if (hadError) {
    addToast(t('downloads.slskd.actionError', 'Some transfers could not be processed'), 'warning');
  }
  refreshSlskd();
}

function doUnifiedAction(action: 'start' | 'stop' | 'cancel') {
  if (selectedAmule.value.length) {
    doAmuleAction(action === 'start' ? 'resume' : action === 'stop' ? 'pause' : 'cancel');
  }
  if (selectedTorrents.value.length) {
    if (action === 'cancel') {
      confirmCancel();
    } else {
      doTorrentAction(action);
    }
  }
  if (selectedPyload.value.length) {
    doPyloadAction(action === 'start' ? 'restart' : action === 'cancel' ? 'delete' : action);
  }
}

function dlRowClass(row: any): string {
  return selectedItems.has(row._uid) ? "is-selected" : "";
}

function onDlRowClick(row: any, _idx: number, e: MouseEvent) {
  dlCtxMenu.visible = false;
  if (e.shiftKey && lastClickedRow.value) {
    const uids = filteredFiles.value.map((r: any) => r._uid);
    const a = uids.indexOf(lastClickedRow.value);
    const b = uids.indexOf(row._uid);
    if (a !== -1 && b !== -1) {
      const [from, to] = a < b ? [a, b] : [b, a];
      if (!e.ctrlKey && !e.metaKey) selectedItems.clear();
      for (let i = from; i <= to; i++) selectedItems.add(uids[i]);
      return;
    }
  }
  if (e.ctrlKey || e.metaKey) {
    if (selectedItems.has(row._uid)) selectedItems.delete(row._uid);
    else selectedItems.add(row._uid);
  } else {
    selectedItems.clear();
    selectedItems.add(row._uid);
  }
  lastClickedRow.value = row._uid;
}

function onDlRowContextmenu(row: any, e: MouseEvent) {
  if (!selectedItems.has(row._uid)) {
    selectedItems.clear();
    selectedItems.add(row._uid);
    lastClickedRow.value = row._uid;
  }
  dlCtxMenu.visible = true;
  dlCtxMenu.x = Math.min(e.clientX, window.innerWidth - 220);
  dlCtxMenu.y = Math.min(e.clientY, window.innerHeight - 220);
  dlCtxMenu.row = row;
  e.stopPropagation();
}

function isOpen(uid: string) {
  return openedDetails.value.includes(uid);
}

function toggleDetail(row: any) {
  const idx = openedDetails.value.indexOf(row._uid);
  if (idx >= 0) {
    openedDetails.value = openedDetails.value.filter((_, i) => i !== idx);
  } else {
    openedDetails.value = [...openedDetails.value, row._uid];
    if (!detailTab.value[row._uid]) detailTab.value[row._uid] = "info";
    if (row._type === "amule") {
      fetchChunks(row.hash);
      fetchSources(row.hash);
    } else if (row._type === "torrent") {
      fetchTorrentDetail(row._torrentId);
    } else if (row._type === "pyload") {
      detailTab.value[row._uid] = "links";
    }
  }
}

function onExpandChange(keys: (string | number)[]) {
  const oldKeys = new Set(openedDetails.value);
  const newKeysStr = keys.map(String);
  for (const key of newKeysStr) {
    if (!oldKeys.has(key)) {
      const row = filteredFiles.value.find((r) => r._uid === key);
      if (!row) continue;
      if (!detailTab.value[key]) {
        detailTab.value[key] = row._type === "pyload" ? "links" : "info";
      }
      if (row._type === "amule") {
        fetchChunks(row.hash);
        fetchSources(row.hash);
      } else if (row._type === "torrent") {
        fetchTorrentDetail(row._torrentId);
      }
    }
  }
  openedDetails.value = newKeysStr;
}

// ── aMule detail fetchers ─────────────────────────────────────────────
async function fetchChunks(hash: string) {
  try {
    const res = await apiFetch<any>("/api/amule/downloads/parts?hash=" + hash);
    if (res?.parts) {
      const updated = { ...chunkData.value };
      for (const [h, info] of Object.entries(res.parts)) updated[h] = info as any;
      chunkData.value = updated;
    }
  } catch {
    /* silent */
  }
}

async function fetchSources(hash: string) {
  sourceLoading.value[hash] = true;
  try {
    const res = await apiFetch<any>("/api/amule/downloads/sources?hash=" + hash);
    sourceData.value[hash] = res;
  } catch {
    /* silent */
  } finally {
    sourceLoading.value[hash] = false;
  }
}

// ── Torrent detail fetcher ────────────────────────────────────────────
async function fetchTorrentDetail(id: number) {
  try {
    const res = await apiFetch<any>(`/api/transmission/torrents/detail?id=${id}`);
    if (res?.torrent) torrentDetail.value = { ...torrentDetail.value, [id]: res.torrent };
  } catch {
    /* silent */
  }
}

// ── Status helpers (aMule) ────────────────────────────────────────────
function amuleProgressColor(status: string) {
  if (status === "Downloading") return "var(--s-success)";
  if (status === "Paused") return "var(--s-warning)";
  return "var(--s-accent)";
}
type TagVariant = "default" | "primary" | "success" | "warning" | "danger" | "info";
function amuleStatusType(status: string): TagVariant {
  if (status === "Downloading") return "success";
  if (status === "Paused") return "warning";
  if (status === "Complete") return "info";
  if (status === "Error" || status === "Cancelled") return "danger";
  return "info";
}

// ── Status helpers (Torrent) ──────────────────────────────────────────
function torrentProgressColor(status: number) {
  if (status === 4) return "var(--s-success)";
  if (status === 6) return "var(--s-accent)";
  if (status === 0) return "var(--s-text-muted)";
  return "var(--s-warning)";
}
function torrentStatusType(status: number): TagVariant {
  if (status === 4) return "success";
  if (status === 6) return "info";
  if (status === 0) return "danger";
  if (status === 2) return "warning";
  return "info";
}

// ── Unified filter ────────────────────────────────────────────────────
function matchesFilter(row: any): boolean {
  if (filterSource.value && row._type !== filterSource.value) return false;
  if (!filterStatus.value) return true;
  if (row._type === "pyload") {
    switch (filterStatus.value) {
      case "Downloading":
        return row.activeLinks > 0;
      case "Complete":
        return row.finishedLinks === row.linkCount && row.linkCount > 0;
      case "Paused":
        return row.activeLinks === 0 && row.failedLinks === 0;
      default:
        return true;
    }
  } else if (row._type === "amule") {
    switch (filterStatus.value) {
      case "Downloading":
        return row.status === "Downloading";
      case "Paused":
        return row.status === "Paused";
      case "Complete":
        return row.status === "Complete";
      case "Waiting":
        return row.status === "Waiting";
      default:
        return true;
    }
  } else {
    switch (filterStatus.value) {
      case "Downloading":
        return row.status === 4;
      case "Paused":
        return row.status === 0;
      case "Seeding":
        return row.status === 6;
      case "Complete":
        return row.percentDone >= 1;
      case "Waiting":
        return row.status === 3 || row.status === 5;
      case "Verifying":
        return row.status === 1 || row.status === 2;
      default:
        return true;
    }
  }
}

// ── Format helpers ────────────────────────────────────────────────────
function formatTimestamp(ts: number) {
  if (!ts) return t("downloads.info.never");
  return new Date(ts * 1000).toLocaleString();
}

function formatDuration(seconds: number) {
  if (!seconds) return "\u2014";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

function availColor(sources: number, max: number) {
  if (sources === 0) return "var(--s-danger)";
  if (max <= 1) return "var(--s-success)";
  const ratio = sources / max;
  if (ratio < 0.25) return "var(--s-warning)";
  if (ratio < 0.6) return "var(--s-accent)";
  return "var(--s-success)";
}

async function copyToClipboard(text: string) {
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for non-secure contexts (plain HTTP)
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    addToast(t("common.copied"), "success");
  } catch {
    addToast(t("common.copyFailed"), "error");
  }
}
function closeContextMenu() {
  contextMenu.visible = false;
  dlCtxMenu.visible = false;
  selectedItems.clear();
}

// ── Sort + filter ─────────────────────────────────────────────────────
function getSpeed(row: any): number {
  if (row._type === "amule") return row.speed || 0;
  if (row._type === "pyload") return row.speed || 0; // bytes/s
  return row.rateDownload || 0;
}
function getSize(row: any): number {
  if (row._type === "amule") return row.sizeFull || 0;
  if (row._type === "pyload") return row.totalSize || 0;
  return row.totalSize || 0;
}
function getProgress(row: any): number {
  if (row._type === "amule" || row._type === "pyload") return row.progress || 0;
  return (row.percentDone || 0) * 100;
}

function applySortAndFilter() {
  let result = allFiles.value.filter(matchesFilter);
  if (sortBy.value) {
    const key = sortBy.value;
    result = [...result].sort((a, b) => {
      if (key === "name") return (a.name || "").localeCompare(b.name || "");
      if (key === "size") return getSize(b) - getSize(a);
      if (key === "speed") return getSpeed(b) - getSpeed(a);
      if (key === "progress") return getProgress(b) - getProgress(a);
      return 0;
    });
  }
  filteredFiles.value = result;
}

function applyFilter() {
  applySortAndFilter();
}

// ── Data fetching ─────────────────────────────────────────────────────
let chunkCycle = -1;
async function fetchAllChunks() {
  if (++chunkCycle % 2 !== 0) return;
  try {
    const res = await apiFetch<any>("/api/amule/downloads/parts");
    if (res?.parts) {
      const updated = { ...chunkData.value };
      for (const [h, info] of Object.entries(res.parts)) updated[h] = info as any;
      chunkData.value = updated;
    }
  } catch {
    /* silent */
  }
}

async function refreshAmule() {
  if (amuleStopped.value) return;
  try {
    const res = await apiFetch<any>("/api/amule/downloads");
    amuleData.value = res;
    const raw = res?.downloads?.files || [];
    amuleFiles.value = raw.map((f: any) => ({
      ...f,
      _type: "amule",
      _uid: "amule-" + f.hash,
    }));
    amuleTotals.value = res?.downloads?.totals || null;
    if (raw.length > 0) fetchAllChunks();
  } catch {
    /* silent */
  }
}

async function refreshTorrents() {
  if (transmissionStopped.value) return;
  try {
    const res = await apiFetch<any>("/api/transmission/torrents");
    torrentData.value = res;
    const raw = res?.torrents?.files || [];
    torrentFiles.value = raw.map((t: any) => ({
      ...t,
      _type: "torrent",
      _uid: "torrent-" + t.id,
      _torrentId: t.id,
    }));
    torrentTotals.value = res?.torrents?.totals || null;
  } catch {
    /* silent */
  }
}

async function refreshPyload() {
  if (pyloadStopped.value) return;
  try {
    const res = await apiFetch<any>("/api/pyload/packages");
    const raw = res?.packages ?? [];
    pyloadFiles.value = raw.map((p: any) => ({
      ...p,
      _type: "pyload",
      _uid: "pyload-" + p.pid,
    }));
    pyloadTotals.value = res
      ? { totalSpeed_fmt: res.totalSpeed_fmt, totalSpeed: res.totalSpeed ?? 0, count: res.count }
      : null;
  } catch {
    /* silent */
  }
}

async function refreshSlskd() {
  if (slskdStopped.value) return;
  try {
    // Fetch grouped transfers
    const res = await apiFetch<any>("/api/slskd/transfers?direction=download&grouped=true");
    const raw = Array.isArray(res) ? res : [];
    const groups: any[] = [];
    let totalFiles = 0;
    let uidCounter = 0;

    // ── Helpers ────────────────────────────────────────────────────────
    function normPath(p: string): string {
      return p.replace(/\\/g, "/").replace(/\/+$/, "");
    }
    function makeFileItems(files: any[], username: string): any[] {
      return files.map((f: any, idx: number) => {
        const sz = f.size || 0;
        const done = f.bytesTransferred || 0;
        const complete = f.state?.includes("Completed");
        const pct = complete ? 100 : (sz > 0 ? Math.min(100, (done / sz) * 100) : 0);
        const short = (() => {
          const fn = f.filename || "";
          const parts = fn.replace(/\\/g, "/").split("/");
          return parts[parts.length - 1] || fn;
        })();
        return {
          id: f.id ?? `file-${idx}`,
          filename: short,
          fullFilename: f.filename || "",
          size: sz,
          size_fmt: formatBytes(sz),
          bytesDone: done,
          done_fmt: formatBytes(done),
          progress: pct,
          speed_fmt: formatSpeed(f.averageSpeed || 0),
          state: f.state || "Unknown",
          startTime: f.startedAt ? new Date(f.startedAt).getTime() : null,
          endTime: f.endedAt ? new Date(f.endedAt).getTime() : null,
          username: f.username || username,
          _fileIndex: idx,
        };
      });
    }

    function makeGroup(fileItems: any[], folderName: string, username: string): any {
      const totalSz = fileItems.reduce((s, f) => s + (f.size || 0), 0);
      const totalDone = fileItems.reduce((s, f) => s + (f.bytesDone || 0), 0);
      const completed = fileItems.filter((f) => f.state?.includes("Completed")).length;
      const downloading = fileItems.filter((f) => f.state?.includes("InProgress") || f.state?.includes("Transferring")).length;
      const waiting = fileItems.filter((f) => f.state?.includes("Queued") && !f.state?.includes("Transferring") && !f.state?.includes("InProgress")).length;
      const allDone = completed === fileItems.length && fileItems.length > 0;

      let status: string;
      if (allDone) status = "Complete";
      else if (downloading > 0) status = "Downloading";
      else if (waiting > 0) status = "Waiting";
      else status = fileItems[0]?.state || "Unknown";

      const pct = totalSz > 0 ? Math.min(100, Math.round((totalDone / totalSz) * 100)) : 0;
      const display = (() => {
        const parts = folderName.replace(/\\/g, "/").split("/");
        return parts[parts.length - 1] || folderName;
      })();
      const avgSpeed = fileItems.reduce((s, f) => s + (parseFloat(f.speed_fmt) || 0), 0);

      const uid = "slskd-" + (++uidCounter);
      return {
        _type: "slskd", _uid: uid, _files: fileItems,
        name: display, size: totalSz, progress: pct,
        speed_fmt: formatSpeed(avgSpeed),
        totalSize_fmt: formatBytes(totalSz),
        doneSize_fmt: formatBytes(totalDone),
        status,
        activeLinks: downloading, failedLinks: 0,
        finishedLinks: completed, linkCount: fileItems.length,
        dest: "queue", username, folder: folderName, fullFilename: folderName,
        startTime: fileItems.reduce((earliest, f) => {
          if (!f.startTime) return earliest;
          return earliest === null || f.startTime < earliest ? f.startTime : earliest;
        }, null as number | null),
        endTime: allDone ? fileItems.reduce((latest, f) => {
          if (!f.endTime) return latest;
          return latest === null || f.endTime > latest ? f.endTime : latest;
        }, null as number | null) : null,
        averageSpeed: avgSpeed, percentComplete: pct, id: uid,
      };
    }

    // ── Read batch roots from sessionStorage ────────────────────────────
    let batches: { rootPath: string; username: string; ts: number }[] = [];
    try {
      const rawB = sessionStorage.getItem("slskd_batches");
      if (rawB) batches = JSON.parse(rawB);
    } catch { /* ignore */ }

    // ── Collect per-user directories ────────────────────────────────────
    const userDirs = new Map<string, { folder: string; fileItems: any[] }[]>();
    for (const userGrp of raw) {
      const uname = userGrp.username || "Unknown";
      if (!userDirs.has(uname)) userDirs.set(uname, []);
      const dirs = userDirs.get(uname)!;
      for (const dir of (userGrp.directories ?? [])) {
        const files = dir.files ?? [];
        if (files.length === 0) continue;
        const fname = dir.directory || files[0]?.filename?.replace(/[\\/][^\\/]*$/, "") || "";
        dirs.push({ folder: fname, fileItems: makeFileItems(files, uname) });
      }
    }

    // ── Merge subdirectories under batch root ───────────────────────────
    const now = Date.now();
    for (const [uname, dirs] of userDirs) {
      const userBatches = batches.filter((b) => b.username === uname && now - b.ts < 300_000);

      // Sort batches by rootPath length descending (most specific first)
      // so that subdirectory downloads don't get swallowed by parent batches
      userBatches.sort((a, b) => b.rootPath.length - a.rootPath.length);

      for (const batch of userBatches) {
        const root = batch.rootPath;
        const normRoot = normPath(root);
        // Find directories that are under this root (including root itself)
        // Skip entries already claimed by a more specific batch
        const children = dirs.filter((d) =>
          !(d as any)._batched &&
          (normPath(d.folder) === normRoot || normPath(d.folder).startsWith(normRoot + "/")),
        );
        if (children.length > 1) {
          // Merge all children into one group
          const merged = children.flatMap((d) => d.fileItems);
          for (const c of children) {
            const idx = dirs.indexOf(c);
            if (idx >= 0) dirs.splice(idx, 1);
          }
          // Mark as batched so parent batches don't consume it
          const entry: any = { folder: root, fileItems: merged };
          entry._batched = true;
          dirs.push(entry);
        }
      }

      // Build final groups
      for (const d of dirs) {
        totalFiles += d.fileItems.length;
        groups.push(makeGroup(d.fileItems, d.folder, uname));
      }
    }

    slskdTotals.value = totalFiles > 0 ? { count: totalFiles } : null;
    slskdFiles.value = groups;
  } catch {
    /* silent */
  }
}
async function pushSpeedHistory() {
  // history is now accumulated server-side; fetch it from the API
}

async function fetchSpeedHistory() {
  try {
    const data =
      await apiFetch<{ t: number; amule: number; torrent: number; pyload: number; slskd: number; up: number }[]>(
        "/api/speed-history",
      );
    speedHistory.value = data ?? [];
  } catch {
    /* silent */
  }
  nextTick(() => speedGraphRef.value?.draw());
}

async function refresh() {
  await Promise.all([refreshAmule(), refreshTorrents(), refreshPyload(), refreshSlskd(), fetchSpeedHistory()]);
  applySortAndFilter();
}

// ── aMule actions ─────────────────────────────────────────────────────
// ── Clear all finished downloads across all services ────────────────────
const clearingDownloaded = ref(false);

async function clearDownloaded() {
  clearingDownloaded.value = true;
  try {
    const done = allFiles.value;

    const amuleDone = done
      .filter((r) => r._type === "amule" && r.status === "Complete")
      .map((r) => r.hash);

    const torrentDone = done
      .filter((r) => r._type === "torrent" && r.percentDone >= 1)
      .map((r) => r._torrentId);

    const pyloadDone = done
      .filter((r) => r._type === "pyload" && r.finishedLinks === r.linkCount && r.linkCount > 0)
      .map((r) => r.pid);

    const ops: Promise<any>[] = [];

    if (amuleDone.length) {
      ops.push(
        apiFetch("/api/amule/downloads", {
          method: "POST",
          body: { action: "cancel", hashes: amuleDone },
        }).catch(() => {}),
      );
    }

    if (torrentDone.length) {
      ops.push(
        apiFetch("/api/transmission/torrents", {
          method: "POST",
          body: { action: "remove", ids: torrentDone },
        }).catch(() => {}),
      );
    }

    if (pyloadDone.length) {
      ops.push(
        apiFetch("/api/pyload/packages", {
          method: "POST",
          body: { action: "delete", pids: pyloadDone },
        }).catch(() => {}),
      );
    }

    // slskd completed — iterate all files in each group
    const slskdDone = done
      .filter((r) => r._type === "slskd" && r.status === "Complete");
    for (const group of slskdDone) {
      const files = group._files ?? [];
      for (const f of files) {
        if (f.username && f.id) {
          ops.push(
            apiFetch(`/api/slskd/transfers/${encodeURIComponent(f.username)}/${encodeURIComponent(f.id)}?remove=true`, {
              method: "DELETE",
            }).catch(() => {}),
          );
        }
      }
    }

    await Promise.all(ops);
    selectedItems.clear();
    await refresh();
  } finally {
    clearingDownloaded.value = false;
  }
}

async function doAmuleAction(action: string) {
  loading.value = true;
  try {
    await apiFetch("/api/amule/downloads", {
      method: "POST",
      body: { action, hashes: selectedAmule.value.map((f: any) => f.hash) },
    });
    selectedItems.clear();
    await refresh();
  } finally {
    loading.value = false;
  }
}

async function addLink() {
  if (!ed2kLink.value.trim()) return;
  addingLink.value = true;
  const link = ed2kLink.value.trim();
  try {
    await apiFetch("/api/amule/downloads", {
      method: "POST",
      body: { action: "add", ed2k_link: link },
    });
    recordDownload(link, link, "amule");
    ed2kLink.value = "";
    showAddLink.value = false;
    await refresh();
  } finally {
    addingLink.value = false;
  }
}

// ── Torrent actions ───────────────────────────────────────────────────
async function doTorrentAction(action: string) {
  loading.value = true;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: {
        action,
        ids: selectedTorrents.value.map((t: any) => t._torrentId),
      },
    });
    selectedItems.clear();
    await refresh();
  } finally {
    loading.value = false;
  }
}

function confirmCancel() {
  cancelTargets.value = {
    amule: selectedAmule.value.map((f: any) => f.hash),
    torrent: selectedTorrents.value.map((t: any) => t._torrentId),
    pyload: selectedPyload.value.map((p: any) => p.pid),
  };
  showCancelDialog.value = true;
}

async function doCancel() {
  cancelling.value = true;
  try {
    const ops: Promise<any>[] = [];
    const targets = cancelTargets.value;

    if (targets.amule.length) {
      ops.push(
        apiFetch("/api/amule/downloads", {
          method: "POST",
          body: { action: "cancel", hashes: targets.amule },
        }),
      );
    }

    if (targets.torrent.length) {
      ops.push(
        apiFetch("/api/transmission/torrents", {
          method: "POST",
          body: { action: "remove_data", ids: targets.torrent },
        }),
      );
    }

    if (targets.pyload.length) {
      for (const pid of targets.pyload) {
        ops.push(
          apiFetch("/api/pyload/packages", {
            method: "POST",
            body: { action: "delete", pids: [pid] },
          }),
        );
      }
    }

    await Promise.all(ops);
    selectedItems.clear();
    showCancelDialog.value = false;
    await refresh();
  } finally {
    cancelling.value = false;
  }
}

async function doPyloadAction(action: string) {
  const pids = selectedPyload.value.map((p: any) => p.pid);
  try {
    for (const pid of pids) {
      await apiFetch("/api/pyload/packages", {
        method: "POST",
        body: action === "delete" ? { action, pids: [pid] } : { action, pid },
      });
    }
    selectedItems.clear();
    await refreshPyload();
    applySortAndFilter();
  } catch (err: any) {
    addToast(err?.message ?? t("pyload.actionError"), "error");
  }
}

// Per-row action from mobile cards
async function doCardAction(row: any, action: string) {
  const prevSelected = [...selectedItems];
  selectedItems.clear();
  selectedItems.add(row._uid);
  if (row._type === "torrent" && (action === "remove" || action === "remove_data")) {
    confirmCancel();
    return;
  }
  try {
    if (row._type === "amule") await doAmuleAction(action);
    else if (row._type === "torrent") await doTorrentAction(action);
    else await doPyloadAction(action);
  } finally {
    selectedItems.clear();
    for (const uid of prevSelected) selectedItems.add(uid);
  }
}

async function addPyloadPackage() {
  const links = pyloadForm.links
    .split(/[\n\s,]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const name = pyloadForm.name.trim();
  if (!name || !links.length) return;
  addingPyload.value = true;
  try {
    await apiFetch("/api/pyload/packages", {
      method: "POST",
      body: { action: "add", name, links },
    });
    for (const link of links) {
      recordDownload(link, name, "pyload");
    }
    pyloadForm.name = "";
    pyloadForm.links = "";
    showAddPyload.value = false;
    addToast(t("pyload.packageAdded"), "success");
    await refreshPyload();
    applySortAndFilter();
  } catch (err: any) {
    addToast(err?.message ?? t("pyload.addError"), "error");
  } finally {
    addingPyload.value = false;
  }
}

async function addTorrent() {
  const urls = torrentForm.url
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!urls.length) return;
  addingTorrent.value = true;
  let added = 0;
  const errors: string[] = [];
  try {
    for (const url of urls) {
      try {
        await apiFetch("/api/transmission/torrents", {
          method: "POST",
          body: {
            action: "add",
            filename: url,
            paused: torrentForm.paused,
          },
        });
        recordDownload(url, url, "transmission");
        added++;
      } catch (err: any) {
        errors.push(err?.data?.statusMessage || err?.message || url);
      }
    }
    if (added > 0) {
      torrentForm.url = "";
      torrentForm.paused = false;
      showAddTorrent.value = false;
      await refresh();
    }
    if (errors.length) {
      addToast(errors.join("\n"), "error");
    }
  } finally {
    addingTorrent.value = false;
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────
onMounted(() => {
  refresh();
  refreshInterval = setInterval(refresh, 3000);
  document.addEventListener("click", closeContextMenu);
});
onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
  document.removeEventListener("click", closeContextMenu);
});
</script>

<style scoped>
.type-icon {
  font-size: 1.1rem;
}
.file-name-link {
  color: inherit;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.file-name-link:hover {
  color: var(--s-accent);
}
.detail-chevron {
  display: inline-block;
  transition: transform 0.2s ease;
  font-size: 1rem;
}
.detail-chevron.is-open {
  transform: rotate(90deg);
}
.detail-panel {
  padding: 0.75rem 0;
}
.hash-cell {
  font-family: monospace;
  font-size: 0.75rem;
  word-break: break-all;
}
.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 190px;
  background: color-mix(in oklab, var(--s-bg-surface) 45%, transparent);
  backdrop-filter: blur(5px);
  border: 1px solid var(--s-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  padding: 4px 0;
  user-select: none;
}
.context-menu-item {
  padding: 7px 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--s-text);
  transition: background 0.1s;
  white-space: nowrap;
}
.context-menu-item:hover {
  background: var(--s-table-hover-bg);
}
.context-menu-item .mdi {
  font-size: 1rem;
  width: 1.25rem;
  text-align: center;
}
.context-menu-header {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--s-text-muted);
  padding: 6px 14px 4px;
  border-bottom: 1px solid var(--s-border);
  margin-bottom: 0;
}
.context-menu-sep {
  height: 1px;
  background: var(--s-border);
  margin: 4px 0;
}
.context-menu-item--danger {
  color: var(--s-danger);
}
.context-menu-item--danger:hover {
  background: color-mix(in srgb, var(--s-danger) 10%, var(--s-bg-input));
}
.source-cards {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.source-card {
  background: var(--s-bg);
  border: 1px solid var(--s-border);
  border-radius: 6px;
  padding: 0.6rem 1rem;
  min-width: 90px;
  text-align: center;
}
.source-card-value {
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--s-text);
}
.source-card-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--s-text-muted);
  margin-top: 0.15rem;
}
.source-card--success .source-card-value {
  color: var(--s-success);
}
.source-card--info .source-card-value {
  color: var(--s-info);
}
.source-card--warning .source-card-value {
  color: var(--s-warning);
}
.source-card--primary .source-card-value {
  color: var(--s-accent);
}
.avail-grid {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.avail-grid-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  padding: 0.15rem 0;
}
.avail-grid-separator {
  border-top: 1px solid var(--s-border);
  margin-top: 0.25rem;
  padding-top: 0.35rem;
}
.avail-label {
  color: var(--s-text-muted);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.avail-value {
  color: var(--s-text);
  font-weight: 500;
}
.avail-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.avail-dot--complete {
  background: var(--s-success);
}
.avail-dot--downloading {
  background: var(--s-accent);
}
.avail-dot--available {
  background: var(--s-warning);
}
.avail-dot--empty {
  background: var(--s-text-muted);
}
.avail-dot--zero {
  background: var(--s-danger);
}
.avail-dot--low {
  background: var(--s-warning);
}
.avail-dot--med {
  background: var(--s-accent);
}
.avail-dot--high {
  background: var(--s-success);
}
.avail-bar-wrapper {
  max-width: 600px;
}

/* ── slskd files tab scroll ────────────────────────────────────────────── */
.slskd-files-table-wrap {
  max-height: 20rem;
  overflow-y: auto;
}
.avail-bar {
  display: flex;
  height: 14px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--s-bg);
  border: 1px solid var(--s-border);
}
.avail-bar-segment {
  min-width: 1px;
  transition: background-color 0.2s;
}
.avail-bar-legend {
  display: flex;
  gap: 1rem;
  margin-top: 0.25rem;
  font-size: 0.7rem;
  color: var(--s-text-muted);
}
.avail-bar-legend span {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

/* ── Mobile download cards ──────────────────────────────────────────────── */
.mobile-cards {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.download-card {
  background: var(--s-bg-surface);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius-lg);
  padding: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  cursor: pointer;
  transition: border-color 0.15s;
}
.download-card.is-expanded {
  border-color: color-mix(in oklab, var(--s-accent) 40%, var(--s-border));
}
.card-header-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}
.card-type-icon {
  font-size: 1.15em;
  flex-shrink: 0;
  margin-top: 1px;
}
.card-name {
  flex: 1;
  font-weight: 500;
  font-size: 0.9rem;
  word-break: break-word;
  line-height: 1.35;
}
.card-progress-label {
  font-size: 0.75rem;
  color: var(--s-text-muted);
  margin-top: 0.2rem;
}
.card-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.9rem;
  font-size: 0.8rem;
  color: var(--s-text-secondary);
}
.card-stat {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding-top: 0.15rem;
}
.card-detail {
  border-top: 1px solid var(--s-border);
  padding-top: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.card-kv-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.card-kv-row {
  display: flex;
  gap: 0.5rem;
  font-size: 0.78rem;
  line-height: 1.35;
}
.card-kv-label {
  color: var(--s-text-muted);
  flex-shrink: 0;
  width: 7rem;
}
.card-kv-value {
  color: var(--s-text);
  word-break: break-all;
}
.card-kv-hash {
  font-family: monospace;
  font-size: 0.7rem;
  word-break: break-all;
}
.card-chevron {
  font-size: 1rem;
  color: var(--s-text-muted);
  flex-shrink: 0;
  margin-top: 1px;
}
</style>
