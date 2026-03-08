<template>
  <div class="port-status">
    <div class="port-status-header">
      <span class="mdi mdi-lan"></span>
      {{ $t("ports.title") }}
      <button
        class="port-status-refresh"
        :class="{ 'is-spinning': checking }"
        :title="$t('ports.refresh')"
        @click="refresh"
      >
        <span class="mdi mdi-refresh"></span>
      </button>
    </div>
    <ul class="port-status-list">
      <li v-for="p in ports" :key="`${p.port}-${p.proto}`" class="port-status-item">
        <span
          class="port-status-dot"
          :class="{
            'is-open': p.open === true,
            'is-closed': p.open === false,
            'is-unknown': p.open === null,
          }"
          :title="
            p.open === true
              ? $t('ports.open')
              : p.open === false
                ? $t('ports.closed')
                : $t('ports.checking')
          "
        />
        <span class="port-status-label">{{ p.label }}</span>
        <span class="port-status-port">{{ p.port }}/{{ p.proto }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
const { ports, checking, refresh } = usePortStatus();
</script>
