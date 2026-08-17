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
import { pickBest } from "~/services/planner/decision-engine";

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
  const language: string | undefined = body?.language || undefined;
  const minQuality: string = body?.minQuality ?? "fullhd";
  const searchServices: string[] = Array.isArray(body?.searchServices)
    ? body.searchServices.filter((s: unknown) => typeof s === "string")
    : ["direct-plugin", "slskd", "amule"];

  // Busca en paralelo en las redes habilitadas (multi-query + idioma).
  const items =
    type === "episode"
      ? await searchEpisode(title, season!, episode!, searchServices, language)
      : await searchMovie(title, year, searchServices, language);

  // Score SIN decidir: evaluamos todos y devolvemos candidatos (los válidos
  // primero, los rechazados con su motivo al final) para que el usuario elija.
  const decision = pickBest({
    releases: items.map((i) => i.parsed),
    expectedTitle: title,
    ...(type === "episode" ? { season, episode } : {}),
    ...(year ? { expectedYear: year } : {}),
    minQuality: minQuality as any,
    ...(language
      ? { languageProfile: { mustHave: [language], allowUnknownLang: true } }
      : {}),
  });

  const byRaw = new Map(items.map((i) => [i.parsed.raw, i]));

  const toCandidate = (parsed: any, extra: { score: number; rejectedReason?: string }) => {
    const it = byRaw.get(parsed.raw);
    return {
      url: it?.url ?? "",
      hash: it?.hash ?? null,
      sizeMb: it?.sizeMb ?? null,
      seeds: it?.seeds ?? null,
      service: it?.service ?? null,
      rawName: it?.rawName ?? parsed.raw,
      title: parsed.title,
      quality: parsed.quality,
      source: parsed.source,
      languages: parsed.languages ?? [],
      season: parsed.season ?? null,
      episode: parsed.episode ?? null,
      year: parsed.year ?? null,
      score: extra.score,
      rejectedReason: extra.rejectedReason ?? null,
    };
  };

  const candidates = [
    ...decision.evaluated.map((s) => toCandidate(s.release, { score: s.total })),
    ...decision.rejected.map((r) =>
      toCandidate(r.release, { score: -1, rejectedReason: r.reason }),
    ),
  ];

  return { candidates, count: candidates.length };
});
