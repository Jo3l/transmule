/**
 * Resolución de títulos localizados (serie/película) para el scoring de
 * búsqueda. Cuando una suscripción tiene un idioma no inglés, el motor puede
 * encontrar releases titulados con el nombre traducido (p.ej. "Juego de Tronos")
 * y debe puntuarlos sin penalizarlos por no coincidir con el título inglés.
 */
import { getTvdbSeriesLocalizedName } from "./tvdb";
import { getTmdbMovieLocalizedTitle } from "./tmdb";

export interface AltTitleSource {
  tvdb_id?: number | null;
  tmdb_id?: number | null;
  language?: string | null;
  /** Título canónico (normalmente inglés) para evitar duplicarlo como alt. */
  title?: string | null;
}

/**
 * Devuelve títulos alternativos localizados (sin duplicar el título canónico).
 * Vacío si no hay idioma o es inglés.
 */
export async function resolveAltTitles(src: AltTitleSource): Promise<string[]> {
  const lang = (src.language ?? "").trim();
  if (!lang || lang === "en") return [];

  const canonical = (src.title ?? "").trim().toLowerCase();
  const out: string[] = [];

  if (src.tvdb_id) {
    const name = await getTvdbSeriesLocalizedName(src.tvdb_id, lang).catch(() => null);
    if (name && name.trim().toLowerCase() !== canonical) out.push(name.trim());
  }
  if (src.tmdb_id) {
    const title = await getTmdbMovieLocalizedTitle(src.tmdb_id, lang).catch(() => null);
    if (title && title.trim().toLowerCase() !== canonical) out.push(title.trim());
  }

  return [...new Set(out)];
}
