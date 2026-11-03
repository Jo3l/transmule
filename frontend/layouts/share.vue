<template>
  <div class="share-layout">
    <header class="share-layout__bar">
      <span class="mdi mdi-mule mr-2" />
      <strong>TransMule</strong>
      <span class="share-layout__tag">{{ $t("share.public.send") }}</span>
    </header>
    <main class="share-layout__main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.share-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg, #0b1220);
}

.share-layout__bar {
  display: flex;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.share-layout__tag {
  margin-left: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-muted, #9ca3af);
}

.share-layout__main {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 2rem 1rem;
}
</style>
