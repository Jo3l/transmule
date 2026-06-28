<template>
  <div id="page-slskd-chat">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-message-text-outline mr-1" />
      {{ $t("slskd.chat", "Chat") }}
    </h1>

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
          <div class="mb-3">
            <SInput v-model="roomQuery" :placeholder="$t('search.filter')" class="mw-300">
              <template #prefix><span class="mdi mdi-magnify" /></template>
            </SInput>
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
            </div>
            <div class="room-users-list">
              <div
                v-for="user in roomUsers[tab.id] ?? []"
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
                <span class="message-text">{{ msg.message }}</span>
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
                @keyup.enter="sendRoomMessage(tab.id)"
              />
              <SButton variant="primary" size="sm" @click="sendRoomMessage(tab.id)">
                <span class="mdi mdi-send" />
              </SButton>
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
                  >{{ $t("app.title") }}:</span
                >
                <span
                  v-else
                  class="message-author has-text-weight-medium"
                  @contextmenu.prevent.stop="onUserContextmenu($event, tab.label, tab.id)"
                  >{{ tab.label }}:</span
                >
                <span class="message-text">{{ msg.message }}</span>
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
              <SButton variant="primary" size="sm" @click="sendUserMessage(tab.id, tab.label)">
                <span class="mdi mdi-send" />
              </SButton>
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
              <div v-for="dir in filteredBrowseTree(tab.id)" :key="dir.name" class="browse-item">
                <div
                  class="browse-dir-header"
                  @click="dir._open = !dir._open"
                  @contextmenu.prevent.stop="onDirContextmenu($event, dir, tab.label)"
                >
                  <span class="mdi" :class="dir._open ? 'mdi-chevron-down' : 'mdi-chevron-right'" />
                  <span class="mdi mdi-folder" />
                  <span class="browse-dir-name">{{ displayName(dir.name) }}</span>
                  <span class="browse-dir-count">({{ dir.fileCount }})</span>
                </div>
                <div v-if="dir._open" class="browse-children">
                  <div
                    v-for="file in dir._filteredFiles ?? dir.files ?? []"
                    :key="file.filename"
                    class="browse-file"
                    @contextmenu.prevent.stop="onFileContextmenu($event, file, tab.label)"
                  >
                    <span class="mdi mdi-file" />
                    <span class="browse-file-name">{{ file.filename }}</span>
                    <span class="browse-file-size">{{ formatSize(file.size) }}</span>
                  </div>
                </div>
              </div>
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
  </div>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

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
  return `${type}::${name}`;
}

// ── Data stores ──────────────────────────────────────────────────────────
const roomMessages = ref<Record<string, any[]>>({});
const roomUsers = ref<Record<string, any[]>>({});
const userMessages = ref<Record<string, any[]>>({});
const userInfo = ref<Record<string, any>>({});
const loadingUserInfo = ref<Record<string, boolean>>({});
const browseInfo = ref<Record<string, any>>({});
const browseTree = ref<Record<string, any[]>>({});
const browseQuery = ref<Record<string, string>>({});
const loadingBrowse = ref<Record<string, boolean>>({});

const messageInput = ref("");
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

let pollTimers: Record<string, ReturnType<typeof setInterval>> = {};

// ── Rooms list state ─────────────────────────────────────────────────────
const roomQuery = ref("");
const roomsList = ref<any[]>([]);
const loadingRooms = ref(false);
const sortField = ref("");
const sortDir = ref<"asc" | "desc">("asc");

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
  addRoom(roomName);
}

// ── Tab management ───────────────────────────────────────────────────────
function addRoom(roomName: string) {
  const id = nextTabId("room", roomName);
  if (tabs.value.find((t) => t.id === id)) return;
  tabs.value.push({ type: "room", id, label: roomName });
  roomMessages.value[id] = [];
  roomUsers.value[id] = [];
  activeTabId.value = id;
  apiFetch("/api/slskd/rooms/join", {
    method: "POST",
    body: { roomName },
  }).catch(() => {});
  fetchRoomData(id, roomName);
  pollTimers[id] = setInterval(() => fetchRoomData(id, roomName), 3000);
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
  saveUserTabs();
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
  } catch {
    /* quota exceeded, ignore */
  }
}

function saveUserTabs() {
  try {
    const names = tabs.value.filter((t) => t.type === "user").map((t) => t.label);
    sessionStorage.setItem("slskd_user_tabs", JSON.stringify(names));
  } catch {
    /* quota exceeded, ignore */
  }
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
      browseTree.value[id] = [];
      browseInfo.value[id] = null;
      loadingBrowse.value[id] = true;
      if (!activeTabId.value) activeTabId.value = id;
      fetchBrowse(id, username);
    });
  } catch {
    /* silent */
  }
}

function restoreUserTabs() {
  try {
    const raw = sessionStorage.getItem("slskd_user_tabs");
    if (!raw) return;
    const names: string[] = JSON.parse(raw);
    if (!Array.isArray(names)) return;
    names.forEach((username) => {
      if (!username) return;
      const id = nextTabId("user", username);
      if (tabs.value.find((t) => t.id === id)) return;
      tabs.value.push({ type: "user", id, label: username });
      userMessages.value[id] = [];
      userInfo.value[id] = null;
      loadingUserInfo.value[id] = true;
      fetchUserInfo(id, username);
      fetchUserMessages(id, username);
      pollTimers[id] = setInterval(() => fetchUserMessages(id, username), 3000);
    });
  } catch {
    /* silent */
  }
}

function closeTab(tabId: string) {
  if (tabId === "_rooms") return; // never close the rooms tab
  const tab = tabs.value.find((t) => t.id === tabId);
  if (!tab) return;
  const wasBrowse = tab.type === "files";

  // Notify slskd when closing a room or user conversation
  if (tab.type === "room") {
    apiFetch("/api/slskd/rooms/leave", {
      method: "POST",
      body: { roomName: tab.label },
    }).catch(() => {});
  } else if (tab.type === "user") {
    apiFetch(`/api/slskd/conversations/${encodeURIComponent(tab.label)}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  tabs.value = tabs.value.filter((t) => t.id !== tabId);
  delete roomMessages.value[tabId];
  delete roomUsers.value[tabId];
  delete userMessages.value[tabId];
  delete userInfo.value[tabId];
  delete loadingUserInfo.value[tabId];
  delete browseInfo.value[tabId];
  delete browseTree.value[tabId];
  delete loadingBrowse.value[tabId];
  if (pollTimers[tabId]) {
    clearInterval(pollTimers[tabId]);
    delete pollTimers[tabId];
  }
  if (activeTabId.value === tabId) {
    const remaining = tabs.value;
    activeTabId.value = remaining.length > 0 ? remaining[remaining.length - 1].id : "";
  }
  const hash = activeTabId.value ? encodeURIComponent(activeTabId.value) : "";
  router.replace({ hash });
  if (wasBrowse) saveBrowseTabs();
  if (tab.type === "user") saveUserTabs();
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
    nextTick(() => {
      const el = getActiveMsgList();
      if (el && isNearBottom(el)) {
        scrollToBottom(el);
      }
    });
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
    await fetchRoomData(tabId, roomName);
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
    nextTick(() => {
      const el = getActiveMsgList();
      if (el && isNearBottom(el)) {
        scrollToBottom(el);
      }
    });
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
    await fetchUserMessages(tabId, username);
  } catch {
    /* silent */
  }
}

// ── Data fetching: Browse ────────────────────────────────────────────────
async function fetchBrowse(tabId: string, username: string) {
  loadingBrowse.value[tabId] = true;
  try {
    const data = await apiFetch<any>(`/api/slskd/users/${encodeURIComponent(username)}/browse`);
    if (data) {
      const allDirs = [
        ...(data.directories ?? []),
        ...(data.lockedDirectories ?? []).map((d: any) => ({ ...d, locked: true })),
      ];
      browseInfo.value[tabId] = {
        directories: data.directories?.length ?? 0,
        files: allDirs.reduce((s: number, d: any) => s + (d.fileCount ?? 0), 0),
      };
      browseTree.value[tabId] = allDirs.map((d: any) => ({ ...d, _open: false }));
    }
  } catch {
    /* silent */
  }
  loadingBrowse.value[tabId] = false;
}

function toggleBrowseDir(tabId: string, dir: any) {
  dir._open = !dir._open;
}

/** Filter browse tree by query string (matches full remote path) */
function filteredBrowseTree(tabId: string): any[] {
  const q = (browseQuery.value[tabId] || "").toLowerCase().trim();
  const dirs = browseTree.value[tabId];
  if (!dirs) return [];
  if (!q) return dirs;

  return dirs
    .map((dir) => {
      const dirName = (dir.name || "").toLowerCase();
      const matchedFiles = (dir.files || []).filter((f: any) => {
        const fullPath = dirName + "\\" + (f.filename || "").toLowerCase();
        return fullPath.includes(q);
      });
      // Include the dir if the dir name matches OR it has matching files
      const dirMatches = dirName.includes(q);
      if (dirMatches) {
        // Show all files when dir name matches
        return { ...dir, _filteredFiles: null, _open: true };
      }
      if (matchedFiles.length > 0) {
        return { ...dir, _filteredFiles: matchedFiles, _open: true };
      }
      return null;
    })
    .filter(Boolean);
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

function onFileContextmenu(event: MouseEvent, file: any, username: string) {
  browseCtx.visible = true;
  browseCtx.x = event.clientX;
  browseCtx.y = event.clientY;
  browseCtx.type = "file";
  browseCtx.file = file;
  browseCtx.dir = null;
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
  if (!file || !browseCtx.username) return;
  apiFetch("/api/slskd/transfers/download", {
    method: "POST",
    body: { username: browseCtx.username, files: [{ filename: file.filename, size: file.size }] },
  }).catch(() => {});
}

function ctxDownloadBrowseDir() {
  browseCtx.visible = false;
  const dir = browseCtx.dir;
  if (!dir || !browseCtx.username) return;
  const allFiles = (dir.files ?? []).map((f: any) => ({ filename: f.filename, size: f.size }));
  if (allFiles.length === 0) return;
  apiFetch("/api/slskd/transfers/download", {
    method: "POST",
    body: { username: browseCtx.username, files: allFiles },
  }).catch(() => {});
}

// ── Context menu (mobile fallback via click) ────────────────────────────
const mobileCtx = reactive({
  visible: false,
  x: 0,
  y: 0,
  type: "" as "user" | "file",
  username: "",
});

// ── Helpers ─────────────────────────────────────────────────────────────
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

  // 4. Restore user tabs from session (catches users without active API conversations)
  restoreUserTabs();

  // 5. Check hash for a specific tab (overrides all of the above)
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
      } else {
        addRoom(decoded);
      }
    }
  },
);

// ── Init ────────────────────────────────────────────────────────────

onUnmounted(() => {
  Object.values(pollTimers).forEach(clearInterval);
});
</script>

<style scoped>
.room-view {
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  flex: 1;
  min-height: calc(100vh - 240px);
}

.room-users-panel {
  border-right: 1px solid var(--s-border);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 240px);
}

.room-users-header {
  padding: 0.5rem;
  border-bottom: 1px solid var(--s-border);
  display: flex;
  gap: 0.3rem;
  align-items: center;
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
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  border-top: 1px solid var(--s-border);
  align-items: center;
}

.room-input-row > :first-child {
  flex: 1;
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
  overflow-y: auto;
}

.browse-dir-header {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--s-border);
}
.browse-dir-header:hover {
  background: var(--s-bg-hover);
}

.browse-dir-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.browse-dir-count {
  font-size: 0.7rem;
  color: var(--s-text-secondary);
}

.browse-children {
  border-bottom: 1px solid var(--s-border);
}

.browse-file {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.5rem 0.25rem 1.8rem;
  font-size: 0.8rem;
  cursor: default;
}
.browse-file:hover {
  background: var(--s-bg-hover);
}

.browse-file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
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
  max-height: calc(100vh - 240px);
  overflow-y: auto;
}
#page-slskd-rooms :deep(.s-table tbody tr) {
  cursor: pointer;
}
#page-slskd-rooms :deep(.s-table tbody tr:hover td) {
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
