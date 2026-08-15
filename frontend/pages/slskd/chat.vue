<template>
  <div id="page-slskd-chat">
    
    <STabs v-model="activeTabId" :panes="tabPanes">
      <!-- Tab labels with prefix + close button (skip for rooms tab) -->
      <template v-for="tab in closableTabs" :key="tab.id" #[`tab-${tab.id}`]>
        <span class="tab-label-wrap" @contextmenu.prevent.stop="onTabContextmenu($event, tab)">
          <span v-if="tab.type === 'room'" class="tab-prefix tab-prefix-room">#</span>
          <span v-else-if="tab.type === 'user'" class="tab-prefix tab-prefix-user">@</span>
          <span
            v-else-if="tab.type === 'files'"
            class="mdi mdi-folder-open tab-prefix tab-prefix-files"
          />
          <span class="tab-label-text">{{ tab.label }}</span>
          <button
            class="tab-close-btn"
            @click.stop="closeTab(tab.id)"
            :title="$t('slskd.closeTab')"
          >
            <span class="mdi mdi-close" />
          </button>
        </span>
      </template>

      <!-- ── Rooms list tab (permanent, first) ─────────────────── -->
      <STabPane name="_rooms" :active="activeTabId === '_rooms'">
        <div id="page-slskd-rooms">
          <div class="mb-3 flex-row gap-sm align-items-center">
            <SInput v-model="roomQuery" :placeholder="$t('search.filter')" class="mw-300">
              <template #prefix><span class="mdi mdi-magnify" /></template>
            </SInput>
            <SButton size="sm" icon="mdi-plus" @click="showCreateRoom = true">
              {{ $t("slskd.createRoom", "Crear canal") }}
            </SButton>
            <SButton size="sm" variant="success" icon="mdi-account-group" @click="joinRoom('Transmule')">
              {{ $t("slskd.joinTransmule", "Transmule") }}
            </SButton>
          </div>
          <div class="rooms-scroll">
            <SLoading :loading="loadingRooms">
              <div
                v-if="sortedRooms.length === 0 && !loadingRooms"
                class="has-text-centered py-5 has-text-grey"
              >
                <span class="mdi mdi-chat-outline icon-lg" />
                <p class="mt-2">{{ $t("slskd.roomsPlaceholder", "No hay canales disponibles") }}</p>
              </div>
              <STable
                v-else
                :data="sortedRooms"
                :columns="roomColumns"
                row-key="name"
                size="sm"
                @row-click="onRoomClick"
                @sort="onSort"
              >
                <template #cell-users="{ row }">
                  <span class="has-text-grey is-size-7">{{ row.userCount }}</span>
                </template>
                <template #cell-type="{ row }">
                  <span
                    v-if="row.isPrivate"
                    class="mdi mdi-lock has-text-warning"
                    :title="$t('slskd.private')"
                  />
                  <span v-else class="mdi mdi-earth has-text-success" :title="$t('slskd.public')" />
                </template>
                <template #empty>
                  <div class="has-text-centered py-4 has-text-grey is-size-7">
                    {{ $t("slskd.noRooms") }}
                  </div>
                </template>
              </STable>
            </SLoading>
          </div>
        </div>
      </STabPane>

      <!-- ── Room tab ──────────────────────────────────────────── -->
      <STabPane
        v-for="tab in roomTabs"
        :key="tab.id"
        :name="tab.id"
        :active="activeTabId === tab.id"
      >
        <div class="columns is-gapless room-view">
          <div class="column is-3 room-users-panel">
            <div class="room-users-header">
              <span class="is-size-7 has-text-grey">{{ $t("slskd.roomUsers", "Usuarios") }}</span>
              <span class="is-size-7 has-text-grey">({{ roomUsers[tab.id]?.length ?? 0 }})</span>
              <button
                class="room-user-sort-btn"
                :class="{ active: isSortType(tab.id, 'flag') }"
                :title="$t('slskd.sortByFlag', 'Ordenar por país')"
                @click="cycleRoomUserSort(tab.id, 'flag')"
              >
                <span class="mdi mdi-flag-variant" />
                <span v-if="roomUserSort[tab.id] === 'flag-asc'" class="mdi mdi-chevron-down sort-arrow" />
                <span v-else-if="roomUserSort[tab.id] === 'flag-desc'" class="mdi mdi-chevron-up sort-arrow" />
              </button>
              <button
                class="room-user-sort-btn"
                :class="{ active: isSortType(tab.id, 'files') }"
                :title="$t('slskd.sortByFiles', 'Ordenar por archivos')"
                @click="cycleRoomUserSort(tab.id, 'files')"
              >
                <span class="mdi mdi-folder-multiple" />
                <span v-if="roomUserSort[tab.id] === 'files-desc'" class="mdi mdi-chevron-down sort-arrow" />
                <span v-else-if="roomUserSort[tab.id] === 'files-asc'" class="mdi mdi-chevron-up sort-arrow" />
              </button>
            </div>
            <div class="room-users-list">
              <div
                v-for="user in getSortedRoomUsers(tab.id)"
                :key="user.username ?? user"
                class="room-user-item"
                :title="`${user.username} · ${humanSpeed(user.averageSpeed)}`"
                @contextmenu.prevent.stop="onUserContextmenu($event, user, tab.id)"
              >
                <span class="room-user-status" :class="statusClass(user.status)">
                  <span class="mdi mdi-account" />
                </span>
                <span class="room-user-flag">{{ flagEmoji(user.countryCode) }}</span>
                <span class="room-user-name">{{ user.username }}</span>
                <span class="room-user-files">{{ user.fileCount }}</span>
                <span
                  class="room-user-slots"
                  v-if="user.slotsFree > 0"
                  :title="$t('slskd.freeSlot')"
                >
                  <span class="mdi mdi-arrow-up-bold-circle has-text-success is-size-7" />
                </span>
              </div>
              <div
                v-if="!roomUsers[tab.id]?.length"
                class="has-text-grey is-size-7 has-text-centered py-3"
              >
                {{ $t("slskd.noUsers") }}
              </div>
            </div>
          </div>
          <div class="column is-9 room-messages-panel">
            <div class="room-messages-list">
              <div
                v-for="msg in roomMessages[tab.id] ?? []"
                :key="msg.id ?? msg.timestamp + msg.message"
                class="message-item"
              >
                <span class="message-time is-size-7 has-text-grey">{{
                  formatTime(msg.timestamp)
                }}</span>
                <span
                  class="message-author has-text-weight-medium"
                  @contextmenu.prevent.stop="
                    onUserContextmenu($event, msg.username ?? msg.user, tab.id)
                  "
                  >{{ msg.username ?? msg.user }}:</span
                >
                <span class="message-text" v-html="linkify(msg.message)"></span>
              </div>
              <div
                v-if="!roomMessages[tab.id]?.length"
                class="has-text-grey is-size-7 has-text-centered py-5"
              >
                {{ $t("slskd.noMessages") }}
              </div>
            </div>
            <div class="room-input-row">
              <SInput
                v-model="messageInput"
                :placeholder="$t('slskd.messagePlaceholder', 'Escribe un mensaje...')"
                @keyup.enter="sendRoomMessage(tab.label)"
              />
              <button class="emoji-btn" @click.stop="toggleEmojiPicker" :title="$t('slskd.emoji', 'Emojis')">
                <span class="mdi mdi-emoticon-happy-outline" />
              </button>
              <SButton variant="primary" size="sm" @click="sendRoomMessage(tab.label)" icon="mdi-send">
              </SButton>
              <!-- Emoji picker popup -->
              <div v-if="showEmojiPicker" class="emoji-picker" @click.stop>
                <div class="emoji-categories">
                  <button
                    v-for="(icon, cat) in EMOJI_CATEGORIES"
                    :key="cat"
                    class="emoji-cat-btn"
                    :class="{ active: emojiCategory === cat }"
                    @click="emojiCategory = cat"
                  >{{ icon }}</button>
                </div>
                <div class="emoji-grid">
                  <button
                    v-for="emoji in EMOJI_LIST[emojiCategory]"
                    :key="emoji"
                    class="emoji-item"
                    @click="insertEmoji(emoji)"
                  >{{ emoji }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </STabPane>

      <!-- ── User chat tab ─────────────────────────────────────── -->
      <STabPane
        v-for="tab in userTabs"
        :key="tab.id"
        :name="tab.id"
        :active="activeTabId === tab.id"
      >
        <div class="columns is-gapless room-view">
          <div class="column is-3 room-users-panel">
            <div class="room-users-header">
              <span class="is-size-7 has-text-grey">{{ $t("slskd.userInfo", "Info") }}</span>
            </div>
            <div class="room-users-list">
              <SLoading :loading="loadingUserInfo[tab.id] ?? false">
                <template v-if="userInfo[tab.id]">
                  <div class="user-info-header">
                    <span class="mdi mdi-account-circle user-info-icon" />
                    <span class="user-info-username">{{
                      userInfo[tab.id]?.username ?? tab.label
                    }}</span>
                    <span v-if="userInfo[tab.id]?.countryCode" class="user-info-flag">{{
                      flagEmoji(userInfo[tab.id].countryCode)
                    }}</span>
                  </div>
                  <div class="user-info-item">
                    <span
                      class="mdi mdi-circle-slice-8 is-size-7"
                      :class="statusClass(userInfo[tab.id].presence)"
                    />
                    <span class="user-info-label">{{ $t("slskd.status") }}</span>
                    <span class="user-info-value">{{ userInfo[tab.id].presence }}</span>
                  </div>
                  <div class="user-info-item" v-if="userInfo[tab.id].address">
                    <span class="mdi mdi-ip-network" />
                    <span class="user-info-label">IP</span>
                    <span class="user-info-value"
                      >{{ userInfo[tab.id].address }}:{{ userInfo[tab.id].port }}</span
                    >
                  </div>
                  <div class="user-info-item">
                    <span class="mdi mdi-account-arrow-up" />
                    <span class="user-info-label">{{ $t("slskd.uploadSlots") }}</span>
                    <span class="user-info-value">{{ userInfo[tab.id].uploadSlots }}</span>
                  </div>
                  <div class="user-info-item">
                    <span class="mdi mdi-format-list-numbered" />
                    <span class="user-info-label">{{ $t("slskd.queueLength") }}</span>
                    <span class="user-info-value">{{ userInfo[tab.id].queueLength }}</span>
                  </div>
                  <div
                    class="user-info-item user-info-item--description"
                    v-if="userInfo[tab.id].description"
                  >
                    <span class="mdi mdi-text-short" />
                    <span class="user-info-label">{{
                      $t("slskd.userDescription", "Descripción")
                    }}</span>
                    <span class="user-info-value is-size-7">{{
                      userInfo[tab.id].description
                    }}</span>
                  </div>
                  <div class="user-info-browse-btn">
                    <SButton
                      variant="secondary"
                      size="xs"
                      @click="addBrowseFiles(userInfo[tab.id].username)"
                    >
                      <span class="mdi mdi-folder-open" />
                      {{ $t("slskd.browseFiles", "Explorar archivos") }}
                    </SButton>
                  </div>
                </template>
                <div v-else class="has-text-grey is-size-7 has-text-centered py-3">
                  {{ $t("slskd.loading") }}
                </div>
              </SLoading>
            </div>
          </div>
          <div class="column is-9 room-messages-panel">
            <div class="room-messages-list">
              <div
                v-for="msg in userMessages[tab.id] ?? []"
                :key="msg.id ?? msg.timestamp + msg.message"
                class="message-item"
              >
                <span class="message-time is-size-7 has-text-grey">{{
                  formatTime(msg.timestamp)
                }}</span>
                <span v-if="msg.direction === 'Out'" class="message-author has-text-weight-medium"
                  >{{ slskdUsername || $t("app.title") }}:</span
                >
                <span
                  v-else
                  class="message-author has-text-weight-medium"
                  @contextmenu.prevent.stop="onUserContextmenu($event, tab.label, tab.id)"
                  >{{ tab.label }}:</span
                >
                <span class="message-text" v-html="linkify(msg.message)"></span>
              </div>
              <div
                v-if="!userMessages[tab.id]?.length"
                class="has-text-grey is-size-7 has-text-centered py-5"
              >
                {{ $t("slskd.noMessages") }}
              </div>
            </div>
            <div class="room-input-row">
              <SInput
                v-model="messageInput"
                :placeholder="$t('slskd.messagePlaceholder', 'Escribe un mensaje...')"
                @keyup.enter="sendUserMessage(tab.id, tab.label)"
              />
              <button class="emoji-btn" @click.stop="toggleEmojiPicker" :title="$t('slskd.emoji', 'Emojis')">
                <span class="mdi mdi-emoticon-happy-outline" />
              </button>
              <SButton variant="primary" size="sm" @click="sendUserMessage(tab.id, tab.label)" icon="mdi-send">
              </SButton>
              <!-- Emoji picker popup -->
              <div v-if="showEmojiPicker" class="emoji-picker" @click.stop>
                <div class="emoji-categories">
                  <button
                    v-for="(icon, cat) in EMOJI_CATEGORIES"
                    :key="cat"
                    class="emoji-cat-btn"
                    :class="{ active: emojiCategory === cat }"
                    @click="emojiCategory = cat"
                  >{{ icon }}</button>
                </div>
                <div class="emoji-grid">
                  <button
                    v-for="emoji in EMOJI_LIST[emojiCategory]"
                    :key="emoji"
                    class="emoji-item"
                    @click="insertEmoji(emoji)"
                  >{{ emoji }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </STabPane>

      <!-- ── Browse files tab ──────────────────────────────────── -->
      <STabPane
        v-for="tab in fileTabs"
        :key="tab.id"
        :name="tab.id"
        :active="activeTabId === tab.id"
      >
        <div class="browse-toolbar">
          <span class="is-size-7 has-text-grey">{{
            $t("slskd.browsingUser", "Explorando: {user}", { user: tab.label })
          }}</span>
          <div class="browse-stats ml-3" v-if="browseInfo[tab.id]">
            <span class="is-size-7 has-text-grey"
              >{{ browseInfo[tab.id].directories }} {{ $t("slskd.directories") }},
            </span>
            <span class="is-size-7 has-text-grey"
              >{{ browseInfo[tab.id].files }} {{ $t("slskd.files") }}</span
            >
          </div>
          <SButton
            variant="primary"
            size="sm"
            :loading="loadingBrowse[tab.id] ?? false"
            :title="$t('slskd.refresh', 'Refrescar')"
            class="ml-2"
            icon="mdi-refresh"
            @click="fetchBrowse(tab.id, tab.label, true)"
          />
          <div class="browse-filter ml-auto">
            <SInput
              v-model="browseQuery[tab.id]"
              :placeholder="$t('slskd.searchFiles', 'Filtrar archivos...')"
              size="sm"
              class="browse-filter-input"
            >
              <template #prefix><span class="mdi mdi-magnify" /></template>
            </SInput>
          </div>
        </div>
        <div class="browse-tree">
          <SLoading :loading="loadingBrowse[tab.id] ?? false">
            <div v-if="filteredBrowseTree(tab.id)?.length" class="browse-items">
              <ul class="browse-root-list">
                <FolderTreeNode
                  v-for="dir in filteredBrowseTree(tab.id)"
                  :key="dir.path"
                  :node="dir"
                  :expanded="dir._open"
                  current-path=""
                  @ctx-menu="(p: any) => onDirContextmenuFromNode(p, tab.label)"
                  @fileCtx="(e: MouseEvent, f: any, d: any) => onFileContextmenu(e, f, d, tab.label)"
                />
              </ul>
            </div>
            <div v-else class="has-text-grey is-size-7 has-text-centered py-5">
              {{ $t("slskd.noFiles") }}
            </div>
          </SLoading>
        </div>
      </STabPane>
    </STabs>

    <!-- Empty state -->
    <div v-if="tabs.length === 0" class="has-text-centered py-5 has-text-grey">
      <span class="mdi mdi-message-text-outline icon-lg" />
      <p class="mt-2">
        {{ $t("slskd.chatPlaceholder", "Selecciona un canal desde la vista de canales") }}
      </p>
    </div>

    <!-- ── Context menu (users) ────────────────────────────────── -->
    <SContextMenu
      :visible="ctxMenu.visible"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      @close="ctxMenu.visible = false"
    >
      <div class="s-context-menu-item" @click="ctxOpenChat()">
        <span class="mdi mdi-message-text" /> {{ $t("slskd.sendMessage", "Enviar mensaje") }}
      </div>
      <div class="s-context-menu-item" @click="ctxBrowseFiles()">
        <span class="mdi mdi-folder-open" /> {{ $t("slskd.browseFiles", "Explorar archivos") }}
      </div>
      <div class="s-context-menu-sep" />
      <div class="s-context-menu-item" @click="ctxBlockUser()">
        <span class="mdi mdi-block-helper" /> {{ $t("slskd.blockUser", "Bloquear mis archivos") }}
      </div>
      <div class="s-context-menu-item" @click="ctxIgnoreUser()">
        <span class="mdi mdi-account-cancel" /> {{ $t("slskd.ignoreUser", "Ignorar usuario") }}
      </div>
    </SContextMenu>

    <!-- ── Context menu (files / folders in browse) ──────────── -->
    <SContextMenu
      :visible="browseCtx.visible"
      :x="browseCtx.x"
      :y="browseCtx.y"
      @close="browseCtx.visible = false"
    >
      <div v-if="browseCtx.type === 'file'" class="s-context-menu-item" @click="ctxDownloadFile()">
        <span class="mdi mdi-download" /> {{ $t("slskd.downloadFile", "Descargar archivo") }}
      </div>
      <div class="s-context-menu-item" @click="ctxDownloadBrowseDir()">
        <span class="mdi mdi-folder-download" />
        {{ $t("slskd.downloadDirectory", "Descargar carpeta") }}
      </div>
    </SContextMenu>

    <!-- Browse tab context menu (mobile) -->
    <SContextMenu
      :visible="mobileCtx.visible"
      :x="mobileCtx.x"
      :y="mobileCtx.y"
      @close="mobileCtx.visible = false"
    >
      <div v-if="mobileCtx.type === 'user'" class="s-context-menu-item" @click="ctxOpenChat()">
        <span class="mdi mdi-message-text" /> {{ $t("slskd.sendMessage", "Enviar mensaje") }}
      </div>
      <div v-if="mobileCtx.type === 'user'" class="s-context-menu-item" @click="ctxBrowseFiles()">
        <span class="mdi mdi-folder-open" /> {{ $t("slskd.browseFiles", "Explorar archivos") }}
      </div>
      <div
        v-if="mobileCtx.type === 'file' || mobileCtx.type === 'dir'"
        class="s-context-menu-item"
        @click="ctxDownloadFile()"
      >
        <span class="mdi mdi-download" /> {{ $t("slskd.downloadFile", "Descargar archivo") }}
      </div>
      <div
        v-if="mobileCtx.type === 'file' || mobileCtx.type === 'dir'"
        class="s-context-menu-item"
        @click="ctxDownloadBrowseDir()"
      >
        <span class="mdi mdi-folder-download" />
        {{ $t("slskd.downloadDirectory", "Descargar carpeta") }}
      </div>
    </SContextMenu>

    <!-- ── Create room modal ────────────────────────────────── -->
    <SDialog v-model="showCreateRoom" :title="$t('slskd.createRoom', 'Crear canal')" width="400px">
      <SFormItem :label="$t('slskd.roomName', 'Nombre del canal')">
        <SInput v-model="createRoomName" :placeholder="$t('slskd.roomNamePlaceholder', 'Nombre del canal...')" @keyup.enter="doCreateRoom" />
      </SFormItem>
      <p v-if="createRoomError" class="has-text-danger is-size-7 mt-2">{{ createRoomError }}</p>
      <template #footer>
        <SButton @click="showCreateRoom = false">{{ $t("common.cancel", "Cancelar") }}</SButton>
        <SButton variant="primary" :loading="creatingRoom" @click="doCreateRoom" icon="mdi-plus">
          {{ $t("slskd.createRoom", "Crear canal") }}
        </SButton>
      </template>
    </SDialog>
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const slskdUsername = ref('');


// ── Tab model ────────────────────────────────────────────────────────────
interface ChatTab {
  type: "room" | "user" | "files";
  id: string;
  label: string;
}

const tabs = ref<ChatTab[]>([]);
const activeTabId = ref("_rooms"); // default to rooms tab

// Rooms tab is always present
const ROOMS_TAB: ChatTab = { type: "_rooms", id: "_rooms", label: "" };
tabs.value.push(ROOMS_TAB);

const closableTabs = computed(() => tabs.value.filter((t) => t.id !== "_rooms"));

const tabPanes = computed(() => {
  const panes = [{ name: "_rooms", label: $t("slskd.rooms", "Canales") }];
  tabs.value.forEach((tb) => {
    if (tb.id !== "_rooms") panes.push({ name: tb.id, label: tb.label });
  });
  return panes;
});

const roomTabs = computed(() => tabs.value.filter((t) => t.type === "room"));
const userTabs = computed(() => tabs.value.filter((t) => t.type === "user"));
const fileTabs = computed(() => tabs.value.filter((t) => t.type === "files"));

function nextTabId(type: string, name: string): string {
  return `${type}:${name}`;
}

// ── Data stores ──────────────────────────────────────────────────────────
const roomMessages = ref<Record<string, any[]>>({});
const roomUsers = ref<Record<string, any[]>>({});
const roomUserSort = ref<Record<string, string>>({}); // "" | "files-desc" | "files-asc"
const userMessages = ref<Record<string, any[]>>({});
const userInfo = ref<Record<string, any>>({});
const loadingUserInfo = ref<Record<string, boolean>>({});
const browseInfo = ref<Record<string, any>>({});
const browseTree = ref<Record<string, any[]>>({});
const browseQuery = ref<Record<string, string>>({});
const loadingBrowse = ref<Record<string, boolean>>({});

const messageInput = ref("");
const showEmojiPicker = ref(false);
const emojiCategory = ref("smileys");

const EMOJI_CATEGORIES: Record<string, string> = {
  smileys: "😀",
  people: "👋",
  animals: "🐵",
  food: "🍎",
  travel: "🚗",
  objects: "💡",
  symbols: "❤️",
  flags: "🏁",
};

const EMOJI_LIST: Record<string, string[]> = {
  smileys: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥴","😵","🤯","🥳","🥺","😢","😭","😤","😠","😡","🤬","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖","😺","😸","😹","😻","😼","😽","🙀","😿","😾","💋","💌","💘","💝","💖","💗","💓","💞","💕","💟","❣️","💔","❤️‍🔥","❤️‍🩹","💯","💥","💫","💦","💨","🕳️"],
  people: ["👋","🤚","🖐️","✋","🖖","👌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","💪","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","👀","👁️","👅","👄","👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵","🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦","🤷","👮","🕵️","💂","🥷","👷","🤴","👸","👳","👲","🧕","🤵","👰","🤰","🤱","👼","🎅","🤶","🦸","🦹","🧙","🧚","🧛","🧜","🧝","🧞","🧟","💆","💇","🚶","🧍","🧎","🏃","💃","🕺","🕴️","👯","🧖","🧗","🤸","⛹️","🏋️","🚴","🚵","🤼","🤽","🤾","🤺","⛷️","🏂","🏄","🚣","🏊","🤿","🧘"],
  animals: ["🐵","🐒","🦍","🦧","🐶","🐕","🦮","🐩","🐺","🦊","🦝","🐱","🐈","🦁","🐯","🐅","🐆","🐴","🐎","🦄","🦓","🦌","🐮","🐂","🐃","🐄","🐷","🐖","🐗","🐽","🐏","🐑","🐐","🐪","🐫","🦙","🦒","🐘","🦏","🦛","🐭","🐁","🐀","🐹","🐰","🐇","🐿️","🦔","🦇","🐻","🐨","🐼","🦥","🦦","🦨","🦘","🦡","🐾","🦃","🐔","🐓","🐣","🐤","🐥","🐦","🐧","🕊️","🦅","🦆","🦢","🦉","🦩","🦚","🦜","🐸","🐊","🐢","🦎","🐍","🐲","🐉","🦕","🦖","🐳","🐋","🐬","🐟","🐠","🐡","🦈","🐙","🐚","🐌","🦋","🐛","🐜","🐝","🐞","🦗","🕷️","🦂","🦟","🦠"],
  food: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🧄","🧅","🥔","🍠","🥐","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🦴","🌭","🍔","🍟","🍕","🫓","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🥘","🫕","🥫","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧","🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯","🥛","🍼","☕","🍵","🧃","🥤","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾","🧊","🥄","🍴","🍽️","🥣","🥡","🥢","🧂"],
  travel: ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🚚","🚛","🚜","🏍️","🛵","🚲","🛴","🛹","🚏","🛣️","🛤️","⛽","🚨","🚥","🚦","🛑","🚧","⚓","⛵","🛶","🚤","🛳️","⛴️","🛥️","🚢","✈️","🛩️","🛫","🛬","💺","🚁","🚟","🚠","🚡","🛰️","🚀","🛸","🌍","🌎","🌏","🗺️","🏔️","⛰️","🌋","🗻","🏕️","🏖️","🏜️","🏝️","🏞️","🏟️","🏛️","🏗️","🏘️","🏚️","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🛕","🕍","⛩️","🕋","⛲","⛺","🌁","🌃","🏙️","🌄","🌅","🌆","🌇","🌉","♨️","🎠","🎡","🎢","💈","🎪","🚂","🚃","🚄","🚅","🚆","🚇","🚈","🚉","🚊","🚝","🚞","🚋","🚌","🚍","🚎","🚐","🚑","🚒","🚓","🚔"],
  objects: ["⌚","📱","💻","⌨️","🖥️","🖨️","🖱️","🖲️","🕹️","🗜️","💽","💾","💿","📀","📼","📷","📸","📹","🎥","📽️","🎞️","📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭","⏱️","⏲️","⏰","🕰️","⌛","📡","🔋","🔌","💡","🔦","🕯️","🧯","🗑️","🛢️","💸","💵","💴","💶","💷","💰","💳","💎","⚖️","🧰","🔧","🔨","⚒️","🛠️","⛏️","🔩","⚙️","🧱","⛓️","🧲","🔫","💣","🧨","🪓","🔪","🗡️","⚔️","🛡️","🚬","⚰️","⚱️","🏺","🔮","📿","🧿","💈","⚗️","🔭","🔬","🕳️","💊","💉","🩸","🩹","🩺","🌡️","🧹","🧺","🧻","🚽","🚰","🚿","🛁","🛀","🧼","🪥","🪒","🧽","🧴","🛎️","🔑","🗝️","🚪","🪑","🛋️","🛏️","🛌","🧸","🖼️","🛍️","🛒","🎁","🎈","🎏","🎀","🎊","🎉","🎎","🏮","🎐","🧧","✉️","📩","📨","📧","💌","📥","📤","📦","🏷️","📪","📫","📬","📭","📮","📯","📜","📃","📄","📑","🧾","📊","📈","📉","🗒️","🗓️","📆","📅","🗑️","📇","🗃️","🗳️","🗄️","📋","📁","📂","🗂️","🗞️","📰","📓","📔","📒","📕","📗","📘","📙","📚","📖","🔖","🧷","🔗","📎","🖇️","📐","📏","🧮","📌","📍","✂️","🖊️","🖋️","✒️","🖌️","🖍️","📝","✏️","🔍","🔎","🔏","🔐","🔒","🔓"],
  symbols: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📳","🈶","🈚","🈸","🈺","🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲","🅰️","🅱️","🆎","🆑","🅾️","🆘","❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🚷","🚯","🚳","🚱","🔞","📵","🚭","❗","❕","❓","❔","‼️","⁉️","🔅","🔆","〽️","⚠️","🚸","🔱","⚜️","🔰","♻️","✅","🈯","💹","❇️","✳️","❎","🌐","💠","Ⓜ️","🌀","💤","🏧","🚾","♿","🅿️","🈳","🈂️","🛂","🛃","🛄","🛅","🚹","🚺","🚼","🚻","🚮","🎦","📶","🈁","🔣","ℹ️","🔤","🔡","🔠","🆖","🆗","🆙","🆒","🆕","🆓","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","🔢","#️⃣","*️⃣","⏏️","▶️","⏸️","⏯️","⏹️","⏺️","⏭️","⏮️","⏩","⏪","⏫","⏬","◀️","🔼","🔽","➡️","⬅️","⬆️","⬇️","↗️","↘️","↙️","↖️","↕️","↔️","↪️","↩️","⤴️","⤵️","🔀","🔁","🔂","🔄","🔃","🎵","🎶","➕","➖","➗","✖️","♾️","💲","💱","™️","©️","®️","〰️","➰","➿","🔚","🔙","🔛","🔝","🔜","✔️","☑️","🔘","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔺","🔻","🔸","🔹","🔶","🔷","🔳","🔲","▪️","▫️","◾","◽","◼️","◻️","🟥","🟧","🟨","🟩","🟦","🟪","⬛","⬜","🟫","🔈","🔇","🔉","🔊","🔔","🔕","📣","📢","👁️‍🗨️","💬","💭","🗯️","♠️","♣️","♥️","♦️","🃏","🎴","🀄","🕐","🕑","🕒","🕓","🕔","🕕","🕖","🕗","🕘","🕙","🕚","🕛","🕜","🕝","🕞","🕟","🕠","🕡","🕢","🕣","🕤","🕥","🕦","🕧"],
  flags: ["🏳️","🏴","🏁","🚩","🏳️‍🌈","🏳️‍⚧️","🇺🇳","🇦🇫","🇦🇽","🇦🇱","🇩🇿","🇦🇸","🇦🇩","🇦🇴","🇦🇮","🇦🇶","🇦🇬","🇦🇷","🇦🇲","🇦🇼","🇦🇺","🇦🇹","🇦🇿","🇧🇸","🇧🇭","🇧🇩","🇧🇧","🇧🇾","🇧🇪","🇧🇿","🇧🇯","🇧🇲","🇧🇹","🇧🇴","🇧🇦","🇧🇼","🇧🇷","🇮🇴","🇻🇬","🇧🇳","🇧🇬","🇧🇫","🇧🇮","🇰🇭","🇨🇲","🇨🇦","🇮🇨","🇨🇻","🇧🇶","🇰🇾","🇨🇫","🇹🇩","🇨🇱","🇨🇳","🇨🇽","🇨🇨","🇨🇴","🇰🇲","🇨🇬","🇨🇩","🇨🇰","🇨🇷","🇨🇮","🇭🇷","🇨🇺","🇨🇼","🇨🇾","🇨🇿","🇩🇰","🇩🇯","🇩🇲","🇩🇴","🇪🇨","🇪🇬","🇸🇻","🇬🇶","🇪🇷","🇪🇪","🇪🇹","🇪🇺","🇫🇰","🇫🇴","🇫🇯","🇫🇮","🇫🇷","🇬🇫","🇵🇫","🇹🇫","🇬🇦","🇬🇲","🇬🇪","🇩🇪","🇬🇭","🇬🇮","🇬🇷","🇬🇱","🇬🇩","🇬🇵","🇬🇺","🇬🇹","🇬🇬","🇬🇳","🇬🇼","🇬🇾","🇭🇹","🇭🇳","🇭🇰","🇭🇺","🇮🇸","🇮🇳","🇮🇩","🇮🇷","🇮🇶","🇮🇪","🇮🇲","🇮🇱","🇮🇹","🇯🇲","🇯🇵","🎌","🇯🇪","🇯🇴","🇰🇿","🇰🇪","🇰🇮","🇽🇰","🇰🇼","🇰🇬","🇱🇦","🇱🇻","🇱🇧","🇱🇸","🇱🇷","🇱🇾","🇱🇮","🇱🇹","🇱🇺","🇲🇴","🇲🇰","🇲🇬","🇲🇼","🇲🇾","🇲🇻","🇲🇱","🇲🇹","🇲🇭","🇲🇶","🇲🇷","🇲🇺","🇾🇹","🇲🇽","🇫🇲","🇲🇩","🇲🇨","🇲🇳","🇲🇪","🇲🇸","🇲🇦","🇲🇿","🇲🇲","🇳🇦","🇳🇷","🇳🇵","🇳🇱","🇳🇨","🇳🇿","🇳🇮","🇳🇪","🇳🇬","🇳🇺","🇳🇫","🇰🇵","🇲🇵","🇳🇴","🇴🇲","🇵🇰","🇵🇼","🇵🇸","🇵🇦","🇵🇬","🇵🇾","🇵🇪","🇵🇭","🇵🇳","🇵🇱","🇵🇹","🇵🇷","🇶🇦","🇷🇪","🇷🇴","🇷🇺","🇷🇼","🇼🇸","🇸🇲","🇸🇦","🇸🇳","🇷🇸","🇸🇨","🇸🇱","🇸🇬","🇸🇽","🇸🇰","🇸🇮","🇸🇧","🇸🇴","🇿🇦","🇰🇷","🇸🇸","🇪🇸","🇱🇰","🇧🇱","🇸🇭","🇰🇳","🇱🇨","🇵🇲","🇻🇨","🇸🇩","🇸🇷","🇸🇿","🇸🇪","🇨🇭","🇸🇾","🇹🇼","🇹🇯","🇹🇿","🇹🇭","🇹🇱","🇹🇬","🇹🇰","🇹🇴","🇹🇹","🇹🇳","🇹🇷","🇹🇲","🇹🇨","🇹🇻","🇻🇮","🇺🇬","🇺🇦","🇦🇪","🇬🇧","🏴󠁧󠁢󠁥󠁮󠁧󠁿","🏴󠁧󠁢󠁳󠁣󠁴󠁿","🏴󠁧󠁢󠁷󠁬󠁳󠁿","🇺🇸","🇺🇾","🇺🇿","🇻🇺","🇻🇦","🇻🇪","🇻🇳","🇼🇫","🇪🇭","🇾🇪","🇿🇲","🇿🇼"],
};

function insertEmoji(emoji: string) {
  messageInput.value += emoji;
  showEmojiPicker.value = false;
}

function toggleEmojiPicker() {
  showEmojiPicker.value = !showEmojiPicker.value;
}

function onEmojiPickerClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest(".emoji-picker") && !target.closest(".emoji-btn")) {
    showEmojiPicker.value = false;
  }
}

onMounted(() => {
  document.addEventListener("click", onEmojiPickerClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", onEmojiPickerClickOutside);
});

function cycleRoomUserSort(tabId: string, type: 'flag' | 'files') {
  const current = roomUserSort.value[tabId] || "";
  // If switching sort type, start with ascending for that type
  if (type === 'flag') {
    if (current === 'flag-asc') roomUserSort.value[tabId] = 'flag-desc';
    else if (current === 'flag-desc') roomUserSort.value[tabId] = '';
    else roomUserSort.value[tabId] = 'flag-asc';
  } else {
    if (current === 'files-desc') roomUserSort.value[tabId] = 'files-asc';
    else if (current === 'files-asc') roomUserSort.value[tabId] = '';
    else roomUserSort.value[tabId] = 'files-desc';
  }
}

function isSortType(tabId: string, type: 'flag' | 'files'): boolean {
  const s = roomUserSort.value[tabId] || '';
  return s.startsWith(type);
}

/** Parse a value as integer for sorting — handles numbers, strings, null, undefined */
function parseFileCount(val: any): number {
  if (val == null) return 0;
  const n = typeof val === "number" ? val : parseInt(String(val), 10);
  return isNaN(n) ? 0 : n;
}

/** Computed: sorted room users map, one entry per tab */
const sortedRoomUsers = computed(() => {
  const result: Record<string, any[]> = {};
  for (const tabId of Object.keys(roomUsers.value)) {
    const users = roomUsers.value[tabId];
    if (!users || !Array.isArray(users)) {
      result[tabId] = [];
      continue;
    }
    const sort = roomUserSort.value[tabId] || "";
    if (!sort) {
      result[tabId] = users;
      continue;
    }
    if (sort === "flag-asc") {
      result[tabId] = [...users].sort((a, b) => {
        const ca = (a.countryCode || "").toLowerCase();
        const cb = (b.countryCode || "").toLowerCase();
        // Users without country code go last
        if (!ca && !cb) return 0;
        if (!ca) return 1;
        if (!cb) return -1;
        return ca.localeCompare(cb);
      });
    } else if (sort === "flag-desc") {
      result[tabId] = [...users].sort((a, b) => {
        const ca = (a.countryCode || "").toLowerCase();
        const cb = (b.countryCode || "").toLowerCase();
        if (!ca && !cb) return 0;
        if (!ca) return 1;
        if (!cb) return -1;
        return cb.localeCompare(ca);
      });
    } else {
      const dir = sort === "files-desc" ? -1 : 1;
      result[tabId] = [...users].sort(
        (a, b) => (parseFileCount(a.fileCount) - parseFileCount(b.fileCount)) * dir,
      );
    }
  }
  return result;
});

function getSortedRoomUsers(tabId: string): any[] {
  return sortedRoomUsers.value[tabId] ?? [];
}

const SCROLL_NEAR_BOTTOM_PX = 100;

function getActiveMsgList(): HTMLDivElement | null {
  // Find the visible .room-messages-list inside the active tab pane
  // STabPane uses v-show, so we need to find the one not hidden
  const lists = document.querySelectorAll<HTMLDivElement>(".room-messages-list");
  for (const el of lists) {
    if (el.offsetParent !== null) return el; // visible element
  }
  return lists[0] ?? null;
}

function isNearBottom(el: HTMLDivElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_NEAR_BOTTOM_PX;
}

function scrollToBottom(el: HTMLDivElement) {
  el.scrollTop = el.scrollHeight;
}

// ── Scroll-follow intent ────────────────────────────────────────────────
// Whether each tab's message list should stick to the bottom on updates.
// Defaults to true (newest messages always visible). The user disables it
// per-tab by scrolling up deliberately; it re-enables when they scroll back
// near the bottom, send a message, or switch to the tab.
const followBottom: Record<string, boolean> = {};

function shouldFollow(tabId: string): boolean {
  return followBottom[tabId] !== false;
}

function scrollActiveListToBottom(tabId: string, force = false) {
  if (!force && !shouldFollow(tabId)) return;
  const el = getActiveMsgList();
  if (el) scrollToBottom(el);
}

// Scroll listener (event delegation — the lists are created/destroyed with tabs)
function onMsgListScroll(e: Event) {
  const el = (e.target as HTMLElement).closest?.(".room-messages-list") as HTMLDivElement | null;
  if (!el) return;
  const tabId = activeTabId.value;
  if (!tabId) return;
  // Scrolling up disables follow; reaching the bottom re-enables it
  followBottom[tabId] = isNearBottom(el);
}

// Scroll to bottom when switching tabs (the new tab should show latest)
watch(activeTabId, (tabId) => {
  if (!tabId) return;
  followBottom[tabId] = true;
  nextTick(() => scrollActiveListToBottom(tabId, true));
});

let pollTimers: Record<string, ReturnType<typeof setInterval>> = {};

// ── Rooms list state ─────────────────────────────────────────────────────
const roomQuery = ref("");
const roomsList = ref<any[]>([]);
const loadingRooms = ref(false);
const sortField = ref("");
const sortDir = ref<"asc" | "desc">("asc");
const showCreateRoom = ref(false);
const createRoomName = ref("");
const creatingRoom = ref(false);
const createRoomError = ref("");

const roomColumns = computed(() => [
  { key: "type", label: "", width: 36 },
  { prop: "name", label: t("slskd.roomName", "Canal"), sortable: true },
  {
    key: "users",
    label: t("slskd.roomUsers", "Usuarios"),
    width: 90,
    align: "right" as const,
    sortable: true,
  },
]);

const filteredRooms = computed(() => {
  if (!roomQuery.value) return roomsList.value;
  const q = roomQuery.value.toLowerCase();
  return roomsList.value.filter((r: any) => r.name?.toLowerCase().includes(q));
});

const sortedRooms = computed(() => {
  const data = filteredRooms.value;
  if (!sortField.value) return data;
  const dir = sortDir.value === "asc" ? 1 : -1;
  return [...data].sort((a: any, b: any) => {
    let va: any, vb: any;
    if (sortField.value === "name") {
      va = a.name ?? "";
      vb = b.name ?? "";
    } else if (sortField.value === "users") {
      va = a.userCount ?? 0;
      vb = b.userCount ?? 0;
    } else {
      va = a[sortField.value];
      vb = b[sortField.value];
    }
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
});

function onSort(field: string, dir: "asc" | "desc") {
  sortField.value = field;
  sortDir.value = dir;
}

function onRoomClick(row: any) {
  const roomName = row.name;
  if (!roomName) return;
  joinRoom(roomName);
}

async function doCreateRoom() {
  const name = createRoomName.value.trim();
  if (!name) return;
  createRoomError.value = "";

  // Check if room already exists in the available list
  if (roomsList.value.some((r: any) => r.name?.toLowerCase() === name.toLowerCase())) {
    createRoomError.value = t("slskd.roomExists", "Este canal ya existe");
    return;
  }

  creatingRoom.value = true;
  try {
    await apiFetch("/api/slskd/rooms/join", {
      method: "POST",
      body: { roomName: name },
    });
    showCreateRoom.value = false;
    createRoomName.value = "";
    joinRoom(name);
    fetchRoomsList();
  } catch (err: any) {
    createRoomError.value = err?.message || t("slskd.actionError");
  } finally {
    creatingRoom.value = false;
  }
}

function joinRoom(roomName: string) {
  addRoom(roomName);
}

// ── Tab management ───────────────────────────────────────────────────────
async function addRoom(roomName: string) {
  const id = nextTabId("room", roomName);
  if (tabs.value.find((t) => t.id === id)) return;
  tabs.value.push({ type: "room", id, label: roomName });
  roomMessages.value[id] = [];
  roomUsers.value[id] = [];
  activeTabId.value = id;
  // Join the room first, then fetch data
  try {
    const joinRes = await apiFetch("/api/slskd/rooms/join", {
      method: "POST",
      body: { roomName },
    });
    // joinRes?.success already checked above
  } catch { /* join may fail if already joined */ }
  fetchRoomData(id, roomName);
  pollTimers[id] = setInterval(() => fetchRoomData(id, roomName), 3000);
  // New tab → start pinned to bottom (latest messages visible)
  followBottom[id] = true;
  nextTick(() => scrollActiveListToBottom(id, true));
}

function addUserChat(username: string) {
  const id = nextTabId("user", username);
  if (tabs.value.find((t) => t.id === id)) return;
  tabs.value.push({ type: "user", id, label: username });
  userMessages.value[id] = [];
  userInfo.value[id] = null;
  loadingUserInfo.value[id] = true;
  activeTabId.value = id;
  fetchUserInfo(id, username);
  fetchUserMessages(id, username);
  pollTimers[id] = setInterval(() => fetchUserMessages(id, username), 3000);
  // New tab → start pinned to bottom (latest messages visible)
  followBottom[id] = true;
  nextTick(() => scrollActiveListToBottom(id, true));
}

function addBrowseFiles(username: string) {
  const id = nextTabId("files", username);
  if (tabs.value.find((t) => t.id === id)) return;
  tabs.value.push({ type: "files", id, label: username });
  browseTree.value[id] = [];
  browseInfo.value[id] = null;
  loadingBrowse.value[id] = true;
  activeTabId.value = id;
  fetchBrowse(id, username);
  saveBrowseTabs();
}

function saveBrowseTabs() {
  try {
    const names = tabs.value.filter((t) => t.type === "files").map((t) => t.label);
    sessionStorage.setItem("slskd_browse_tabs", JSON.stringify(names));
  } catch { /* quota exceeded */ }
}

function restoreBrowseTabs() {
  try {
    const raw = sessionStorage.getItem("slskd_browse_tabs");
    if (!raw) return;
    const names: string[] = JSON.parse(raw);
    if (!Array.isArray(names)) return;
    names.forEach((username) => {
      if (!username) return;
      const id = nextTabId("files", username);
      if (tabs.value.find((t) => t.id === id)) return;
      tabs.value.push({ type: "files", id, label: username });
      if (!activeTabId.value) activeTabId.value = id;

      // Try sessionStorage cache first — instant restore for large shares
      const cached = loadBrowseCache(username);
      if (cached) {
        applyBrowseData(id, cached);
        // Refresh in background to keep cache fresh (no force, uses middleware cache)
        fetchBrowse(id, username);
      } else {
        browseTree.value[id] = [];
        browseInfo.value[id] = null;
        loadingBrowse.value[id] = true;
        fetchBrowse(id, username);
      }
    });
  } catch {
    /* silent */
  }
}

async function closeTab(tabId: string) {
  if (tabId === "_rooms") return; // never close the rooms tab
  const tab = tabs.value.find((t) => t.id === tabId);
  if (!tab) return;
  const wasBrowse = tab.type === "files";

  // Close server-side FIRST so a refresh won't bring the tab back.
  // If the API fails, still remove from UI — the user wants it gone.
  if (tab.type === "room" || tab.type === "user") {
    try {
      if (tab.type === "room") {
        await apiFetch("/api/slskd/rooms/leave", {
          method: "POST",
          body: { roomName: tab.label },
        });
      } else {
        await apiFetch(`/api/slskd/conversations/${encodeURIComponent(tab.label)}`, {
          method: "DELETE",
        });
      }
    } catch (err: any) {
      showToast(t("slskd.closeConversationError", "No se pudo cerrar la conversación en slskd"), "warning", 4000);
    }
  }

  // Remove from UI after API call (or on error)
  if (!tabs.value.find((t) => t.id === tabId)) return; // already removed (e.g. double click)
  tabs.value = tabs.value.filter((t) => t.id !== tabId);
  delete roomMessages.value[tabId];
  delete roomUsers.value[tabId];
  delete roomUserSort.value[tabId];
  delete userMessages.value[tabId];
  delete userInfo.value[tabId];
  delete loadingUserInfo.value[tabId];
  delete browseInfo.value[tabId];
  delete browseTree.value[tabId];
  delete loadingBrowse.value[tabId];
  delete followBottom[tabId];
  if (pollTimers[tabId]) {
    clearInterval(pollTimers[tabId]);
    delete pollTimers[tabId];
  }
  if (activeTabId.value === tabId) {
    const remaining = tabs.value;
    activeTabId.value = remaining.length > 0 ? remaining[remaining.length - 1].id : "";
  }
  const hash = activeTabId.value && activeTabId.value !== "_rooms" ? "#" + activeTabId.value : "";
  router.replace({ hash });
  if (wasBrowse) saveBrowseTabs();
}

// ── Data fetching: Rooms ─────────────────────────────────────────────────
async function fetchRoomData(tabId: string, roomName: string) {
  try {
    const [messages, users] = await Promise.all([
      apiFetch<any[]>(`/api/slskd/rooms/${encodeURIComponent(roomName)}/messages`),
      apiFetch<any[]>(`/api/slskd/rooms/${encodeURIComponent(roomName)}/users`),
    ]);
    if (messages) roomMessages.value[tabId] = messages;
    if (users) roomUsers.value[tabId] = users;
    nextTick(() => scrollActiveListToBottom(tabId));
  } catch {
    /* silent */
  }
}

async function sendRoomMessage(roomName: string) {
  const text = messageInput.value.trim();
  if (!text || !roomName) return;
  messageInput.value = "";
  try {
    await apiFetch(`/api/slskd/rooms/${encodeURIComponent(roomName)}/messages`, {
      method: "POST",
      body: { message: text },
    });
    const tabId = nextTabId("room", roomName);
    // Own message sent → always jump to bottom
    followBottom[tabId] = true;
    await fetchRoomData(tabId, roomName);
    nextTick(() => scrollActiveListToBottom(tabId, true));
  } catch {
    /* silent */
  }
}

// ── Data fetching: User info + private chat ──────────────────────────────
async function fetchUserInfo(tabId: string, username: string) {
  loadingUserInfo.value[tabId] = true;
  try {
    const info = await apiFetch<any>(`/api/slskd/users/${encodeURIComponent(username)}/info`);
    // Country code is only available from room users data; look it up if available
    if (info && !info.countryCode) {
      for (const users of Object.values(roomUsers.value)) {
        const match = (users as any[]).find((u: any) => u.username === username);
        if (match?.countryCode) {
          info.countryCode = match.countryCode;
          break;
        }
      }
    }
    userInfo.value[tabId] = info;
  } catch {
    /* silent */
  }
  loadingUserInfo.value[tabId] = false;
}

async function fetchUserMessages(tabId: string, username: string) {
  try {
    const msgs = await apiFetch<any[]>(
      `/api/slskd/conversations/${encodeURIComponent(username)}/messages`,
    );
    if (msgs) userMessages.value[tabId] = msgs;
    nextTick(() => scrollActiveListToBottom(tabId));
  } catch {
    /* silent */
  }
}

async function sendUserMessage(tabId: string, username: string) {
  const text = messageInput.value.trim();
  if (!text || !username) return;
  messageInput.value = "";
  try {
    await apiFetch(`/api/slskd/conversations/${encodeURIComponent(username)}/messages`, {
      method: "POST",
      body: { message: text },
    });
    // Own message sent → always jump to bottom
    followBottom[tabId] = true;
    await fetchUserMessages(tabId, username);
    nextTick(() => scrollActiveListToBottom(tabId, true));
  } catch {
    /* silent */
  }
}

// ── Browse tree builder ─────────────────────────────────────────────────

function buildBrowseTree(flatDirs: any[]): any[] {
  const byPath = new Map<string, any>();
  for (const d of flatDirs) {
    const parts = d.name.split("\\");
    const displayName = parts[parts.length - 1] || d.name;
    byPath.set(d.name, {
      name: displayName,
      path: d.name,
      fileCount: d.fileCount ?? 0,
      files: d.files ?? [],
      locked: d.locked ?? false,
      _open: false,
      _totalFileCount: d.fileCount ?? 0,
      children: [],
    });
  }
  const roots: any[] = [];
  for (const [path, node] of byPath) {
    const parentPath = path.includes("\\")
      ? path.substring(0, path.lastIndexOf("\\"))
      : null;
    if (parentPath && byPath.has(parentPath)) {
      byPath.get(parentPath)!.children.push(node);
      byPath.get(parentPath)!._totalFileCount += node._totalFileCount;
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function filterBrowseTree(nodes: any[], q: string): any[] {
  const result: any[] = [];
  for (const node of nodes) {
    const dirPath = (node.path || "").toLowerCase();
    const dirMatches = dirPath.includes(q);
    const matchedFiles = (node.files || []).filter((f: any) => {
      const fp = dirPath + "\\" + (f.filename || "").toLowerCase();
      return fp.includes(q);
    });
    const filteredChildren = filterBrowseTree(node.children, q);
    if (dirMatches) {
      result.push({ ...node, _open: true, _filteredFiles: null,
        children: filteredChildren.length > 0 ? filteredChildren : node.children.map((c: any) => ({ ...c, _open: true })) });
    } else if (matchedFiles.length > 0 || filteredChildren.length > 0) {
      result.push({ ...node, _open: true,
        _filteredFiles: matchedFiles.length > 0 ? matchedFiles : null,
        children: filteredChildren.length > 0 ? filteredChildren : node.children });
    }
  }
  return result;
}

// ── Browse sessionStorage cache helpers ────────────────────────────────
const BROWSE_CACHE_PREFIX = "slskd_browse_data:";

function saveBrowseCache(username: string, data: any): void {
  try {
    sessionStorage.setItem(BROWSE_CACHE_PREFIX + username, JSON.stringify(data));
  } catch {
    // Quota exceeded — silently skip, data is still in memory
  }
}

function loadBrowseCache(username: string): any | null {
  try {
    const raw = sessionStorage.getItem(BROWSE_CACHE_PREFIX + username);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Data fetching: Browse ────────────────────────────────────────────────
async function fetchBrowse(tabId: string, username: string, force = false) {
  loadingBrowse.value[tabId] = true;
  try {
    const qs = force ? "?force=true" : "";
    const data = await apiFetch<any>(`/api/slskd/users/${encodeURIComponent(username)}/browse${qs}`);
    if (data) {
      saveBrowseCache(username, data);
      applyBrowseData(tabId, data);
    }
  } catch {
    /* silent */
  }
  loadingBrowse.value[tabId] = false;
}

function applyBrowseData(tabId: string, data: any) {
  const allDirs = [
    ...(data.directories ?? []),
    ...(data.lockedDirectories ?? []).map((d: any) => ({ ...d, locked: true })),
  ];
  browseInfo.value[tabId] = {
    directories: data.directories?.length ?? 0,
    files: allDirs.reduce((s: number, d: any) => s + (d.fileCount ?? 0), 0),
  };
  browseTree.value[tabId] = buildBrowseTree(allDirs);
}

/** Filter browse tree by query string (matches full remote path) */
function filteredBrowseTree(tabId: string): any[] {
  const q = (browseQuery.value[tabId] || "").toLowerCase().trim();
  const dirs = browseTree.value[tabId];
  if (!dirs) return [];
  if (!q) return dirs;
  return filterBrowseTree(dirs, q);
}

// ── Context menu (users in room) ─────────────────────────────────────────
const ctxMenu = reactive({ visible: false, x: 0, y: 0, username: "", roomName: "" });

function onUserContextmenu(event: MouseEvent, user: any, roomName: string) {
  ctxMenu.visible = true;
  ctxMenu.x = event.clientX;
  ctxMenu.y = event.clientY;
  ctxMenu.username = user.username ?? user;
  ctxMenu.roomName = roomName;
}

function ctxOpenChat() {
  ctxMenu.visible = false;
  addUserChat(ctxMenu.username);
}

function ctxBrowseFiles() {
  ctxMenu.visible = false;
  addBrowseFiles(ctxMenu.username);
}

function ctxBlockUser() {
  ctxMenu.visible = false;
  // TODO: slskd blocklist via options YAML or future API
}

function ctxIgnoreUser() {
  ctxMenu.visible = false;
  // TODO: slskd ignore via options YAML or future API
}

// ── Context menu (files / folders in browse) ───────────────────────
const browseCtx = reactive({
  visible: false,
  x: 0,
  y: 0,
  type: "" as "file" | "dir",
  file: null as any,
  dir: null as any,
  username: "",
});

function onDirContextmenuFromNode(payload: { path: string; name: string; x: number; y: number }, username: string) {
  const tabId = activeTabId.value;
  if (!tabId) return;
  const findNode = (nodes: any[]): any => {
    for (const n of nodes) {
      if (n.path === payload.path) return n;
      const found = findNode(n.children || []);
      if (found) return found;
    }
    return null;
  };
  const dir = findNode(browseTree.value[tabId] || []);
  if (!dir) return;
  browseCtx.visible = true;
  browseCtx.x = payload.x;
  browseCtx.y = payload.y;
  browseCtx.type = "dir";
  browseCtx.file = null;
  browseCtx.dir = dir;
  browseCtx.username = username;
}

function onFileContextmenu(event: MouseEvent, file: any, dir: any, username: string) {
  browseCtx.visible = true;
  browseCtx.x = event.clientX;
  browseCtx.y = event.clientY;
  browseCtx.type = "file";
  browseCtx.file = file;
  browseCtx.dir = dir;
  browseCtx.username = username;
}

function onDirContextmenu(event: MouseEvent, dir: any, username: string) {
  browseCtx.visible = true;
  browseCtx.x = event.clientX;
  browseCtx.y = event.clientY;
  browseCtx.type = "dir";
  browseCtx.file = null;
  browseCtx.dir = dir;
  browseCtx.username = username;
}

function ctxDownloadFile() {
  browseCtx.visible = false;
  const file = browseCtx.file;
  const dir = browseCtx.dir;
  if (!file || !browseCtx.username) return;
  // Soulseek needs the full relative path from the user's share root
  const basePath = dir?.path || dir?.name || "";
  const fullPath = basePath ? basePath + "\\" + file.filename : file.filename;
  apiFetch("/api/slskd/transfers", {
    method: "POST",
    body: { username: browseCtx.username, files: [{ filename: fullPath, size: file.size }] },
  }).catch(() => {});
}

function ctxDownloadBrowseDir() {
  browseCtx.visible = false;
  const dir = browseCtx.dir;
  if (!dir || !browseCtx.username) return;
  // Send just the directory path — the middleware recursively collects files
  // from its browse cache and chunks them to slskd. Much lighter than sending
  // the full file list from the frontend.
  const directoryPath = dir.path || dir.name;
  apiFetch("/api/slskd/download-directory", {
    method: "POST",
    body: { username: browseCtx.username, directoryPath },
  }).then((res: any) => {
    // Track batches so the downloads page can merge subdirectory groups
    if (res?.batchIds?.length) {
      try {
        const raw = sessionStorage.getItem("slskd_batches");
        const batches: { rootPath: string; username: string; ts: number; batchId: string }[] = raw ? JSON.parse(raw) : [];
        const now = Date.now();
        const fresh = batches.filter((b) => now - b.ts < 300_000);
        for (const bid of res.batchIds) {
          fresh.push({ rootPath: directoryPath, username: browseCtx.username, ts: now, batchId: bid });
        }
        sessionStorage.setItem("slskd_batches", JSON.stringify(fresh));
      } catch { /* quota exceeded, ignore */ }
    }
    if (res?.totalFiles) {
      console.log(`[slskd] Queued ${res.sent ?? res.totalFiles}/${res.totalFiles} files from "${directoryPath}" (${browseCtx.username})`);
    }
  }).catch((err: any) => {
    console.warn("[slskd] Directory download failed:", err);
  });
}

// ── Context menu (mobile fallback via click) ────────────────────────────
const mobileCtx = reactive({
  visible: false,
  x: 0,
  y: 0,
  type: "" as "user" | "file" | "dir",
  username: "",
});

// ── Helpers ─────────────────────────────────────────────────────────────

/** Escape HTML entities and convert URLs to clickable links that open in a new tab. */
function linkify(text: string): string {
  if (!text) return '';
  // 1. Escape HTML to prevent XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  // 2. Convert URLs to <a> tags (http, https, ftp, magnet, ed2k, slsk)
  return escaped.replace(
    /(https?:\/\/|ftp:\/\/|magnet:\?|ed2k:\/\/|slsk:\/\/)[^\s<>"{}|\\^`[\]]+/gi,
    (url) => {
      const href = url.replace(/&amp;/g, '&'); // undo escaping for the href attribute
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`;
    },
  );
}

function formatTime(ts: string | number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return "";
  const base = 0x1f1e6;
  return String.fromCodePoint(base + code.codePointAt(0)! - 65, base + code.codePointAt(1)! - 65);
}

function statusClass(status: string): string {
  switch (status?.toLowerCase()) {
    case "online":
      return "status-online";
    case "away":
      return "status-away";
    default:
      return "status-offline";
  }
}

function humanSpeed(bytesPerSec: number): string {
  if (!bytesPerSec) return "0";
  if (bytesPerSec >= 1_000_000) return (bytesPerSec / 1_000_000).toFixed(1) + " MB/s";
  if (bytesPerSec >= 1_000) return (bytesPerSec / 1_000).toFixed(0) + " KB/s";
  return bytesPerSec + " B/s";
}

function displayName(name: string): string {
  if (!name) return "";
  const parts = name.split(/[\\/]/);
  return parts[parts.length - 1] || name;
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes >= 1_000_000_000) return (bytes / 1_000_000_000).toFixed(1) + " GB";
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + " MB";
  if (bytes >= 1_000) return (bytes / 1_000).toFixed(0) + " KB";
  return bytes + " B";
}

function onTabContextmenu(event: MouseEvent, tab: ChatTab) {
  // Right-click on tab: close it
  closeTab(tab.id);
}

// ── Fetch available rooms list ───────────────────────────────────────────
async function fetchRoomsList() {
  loadingRooms.value = true;
  try {
    const data = await apiFetch<any[]>("/api/slskd/rooms/available");
    roomsList.value = data ?? [];
  } catch {
    roomsList.value = [];
  } finally {
    loadingRooms.value = false;
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────
onMounted(async () => {
  // 0. Fetch available rooms for the rooms tab
  fetchRoomsList();

  // 1. Restore already-joined rooms from slskd
  try {
    const joined = await apiFetch<string[]>("/api/slskd/rooms/joined");
    if (Array.isArray(joined)) {
      joined.forEach((name) => {
        if (!name) return;
        const id = nextTabId("room", name);
        if (tabs.value.find((t) => t.id === id)) return;
        tabs.value.push({ type: "room", id, label: name });
        roomMessages.value[id] = [];
        roomUsers.value[id] = [];
        if (!activeTabId.value) activeTabId.value = id;
        fetchRoomData(id, name);
        pollTimers[id] = setInterval(() => fetchRoomData(id, name), 3000);
      });
    }
  } catch {
    /* silent */
  }

  // 2. Restore open user conversations from slskd
  try {
    const conversations = await apiFetch<any[]>("/api/slskd/conversations");
    if (Array.isArray(conversations) && conversations.length > 0) {
      conversations.forEach((conv: any) => {
        const username = conv.username;
        if (!username) return;
        const id = nextTabId("user", username);
        if (tabs.value.find((t) => t.id === id)) return;
        tabs.value.push({ type: "user", id, label: username });
        userMessages.value[id] = [];
        userInfo.value[id] = null;
        loadingUserInfo.value[id] = true;
        if (!activeTabId.value) activeTabId.value = id;
        fetchUserInfo(id, username);
        fetchUserMessages(id, username);
        pollTimers[id] = setInterval(() => fetchUserMessages(id, username), 3000);
      });
    }
  } catch {
    /* silent */
  }

  // 3. Restore browse tabs from session (persistent across refresh)
  restoreBrowseTabs();

  // 4. Check hash for a specific tab (overrides all of the above)
  const hash = route.hash?.replace(/^#/, "");
  if (hash) {
    const decoded = decodeURIComponent(hash);
    // Try to match existing tab by ID (with type:: prefix) or as room name
    const existing =
      tabs.value.find((t) => t.id === decoded) ||
      tabs.value.find((t) => t.id === nextTabId("room", decoded));
    if (existing) {
      activeTabId.value = existing.id;
    } else if (decoded.startsWith("user:")) {
      const username = decoded.slice(5);
      if (username) addUserChat(username);
    } else if (decoded.startsWith("files:")) {
      const username = decoded.slice(6);
      if (username) addBrowseFiles(username);
    } else if (decoded.startsWith("room:")) {
      addRoom(decoded.slice(5));
    } else {
      addRoom(decoded);
    }
  }
});

// Watch for hash changes
watch(
  () => route.hash,
  (hash) => {
    if (hash) {
      const decoded = decodeURIComponent(hash.replace(/^#/, ""));
      if (!decoded) return;
      // First check if it matches an existing tab (room::name, user::name, files::name)
      const existing =
        tabs.value.find((t) => t.id === decoded) ||
        tabs.value.find((t) => t.id === nextTabId("room", decoded));
      if (existing) {
        activeTabId.value = existing.id;
      } else if (decoded.startsWith("user:")) {
        const username = decoded.slice(5);
        if (username) addUserChat(username);
      } else if (decoded.startsWith("files:")) {
        const username = decoded.slice(6);
        if (username) addBrowseFiles(username);
      } else if (decoded.startsWith("room:")) {
        addRoom(decoded.slice(5));
      } else {
        addRoom(decoded);
      }
    }
  },
);

// Sync hash when active tab changes
watch(activeTabId, (id) => {
  if (id && id !== "_rooms") {
    router.replace({ hash: "#" + id });
  } else {
    router.replace({ hash: "" });
  }
});

// ── Init ────────────────────────────────────────────────────────────

onUnmounted(() => {
  Object.values(pollTimers).forEach(clearInterval);
});

// Track scroll intent on message lists (delegated — lists come and go with tabs)
onMounted(() => {
  document.addEventListener("scroll", onMsgListScroll, true);
});

onUnmounted(() => {
  document.removeEventListener("scroll", onMsgListScroll, true);
});
</script>

<style scoped>
.room-view {
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  flex: 1;
  min-height: calc(100vh - 240px);
  min-height: calc(100dvh - 240px);
}

.room-users-panel {
  border-right: 1px solid var(--s-border);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 240px);
  max-height: calc(100dvh - 240px);
}

.room-users-header {
  padding: 0.5rem;
  border-bottom: 1px solid var(--s-border);
  display: flex;
  gap: 0.3rem;
  align-items: center;
}

.room-user-sort-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--s-text-secondary);
  font-size: 0.75rem;
  padding: 2px 4px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  gap: 1px;
  transition: background 0.1s, color 0.1s;
}
.room-user-sort-btn:first-of-type {
  margin-left: auto;
}
.room-user-sort-btn:hover {
  background: var(--s-bg-hover);
  color: var(--s-accent);
}
.room-user-sort-btn.active {
  color: var(--s-accent);
  background: var(--s-bg-hover);
}
.room-user-sort-btn .sort-arrow {
  font-size: 0.6rem;
}

.room-users-list {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.room-user-item {
  padding: 0.3rem 0.5rem;
  cursor: default;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
}
.room-user-item:hover {
  background: var(--s-bg-hover);
}

.room-user-status {
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  width: 1.1rem;
  justify-content: center;
}
.room-user-status.status-online {
  color: var(--s-success, #48c774);
}
.room-user-status.status-away {
  color: var(--s-warning, #ffd83d);
}
.room-user-status.status-offline {
  color: var(--s-text-secondary, #888);
}

.room-user-flag {
  font-size: 0.9rem;
  line-height: 1;
  width: 1.2rem;
  text-align: center;
}

.room-user-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.8rem;
}

.room-user-files {
  font-size: 0.65rem;
  color: var(--s-text-secondary);
  margin-left: auto;
  padding: 0 0.3rem;
}
.room-user-files::before {
  content: "(";
}
.room-user-files::after {
  content: ")";
}

.room-user-slots {
  display: inline-flex;
  align-items: center;
}

.room-messages-panel {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 240px);
  max-height: calc(100dvh - 240px);
}

.room-messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  min-height: 0;
}

.message-item {
  padding: 0.2rem 0;
  line-height: 1.4;
}

.message-time {
  margin-right: 0.4rem;
}

.message-author {
  margin-right: 0.3rem;
  color: var(--s-accent);
  cursor: pointer;
}
.message-author:hover {
  text-decoration: underline;
}

.room-input-row {
  position: relative;
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  border-top: 1px solid var(--s-border);
  align-items: center;
}

.room-input-row > :first-child {
  flex: 1;
}

/* ── Emoji picker ──────────────────────────────────── */
.emoji-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  background: var(--s-bg);
  color: var(--s-text-secondary);
  cursor: pointer;
  font-size: 1.1rem;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.emoji-btn:hover {
  background: var(--s-bg-hover);
  color: var(--s-accent);
}

.emoji-picker {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  width: 320px;
  max-height: 320px;
  background: var(--s-bg);
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.emoji-categories {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--s-border);
  padding: 0.25rem;
  flex-shrink: 0;
  overflow-x: auto;
}
.emoji-cat-btn {
  background: none;
  border: none;
  font-size: 1rem;
  padding: 0.3rem 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  color: var(--s-text-secondary);
  transition: background 0.1s;
}
.emoji-cat-btn:hover {
  background: var(--s-bg-hover);
}
.emoji-cat-btn.active {
  background: var(--s-accent-bg, rgba(72, 199, 116, 0.15));
  color: var(--s-accent);
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  padding: 0.35rem;
  overflow-y: auto;
  flex: 1;
}
.emoji-item {
  background: none;
  border: none;
  font-size: 1.25rem;
  padding: 0.25rem;
  cursor: pointer;
  border-radius: 4px;
  line-height: 1;
  text-align: center;
  transition: background 0.1s;
}
.emoji-item:hover {
  background: var(--s-bg-hover);
}

.icon-lg {
  font-size: 2rem;
}

/* ── Tab label styles ───────────────────────────────── */

.tab-label-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.tab-prefix {
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.6;
}
.tab-prefix-room {
  color: var(--s-text-secondary);
}
.tab-prefix-user {
  color: var(--s-success);
}
.tab-prefix-files {
  color: var(--s-warning);
  font-size: 0.85rem;
}

.tab-label-text {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 3px;
  font-size: 0.6rem;
  color: var(--s-text-secondary);
  opacity: 0.5;
  transition: opacity 0.15s;
  padding: 0;
}
.tab-close-btn:hover {
  opacity: 1;
  background: var(--s-border);
  color: var(--s-danger);
}

/* ── User info panel ────────────────────────────────── */

.user-info-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem;
  border-bottom: 1px solid var(--s-border);
  margin-bottom: 0.25rem;
}
.user-info-header .user-info-icon {
  font-size: 1.4rem;
  color: var(--s-accent);
}
.user-info-username {
  flex: 1;
  font-weight: 600;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-info-flag {
  font-size: 1.1rem;
  line-height: 1;
}
.user-info-presence {
  font-size: 0.7rem;
}

.user-info-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
  white-space: nowrap;
}
.user-info-item .mdi {
  width: 1.1rem;
  text-align: center;
  font-size: 0.85rem;
  color: var(--s-text-secondary);
}
.user-info-label {
  color: var(--s-text-secondary);
  flex-shrink: 0;
  min-width: 3.5rem;
}
.user-info-value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-info-value.status-online {
  color: var(--s-success);
}
.user-info-value.status-away {
  color: var(--s-warning);
}

.user-info-item--description {
  flex-wrap: wrap;
}
.user-info-item--description .user-info-value {
  flex: 0 0 100%;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  padding-left: 1.9rem;
}
.user-info-browse-btn {
  padding: 0.5rem;
  border-top: 1px solid var(--s-border);
  margin-top: 0.25rem;
}

/* ── Browse tab ─────────────────────────────────────── */

.browse-toolbar {
  display: flex;
  align-items: center;
  padding: 0.5rem;
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius) var(--s-radius) 0 0;
  border-bottom: none;
  gap: 0.5rem;
}

.browse-filter {
  min-width: 180px;
  max-width: 280px;
}

.browse-tree {
  border: 1px solid var(--s-border);
  border-radius: 0 0 var(--s-radius) var(--s-radius);
  min-height: 300px;
  max-height: calc(100vh - 330px);
  max-height: calc(100dvh - 330px);
  overflow-y: auto;
}

.browse-root-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.browse-file {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.4rem;
  font-size: 0.8rem;
  cursor: pointer;
  border-radius: 3px;
}
.browse-file:hover {
  background: var(--s-bg-hover);
}

.browse-file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browse-file-size {
  font-size: 0.7rem;
  color: var(--s-text-secondary);
  flex-shrink: 0;
}

/* ── Rooms list inside chat ────────────────────────── */
#page-slskd-rooms {
}
#page-slskd-rooms .rooms-scroll {
  /* Let STable's s-table-wrap handle scrolling so thead stays sticky */
}
#page-slskd-rooms .rooms-scroll :deep(.s-table-wrap) {
  max-height: calc(100vh - 240px);
  max-height: calc(100dvh - 240px);
}
#page-slskd-rooms :deep(.s-table tbody tr) {
  cursor: pointer;
}
#page-slskd-rooms :deep(.s-table tbody tr:hover td) {
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ── Chat links ─────────────────────────────────────────────────────── */
:deep(.chat-link) {
  color: var(--s-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
}
:deep(.chat-link:hover) {
  color: var(--s-info);
}
</style>
