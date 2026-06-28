<template>
  <div id="page-slskd-rooms">
    <h1 class="title is-4 mb-4">
      <span class="mdi mdi-chat-outline mr-1" />
      {{ $t("slskd.rooms", "Canales") }}
    </h1>

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
            <span v-if="row.isPrivate" class="mdi mdi-lock has-text-warning" :title="$t('slskd.private')" />
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
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const { t } = useI18n();
const router = useRouter();

const roomQuery = ref("");
const rooms = ref<any[]>([]);
const loadingRooms = ref(false);
const sortField = ref("");
const sortDir = ref<"asc" | "desc">("asc");

const roomColumns = computed(() => [
  { key: "type", label: "", width: 36 },
  { prop: "name", label: t("slskd.roomName", "Canal"), sortable: true },
  { key: "users", label: t("slskd.roomUsers", "Usuarios"), width: 90, align: "right" as const, sortable: true },
]);

const filteredRooms = computed(() => {
  if (!roomQuery.value) return rooms.value;
  const q = roomQuery.value.toLowerCase();
  return rooms.value.filter((r: any) => r.name?.toLowerCase().includes(q));
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

onMounted(async () => {
  loadingRooms.value = true;
  try {
    const data = await apiFetch<any[]>("/api/slskd/rooms/available");
    rooms.value = data ?? [];
  } catch {
    rooms.value = [];
  } finally {
    loadingRooms.value = false;
  }
});

async function onRoomClick(row: any) {
  const roomName = row.name;
  if (!roomName) return;
  router.push(`/slskd/chat#${encodeURIComponent(roomName)}`);
}
</script>

<style scoped>
#page-slskd-rooms {
}
.rooms-scroll {
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}
.icon-lg {
  font-size: 2rem;
}
#page-slskd-rooms :deep(.s-table tbody tr) {
  cursor: pointer;
}
#page-slskd-rooms :deep(.s-table tbody tr:hover td) {
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
