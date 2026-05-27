<template>
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
              <template v-if="!p.checkable && p.open === null">{{ $t("ports.udpNote") }}</template>
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
</template>

<script setup lang="ts">
const { ports, privateIp, publicIp, checking, refresh } = usePortStatus();
</script>

<style scoped>
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
}
.port-proto-tag.tcp {
  background: rgba(99, 179, 237, 0.18);
  color: #63b3ed;
}
.port-proto-tag.udp {
  background: rgba(154, 117, 234, 0.18);
  color: #9a75ea;
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
}
.port-node .port-node-title {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.5;
}
.port-node .port-node-ip {
  font-size: 0.8rem;
  font-weight: 500;
  font-family: monospace;
}
.port-node .port-node-port {
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.65;
}
.port-node.private {
  border-color: rgba(99, 179, 237, 0.35);
  background: rgba(99, 179, 237, 0.05);
}
.port-node.public {
  border-color: rgba(246, 173, 85, 0.35);
  background: rgba(246, 173, 85, 0.05);
}
.port-node.internet {
  align-items: center;
  text-align: center;
  min-width: 90px;
  flex: 0 0 auto;
  transition: border-color 0.3s, background 0.3s;
}
.port-node.internet .port-status-icon {
  font-size: 1.6rem;
  transition: color 0.3s;
}
.port-node.internet .port-node-label {
  font-size: 0.7rem;
  font-weight: 600;
}
.port-node.internet.is-open {
  border-color: rgba(34, 197, 94, 0.5);
}
.port-node.internet.is-open .port-status-icon {
  color: #22c55e;
}
.port-node.internet.is-closed {
  border-color: rgba(239, 68, 68, 0.5);
}
.port-node.internet.is-closed .port-status-icon {
  color: #ef4444;
}
.port-node.internet.is-checking {
  border-color: rgba(246, 173, 85, 0.5);
}
.port-node.internet.is-checking .port-status-icon {
  color: #f6ad55;
}
.port-node.internet.is-udp {
  border-color: rgba(160, 160, 160, 0.35);
}
.port-node.internet.is-udp .port-status-icon {
  color: var(--s-text-muted);
}
</style>
