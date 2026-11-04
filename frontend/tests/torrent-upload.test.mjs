import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { readFileSync, readdirSync } from 'node:fs';
import { URL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const page = readFileSync(new URL('../pages/index.vue', import.meta.url), 'utf8');
const extract = (start, end) => ts.transpileModule(page.slice(page.indexOf(start), page.indexOf(end, page.indexOf(start))), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(mode = 'file', fetch = async () => ({ duplicate: false })) {
  const calls = [], toasts = [], history = [];
  const ctx = createContext({
    torrentInputMode: { value: mode }, torrentFile: { value: new File(['fixture'], 'synthetic.torrent') },
    torrentForm: { url: '', paused: true }, addingTorrent: { value: false }, showAddTorrent: { value: true },
    apiFetch: async (...args) => { calls.push(args); return fetch(...args); },
    addToast: (...args) => toasts.push(args), t: key => key,
    refresh: async () => {}, recordDownload: (...args) => history.push(args),
  });
  runInContext(extract('function selectTorrentFile(', 'const showAddPyload'), ctx);
  runInContext(extract('async function addTorrent()', '// ── Lifecycle'), ctx);
  return { ctx, calls, toasts, history };
}

test('native file validation rejects wrong extension, empty and oversized files', () => {
  const { ctx, toasts } = fixture();
  for (const file of [{ name: 'a.txt', size: 1 }, { name: 'a.torrent', size: 0 }, { name: 'a.torrent', size: 5 * 1024 * 1024 + 1 }]) {
    const input = { files: [file], value: 'selected' };
    ctx.selectTorrentFile({ target: input });
    assert.equal(ctx.torrentFile.value, null); assert.equal(input.value, '');
  }
  const file = { name: 'a.TORRENT', size: 5 * 1024 * 1024 };
  ctx.selectTorrentFile({ target: { files: [file] } });
  assert.equal(ctx.torrentFile.value, file); assert.equal(toasts.length, 3);
});

test('file submission uses authenticated API wrapper, binary body and paused flag', async () => {
  const f = fixture(); await f.ctx.addTorrent();
  assert.equal(f.calls.length, 1);
  const [path, options] = f.calls[0];
  assert.match(path, /^\/api\/transmission\/upload\?filename=synthetic.torrent&paused=true$/);
  assert.equal(options.body, f.ctx.torrentFile.value);
  assert.equal(options.headers['Content-Type'], 'application/x-bittorrent');
  assert.equal(options.retry, 0);
  assert.equal(f.ctx.showAddTorrent.value, false); assert.equal(f.ctx.addingTorrent.value, false);
  assert.match(f.toasts[0][0], /success$/);
});

test('duplicate is informative; invalid file, oversized and network failures allow retry', async () => {
  const duplicate = fixture('file', async () => ({ duplicate: true })); await duplicate.ctx.addTorrent();
  assert.match(duplicate.toasts[0][0], /duplicate$/); assert.equal(duplicate.toasts[0][1], 'info');
  for (const [status, key] of [[400, 'invalidFile'], [413, 'tooLarge'], [415, 'invalidFile'], [503, 'uploadError'], [0, 'uploadError']]) {
    const f = fixture('file', async () => { throw { response: { status } }; }); await f.ctx.addTorrent();
    assert.equal(f.ctx.showAddTorrent.value, true); assert.ok(f.ctx.torrentFile.value);
    assert.equal(f.ctx.addingTorrent.value, false); assert.ok(f.toasts[0][0].endsWith(key));
  }
});

test('empty selections and double submissions do not issue requests', async () => {
  const f = fixture(); f.ctx.torrentFile.value = null; await f.ctx.addTorrent();
  f.ctx.addingTorrent.value = true; await f.ctx.addTorrent(); assert.equal(f.calls.length, 0);
});

test('multiline magnets preserve existing API, paused option and history', async () => {
  const f = fixture('magnet');
  f.ctx.torrentForm.url = '  magnet:?xt=urn:btih:first\n\nmagnet:?xt=urn:btih:second  ';
  await f.ctx.addTorrent(); assert.equal(f.calls.length, 2);
  for (const [i, [path, options]] of f.calls.entries()) {
    assert.equal(path, '/api/transmission/torrents'); assert.equal(options.body.action, 'add');
    assert.equal(options.body.filename, i === 0 ? 'magnet:?xt=urn:btih:first' : 'magnet:?xt=urn:btih:second');
    assert.equal(options.body.paused, true);
  }
  assert.equal(f.history.length, 2); assert.equal(f.ctx.torrentForm.url, '');
});

test('all supported locales translate every upload message', () => {
  for (const file of readdirSync(new URL('../i18n/locales/', import.meta.url))) {
    if (!file.endsWith('.json')) continue;
    const locale = JSON.parse(readFileSync(new URL('../i18n/locales/' + file, import.meta.url), 'utf8'));
    for (const key of ['magnetTab', 'fileTab', 'fileLabel', 'fileHelp', 'invalidFile', 'tooLarge', 'success', 'duplicate', 'uploadError']) {
      assert.ok(locale.downloads.addTorrentDialog[key], `${file}: ${key}`);
    }
  }
});
