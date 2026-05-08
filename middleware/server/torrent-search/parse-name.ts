/**
 * Torrent name parser — extracts quality, codec, audio, HDR, languages, etc.
 * from raw torrent file names. Used by the torrent-search middleware to enrich
 * results from any plugin with decorative tags.
 *
 * Pattern-based, not AI — covers 95%+ of real-world torrent names.
 */
import type { TorrentSearchResult } from "../providers/types";

const QUALITY_RE = /\b(2160p|4[kK]|1080p|720p|480p|360p|240p)\b/;
const SOURCE_RE = /\b(BLURAY|BluRay|WEB[-.]DL|WEB[-.]Rip|WEB|HDRip|BRRip|DVDRip|DVD[Rr]ip|BDRip|HDTV|PDTV|DSR|SAT[Rr]ip|CAM|TS|TC|R5)\b/i;
const CODEC_RE = /\b(x265|x264|h\.?265|h\.?264|HEVC|AV1|DivX|XviD|AVC|MPEG-?4|MPEG-?2)\b/i;
const HDR_RE = /\b(DV|DOVI|DoVi|Dolby[\s._-]?Vision|HDR10\+?|HDR|HLG)\b/i;
const AUDIO_CODEC_RE = /\b(TrueHD|DTS[\s._-]?HD|DTS|AC3|EAC3|AAC|FLAC|MP3|OPUS|Vorbis|PCM|LPCM)\b/i;
const AUDIO_CH_RE = /(\d)[.\s_](\d)\s*CH/i;
const YEAR_RE = /\b(19\d{2}|20\d{2})\b/;
const LANG_RE = /\b((?:EN|ES|FR|DE|IT|PT|RU|JA|KO|ZH|AR|NL|PL|SV|DA|NO|FI|CS|HU|RO|UK|EL|TR|TH|VI|HI)(?:[.\s_/]+(?:EN|ES|FR|DE|IT|PT|RU|JA|KO|ZH|AR|NL|PL|SV|DA|NO|FI|CS|HU|RO|UK|EL|TR|TH|VI|HI))*)\b/;
const PROPER_RE = /\b(PROPER|REPACK|REMASTERED|EXTENDED|DIRECTORS?\s*CUT|UNCUT|UNRATED|IMAX)\b/i;
const SEASON_RE = /\b[Ss](\d{2})[Ee](\d{2})\b/;

export interface ParsedTorrentTags {
  tags: TorrentTag[];
  year?: string;
}

export interface TorrentTag {
  label: string;
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info" | "accent";
  icon?: string;
  tooltip?: string;
}

/**
 * Parse a torrent name and return decorative tags + extracted year.
 */
export function parseTorrentName(name: string): ParsedTorrentTags {
  const tags: TorrentTag[] = [];
  const clean = name.replace(/[._]/g, " ").trim();

  let year: string | undefined;

  // Year
  const yearMatch = clean.match(YEAR_RE);
  if (yearMatch) {
    year = yearMatch[1];
  }

  // Resolution / quality
  const qualMatch = clean.match(QUALITY_RE);
  if (qualMatch) {
    tags.push({
      label: qualMatch[1].toUpperCase(),
      variant: "warning",
      tooltip: "Resolution",
    });
  }

  // HDR
  const hdrMatch = clean.match(HDR_RE);
  if (hdrMatch) {
    tags.push({
      label: hdrMatch[1].toUpperCase(),
      variant: "warning",
      tooltip: "HDR Type",
    });
  }

  // Source type
  const srcMatch = clean.match(SOURCE_RE);
  if (srcMatch) {
    tags.push({
      label: srcMatch[1].toUpperCase(),
      variant: "info",
      tooltip: "Source",
    });
  }

  // Video codec
  const codecMatch = clean.match(CODEC_RE);
  if (codecMatch) {
    tags.push({
      label: codecMatch[1].toLowerCase(),
      variant: "info",
      tooltip: "Video Codec",
    });
  }

  // Audio codec
  const audioMatch = clean.match(AUDIO_CODEC_RE);
  if (audioMatch) {
    let label = audioMatch[1].toUpperCase();
    // Append channel count if found
    const chMatch = clean.match(AUDIO_CH_RE);
    if (chMatch) {
      label += ` ${chMatch[1]}.${chMatch[2]}`;
    }
    tags.push({
      label,
      variant: "accent",
      tooltip: "Audio Codec",
    });
  }

  // Languages (ISO codes)
  const langMatch = clean.match(LANG_RE);
  if (langMatch) {
    const raw = langMatch[1];
    const codes = raw.split(/[.\s_/]+/).filter(Boolean);
    const seen = new Set<string>();
    for (const code of codes) {
      const upper = code.toUpperCase();
      if (seen.has(upper) || upper.length > 3) continue;
      seen.add(upper);
      const flag = langToFlag(upper);
      if (flag) {
        tags.push({
          label: `${flag} ${upper}`,
          variant: "default",
          tooltip: `Language: ${upper}`,
        });
      } else {
        tags.push({
          label: upper,
          variant: "default",
          tooltip: `Language: ${upper}`,
        });
      }
    }
  }

  // Proper / flags
  const properMatch = clean.match(PROPER_RE);
  if (properMatch) {
    tags.push({
      label: properMatch[1].toUpperCase(),
      variant: "danger",
      tooltip: "Release flags",
    });
  }

  // Season/Episode
  const seMatch = clean.match(SEASON_RE);
  if (seMatch) {
    tags.push({
      label: `S${seMatch[1]}E${seMatch[2]}`,
      variant: "primary",
      tooltip: "Season / Episode",
    });
  }

  return { tags, year };
}

// ── Language → flag emoji mapping ─────────────────────────────────────────

const LANG_FLAG_MAP: Record<string, string> = {
  EN: "🇬🇧", ES: "🇪🇸", FR: "🇫🇷", DE: "🇩🇪", IT: "🇮🇹",
  PT: "🇵🇹", RU: "🇷🇺", JA: "🇯🇵", KO: "🇰🇷", ZH: "🇨🇳",
  AR: "🇸🇦", NL: "🇳🇱", PL: "🇵🇱", SV: "🇸🇪", DA: "🇩🇰",
  FI: "🇫🇮", NO: "🇳🇴", CS: "🇨🇿", HU: "🇭🇺", RO: "🇷🇴",
  UK: "🇺🇦", EL: "🇬🇷", TR: "🇹🇷", TH: "🇹🇭", VI: "🇻🇳",
  HI: "🇮🇳",
};

/**
 * Adds parsed torrent-name tags to results that don't already have tags.
 * Native plugin tags (e.g. TorrentClaw's TrueSpec scores) are preserved.
 */
export function enrichWithParsedTags(r: TorrentSearchResult): TorrentSearchResult {
  // Skip if the plugin already provided tags
  if (r.tags && r.tags.length > 0) return r;

  const { tags } = parseTorrentName(r.name);
  if (tags.length === 0) return r;

  return { ...r, tags };
}
