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
 *   event: result   data: { service, candidates }   — lote nuevo de una red
 *   event: rescore  data: { candidates }            — re-puntuación completa al
 *                                                    llegar los títulos localizados
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
  ALT_TITLES_BUDGET_MS,
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

  // Títulos alternativos (localizado + original). Se resuelven EN PARALELO con
  // las búsquedas y NUNCA bloquean el stream: la primera oleada se emite al
  // instante con el contexto actual (puntuación preliminar, sin títulos
  // localizados) y, cuando la metadata llega — aunque tarde; TVDB/TMDB llevan
  // timeouts internos de 6-8s —, se re-puntúa TODO lo acumulado y se emite
  // `event: rescore` para que el cliente actualice scores y orden en sitio.
  // searchEpisodeStreamed/searchMovieStreamed lanzan la segunda oleada de
  // queries en cuanto llegan (sin presupuesto que las descarte por lentas).
  const altTitlesPromise: Promise<string[]> = sub
    ? resolveAltTitles({
        tvdb_id: sub.tvdb_id,
        tmdb_id: sub.tmdb_id,
        language,
        title: sub.title,
        media_type: type === "episode" ? "series" : "movie",
      }).catch(() => [])
    : Promise.resolve([]);

  // Contexto de scoring ACTUAL (mutable): cada lote se puntúa con lo que haya
  // en este momento. Preliminar (sin altTitles) si la metadata aún no llegó.
  let currentAltTitles: string[] = [];

  const ctx: CandidateContext = {
    title,
    ...(episodeTitle ? { expectedEpisodeTitle: episodeTitle } : {}),
    ...(type === "episode" ? { season, episode } : {}),
    ...(year ? { year } : {}),
    ...(language ? { language } : {}),
    ...(maxSizeMb != null ? { maxSizeMb } : {}),
    minQuality,
  };

  // ⚠️ Cabeceras SSE (nginx no debe bufferizar). Salen ANTES de resolver
  // metadata: el cliente ya sabe que la búsqueda está corriendo.
  setHeader(event, "Content-Type", "text/event-stream");
  setHeader(event, "Cache-Control", "no-cache");
  setHeader(event, "X-Accel-Buffering", "no");

  const res = event.node.res;

  // Deadline global: el stream nunca debe quedarse colgado. slskd/aMule son
  // lentos y a veces su búsqueda no termina (o el servicio está caído). Tras
  // MAX_STREAM_MS emitimos "complete" y cerramos aunque algún provider siga
  // pendiente, para que el cliente no espere hasta el timeout del proxy.
  const MAX_STREAM_MS = 60_000;
  let finished = false;

  // Candidatos puntuados acumulados → se vuelcan al log (acotado a
  // MAX_LOG_CANDIDATES para no inflar la fila).
  const loggedCandidates: ReleaseCandidate[] = [];
  let logId: number | null = null;

  const flushLog = () => {
    if (logId == null) return;
    try {
      updateManualSearchResults(logId, loggedCandidates.slice(0, MAX_LOG_CANDIDATES));
    } catch (err: any) {
      console.error("[planner] manual search log update error:", err?.message ?? err);
    }
  };

  // ── Acumulación + re-score (puntuación incremental) ───────────────────────
  // Los items se acumulan deduplicados (mismo criterio que la UI: nombre
  // normalizado + tamaño). Al llegar los títulos alternativos se re-puntúa el
  // conjunto completo y se emite `rescore` — la UI actualiza scores en sitio.
  const allItems: SearchResultItem[] = [];
  const seenItems = new Set<string>();
  const itemKey = (it: SearchResultItem): string =>
    `${(it.rawName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${it.sizeMb ?? ""}`;

  const scoreCtxWith = (titles: string[]): CandidateContext =>
    titles.length ? { ...ctx, altTitles: titles } : ctx;

  const rescoreAll = () => {
    if (finished || allItems.length === 0) return;
    const candidates = scoreCandidates(allItems, scoreCtxWith(currentAltTitles));
    // El log se actualiza con los scores finales (misma lista acotada).
    loggedCandidates.length = 0;
    for (const c of candidates) {
      if (loggedCandidates.length < MAX_LOG_CANDIDATES) loggedCandidates.push(c);
    }
    const payload = JSON.stringify({ candidates });
    res.write(`event: rescore\ndata: ${payload}\n\n`);
    flushLog();
  };

  // Cuando llega la metadata (aunque tarde), se re-puntúa todo lo acumulado.
  altTitlesPromise.then((titles) => {
    currentAltTitles = titles;
    if (titles.length > 0) rescoreAll();
  });

  const onResult = (
    service: SearchResultItem["service"],
    items: SearchResultItem[],
  ) => {
    if (finished) return;
    // Puntuación PRELIMINAR con el contexto actual: se emite al instante sin
    // esperar a la metadata. Cuando lleguen los altTitles, rescoreAll() re-
    // puntúa el conjunto completo (evento `rescore`).
    const fresh = items.filter((it) => {
      const key = itemKey(it);
      if (seenItems.has(key)) return false;
      seenItems.add(key);
      allItems.push(it);
      return true;
    });
    if (fresh.length === 0) return;
    const candidates = scoreCandidates(fresh, scoreCtxWith(currentAltTitles));
    for (const c of candidates) {
      if (loggedCandidates.length < MAX_LOG_CANDIDATES) loggedCandidates.push(c);
    }
    const payload = JSON.stringify({ service, candidates });
    res.write(`event: result\ndata: ${payload}\n\n`);
    // Actualización incremental por red: si el usuario cierra el stream antes
    // del "complete" (o descarga enseguida), los resultados ya quedan en el log.
    flushLog();
  };

  // 1) Las búsquedas arrancan INMEDIATAMENTE con el título canónico; los títulos
  //    alternativos llegan después como segunda oleada (dentro de los *_Streamed).
  const search =
    type === "episode"
      ? searchEpisodeStreamed(title, season!, episode!, searchServices, onResult, MAX_STREAM_MS, altTitlesPromise)
      : searchMovieStreamed(title, year, searchServices, onResult, MAX_STREAM_MS, altTitlesPromise);

  // 2) Log de búsqueda manual (análisis a posteriori): la fila se crea en
  //    BACKGROUND — nunca bloquea el stream ni espera a la metadata. Se espera
  //    como mucho ALT_TITLES_BUDGET_MS a los altTitles para anotar las queries
  //    completas; si llegan más tarde, rescoreAll() ya deja el log con los
  //    scores finales y esta fila solo documenta las queries canónicas.
  void (async () => {
    const logTitles = await Promise.race([
      altTitlesPromise,
      sleep(ALT_TITLES_BUDGET_MS).then(() => [] as string[]),
    ]);
    logId = (() => {
      try {
        const epRow =
          type === "episode" && sub && season != null && episode != null
            ? findEpisodeByNumber(sub.id, season, episode)
            : undefined;
        const movieRow =
          type === "movie" && sub ? getMovieBySubscription(sub.id) : undefined;
        const doneQueries =
          type === "episode" && season != null && episode != null
            ? buildEpisodeQueries(title, season, episode, logTitles)
            : buildMovieQueries(title, year, logTitles);
        const doneAmule =
          type === "episode" && season != null && episode != null
            ? buildAmuleEpisodeQuery(title, season, episode, logTitles)
            : buildAmuleMovieQuery(title, year, logTitles);
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
          alt_titles_json: logTitles.length ? JSON.stringify(logTitles) : null,
          user_id: user?.userId ?? null,
          user_name: user?.username ?? null,
        });
      } catch (err: any) {
        // El log es best-effort: un fallo de BD no debe romper la búsqueda.
        console.error("[planner] manual search log error:", err?.message ?? err);
        return null;
      }
    })();
    // Si la metadata llegó durante la espera y el re-score ya volcó el log,
    // este flush asegura la última versión de candidatos en la fila.
    flushLog();
  })();

  await Promise.race([search, sleep(MAX_STREAM_MS)]);

  if (!finished) {
    finished = true;
    // Vuelco final del log: todas las redes terminaron (o deadline).
    flushLog();
    res.write(`event: complete\ndata: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});
