/**
 * Shared torrent/ED2K file name parser.
 * Extracts quality, codec, audio, HDR, languages and release flags from
 * file names. Used by aMule search (client-side) and torrent search (server-side).
 *
 * Pure functions — no Vue dependencies, safe to import anywhere.
 */

const QUALITY_RE = /\b(2160p|4[kK]|1080p|720p|480p|360p|240p)\b/;
const SOURCE_RE = /\b(BLURAY|BluRay|WEB[-.]DL|WEB[-.]Rip|WEB|HDRip|BRRip|DVDRip|DVD[Rr]ip|BDRip|HDTV|PDTV|DSR|SAT[Rr]ip|CAM|TS|TC|R5)\b/i;
const CODEC_RE = /\b(x265|x264|h\.?265|h\.?264|HEVC|AV1|DivX|XviD|AVC|MPEG-?4|MPEG-?2)\b/i;
const HDR_RE = /\b(DV|DOVI|DoVi|Dolby[\s._-]?Vision|HDR10\+?|HDR|HLG)\b/i;
const AUDIO_CODEC_RE = /\b(TrueHD|DTS[\s._-]?HD|DTS|AC3|EAC3|AAC|FLAC|MP3|OPUS|Vorbis|PCM|LPCM)\b/i;
const AUDIO_CH_RE = /(\d)[.\s_](\d)\s*CH/i;
const PROPER_RE = /\b(PROPER|REPACK|REMASTERED|EXTENDED|DIRECTORS?\s*CUT|UNCUT|UNRATED|IMAX)\b/i;
const SEASON_RE = /\b[Ss](\d{2})[Ee](\d{2})\b/;

const LANG_FLAG_MAP: Record<string, string> = {
  EN: "🇬🇧", ES: "🇪🇸", FR: "🇫🇷", DE: "🇩🇪", IT: "🇮🇹",
  PT: "🇵🇹", RU: "🇷🇺", JA: "🇯🇵", KO: "🇰🇷", ZH: "🇨🇳",
  AR: "🇸🇦", NL: "🇳🇱", PL: "🇵🇱", SV: "🇸🇪", DA: "🇩🇰",
  FI: "🇫🇮", NO: "🇳🇴", CS: "🇨🇿", HU: "🇭🇺", RO: "🇷🇴",
  UK: "🇺🇦", EL: "🇬🇷", TR: "🇹🇷", TH: "🇹🇭", VI: "🇻🇳",
  HI: "🇮🇳",
};

export interface NameTag {
  label: string;
  variant?: string;
  icon?: string;
  tooltip?: string;
}

/**
 * Parse a torrent / ED2K file name and return decorative tags.
 */
export function parseTorrentName(name: string): NameTag[] {
  const tags: NameTag[] = [];
  const clean = name.replace(/[._]/g, " ").trim();

  const qual = clean.match(QUALITY_RE);
  if (qual) tags.push({ label: qual[1].toUpperCase(), variant: "warning", tooltip: "Resolution" });

  const hdr = clean.match(HDR_RE);
  if (hdr) tags.push({ label: hdr[1].toUpperCase(), variant: "warning", tooltip: "HDR" });

  const src = clean.match(SOURCE_RE);
  if (src) tags.push({ label: src[1].toUpperCase(), variant: "info", tooltip: "Source" });

  const codec = clean.match(CODEC_RE);
  if (codec) tags.push({ label: codec[1].toLowerCase(), variant: "info", tooltip: "Codec" });

  const audio = clean.match(AUDIO_CODEC_RE);
  if (audio) {
    let label = audio[1].toUpperCase();
    const ch = clean.match(AUDIO_CH_RE);
    if (ch) label += ` ${ch[1]}.${ch[2]}`;
    tags.push({ label, variant: "accent", tooltip: "Audio" });
  }

  // Languages (2-3 letter ISO codes before dash or space)
  const langRe = clean.match(/\b((?:EN|ES|FR|DE|IT|PT|RU|JA|KO|ZH|AR|NL|PL|SV|DA|NO|FI|CS|HU|RO|UK|EL|TR|TH|VI|HI)[-/. ](?:EN|ES|FR|DE|IT|PT|RU|JA|KO|ZH|AR|NL|PL|SV|DA|NO|FI|CS|HU|RO|UK|EL|TR|TH|VI|HI)*)\b/);
  if (langRe) {
    const seen = new Set<string>();
    for (const c of langRe[1].split(/[-/. ]+/)) {
      const u = c.toUpperCase();
      if (seen.has(u) || u.length > 3) continue;
      seen.add(u);
      const flag = LANG_FLAG_MAP[u];
      tags.push({ label: flag ? `${flag} ${u}` : u, variant: "default", tooltip: `Language: ${u}` });
    }
  }

  const proper = clean.match(PROPER_RE);
  if (proper) tags.push({ label: proper[1].toUpperCase(), variant: "danger", tooltip: "Release flags" });

  const se = clean.match(SEASON_RE);
  if (se) tags.push({ label: `S${se[1]}E${se[2]}`, variant: "primary", tooltip: "Season/Episode" });

  return tags;
}

/**
 * Add parsed tags to a search result row from its name field.
 * Skips rows that already have tags.
 */
export function enrichWithNameTags<T extends { name?: string; tags?: NameTag[] }>(file: T): T {
  if (file.tags?.length) return file;
  const tags = parseTorrentName(file.name ?? "");
  return tags.length ? { ...file, tags } : file;
}
