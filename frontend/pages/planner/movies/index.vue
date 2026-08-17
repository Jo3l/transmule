<template>
  <SLoading id="page-planner-movies" :loading="loading">
    <div class="py-4">
      <div class="level mb-4">
        <div class="level-left">
          <h2 class="title is-4 mb-0">
            <span class="mdi mdi-movie-open mr-2" />{{ $t("planner.movies") }}
          </h2>
        </div>
        <div class="level-right">
          <SButton
            variant="primary"
            icon="mdi-plus"
            @click="showAdd = true"
          >
            {{ $t("planner.addMovie") }}
          </SButton>
        </div>
      </div>

      <SAlert v-if="errorMsg" variant="error" class="mb-4">{{ errorMsg }}</SAlert>

      <div v-if="!loading && items.length === 0" class="box has-text-centered">
        <p><span class="mdi mdi-movie-off is-size-2 has-text-grey-light" /></p>
        <p class="has-text-grey mb-3">{{ $t("planner.noMovies") }}</p>
        <SButton variant="primary" icon="mdi-plus" @click="showAdd = true">
          {{ $t("planner.addMovie") }}
        </SButton>
      </div>

      <div v-else class="columns is-multiline">
        <div
          v-for="sub in items"
          :key="sub.id"
          class="column"
        >
          <div class="planner-card">
            <NuxtLink :to="`/planner/movies/${sub.id}`" class="planner-card-link">
              <div>
                <figure class="image is-2by3">
                  <img
                    v-if="sub.poster_url"
                    :src="sub.poster_url"
                    :alt="sub.title"
                    loading="lazy"
                  />
                  <div v-else class="planner-card-fallback">
                    <span class="mdi mdi-movie-open is-size-1" />
                  </div>
                </figure>
              </div>
            </NuxtLink>
            <div>
              <NuxtLink :to="`/planner/movies/${sub.id}`" class="planner-card-link">
                <p class="title is-6 mb-1">{{ sub.title }}</p>
              </NuxtLink>
              <p class="subtitle is-7 mb-2 has-text-grey">
                <STag v-if="sub.year">{{ sub.year }}</STag>
                <STag v-if="sub.min_quality" class="ml-1">
                  {{ qualityLabel(sub.min_quality) }}
                </STag>
              </p>
              <STag :variant="sub.monitored ? 'success' : 'default'">
                {{ sub.monitored ? $t("planner.monitored") : $t("planner.paused") }}
              </STag>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal añadir película -->
      <PlannerAddMediaDialog
        v-model="showAdd"
        media-type="movie"
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

const QUALITY_LABELS: Record<string, string> = {
  uhd: "4K",
  fullhd: "1080p",
  hd: "720p",
  sd: "480p",
};
function qualityLabel(q: string): string {
  return QUALITY_LABELS[q] ?? q;
}

/** Al añadir (o abrir una ya añadida): cerrar modal y navegar al detalle. */
function onAdded(subId: number) {
  showAdd.value = false;
  navigateTo(`/planner/movies/${subId}`);
}

onMounted(async () => {
  try {
    items.value = await listSubscriptions({ type: "movie" });
  } catch (err: any) {
    errorMsg.value = err?.message ?? String(err);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.planner-card-link {
  display: block;
  color: inherit;
}
.planner-card {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  overflow: hidden;
}
.planner-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}
.planner-card-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--s-bg-hover, #1a1a30);
  color: var(--s-text-muted, #999);
}
</style>