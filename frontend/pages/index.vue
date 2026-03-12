<template>
  <div id="page-downloads">
    <div class="level mb-4">
      <div class="level-left">
        <h1 class="title is-4 mb-0">{{ $t("downloads.title") }}</h1>
      </div>
      <div class="level-right flex-row gap-sm">
        <SButton
          variant="primary"
          size="sm"
          :disabled="transmissionStopped"
          @click="showAddTorrent = true"
        >
          <span class="mdi mdi-magnet mr-1" /> {{ $t("downloads.addTorrent") }}
        </SButton>
        <SButton variant="primary" size="sm" :disabled="amuleStopped" @click="showAddLink = true">
          <span class="mdi mdi-donkey mr-1" /> {{ $t("downloads.addEd2k") }}
        </SButton>
        <SButton
          variant="primary"
          size="sm"
          :disabled="pyloadStopped"
          @click="showAddPyload = true"
        >
          <span class="mdi mdi-download mr-1" /> {{ $t("downloads.addPyload") }}
        </SButton>
      </div>
    </div>

    <!-- Totals -->
    <div class="box py-3 mb-4" v-if="amuleTotals || torrentTotals || pyloadTotals">
      <div class="totals-bar">
        <div class="total-item" v-if="amuleTotals">
          <span class="mdi mdi-donkey icon-sm" />
          <strong>{{ amuleTotals.speed_fmt || "0" }}</strong>
          <span class="has-text-grey is-size-7 ml-1"
            >({{ amuleCount }} {{ $t("downloads.files") }})</span
          >
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
        <div class="total-item">
          <span class="mdi mdi-file-multiple" />
          {{ allFiles.length }} {{ $t("downloads.total") }}
        </div>
      </div>
      <SpeedGraph :history="speedHistory" />
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
      <!-- Action buttons (desktop only, shown when items selected) -->
      <div
        class="column is-narrow is-hidden-mobile"
        v-if="selectedAmule.length > 0 || selectedTorrents.length > 0 || selectedPyload.length > 0"
      >
        <div class="buttons mb-0">
          <template v-if="selectedAmule.length > 0">
            <span class="is-size-7 has-text-grey mr-1 is-align-self-center"
              >{{ $t("downloads.sources.amule") }} ({{ selectedAmule.length }}):</span
            >
            <SButton variant="warning" size="sm" @click="doAmuleAction('pause')"
              ><span class="mdi mdi-pause mr-1" /> {{ $t("downloads.actions.pause") }}</SButton
            >
            <SButton variant="success" size="sm" @click="doAmuleAction('resume')"
              ><span class="mdi mdi-play mr-1" /> {{ $t("downloads.actions.resume") }}</SButton
            >
            <SButton variant="info" size="sm" @click="doAmuleAction('stop')"
              ><span class="mdi mdi-stop mr-1" /> {{ $t("downloads.actions.stop") }}</SButton
            >
            <SButton variant="danger" size="sm" @click="doAmuleAction('cancel')"
              ><span class="mdi mdi-close-circle mr-1" />
              {{ $t("downloads.actions.cancel") }}</SButton
            >
          </template>
          <template v-if="selectedTorrents.length > 0">
            <span class="is-size-7 has-text-grey mr-1 is-align-self-center"
              >{{ $t("downloads.sources.torrent") }} ({{ selectedTorrents.length }}):</span
            >
            <SButton variant="success" size="sm" @click="doTorrentAction('start')"
              ><span class="mdi mdi-play mr-1" /> {{ $t("downloads.actions.start") }}</SButton
            >
            <SButton variant="warning" size="sm" @click="doTorrentAction('stop')"
              ><span class="mdi mdi-pause mr-1" /> {{ $t("downloads.actions.stop") }}</SButton
            >
            <SButton size="sm" @click="doTorrentAction('verify')"
              ><span class="mdi mdi-check-circle mr-1" />
              {{ $t("downloads.actions.verify") }}</SButton
            >
            <SButton variant="danger" size="sm" @click="confirmTorrentRemove(false)"
              ><span class="mdi mdi-close-circle mr-1" />
              {{ $t("downloads.actions.remove") }}</SButton
            >
            <SButton variant="danger" size="sm" @click="confirmTorrentRemove(true)"
              ><span class="mdi mdi-delete mr-1" />
              {{ $t("downloads.actions.removeData") }}</SButton
            >
          </template>
          <template v-if="selectedPyload.length > 0">
            <span class="is-size-7 has-text-grey mr-1 is-align-self-center"
              >pyLoad ({{ selectedPyload.length }}):</span
            >
            <SButton variant="warning" size="sm" @click="doPyloadAction('stop')">
              <span class="mdi mdi-pause mr-1" />
              {{ $t("downloads.actions.stop") }}
            </SButton>
            <SButton variant="warning" size="sm" @click="doPyloadAction('restart')">
              <span class="mdi mdi-restart mr-1" />
              {{ $t("downloads.actions.restart") }}
            </SButton>
            <SButton variant="danger" size="sm" @click="doPyloadAction('delete')">
              <span class="mdi mdi-delete mr-1" />
              {{ $t("downloads.actions.remove") }}
            </SButton>
          </template>
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
        <div v-for="row in filteredFiles" :key="row._uid" class="download-card">
          <!-- type + name + status -->
          <div class="card-header-row">
            <span v-if="row._type === 'amule'" class="mdi mdi-donkey card-type-icon text-warning" />
            <span
              v-else-if="row._type === 'torrent'"
              class="mdi mdi-magnet card-type-icon text-accent"
            />
            <span v-else class="mdi mdi-cloud-download card-type-icon text-info" />
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
              v-else
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
              v-else
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
            <div class="card-progress-label">
              <template v-if="row._type === 'amule'"
                >{{ row.size_done_fmt }} / {{ row.size_fmt }} ({{ row.progress || 0 }}%)</template
              >
              <template v-else-if="row._type === 'torrent'"
                >{{ Math.round(row.percentDone * 100) }}% &mdash; {{ row.totalSize_fmt }}</template
              >
              <template v-else
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

          <!-- Action buttons -->
          <div class="card-actions">
            <template v-if="row._type === 'amule'">
              <SButton
                v-if="row.status !== 'Paused'"
                variant="warning"
                size="sm"
                @click="doCardAction(row, 'pause')"
                ><span class="mdi mdi-pause"
              /></SButton>
              <SButton v-else variant="success" size="sm" @click="doCardAction(row, 'resume')"
                ><span class="mdi mdi-play"
              /></SButton>
              <SButton variant="info" size="sm" @click="doCardAction(row, 'stop')"
                ><span class="mdi mdi-stop"
              /></SButton>
              <SButton variant="danger" size="sm" @click="doCardAction(row, 'cancel')"
                ><span class="mdi mdi-close-circle"
              /></SButton>
            </template>
            <template v-else-if="row._type === 'torrent'">
              <SButton variant="success" size="sm" @click="doCardAction(row, 'start')"
                ><span class="mdi mdi-play"
              /></SButton>
              <SButton variant="warning" size="sm" @click="doCardAction(row, 'stop')"
                ><span class="mdi mdi-pause"
              /></SButton>
              <SButton variant="danger" size="sm" @click="doCardAction(row, 'remove')"
                ><span class="mdi mdi-close-circle"
              /></SButton>
              <SButton variant="danger" size="sm" @click="doCardAction(row, 'remove_data')"
                ><span class="mdi mdi-delete"
              /></SButton>
            </template>
            <template v-else>
              <SButton
                v-if="row.activeLinks > 0"
                variant="warning"
                size="sm"
                @click="doCardAction(row, 'stop')"
                ><span class="mdi mdi-pause"
              /></SButton>
              <SButton variant="warning" size="sm" @click="doCardAction(row, 'restart')"
                ><span class="mdi mdi-restart"
              /></SButton>
              <SButton variant="danger" size="sm" @click="doCardAction(row, 'delete')"
                ><span class="mdi mdi-delete"
              /></SButton>
            </template>
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
        @expand="onExpandChange"
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
            v-else
            class="mdi mdi-cloud-download type-icon text-info"
            :title="$t('downloads.tooltip.pyload')"
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
            v-else
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
        </template>

        <!-- Speed cell -->
        <template #cell-speed="{ row }">
          <template v-if="row._type === 'amule'">{{ row.speed_fmt }}</template>
          <template v-else-if="row._type === 'torrent'">{{ row.rateDownload_fmt }}</template>
          <template v-else>{{ row.speed_fmt }}</template>
        </template>

        <!-- Peers cell -->
        <template #cell-peers="{ row }">
          <template v-if="row._type === 'amule'"
            >{{ row.sourceCountXfer || 0 }}/{{ row.sourceCount || 0 }}</template
          >
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
            v-else
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
                              : row.statusLabel
                        }}</span>
                      </div>
                      <div class="kv-row">
                        <span class="kv-label">{{ $t("downloads.info.progress") }}</span>
                        <span class="kv-value"
                          >{{
                            row._type === "amule" || row._type === "pyload"
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
                    </div>
                  </div>
                </div>
                <!-- Copy links at bottom of info tab -->
                <div class="mt-2" v-if="row._type === 'amule' && row.ed2kLink">
                  <SButton size="sm" @click="copyToClipboard(row.ed2kLink)">
                    <span class="mdi mdi-donkey mr-1" />
                    {{ $t("downloads.info.copyEd2k") }}
                  </SButton>
                </div>
                <div class="mt-2" v-if="row._type === 'torrent' && row.magnetLink">
                  <SButton size="sm" @click="copyToClipboard(row.magnetLink)">
                    <span class="mdi mdi-magnet mr-1" />
                    {{ $t("downloads.info.copyMagnet") }}
                  </SButton>
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
                  <SButton size="sm" variant="text" @click="fetchSources(row.hash)">
                    <span class="mdi mdi-refresh mr-1" />
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
        <SButton variant="primary" :loading="addingLink" @click="addLink">{{
          $t("downloads.addEd2kDialog.add")
        }}</SButton>
        <SButton @click="showAddLink = false">{{ $t("downloads.addEd2kDialog.cancel") }}</SButton>
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
        <SButton variant="primary" :loading="addingTorrent" @click="addTorrent">{{
          $t("downloads.addTorrentDialog.add")
        }}</SButton>
        <SButton @click="showAddTorrent = false">{{
          $t("downloads.addTorrentDialog.cancel")
        }}</SButton>
      </template>
    </SDialog>

    <!-- Add pyLoad package dialog -->
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
        <SButton variant="primary" :loading="addingPyload" @click="addPyloadPackage">{{
          $t("downloads.addPyloadDialog.add")
        }}</SButton>
        <SButton @click="showAddPyload = false">{{
          $t("downloads.addPyloadDialog.cancel")
        }}</SButton>
      </template>
    </SDialog>

    <!-- Torrent remove confirmation -->
    <SDialog v-model="showRemoveDialog" :title="$t('downloads.removeDialog.title')" width="400px">
      <p>
        {{ $t("downloads.removeDialog.message", { n: selectedTorrents.length })
        }}{{ removeWithData ? " " + $t("downloads.removeDialog.andData") : "" }}?
      </p>
      <template #footer>
        <SButton variant="danger" :loading="removing" @click="doTorrentRemove">{{
          removeWithData
            ? $t("downloads.removeDialog.removeDelete")
            : $t("downloads.removeDialog.remove")
        }}</SButton>
        <SButton @click="showRemoveDialog = false">{{
          $t("downloads.removeDialog.cancel")
        }}</SButton>
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
          <span class="mdi mdi-pause" /> {{ $t("downloads.actions.pause") }}
        </div>
        <div
          class="context-menu-item"
          @click="
            doAmuleAction('resume');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-play" /> {{ $t("downloads.actions.resume") }}
        </div>
        <div
          class="context-menu-item"
          @click="
            doAmuleAction('stop');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-stop" /> {{ $t("downloads.actions.stop") }}
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
        <div
          class="context-menu-item"
          @click="
            doTorrentAction('verify');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-check-circle" /> {{ $t("downloads.actions.verify") }}
        </div>
        <div class="context-menu-sep" />
        <div
          class="context-menu-item context-menu-item--danger"
          @click="
            confirmTorrentRemove(false);
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-close-circle" /> {{ $t("downloads.actions.remove") }}
        </div>
        <div
          class="context-menu-item context-menu-item--danger"
          @click="
            confirmTorrentRemove(true);
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-delete" /> {{ $t("downloads.actions.removeData") }}
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
            doPyloadAction('stop');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-pause" /> {{ $t("downloads.actions.stop") }}
        </div>
        <div
          class="context-menu-item"
          @click="
            doPyloadAction('restart');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-restart" /> {{ $t("downloads.actions.restart") }}
        </div>
        <div class="context-menu-sep" />
        <div
          class="context-menu-item context-menu-item--danger"
          @click="
            doPyloadAction('delete');
            dlCtxMenu.visible = false;
          "
        >
          <span class="mdi mdi-delete" /> {{ $t("downloads.actions.remove") }}
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
const { recordDownload } = useDownloadHistory();

const amuleStopped = computed(
  () => loaded.value && services.value !== null && !services.value.amule.running,
);
const transmissionStopped = computed(
  () => loaded.value && services.value !== null && !services.value.transmission.running,
);
const pyloadStopped = computed(
  () => loaded.value && services.value !== null && !services.value.pyload.running,
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
  }
  applySortAndFilter();
});

// ── Column definitions ────────────────────────────────────────────────
const mainColumns = computed<STableColumn[]>(() => [
  { type: "expand", key: "_expand", width: 30 },
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
const allFiles = computed(() => [...amuleFiles.value, ...torrentFiles.value, ...pyloadFiles.value]);
const filteredFiles = ref<any[]>([]);
const amuleTotals = ref<any>(null);
const torrentTotals = ref<any>(null);
const pyloadTotals = ref<any>(null);
const speedHistory = ref<{ t: number; amule: number; torrent: number; pyload: number }[]>([]);
const amuleCount = computed(() => amuleFiles.value.length);
const torrentCount = computed(() => torrentFiles.value.length);
const pyloadCount = computed(() => pyloadFiles.value.length);
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

// ── Remove dialog ─────────────────────────────────────────────────────
const showRemoveDialog = ref(false);
const removeWithData = ref(false);
const removing = ref(false);

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

function dlRowClass(row: any): string {
  return selectedItems.has(row._uid) ? "is-selected" : "";
}

function onDlRowClick(row: any, _idx: number, e: MouseEvent) {
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

function pushSpeedHistory() {
  // history is now accumulated server-side; fetch it from the API
}

async function fetchSpeedHistory() {
  try {
    const data =
      await apiFetch<{ t: number; amule: number; torrent: number; pyload: number }[]>(
        "/api/speed-history",
      );
    speedHistory.value = data ?? [];
  } catch {
    /* silent */
  }
}

async function refresh() {
  await Promise.all([refreshAmule(), refreshTorrents(), refreshPyload(), fetchSpeedHistory()]);
  applySortAndFilter();
}

// ── aMule actions ─────────────────────────────────────────────────────
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

function confirmTorrentRemove(withData: boolean) {
  removeWithData.value = withData;
  showRemoveDialog.value = true;
}

async function doTorrentRemove() {
  removing.value = true;
  try {
    await apiFetch("/api/transmission/torrents", {
      method: "POST",
      body: {
        action: removeWithData.value ? "remove_data" : "remove",
        ids: selectedTorrents.value.map((t: any) => t._torrentId),
      },
    });
    selectedItems.clear();
    showRemoveDialog.value = false;
    await refresh();
  } finally {
    removing.value = false;
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
    confirmTorrentRemove(action === "remove_data");
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
  if (!torrentForm.url.trim()) return;
  addingTorrent.value = true;
  const url = torrentForm.url.trim();
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
    torrentForm.url = "";
    torrentForm.paused = false;
    showAddTorrent.value = false;
    await refresh();
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
</style>
