/**
 * Tests del decision engine — fixtures reales.
 *
 * Ejecutar: node --experimental-strip-types server/services/planner/decision-engine.test.ts
 */
import { parseReleaseName } from "./release-parser.ts";
import { pickBest } from "./decision-engine.ts";

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

// ── Caso 1: serie, varios releases, elige mejor calidad ─────────────────────

const bbReleases = [
  "Breaking.Bad.S01E01.720p.HDTV.x264-FQM",
  "Breaking.Bad.S01E01.1080p.WEB-DL.DD5.1.H.264-NTb",
  "Breaking.Bad.S01E02.1080p.WEB-DL.x264-EVOLVE", // episodio equivocado
  "Breaking.Bad.S02E01.1080p.WEB-DL.x264-EVOLVE", // temporada equivocada
].map(parseReleaseName);

const bbDecision = pickBest({
  releases: bbReleases,
  expectedTitle: "Breaking Bad",
  season: 1,
  episode: 1,
  minQuality: "fullhd",
});

assert(bbDecision.picked !== null, "BB picked something");
expectEq(bbDecision.picked?.release.season, 1, "BB picked season");
expectEq(bbDecision.picked?.release.episode, 1, "BB picked episode");
expectEq(bbDecision.picked?.release.quality, "fullhd", "BB picked fullhd (not hd)");
// Rechazos: S01E02 (wrong ep), S02E01 (wrong season). El 720p ya NO se rechaza:
// se puntúa por debajo del 1080p (calidad como preferencia suave).
expectEq(bbDecision.rejected.length, 2, "BB rejected 2 (wrong season + wrong episode)");
expectEq(bbDecision.evaluated.length, 2, "BB evaluated 2 (720p penalizado + 1080p)");
expectEq(bbDecision.picked?.release.source, "webdl", "BB picked webdl");
const bb720 = bbDecision.evaluated.find((e) => e.release.quality === "hd");
assert(bb720 !== undefined, "BB: 720p evaluado (no rechazado)");
expectEq(bb720!.qualityScore, 100, "BB: 720p penalizado a 100 pts (min fullhd)");

// ── Caso 2: min_quality uhd prefiere 4K; 1080p queda como fallback ──────────

const duneReleases = [
  "Dune.Part.Two.2024.1080p.WEB-DL.x264-AMIABLE",
  "Dune.Part.Two.2024.2160p.UHD.BluRay.REMUX.HEVC-DDR",
].map(parseReleaseName);

const duneDecision = pickBest({
  releases: duneReleases,
  expectedTitle: "Dune Part Two",
  minQuality: "uhd",
});

expectEq(duneDecision.picked?.release.quality, "uhd", "Dune picks uhd (min uhd)");
expectEq(duneDecision.rejected.length, 0, "Dune: 1080p ya no se rechaza (preferencia suave)");
expectEq(duneDecision.evaluated.length, 2, "Dune: 1080p evaluado con menor score");

// ── Caso 3: language profile must_have spanish ──────────────────────────────

const langReleases = [
  "Breaking.Bad.S01E01.1080p.WEB-DL.x264-ENGLISH",
  "Breaking.Bad.S01E01.1080p.WEB-DL.x264-ESP",
].map(parseReleaseName);

const langDecision = pickBest({
  releases: langReleases,
  expectedTitle: "Breaking Bad",
  season: 1,
  episode: 1,
  minQuality: "hd",
  languageProfile: { mustHave: ["spanish"] },
});

expectEq(langDecision.picked?.release.languages, ["spanish"], "Lang picks spanish release");
expectEq(langDecision.rejected.length, 0, "Lang: english ya no se rechaza (preferencia suave)");
expectEq(langDecision.evaluated.length, 2, "Lang: ambos evaluados (english penalizado)");

// ── Caso 3b: must_have spanish pero SOLO hay inglés → fallback al mejor ─────

const onlyEnglishReleases = [
  "Breaking.Bad.S01E01.1080p.WEB-DL.x264-ENGLISH",
  "Breaking.Bad.S01E01.720p.HDTV.x264-ENGLISH",
].map(parseReleaseName);

const fallbackDecision = pickBest({
  releases: onlyEnglishReleases,
  expectedTitle: "Breaking Bad",
  season: 1,
  episode: 1,
  minQuality: "hd",
  languageProfile: { mustHave: ["spanish"], allowUnknownLang: true },
});

assert(fallbackDecision.picked !== null, "Fallback: descarga el mejor inglés en vez de nada");
expectEq(fallbackDecision.picked?.release.quality, "fullhd", "Fallback: elige 1080p sobre 720p");

// ── Caso 4: language must_not_have german ───────────────────────────────────

const germanReleases = [
  "Breaking.Bad.S01E01.1080p.WEB-DL.x264-GERMAN",
  "Breaking.Bad.S01E01.1080p.WEB-DL.x264-ENGLISH",
].map(parseReleaseName);

const germanDecision = pickBest({
  releases: germanReleases,
  expectedTitle: "Breaking Bad",
  season: 1,
  episode: 1,
  minQuality: "hd",
  languageProfile: { mustNotHave: ["german"] },
});

expectEq(germanDecision.picked?.release.languages, ["english"], "German: picks english");
expectEq(germanDecision.rejected.length, 1, "German: rejects german release");

// ── Caso 5: prefiere multi-idioma (preferMulti) ─────────────────────────────

const multiReleases = [
  "Arcane.S01E06.1080p.WEB-DL.x264-MULTi",
  "Arcane.S01E06.1080p.WEB-DL.x264-GROUP",
].map(parseReleaseName);

const multiDecision = pickBest({
  releases: multiReleases,
  expectedTitle: "Arcane",
  season: 1,
  episode: 6,
  minQuality: "hd",
});

// Sin preferMulti, ambos igual de válidos; el primero (multi) gana por ser igual score y primer elemento
expectEq(multiDecision.evaluated.length, 2, "Multi: both evaluated");

// ── Caso 6: title mismatch grave rechazado ──────────────────────────────────

const wrongTitle = [
  "The.Boys.S02E01.1080p.WEB-DL.x264-GROUP",
  "Breaking.Bad.S01E01.1080p.WEB-DL.x264-NTb",
].map(parseReleaseName);

const wrongTitleDecision = pickBest({
  releases: wrongTitle,
  expectedTitle: "Breaking Bad",
  season: 1,
  episode: 1,
  minQuality: "hd",
});

expectEq(wrongTitleDecision.picked?.release.season, 1, "WrongTitle: picks correct series");
expectEq(wrongTitleDecision.rejected.length, 1, "WrongTitle: rejects The Boys (sim < 0.25)");

// ── Caso 7: película, elige bluray sobre webdl a igual calidad ──────────────

const movieReleases = [
  "Interstellar.2014.1080p.WEB-DL.x264-GROUP",
  "Interstellar.2014.1080p.BluRay.x264-AMIABLE",
].map(parseReleaseName);

const movieDecision = pickBest({
  releases: movieReleases,
  expectedTitle: "Interstellar",
  minQuality: "fullhd",
});

expectEq(movieDecision.picked?.release.source, "bluray", "Movie: prefers bluray over webdl");

// ── Caso 8: remux > bluray a igual calidad ──────────────────────────────────

const remuxReleases = [
  "Interstellar.2014.1080p.BluRay.x264-AMIABLE",
  "Interstellar.2014.1080p.BluRay.REMUX.HEVC-FGT",
].map(parseReleaseName);

const remuxDecision = pickBest({
  releases: remuxReleases,
  expectedTitle: "Interstellar",
  minQuality: "fullhd",
});

expectEq(remuxDecision.picked?.release.source, "remux", "Remux: prefers remux over bluray");

// ── Caso 9: empty input ─────────────────────────────────────────────────────

const emptyDecision = pickBest({
  releases: [],
  expectedTitle: "Nothing",
  minQuality: "hd",
});

expectEq(emptyDecision.picked, null, "Empty: no pick");
expectEq(emptyDecision.rejected.length, 0, "Empty: no rejections");

// ── Caso 10: año como señal (match exacto → bonus, sin año → penalización) ──

const yearReleases = [
  "Dune.Part.Two.2024.1080p.WEB-DL.x264-GROUP",
  "Dune.Part.Two.1080p.WEB-DL.x264-GROUP", // sin año
].map(parseReleaseName);

const yearDecision = pickBest({
  releases: yearReleases,
  expectedTitle: "Dune Part Two",
  expectedYear: 2024,
  minQuality: "fullhd",
});

expectEq(yearDecision.picked?.release.year, 2024, "Year: picks release with matching year");
expectEq(yearDecision.evaluated[0]?.yearScore, 5, "Year: match exacto → +5");
expectEq(yearDecision.evaluated[1]?.yearScore, -2, "Year: sin año → -2");

// ── Caso 11: must_have + allowUnknownLang → release sin idioma no se rechaza ──

const unknownLangReleases = [
  "Breaking.Bad.S01E01.1080p.WEB-DL.x264-GROUP", // sin etiqueta de idioma
].map(parseReleaseName);

const unknownLangDecision = pickBest({
  releases: unknownLangReleases,
  expectedTitle: "Breaking Bad",
  season: 1,
  episode: 1,
  minQuality: "hd",
  languageProfile: { mustHave: ["spanish"], allowUnknownLang: true },
});

expectEq(unknownLangDecision.rejected.length, 0, "UnknownLang: not rejected");
assert(unknownLangDecision.picked !== null, "UnknownLang: still picked");
expectEq(unknownLangDecision.picked?.languageScore, -100, "UnknownLang: penalized -100");

// ── Caso 12: must_have SIN allowUnknownLang → release sin idioma SÍ se rechaza ──

const strictLangDecision = pickBest({
  releases: unknownLangReleases,
  expectedTitle: "Breaking Bad",
  season: 1,
  episode: 1,
  minQuality: "hd",
  languageProfile: { mustHave: ["spanish"] },
});

expectEq(strictLangDecision.rejected.length, 1, "StrictLang: rejected (no allowUnknownLang)");
expectEq(strictLangDecision.picked, null, "StrictLang: nothing picked");

// ── Caso 13: must_have en código ISO ("es") vs parser ("spanish") ──────────
// El perfil guarda "es" (ISO-2); el parser emite "spanish". Sin normalizar no
// coincidirían y el release se rechazaría (bug Fase 15).
const isoLangReleases = [
  "Breaking.Bad.S01E01.1080p.WEB-DL.x264-ESPAÑOL-GROUP",
].map(parseReleaseName);

const isoLangDecision = pickBest({
  releases: isoLangReleases,
  expectedTitle: "Breaking Bad",
  season: 1,
  episode: 1,
  minQuality: "hd",
  languageProfile: { mustHave: ["es"], allowUnknownLang: true },
});

expectEq(isoLangDecision.rejected.length, 0, "IsoLang: 'es' matchea release 'spanish'");
assert(isoLangDecision.picked !== null, "IsoLang: picked");
expectEq(isoLangDecision.picked?.languageScore, 1000, "IsoLang: +1000 por match normalizado (el idioma domina calidad/tamaño)");

// ── Caso 14: bonus por título del episodio localizado ────────────────────────
// Un release que incluye el título del episodio suma +20; uno sin él no penaliza
// (p.ej. "Silo 1x01 spanish" sin título de episodio).
const epTitleReleases = [
  "Silo.S01E01.Freedom.Day.1080p.WEB-DL.x264-GROUP",
  "Silo.S01E01.1080p.WEB-DL.x264-SPANISH",
].map(parseReleaseName);

const epTitleDecision = pickBest({
  releases: epTitleReleases,
  expectedTitle: "Silo",
  season: 1,
  episode: 1,
  minQuality: "hd",
  expectedEpisodeTitle: "Freedom Day",
});

const withTitle = epTitleDecision.evaluated.find((e) => e.release.raw.includes("Freedom"));
const withoutTitle = epTitleDecision.evaluated.find((e) => e.release.raw.includes("SPANISH"));
assert(withTitle !== undefined, "EpTitle: found release with episode title");
expectEq(withTitle?.episodeTitleScore, 20, "EpTitle: +20 por coincidir con el título del episodio");
expectEq(withoutTitle?.episodeTitleScore, 0, "EpTitle: 0 sin título de episodio");

// ── Caso 15: tamaño objetivo — premia cercanía al objetivo, castiga el exceso ─
const smallSize = parseReleaseName("Silo.S01E01.1080p.WEB-DL.x264-GROUP");
smallSize.sizeMb = 900; // ~900 MB, cerca del objetivo de 1 GB
const bigSize = parseReleaseName("Silo.S01E01.1080p.WEB-DL.x264-GROUP2");
bigSize.sizeMb = 10240; // 10 GB, muy por encima

const sizeDecision = pickBest({
  releases: [smallSize, bigSize],
  expectedTitle: "Silo",
  season: 1,
  episode: 1,
  minQuality: "hd",
  maxSizeMb: 1024,
});

expectEq(sizeDecision.picked?.release.sizeMb, 900, "Size: elige el release cerca del objetivo");
const smallEval = sizeDecision.evaluated.find((e) => e.release.sizeMb === 900);
const bigEval = sizeDecision.evaluated.find((e) => e.release.sizeMb === 10240);
expectEq(smallEval?.sizeScore, 26, "Size: +26 por estar cerca (900MB vs objetivo 1GB)");
expectEq(bigEval?.sizeScore, -559, "Size: -559 por exceder 10GB vs 1GB (castigo no lineal)");
// Un escalón de calidad (100 pts) NO debe compensar un 10 GB frente a un 900 MB.
expectEq(smallEval!.total > bigEval!.total, true, "Size: 900MB puntúa más que 10GB");

// ── Caso 16: calidad como preferencia — sin 1080p, el 720p se elige igual ──
const only720 = [
  "Silo.S01E06.720p.HDTV.x264-GROUP",
].map(parseReleaseName);

const only720Decision = pickBest({
  releases: only720,
  expectedTitle: "Silo",
  season: 1,
  episode: 6,
  minQuality: "fullhd",
});

expectEq(only720Decision.rejected.length, 0, "Only720: 720p no rechazado (min fullhd)");
expectEq(only720Decision.picked?.release.quality, "hd", "Only720: elige 720p como fallback");

// ── Caso 17: regresión Silo S03E09 — junk en el título no debe rechazar
// releases en español, y el idioma debe dominar calidad/tamaño. ──────────────
const siloReleases = [
  // sin idioma (webrip 1080p)
  "Silo.S03E09.1080p.10bit.WEBRip.6CH.x265.HEVC-PSA.mkv",
  // español (WEBDL 1080p, ES+EN)
  "Silo (2023) - S03E09 - Despedida [WEBDL-1080p] [x265] [ES eac3 5.1, EN eac3 5.1].mkv",
  // español + junk (grupo/web/double tags)
  "Silo 3x09 Despedida [AMZN WEB-DL 1080p EAC3 5.1 Dual][depechemode13 - www.latabernadelcangrejo.eu].mkv",
  // sin idioma + junk (.nfo, DV, grupo)
  "Silo S03E09 Farewell 2160p ATVP WEB-DL DDP5 1 Atmos DV HDR H 265-FLUX.mkv.nfo",
].map(parseReleaseName);

const siloDecision = pickBest({
  releases: siloReleases,
  expectedTitle: "Silo",
  expectedEpisodeTitle: "Despedida",
  season: 3,
  episode: 9,
  minQuality: "fullhd",
  languageProfile: { mustHave: ["es"], allowUnknownLang: true },
});

expectEq(siloDecision.rejected.length, 0, "Silo: ningún rechazo por title mismatch (junk no diluye sim)");
assert(siloDecision.picked !== null, "Silo: picked");
assert(
  siloDecision.picked!.release.languages.includes("spanish"),
  `Silo: el ganador es español (got ${JSON.stringify(siloDecision.picked!.release.languages)})`,
);

// ── Caso 18: "multi" se trata como español latino (no como español de España) ──
const multiRelease = ["Arcane.S01E06.1080p.WEB-DL.x264-MULTi"].map(parseReleaseName);

const multiLatinoDecision = pickBest({
  releases: multiRelease,
  expectedTitle: "Arcane",
  season: 1,
  episode: 6,
  minQuality: "hd",
  languageProfile: { mustHave: ["latino"], allowUnknownLang: true },
});
expectEq(multiLatinoDecision.rejected.length, 0, "Multi: MULTi matchea 'latino' (no se rechaza)");
expectEq(multiLatinoDecision.picked?.languageScore, 1000, "Multi: +1000 como latino");

const multiEsDecision = pickBest({
  releases: multiRelease,
  expectedTitle: "Arcane",
  season: 1,
  episode: 6,
  minQuality: "hd",
  languageProfile: { mustHave: ["es"], allowUnknownLang: true },
});
expectEq(multiEsDecision.rejected.length, 0, "Multi: MULTi ya no se rechaza para 'es' (fallback suave)");
assert(multiEsDecision.picked !== null, "Multi: MULTi sigue siendo elegible como fallback para 'es'");
expectEq(multiEsDecision.picked?.languageScore, -500, "Multi: MULTi penalizado -500 para 'es'");

// ── Caso 19: V.O.S./subs integrados → NO cuenta como español localizado ─────
// "Spanish subs" describe SUBTÍTULOS, no audio: el release se puntúa como
// sin idioma (-100) en vez de +1000 (falso positivo reportado en el buscador).
const voseReleases = [
  "Star Trek Strange New Worlds (2022) 4x06 1080p - Off-Hour (V.O.S. Spa-Eng) - Spanish subs integrados by JuAnItO.mkv",
  "Star.Trek.Strange.New.Worlds.S04E06.1080p.WEB-DL.x264-ESP.mkv",
].map(parseReleaseName);

const voseDecision = pickBest({
  releases: voseReleases,
  expectedTitle: "Star Trek Strange New Worlds",
  season: 4,
  episode: 6,
  minQuality: "fullhd",
  languageProfile: { mustHave: ["es"], allowUnknownLang: true },
});
const voseEval = voseDecision.evaluated.find((e) => e.release.languages[0] === "subs");
const espEval = voseDecision.evaluated.find((e) => e.release.languages.includes("spanish"));
assert(voseEval !== undefined, "Vose: evaluado, no rechazado");
assert(espEval !== undefined, "Vose: el release ESP también evaluado");
expectEq(voseEval?.languageScore, -100, "Vose: -100 como no localizado (NO +1000)");
expectEq(espEval?.languageScore, 1000, "Vose: el release ESP sí suma +1000");
assert(voseEval!.total < espEval!.total, "Vose: V.O.S. queda por debajo del español real");

// ── Caso 20: sourceCount (>3 fuentes da bonus acotado; 1-3 fuentes, 0) ──────
// Disponibilidad en aMule: un release con 1-2 fuentes suele enlazar con
// clientes ausentes y no descarga nunca; a partir de 3 fuentes el bonus
// crece +8 por fuente extra hasta +40 (tie-break, no domina la calidad).
const srcReleases = [
  { ...parseReleaseName("Severance.S01E01.1080p.WEB-DL.x264-GRP"), sources: 1 },
  { ...parseReleaseName("Severance.S01E01.1080p.WEB-DL.x264-OTH"), sources: 8 },
];
const srcDecision = pickBest({
  releases: srcReleases as any,
  expectedTitle: "Severance",
  season: 1,
  episode: 1,
  minQuality: "fullhd",
});
const srcOne = srcDecision.evaluated.find((e) => e.release.sources === 1);
const srcEight = srcDecision.evaluated.find((e) => e.release.sources === 8);
assert(srcOne !== undefined, "sources: 1-fuente evaluado");
assert(srcEight !== undefined, "sources: 8-fuentes evaluado");
expectEq(srcOne?.sourceCountScore, 0, "sources: 0 pts con 1 fuente");
expectEq(srcEight?.sourceCountScore, 40, "sources: 40 pts con 8 fuentes");
expectEq(srcDecision.picked?.release.sources, 8, "sources: gana el de 8 fuentes (misma calidad)");
// sin fuentes → 0 pts (compat: slskd/torrent no rellenan sources)
const noSrc = pickBest({
  releases: [parseReleaseName("Severance.S01E01.1080p.WEB-DL.x264-GRP")],
  expectedTitle: "Severance",
  season: 1,
  episode: 1,
  minQuality: "fullhd",
});
expectEq(noSrc.evaluated[0]?.sourceCountScore, 0, "sources: sin datos → 0 pts");

// ── Caso 21: min_quality = OBJETIVO (cap): uhd NO suma por encima ────────────
// Validado con el log: con min_quality=hd el usuario elegía el fullhd/HDrip y
// no los UHD 2160p de 2-4 GB que ganaban por calidad. El cap hace que la
// calidad extra por encima del pedido no aporte puntos (decide la fuente).
const capReleases = [
  { ...parseReleaseName("Serie.S01E01.2160p.UHD.BluRay.REMUX.HEVC-GRP"), sources: 5 },
  { ...parseReleaseName("Serie.S01E01.720p.HDTV.x264-GRP"), sources: 5 },
];
const capDecision = pickBest({
  releases: capReleases as any,
  expectedTitle: "Serie",
  season: 1,
  episode: 1,
  minQuality: "hd",
});
const capUhd = capDecision.evaluated.find((e) => e.release.quality === "uhd");
const capHd = capDecision.evaluated.find((e) => e.release.quality === "hd");
assert(capUhd !== undefined, "cap: uhd evaluado");
assert(capHd !== undefined, "cap: hd evaluado");
expectEq(capUhd?.qualityScore, 200, "cap: uhd con min hd → 200 (capped, ya no 400)");
expectEq(capHd?.qualityScore, 200, "cap: hd con min hd → 200");
// por debajo del pedido sigue penalizando (compat con el test BB: 720p→100 con min fullhd)
const capLow = pickBest({
  releases: [
    { ...parseReleaseName("Otra.S01E01.720p.HDTV.x264-GRP"), sources: 5 },
    { ...parseReleaseName("Otra.S01E01.1080p.WEB-DL.x264-GRP"), sources: 5 },
  ],
  expectedTitle: "Otra",
  season: 1,
  episode: 1,
  minQuality: "fullhd",
});
const capLowHd = capLow.evaluated.find((e) => e.release.quality === "hd");
expectEq(capLowHd?.qualityScore, 100, "cap: 720p con min fullhd → 100 (penaliza igual)");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
