/**
 * Runner — orquesta una búsqueda completa contra un indexer definido por YAML.
 *
 * Flujo: render paths → login (si privado) → fetch (HTML o JSON) → extraer
 * filas → extraer campos → resolver download (magnet / página detalle / .torrent)
 * → componer TorrentSearchResult[].
 */
import type { IndexerDefinition, IndexerConfig, SearchQuery } from "./types";
import type { TorrentSearchResult } from "../../providers/types";
import { renderTemplate, type TemplateData } from "./template.ts";
import { applyFilters } from "./filters.ts";
import { loadHtml, selectFromRow, selectRowsHtml, selectJsonPath } from "./selectors.ts";
import { HttpClient } from "./http.ts";

// ─── Helpers de datos ────────────────────────────────────────────────────────

function buildQueryData(query: SearchQuery): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  const imdb = query.imdbId ?? "";
  if (imdb) {
    q.IMDBID = imdb;
    q.IMDBIDShort = imdb.replace(/^tt/i, "");
  }
  if (query.tvdbId) q.TVDBID = query.tvdbId;
  if (query.tmdbId) q.TMDBID = query.tmdbId;
  if (query.season != null) q.Season = query.season;
  if (query.episode != null) q.Ep = query.episode;
  if (query.keywords) q.Keywords = query.keywords;
  return q;
}

function renderInputs(
  inputs: Record<string, string> | undefined,
  tpl: TemplateData,
): { inputs?: Record<string, string>; raw: string } {
  if (!inputs) return { inputs: undefined, raw: "" };
  const out: Record<string, string> = {};
  let raw = "";
  for (const [k, v] of Object.entries(inputs)) {
    const rendered = renderTemplate(String(v), tpl);
    // `$raw` es un fragmento de query string que Jackett añade tal cual (p.ej.
    // el bucle `{{ range .Categories }}&categories[]={{.}}{{end}}` de UNIT3D).
    if (k === "$raw") raw += rendered;
    else out[k] = rendered;
  }
  return { inputs: Object.keys(out).length ? out : undefined, raw };
}

function renderHeaders(
  headers: Record<string, string | string[]> | undefined,
  tpl: TemplateData,
): Record<string, string[]> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string[]> = {};
  for (const [name, raw] of Object.entries(headers)) {
    const vals = (Array.isArray(raw) ? raw : [raw])
      .map((v) => renderTemplate(String(v), tpl))
      .filter((v) => v !== "");
    if (vals.length) out[name] = vals;
  }
  return Object.keys(out).length ? out : undefined;
}

function extractInfoHash(magnet: string): string {
  const m = magnet.match(/xt=urn:btih:([0-9a-fA-F]{40}|[A-Z2-7]{32})/i);
  return m ? m[1].toLowerCase() : "";
}

function buildMagnet(infoHash: string): string {
  return infoHash ? `magnet:?xt=urn:btih:${infoHash}` : "";
}

function parseSize(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  const s = String(v).trim();
  const m = s.match(/^([\d.,]+)\s*(B|KB|KiB|MB|MiB|GB|GiB|TB|TiB)$/i);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  const n = parseFloat(m[1].replace(",", ""));
  // Los trackers reportan tamaños binarios (KiB/MiB/GiB), aunque etiqueten "KB/MB/GB".
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    kib: 1024,
    mb: 1048576,
    mib: 1048576,
    gb: 1073741824,
    gib: 1073741824,
    tb: 1099511627776,
    tib: 1099511627776,
  };
  return Math.round(n * (units[m[2].toLowerCase()] || 1));
}

function normalizeDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return s;
}

// ─── Extractores de fila ─────────────────────────────────────────────────────

type RowExtractor = (selector: string, attribute?: string) => string;

function makeHtmlExtractor($row: any): RowExtractor {
  return (selector, attribute) => selectFromRow($row, selector, attribute);
}

function makeJsonExtractor(value: unknown, parent: unknown): RowExtractor {
  return (selector, attribute) => {
    let v = selectJsonPath(value, selector, parent);
    if (attribute && v != null && typeof v === "object") {
      v = (v as Record<string, unknown>)[attribute];
    }
    if (v == null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
}

// ─── Extracción de campos ────────────────────────────────────────────────────

function extractFields(
  def: IndexerDefinition,
  extractor: RowExtractor,
  tpl: TemplateData,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(def.search?.fields ?? {})) {
    let value: unknown = "";
    if (field.text !== undefined && field.text !== null) {
      value = renderTemplate(String(field.text), { ...tpl, Result: result });
    } else if (field.selector) {
      value = extractor(field.selector, field.attribute);
    }

    // case mapping (sobre el valor crudo, antes de filtros)
    if (field.case && value !== "" && value != null) {
      const k = String(value);
      const mapped = field.case[k] !== undefined ? field.case[k] : field.case["*"];
      if (mapped !== undefined) value = mapped;
    }

    // filtros
    if (typeof value === "string") {
      value = applyFilters(value, field.filters, {
        result,
        config: tpl.Config as Record<string, unknown>,
      });
    }

    // default (si el resultado quedó vacío)
    if ((value === "" || value == null) && field.default !== undefined && field.default !== null) {
      value =
        typeof field.default === "string"
          ? renderTemplate(field.default, { ...tpl, Result: result })
          : field.default;
    }

    result[name] = value;
  }
  return result;
}

// ─── Resolución de download ──────────────────────────────────────────────────

async function resolveDownload(
  def: IndexerDefinition,
  result: Record<string, unknown>,
  baseUrl: string,
  tpl: TemplateData,
  http: HttpClient,
): Promise<{ magnet: string; infoHash: string; downloadUrl?: string }> {
  const dl = String(result.download ?? "").trim();
  let infoHash = String(result.infohash ?? "").toLowerCase();

  if (dl.startsWith("magnet:")) {
    return { magnet: dl, infoHash: infoHash || extractInfoHash(dl) };
  }

  if (!dl) {
    return { magnet: buildMagnet(infoHash), infoHash };
  }

  const url = dl.startsWith("http") ? dl : new URL(dl, baseUrl).toString();

  // Si la definición declara selectores de download → el valor es una página de detalle
  if (def.download?.selectors?.length) {
    try {
      const page = await http.fetch(url, { responseType: "html" });
      const $ = loadHtml(page.html);
      for (const sel of def.download.selectors) {
        const selector = renderTemplate(sel.selector, tpl);
        let val = "";
        try {
          // Sin attribute → text(); con attribute → attr() (attr("") devuelve {} y
          // nunca caería al text()).
          val = sel.attribute
            ? ($(selector).first().attr(sel.attribute) ?? "")
            : ($(selector).first().text() ?? "");
        } catch {
          val = "";
        }
        if (!val) continue;
        const v = applyFilters(val, sel.filters, { config: tpl.Config as Record<string, unknown> });
        if (v.startsWith("magnet:")) return { magnet: v, infoHash: infoHash || extractInfoHash(v) };
        if (v.startsWith("http")) return { magnet: buildMagnet(infoHash), infoHash, downloadUrl: v };
        // Infohash plano (40 hex) en la página de detalle (p.ej. AudioBookBay) →
        // construir el magnet a partir de él.
        const bareHash = v.trim().toLowerCase();
        if (/^[0-9a-f]{40}$/.test(bareHash)) infoHash = bareHash;
      }
      if (infoHash) return { magnet: buildMagnet(infoHash), infoHash };
    } catch {
      // la página de detalle falló — seguimos con lo que tengamos
    }
    return { magnet: buildMagnet(infoHash), infoHash };
  }

  // URL de .torrent directa
  return { magnet: buildMagnet(infoHash), infoHash, downloadUrl: url };
}

// ─── Composición de resultados ───────────────────────────────────────────────

async function composeResult(
  def: IndexerDefinition,
  result: Record<string, unknown>,
  baseUrl: string,
  tpl: TemplateData,
  http: HttpClient,
): Promise<TorrentSearchResult | null> {
  const title = String(result.title ?? "").trim();
  if (!title) return null;

  const { magnet, infoHash, downloadUrl } = await resolveDownload(def, result, baseUrl, tpl, http);

  return {
    name: title,
    magnet,
    infoHash,
    size: parseSize(result.size),
    seeders: parseInt(String(result.seeders ?? "0"), 10) || 0,
    leechers: parseInt(String(result.leechers ?? "0"), 10) || 0,
    uploadedAt: normalizeDate(result.date),
    source: def.id,
    category: result.category != null ? String(result.category) : null,
    downloadUrl: downloadUrl || undefined,
  };
}

// ─── Extracción HTML / JSON ──────────────────────────────────────────────────

async function extractHtmlResults(
  def: IndexerDefinition,
  html: string,
  baseUrl: string,
  tpl: TemplateData,
  http: HttpClient,
  limit: number,
): Promise<TorrentSearchResult[]> {
  const $ = loadHtml(html);
  const rowSelector = renderTemplate(def.search?.rows.selector ?? "", tpl);
  const rows = selectRowsHtml($, rowSelector);
  const out: TorrentSearchResult[] = [];
  for (const $row of rows) {
    if (out.length >= limit) break;
    const result = extractFields(def, makeHtmlExtractor($row), tpl);
    const res = await composeResult(def, result, baseUrl, tpl, http);
    if (res) out.push(res);
  }
  return out;
}

async function extractJsonResults(
  def: IndexerDefinition,
  json: unknown,
  baseUrl: string,
  tpl: TemplateData,
  http: HttpClient,
  limit: number,
): Promise<TorrentSearchResult[]> {
  const rowSelector = renderTemplate(def.search?.rows.selector ?? "", tpl);
  let containers = selectJsonPath(json, rowSelector);
  // Algunas APIs devuelven un OBJETO en vez de array en la raíz o en la fila
  // (p.ej. SubsPlease dict por página, GGn response keyed by groupId).
  // Si el selector apunta a un objeto plano, iteramos sus valores.
  if (!Array.isArray(containers) && containers != null && typeof containers === "object") {
    containers = Object.values(containers as Record<string, unknown>);
  }
  if (!Array.isArray(containers)) return [];

  const attribute = def.search?.rows.attribute;
  const multiple = def.search?.rows.multiple === true;
  const out: TorrentSearchResult[] = [];

  for (const container of containers) {
    if (out.length >= limit) break;
    if (multiple && attribute) {
      let items = (container as Record<string, unknown>)?.[attribute];
      // Algunas APIs (p.ej. GGn) devuelven el nivel anidado como OBJETO
      // keyed por id en vez de array → iteramos sus valores.
      if (!Array.isArray(items) && items != null && typeof items === "object") {
        items = Object.values(items as Record<string, unknown>);
      }
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (out.length >= limit) break;
        const result = extractFields(def, makeJsonExtractor(item, container), tpl);
        const res = await composeResult(def, result, baseUrl, tpl, http);
        if (res) out.push(res);
      }
    } else {
      // `attribute` sin `multiple`: los campos viven bajo `row[attribute]`
      // (p.ej. UNIT3D devuelve cada torrent con sus datos bajo `attributes`).
      const base = attribute
        ? (container as Record<string, unknown>)?.[attribute]
        : container;
      if (base == null) continue;
      const result = extractFields(def, makeJsonExtractor(base, container), tpl);
      const res = await composeResult(def, result, baseUrl, tpl, http);
      if (res) out.push(res);
    }
  }
  return out;
}

// ─── Login (indexers privados) ───────────────────────────────────────────────

async function doLogin(
  def: IndexerDefinition,
  tpl: TemplateData,
  baseUrl: string,
  http: HttpClient,
): Promise<void> {
  const login = def.login;
  if (!login?.path) return;
  const path = renderTemplate(login.path, tpl);
  if (!path) return;
  const url = path.startsWith("http") ? path : new URL(path, baseUrl).toString();
  const { inputs } = renderInputs(login.inputs, tpl);
  const headers = renderHeaders(login.headers, tpl);
  try {
    const wantsToken = !!login.response?.tokenPath;
    const page = await http.fetch(url, {
      method: login.method ?? "POST",
      inputs,
      headers,
      responseType: wantsToken ? "json" : "html",
    });
    // Login JSON con token (p.ej. AvistaZ: POST /auth → {token}): extraer
    // el token y exponerlo como {{ .Token }} para paths/headers del search.
    if (wantsToken && page.json != null) {
      const token = selectJsonPath(page.json, login.response!.tokenPath!);
      if (token != null && token !== "") tpl.Token = String(token);
    }
  } catch {
    // login fallido se tolera: la búsqueda posterior puede devolver vacío
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Ejecuta una búsqueda contra un indexer.
 * @param def        definición parseada del YAML
 * @param config     configuración del usuario (valores del bloque `settings:`)
 * @param query      términos de búsqueda
 * @param limit      máx resultados
 * @param http       cliente HTTP (inyectable para tests)
 */
export async function runSearch(
  def: IndexerDefinition,
  config: IndexerConfig,
  query: SearchQuery,
  limit = 50,
  http: HttpClient = new HttpClient(),
): Promise<TorrentSearchResult[]> {
  const results: TorrentSearchResult[] = [];

  // keywordsfilters sobre el término
  let keywords = query.keywords;
  if (def.search?.keywordsfilters?.length) {
    keywords = applyFilters(keywords, def.search.keywordsfilters, { config });
  }

  const tpl: TemplateData = {
    Keywords: keywords,
    Config: { ...config, sitelink: def.links?.[0] ?? "" },
    Query: buildQueryData(query),
    Categories: query.categories ?? [],
  };

  const baseUrl = String(config.baseUrl || config.sitelink || def.links?.[0] || "");

  await doLogin(def, tpl, baseUrl, http);

  const searchHeaders = renderHeaders(def.search?.headers, tpl);

  for (const sp of def.search?.paths ?? []) {
    if (results.length >= limit) break;
    const path = renderTemplate(sp.path, tpl);
    if (!path) continue;
    let fullUrl = path.startsWith("http") ? path : new URL(path, baseUrl).toString();
    const responseType = sp.response?.type ?? "html";
    const mergedInputs = { ...(def.search?.inputs ?? {}), ...(sp.inputs ?? {}) };
    const { inputs, raw } = renderInputs(
      Object.keys(mergedInputs).length ? mergedInputs : undefined,
      tpl,
    );
    const rawQuery = raw.replace(/^&+/, "");
    if (rawQuery) fullUrl += (fullUrl.includes("?") ? "&" : "?") + rawQuery;
    const pathHeaders = renderHeaders(sp.headers, tpl);
    const headers = searchHeaders
      ? { ...searchHeaders, ...(pathHeaders ?? {}) }
      : pathHeaders;

    let page;
    try {
      page = await http.fetch(fullUrl, { method: sp.method ?? "GET", responseType, inputs, headers });
    } catch {
      continue;
    }

    if (responseType === "json" && page.json != null) {
      const extra = await extractJsonResults(def, page.json, fullUrl, tpl, http, limit - results.length);
      results.push(...extra);
    } else {
      const extra = await extractHtmlResults(def, page.html, fullUrl, tpl, http, limit - results.length);
      results.push(...extra);
    }
  }

  return results;
}
