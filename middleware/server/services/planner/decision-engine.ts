/**
 * Decision engine — elige el mejor release para un episodio/película.
 *
 * Pipeline:
 *   1. filter by language profile (must_have / must_not_have)
 *   2. quality scoring (preferencia suave: penaliza por debajo de min_quality)
 *   3. filter por match de título (episodio correcto)
 *   4. sort por calidad + source + idioma + tamaño
 *   5. pick best
 *
 * Devuelve la decisión con el razonamiento (para logging y UI).
 */

import type { ParsedRelease } from "./release-parser";
import { mapLanguageToIso } from "./release-parser.ts";

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
  /** Títulos alternativos localizados (idioma elegido) — se puntúa con la
   *  máxima similitud entre expectedTitle y estos, para no penalizar releases
   *  titulados en el idioma de la suscripción (p.ej. "Juego de Tronos"). */
  altTitles?: string[];
  /** Título del episodio localizado (idioma elegido) — bonus si el nombre del
   *  release lo incluye. No penaliza si falta (p.ej. "Silo 1x01 spanish"). */
  expectedEpisodeTitle?: string;
  /** Season+episode si es serie */
  season?: number;
  episode?: number;
  /** Quality mínima (Q7) */
  minQuality: QualityTier;
  /** Año esperado (películas) — señal de matching, no de rechazo */
  expectedYear?: number;
  languageProfile?: LanguageProfile;
  /** Tamaño objetivo en MB (NULL = sin límite) — penaliza releases mucho mayores. */
  maxSizeMb?: number | null;
  /** ¿Multi-idioma aceptable? (por defecto sí) */
  preferMulti?: boolean;
}

export interface ReleaseScore {
  release: ParsedRelease;
  /** Puntos de calidad: tier × 100, penalizado si está por debajo de min_quality */
  qualityScore: number;
  /** Puntos de fuente (SOURCE_ORDER) */
  sourceScore: number;
  /** Penalización por title mismatch */
  titlePenalty: number;
  /** Puntos de idioma */
  languageScore: number;
  /** Puntos por match de año */
  yearScore: number;
  /** Puntos por match del título del episodio (localizado) */
  episodeTitleScore: number;
  /** Puntos por tamaño (penaliza exceder maxSizeMb) */
  sizeScore: number;
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

/** Normaliza un texto para comparación: minúsculas, sin acentos ni puntuación. */
function normalizeForMatch(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True si el nombre del release incluye el título del episodio (localizado).
 * Coincidencia por frase completa o por todos los tokens significativos (≥3).
 */
function episodeTitleMatch(releaseRaw: string, episodeTitle: string): boolean {
  const raw = normalizeForMatch(releaseRaw).replace(/ /g, "");
  const title = normalizeForMatch(episodeTitle);
  if (!title || title.length < 3) return false;
  if (raw.includes(title.replace(/ /g, ""))) return true;
  const tokens = title.split(" ").filter((w) => w.length >= 3);
  if (tokens.length >= 2) return tokens.every((t) => raw.includes(t));
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Elimina los tokens del título del episodio (si el release lo contiene) del
 * título del release, para que no diluyan la similitud con el título de la
 * serie (p.ej. "Lanterns 1x01 Piloto ..." → "Lanterns ...").
 */
function stripEpisodeTitle(releaseTitle: string, episodeTitle: string): string {
  const et = normalizeForMatch(episodeTitle);
  if (!et || et.length < 3) return releaseTitle;
  const tokens = et.split(" ").filter((w) => w.length >= 3);
  if (tokens.length === 0) return releaseTitle;
  let out = releaseTitle;
  for (const t of tokens) {
    out = out.replace(new RegExp("\\b" + escapeRegExp(t) + "\\b", "gi"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

// ─── Language scoring ───────────────────────────────────────────────────────

function languageScore(
  releaseLangs: string[],
  profile?: LanguageProfile,
): { score: number; rejected?: string } {
  if (!profile) return { score: 0 };

  // Normalizar a ISO-2: el parser emite nombres ("spanish") y el perfil guarda
  // códigos ISO ("es"). Comparar sin normalizar hace que nunca coincidan.
  const relLangs = (releaseLangs ?? []).map((l) => mapLanguageToIso(l));
  const mustNot = (profile.mustNotHave ?? []).map((l) => mapLanguageToIso(l));
  const mustHave = (profile.mustHave ?? []).map((l) => mapLanguageToIso(l));

  // must_not_have: rechaza si el release contiene ese idioma
  for (const forbidden of mustNot) {
    if (relLangs.includes(forbidden)) {
      return { score: -1000, rejected: `language "${forbidden}" forbidden` };
    }
  }

  // must_have: puntúa si coincide, rechaza si ninguno
  if (mustHave.length > 0) {
    const unknownOnly =
      relLangs.length === 0 ||
      relLangs.every((l) => l === "unknown" || l === "subs");
    if (unknownOnly && profile.allowUnknownLang) {
      // Sin idioma detectado: no rechazar, penalización leve.
      return { score: -10 };
    }
    const matched = mustHave.filter((m) => relLangs.includes(m));
    if (matched.length === 0) {
      return {
        score: -500,
        rejected: `no required language (need ${mustHave.join("|")}, got ${relLangs.join(",") || "none"})`,
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

    // 2. Quality: preferencia suave, no umbral duro. Estar por debajo de
    //    min_quality resta puntos en el scoring (igual que el tamaño penaliza
    //    el exceso), en lugar de descartar el release.

    // 3. Language profile
    const lang = languageScore(release.languages, req.languageProfile);
    if (lang.rejected) {
      rejected.push({ release, reason: lang.rejected });
      continue;
    }

    // 4. Title similarity (penaliza, no rechaza salvo mismatch grave).
    // Con títulos alternativos localizados se toma la máxima similitud.
    // Quitar el título del episodio (si se conoce y aparece) del título del
    // release antes de comparar, para que no diluya la similitud con la serie.
    let releaseTitleForSim = release.title;
    if (req.expectedEpisodeTitle && episodeTitleMatch(release.raw, req.expectedEpisodeTitle)) {
      releaseTitleForSim = stripEpisodeTitle(release.title, req.expectedEpisodeTitle);
    }
    let sim = titleSimilarity(releaseTitleForSim, req.expectedTitle);
    if (req.altTitles?.length) {
      for (const alt of req.altTitles) {
        sim = Math.max(sim, titleSimilarity(releaseTitleForSim, alt));
      }
    }
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

    // 4c. Título del episodio (localizado): bonus si el release lo incluye.
    // No penaliza si falta (p.ej. "Silo 1x01 spanish" sin título de episodio).
    let episodeTitleScore = 0;
    if (
      req.expectedEpisodeTitle &&
      episodeTitleMatch(release.raw, req.expectedEpisodeTitle)
    ) {
      episodeTitleScore = 20;
    }

    // 4d. Tamaño: cuanto más cerca del objetivo (maxSizeMb) mejor — un 800 MB
    // puntúa más que un 100 MB y MUCHO más que un 10 GB. Exceder penaliza de
    // forma no lineal y suficientemente fuerte para contrarrestar escalones de
    // calidad (100 pts): 10 GB vs objetivo 1 GB ≈ -559 pts.
    let sizeScore = 0;
    if (req.maxSizeMb != null && release.sizeMb != null) {
      const ratio = release.sizeMb / req.maxSizeMb;
      if (ratio <= 1) {
        sizeScore = Math.round(30 * ratio);
      } else {
        sizeScore = -Math.round(40 * (ratio - 1) ** 1.2);
      }
    }

    // 5. Score
    // Quality: tier × 100 (uhd 400 > fullhd 300 > hd 200 > sd 100 > unknown 0).
    // Por debajo del tier preferido resta 100 pts por escalón — queda ordenado
    // detrás de los que cumplen, pero sigue disponible como fallback.
    const qLevel = QUALITY_ORDER[release.quality] ?? 0;
    const minLevel = QUALITY_ORDER[req.minQuality] ?? 0;
    const qualityScore =
      qLevel * 100 - (qLevel < minLevel ? (minLevel - qLevel) * 100 : 0);
    const sourceScore = SOURCE_ORDER[release.source] ?? 0;
    const titlePenalty = Math.round((1 - sim) * 10);
    const languageScoreVal = lang.score;

    const total =
      qualityScore +
      sourceScore * 10 +
      languageScoreVal +
      yearScore +
      episodeTitleScore +
      sizeScore -
      titlePenalty;

    evaluated.push({
      release,
      qualityScore,
      sourceScore,
      titlePenalty,
      languageScore: languageScoreVal,
      yearScore,
      episodeTitleScore,
      sizeScore,
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
