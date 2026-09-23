/**
 * GET /api/planner/search/stream
 *
 * Búsqueda interactiva unificada en STREAMING (SSE): emite los candidatos de
 * cada red en cuanto esa red termina, sin esperar a las demás. Así el usuario
 * ve resultados a medida que llegan (torrent suele ser rápido, slskd/aMule
 * lentos).
 *
 * Query params:
 *   type: 'episode' | 'movie'
 *   title: string
 *   year?: number            (movie)
 *   season?: number          (episode)
 *   episode?: number         (episode)
 *   subscriptionId?: number  (para resolver idioma + títulos localizados)
 *   episodeTitle?: string    (título del episodio localizado, para scoring)
 *   searchServices?: string  (comma-separated; default direct-plugin,slskd,amule)
 *   language?: string        (código ISO)
 *   minQuality?: string      (default "fullhd")
 *
 * Eventos SSE:
 *   event: result   data: { service, candidates }
 *   event: complete data: { done: true }
 */
import type { SearchResultItem } from "~/services/planner/search-providers";
import {
  searchEpisodeStreamed,
  searchMovieStreamed,
  buildEpisodeQueries,
  buildMovieQueries,
  buildAmuleEpisodeQuery,
  buildAmuleMovieQuery,
} from "~/services/planner/search-providers";
import { scoreCandidates, type CandidateContext, type ReleaseCandidate } from "~/services/planner/candidates";
import {
  getSubscription,
  findEpisodeByNumber,
  getMovieBySubscription,
  recordManualSearchLog,
  updateManualSearchResults,
} from "~/utils/planner-db";
import { resolveAltTitles } from "~/services/planner/localized-titles";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Máximo de candidatos guardados en el log por búsqueda (acotar el tamaño de fila). */
const MAX_LOG_CANDIDATES = 300;

export default defineEventHandler(async (event) => {
  const user = requireUser(event);

  const q = getQuery(event);
  const type: "episode" | "movie" = q.type === "movie" ? "movie" : "episode";
  const title = String(q.title ?? "").trim();
  if (!title) {
    throw createError({ statusCode: 400, statusMessage: "title is required" });
  }

  const season = q.season != null ? Number(q.season) : undefined;
  const episode = q.episode != null ? Number(q.episode) : undefined;
  if (type === "episode" && (season == null || episode == null)) {
    throw createError({
      statusCode: 400,
      statusMessage: "season and episode are required for type 'episode'",
    });
  }

  const year = q.year != null ? Number(q.year) : undefined;
  const subscriptionId = q.subscriptionId != null ? Number(q.subscriptionId) : undefined;
  const searchServices = q.searchServices
    ? String(q.searchServices)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : ["direct-plugin", "slskd", "amule"];

  // Idioma, calidad mínima y títulos localizados: del query o, si viene
  // subscriptionId, de la suscripción (respetando lo elegido al añadir).
  const sub = subscriptionId ? getSubscription(subscriptionId) : undefined;
  const language = q.language ? String(q.language) : (sub?.language ?? undefined);
  const minQuality = String(q.minQuality ?? sub?.min_quality ?? "fullhd");
  const maxSizeMb = q.maxSizeMb != null ? Number(q.maxSizeMb) : (sub?.max_size_mb ?? undefined);
  const episodeTitle = q.episodeTitle ? String(q.episodeTitle) : undefined;
  const altTitles = sub
    ? await resolveAltTitles({
        tvdb_id: sub.tvdb_id,
        tmdb_id: sub.tmdb_id,
        language,
        title: sub.title,
        media_type: type === "episode" ? "series" : "movie",
      })
    : [];

  // Log de búsqueda manual (análisis a posteriori): fila creada al iniciar la
  // búsqueda con query + configuración; los resultados puntuados se añaden
  // por red y el release elegido lo completa el grab (grabs.post.ts).
  const logId = (() => {
    try {
      const epRow =
        type === "episode" && sub && season != null && episode != null
          ? findEpisodeByNumber(sub.id, season, episode)
          : undefined;
      const movieRow =
        type === "movie" && sub ? getMovieBySubscription(sub.id) : undefined;
      const doneQueries =
        type === "episode" && season != null && episode != null
          ? buildEpisodeQueries(title, season, episode, altTitles)
          : buildMovieQueries(title, year, altTitles);
      const doneAmule =
        type === "episode" && season != null && episode != null
          ? buildAmuleEpisodeQuery(title, season, episode, altTitles)
          : buildAmuleMovieQuery(title, year, altTitles);
      return recordManualSearchLog({
        subscription_id: subscriptionId ?? 0,
        media_type: type === "episode" ? "series" : "movie",
        episode_id: epRow?.id ?? null,
        movie_id: movieRow?.id ?? null,
        tmdb_id: sub?.tmdb_id ?? null,
        tvdb_id: sub?.tvdb_id ?? null,
        imdb_id: sub?.imdb_id ?? null,
        series_title: sub?.title ?? title,
        year: sub?.year ?? year ?? null,
        season: type === "episode" ? (season ?? null) : null,
        episode: type === "episode" ? (episode ?? null) : null,
        episode_title: episodeTitle ?? epRow?.title ?? null,
        query_text:
          type === "episode"
            ? `${title} S${String(season ?? 0).padStart(2, "0")}E${String(episode ?? 0).padStart(2, "0")}`
            : (year ? `${title} ${year}` : title),
        queries_json: JSON.stringify({ plain: doneQueries, amule: doneAmule }),
        min_quality: minQuality,
        max_size_mb: maxSizeMb ?? null,
        language: language ?? null,
        search_services: searchServices.join(","),
        alt_titles_json: altTitles.length ? JSON.stringify(altTitles) : null,
        user_id: user?.userId ?? null,
        user_name: user?.username ?? null,
      });
    } catch (err: any) {
      // El log es best-effort: un fallo de BD no debe romper la búsqueda.
      console.error("[planner] manual search log error:", err?.message ?? err);
      return null;
    }
  })();

  // ⚠️ Cabeceras SSE (nginx no debe bufferizar).
  setHeader(event, "Content-Type", "text/event-stream");
  setHeader(event, "Cache-Control", "no-cache");
  setHeader(event, "X-Accel-Buffering", "no");

  const res = event.node.res;

  const ctx: CandidateContext = {
    title,
    ...(altTitles.length ? { altTitles } : {}),
    ...(episodeTitle ? { expectedEpisodeTitle: episodeTitle } : {}),
    ...(type === "episode" ? { season, episode } : {}),
    ...(year ? { year } : {}),
    ...(language ? { language } : {}),
    ...(maxSizeMb != null ? { maxSizeMb } : {}),
    minQuality,
  };

  // Deadline global: el stream nunca debe quedarse colgado. slskd/aMule son
  // lentos y a veces su búsqueda no termina (o el servicio está caído). Tras
  // MAX_STREAM_MS emitimos "complete" y cerramos aunque algún provider siga
  // pendiente, para que el cliente no espere hasta el timeout del proxy.
  const MAX_STREAM_MS = 60_000;
  let finished = false;

  // Candidatos puntuados acumulados → se vuelcan al log (acotado a
  // MAX_LOG_CANDIDATES para no inflar la fila).
  const loggedCandidates: ReleaseCandidate[] = [];

  const flushLog = () => {
    if (logId == null) return;
    try {
      updateManualSearchResults(logId, loggedCandidates.slice(0, MAX_LOG_CANDIDATES));
    } catch (err: any) {
      console.error("[planner] manual search log update error:", err?.message ?? err);
    }
  };

  const onResult = (service: SearchResultItem["service"], items: SearchResultItem[]) => {
    if (finished) return;
    const candidates = scoreCandidates(items, ctx);
    for (const c of candidates) {
      if (loggedCandidates.length < MAX_LOG_CANDIDATES) loggedCandidates.push(c);
    }
    const payload = JSON.stringify({ service, candidates });
    res.write(`event: result\ndata: ${payload}\n\n`);
    // Actualización incremental por red: si el usuario cierra el stream antes
    // del "complete" (o descarga enseguida), los resultados ya quedan en el log.
    flushLog();
  };

  const search =
    type === "episode"
      ? searchEpisodeStreamed(title, season!, episode!, searchServices, onResult, MAX_STREAM_MS, altTitles)
      : searchMovieStreamed(title, year, searchServices, onResult, MAX_STREAM_MS, altTitles);

  await Promise.race([search, sleep(MAX_STREAM_MS)]);

  if (!finished) {
    finished = true;
    // Vuelco final del log: todas las redes terminaron (o deadline).
    flushLog();
    res.write(`event: complete\ndata: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});
