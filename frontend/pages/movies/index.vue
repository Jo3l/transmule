<script setup lang="ts">
const { loadProviders, getProviders } = useProviders();
await loadProviders();
const movieProviders = getProviders("movies");
const first = movieProviders[0]?.id || "yts";
await navigateTo(`/movies/${first}`, { replace: true });
</script>
