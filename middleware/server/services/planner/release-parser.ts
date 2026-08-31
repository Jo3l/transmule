/**
 * Release parser — parsea nombres de releases torrent para el planificador.
 *
 * Extrae estructura completa de un nombre de release:
 *   title, type (series/movie), season, episode, year, quality tier,
 *   source, codec, languages, edition flags, group.
 *
 * Reutiliza las regex de ../torrent-search/parse-name.ts (quality/source/codec/
 * HDR/audio/language) pero con salida estructurada para el decision engine.
 */

// ─── Regex (compartidas con parse-name.ts) ──────────────────────────────────

const QUALITY_RE = /\b(2160p|4[kK]|1080p|720p|480p|360p|240p)\b/i;
const SOURCE_RE =
  /\b(BLURAY|BluRay|WEB[-.]?DL|WEB[-.]?Rip|WEB|HDRip|BRRip|DVDRip|DVD[Rr]ip|BDRip|HDTV|PDTV|DSR|SAT[Rr]ip|REMUX|CAM|TS|TC|R5)\b/i;
const CODEC_RE =
  /\b(x265|x264|h[.\s]?265|h[.\s]?264|HEVC|AV1|DivX|XviD|AVC|MPEG-?4|MPEG-?2)\b/i;
const AUDIO_CODEC_RE =
  /\b(EAC3|E[-.]?AC[-.]?3|AC3|AAC|FLAC|DTS[-.]?HD(?:[-.]?MA)?|DTS|TRUEHD|ATMOS|DDP\d*(?:\.\d)?|DD\d+(?:\.\d)?|MP3|OPUS|VORBIS|PCM)\b/gi;
const VIDEO_EXT_RE = /\b(MKV|MP4|AVI|M2TS|WEBM|MOV|WMV|FLV|M4V)\b/gi;
// Extensiones de ficheros auxiliares (subs, nfo, torrent, imágenes...) que
// llegan como falsos "releases" de aMule/slskd y ensucian el título.
const NON_VIDEO_EXT_RE =
  /\b(NFO|SRT|ASS|SSA|IDX|TORRENT|JPG|JPEG|PNG|XML|TXT|SFV|MD5|RAR|ZIP|7Z|P2P[-]?HASH|CHAPTERS?)\b/gi;
// HDR / rango dinámico, profundidad de bit y fuente de streaming (junk del título)
const HDR_RE = /\b(HDR10\+?|HDR|DOVI|DV|DOLBY[-\s]?VISION|SDR|HLG)\b/gi;
// Canales de audio sueltos (6CH, 8CH...) que quedan en el título.
const CHANNEL_RE = /\b\d{1,2}CH\b/gi;
const BITDEPTH_RE = /\b(10[-\s]?BIT|8[-\s]?BIT)\b/gi;
const STREAM_SRC_RE =
  /\b(ATVP|AMZN|DSNP|HMAX|DPLUS|AAPL|PEACOCK|CRAV|NF|HULU)\b/gi;
// Códigos de idioma (3 letras) para limpiar del título — sin romper palabras
const LANG_CODE_RE =
  /\b(ESP|SPA|CAST|ENG|ITA|FRE|FRA|GER|JPN|KOR|CHI|RUS|POR|DUT|SWE|DAN|NOR|FIN|POL|CZE|HUN|RUM|GRE|TUR|THA|VIE|HIN)\b/gi;
const YEAR_RE = /\b(19\d{2}|20\d{2})\b/;
const PROPER_RE =
  /\b(PROPER|REPACK|REMASTERED|EXTENDED|DIRECTORS?\s*CUT|UNCUT|UNRATED|IMAX)\b/i;

// S01E02, S01E02E03, S01E02-E03, 1x02
const SEASON_EP_RE = /\bS(\d{1,2})E(\d{1,3})(?:E(\d{1,3}))?\b/i;
const SEASON_EP_DASH_RE = /\bS(\d{1,2})E(\d{1,3})[-.]?E(\d{1,3})\b/i;
const X_N_RE = /\b(\d{1,2})x(\d{1,3})\b/i;

// Formato "101" (SxxEyy → xyy): "Cap.106", "Capitulo 106", "Capítulo 106",
// "Ep.106", "Episode 106", "Episodio 106". El número 106 → temporada 1,
// episodio 6 (los 3-4 dígitos se descomponen en season = floor(n/100),
// episode = n % 100). Común en releases españoles de ed2k.
const CAP_EP_RE = /\b(?:cap(?:[ií]tulo)?|ep(?:isodio|isode)?)[.\s-]*(\d{3,4})\b/i;

// Complete Season 1 / Season 1 / S01 (pack)
const SEASON_PACK_RE = /\b(?:Complete\s+)?(?:Season|Seasons?|S)\s*(\d{1,2})\b/i;

// Group: token final tipo -GROUPNAME
const GROUP_RE = /-([A-Za-z0-9]{2,15})$/;

// Language flags (audio): MULTi, ESP, SPANISH, CASTELLANO, LATINO, GERMAN, etc.
const LANG_MULTI_RE = /\b(MULTI|MULTi|MULT|MULTILANGUAGE)\b/i;
const LANG_SPANISH_RE =
  /\b(?:ESPA[ÑN]OL|ESPA[ÑN]A|CASTELLANO|SPANISH|\[ES\]|\.ES\.|CAST|ESP|DUAL)\b/i;
const LANG_LATINO_RE =
  /\b(LATINO|LATINOAMERICANO|LATAM|DUBLADO|LAT|LATIN|\[LAT\])\b/i;
const LANG_ENGLISH_RE = /\b(?:ENGLISH|INGL[ÉE]S|\[EN\]|\.EN\.)\b/i;
const LANG_GERMAN_RE = /\b(GERMAN|DEUTSCH|\[DE\]|\.DE\.|GER)\b/i;
const LANG_FRENCH_RE =
  /\b(FRENCH|FRAN[ÇC]AIS|TRUEFRENCH|VFF|\[FR\]|\.FR\.|FRE)\b/i;
const LANG_ITALIAN_RE = /\b(ITALIANO|ITALIAN|ITA|\[IT\]|\.IT\.)\b/i;
const LANG_PORTUGUESE_RE =
  /\b(PORTUGU[ÊE]S|PORTUGUESE|PT[.-]?BR|\[PT\]|\.PT\.)\b/i;
const LANG_RUSSIAN_RE = /\b(RUSSIAN|RUS|\[RU\]|\.RU\.)\b/i;
const LANG_KOREAN_RE = /\b(KOREAN|KOR|\[KO\]|\.KO\.)\b/i;
const LANG_CHINESE_RE =
  /\b(CHINESE|CHI|MANDARIN|CANTONESE|CHS|CHT|\[ZH\]|\.ZH\.)\b/i;
const LANG_JAPANESE_RE = /\b(JAPANESE|JAP|JPN|\[JP\]|\.JP\.)\b/i;

// Spanish-specific markers
const SUB_RE = /\b(VOSE|VOS|SUBS?\s*(?:ESP|SPA|ES)|SUB[. ]?ESP[AÑOL]*)\b/i;

// Marcadores de "solo subtítulos": el audio es el ORIGINAL y los tags de
// idioma del nombre describen SUBTÍTULOS, no una pista de audio localizada.
// V.O.S./VOSE/VOS (versión original subtitulada) — con o sin puntos.
const VOSE_RE = /(?:^|[^A-Za-z0-9])V\.?O\.?S\.?(?:E\.?)?(?:$|[^A-Za-z0-9])/i;
// Forma con espacios tras normalizar puntos ("V O S", "V O S E").
const VOSE_SPACED_RE = /(?:^|[^A-Za-z0-9])V\s*O\s*S(?:\s*E)?(?:$|[^A-Za-z0-9])/i;
// "subs/subtítulos integrados|embebidos|embedded|incluidos"
const EMBEDDED_SUBS_RE =
  /\b(?:SUBS?|SUBT[ÍI]TULOS?)\s+(?:INTEGRADOS?|EMBEBIDOS?|EMBEDDED|INCLUIDOS?)\b/i;
// Formas verbales inequívocas de "lleva subtítulos" (audio original).
const SUBTITLED_RE = /\b(?:SUBTITULAD[OA]S?|SUBTITLED|SUBBED|HARDSUBS?)\b/i;
// Marcadores explícitos de pista de audio localizada: si aparecen, los tags
// de idioma SÍ describen audio (p.ej. "Castellano Subs Integrados") y el
// release NO se considera subtitle-only.
const AUDIO_TRACK_RE =
  /\b(?:CASTELLANO|ESPA[ÑN]OL|DUBLAD[OA]S?|DUBBED|LATINO|LATAM|DUAL|MULTI(?:LANGUAGE)?)\b/i;

// ─── Output types ───────────────────────────────────────────────────────────

export type ReleaseType = "series" | "movie" | "unknown";
export type QualityTier = "uhd" | "fullhd" | "hd" | "sd" | "unknown";
export type ReleaseSource =
  | "bluray"
  | "webdl"
  | "webrip"
  | "hdtv"
  | "sat"
  | "remux"
  | "dvd"
  | "cam"
  | "unknown";

export interface ParsedRelease {
  /** Título limpio (sin año, season/ep, calidad...) */
  title: string;
  type: ReleaseType;
  season?: number;
  episode?: number;
  /** Multi-episodio (S01E02E03) */
  episodes?: number[];
  /** Año del release */
  year?: number;
  /** Tier de calidad (uhd/fullhd/hd/sd) */
  quality: QualityTier;
  /** Fuente (bluray, webdl, webrip, hdtv...) */
  source: ReleaseSource;
  /** Codec de vídeo */
  codec?: string;
  /** Audio languages detectadas */
  languages: string[];
  /** Flags de edición (PROPER, REPACK...) */
  edition: string[];
  /** Grupo release (token tras -) */
  group?: string;
  /** ¿Es multi-idioma? */
  multi: boolean;
  /** Nombre crudo */
  raw: string;
  /** Tamaño en MB (lo adjunta el search provider; el parser no lo conoce) */
  sizeMb?: number;
}

// ─── Mapping helpers ────────────────────────────────────────────────────────

function mapQuality(raw: string): QualityTier {
  const q = raw.toLowerCase();
  if (q.includes("2160") || q.includes("4k")) return "uhd";
  if (q.includes("1080")) return "fullhd";
  if (q.includes("720")) return "hd";
  if (q.includes("480") || q.includes("360") || q.includes("240")) return "sd";
  return "unknown";
}

function mapSource(raw: string): ReleaseSource {
  const s = raw.toLowerCase();
  if (s.includes("remux")) return "remux";
  // "bd" solo como token suelto o "bdrip": "webdl" contiene "bd" como substring.
  if (s.includes("bluray") || s.includes("bdrip") || /\bbd\b/.test(s))
    return "bluray";
  if (
    s.includes("web-dl") ||
    s.includes("webdl") ||
    s.includes("web.dl") ||
    s.includes("web dl")
  )
    return "webdl";
  if (s.includes("webrip") || s.includes("web-rip") || s.includes("web rip"))
    return "webrip";
  if (s.includes("hdtv")) return "hdtv";
  if (s.includes("sat")) return "sat";
  if (s.includes("dvd") || s.includes("brrip") || s.includes("bdrrip"))
    return "dvd";
  if (s.includes("cam") || s.includes("hdcam")) return "cam";
  return "unknown";
}

// ─── Main parse ─────────────────────────────────────────────────────────────

/**
 * True si el nombre corresponde a un fichero de vídeo (o no se puede descartar).
 * False para ficheros auxiliares (subs .srt, .nfo, .torrent, imágenes, .xml…)
 * que llegan como falsos "releases" de aMule/slskd y deben ignorarse.
 */
export function isVideoFile(name: string): boolean {
  const ext = (name ?? "").slice((name ?? "").lastIndexOf(".") + 1).toLowerCase();
  if (/^(mkv|mp4|avi|m2ts|webm|mov|wmv|flv|m4v|ts|mpg|mpeg)$/.test(ext)) return true;
  if (/^(nfo|srt|sub|ass|ssa|idx|torrent|jpe?g|png|gif|xml|txt|sfv|md5|rar|zip|7z|p2p-hash|hash|url)$/.test(ext)) return false;
  return true; // sin extensión o desconocida → no descartar
}

export function parseReleaseName(name: string): ParsedRelease {
  const clean = name.replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
  const raw = name;

  // 1. Season/episode patterns (series detection)
  let season: number | undefined;
  let episode: number | undefined;
  let episodes: number[] | undefined;
  let type: ReleaseType = "movie";

  const seDash = clean.match(SEASON_EP_DASH_RE);
  const se = clean.match(SEASON_EP_RE);
  const xn = clean.match(X_N_RE);
  const capEp = clean.match(CAP_EP_RE);
  const seasonPack = clean.match(SEASON_PACK_RE);

  if (seDash) {
    season = Number(seDash[1]);
    episode = Number(seDash[2]);
    episodes = [Number(seDash[2]), Number(seDash[3])];
    type = "series";
  } else if (se) {
    season = Number(se[1]);
    episode = Number(se[2]);
    if (se[3]) episodes = [Number(se[2]), Number(se[3])];
    type = "series";
  } else if (xn) {
    season = Number(xn[1]);
    episode = Number(xn[2]);
    type = "series";
  } else if (capEp) {
    // Formato "101": "Cap.106" → S01E06, "Cap.213" → S02E13.
    const num = Number(capEp[1]);
    season = Math.floor(num / 100);
    episode = num % 100;
    type = "series";
  } else if (
    seasonPack &&
    !YEAR_RE.test(clean.split(" ").slice(0, 2).join(" "))
  ) {
    season = Number(seasonPack[1]);
    episode = undefined;
    type = "series";
  }

  // 2. Year
  const yearMatch = clean.match(YEAR_RE);
  const year = yearMatch ? Number(yearMatch[1]) : undefined;

  // 3. Quality + source
  const qualMatch = clean.match(QUALITY_RE);
  const quality: QualityTier = qualMatch ? mapQuality(qualMatch[1]) : "unknown";
  // REMUX tiene prioridad sobre BLURAY (Oppenheimer.2023.2160p.UHD.BluRay.REMUX...)
  const remuxMatch = clean.match(/\bREMUX\b/i);
  const srcMatch = remuxMatch ? ["REMUX"] : clean.match(SOURCE_RE);
  const source: ReleaseSource = srcMatch
    ? mapSource(srcMatch[0] ?? srcMatch[1] ?? "")
    : "unknown";

  // 4. Codec
  const codecMatch = clean.match(CODEC_RE);
  let codec = codecMatch ? codecMatch[1].toLowerCase() : undefined;
  if (codec) codec = codec.replace(/\s+/g, ".");

  // 5. Languages
  const languages: string[] = [];
  let multi = false;
  if (LANG_MULTI_RE.test(clean)) {
    multi = true;
    languages.push("multi");
  }
  if (LANG_SPANISH_RE.test(clean)) languages.push("spanish");
  if (LANG_LATINO_RE.test(clean)) languages.push("latino");
  if (LANG_ENGLISH_RE.test(clean)) languages.push("english");
  if (LANG_GERMAN_RE.test(clean)) languages.push("german");
  if (LANG_FRENCH_RE.test(clean)) languages.push("french");
  if (LANG_ITALIAN_RE.test(clean)) languages.push("italian");
  if (LANG_PORTUGUESE_RE.test(clean)) languages.push("portuguese");
  if (LANG_RUSSIAN_RE.test(clean)) languages.push("russian");
  if (LANG_KOREAN_RE.test(clean)) languages.push("korean");
  if (LANG_CHINESE_RE.test(clean)) languages.push("chinese");
  if (LANG_JAPANESE_RE.test(clean)) languages.push("japanese");
  if (SUB_RE.test(clean)) {
    if (!languages.includes("subs")) languages.push("subs");
  }
  // Fallback: ISO codes del parser existente (EN, ES, FR...) — incluye
  // códigos sueltos al final del nombre (antes del group): "...-ES", "...-NL"
  if (languages.length === 0) {
    const isoMatch = clean.match(
      /\b(?:EN|ES|SP|FR|DE|IT|PT|RU|JA|KO|ZH|NL|PL|SV|DA|NO|FI|CS|HU|RO|UK|EL|TR|TH|VI|HI)\b/g,
    );
    if (isoMatch) {
      const map: Record<string, string> = {
        EN: "english",
        ES: "spanish",
        SP: "spanish",
        FR: "french",
        DE: "german",
        IT: "italian",
        PT: "portuguese",
        RU: "russian",
        JA: "japanese",
        KO: "korean",
        ZH: "chinese",
        NL: "dutch",
        PL: "polish",
        SV: "swedish",
        DA: "danish",
        NO: "norwegian",
        FI: "finnish",
        CS: "czech",
        HU: "hungarian",
        RO: "romanian",
        UK: "ukrainian",
        EL: "greek",
        TR: "turkish",
        TH: "thai",
        VI: "vietnamese",
        HI: "hindi",
      };
      for (const code of isoMatch) {
        const lang = map[code.toUpperCase()];
        if (lang && !languages.includes(lang)) languages.push(lang);
      }
    }
  }

  // 5b. Subtitle-only: V.O.S./VOSE/VOS, "subs integrados" o "subtitulado"
  // significan que el audio es el ORIGINAL y los tags de idioma detectados
  // arriba describen SUBTÍTULOS, no una pista localizada. Salvo que haya un
  // marcador explícito de audio (CASTELLANO/LATINO/DUAL/MULTI...), el release
  // se puntúa como "sin idioma": el scoring lo penaliza igual que a un archivo
  // no localizado y solo se etiqueta como "subs" (evita el falso positivo del
  // tipo "V.O.S. ... Spanish subs" contado como español de España).
  const subtitleOnly =
    !AUDIO_TRACK_RE.test(clean) &&
    (VOSE_RE.test(raw) ||
      VOSE_SPACED_RE.test(clean) ||
      EMBEDDED_SUBS_RE.test(clean) ||
      SUBTITLED_RE.test(clean));
  if (subtitleOnly) {
    languages.length = 0;
    languages.push("subs");
  }

  // 6. Edition flags
  const edition: string[] = [];
  const properMatch = clean.match(PROPER_RE);
  if (properMatch) edition.push(properMatch[1].toLowerCase());

  // 7. Group
  const groupMatch = raw.match(GROUP_RE);
  const group = groupMatch ? groupMatch[1] : undefined;

  // 8. Clean title — quitar season/ep, calidad, año, source, codec, flags, grupo
  let title = clean
    .replace(SEASON_EP_DASH_RE, " ")
    .replace(SEASON_EP_RE, " ")
    .replace(X_N_RE, " ")
    .replace(CAP_EP_RE, " ")
    .replace(SEASON_PACK_RE, " ")
    .replace(QUALITY_RE, " ")
    .replace(SOURCE_RE, " ")
    .replace(CODEC_RE, " ")
    .replace(AUDIO_CODEC_RE, " ")
    .replace(VIDEO_EXT_RE, " ")
    .replace(NON_VIDEO_EXT_RE, " ")
    .replace(HDR_RE, " ")
    .replace(CHANNEL_RE, " ")
    .replace(BITDEPTH_RE, " ")
    .replace(STREAM_SRC_RE, " ")
    .replace(YEAR_RE, " ")
    .replace(PROPER_RE, " ")
    .replace(/\b(MULTI|MULT)\b/gi, " ")
    // "subs integrados" / "subtítulos integrados" y V.O.S. normalizado
    // ("V O S") — junk de marcadores de subtítulos que diluye la similitud.
    // Deben ir ANTES del regex de palabras: si "subs" se quita primero,
    // "integrados" queda huérfano en el título.
    .replace(/\b(?:SUBS?|SUBT[ÍI]TULOS?)\s+INTEGRADOS?\b/gi, " ")
    .replace(/\bV\s*O\s*S(?:\s*E)?\b/gi, " ")
    .replace(
      /\b(?:ESPA[ÑN]OL|CASTELLANO|SPANISH|LATINO|ENGLISH|GERMAN|FRENCH|JAPANESE|VOSE|VOS|SUBS?|SUBTITLES?|SUBTITULADOS?)\b/gi,
      " ",
    )
    .replace(LANG_CODE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Quitar grupo al final (-GROUP)
  title = title.replace(/-[A-Za-z0-9]{2,15}$/, "").trim();
  // Quitar puntuación residual
  title = title
    .replace(/[()[\]{}]/g, "")
    .replace(/^[-_\s]+|[-_\s]+$/g, "")
    .trim();

  return {
    title,
    type,
    season,
    episode,
    episodes,
    year,
    quality,
    source,
    codec,
    languages,
    edition,
    group,
    multi,
    raw,
  };
}

// ─── Normalización de idioma (alineada con los locales de Settings) ─────────

/**
 * Mapea un nombre de idioma detectado por el parser a su código ISO canónico
 * (los mismos que usa Settings → Integraciones → locale: en, es, it, pt, fr,
 * de, ru, ja, ko, zh + la variante especial `latino`).
 */
export function mapLanguageToIso(lang: string): string {
  const l = (lang ?? "").toLowerCase().trim();
  const map: Record<string, string> = {
    spanish: "es",
    español: "es",
    castellano: "es",
    cast: "es",
    esp: "es",
    sp: "es",
    latino: "latino",
    latin: "latino",
    lat: "latino",
    english: "en",
    inglés: "en",
    ingles: "en",
    italian: "it",
    italiano: "it",
    portuguese: "pt",
    portugués: "pt",
    french: "fr",
    francés: "fr",
    français: "fr",
    german: "de",
    deutsch: "de",
    alemán: "de",
    russian: "ru",
    ruso: "ru",
    japanese: "ja",
    japonés: "ja",
    korean: "ko",
    coreano: "ko",
    chinese: "zh",
    chino: "zh",
    dutch: "nl",
    neerlandés: "nl",
    polish: "pl",
    polaco: "pl",
    swedish: "sv",
    sueco: "sv",
    danish: "da",
    danés: "da",
    norwegian: "no",
    noruego: "no",
    finnish: "fi",
    finés: "fi",
    czech: "cs",
    checo: "cs",
    hungarian: "hu",
    húngaro: "hu",
    romanian: "ro",
    rumano: "ro",
    ukrainian: "uk",
    ucraniano: "uk",
    greek: "el",
    griego: "el",
    turkish: "tr",
    turco: "tr",
    thai: "th",
    tailandés: "th",
    vietnamese: "vi",
    vietnamita: "vi",
    hindi: "hi",
    multi: "latino",
    subs: "subs",
    unknown: "unknown",
  };
  return map[l] ?? l;
}
