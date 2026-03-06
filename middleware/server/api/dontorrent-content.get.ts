const BASE_ORIGIN = "https://www21.dontorrent.link";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept: "text/html",
};

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&oacute;/g, "ó")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&uacute;/g, "ú")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&uuml;/g, "ü")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Extract the text content after a bold label like <b class="bold">Label:</b>
 * Handles values that may contain inline <a> tags (year, director, actors).
 */
function extractField(html: string, label: string): string {
  // Matches: <b ...>Label:</b> ...content... until </p> or <br> or next <b>
  const re = new RegExp(
    `<b[^>]*>\\s*${label}[:\\s]*<\\/b>\\s*([\\s\\S]*?)(?=<\\/p>|<p|<br|<b[^>]*>bold|$)`,
    "i",
  );
  const m = re.exec(html);
  return m ? stripTags(m[1]) : "";
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const _cache = new Map<string, { ts: number; data: object }>();

interface Episode {
  code: string;
  torrentUrl: string;
  date: string;
}

function parseSeriesPage(html: string) {
  // Cover
  const coverMatch =
    /img[^>]+src=["'](https?:\/\/(?:images\.weserv\.nl|[^"']*cdnbeta[^"']*|[^"']*imagenes\/series[^"']*))["']/i.exec(
      html,
    );
  const cover = coverMatch?.[1] ?? "";

  // Format / episodios count
  const fmtMatch = /Formato[:\s]+([A-Z0-9][A-Z0-9\-_.]*(?:\s[A-Z0-9][A-Z0-9\-_.]*)*)/i.exec(html);
  const format = fmtMatch ? fmtMatch[1].trim() : "";

  const epCountMatch = /Episodios[:\s]+(\d+)/i.exec(html);
  const epCount = epCountMatch ? epCountMatch[1] : "";

  // Description — try <p class="text-justify"> first (actual markup), fallback to label search
  let description = "";
  const textJustifyMatch = /<p[^>]*class=["'][^"']*text-justify[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (textJustifyMatch) {
    description = stripTags(textJustifyMatch[1]).trim();
  } else {
    const descLabelMatch = /Descripci[oó]n[:\s]*(?:<[^>]+>)?\s*([\s\S]{10,400}?)(?=\n\n|\||\[\s*M)/i.exec(html);
    if (descLabelMatch) description = stripTags(descLabelMatch[1]).trim();
  }

  // Episodes — same logic as:
  //   links.filter(a => a.href.endsWith('.torrent') || a.href.startsWith('magnet:?') ||
  //                     a.href.includes('torrent/file=') || a.href.includes('torrent/download='))
  // Find each torrent <a> tag, then grab episode code and date from surrounding row context.
  const episodes: Episode[] = [];
  const linkRe =
    /<a\s[^>]*\bhref=["']((?:magnet:\?[^"']+|(?:https?:)?\/\/[^"']+\.torrent|[^"']*torrent\/(?:file|download)=[^"']*))["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const rawUrl = m[1];
    const torrentUrl = rawUrl.startsWith("//") ? "https:" + rawUrl : rawUrl;
    const pos = m.index;

    // Episode code: look back up to 400 chars for NxNN inside a <td>
    const before = html.slice(Math.max(0, pos - 400), pos);
    const codeMatch = /(\d+x\d+)\s*<\/td>\s*$/.exec(before) ??
                      /(\d+x\d+)/.exec(before.slice(-100));
    if (!codeMatch) continue;
    const code = codeMatch[1];

    // Date: look forward up to 400 chars for YYYY-MM-DD inside a <td>
    const after = html.slice(pos + m[0].length, pos + m[0].length + 400);
    const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(after);
    const date = dateMatch?.[1] ?? "";

    episodes.push({ code, torrentUrl, date });
  }

  return {
    cover,
    torrentUrl: episodes[0]?.torrentUrl ?? "",
    year: "",
    genre: "",
    director: "",
    actors: "",
    format,
    size: epCount ? `${epCount} ep.` : "",
    description,
    episodes,
    isSeries: true,
  };
}

export default defineEventHandler(async (event) => {
  requireUser(event);

  const query = getQuery(event);
  const movieUrl = query.url as string;

  if (!movieUrl || (!movieUrl.includes("/pelicula/") && !movieUrl.includes("/serie/"))) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid URL",
    });
  }

  const cached = _cache.get(movieUrl);
  if (cached && Date.now() - cached.ts < SIX_HOURS_MS) {
    return cached.data;
  }

  const isSeries = movieUrl.includes("/serie/");

  let html: string;
  try {
    const res = await fetch(movieUrl, { headers: FETCH_HEADERS });
    if (!res.ok) {
      throw createError({
        statusCode: res.status,
        statusMessage: `DonTorrent error: ${res.status}`,
      });
    }
    html = await res.text();
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 502,
      statusMessage: err.message || "Failed to fetch page",
    });
  }

  if (isSeries) {
    const result = parseSeriesPage(html);
    _cache.set(movieUrl, { ts: Date.now(), data: result });
    return result;
  }

  // Cover image — weserv.nl CDN proxy
  const coverMatch =
    /img[^>]+src=["'](https?:\/\/(?:images\.weserv\.nl|[^"']*cdnbeta[^"']*|[^"']*imagenes\/peliculas[^"']*))["']/i.exec(
      html,
    );
  const cover = coverMatch?.[1] ?? "";

  // Torrent download link — href may be protocol-relative (//host/path)
  const torrentMatch =
    /href=["']((?:https?:)?\/\/[^"']*\.torrent[^"']*)["']/i.exec(html);
  let torrentUrl = "";
  if (torrentMatch) {
    const raw = torrentMatch[1];
    torrentUrl = raw.startsWith("//") ? "https:" + raw : raw;
  }

  // Meta fields — each wrapped as <b class="bold">Label:</b> value (may contain <a> links)
  const year = extractField(html, "A[ñn]o");
  const genre = extractField(html, "G[eé]nero");
  const director = extractField(html, "Director");
  const actors = extractField(html, "Actores");
  const format = extractField(html, "Formato");
  const size = extractField(html, "Tama[ñn]o");

  // Description — after <b class="bold">Descripción:</b> until </p>
  const descMatch =
    /<b[^>]*>Descripci[oó]n[:\s]*<\/b>\s*([\s\S]*?)(?:<\/p>|<a\s+href="\/descargar)/i.exec(
      html,
    );
  const description = descMatch ? stripTags(descMatch[1]) : "";

  const result = {
    cover,
    torrentUrl,
    year,
    genre,
    director,
    actors,
    format,
    size,
    description,
  };
  _cache.set(movieUrl, { ts: Date.now(), data: result });
  return result;
});
