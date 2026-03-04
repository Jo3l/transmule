<template>
  <div ref="container" class="webamp-container" />
</template>

<script setup lang="ts">
import type { Track } from "webamp";

const props = defineProps<{
  track: Track;
  skin?: { url: string };
}>();

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
});

watch(
  () => props.track,
  async (track) => {
    if (instance) {
      await instance.setTracksToPlay([track]);
    }
  },
);

onBeforeUnmount(() => {
  instance?.dispose();
  instance = null;
});
</script>

<style scoped>
.webamp-container {
  position: relative;
}
</style>
