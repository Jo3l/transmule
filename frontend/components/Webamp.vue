<template>
  <div ref="container" class="webamp-container" />
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Track } from "webamp";
import { consumePendingDragTracks, onWebampClose } from "../composables/useWebamp";

const props = defineProps<{
  track: Track;
  skin?: { url: string };
}>();

const { registerInstance, unregisterInstance } = useWebamp();
const container = ref<HTMLDivElement | null>(null);

let instance: InstanceType<typeof import("webamp").default> | null = null;

onMounted(async () => {
  const Webamp = (await import("webamp/butterchurn")).default;

  if (!Webamp.browserIsSupported()) {
    console.warn("Webamp is not supported in this browser.");
    return;
  }

  // Read user preferences from localStorage
  const showEq = localStorage.getItem("webampShowEq") !== "false";
  const showPlaylist = localStorage.getItem("webampShowPlaylist") !== "false";
  const showMilkdrop = localStorage.getItem("webampShowMilkdrop") === "true";
  const doubleSize = localStorage.getItem("webampDoubleSize") === "true";
  const skinName = localStorage.getItem("webampSkin") || "";

  // Build window layout with proper positions
  // Webamp positions are in 1x coordinates even if doubleSize is enabled
  const windowLayout: Record<string, any> = {};
  // Position the whole Webamp cluster at a visible viewport location
  // (not at 0,0 which may be behind browser chrome)
  const baseX = 50;
  const baseY = 50;

  // Always explicitly position every window so they don't overlap or go off-screen
  windowLayout.main = { position: { x: baseX, y: baseY } };

  if (showEq) {
    windowLayout.equalizer = { position: { x: baseX, y: baseY + 116 } };
  } else {
    windowLayout.equalizer = { position: { x: baseX, y: baseY }, closed: true };
  }

  if (showPlaylist) {
    windowLayout.playlist = { position: { x: baseX, y: baseY + 116 + 232 } };
  } else {
    windowLayout.playlist = { position: { x: baseX, y: baseY }, closed: true };
  }

  if (showMilkdrop) {
    // Place milkdrop to the right of the main window
    windowLayout.milkdrop = { position: { x: baseX + 275, y: baseY } };
  }

  // Build skin URL — verify the skin exists first
  let initialSkin: { url: string } | undefined;
  if (skinName) {
    const base = (useRuntimeConfig().public.apiBase as string) || "";
    const url = `${base}/api/webamp/skins/${encodeURIComponent(skinName)}`;
    // Check if skin file exists before setting it (with timeout)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const head = await fetch(url, { method: "HEAD", signal: controller.signal });
      clearTimeout(timeoutId);
      if (head.ok) {
        initialSkin = { url };
      } else {
        console.warn("Webamp skin not found on server, using default:", skinName);
        localStorage.removeItem("webampSkin");
      }
    } catch {
      console.warn("Webamp skin check failed, using default");
    }
  }
  // Fall back to prop skin if no stored skin
  if (!initialSkin && props.skin) {
    initialSkin = props.skin;
  }

  instance = new Webamp({
    initialTracks: [props.track],
    zIndex: 100010,
    ...(initialSkin && { initialSkin }),
    windowLayout,
    enableDoubleSizeMode: doubleSize,
    handleTrackDropEvent: async () => {
      return consumePendingDragTracks();
    },
  });

  await instance.renderWhenReady(container.value!);
  console.log("Webamp rendered, container:", container.value?.getBoundingClientRect());
  instance.play();

  instance.onClose(() => {
    onWebampClose();
  });

  registerInstance(instance);
});

onBeforeUnmount(() => {
  unregisterInstance();
  try { instance?.dispose(); } catch {}
  instance = null;
});
</script>

<style scoped>
.webamp-container {
  position: fixed;
  bottom: 12px;
  right: 12px;
  z-index: 99999;
  /* Debug: uncomment to see the container
  width: 100px; height: 100px; background: red; opacity: 0.5; */
}
</style>
