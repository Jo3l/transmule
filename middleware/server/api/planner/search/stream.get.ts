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
  const altTitles = sub
    ? await resolveAltTitles({
        tvdb_id: sub.tvdb_id,
        tmdb_id: sub.tmdb_id,
        language,
        title: sub.title,
        media_type: type === "episode" ? "series" : "movie",
      })
    : [];

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

  const onResult = (service: SearchResultItem["service"], items: SearchResultItem[]) => {
    if (finished) return;
    const candidates = scoreCandidates(items, ctx);
    const payload = JSON.stringify({ service, candidates });
    res.write(`event: result\ndata: ${payload}\n\n`);
  };

  // Emite las queries REALES que se envían a cada red (para debug en el diálogo).
  const emitQueries = (q: { queries: string[]; amule: string }) => {
    if (finished) return;
    res.write(`event: query\ndata: ${JSON.stringify(q)}\n\n`);
  };

  const search =
    type === "episode"
      ? searchEpisodeStreamed(title, season!, episode!, searchServices, onResult, MAX_STREAM_MS, altTitles, language, episodeTitle, emitQueries)
      : searchMovieStreamed(title, year, searchServices, onResult, MAX_STREAM_MS, altTitles, language, emitQueries);

  await Promise.race([search, sleep(MAX_STREAM_MS)]);

  if (!finished) {
    finished = true;
    res.write(`event: complete\ndata: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});
