import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';
const transpile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

const source = transpile(readFileSync(new URL('../utils/browserDownload.ts', import.meta.url), 'utf8')).replace('export function', 'function');

test('download is a synchronous HTTP anchor click, with no fetch, Blob or completion claim', () => {
  const events = [];
  const link = { click() { events.push('click'); }, remove() { events.push('remove'); } };
  const context = createContext({ document: {
    createElement(tag) { assert.equal(tag, 'a'); return link; },
    body: { appendChild(value) { assert.equal(value, link); events.push('append'); } },
  } });
  runInContext(source + ';startBrowserDownload("/api/files/download?path=home%2Fcomic.cbz&token=session", "comic.cbz");', context);
  assert.deepEqual(events, ['append', 'click', 'remove']);
  assert.equal(link.href, '/api/files/download?path=home%2Fcomic.cbz&token=session&download=1');
  assert.equal(link.download, 'comic.cbz');
  assert.equal(link.referrerPolicy, 'no-referrer');
});

test('file manager delegates downloads without entering internal transfer queue', () => {
  const page = readFileSync(new URL('../pages/files.vue', import.meta.url), 'utf8');
  const start = page.indexOf('function downloadFile(');
  const fn = page.slice(start, page.indexOf('// ── Upload', start));
  assert.match(fn, /startBrowserDownload\(downloadUrl\(filename\), filename\)/);
  assert.doesNotMatch(fn, /await|fetch|Blob|createObjectURL|addDownloadJob|setDone|transfer/);
  assert.doesNotMatch(page, /addDownloadJob/);
});
