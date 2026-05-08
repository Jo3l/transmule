<template>
  <div class="torrent-name-cell">
    <span :title="name" class="torrent-name" :class="nameClass">{{ name }}</span>
    <div v-if="tags?.length" class="torrent-tags">
      <span
        v-for="(tag, ti) in tags"
        :key="ti"
        :title="tag.tooltip ?? ''"
        class="torrent-tag"
        :class="tag.variant ? `torrent-tag--${tag.variant}` : ''"
      >
        <span v-if="tag.icon" :class="['mdi', tag.icon]" class="torrent-tag-icon" />
        {{ tag.label }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  name: string;
  tags?: Array<{ label: string; variant?: string; icon?: string; tooltip?: string }>;
  nameClass?: string;
}>();
</script>

<style scoped>
.torrent-name-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 280px;
}
.torrent-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  display: block;
}
.torrent-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.torrent-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border-radius: 3px;
  border: 1px solid;
  line-height: 1.4;
  white-space: nowrap;
  text-transform: uppercase;
  color: var(--s-text-secondary, #888);
  background: color-mix(in srgb, var(--s-border) 20%, transparent);
  border-color: var(--s-border);
}
.torrent-tag-icon {
  font-size: 0.6rem;
}

.torrent-tag--success {
  color: var(--s-success, #22c55e);
  background: color-mix(in srgb, var(--s-success, #22c55e) 12%, transparent);
  border-color: color-mix(in srgb, var(--s-success, #22c55e) 25%, transparent);
}
.torrent-tag--warning {
  color: var(--s-warning, #eab308);
  background: color-mix(in srgb, var(--s-warning, #eab308) 12%, transparent);
  border-color: color-mix(in srgb, var(--s-warning, #eab308) 25%, transparent);
}
.torrent-tag--danger {
  color: var(--s-danger, #ef4444);
  background: color-mix(in srgb, var(--s-danger, #ef4444) 12%, transparent);
  border-color: color-mix(in srgb, var(--s-danger, #ef4444) 25%, transparent);
}
.torrent-tag--info {
  color: var(--s-info, #3b82f6);
  background: color-mix(in srgb, var(--s-info, #3b82f6) 12%, transparent);
  border-color: color-mix(in srgb, var(--s-info, #3b82f6) 25%, transparent);
}
.torrent-tag--accent {
  color: var(--s-accent, #a855f7);
  background: color-mix(in srgb, var(--s-accent, #a855f7) 12%, transparent);
  border-color: color-mix(in srgb, var(--s-accent, #a855f7) 25%, transparent);
}
.torrent-tag--primary {
  color: var(--s-primary, #6366f1);
  background: color-mix(in srgb, var(--s-primary, #6366f1) 12%, transparent);
  border-color: color-mix(in srgb, var(--s-primary, #6366f1) 25%, transparent);
}
</style>
