/**
 * Resolución de títulos localizados (serie/película) para el scoring de
 * búsqueda. Cuando una suscripción tiene un idioma no inglés, el motor puede
 * encontrar releases titulados con el nombre traducido (p.ej. "Juego de Tronos")
 * y debe puntuarlos sin penalizarlos por no coincidir con el título inglés.
 */
import { getTvdbSeriesLocalizedName } from "./tvdb";
import {
  getTmdbMovieDetail,
  getTmdbMovieLocalizedTitle,
  getTmdbTvDetail,
  getTmdbTvLocalizedName,
} from "./tmdb";

export interface AltTitleSource {
  tvdb_id?: number | null;
  tmdb_id?: number | null;
  language?: string | null;
  /** Título canónico (normalmente inglés) para evitar duplicarlo como alt. */
  title?: string | null;
  /**
   * Tipo de medio, para elegir el endpoint correcto de TMDB:
   * una serie sin tvdb_id (añadida desde el calendario) usa /tv/{id},
   * una película usa /movie/{id}.
   */
  media_type?: "series" | "movie";
  /**
   * Incluir también el nombre ORIGINAL en inglés además del localizado
   * (default true). Los call sites que re-titulan la suscripción al nombre
   * localizado pasan false para conservar la semántica antigua (solo localizado).
   */
  includeOriginal?: boolean;
}

/**
 * Devuelve títulos alternativos de la serie/película para las queries y el
 * scoring. Incluye:
 *   - el nombre LOCALIZADO en el idioma elegido (si no es inglés), y
 *   - el nombre ORIGINAL en inglés (siempre): el título canónico puede venir ya
 *     localizado (TVDB devuelve el nombre según el idioma de la petición), y
 *     sin el original las búsquedas en aMule/slskd no encontrarían releases
 *     nombrados con el título inglés.
 * Vacío si no hay ningún título alternativo (canónico == todos los demás).
 */
export async function resolveAltTitles(src: AltTitleSource): Promise<string[]> {
  const lang = (src.language ?? "").trim();
  const includeOriginal = src.includeOriginal !== false;
  const canonical = (src.title ?? "").trim().toLowerCase();
  const out: string[] = [];

  // Añade un nombre si es válido, distinto del canónico y no duplicado.
  const push = (name: string | null | undefined) => {
    const clean = String(name ?? "").trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (key === canonical) return;
    if (out.some((x) => x.toLowerCase() === key)) return;
    out.push(clean);
  };

  if (src.media_type === "series") {
    if (src.tvdb_id) {
      if (lang && lang !== "en") {
        push(await getTvdbSeriesLocalizedName(src.tvdb_id, lang).catch(() => null));
      }
      if (includeOriginal) {
        push(await getTvdbSeriesLocalizedName(src.tvdb_id, "en").catch(() => null));
      }
    } else if (src.tmdb_id) {
      if (lang && lang !== "en") {
        push(await getTmdbTvLocalizedName(src.tmdb_id, lang).catch(() => null));
      }
      if (includeOriginal) {
        const detail = await getTmdbTvDetail(src.tmdb_id).catch(() => null);
        push(detail?.name);
      }
    }
  } else {
    if (src.tmdb_id) {
      if (lang && lang !== "en") {
        push(await getTmdbMovieLocalizedTitle(src.tmdb_id, lang).catch(() => null));
      }
      if (includeOriginal) {
        const detail = await getTmdbMovieDetail(src.tmdb_id, "en").catch(() => null);
        push(detail?.title);
        push(detail?.original_title);
      }
    }
  }

  return [...new Set(out)];
}

export interface LanguageTitlePair {
  /** Título en el idioma seleccionado (null si no hay localización distinta). */
  localized: string | null;
  /** Título original (inglés). */
  original: string | null;
}

/**
 * Resuelve el par de títulos (localizado vs original) por separado, para la
 * inferencia de idioma cuando un release no trae referencia explícita. A
 * diferencia de resolveAltTitles (lista plana para el scoring), aquí se
 * distingue cuál es el localizado y cuál el original, y se anula el localizado
 * cuando coincide con el original (sin localización).
 */
export async function resolveLanguageTitles(
  src: AltTitleSource,
): Promise<LanguageTitlePair> {
  const lang = (src.language ?? "").trim();
  let localized: string | null = null;
  let original: string | null = null;

  if (src.media_type === "series") {
    if (src.tvdb_id) {
      if (lang && lang !== "en") {
        localized = await getTvdbSeriesLocalizedName(src.tvdb_id, lang).catch(() => null);
      }
      original = await getTvdbSeriesLocalizedName(src.tvdb_id, "en").catch(() => null);
    } else if (src.tmdb_id) {
      if (lang && lang !== "en") {
        localized = await getTmdbTvLocalizedName(src.tmdb_id, lang).catch(() => null);
      }
      const detail = await getTmdbTvDetail(src.tmdb_id).catch(() => null);
      original = detail?.name ?? null;
    }
  } else if (src.tmdb_id) {
    if (lang && lang !== "en") {
      localized = await getTmdbMovieLocalizedTitle(src.tmdb_id, lang).catch(() => null);
    }
    const detail = await getTmdbMovieDetail(src.tmdb_id, "en").catch(() => null);
    original = detail?.title ?? detail?.original_title ?? null;
  }

  const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
  localized = clean(localized);
  original = clean(original);

  // Sin localización real (igual al original) -> localized = null.
  if (
    localized &&
    original &&
    localized.toLowerCase() === original.toLowerCase()
  ) {
    localized = null;
  }

  return { localized, original };
}
