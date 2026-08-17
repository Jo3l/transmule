/**
 * Cadena de filtros Cardigann.
 *
 * Los filtros transforman un valor string (extraído de un selector o de un
 * `text:`) paso a paso. Subconjunto de los filtros de Cardigann más usados.
 */
import type { Filter } from "./types";
import { renderTemplate } from "./template.ts";

/** Contexto opcional para filtros que interpolan plantillas (append/prepend). */
export interface FilterContext {
  result?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

/** Renderiza plantillas (`{{ .Config.x }}`, `{{ .Result.x }}`) dentro de un arg. */
function renderArg(arg: unknown, ctx: FilterContext): unknown {
  if (typeof arg === "string" && arg.includes("{{")) {
    return renderTemplate(arg, {
      Config: ctx.config ?? {},
      Result: ctx.result ?? {},
    });
  }
  return arg;
}

function htmlDecode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/** Aplica un único filtro a un valor. */
export function applyFilter(f: Filter, value: string, ctx: FilterContext = {}): string {
  const v = value ?? "";
  // `args` puede venir como array o como string único (Cardigann tolera ambos).
  const rawArgs = f.args ?? [];
  const args = (Array.isArray(rawArgs) ? rawArgs : [rawArgs]).map((a) => renderArg(a, ctx));

  switch (f.name) {
    case "re_replace": {
      const [pattern, replacement] = args as string[];
      if (!pattern) return v;
      try {
        return v.replace(new RegExp(pattern, "g"), replacement ?? "");
      } catch {
        return v;
      }
    }
    case "replace": {
      const [search, replacement] = args as string[];
      return v.split(search ?? "").join(replacement ?? "");
    }
    case "trim":
      return v.trim();
    case "append": {
      const suffix = args[0] != null ? String(args[0]) : "";
      return v + suffix;
    }
    case "prepend": {
      const prefix = args[0] != null ? String(args[0]) : "";
      return prefix + v;
    }
    case "split": {
      const separator = args[0] != null ? String(args[0]) : ",";
      const index = args[1] != null ? Number(args[1]) : 0;
      const parts = v.split(separator);
      return parts[index] ?? "";
    }
    case "urldecode":
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    case "urlencode":
      return encodeURIComponent(v);
    case "html_decode":
    case "htmldecode":
      return htmlDecode(v);
    case "toupper":
      return v.toUpperCase();
    case "tolower":
      return v.toLowerCase();
    case "strip_html":
    case "striphtml":
      return v.replace(/<[^>]+>/g, "");
    case "querystring": {
      // args: [key] — extrae el valor del query string del value (URL)
      const key = args[0] != null ? String(args[0]) : "";
      try {
        const u = new URL(v);
        return u.searchParams.get(key) ?? "";
      } catch {
        return "";
      }
    }
    // ── Fechas: best-effort para v1 (el campo date es cosmético) ──────────
    case "dateparse":
    case "fuzzytime":
    case "timeago":
      return v; // se normaliza a null más tarde en el runner si no es ISO
    default:
      // Filtro no soportado → devolver el valor intacto (tolerante)
      return v;
  }
}

/** Aplica una cadena de filtros. */
export function applyFilters(
  value: string,
  filters: Filter[] | undefined,
  ctx: FilterContext = {},
): string {
  let v = value ?? "";
  if (!filters || filters.length === 0) return v;
  for (const f of filters) v = applyFilter(f, v, ctx);
  return v;
}
