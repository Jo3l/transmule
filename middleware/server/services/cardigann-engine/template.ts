/**
 * Template engine — subconjunto del syntax de Go text/template usado por
 * las definiciones Cardigann de Jackett.
 *
 * Soporta:
 *   - interpolación:  {{ .Keywords }}  {{ .Config.foo }}
 *   - condicionales:  {{ if COND }}…{{ else }}…{{ end }}  (anidables)
 *   - funciones:      and, or, not, eq, ne, lt, le, gt, ge, join, replace, urlencode, urldecode
 *   - constantes:     .True → true, .False → false
 *   - argumentos      entre paréntesis:  and (.A) (eq .B .C)
 */

export interface TemplateData {
  Keywords?: string;
  Config?: Record<string, unknown>;
  Result?: Record<string, unknown>;
  Query?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Truthiness (como Go: false, 0, "", nil, [] vacío, {} vacío son falsey) ──

function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (v === 0 || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === "object" && Object.keys(v as object).length === 0) return false;
  return true;
}

// ─── Tokenizer de expresiones ────────────────────────────────────────────────

type ExprToken =
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "string"; v: string }
  | { t: "number"; v: number }
  | { t: "ident"; v: string };

function tokenizeExpr(src: string): ExprToken[] {
  const toks: ExprToken[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (c === "(") {
      toks.push({ t: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      toks.push({ t: "rparen" });
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      let v = "";
      while (j < src.length && src[j] !== q) {
        if (src[j] === "\\") {
          v += src[j + 1] ?? "";
          j += 2;
        } else {
          v += src[j];
          j++;
        }
      }
      i = j + 1;
      toks.push({ t: "string", v });
      continue;
    }
    if (c === ".") {
      let j = i;
      let v = "";
      while (j < src.length && (src[j] === "." || /[A-Za-z0-9_]/.test(src[j]))) {
        v += src[j];
        j++;
      }
      i = j;
      toks.push({ t: "ident", v });
      continue;
    }
    if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      let v = "";
      if (src[j] === "-") {
        v += src[j];
        j++;
      }
      while (j < src.length && /[0-9.]/.test(src[j])) {
        v += src[j];
        j++;
      }
      i = j;
      toks.push({ t: "number", v: parseFloat(v) });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      let v = "";
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) {
        v += src[j];
        j++;
      }
      i = j;
      toks.push({ t: "ident", v });
      continue;
    }
    i++; // carácter desconocido — saltar
  }
  return toks;
}

// ─── AST de expresión ────────────────────────────────────────────────────────

type Expr =
  | { k: "literal"; v: unknown }
  | { k: "var"; path: string }
  | { k: "call"; fn: string; args: Expr[] };

const FUNCTION_NAMES = new Set([
  "and",
  "or",
  "not",
  "eq",
  "ne",
  "lt",
  "le",
  "gt",
  "ge",
  "join",
  "replace",
  "urlencode",
  "urldecode",
]);

function parseExpression(src: string): Expr {
  const toks = tokenizeExpr(src);
  let pos = 0;

  function parseOperand(): Expr {
    if (pos >= toks.length) throw new Error(`Expresión vacía en: "${src}"`);
    const tok = toks[pos];
    if (tok.t === "lparen") {
      pos++; // (
      const inner = parseOperand();
      if (toks[pos]?.t === "rparen") pos++; // )
      return inner;
    }
    pos++;
    if (tok.t === "string") return { k: "literal", v: tok.v };
    if (tok.t === "number") return { k: "literal", v: tok.v };
    if (tok.t === "ident") {
      const isDot = tok.v.startsWith(".");
      // Identificador sin punto y con más operandos por delante = llamada a función.
      if (!isDot && pos < toks.length) {
        const args: Expr[] = [];
        while (pos < toks.length && toks[pos].t !== "rparen") {
          args.push(parseOperand());
        }
        return { k: "call", fn: tok.v, args };
      }
      return { k: "var", path: tok.v };
    }
    throw new Error(`Token inesperado en: "${src}"`);
  }

  const expr = parseOperand();
  if (pos < toks.length) {
    // Sobrante (p.ej. operando suelto sin función) — evaluar secuencialmente no
    // es soportado; devolvemos lo ya parseado y toleramos el resto.
    return expr;
  }
  return expr;
}

// ─── Evaluador ───────────────────────────────────────────────────────────────

function getPath(data: TemplateData, path: string): unknown {
  // path p.ej. ".Config.foo" | ".Keywords" | ".True"
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return data;
  let cur: unknown = data;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur === "object") cur = (cur as Record<string, unknown>)[p];
    else return undefined;
  }
  return cur;
}

function evaluate(expr: Expr, data: TemplateData): unknown {
  switch (expr.k) {
    case "literal":
      return expr.v;
    case "var": {
      if (expr.path === ".True") return true;
      if (expr.path === ".False") return false;
      return getPath(data, expr.path);
    }
    case "call": {
      const args = expr.args.map((a) => evaluate(a, data));
      return callFunction(expr.fn, args);
    }
  }
}

function callFunction(fn: string, args: unknown[]): unknown {
  switch (fn) {
    case "and": {
      let last: unknown = true;
      for (const a of args) {
        last = a;
        if (!truthy(a)) return a;
      }
      return last;
    }
    case "or": {
      let last: unknown = false;
      for (const a of args) {
        last = a;
        if (truthy(a)) return a;
      }
      return last;
    }
    case "not":
      return !truthy(args[0]);
    case "eq":
      return args.every((a) => a === args[0]);
    case "ne":
      return !args.every((a) => a === args[0]);
    case "lt":
      return (args[0] as number) < (args[1] as number);
    case "le":
      return (args[0] as number) <= (args[1] as number);
    case "gt":
      return (args[0] as number) > (args[1] as number);
    case "ge":
      return (args[0] as number) >= (args[1] as number);
    case "join": {
      const sep = String(args[0] ?? "");
      const arr = args[1];
      return Array.isArray(arr) ? arr.join(sep) : String(arr ?? "");
    }
    case "replace": {
      const [oldStr, newStr, s] = args;
      return String(s ?? "").split(String(oldStr)).join(String(newStr));
    }
    case "urlencode":
      return encodeURIComponent(String(args[0] ?? ""));
    case "urldecode":
      return decodeURIComponent(String(args[0] ?? ""));
    default:
      throw new Error(`Función de plantilla no soportada: ${fn}`);
  }
}

// ─── Parser de plantilla (bloques if/else/end) ──────────────────────────────

type Token = { type: "text"; value: string } | { type: "action"; content: string };

function tokenizeTemplate(tpl: string): Token[] {
  const tokens: Token[] = [];
  const re = /\{\{([\s\S]*?)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl)) !== null) {
    if (m.index > last) tokens.push({ type: "text", value: tpl.slice(last, m.index) });
    tokens.push({ type: "action", content: m[1].trim() });
    last = re.lastIndex;
  }
  if (last < tpl.length) tokens.push({ type: "text", value: tpl.slice(last) });
  return tokens;
}

type Node =
  | { kind: "text"; value: string }
  | { kind: "expr"; expr: Expr }
  | { kind: "if"; cond: Expr; then: Node[]; else: Node[] };

function firstWord(s: string): string {
  const m = /^\s*([A-Za-z]+)/.exec(s);
  return m ? m[1] : "";
}

/** ¿El token es una acción cuya primera palabra es `word`? (type-guard sobre el union) */
function actionWord(tok: Token | undefined, word: string): boolean {
  return !!tok && tok.type === "action" && firstWord(tok.content) === word;
}

function parseNodes(tokens: Token[], idx: { v: number }, stop: Set<string>): Node[] {
  const nodes: Node[] = [];
  while (idx.v < tokens.length) {
    const tok = tokens[idx.v];
    if (tok.type === "text") {
      nodes.push({ kind: "text", value: tok.value });
      idx.v++;
      continue;
    }
    const w = firstWord(tok.content);
    if (stop.has(w)) return nodes; // "else" / "end" — lo consume el llamador
    if (w === "if") {
      const condSrc = tok.content.slice(2).trim();
      const cond = parseExpression(condSrc);
      idx.v++;
      const then = parseNodes(tokens, idx, new Set(["else", "end"]));
      let els: Node[] = [];
      if (actionWord(tokens[idx.v], "else")) {
        idx.v++;
        els = parseNodes(tokens, idx, new Set(["end"]));
      }
      if (actionWord(tokens[idx.v], "end")) {
        idx.v++;
      }
      nodes.push({ kind: "if", cond, then, else: els });
      continue;
    }
    // Expresión simple
    nodes.push({ kind: "expr", expr: parseExpression(tok.content) });
    idx.v++;
  }
  return nodes;
}

function renderNodes(nodes: Node[], data: TemplateData): string {
  let out = "";
  for (const n of nodes) {
    if (n.kind === "text") out += n.value;
    else if (n.kind === "expr") {
      const v = evaluate(n.expr, data);
      out += v === undefined || v === null ? "" : String(v);
    } else if (n.kind === "if") {
      if (truthy(evaluate(n.cond, data))) out += renderNodes(n.then, data);
      else out += renderNodes(n.else, data);
    }
  }
  return out;
}

/** Renderiza una plantilla Cardigann con los datos dados. */
export function renderTemplate(tpl: string, data: TemplateData): string {
  const tokens = tokenizeTemplate(tpl);
  const idx = { v: 0 };
  const nodes = parseNodes(tokens, idx, new Set());
  return renderNodes(nodes, data);
}

/** Evalúa una expresión suelta (para valores de settings/defaults). */
export function evalExpression(src: string, data: TemplateData): unknown {
  return evaluate(parseExpression(src), data);
}
