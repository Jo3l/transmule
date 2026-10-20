/**
 * Keeps the presence marker's uptime roughly current.
 *
 * The marker lives in slskd's `soulseek.description`; slskd re-reads that on
 * every user-info request, so a config write is enough (no reconnect needed).
 * The channel and the initial marker are applied by `connect()`; this plugin
 * only refreshes them while the instance stays up.
 */
import { getConfig } from "../utils/database";
import { PRESENCE_CONFIG_KEY, refreshPresenceMarker } from "../utils/slskd-presence";
import { useSlskdClient } from "../utils/slskd-client";

const INTERVAL_MS = 15 * 60 * 1000;
const GUARD_KEY = "__transmule_slskd_presence_started__";

export default defineNitroPlugin(() => {
  if ((globalThis as any)[GUARD_KEY]) return;
  (globalThis as any)[GUARD_KEY] = true;

  setInterval(async () => {
    if (getConfig(PRESENCE_CONFIG_KEY) !== "1") return;

    try {
      await refreshPresenceMarker(useSlskdClient());
    } catch (err: any) {
      console.warn("[slskd] presence: marker refresh failed:", err?.message);
    }
  }, INTERVAL_MS);
});
