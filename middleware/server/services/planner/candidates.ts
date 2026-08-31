/**
 * Candidatos de release — scoring + mapeo compartido entre el endpoint batch
 * (POST /api/planner/search/releases) y el endpoint streaming (SSE).
 */
import type { SearchResultItem } from "./search-providers";
import { pickBest } from "./decision-engine";

export interface ReleaseCandidate {
  url: string;
  hash: string | null;
  sizeMb: number | null;
  seeds: number | null;
  sources: number | null;
  username: string | null;
  service: string | null;
  rawName: string;
  title: string;
  quality: string;
  source: string;
  languages: string[];
  season: number | null;
  episode: number | null;
  year: number | null;
  score: number;
  rejectedReason: string | null;
}

export interface CandidateContext {
  title: string;
  /** Títulos alternativos localizados (idioma elegido) para el scoring. */
  altTitles?: string[];
  /** Título del episodio localizado (idioma elegido) para bonus de scoring. */
  expectedEpisodeTitle?: string;
  season?: number;
  episode?: number;
  year?: number;
  language?: string;
  maxSizeMb?: number | null;
  minQuality: string;
}

/**
 * Puntúa y mapea los resultados de búsqueda a candidatos de release.
 * Los candidatos válidos van primero (ordenados por score), los rechazados
 * al final con su motivo — el usuario decide qué descargar.
 */
export function scoreCandidates(
  items: SearchResultItem[],
  ctx: CandidateContext,
): ReleaseCandidate[] {
  const decision = pickBest({
    releases: items.map((i) => ({ ...i.parsed, sizeMb: i.sizeMb })),
    expectedTitle: ctx.title,
    ...(ctx.altTitles?.length ? { altTitles: ctx.altTitles } : {}),
    ...(ctx.expectedEpisodeTitle
      ? { expectedEpisodeTitle: ctx.expectedEpisodeTitle }
      : {}),
    ...(ctx.season !== undefined && ctx.episode !== undefined
      ? { season: ctx.season, episode: ctx.episode }
      : {}),
    ...(ctx.year ? { expectedYear: ctx.year } : {}),
    minQuality: ctx.minQuality as any,
    ...(ctx.language
      ? { languageProfile: { mustHave: [ctx.language], allowUnknownLang: true } }
      : {}),
    ...(ctx.maxSizeMb != null ? { maxSizeMb: ctx.maxSizeMb } : {}),
  });

  const byRaw = new Map(items.map((i) => [i.parsed.raw, i]));

  const toCandidate = (
    parsed: any,
    extra: { score: number; rejectedReason?: string },
  ): ReleaseCandidate => {
    const it = byRaw.get(parsed.raw);
    return {
      url: it?.url ?? "",
      hash: it?.hash ?? null,
      sizeMb: it?.sizeMb ?? null,
      seeds: it?.seeds ?? null,
      sources: it?.sources ?? null,
      username: it?.username ?? null,
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

  return [
    ...decision.evaluated.map((s) => toCandidate(s.release, { score: s.total })),
    ...decision.rejected.map((r) =>
      toCandidate(r.release, { score: -1, rejectedReason: r.reason }),
    ),
  ];
}
