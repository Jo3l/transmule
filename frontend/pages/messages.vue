<template>
  <div>
    <h1 class="title is-4 mb-4">{{ $t("messages.title") }}</h1>

    <div class="columns">
      <div class="column is-5">
        <div class="box">
          <h2 class="subtitle is-5 mb-3">{{ $t("messages.friends") }}</h2>
          <STable
            :data="friends"
            :columns="friendCols"
            :loading="loading"
            highlight-current
            size="sm"
            @current-change="selectFriend"
          >
            <template #cell-name="{ row }">
              <div style="display: flex; align-items: center; gap: 0.5rem">
                <span class="mdi mdi-account" />
                <span class="has-text-weight-medium">{{ row.name }}</span>
                <STag v-if="row.friendSlot" size="sm">{{
                  $t("messages.slot")
                }}</STag>
              </div>
            </template>
            <template #cell-ip="{ row }">
              <span class="is-size-7">{{
                row.ip ? row.ip + ":" + row.port : $t("messages.offline")
              }}</span>
            </template>
            <template #empty>
              <div class="has-text-centered py-4 has-text-grey">
                <span class="mdi mdi-account-off" style="font-size: 2rem" />
                <p>{{ $t("messages.noFriends") }}</p>
              </div>
            </template>
          </STable>

          <div class="mt-3">
            <SButton size="sm" @click="refresh" :loading="loading">
              <span class="mdi mdi-refresh mr-1" /> {{ $t("messages.refresh") }}
            </SButton>
          </div>
        </div>
      </div>

      <div class="column is-7">
        <div class="box" v-if="selectedFriend">
          <h2 class="subtitle is-5 mb-3">
            <span class="mdi mdi-account" /> {{ selectedFriend.name }}
          </h2>

          <div class="kv-list mb-4">
            <div class="kv-row">
              <span class="kv-label has-text-weight-semibold">{{
                $t("messages.hash")
              }}</span>
              <span class="kv-value">
                <span class="is-family-monospace is-size-7">{{
                  selectedFriend.hash || "—"
                }}</span>
              </span>
            </div>
            <div class="kv-row">
              <span class="kv-label has-text-weight-semibold">{{
                $t("messages.address")
              }}</span>
              <span class="kv-value">{{
                selectedFriend.ip
                  ? selectedFriend.ip + ":" + selectedFriend.port
                  : $t("messages.offline")
              }}</span>
            </div>
            <div class="kv-row">
              <span class="kv-label has-text-weight-semibold">{{
                $t("messages.friendSlot")
              }}</span>
              <span class="kv-value">{{
                selectedFriend.friendSlot
                  ? $t("messages.yes")
                  : $t("messages.no")
              }}</span>
            </div>
            <div v-if="selectedFriend.client" class="kv-row">
              <span class="kv-label has-text-weight-semibold">{{
                $t("messages.client")
              }}</span>
              <span class="kv-value">
                {{ selectedFriend.client.clientName }}
                <span
                  class="has-text-grey"
                  v-if="selectedFriend.client.software"
                  >({{ selectedFriend.client.software }}
                  {{ selectedFriend.client.softwareVersion }})</span
                >
              </span>
            </div>
            <div v-if="selectedFriend.client" class="kv-row">
              <span class="kv-label has-text-weight-semibold">{{
                $t("messages.speeds")
              }}</span>
              <span class="kv-value">
                <span class="mdi mdi-arrow-up" />
                {{ selectedFriend.client.uploadSpeed_fmt }} /
                <span class="mdi mdi-arrow-down" />
                {{ selectedFriend.client.downloadSpeed_fmt }}
              </span>
            </div>
          </div>

          <div class="chat-area">
            <div class="chat-messages">
              <div
                v-if="messages.length === 0"
                class="has-text-centered has-text-grey py-4"
              >
                <span class="mdi mdi-chat-outline" style="font-size: 1.5rem" />
                <p class="is-size-7 mt-1">{{ $t("messages.noMessages") }}</p>
              </div>
              <div
                v-for="(msg, i) in messages"
                :key="i"
                class="chat-message"
                :class="{
                  'is-outgoing': msg.outgoing,
                  'is-incoming': !msg.outgoing,
                }"
              >
                <div class="chat-bubble">
                  <p>{{ msg.text }}</p>
                  <span class="chat-time">{{ msg.time }}</span>
                </div>
              </div>
            </div>
            <div class="chat-input">
              <div style="display: flex; gap: 0.5rem">
                <SInput
                  v-model="chatMessage"
                  :placeholder="$t('messages.placeholder')"
                  size="sm"
                  @enter="sendMessage"
                />
                <SButton
                  variant="primary"
                  size="sm"
                  @click="sendMessage"
                  :disabled="!chatMessage.trim()"
                >
                  <span class="mdi mdi-send mr-1" /> {{ $t("messages.send") }}
                </SButton>
              </div>
              <p class="has-text-grey is-size-7 mt-1">
                <span class="mdi mdi-information-outline" />
                {{ $t("messages.sendUnsupported") }}
              </p>
            </div>
          </div>
        </div>
        <div v-else class="box has-text-centered py-6 has-text-grey">
          <span class="mdi mdi-message-text-outline" style="font-size: 3rem" />
          <p class="mt-2">{{ $t("messages.selectFriend") }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { apiFetch } = useApi();
const { amuleRunning } = useServiceGuard();
const friends = ref<any[]>([]);
const loading = ref(false);
const selectedFriend = ref<any>(null);
const chatMessage = ref("");
const messages = ref<{ text: string; outgoing: boolean; time: string }[]>([]);

const friendCols = computed(() => [
  { prop: "name", label: t("messages.columns.name") },
  { key: "ip", label: t("messages.columns.address"), width: 140 },
]);

async function refresh() {
  if (!amuleRunning.value) return;
  loading.value = true;
  try {
    const res = await apiFetch<any>("/api/amule/friends");
    friends.value = res?.friends?.list || [];
  } finally {
    loading.value = false;
  }
}

function selectFriend(row: any) {
  selectedFriend.value = row;
  messages.value = [];
}

function sendMessage() {
  if (!chatMessage.value.trim() || !selectedFriend.value) return;
  messages.value.push({
    text: chatMessage.value.trim(),
    outgoing: true,
    time: new Date().toLocaleTimeString(),
  });
  chatMessage.value = "";
}

onMounted(refresh);
</script>

<style scoped>
.chat-area {
  border: 1px solid var(--s-border);
  border-radius: var(--s-radius);
  overflow: hidden;
}
.chat-messages {
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
  padding: 0.75rem;
  background: var(--s-bg-surface-alt);
}
.chat-message {
  display: flex;
  margin-bottom: 0.5rem;
}
.chat-message.is-outgoing {
  justify-content: flex-end;
}
.chat-message.is-incoming {
  justify-content: flex-start;
}
.chat-bubble {
  max-width: 75%;
  padding: 0.5rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  line-height: 1.4;
}
.is-outgoing .chat-bubble {
  background: var(--s-accent);
  color: var(--s-text-inverse);
  border-bottom-right-radius: 4px;
}
.is-incoming .chat-bubble {
  background: var(--s-bg-hover);
  color: var(--s-text);
  border-bottom-left-radius: 4px;
}
.chat-time {
  display: block;
  font-size: 0.65rem;
  opacity: 0.7;
  margin-top: 0.15rem;
}
.chat-input {
  padding: 0.75rem;
  border-top: 1px solid var(--s-border);
  background: var(--s-bg-surface);
}
</style>
