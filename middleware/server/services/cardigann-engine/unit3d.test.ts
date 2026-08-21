/**
 * Regresión UNIT3D (p.ej. milnueve-api): headers de autenticación, inputs a
 * nivel de `search`, `$raw` (bucle `range`), `rows.attribute` sin `multiple` e
 * índice de array en selectores JSON.
 *
 * Ejecutar: node --experimental-strip-types --no-warnings server/services/cardigann-engine/unit3d.test.ts
 */
import { runSearch } from "./runner.ts";
import { parseDefinition } from "./yaml.ts";
import type { HttpClient } from "./http.ts";

let passed = 0;
let failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
}

const DEF = parseDefinition(`
id: milnueve-api
name: Milnueve (API)
type: private
links:
  - https://tracker.milnueve.cc/
search:
  paths:
    - path: api/torrents/filter
      response:
        type: json
  headers:
    Authorization: ["Bearer {{ .Config.apikey }}"]
  inputs:
    $raw: '{{ range .Categories }}&categories[]={{.}}{{end}}'
    name: "{{ .Keywords }}"
    sortField: "{{ .Config.sort }}"
    perPage: 100
  rows:
    selector: data
    attribute: attributes
  fields:
    title_optional:
      selector: name
    title_filename:
      selector: "files[0].name"
      optional: true
    files:
      selector: num_file
    title:
      text: '{{ if and (.Config.single_file_release_use_filename) (eq .Result.files "1") (.Result.title_filename) }}{{ .Result.title_filename }}{{ else }}{{ .Result.title_optional }}{{ end }} Spanish'
    download:
      selector: download_link
    seeders:
      selector: seeders
    size:
      selector: size
`);

const UNIT3D_JSON = {
  data: [
    {
      type: "torrent",
      id: "1",
      attributes: {
        name: "The Matrix (1999)",
        num_file: 1,
        files: [{ name: "The.Matrix.1999.1080p.mkv" }],
        seeders: 120,
        leechers: 30,
        size: 2147483648,
        download_link: "https://tracker.milnueve.cc/api/torrents/1/download",
      },
    },
  ],
};

let capturedUrl = "";
let capturedInputs: Record<string, string> | undefined;
let capturedHeaders: Record<string, unknown> = {};
const mockHttp = {
  async fetch(url: string, opts: any = {}) {
    if (url.includes("/api/torrents/filter")) {
      capturedUrl = url;
      capturedInputs = opts.inputs;
      capturedHeaders = opts.headers ?? {};
      return { html: "", json: UNIT3D_JSON, status: 200, finalUrl: url };
    }
    return { html: "", json: null, status: 401, finalUrl: url };
  },
} as unknown as HttpClient;

const config = {
  apikey: "test-key",
  single_file_release_use_filename: true,
  sort: "created_at",
};

const results = await runSearch(DEF, config, { keywords: "the matrix" }, 10, mockHttp);

const authRaw = (capturedHeaders["Authorization"] ?? "") as string | string[];
const auth = Array.isArray(authRaw) ? authRaw[0] : authRaw;

ok(auth === "Bearer test-key", "Authorization: Bearer <apikey> enviada");
ok(capturedInputs?.name === "the matrix", "input a nivel de search aplicado (name)");
ok(capturedInputs?.sortField === "created_at", "sortField aplicado");
ok(capturedInputs?.perPage === "100", "input numérico aplicado (perPage)");
ok(capturedInputs !== undefined && !("$raw" in capturedInputs), "$raw separado de los inputs");
ok(!capturedUrl.includes("categories[]="), "$raw vacío sin categorías");
ok(results.length === 1, `1 resultado (obtenido ${results.length})`);
ok(results[0]?.name === "The.Matrix.1999.1080p.mkv Spanish", `título single-file (obtenido "${results[0]?.name}")`);
ok(results[0]?.seeders === 120, "seeders=120");
ok(results[0]?.size === 2147483648, "size correcto");
ok(results[0]?.downloadUrl?.includes("/download"), "downloadUrl resuelto");

// ─── Segundo escenario: con categorías, `$raw` debe renderizar el bucle ─────
capturedUrl = "";
await runSearch(DEF, config, { keywords: "x", categories: [1, 2] }, 10, mockHttp);
ok(
  capturedUrl.includes("categories%5B%5D=1") || capturedUrl.includes("categories[]=1"),
  `$raw con categorías renderiza el bucle range (url: ${capturedUrl})`,
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
