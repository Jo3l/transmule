<template>
  <SLoading id="page-planner-series" :loading="loading">
    <div class="py-4">
      <div class="level mb-4">
        <div class="level-left">
          <h2 class="title is-4 mb-0">
            <span class="mdi mdi-television-play mr-2" />{{ $t("planner.series") }}
          </h2>
        </div>
        <div class="level-right">
          <SButton
            variant="primary"
            icon="mdi-plus"
            @click="showAdd = true"
          >
            {{ $t("planner.addSeries") }}
          </SButton>
        </div>
      </div>

      <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>

      <div v-if="!loading && items.length === 0" class="box has-text-centered">
        <p><span class="mdi mdi-television-off is-size-2 has-text-grey-light" /></p>
        <p class="has-text-grey mb-3">{{ $t("planner.noSeries") }}</p>
        <SButton variant="primary" icon="mdi-plus" @click="showAdd = true">
          {{ $t("planner.addSeries") }}
        </SButton>
      </div>

      <div v-else class="planner-grid">
        <PlannerMediaCard
          v-for="sub in items"
          :key="sub.id"
          :item="sub"
          media-type="series"
        />
      </div>

      <!-- Modal añadir serie -->
      <PlannerAddMediaDialog
        v-model="showAdd"
        media-type="series"
        @added="onAdded"
      />
    </div>
  </SLoading>
</template>

<script setup lang="ts">
const { listSubscriptions } = usePlanner();

const loading = ref(true);
const errorMsg = ref("");
const items = ref<Awaited<ReturnType<typeof listSubscriptions>>>([]);
const showAdd = ref(false);

/** Al añadir (o abrir una ya añadida): cerrar modal y navegar al detalle. */
function onAdded(subId: number) {
  showAdd.value = false;
  navigateTo(`/planner/series/${subId}`);
}

onMounted(async () => {
  try {
    items.value = await listSubscriptions({ type: "series" });
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.planner-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}
</style>
