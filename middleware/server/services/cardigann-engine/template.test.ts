/**
 * Tests del motor de plantillas (Go text/template subset para Cardigann).
 * Ejecutar: node --experimental-strip-types --no-warnings server/services/cardigann-engine/template.test.ts
 */
import { renderTemplate, evalExpression } from "./template.ts";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}\n      esperado: ${JSON.stringify(expected)}\n      obtenido: ${JSON.stringify(actual)}`);
  }
}

// ── Interpolación simple ────────────────────────────────────────────────────
eq(renderTemplate("{{ .Keywords }}", { Keywords: "Silo" }), "Silo", "interpola .Keywords");
eq(renderTemplate("{{ .Config.foo }}", { Config: { foo: "bar" } }), "bar", "interpola .Config.foo");

// ── Condicional if/else ─────────────────────────────────────────────────────
eq(
  renderTemplate("{{ if .Keywords }}search/{{ .Keywords }}{{ else }}cat/Movies{{ end }}", { Keywords: "Silo" }),
  "search/Silo",
  "if .Keywords verdadero",
);
eq(
  renderTemplate("{{ if .Keywords }}search/{{ .Keywords }}{{ else }}cat/Movies{{ end }}", { Keywords: "" }),
  "cat/Movies",
  "if .Keywords falso (vacío) → else",
);

// ── Funciones lógicas ───────────────────────────────────────────────────────
eq(evalExpression("and (.Keywords) (eq .Config.disablesort .False)", { Keywords: "x", Config: { disablesort: false } }), true, "and + eq (.False)");
eq(evalExpression("or .Result.a .Result.b", { Result: { a: "", b: "B" } }), "B", "or devuelve el primer truthy");
eq(evalExpression("eq .Config.sort .False", { Config: { sort: "time" } }), false, "eq string vs .False");

// ── Plantilla real de 1337x (path con ifs anidados) ─────────────────────────
const tpl1337x =
  "{{ if and (.Keywords) (eq .Config.disablesort .False) }}sort-{{ else }}{{ end }}{{ if .Keywords }}search/{{ .Keywords }}{{ else }}cat/Movies{{ end }}{{ if and (.Keywords) (eq .Config.disablesort .False) }}/{{ .Config.sort }}/{{ .Config.type }}{{ else }}{{ end }}/1/";
eq(
  renderTemplate(tpl1337x, { Keywords: "Silo", Config: { disablesort: false, sort: "time", type: "desc" } }),
  "sort-search/Silo/time/desc/1/",
  "1337x path con keyword + sort",
);
eq(
  renderTemplate(tpl1337x, { Keywords: "", Config: { disablesort: false, sort: "time", type: "desc" } }),
  "cat/Movies/1/",
  "1337x path sin keyword → browse cat/Movies",
);

// ── Plantilla real de YTS (title con funciones anidadas) ────────────────────
eq(
  renderTemplate("{{ if eq .Result._type \"web\" }}WEBRip{{ else }}BRRip{{ end }}", { Result: { _type: "web" } }),
  "WEBRip",
  "yts title if/else con string",
);
eq(
  renderTemplate("{{ if eq .Result._type \"web\" }}WEBRip{{ else }}BRRip{{ end }}", { Result: { _type: "bluray" } }),
  "BRRip",
  "yts title if/else con else",
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
