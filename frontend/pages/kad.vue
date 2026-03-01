<template>
  <SLoading :loading="loading">
    <h1 class="title is-4 mb-4">{{ $t("kad.title") }}</h1>

    <div class="box mb-4">
      <div class="columns is-vcentered">
        <div class="column">
          <h2 class="subtitle is-5 mb-2">{{ $t("kad.status") }}</h2>
          <p>
            <STag :variant="kadConnected ? 'success' : 'danger'" size="lg">
              {{ kadConnected ? $t("kad.connected") : $t("kad.disconnected") }}
            </STag>
          </p>
          <div class="mt-3" v-if="kadConnected">
            <div class="kv-list">
              <div class="kv-row">
                <span class="kv-label">{{ $t("kad.kadUsers") }}</span>
                <span class="kv-value">{{
                  (kadUsers || 0).toLocaleString()
                }}</span>
              </div>
              <div class="kv-row">
                <span class="kv-label">{{ $t("kad.kadFiles") }}</span>
                <span class="kv-value">{{
                  (kadFiles || 0).toLocaleString()
                }}</span>
              </div>
              <div class="kv-row">
                <span class="kv-label">{{ $t("kad.kadNodes") }}</span>
                <span class="kv-value">{{
                  (kadNodes || 0).toLocaleString()
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="box">
      <h2 class="subtitle is-5 mb-3">{{ $t("kad.bootstrap") }}</h2>
      <p class="has-text-grey is-size-7 mb-3">
        {{ $t("kad.bootstrapNote") }}
      </p>
      <form @submit.prevent="doBootstrap">
        <div class="columns">
          <div class="column is-6">
            <SFormItem :label="$t('kad.ipAddress')">
              <SInput
                v-model="bootstrapIp"
                :placeholder="$t('kad.ipPlaceholder')"
              >
                <template #prefix><span class="mdi mdi-ip-network" /></template>
              </SInput>
            </SFormItem>
          </div>
          <div class="column is-3">
            <SFormItem :label="$t('kad.port')">
              <SInput
                v-model="bootstrapPort"
                type="number"
                :placeholder="$t('kad.portPlaceholder')"
              />
            </SFormItem>
          </div>
          <div class="column is-3 is-flex is-align-items-flex-end">
            <SButton variant="primary" native-type="submit" :loading="loading">
              <span class="mdi mdi-connection mr-1" />
              {{ $t("kad.bootstrapButton") }}
            </SButton>
          </div>
        </div>
      </form>
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { apiFetch } = useApi();
const kadConnected = ref(false);
const kadUsers = ref(0);
const kadFiles = ref(0);
const kadNodes = ref(0);
const bootstrapIp = ref("");
const bootstrapPort = ref("");
const loading = ref(false);

async function refresh() {
  loading.value = true;
  try {
    const res = await apiFetch<any>("/api/amule/kad");
    kadConnected.value = res?.kad_status?.connected ?? false;
    kadUsers.value = res?.kad_status?.kadUsers || 0;
    kadFiles.value = res?.kad_status?.kadFiles || 0;
    kadNodes.value = res?.kad_status?.kadNodes || 0;
  } finally {
    loading.value = false;
  }
}

async function doBootstrap() {
  loading.value = true;
  try {
    await apiFetch("/api/amule/kad", {
      method: "POST",
      body: {
        action: "bootstrap",
        ip: bootstrapIp.value,
        port: Number(bootstrapPort.value) || 4672,
      },
    });
    await refresh();
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
