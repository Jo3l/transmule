<script setup lang="ts">
const route = useRoute();
const { loadProviders, getProviders } = useProviders();
await loadProviders();
const type = String(route.params.type ?? "");
const typeProviders = getProviders(type);
const first = typeProviders[0]?.id;
if (first) {
  await navigateTo(`/media/${type}/${first}`, { replace: true });
}
</script>
