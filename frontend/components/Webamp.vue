<template>
  <div ref="container" class="webamp-container" />
</template>

<script setup lang="ts">
import type { Track } from "webamp";
import { consumePendingDragTracks, onWebampClose } from "../composables/useWebamp";

const props = defineProps<{
  track: Track;
  skin?: { url: string };
}>();

const { registerInstance, unregisterInstance } = useWebamp();
const container = useTemplateRef<HTMLDivElement>("container");

let instance: InstanceType<typeof import("webamp").default> | null = null;

onMounted(async () => {
  const Webamp = (await import("webamp/butterchurn")).default;

  if (!Webamp.browserIsSupported()) {
    console.warn("Webamp is not supported in this browser.");
    return;
  }

  instance = new Webamp({
    initialTracks: [props.track],
    zIndex: 99999,
    ...(props.skin && { initialSkin: props.skin }),
    handleTrackDropEvent: async () => {
      return consumePendingDragTracks();
    },
  });

  await instance.renderWhenReady(container.value!);
  instance.play(); // Auto-play the initial track

  // Track when the user closes Webamp so openTrack can reopen it
  instance.onClose(() => {
    onWebampClose();
  });

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
  position: fixed;
  bottom: 12px;
  right: 12px;
  z-index: 99999;
}
</style>
