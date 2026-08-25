/**
 * Tests del release parser — casos reales de releases.
 *
 * Ejecutar: node --experimental-strip-types middleware/server/services/planner/release-parser.test.ts
 * (o importar en un runner de test del proyecto).
 */
import { parseReleaseName, mapLanguageToIso, languageQueryMarkers } from "./release-parser.ts";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`✗ FAIL: ${label}`);
  }
}

function expectEq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`✗ FAIL: ${label}\n    expected ${e}\n    got      ${a}`);
  }
}

// ── Casos series ────────────────────────────────────────────────────────────

const cases: Array<{
  input: string;
  check: (r: ReturnType<typeof parseReleaseName>) => void;
}> = [
  {
    input: "Breaking.Bad.S01E02.1080p.WEB-DL.x264-GROUP",
    check: (r) => {
      expectEq(r.type, "series", "BB type");
      expectEq(r.season, 1, "BB season");
      expectEq(r.episode, 2, "BB episode");
      expectEq(r.quality, "fullhd", "BB quality");
      expectEq(r.source, "webdl", "BB source");
      assert(r.title.toLowerCase().includes("breaking bad"), `BB title "${r.title}"`);
    },
  },
  {
    input: "Breaking Bad - S01E02 - The Cat's in the Bag (2008) 1080p WEBRip x264",
    check: (r) => {
      expectEq(r.type, "series", "BB2 type");
      expectEq(r.season, 1, "BB2 season");
      expectEq(r.episode, 2, "BB2 episode");
      expectEq(r.source, "webrip", "BB2 source");
    },
  },
  {
    input: "Stranger.Things.S04E09.2160p.NF.WEB-DL.DDP5.1.H.265-NTG",
    check: (r) => {
      expectEq(r.type, "series", "ST type");
      expectEq(r.season, 4, "ST season");
      expectEq(r.episode, 9, "ST episode");
      expectEq(r.quality, "uhd", "ST quality");
      expectEq(r.codec, "h.265", "ST codec");
    },
  },
  {
    input: "The.Mandalorian.S02E01E02.1080p.DSNP.WEB-DL.x264-EVO",
    check: (r) => {
      expectEq(r.type, "series", "Mando type");
      expectEq(r.season, 2, "Mando season");
      expectEq(r.episode, 1, "Mando episode");
      expectEq(r.episodes?.length, 2, "Mando multi-ep");
    },
  },
  {
    input: "Game.of.Thrones.S08.Complete.2160p.BluRay.x265-EPiC",
    check: (r) => {
      expectEq(r.type, "series", "GoT type");
      expectEq(r.season, 8, "GoT season pack");
      expectEq(r.episode, undefined, "GoT no episode");
      expectEq(r.quality, "uhd", "GoT quality");
      expectEq(r.source, "bluray", "GoT source");
    },
  },
  {
    input: "The.Expanse.1x03.720p.HDTV.x264-KILLERS",
    check: (r) => {
      expectEq(r.type, "series", "Expanse type");
      expectEq(r.season, 1, "Expanse season");
      expectEq(r.episode, 3, "Expanse episode");
      expectEq(r.quality, "hd", "Expanse quality");
    },
  },
  {
    input: "Arcane.S01E06.1080p.WEB-DL.DDP5.1.H.264-MULTi",
    check: (r) => {
      expectEq(r.type, "series", "Arcane type");
      expectEq(r.multi, true, "Arcane multi");
      assert(r.languages.includes("multi"), "Arcane languages multi");
    },
  },
  {
    input: "La.Casa.de.Papel.S04E08.1080p.WEB-DL.AC3.5.1.x264-CASTELLANO",
    check: (r) => {
      expectEq(r.type, "series", "LCDP type");
      expectEq(r.season, 4, "LCDP season");
      expectEq(r.episode, 8, "LCDP episode");
      assert(r.languages.includes("spanish") || r.languages.includes("castellano"), `LCDP lang "${r.languages}"`);
    },
  },
  {
    input: "Elite.S05E03.1080p.WEB-DL.AC3.5.1.x264-SP",
    check: (r) => {
      expectEq(r.type, "series", "Elite type");
      assert(r.languages.includes("spanish"), `Elite lang "${r.languages}"`);
    },
  },
  {
    input: "The.Boys.S02E01.1080p.WEB-DL.DDP5.1.H.264-REPACK-GROUP",
    check: (r) => {
      assert(r.edition.includes("repack"), `Boys edition "${r.edition}"`);
    },
  },
  {
    input: "Breaking.Bad.S01E02.720p.WEB-DL.AC3.5.1.x264-ES",
    check: (r) => {
      expectEq(r.quality, "hd", "BB-ES quality");
      assert(r.languages.includes("spanish") || r.languages.includes("subs"), `BB-ES lang "${r.languages}"`);
    },
  },
  {
    input: "Dark.S02E06.1080p.WEB-DL.x264-NL",
    check: (r) => {
      expectEq(r.type, "series", "Dark type");
      assert(r.languages.length > 0, `Dark lang "${r.languages}"`);
    },
  },
  {
    input: "Silo.S01E01.ESPAÑA.1080p.WEB-DL",
    check: (r) => {
      expectEq(r.type, "series", "Silo-españa type");
      assert(r.languages.includes("spanish"), `Silo-españa lang "${r.languages}"`);
    },
  },
  {
    input: "Silo.S01E01.LATAM.1080p.WEB-DL",
    check: (r) => {
      expectEq(r.type, "series", "Silo-latam type");
      assert(r.languages.includes("latino"), `Silo-latam lang "${r.languages}"`);
    },
  },
  // ── Casos movies ──────────────────────────────────────────────────────────
  {
    input: "Dune.Part.Two.2024.1080p.BluRay.x264-AMIABLE",
    check: (r) => {
      expectEq(r.type, "movie", "Dune type");
      expectEq(r.year, 2024, "Dune year");
      expectEq(r.quality, "fullhd", "Dune quality");
      expectEq(r.source, "bluray", "Dune source");
      assert(r.title.toLowerCase().includes("dune"), `Dune title "${r.title}"`);
    },
  },
  {
    input: "Oppenheimer.2023.2160p.UHD.BluRay.REMUX.HEVC.DV.HDR10Plus-DDR",
    check: (r) => {
      expectEq(r.type, "movie", "Opp type");
      expectEq(r.quality, "uhd", "Opp quality");
      expectEq(r.source, "remux", "Opp source");
    },
  },
  {
    input: "The.Matrix.Resurrections.2021.1080p.WEB-DL.x264.AAC5.1-EXODUS",
    check: (r) => {
      expectEq(r.type, "movie", "Matrix type");
      expectEq(r.source, "webdl", "Matrix source");
    },
  },
  {
    input: "Interstellar.2014.IMAX.2160p.4K.HDR.BluRay.x265-YTS",
    check: (r) => {
      expectEq(r.type, "movie", "Interstellar type");
      expectEq(r.quality, "uhd", "Interstellar quality");
      assert(r.title.toLowerCase().includes("interstellar"), `Interstellar title "${r.title}"`);
    },
  },
  {
    input: "The.Godfather.1972.1080p.BluRay.REMUX.HEVC.DTS-HD.MA.5.1-FGT",
    check: (r) => {
      expectEq(r.type, "movie", "Godfather type");
      expectEq(r.year, 1972, "Godfather year");
      expectEq(r.source, "remux", "Godfather source");
    },
  },
  {
    input: "Dune.2021.720p.BRRip.x264.AAC-YIFY",
    check: (r) => {
      expectEq(r.type, "movie", "Dune2 type");
      expectEq(r.quality, "hd", "Dune2 quality");
      expectEq(r.source, "dvd", "Dune2 source (BRRip → dvd)");
    },
  },
  {
    input: "Avatar.The.Way.of.Water.2022.1080p.WEBRip.x264.YTS.MX",
    check: (r) => {
      expectEq(r.type, "movie", "Avatar type");
      expectEq(r.source, "webrip", "Avatar source");
    },
  },
  {
    input: "Vengadores.Endgame.2019.1080p.BluRay.x264-SPARKS",
    check: (r) => {
      expectEq(r.type, "movie", "Endgame type");
      expectEq(r.year, 2019, "Endgame year");
      assert(r.title.toLowerCase().includes("vengadores"), `Endgame title "${r.title}"`);
    },
  },
  {
    input: "Todo a la vez en todas partes.2022.1080p.WEB-DL.x264-Castellano",
    check: (r) => {
      expectEq(r.type, "movie", "TodoALaVez type");
      assert(r.languages.includes("spanish") || r.languages.includes("castellano"), `Todo lang "${r.languages}"`);
    },
  },
  {
    input: "Pobres criaturas.2023.1080p.WEB-DL.DDP5.1.x264-LATINO",
    check: (r) => {
      expectEq(r.type, "movie", "Pobres type");
      assert(r.languages.includes("latino"), `Pobres lang "${r.languages}"`);
    },
  },
];

for (const c of cases) {
  const r = parseReleaseName(c.input);
  c.check(r);
  // Debug output
  if (process.env.PARSER_DEBUG) {
    console.log(
      `✓ ${c.input}\n  → title="${r.title}" type=${r.type} S${r.season ?? "?"}E${r.episode ?? "?"} ${r.quality} ${r.source} lang=[${r.languages}] edition=[${r.edition}] group=${r.group}`,
    );
  }
}

// ── Normalización de idioma (mapLanguageToIso) ─────────────────────────────

expectEq(mapLanguageToIso("spanish"), "es", "iso spanish→es");
expectEq(mapLanguageToIso("castellano"), "es", "iso castellano→es");
expectEq(mapLanguageToIso("ESPAÑOL"), "es", "iso ESPAÑOL→es (case)");
expectEq(mapLanguageToIso("latino"), "latino", "iso latino→latino");
expectEq(mapLanguageToIso("english"), "en", "iso english→en");
expectEq(mapLanguageToIso("german"), "de", "iso german→de");
expectEq(mapLanguageToIso("french"), "fr", "iso french→fr");
expectEq(mapLanguageToIso("japanese"), "ja", "iso japanese→ja");
expectEq(mapLanguageToIso("korean"), "ko", "iso korean→ko");
expectEq(mapLanguageToIso("chinese"), "zh", "iso chinese→zh");
expectEq(mapLanguageToIso("multi"), "multi", "iso multi→multi");
expectEq(mapLanguageToIso("zz"), "zz", "iso fallback devuelve el mismo código");

// ── Marcadores de query por idioma (languageQueryMarkers) ──────────────────

assert(languageQueryMarkers("es").includes("ESPAÑOL"), "markers es incluye ESPAÑOL");
assert(languageQueryMarkers("es").includes("CASTELLANO"), "markers es incluye CASTELLANO");
assert(languageQueryMarkers("latino").includes("LATINO"), "markers latino incluye LATINO");
assert(languageQueryMarkers("en").includes("ENGLISH"), "markers en incluye ENGLISH");
expectEq(languageQueryMarkers(undefined), [], "markers undefined → []");
expectEq(languageQueryMarkers("multi"), [], "markers multi → []");
expectEq(languageQueryMarkers("subs"), [], "markers subs → []");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
