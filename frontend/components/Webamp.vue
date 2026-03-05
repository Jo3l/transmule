<template>
  <div ref="container" class="webamp-container" />
</template>

<script setup lang="ts">
import type { Track } from "webamp";

const props = defineProps<{
  track: Track;
  skin?: { url: string };
}>();

const { registerInstance, unregisterInstance } = useWebamp();
const container = useTemplateRef<HTMLDivElement>("container");

let instance: InstanceType<typeof import("webamp").default> | null = null;

onMounted(async () => {
  const Webamp = (await import("webamp")).default;

  if (!Webamp.browserIsSupported()) {
    console.warn("Webamp is not supported in this browser.");
    return;
  }

  instance = new Webamp({
    initialTracks: [props.track],
    ...(props.skin && { initialSkin: props.skin }),
  });

  await instance.renderWhenReady(container.value!);
  // Register only after fully ready so appendTracks() is safe to call
  registerInstance(instance);
});

onBeforeUnmount(() => {
  unregisterInstance();
  instance?.dispose();
  instance = null;
});
</script>

<style scoped>
.webamp-container {
  position: relative;
}
</style>
