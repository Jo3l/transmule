/**
 * Tests del runner — ejecuta búsquedas contra definiciones YAML con un
 * cliente HTTP simulado (sin red). Cubre HTML (1337x-like) y JSON (YTS-like).
 *
 * Ejecutar: node --experimental-strip-types --no-warnings server/services/cardigann-engine/runner.test.ts
 */
import { runSearch } from "./runner.ts";
import { parseDefinition } from "./yaml.ts";
import type { HttpClient } from "./http.ts";

let passed = 0;
let failed = 0;

function ok(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

// ─── Definición HTML (estilo 1337x) ──────────────────────────────────────────
const HTML_DEF = parseDefinition(`
id: testhtml
name: Test HTML
type: public
links:
  - https://example.com/
search:
  paths:
    - path: "search/{{ .Keywords }}/1/"
  rows:
    selector: "tr:has(a[href^=\\"/torrent/\\"])"
  fields:
    title:
      selector: td.name a
    download:
      selector: td.name a
      attribute: href
    size:
      selector: td.size
    seeders:
      selector: td.seeds
    leechers:
      selector: td.leech
download:
  selectors:
    - selector: a[href^="magnet:"]
      attribute: href
`);

const SEARCH_HTML = `
<table>
  <tr>
    <td class="name"><a href="/torrent/123/my-show-s01e01/">My.Show.S01E01.1080p</a></td>
    <td class="size">1.5 GB</td>
    <td class="seeds">120</td>
    <td class="leech">30</td>
  </tr>
  <tr>
    <td class="name"><a href="/torrent/456/other-show-s01e01/">Other.Show.S01E01.720p</a></td>
    <td class="size">800 MB</td>
    <td class="seeds">5</td>
    <td class="leech">1</td>
  </tr>
</table>`;

const DETAIL_HTML = `<a href="magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=MyShow">magnet</a>`;

// ─── Definición JSON (estilo YTS) ────────────────────────────────────────────
const JSON_DEF = parseDefinition(`
id: testjson
name: Test JSON
type: public
links:
  - https://api.example.com/
search:
  paths:
    - path: "https://api.example.com/v2/list_movies.json"
      response:
        type: json
  inputs:
    query_term: "{{ .Keywords }}"
    limit: 50
  rows:
    selector: data.movies
    attribute: torrents
    multiple: true
  fields:
    title:
      selector: ..title_long
    infohash:
      selector: hash
    download:
      selector: url
    size:
      selector: size_bytes
    seeders:
      selector: seeds
    leechers:
      selector: peers
`);

const MOVIES_JSON = {
  data: {
    movie_count: 1,
    movies: [
      {
        title_long: "Some Movie (2026)",
        year: 2026,
        torrents: [
          {
            hash: "0123456789abcdef0123456789abcdef01234567",
            url: "https://yts.example/torrent/download/AAA",
            size_bytes: 2147483648,
            seeds: 42,
            peers: 7,
          },
        ],
      },
    ],
  },
};

const mockHttp = {
  async fetch(url: string): Promise<any> {
    if (url.includes("/search/")) return { html: SEARCH_HTML, json: null, status: 200, finalUrl: url };
    if (url.includes("/torrent/")) return { html: DETAIL_HTML, json: null, status: 200, finalUrl: url };
    if (url.includes("list_movies.json")) return { html: "", json: MOVIES_JSON, status: 200, finalUrl: url };
    return { html: "", json: null, status: 404, finalUrl: url };
  },
} as unknown as HttpClient;

// ─── Ejecución ───────────────────────────────────────────────────────────────

const htmlResults = await runSearch(HTML_DEF, {}, { keywords: "My Show" }, 50, mockHttp);
ok(htmlResults.length === 2, `HTML: extrae 2 filas (obtenido ${htmlResults.length})`);
ok(htmlResults[0]?.name === "My.Show.S01E01.1080p", "HTML: título correcto");
ok(htmlResults[0]?.magnet?.startsWith("magnet:?xt=urn:btih:"), "HTML: magnet resuelto de la página de detalle");
ok(htmlResults[0]?.infoHash === "abcdef1234567890abcdef1234567890abcdef12", "HTML: infoHash extraído");
ok(htmlResults[0]?.size === 1610612736, `HTML: tamaño 1.5 GB (obtenido ${htmlResults[0]?.size})`);
ok(htmlResults[0]?.seeders === 120, "HTML: seeders");
ok(htmlResults[0]?.source === "testhtml", "HTML: source = id del indexer");

const jsonResults = await runSearch(JSON_DEF, {}, { keywords: "Some Movie" }, 50, mockHttp);
ok(jsonResults.length === 1, `JSON: extrae 1 fila (obtenido ${jsonResults.length})`);
ok(jsonResults[0]?.name?.includes("Some Movie"), `JSON: título (obtenido "${jsonResults[0]?.name}")`);
ok(jsonResults[0]?.infoHash === "0123456789abcdef0123456789abcdef01234567", "JSON: infohash");
ok(jsonResults[0]?.size === 2147483648, "JSON: size_bytes");
ok(jsonResults[0]?.seeders === 42, "JSON: seeds");
ok(jsonResults[0]?.downloadUrl?.includes("/torrent/download/"), "JSON: downloadUrl (.torrent directo)");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
