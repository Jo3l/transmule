/**
 * Shared composable for the BT custom tracker list.
 * Used by both the search page modal and the transmission settings tab.
 */
export function useTrackers() {
  const { apiFetch } = useApi();
  const { addToast } = useToast();
  const { t } = useI18n();

  const trackersText = ref("");
  const savingTrackers = ref(false);

  async function loadTrackers() {
    try {
      const res = await apiFetch<{ trackers: string }>("/api/trackers");
      trackersText.value = res?.trackers ?? "";
    } catch {
      trackersText.value = "";
    }
  }

  async function saveTrackers() {
    savingTrackers.value = true;
    try {
      await apiFetch("/api/trackers", {
        method: "POST",
        body: { trackers: trackersText.value },
      });
      addToast(t("torrentSearch.trackersSaved"), "success");
    } catch (err: any) {
      addToast(err?.message ?? "Failed to save trackers", "error");
    } finally {
      savingTrackers.value = false;
    }
  }

  return { trackersText, savingTrackers, loadTrackers, saveTrackers };
}
