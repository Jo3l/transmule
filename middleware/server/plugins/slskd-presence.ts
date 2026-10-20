/**
 * Mantiene la presencia en el canal Transmule sin depender de que slskd esté
 * listo en el momento exacto del arranque.
 *
 * El marcador vive en `soulseek.description` (slskd lo relee en cada user-info,
 * sin reconectar) y el canal en `rooms` (slskd lo une al conectar). Pero el
 * `connect()` del plugin de startup corre a los 3 s y slskd (.NET + login) suele
 * tardar más: si entonces no responde, la configuración se queda sin aplicar y
 * nadie lo reintentaba. Aquí se reintenta al arrancar y, ya en régimen, se
 * refresca el uptime cada 15 min y se vuelve a entrar al canal si hiciera falta.
 */
import {
  PRESENCE_CONFIG_KEY,
  applyPresence,
  isInChannel,
  isPresenceEnabled,
  refreshPresenceMarker,
} from "../utils/slskd-presence";
import { useSlskdClient } from "../utils/slskd-client";

const INTERVAL_MS = 15 * 60 * 1000;
/** Reintentos tras el arranque (slskd puede tardar en aceptar peticiones). */
const BOOT_RETRIES_MS = [10_000, 30_000, 60_000];
const GUARD_KEY = "__transmule_slskd_presence_started__";

/**
 * Deja la presencia como debe estar: si no estamos en el canal, reaplica la
 * configuración y entra; si ya estamos, solo pone el uptime al día.
 */
export async function ensurePresence(): Promise<void> {
  if (!isPresenceEnabled()) return;

  try {
    const client = useSlskdClient();

    if (await isInChannel(client)) {
      await refreshPresenceMarker(client);
      return;
    }

    console.log("[slskd] presence: no estábamos en el canal — reaplicando config y entrando");
    const state = await applyPresence(client, true);
    console.log(`[slskd] presence: canal ${state.joined ? "ok" : "NO confirmado"} (config ${state.applied ? "escrita" : "sin cambios"})`);
  } catch (err: any) {
    console.warn("[slskd] presence: no se pudo aplicar la presencia:", err?.message);
  }
}

export default defineNitroPlugin(() => {
  if ((globalThis as any)[GUARD_KEY]) return;
  (globalThis as any)[GUARD_KEY] = true;

  for (const delay of BOOT_RETRIES_MS) {
    setTimeout(() => {
      void ensurePresence();
    }, delay);
  }

  setInterval(() => {
    void ensurePresence();
  }, INTERVAL_MS);
});
