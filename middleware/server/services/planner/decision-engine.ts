/**
 * Decision engine — elige el mejor release para un episodio/película.
 *
 * Pipeline:
 *   1. filter by language profile (must_have / must_not_have)
 *   2. filter by min_quality (Q7: uhd/fullhd/hd/sd tiers)
 *   3. filter por match de título (episodio correcto)
 *   4. sort por calidad + seeds + size
 *   5. pick best
 *
 * Devuelve la decisión con el razonamiento (para logging y UI).
 */

import type { ParsedRelease } from "./release-parser";

export type QualityTier = "uhd" | "fullhd" | "hd" | "sd" | "unknown";

export const QUALITY_ORDER: Record<QualityTier, number> = {
  uhd: 4,
  fullhd: 3,
  hd: 2,
  sd: 1,
  unknown: 0,
};

export const SOURCE_ORDER: Record<string, number> = {
  remux: 5,
  bluray: 4,
  webdl: 3,
  webrip: 2,
  hdtv: 1,
  sat: 1,
  dvd: 0,
  cam: 0,
  unknown: 0,
};

export interface LanguageProfile {
  mustHave?: string[];
  mustNotHave?: string[];
  /** Si true, un release sin idioma detectado NO se rechaza (penaliza leve). */
  allowUnknownLang?: boolean;
}

export interface DecisionRequest {
  releases: ParsedRelease[];
  /** Título esperado (serie o película) */
  expectedTitle: string;
  /** Season+episode si es serie */
  season?: number;
  episode?: number;
  /** Quality mínima (Q7) */
  minQuality: QualityTier;
  /** Año esperado (películas) — señal de matching, no de rechazo */
  expectedYear?: number;
  languageProfile?: LanguageProfile;
  /** ¿Multi-idioma aceptable? (por defecto sí) */
  preferMulti?: boolean;
}

export interface ReleaseScore {
  release: ParsedRelease;
  /** Puntos de calidad (QUALITY_ORDER) */
  qualityScore: number;
  /** Puntos de fuente (SOURCE_ORDER) */
  sourceScore: number;
  /** Penalización por title mismatch */
  titlePenalty: number;
  /** Puntos de idioma */
  languageScore: number;
  /** Puntos por match de año */
  yearScore: number;
  total: number;
  /** Razón de descarte (si no fue elegible) */
  rejectedReason?: string;
}

export interface DecisionResult {
  picked: ReleaseScore | null;
  /** Todos los candidatos evaluados con su score y razón */
  evaluated: ReleaseScore[];
  /** Releases descartados con su razón */
  rejected: { release: ParsedRelease; reason: string }[];
  /** ¿Por qué se descartó el ganador potencial? (para logging) */
  note: string;
}

// ─── Title match helpers ────────────────────────────────────────────────────

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\u00e0-\u00ff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  // Jaccard-style overlap de tokens (con 2+ chars)
  const tokensA = new Set(na.split(" ").filter((w) => w.length >= 2));
  const tokensB = new Set(nb.split(" ").filter((w) => w.length >= 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let inter = 0;
  for (const t of tokensA) if (tokensB.has(t)) inter++;
  const union = tokensA.size + tokensB.size - inter;
  return union > 0 ? inter / union : 0;
}

// ─── Language scoring ───────────────────────────────────────────────────────

function languageScore(
  releaseLangs: string[],
  profile?: LanguageProfile,
): { score: number; rejected?: string } {
  if (!profile) return { score: 0 };

  const mustNot = (profile.mustNotHave ?? []).map((l) => l.toLowerCase());
  const mustHave = (profile.mustHave ?? []).map((l) => l.toLowerCase());

  // must_not_have: rechaza si el release contiene ese idioma
  for (const forbidden of mustNot) {
    if (releaseLangs.some((l) => l.toLowerCase() === forbidden)) {
      return { score: -1000, rejected: `language "${forbidden}" forbidden` };
    }
  }

  // must_have: puntúa si coincide, rechaza si ninguno
  if (mustHave.length > 0) {
    const unknownOnly =
      releaseLangs.length === 0 ||
      releaseLangs.every((l) => l.toLowerCase() === "unknown" || l.toLowerCase() === "subs");
    if (unknownOnly && profile.allowUnknownLang) {
      // Sin idioma detectado: no rechazar, penalización leve (release sin etiqueta).
      return { score: -10 };
    }
    const matched = mustHave.filter((m) =>
      releaseLangs.some((l) => l.toLowerCase() === m),
    );
    if (matched.length === 0) {
      return {
        score: -500,
        rejected: `no required language (need ${mustHave.join("|")}, got ${releaseLangs.join(",") || "none"})`,
      };
    }
    return { score: matched.length * 10 };
  }

  return { score: 0 };
}

// ─── Main pickBest ──────────────────────────────────────────────────────────

export function pickBest(req: DecisionRequest): DecisionResult {
  const evaluated: ReleaseScore[] = [];
  const rejected: { release: ParsedRelease; reason: string }[] = [];

  for (const release of req.releases) {
    const reasons: string[] = [];

    // 1. Episode match (series): debe ser el episodio correcto
    if (req.season !== undefined && req.episode !== undefined) {
      if (release.type === "series") {
        if (release.season !== req.season) {
          rejected.push({ release, reason: `wrong season (${release.season} != ${req.season})` });
          continue;
        }
        // Acepta multi-ep si contiene el episodio pedido
        const epMatches =
          release.episode === req.episode ||
          (release.episodes?.includes(req.episode) ?? false);
        if (!epMatches) {
          rejected.push({ release, reason: `wrong episode (${release.episode} != ${req.episode})` });
          continue;
        }
      } else {
        rejected.push({ release, reason: "release is a movie but expected series episode" });
        continue;
      }
    }

    // 2. Quality mínima (Q7)
    const qLevel = QUALITY_ORDER[release.quality] ?? 0;
    const minLevel = QUALITY_ORDER[req.minQuality] ?? 0;
    if (qLevel < minLevel) {
      rejected.push({
        release,
        reason: `quality ${release.quality} < min ${req.minQuality}`,
      });
      continue;
    }

    // 3. Language profile
    const lang = languageScore(release.languages, req.languageProfile);
    if (lang.rejected) {
      rejected.push({ release, reason: lang.rejected });
      continue;
    }

    // 4. Title similarity (penaliza, no rechaza salvo mismatch grave)
    let sim = titleSimilarity(release.title, req.expectedTitle);
    // Refinar: si el release es de otra serie claramente (sim muy baja), rechazar
    if (sim < 0.25 && req.expectedTitle.length > 3) {
      rejected.push({
        release,
        reason: `title mismatch (sim=${sim.toFixed(2)})`,
      });
      continue;
    }

    // 4b. Año (películas): bonus por match exacto, penalización leve si no
    // coincide o no trae año. No rechaza.
    let yearScore = 0;
    if (req.expectedYear) {
      if (release.year === req.expectedYear) yearScore = 5;
      else if (release.year && release.year !== req.expectedYear) yearScore = -5;
      else yearScore = -2;
    }

    // 5. Score
    const qualityScore = qLevel;
    const sourceScore = SOURCE_ORDER[release.source] ?? 0;
    const titlePenalty = Math.round((1 - sim) * 10);
    const languageScoreVal = lang.score;

    const total =
      qualityScore * 100 + sourceScore * 10 + languageScoreVal + yearScore - titlePenalty;

    evaluated.push({
      release,
      qualityScore,
      sourceScore,
      titlePenalty,
      languageScore: languageScoreVal,
      yearScore,
      total,
    });
  }

  // Sort por total desc, luego seeds? No tenemos seeds en ParsedRelease — el
  // order estable lo da (quality, source, language, title).
  evaluated.sort((a, b) => b.total - a.total);

  const picked = evaluated[0] ?? null;

  let note = "";
  if (!picked) {
    note = `no eligible release (${req.releases.length} input, ${rejected.length} rejected)`;
  } else {
    const why: string[] = [];
    why.push(`q=${picked.release.quality}`);
    why.push(`src=${picked.release.source}`);
    if (picked.release.languages.length > 0) {
      why.push(`lang=${picked.release.languages.join("+")}`);
    }
    note = `picked ${picked.release.title} (${why.join(", ")})`;
  }

  return { picked, evaluated, rejected, note };
}

// ─── Helpers de utilidad ────────────────────────────────────────────────────

/** Filtra releases de una búsqueda ya parseados contra un episodio. */
export function filterReleasesForEpisode(
  parsedReleases: ParsedRelease[],
  season: number,
  episode: number,
): ParsedRelease[] {
  return parsedReleases.filter((r) => {
    if (r.type !== "series") return false;
    if (r.season !== season) return false;
    return r.episode === episode || (r.episodes?.includes(episode) ?? false);
  });
}
