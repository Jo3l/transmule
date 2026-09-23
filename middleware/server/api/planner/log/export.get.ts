/**
 * GET /api/planner/log/export
 *
 * Exporta el log de búsquedas MANUALES del planificador
 * (`planner_manual_search_log`) como JSON descargable.
 *
 * Objetivo: analizar a posteriori con datos reales qué release acaba
 * descargando el usuario — relaciones entre calidad, tamaño, disponibilidad
 * (seeds / sources / slot libre), idioma, score del decision engine, etc.
 *
 * Query params:
 *   pickedOnly=1   → solo búsquedas con release elegido (el subconjunto con
 *                    "verdad terreno" para evaluar el scoring).
 *   limit=N        → máximo de filas de búsqueda (default 0 = todas, tope 20000).
 *
 * Respuesta:
 *   { meta, searches[], candidates[] }
 *   - `searches`: una entrada por búsqueda, con `results` ya parseado
 *     (candidatos puntuados, incluidos los rechazados).
 *   - `candidates`: los MISMOS datos en formato PLANO (una fila por candidato
 *     con el contexto de su búsqueda) — listo para pandas/SQL/R.
 */
import { useDatabase } from "~/utils/database";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Export manual-search log as JSON",
    description:
      "Returns the manual release-search log (queries, config, scored results and the picked release) as a downloadable JSON file.",
    responses: {
      200: { description: "JSON export" },
      401: { description: "Auth required" },
    },
  },
});

/** Tope duro de filas para no generar un fichero inmanejable. */
const MAX_ROWS = 20_000;

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Fecha local YYYYMMDD-HHmm para el nombre del fichero. */
function stamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}`
  );
}

export default defineEventHandler(async (event) => {
  requireUser(event);
  const q = getQuery(event);

  const pickedOnly = q.pickedOnly === "1" || q.pickedOnly === "true";
  const limit = Math.min(Math.max(Number(q.limit) || 0, 0), MAX_ROWS);

  const db = useDatabase();
  const where = pickedOnly ? "WHERE picked_url IS NOT NULL" : "";
  const limitSql = limit > 0 ? `LIMIT ${limit}` : "";
  const rows = db
    .prepare(
      `SELECT * FROM planner_manual_search_log ${where}
       ORDER BY id ASC ${limitSql}`,
    )
    .all() as unknown as Array<Record<string, any>>;

  const searches: Array<Record<string, any>> = [];
  const candidates: Array<Record<string, any>> = [];

  for (const row of rows) {
    const results = parseJson(row.results_json);
    const list: any[] = Array.isArray(results) ? results : [];

    searches.push({
      ...row,
      queries: parseJson(row.queries_json),
      alt_titles: parseJson(row.alt_titles_json),
      picked_languages: parseJson(row.picked_languages),
      results_json: undefined,
      queries_json: undefined,
      alt_titles_json: undefined,
      results: list,
    });

    // Formato plano: una fila por candidato con el contexto de su búsqueda.
    list.forEach((c: any, i: number) => {
      candidates.push({
        search_id: row.id,
        subscription_id: row.subscription_id,
        media_type: row.media_type,
        episode_id: row.episode_id,
        movie_id: row.movie_id,
        tmdb_id: row.tmdb_id,
        tvdb_id: row.tvdb_id,
        imdb_id: row.imdb_id,
        series_title: row.series_title,
        year: row.year,
        season: row.season,
        episode: row.episode,
        episode_title: row.episode_title,
        query_text: row.query_text,
        searched_at: row.searched_at,
        // Configuración de la búsqueda (lo que el usuario pidió).
        min_quality: row.min_quality,
        max_size_mb: row.max_size_mb,
        language: row.language,
        search_services: row.search_services,
        // Posición en el ranking del decision engine (1 = mejor puntuado).
        rank: i + 1,
        picked: c && c.url === row.picked_url ? 1 : 0,
        // Candidato: calidad, tamaño, idiomas, disponibilidad, score...
        url: c?.url ?? null,
        raw_name: c?.rawName ?? null,
        title: c?.title ?? null,
        quality: c?.quality ?? null,
        source: c?.source ?? null,
        size_mb: c?.sizeMb ?? null,
        languages: c?.languages ?? null,
        service: c?.service ?? null,
        seeds: c?.seeds ?? null,
        leechers: c?.leechers ?? null,
        sources: c?.sources ?? null,
        username: c?.username ?? null,
        free_slot: c?.freeSlot ?? null,
        queue_length: c?.queueLength ?? null,
        upload_speed: c?.uploadSpeed ?? null,
        score: c?.score ?? null,
        rejected_reason: c?.rejectedReason ?? null,
      });
    });
  }

  const payload = {
    meta: {
      source: "transmule-planner",
      schema: 1,
      exported_at: new Date().toISOString(),
      filters: { picked_only: pickedOnly, limit: limit || null },
      counts: {
        searches: searches.length,
        candidates: candidates.length,
        picked_searches: searches.filter((s) => s.picked_url).length,
      },
      notes: {
        searches:
          "Una entrada por búsqueda manual, con 'results' = candidatos puntuados (incluye rechazados con rejected_reason y score -1).",
        candidates:
          "Formato plano (una fila por candidato + contexto de la búsqueda) para análisis estadístico.",
        availability:
          "seeds/leechers = torrent; sources = eD2k (aMule); free_slot/queue_length/upload_speed = Soulseek (slskd).",
        picked:
          "picked = 1 marca el release que el usuario eligió descargar (verdad terreno para evaluar el scoring).",
        scores:
          "score = puntuación del decision engine en el momento de la búsqueda; rejected_reason explica los descartados.",
      },
    },
    searches,
    candidates,
  };

  const filename = `planner-search-log-${stamp()}.json`;
  setHeader(event, "Content-Type", "application/json; charset=utf-8");
  setHeader(event, "Content-Disposition", `attachment; filename="${filename}"`);
  return payload;
});
