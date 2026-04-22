export function useDiskUsage() {
  const { apiFetch } = useApi();

  const total = ref(0);
  const avail = ref(0);
  const usedPercent = ref(0);
  const loading = ref(false);

  async function refresh() {
    loading.value = true;
    try {
      const data = await apiFetch<{
        total: number;
        avail: number;
        used: number;
        usedPercent: number;
      }>("/api/disk-usage");
      total.value = data.total;
      avail.value = data.avail;
      usedPercent.value = data.usedPercent;
    } catch {
      /* silent — widget just won't show */
    } finally {
      loading.value = false;
    }
  }

  // Poll every 30 seconds
  onMounted(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    onUnmounted(() => clearInterval(interval));
  });

  return { total, avail, usedPercent, loading, refresh };
}
