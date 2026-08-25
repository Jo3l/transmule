/**
 * POST /api/planner/search/releases
 *
 * Búsqueda interactiva unificada (Fase 14): devuelve candidatos scoreados de
 * todas las redes habilitadas SIN decidir por el usuario. El frontend muestra
 * las sugerencias en un modal y el usuario elige qué release descargar.
 *
 * Body:
 *   type: 'episode' | 'movie'
 *   title: string
 *   year?: number            (movie)
 *   season?: number          (episode)
 *   episode?: number         (episode)
 *   searchServices?: string[]  (default: ["direct-plugin","slskd","amule"])
 *   language?: string          (código ISO — añade sufijos a las queries)
 *   minQuality?: string        (default: "fullhd")
 */
import { searchEpisode, searchMovie } from "~/services/planner/search-providers";
import { scoreCandidates } from "~/services/planner/candidates";
import { getSubscription } from "~/utils/planner-db";
import { resolveAltTitles } from "~/services/planner/localized-titles";

defineRouteMeta({
  openAPI: {
    tags: ["Planner"],
    summary: "Interactive unified release search",
    description:
      "Searches all enabled networks for an episode or movie and returns scored release candidates (no auto-pick).",
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["type", "title"],
            properties: {
              type: { type: "string", enum: ["episode", "movie"] },
              title: { type: "string" },
              year: { type: "integer", nullable: true },
              season: { type: "integer", nullable: true },
              episode: { type: "integer", nullable: true },
              subscriptionId: { type: "integer", nullable: true },
              episodeTitle: { type: "string", nullable: true },
              searchServices: { type: "array", items: { type: "string" } },
              language: { type: "string", nullable: true },
              minQuality: { type: "string", nullable: true },
            },
          } as any,
        },
      },
    },
    responses: {
      200: { description: "Release candidates" },
      400: { description: "Invalid input" },
      401: { description: "Auth required" },
    },
  },
});

export default defineEventHandler(async (event) => {
  requireUser(event);
  const body = await readBody(event);

  const type: "episode" | "movie" = body?.type === "movie" ? "movie" : "episode";
  const title = String(body?.title ?? "").trim();
  if (!title) {
    setResponseStatus(event, 400);
    return { error: "title is required" };
  }

  const season = body?.season != null ? Number(body.season) : undefined;
  const episode = body?.episode != null ? Number(body.episode) : undefined;
  if (type === "episode" && (season == null || episode == null)) {
    setResponseStatus(event, 400);
    return { error: "season and episode are required for type 'episode'" };
  }

  const year = body?.year != null ? Number(body.year) : undefined;
  const subscriptionId = body?.subscriptionId != null ? Number(body.subscriptionId) : undefined;
  const searchServices: string[] = Array.isArray(body?.searchServices)
    ? body.searchServices.filter((s: unknown) => typeof s === "string")
    : ["direct-plugin", "slskd", "amule"];

  // Idioma, calidad mínima, título del episodio y títulos localizados.
  const sub = subscriptionId ? getSubscription(subscriptionId) : undefined;
  const language: string | undefined = body?.language || sub?.language || undefined;
  const minQuality: string = body?.minQuality ?? sub?.min_quality ?? "fullhd";
  const episodeTitle: string | undefined = body?.episodeTitle || undefined;
  const altTitles = sub
    ? await resolveAltTitles({
        tvdb_id: sub.tvdb_id,
        tmdb_id: sub.tmdb_id,
        language,
        title: sub.title,
      })
    : [];

  // Busca en paralelo en las redes habilitadas (numeración + idioma).
  const items =
    type === "episode"
      ? await searchEpisode(title, season!, episode!, searchServices, language)
      : await searchMovie(title, year, searchServices, language);

  // Score SIN decidir: evaluamos todos y devolvemos candidatos (los válidos
  // primero, los rechazados con su motivo al final) para que el usuario elija.
  const candidates = scoreCandidates(items, {
    title,
    ...(altTitles.length ? { altTitles } : {}),
    ...(episodeTitle ? { expectedEpisodeTitle: episodeTitle } : {}),
    ...(type === "episode" ? { season, episode } : {}),
    ...(year ? { year } : {}),
    ...(language ? { language } : {}),
    minQuality,
  });

  return { candidates, count: candidates.length };
});
