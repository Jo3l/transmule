/**
 * POST /api/planner/wanted/auto-grab
 *
 * Dispara la descarga automática inmediata de todos los episodios/películas
 * wanted (INCLUIDO backlog), reutilizando el mismo flujo del scheduler
 * (search + decision engine + grab). Corre en background — la respuesta
 * vuelve al instante y el grab sigue en el proceso.
 */
import { searchAndGrab } from "~/plugins/planner-scheduler";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Trigger auto-download of wanted items",
    description:
      "Runs the search-and-grab job immediately for all wanted episodes/movies (including backlog), in the background.",
    responses: {
      200: { description: "Auto-download started" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler((event) => {
  requireUser(event);
  // Background: no bloqueamos la respuesta. El proceso es long-running
  // (el scheduler mantiene el event loop vivo), así que el grab completa.
  searchAndGrab({ force: true }).catch((err: any) => {
    console.error("[planner] auto-grab error:", err?.message ?? err);
  });
  return { ok: true, started: true };
});
