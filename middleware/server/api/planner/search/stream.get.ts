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
} from "~/services/planner/search-providers";
import { scoreCandidates, type CandidateContext } from "~/services/planner/candidates";
import { getSubscription } from "~/utils/planner-db";
import { resolveAltTitles } from "~/services/planner/localized-titles";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default defineEventHandler(async (event) => {
  requireUser(event);

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
    const payload = JSON.stringify({ candidates });
    res.write(`event: rescore\ndata: ${payload}\n\n`);
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
    const payload = JSON.stringify({ service, candidates });
    res.write(`event: result\ndata: ${payload}\n\n`);
  };

  // 1) Las búsquedas arrancan INMEDIATAMENTE con el título canónico; los títulos
  //    alternativos llegan después como segunda oleada (dentro de los *_Streamed).
  const search =
    type === "episode"
      ? searchEpisodeStreamed(title, season!, episode!, searchServices, onResult, MAX_STREAM_MS, altTitlesPromise)
      : searchMovieStreamed(title, year, searchServices, onResult, MAX_STREAM_MS, altTitlesPromise);

  await Promise.race([search, sleep(MAX_STREAM_MS)]);

  if (!finished) {
    finished = true;
    res.write(`event: complete\ndata: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});
