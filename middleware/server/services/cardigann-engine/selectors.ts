/**
 * Selectores — extracción de valores de HTML (cheerio) y de JSON (paths).
 *
 * HTML: los selectores son CSS (con :has(), :contains(), :not(), [attr^=])
 *       aplicados DENTRO del elemento de fila vía `.find()`.
 * JSON:  los selectores son paths con puntos; `..` sube al padre de la fila.
 */
import { load, type CheerioAPI } from "cheerio";

/** Carga HTML en un árbol cheerio. */
export function loadHtml(html: string): CheerioAPI {
  return load(html);
}

/** Extrae texto o atributo del primer elemento que casa con `selector` dentro de `$row`. */
export function selectFromRow(
  $row: ReturnType<CheerioAPI>,
  selector: string,
  attribute?: string,
): string {
  if (!$row || !selector) return "";
  let $el;
  try {
    $el = $row.find(selector).first();
  } catch {
    return "";
  }
  if (!$el || $el.length === 0) return "";
  return attribute ? ($el.attr(attribute) ?? "") : ($el.text() ?? "");
}

/** Cuenta cuántos elementos casan con el selector (para `rows.count`). */
export function countFromHtml($: CheerioAPI, selector: string): number {
  try {
    return $(selector).length;
  } catch {
    return 0;
  }
}

/** Devuelve los elementos de fila para un selector (HTML). */
export function selectRowsHtml($: CheerioAPI, selector: string): ReturnType<CheerioAPI>[] {
  try {
    return $(selector).toArray().map((el) => $(el));
  } catch {
    return [];
  }
}

/** Navega un path JSON. `..` sube al objeto padre (pasado como `parent`). */
export function selectJsonPath(value: unknown, path: string, parent?: unknown): unknown {
  if (value == null && !path.startsWith("..")) return undefined;
  let cur: unknown = value;
  let p = path;
  if (p.startsWith("..")) {
    cur = parent;
    p = p.slice(2);
  }
  if (!p) return cur;
  // Tokeniza el path soportando índices de array (`[0]`) y claves entre corchetes (`["k"]`).
  const parts: string[] = [];
  let buf = "";
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === ".") {
      if (buf) { parts.push(buf); buf = ""; }
      i++;
    } else if (c === "[") {
      if (buf) { parts.push(buf); buf = ""; }
      const close = p.indexOf("]", i);
      if (close < 0) { parts.push(p.slice(i + 1)); break; }
      let key = p.slice(i + 1, close);
      if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1);
      }
      parts.push(key);
      i = close + 1;
    } else {
      buf += c;
      i++;
    }
  }
  if (buf) parts.push(buf);
  for (const part of parts) {
    if (part === "") continue;
    if (cur == null) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
