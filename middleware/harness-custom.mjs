/**
 * Harness de verificación de definiciones custom (indexerr/definitions).
 * Parsea cada YAML con el motor real y ejecuta runSearch con un cliente
 * HTTP simulado (sin red), validando título, tamaño, seeders y download.
 *
 * Ejecutar: node --experimental-strip-types --no-warnings harness-custom.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDefinition } from "./server/services/cardigann-engine/yaml.ts";
import { runSearch } from "./server/services/cardigann-engine/runner.ts";

const DIR = "/home/jo3l/www/transmule-plugins/indexerr/definitions";
let passed = 0;
let failed = 0;

function ok(cond, label) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
}

// HTTP simulado: responde según la URL pedida.
function mockHttp(responses) {
  return {
    async fetch(url, opts = {}) {
      for (const [match, res] of responses) {
        if (url.includes(match)) {
          return { html: res.html ?? "", json: res.json ?? null, status: 200, finalUrl: url };
        }
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

const GAZELLE_JSON = {
  response: {
    results: [
      {
        groupId: 10, groupName: "Artist Name", artist: "Artist Name", groupYear: "2024",
        releaseType: "Album", torrents: [
          {
            torrentId: 1001, size: 734003200, seeders: 42, leechers: 3, time: "2024-05-01 10:00:00",
            releaseName: "Artist.Name.2024.FLAC", media: "CD",
            codec: "FLAC", source: "CD", resolution: "", container: "", processing: "",
          },
        ],
      },
    ],
  },
};

const SECRET_JSON = {
  response: {
    results: [
      {
        groupId: 20, groupName: "Rare Movie", groupYear: "1979", artist: "", releaseType: "Movie",
        torrents: [
          {
            torrentId: 2001, size: 4294967296, seeders: 12, leechers: 1, time: "2024-06-01 12:00:00",
            releaseName: "Rare.Movie.1979.1080p.BluRay.x264", media: "1080p",
          },
        ],
      },
    ],
  },
};

const GPW_JSON = {
  response: {
    results: [
      {
        groupId: 30, groupName: "Chinese Movie", groupSubName: "sub", groupYear: "2023",
        artist: "", releaseType: "Movie", doubanId: "12345", imdbId: "tt1234567",
        torrents: [
          {
            torrentId: 3001, size: 5368709120, seeders: 8, leechers: 2, time: "2024-07-01 00:00:00",
            codec: "x264", source: "BluRay", resolution: "1080p", container: "mkv", processing: "",
          },
        ],
      },
    ],
  },
};

// ─── Avistaz (API JSON con token) ─────────────────────────────────────────────
function avistazMock() {
  let authHeader = "";
  let body = "";
  let json = false;
  return {
    get lastAuthHeader() { return authHeader; },
    get authBodySeen() { return body; },
    get authJsonBody() { return json; },
    async fetch(url, opts = {}) {
      if (url.includes("/api/v1/jackett/auth")) {
        // El runner no serializa: pasa inputs + Content-Type; la serialización
        // JSON ocurre dentro de HttpClient. Verificamos ambos.
        const ct = opts.headers?.["Content-Type"]?.join?.(`,`) ?? String(opts.headers?.["Content-Type"] ?? "");
        body = JSON.stringify(opts.inputs ?? {});
        json = ct.includes("json");
        return { html: "", json: { token: "tok-12345", message: "ok" }, status: 200, finalUrl: url };
      }
      if (url.includes("/api/v1/jackett/torrents")) {
        authHeader = opts.headers?.["Authorization"]?.join?.(`,`) ?? String(opts.headers?.["Authorization"] ?? "");
        return {
          html: "",
          json: {
            data: [
              {
                file_name: "Asian.Movie.2024.1080p.WEB-DL.mkv",
                release_title: "Asian Movie (2024) [1080p]",
                info_hash: "aa11bb22cc33dd44ee55ff667788990011223344",
                seed: 15, leech: 2, file_size: 3145728000,
                created_at_iso: "2024-08-01T10:00:00Z",
                download: "https://avistaz.to/rss/download/abc123.torrent",
                video_quality: "1080p", type: "MOVIE",
              },
            ],
          },
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── SpeedApp (array raíz, token Bearer) ──────────────────────────────────────
function speedAppMock() {
  let authHeader = "";
  let body = "";
  let json = false;
  return {
    get lastAuthHeader() { return authHeader; },
    get authBodySeen() { return body; },
    get authJsonBody() { return json; },
    async fetch(url, opts = {}) {
      if (url.includes("/api/login")) {
        const ct = opts.headers?.["Content-Type"]?.join?.(`,`) ?? String(opts.headers?.["Content-Type"] ?? "");
        body = JSON.stringify(opts.inputs ?? {});
        json = ct.includes("json");
        return { html: "", json: { token: "tok-speed" }, status: 200, finalUrl: url };
      }
      if (url.includes("/api/torrent")) {
        authHeader = opts.headers?.["Authorization"]?.join?.(`,`) ?? String(opts.headers?.["Authorization"] ?? "");
        return {
          html: "",
          json: [
            {
              id: "sa-77", name: "[REQUEST] My.Movie.2024.1080p.", size: 2097152000,
              seeders: 9, leechers: 1, times_completed: 30,
              created_at: "2024-09-01T08:00:00Z", category: { id: "8" },
              short_description: "Action", poster: "https://example.com/p.jpg",
            },
          ],
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── Brasileños (HTML lista → detalle → magnet) ──────────────────────────────
function brazilianMock(rowHtml, detailHtml) {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("index.php")) return { html: rowHtml, json: null, status: 200, finalUrl: url };
      if (url.includes("/filme/")) return { html: detailHtml, json: null, status: 200, finalUrl: url };
      throw new Error(`no mock para ${url}`);
    },
  };
}

function detailPage(magnetHref) {
  return `<!DOCTYPE html><html><body>
    <div id="informacoes"><p><strong>Tamanho:</strong> 2.5GB<br><strong>Qualidade:</strong> 1080p</p></div>
    <a class="btn" href="${magnetHref}">MAGNET</a>
  </body></html>`;
}

const MAGNET = "magnet:?xt=urn:btih:99887766554433221100aabbccddeeff00112233&dn=Film.Dublado.1080p.WEB-DL.mkv";

const BR_HTML = {
  apache: `<body><div class="capaname"><a href="https://apachetorrent.com/filme/123" title="O Filme (2.5GB) 1080p Dublado WEB-DL">O Filme</a></div></body>`,
  hdr: `<body><div class="capa-img"><h2><a href="https://hdrtorrent.com/filme/123">O Filme (2024) 1080p Dublado</a></h2></div></body>`,
  rede: `<body><div class="capa_lista"><a href="https://redetorrent.com/filme/123" title="O Filme (2024) 1080p"><h2 itemprop="headline">O Filme (2024) 1080p</h2></a></div></body>`,
};

// ─── SubsPlease (API JSON dict → Object.values) ──────────────────────────────
function subspleaseMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("/api/")) {
        return {
          html: "",
          json: {
            "attack-on-titan-64": {
              show: "Shingeki no Kyojin (The Final Season)",
              episode: "64",
              release_date: "2024-03-03T17:00:00+00:00",
              page: "attack-on-titan-64",
              downloads: [
                { res: "1080", magnet: "magnet:?xt=urn:btih:11223344556677889900aabbccddeeff11223344&xl=1395864371" },
                { res: "720", magnet: "magnet:?xt=urn:btih:99887766554433221100aabbccddeeff00112233&xl=734003200" },
              ],
            },
          },
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── AudioBookBay (lista HTML → detalle con Info Hash → magnet) ──────────────
function audiobookbayMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("audiobookbay") && !url.includes("/abb/")) {
        return {
          html: `<html><body>
            <div class="post"><div class="postTitle"><h2><a href="/abb/book-123/">Sample Audiobook</a></h2></div>
            <div class="postContent">Format: MP3 / Bitrate: 64kbps / File Size: 300 MB / Posted: 1 Jan 2024</div></div>
          </body></html>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      if (url.includes("/abb/")) {
        return {
          html: `<html><body><table><tr><td>Info Hash:</td><td>aabbccddeeff00112233445566778899aabbccdd</td></tr></table></body></html>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── TorrentsCSV (API JSON pública, infohash→magnet) ─────────────────────────
function torrentscsvMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("service/search")) {
        return {
          html: "",
          json: {
            torrents: [
              {
                infohash: "abcd1234abcd1234abcd1234abcd1234abcd1234",
                name: "My.Show.S01E01.1080p",
                size_bytes: 1572864000,
                created_unix: 1725000000,
                seeders: 25, leechers: 4, completed: 100,
              },
            ],
          },
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── Magnetico (API local Basic auth, array raíz) ────────────────────────────
function magneticoMock() {
  let authHeader = "";
  return {
    get lastAuthHeader() { return authHeader; },
    async fetch(url, opts = {}) {
      if (url.includes("api/v0.1/torrents")) {
        authHeader = opts.headers?.["Authorization"]?.join?.(`,`) ?? String(opts.headers?.["Authorization"] ?? "");
        return {
          html: "",
          json: [
            {
              infoHash: "dddd1111dddd1111dddd1111dddd1111dddd1111",
              name: "Linux Torrent 2024",
              size: 524288000,
              discoveredOn: 1725000000,
              nFiles: 3,
            },
          ],
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── TorrentBytes (login HTML + tabla browse.php) ────────────────────────────
function torrentbytesMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("takelogin.php")) {
        return { html: '<a href="my.php">my</a>', json: null, status: 200, finalUrl: url };
      }
      if (url.includes("browse.php")) {
        return {
          html: `<table><tbody>
            <tr><td class="colhead">1</td><td class="colhead">2</td><td class="colhead">3</td><td class="colhead">4</td><td class="colhead">5</td><td class="colhead">6</td><td class="colhead">7</td><td class="colhead">8</td><td class="colhead">9</td><td class="colhead">10</td></tr>
            <tr>
              <td><a href="/browse.php?cat=5">HD</a></td>
              <td><a href="download.php?id=98765">d</a><a href="download.php?id=98765" title="">My.Show.S01E01.1080p</a></td>
              <td>3</td><td></td><td>2024-01-01 10:00:00</td><td>100</td><td>2.5 GB</td><td></td><td>20</td><td>5</td>
            </tr>
          </tbody></table>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── Shazbat (login + tabla tr.eprow) ────────────────────────────────────────
function shazbatMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("/login")) {
        return { html: '<span class="glyphicon-log-out"></span>', json: null, status: 200, finalUrl: url };
      }
      if (url.includes("/search")) {
        return {
          html: `<table id="torrent-table"><tbody>
            <tr class="eprow">
              <td></td><td></td>
              <td>My Show S01E01 (2024)</td>
              <td>(2097152000) :20 / :4</td>
              <td><a href="/load_torrent?file=abc.torrent">dl</a> <a href="/torrent_info?id=1">info</a></td>
            </tr>
          </tbody></table>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── SceneHD / FileList (JSON con passkey/Basic, sin login) ──────────────────
function scenehdMock() {
  let authHeader = "";
  return {
    get lastAuthHeader() { return authHeader; },
    async fetch(url, opts = {}) {
      if (url.includes("browse.php")) {
        return {
          html: "",
          json: [
            {
              id: 555, name: "My.Movie.2024.1080p", size: 4294967296,
              seeders: 12, leechers: 2, added: "2024-05-01 10:00:00",
              category: "1", is_freeleech: 0,
            },
          ],
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

function filelistMock() {
  let authHeader = "";
  return {
    get lastAuthHeader() { return authHeader; },
    async fetch(url, opts = {}) {
      if (url.includes("api.php")) {
        authHeader = opts.headers?.["Authorization"]?.join?.(`,`) ?? String(opts.headers?.["Authorization"] ?? "");
        return {
          html: "",
          json: [
            {
              id: 777, name: "FileList Movie 2024 1080p", size: 3221225472,
              seeders: 30, leechers: 5, upload_date: "2024-06-01",
              download_link: "https://filelist.io/download.php?id=777",
            },
          ],
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── TorrentNetwork (API token JSON, filas como arrays) ──────────────────────
function torrentnetworkMock() {
  let authHeader = "";
  return {
    get lastAuthHeader() { return authHeader; },
    async fetch(url, opts = {}) {
      if (url.includes("api/auth")) {
        return { html: "", json: { token: "tok-tn" }, status: 200, finalUrl: url };
      }
      if (url.includes("api/browse")) {
        authHeader = opts.headers?.["Authorization"]?.join?.(`,`) ?? String(opts.headers?.["Authorization"] ?? "");
        return {
          html: "",
          json: {
            data: [
              ["Movies GER/1080p", "German Movie 2024 1080p", 999, 1725000000, 0, 4294967296, 15, 3, 0, "Action", 0, 5, 1, "uploader"],
            ],
          },
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── ImmortalSeed (login + browse.php tabla) ─────────────────────────────────
function immortalseedMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("takelogin.php")) {
        return { html: '<a href="logout.php">x</a>', json: null, status: 200, finalUrl: url };
      }
      if (url.includes("browse.php")) {
        return {
          html: `<table id="sortabletable"><tbody>
            <tr>
              <td><a href="/browse.php?category=16">HD</a></td>
              <td><div><a href="/details.php?id=1234">Short</a></div><div class="tooltip-content"><div>Seed Movie 2024 1080p</div><div>Action|Drama</div></div></td>
              <td></td><td></td><td>2.5 GB</td><td>50</td><td>30</td><td>5</td>
              <td><a href="download.php?id=1234">dl</a></td>
            </tr>
          </tbody></table>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── TorrentDay (API JSON con cookie, query ";" raw) ─────────────────────────
function torrentdayMock() {
  let cookieHeader = "";
  return {
    get lastCookie() { return cookieHeader; },
    async fetch(url, opts = {}) {
      if (url.includes("t.json")) {
        cookieHeader = opts.headers?.["Cookie"]?.join?.(`,`) ?? String(opts.headers?.["Cookie"] ?? "");
        return {
          html: "",
          json: [
            {
              t: 4321, name: "TorrentDay Movie 2024 1080p", c: "7",
              size: 2147483648, seeders: 40, leechers: 6, ctime: 1725000000, files: 2,
            },
          ],
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── XSpeeds (login + browse.php POST, estructura distinta) ──────────────────
function xspeedsMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("takelogin.php")) {
        return { html: '<a href="logout.php">x</a>', json: null, status: 200, finalUrl: url };
      }
      if (url.includes("browse.php")) {
        return {
          html: `<table id="sortabletable"><tbody>
            <tr>
              <td><a href="/browse.php?category=161">HD</a></td>
              <td><div><div class="tooltip-content"><img src="/cover.jpg"></div></div></td>
              <td><a href="download.php?id=7777">dl</a></td>
              <td></td>
              <td>2.5 GB</td><td>50</td><td>30</td><td>5</td>
              <td></td>
              <td><div><a href="/details.php?id=7777">XSpeeds Movie 2024 1080p</a></div></td>
            </tr>
          </tbody></table>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── RevoPeers (login + browse.php tabla) ────────────────────────────────────
function revopeersMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("takelogin.php")) {
        return { html: '<a href="/logout.php">x</a>', json: null, status: 200, finalUrl: url };
      }
      if (url.includes("browse.php")) {
        return {
          html: `<table id="torrents-table"><tbody>
            <tr class="br_head"><th>Cat</th><th>Name</th><th>DL</th><th>Date</th><th>Size</th><th>Snatch</th><th>Seed</th><th>Leech</th></tr>
            <tr>
              <td class="br_type"><a href="browse.php?cat=12">HD</a></td>
              <td><div class="br_right"><a href="/details.php?id=333"><b>RevoPeers Movie 2024 1080p</b></a></div></td>
              <td></td>
              <td><a href="download.php?id=333">dl</a></td>
              <td></td>
              <td><nobr>2024-01-01 10:00:00</nobr></td>
              <td>2.5 GB <a href="#">1 file</a></td>
              <td>10</td><td>15</td><td>2</td>
            </tr>
          </tbody></table>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── BeyondHD API (POST JSON con apiKey en la URL) ───────────────────────────
function beyondhdMock() {
  let sentHeaders = {};
  let sentInputs = {};
  return {
    get lastHeaders() { return sentHeaders; },
    get lastInputs() { return sentInputs; },
    async fetch(url, opts = {}) {
      if (url.includes("api/torrents/")) {
        sentHeaders = opts.headers ?? {};
        sentInputs = opts.inputs ?? {};
        return {
          html: "",
          json: {
            status_code: 200, status_message: "OK",
            results: [
              {
                name: "BeyondHD Movie 2024 2160p", size: 8589934592,
                seeders: 18, leechers: 3, created_at: "2024-07-01T10:00:00Z",
                info_hash: "eeee2222eeee2222eeee2222eeee2222eeee2222",
                download_url: "https://beyond-hd.me/download/abc.torrent",
                info_url: "https://beyond-hd.me/details/abc",
              },
            ],
          },
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── Knaben (meta-search público, POST JSON) ─────────────────────────────────
function knabenMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("api.knaben.org")) {
        return {
          html: "",
          json: {
            hits: [
              {
                title: "Knaben Result Movie 2024 1080p",
                categoryId: [1],
                hash: "ffff3333ffff3333ffff3333ffff3333ffff3333",
                details: "https://knaben.org/details/1",
                link: "https://example.com/movie.torrent",
                magnet_url: "magnet:?xt=urn:btih:ffff3333ffff3333ffff3333ffff3333ffff3333",
                bytes: 1572864000,
                seeders: 22, peers: 3, date: "2024-08-01T10:00:00+01:00",
                tracker_id: "thepiratebay", tracker: "The Pirate Bay",
              },
            ],
          },
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── IPTorrents (cookie + tabla HTML) ────────────────────────────────────────
function iptorrentsMock() {
  let cookieHeader = "";
  return {
    get lastCookie() { return cookieHeader; },
    async fetch(url, opts = {}) {
      if (url.includes("/t")) {
        cookieHeader = opts.headers?.["Cookie"]?.join?.(`,`) ?? String(opts.headers?.["Cookie"] ?? "");
        return {
          html: `<table id="torrents"><thead><tr><th>Cat</th><th>Name</th><th>Files</th><th>Added</th><th>Size</th><th>Snatch</th><th>Seed</th><th>Leech</th></tr></thead>
            <tbody>
            <tr>
              <td><a href="?77">HD</a></td>
              <td><a class="hv" href="/details.php?id=5555">IPT Movie 2024 1080p</a><div class="sub">Action | Uploaded 2 hours ago by user</div></td>
              <td>2</td><td></td><td></td><td>2.5 GB</td><td>100</td><td>25</td><td>6</td>
              <td><a href="/download.php/5555/5555.torrent">dl</a></td>
            </tr>
            </tbody></table>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── TorrentSyndikat (API JSON con apikey) ───────────────────────────────────
function torrentsyndikatMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("api_9djWe8Tb2NE3p6opyqnh")) {
        return {
          html: "",
          json: {
            rows: [
              {
                id: "8888", name: "Deutscher Film 2024 1080p", category: 9,
                added: 1725000000, size: 4294967296, numfiles: 2,
                seeders: 10, leechers: 1, snatched: 50,
              },
            ],
          },
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── PreToMe (login con PIN + browse.php) ────────────────────────────────────
function pretomeMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("takelogin.php")) {
        return { html: '<a href="logout.php">x</a>', json: null, status: 200, finalUrl: url };
      }
      if (url.includes("browse.php")) {
        return {
          html: `<table><tbody>
            <tr class="browse_header"><th>Cat</th><th>Name</th><th>F</th><th>Date</th><th>Size</th></tr>
            <tr class="browse">
              <td><a href="browse.php?cat=19">HD</a></td>
              <td><a href="details.php?id=111" title="PreToMe Movie 2024 1080p">PreToMe...</a></td>
              <td><a href="download.php?id=111">dl</a></td>
              <td>3</td><td></td><td>2 hours ago</td><td></td><td>2.5 GB</td><td>50</td><td>15</td><td>2</td>
            </tr>
          </tbody></table>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── BitHDTV (cookie + tabla) ────────────────────────────────────────────────
function bithdtvMock() {
  let cookieHeader = "";
  return {
    get lastCookie() { return cookieHeader; },
    async fetch(url, opts = {}) {
      if (url.includes("torrents.php")) {
        cookieHeader = opts.headers?.["Cookie"]?.join?.(`,`) ?? String(opts.headers?.["Cookie"] ?? "");
        return {
          html: `<table id="torrents-index-table"><tbody id="torrents-index-table-body">
            <tr bgcolor="#FFFFFF">
              <td><a href="/torrents.php?cat=1">HD</a></td>
              <td></td>
              <td><a href="/details.php?id=222" title="BitHDTV.Movie.2024.1080p">BitHDTV...</a></td>
              <td>3 files</td>
              <td>50</td>
              <td>2024-05-15 08:30:00</td>
              <td>4.5 GB</td>
              <td></td>
              <td>20</td><td>3</td>
              <td><a href="download.php?id=222">dl</a></td>
            </tr>
          </tbody></table>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── MyAnonamouse (JSON con cookie mam_id) ───────────────────────────────────
function myanonamouseMock() {
  let cookieHeader = "";
  return {
    get lastCookie() { return cookieHeader; },
    async fetch(url, opts = {}) {
      if (url.includes("loadSearchJSONbasic.php")) {
        cookieHeader = opts.headers?.["Cookie"]?.join?.(`,`) ?? String(opts.headers?.["Cookie"] ?? "");
        return {
          html: "",
          json: {
            data: [
              {
                id: 9999, title: "Some AudioBook 2024", description: "",
                size: "500 MB", seeders: 8, leechers: 1,
                added: "2024-09-01 10:00:00", category: 1, free: false,
              },
            ],
          },
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── MejorTorrent (público Tailwind) ─────────────────────────────────────────
function mejortorrentMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("busqueda/page/")) {
        return {
          html: `<div class="w-11/12">
            <div>
              <div><a href="/pelicula/dune-parte-dos-1080p"><span>Mi Pelicula 2024</span> <span>1080p</span></a></div>
              <div>Pelicula</div>
            </div>
            <div>
              <div><a href="/serie/foo-s01"><span>Mi Serie S01</span> <span>720p</span></a></div>
              <div>Serie</div>
            </div>
          </div>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── PassThePopcorn (API JSON con headers, movies[].torrents[]) ─────────────
function ptpMock() {
  let sentHeaders = {};
  return {
    get lastHeaders() { return sentHeaders; },
    async fetch(url, opts = {}) {
      if (url.includes("torrents.php")) {
        sentHeaders = opts.headers ?? {};
        return {
          html: "",
          json: {
            total_results: "1",
            movies: [
              {
                group_id: "55551", year: "2024", imdb_id: "1234567",
                torrents: [
                  { id: "77771", release_name: "PTP Movie 2024 1080p BluRay", size: "4294967296", seeders: "25", leechers: "2", snatched: "100", upload_time: "2024-10-01 12:00:00" },
                ],
              },
            ],
          },
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── NorBits (login + browse.php, optional 2FA) ──────────────────────────────
function norbitsMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("takelogin.php")) {
        return { html: '<a href="logout.php">x</a>', json: null, status: 200, finalUrl: url };
      }
      if (url.includes("browse.php")) {
        return {
          html: `<table id="torrentTable"><tbody>
            <tr><th>Cat</th><th>Name</th></tr>
            <tr>
              <td><a href="browse.php?main_cat[]=1">Movies</a></td>
              <td>
                <a href="download.php?id=2222">dl</a>
                <a href="details.php?id=2222" title="NorBits Movie 2024 1080p">NorBits...</a>
              </td>
              <td></td><td>3</td><td></td><td></td><td>1.5 GB</td><td>20</td><td>10</td><td>2</td>
            </tr>
          </tbody></table>`,
          json: null, status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── AnimeBytes (scrape.php, groups[].torrents[]) ────────────────────────────
function animebytesMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("scrape.php")) {
        return {
          html: "",
          json: {
            matches: 1,
            groups: [
              {
                group_name: "Some Anime", series_name: "Some Anime Series",
                full_name: "Some Anime Series (2024)", category_name: "TV Series",
                torrents: [
                  { id: "12345", link: "https://animebytes.tv/torrents/12345/download", size: 1073741824, seeders: 30, leechers: 4, snatched: 100, upload_time: "2024-08-15 10:00:00", file_count: 12 },
                ],
              },
            ],
          },
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

// ─── GazelleGames API (doble objeto anidado) ─────────────────────────────────
function gazellegamesMock() {
  return {
    async fetch(url, opts = {}) {
      if (url.includes("api.php")) {
        return {
          html: "",
          json: {
            response: {
              "555": {
                year: 2023,
                Torrents: {
                  "88881": {
                    ID: "88881",
                    ReleaseTitle: "Game.Night.2023",
                    Link: "/torrents/88881",
                    Size: "524288000",
                    Seeders: 12, Leechers: 1, Snatched: 50,
                    Time: "2023-06-01 10:00:00",
                  },
                },
              },
            },
          },
          status: 200, finalUrl: url,
        };
      }
      throw new Error(`no mock para ${url}`);
    },
  };
}

const cases = [
  {
    file: "desigaane.yml", config: { apikey: "a".repeat(116) }, json: GAZELLE_JSON,
    expect: { title: /^Artist Name/, size: 734003200, seeders: 42, download: /ajax\.php\?action=download&id=1001/ },
  },
  {
    file: "dicmusic.yml", config: { username: "u", password: "p" }, json: GAZELLE_JSON,
    expect: { title: /^Artist Name/, size: 734003200, seeders: 42, download: /ajax\.php\?action=download&id=1001/ },
  },
  {
    file: "secretcinema.yml", config: { username: "u", password: "p" }, json: SECRET_JSON,
    expect: { title: /Rare\.Movie\.1979\.1080p/, size: 4294967296, seeders: 12, download: /id=2001/ },
  },
  {
    file: "greatposterwall.yml", config: { username: "u", password: "p" }, json: GPW_JSON,
    expect: { title: /Chinese Movie \[2023\] x264 \/ BluRay \/ 1080p \/ mkv/, size: 5368709120, seeders: 8, download: /id=3001/ },
  },
  // Los 5 del primer lote: regresión
  {
    file: "alpharatio.yml", config: { username: "u", password: "p" }, json: GAZELLE_JSON,
    expect: { title: /^Artist Name/, size: 734003200, seeders: 42, download: /id=1001/ },
  },
  {
    file: "redacted.yml", config: { username: "u", password: "p" }, json: GAZELLE_JSON,
    expect: { title: /^Artist Name/, size: 734003200, seeders: 42, download: /id=1001/ },
  },
  {
    file: "orpheus.yml", config: { username: "u", password: "p" }, json: GAZELLE_JSON,
    expect: { title: /^Artist Name/, size: 734003200, seeders: 42 },
  },
  {
    file: "simurg.yml", config: { username: "u", password: "p" }, json: GAZELLE_JSON,
    expect: { title: /^Artist Name/, size: 734003200, seeders: 42 },
  },
  {
    file: "brokenstones.yml", config: { username: "u", password: "p" }, json: GAZELLE_JSON,
    expect: { title: /^Artist Name/, size: 734003200, seeders: 42 },
  },
  // ── Lote Avistaz (login token → Bearer)
  ...[
    ["avistaz.yml", "avistaz", /^Asian\.Movie\.2024/],
    ["cinemaz.yml", "cinemaz", /^Asian\.Movie\.2024/],
    ["exoticaz.yml", "exoticaz", /^Asian\.Movie\.2024/],
    ["privatehd.yml", "privatehd", /^Asian\.Movie\.2024/],
  ].map(([file, id, titleRe]) => ({
    file, id,
    config: { username: "u", password: "p", pid: "P123" },
    mock: avistazMock(),
    expect: { title: titleRe, size: 3145728000, seeders: 15, download: /rss\/download\/abc123\.torrent/, auth: "Bearer tok-12345", authJson: true },
  })),
  {
    file: "animez.yml", id: "animez",
    config: { username: "u", password: "p", pid: "P123" },
    mock: avistazMock(),
    expect: { title: /^Asian Movie \(2024\) \[1080p\]$/, size: 3145728000, seeders: 15, download: /rss\/download\/abc123\.torrent/, auth: "Bearer tok-12345", authJson: true },
  },
  // ── Lote SpeedApp (array raíz, token Bearer)
  ...[
    ["speedapp.yml", "speedapp", /^My\.Movie\.2024\.1080p/],
    ["retroflix.yml", "retroflix", /^My\.Movie\.2024\.1080p/],
  ].map(([file, id, titleRe]) => ({
    file, id,
    config: { username: "u", password: "p" },
    mock: speedAppMock(),
    expect: { title: titleRe, size: 2097152000, seeders: 9, download: /api\/torrent\/sa-77\/download/, auth: "Bearer tok-speed", authJson: true },
  })),
  // ── Lote Brasileños (HTML: lista → detalle → magnet)
  {
    file: "apachetorrent.yml", id: "apachetorrent", config: {},
    mock: brazilianMock(BR_HTML.apache, detailPage(MAGNET)),
    expect: { title: /O Filme 1080p/, magnet: MAGNET, size: 2684354560, seeders: 1 },
  },
  {
    file: "hdrtorrent.yml", id: "hdrtorrent", config: {},
    mock: brazilianMock(BR_HTML.hdr, detailPage(MAGNET)),
    expect: { title: /O Filme/, magnet: MAGNET, size: 2684354560, seeders: 1 },
  },
  {
    file: "redetorrent.yml", id: "redetorrent", config: {},
    mock: brazilianMock(BR_HTML.rede, detailPage(MAGNET)),
    expect: { title: /O Filme/, magnet: MAGNET, size: 2684354560, seeders: 1 },
  },
  // ── SubsPlease (dict JSON → Object.values)
  {
    file: "subsplease.yml", id: "subsplease", config: {},
    mock: subspleaseMock(),
    expect: { title: /\[SubsPlease\] Shingeki no Kyojin \(The Final Season\) - 64 \(1080p\)/, magnet: /urn:btih:11223344556677889900aabbccddeeff11223344/, size: 1395864371, seeders: 1 },
  },
  // ── AudioBookBay (detalle → Info Hash → magnet)
  {
    file: "audiobookbay.yml", id: "audiobookbay", config: {},
    mock: audiobookbayMock(),
    expect: { title: /Sample Audiobook/, magnet: /urn:btih:aabbccddeeff00112233445566778899aabbccdd/ },
  },
  // ── TorrentsCSV (JSON público, infohash → magnet)
  {
    file: "torrentscsv.yml", id: "torrentscsv", config: {},
    mock: torrentscsvMock(),
    expect: { title: /My\.Show\.S01E01\.1080p/, magnet: /urn:btih:abcd1234abcd1234abcd1234abcd1234abcd1234/, size: 1572864000, seeders: 25 },
  },
  // ── Magnetico (Basic auth base64, array raíz, infohash → magnet)
  {
    file: "magnetico.yml", id: "magnetico", config: { username: "user", password: "pass" },
    mock: magneticoMock(),
    expect: { title: /Linux Torrent 2024/, magnet: /urn:btih:dddd1111dddd1111dddd1111dddd1111dddd1111/, size: 524288000, auth: "Basic dXNlcjpwYXNz" },
  },
  // ── TorrentBytes (login + browse.php)
  {
    file: "torrentbytes.yml", id: "torrentbytes", config: { username: "u", password: "p" },
    mock: torrentbytesMock(),
    expect: { title: /My\.Show\.S01E01\.1080p/, size: 2684354560, seeders: 20, download: /download\.php\?id=98765/ },
  },
  // ── Shazbat (login + search portlet)
  {
    file: "shazbat.yml", id: "shazbat", config: { username: "u", password: "p" },
    mock: shazbatMock(),
    expect: { title: /My Show S01E01/, size: 2097152000, seeders: 20, download: /load_torrent\?file=abc\.torrent/ },
  },
  // ── SceneHD (JSON passkey, array raíz)
  {
    file: "scenehd.yml", id: "scenehd", config: { passkey: "pk123" },
    mock: scenehdMock(),
    expect: { title: /My\.Movie\.2024\.1080p/, size: 4294967296, seeders: 12, download: /download\.php\?id=555/ },
  },
  // ── FileList (Basic auth user:passkey)
  {
    file: "filelist.yml", id: "filelist", config: { username: "user", passkey: "pk123" },
    mock: filelistMock(),
    expect: { title: /FileList Movie 2024 1080p/, size: 3221225472, seeders: 30, download: /download\.php\?id=777/, auth: "Basic dXNlcjpwazEyMw==" },
  },
  // ── TorrentNetwork (token JSON, filas array)
  {
    file: "torrentnetwork.yml", id: "torrentnetwork",
    config: { username: "u", password: "p", passkey: "pk-tn" },
    mock: torrentnetworkMock(),
    expect: { title: /German Movie 2024 1080p/, size: 4294967296, seeders: 15, download: /sdownload\/999\/pk-tn/, auth: "tok-tn" },
  },
  // ── ImmortalSeed (login + browse.php)
  {
    file: "immortalseed.yml", id: "immortalseed", config: { username: "u", password: "p" },
    mock: immortalseedMock(),
    expect: { title: /Seed Movie 2024 1080p/, size: 2684354560, seeders: 30, download: /download\.php\?id=1234/ },
  },
  // ── TorrentDay (cookie + t.json)
  {
    file: "torrentday.yml", id: "torrentday", config: { cookie: "uid=1;pass=abc" },
    mock: torrentdayMock(),
    expect: { title: /TorrentDay Movie 2024 1080p/, size: 2147483648, seeders: 40, download: /download\.php\/4321\/4321\.torrent/, cookie: "uid=1;pass=abc" },
  },
  // ── XSpeeds (login + browse.php POST)
  {
    file: "xspeeds.yml", id: "xspeeds", config: { username: "u", password: "p" },
    mock: xspeedsMock(),
    expect: { title: /XSpeeds Movie 2024 1080p/, size: 2684354560, seeders: 30, download: /download\.php\?id=7777/ },
  },
  // ── RevoPeers (login + browse.php)
  {
    file: "revopeers.yml", id: "revopeers", config: { username: "u", password: "p" },
    mock: revopeersMock(),
    expect: { title: /RevoPeers Movie 2024 1080p/, size: 2684354560, seeders: 15, download: /download\.php\?id=333/ },
  },
  // ── BeyondHD API (POST JSON)
  {
    file: "beyondhdapi.yml", id: "beyond-hd-api", config: { apiKey: "key-1", rsskey: "rss-1" },
    mock: beyondhdMock(),
    expect: { title: /BeyondHD Movie 2024 2160p/, size: 8589934592, seeders: 18, download: /download\/abc\.torrent/ },
  },
  // ── Knaben (meta-search público)
  {
    file: "knaben.yml", id: "knaben", config: {},
    mock: knabenMock(),
    expect: { title: /Knaben Result Movie 2024 1080p/, size: 1572864000, seeders: 22, magnet: /urn:btih:ffff3333ffff3333ffff3333ffff3333ffff3333/ },
  },
  // ── IPTorrents (cookie + tabla)
  {
    file: "iptorrents.yml", id: "iptorrents", config: { cookie: "uid=9;pass=xyz" },
    mock: iptorrentsMock(),
    expect: { title: /IPT Movie 2024 1080p/, size: 2684354560, seeders: 25, download: /download\.php\/5555\/5555\.torrent/, cookie: "uid=9;pass=xyz" },
  },
  // ── TorrentSyndikat (API JSON con apikey)
  {
    file: "torrentsyndikat.yml", id: "torrentsyndikat", config: { apikey: "key-synd" },
    mock: torrentsyndikatMock(),
    expect: { title: /Deutscher Film 2024 1080p/, size: 4294967296, seeders: 10, download: /download\.php\?id=8888/ },
  },
  // ── PreToMe (login + PIN)
  {
    file: "pretome.yml", id: "pretome", config: { username: "u", password: "p", pin: "1234" },
    mock: pretomeMock(),
    expect: { title: /PreToMe Movie 2024 1080p/, size: 2684354560, seeders: 15, download: /download\.php\?id=111/ },
  },
  // ── BitHDTV (cookie + tabla)
  {
    file: "bithdtv.yml", id: "bithdtv", config: { cookie: "uid=7;hash=xyz" },
    mock: bithdtvMock(),
    expect: { title: /BitHDTV Movie 2024 1080p/, size: 4831838208, seeders: 20, download: /download\.php\?id=222/, cookie: "uid=7;hash=xyz" },
  },
  // ── MyAnonamouse (cookie mam_id + JSON)
  {
    file: "myanonamouse.yml", id: "myanonamouse", config: { mam_id: "mam123" },
    mock: myanonamouseMock(),
    expect: { title: /Some AudioBook 2024/, size: 524288000, seeders: 8, download: /download\.php\?tid=9999/, cookie: "mam_id=mam123" },
  },
  // ── MejorTorrent (público Tailwind)
  {
    file: "mejortorrent.yml", id: "mejortorrent", config: {},
    mock: mejortorrentMock(),
    expect: { title: /Mi Pelicula 2024/, download: /\/pelicula\/dune-parte-dos-1080p/ },
  },
  // ── PassThePopcorn (API JSON anidado)
  {
    file: "passthepopcorn.yml", id: "passthepopcorn", config: { user: "ptpuser", key: "ptpkey" },
    mock: ptpMock(),
    expect: { title: /PTP Movie 2024 1080p BluRay/, size: 4294967296, seeders: 25, download: /torrents\.php\?action=download&id=77771/ },
  },
  // ── NorBits (login + 2FA opcional)
  {
    file: "norbits.yml", id: "norbits", config: { username: "u", password: "p", twofactor: "" },
    mock: norbitsMock(),
    expect: { title: /NorBits Movie 2024 1080p/, size: 1610612736, seeders: 10, download: /download\.php\?id=2222/ },
  },
  // ── AnimeBytes (scrape.php passkey, groups[].torrents[])
  {
    file: "animebytes.yml", id: "animebytes", config: { passkey: "pk-32-characters-long-1234" },
    mock: animebytesMock(),
    expect: { title: /Some Anime Series/, size: 1073741824, seeders: 30, download: /animebytes\.tv\/torrents\/12345\/download/ },
  },
  // ── GazelleGames API (doble objeto anidado)
  {
    file: "gazellegamesapi.yml", id: "gazellegamesapi", config: { username: "u", password: "p" },
    mock: gazellegamesMock(),
    expect: { title: /Game\.Night\.2023 \(2023\)/, size: 524288000, seeders: 12, download: /gazellegames\.net\/torrents\/88881/ },
  },
];

for (const c of cases) {
  const yml = readFileSync(join(DIR, c.file), "utf8");
  console.log(`\n== ${c.file} ==`);
  let def;
  try {
    def = parseDefinition(yml);
    ok(def?.id && def?.name, `parse: id=${def?.id} name="${def?.name}"`);
  } catch (e) {
    ok(false, `parse: ${e.message}`);
    continue;
  }
  const http = c.mock ?? mockHttp([
    ["ajax.php", { json: c.json }],
    ["login.php", { html: "ok" }],
  ]);
  try {
    const results = await runSearch(def, c.config, { keywords: "filme" }, 5, http);
    ok(results.length > 0, `search devuelve ${results.length} resultados`);
    const r = results[0];
    if (r) {
      if (c.expect.title) ok(c.expect.title.test(r.name), `título "${r.name}" ~ ${c.expect.title}`);
      if (c.expect.size !== undefined) ok(r.size === c.expect.size, `size ${r.size} == ${c.expect.size}`);
      if (c.expect.seeders !== undefined) ok(r.seeders === c.expect.seeders, `seeders ${r.seeders} == ${c.expect.seeders}`);
      if (c.expect.magnet) {
        const magnetOk = c.expect.magnet instanceof RegExp
          ? c.expect.magnet.test(r.magnet ?? "")
          : r.magnet === c.expect.magnet;
        const label = c.expect.magnet instanceof RegExp
          ? String(c.expect.magnet)
          : `${String(c.expect.magnet).slice(0, 45)}…`;
        ok(magnetOk, `magnet ${label}`);
      }
      if (c.expect.download) ok(c.expect.download.test(r.downloadUrl ?? ""), `download ${r.downloadUrl} ~ ${c.expect.download}`);
    }
  } catch (e) {
    ok(false, `runSearch: ${e.message}`);
  }
  if (c.expect?.auth !== undefined) {
    const seenAuth = c.mock?.lastAuthHeader ?? "";
    ok(seenAuth === c.expect.auth, `Authorization "${seenAuth}" == "${c.expect.auth}"`);
  }
  if (c.expect?.cookie !== undefined) {
    const seenCookie = c.mock?.lastCookie ?? "";
    ok(seenCookie === c.expect.cookie, `Cookie "${seenCookie}" == "${c.expect.cookie}"`);
  }
  if (c.expect?.authJson !== undefined) {
    const seenJson = c.mock?.authJsonBody ?? false;
    const seenBody = c.mock?.authBodySeen ?? "";
    ok(seenJson, "login manda Content-Type: application/json");
    try {
      const parsed = JSON.parse(seenBody);
      const pidOk = c.config.pid !== undefined ? parsed.pid === c.config.pid : parsed.pid === undefined;
      ok(parsed.username === c.config.username && parsed.password === c.config.password && pidOk,
        `login body JSON {username,password${c.config.pid !== undefined ? ",pid" : ""}}: ${String(seenBody).slice(0, 60)}`);
    } catch {
      ok(false, `login body NO es JSON válido: ${String(seenBody).slice(0, 60)}`);
    }
  }
}

console.log(`\nTotal: ${passed} OK, ${failed} fallos`);
process.exit(failed ? 1 : 0);