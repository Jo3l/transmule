<script setup lang="ts">
const { loadProviders, getProviders } = useProviders();
await loadProviders();
const showProviders = getProviders("shows");
const first = showProviders[0]?.id || "showrss";
await navigateTo(`/shows/${first}`, { replace: true });
</script>
