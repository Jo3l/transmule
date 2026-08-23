<template>
  <SDialog
    :model-value="setupOpen"
    width="520px"
    :title="$t('planner.setupTitle')"
    @update:model-value="(v: boolean) => !v && closeSetup()"
  >
    <p class="mb-3">{{ $t("planner.setupNoIntegration") }}</p>
    <p class="has-text-grey is-size-7 mb-3">{{ $t("planner.setupHint") }}</p>

    <SAlert
      v-if="status && !status.hasSearchPlugins"
      variant="warning"
      size="sm"
      class="mb-3"
    >
      {{ $t("planner.setupNoPlugins") }}
    </SAlert>

    <template #footer>
      <div class="flex-end">
        <SButton variant="primary" @click="goSettings">
          {{ $t("planner.setupGoSettings") }}
        </SButton>
        <SButton variant="default" @click="closeSetup">
          {{ $t("planner.cancel") }}
        </SButton>
      </div>
    </template>
  </SDialog>
</template>

<script setup lang="ts">
const { setupOpen, status, closeSetup } = usePlannerStatus();

function goSettings() {
  closeSetup();
  navigateTo("/settings");
}
</script>
