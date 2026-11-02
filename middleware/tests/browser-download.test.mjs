import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { createContext, runInContext } from 'node:vm';
import { createServer } from 'node:http';
import { test } from 'node:test';
import * as h3 from 'h3';
import { pipeline } from 'node:stream/promises';

const transpile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

const routeSource = transpile(fs.readFileSync(new URL('../server/api/files/download.get.ts', import.meta.url), 'utf8'))
  .replace(/^import[^;]+;/gm, '').replace('export default', 'globalThis.handler =');
const authSource = transpile(fs.readFileSync(new URL('../server/middleware/02.user-auth.ts', import.meta.url), 'utf8'))
  .replace('export default', 'globalThis.authHandler =');
const resolverTail = transpile(fs.readFileSync(new URL('../server/utils/remoteMounts.ts', import.meta.url), 'utf8'))
  .split('export function resolveVirtualPath')[1];
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

test('real HTTP download route streams large original bytes, authenticates and supports ranges', async t => {
  const root = await fsp.mkdtemp(path.join(tmpdir(), 'transmule-http-download-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const name = "Cómic 'oro' (1); prueba.cbz";
  const file = path.join(root, name);
  const size = 192 * 1024 * 1024 + 137;
  const handle = await fsp.open(file, 'wx');
  await handle.write(Buffer.from('PK original comic fixture'));
  await handle.truncate(size);
  await handle.close();
  await fsp.writeFile(path.join(root, 'song.mp3'), 'test audio');
  await fsp.writeFile(path.join(root, 'empty.cbz'), '');
  const original = await fsp.stat(file);
  const sha256 = await digest(file);
  let maxReadBuffer = 0;
  let lastStream;
  const context = createContext({
    ...h3, ...fs, ...path, console, pipeline,
    defineRouteMeta() {},
    requireUser: e => { if (!e.context.user) throw h3.createError({ statusCode: 401 }); },
    verifyToken: token => token === 'test-session' ? { userId: 1 } : null,
    getDownloadsRoot: () => root, getSmbConfigByName: () => null,
    createReadStream: (...args) => {
      const stream = fs.createReadStream(...args);
      lastStream = stream;
      assert.ok(stream.readableHighWaterMark <= 65536);
      stream.on('data', chunk => { maxReadBuffer = Math.max(maxReadBuffer, chunk.length); });
      return stream;
    },
  });
  runInContext(`function resolveVirtualPath${resolverTail}`, context);
  runInContext(authSource, context);
  runInContext(routeSource, context);
  const app = h3.createApp();
  app.use(context.authHandler);
  app.use(context.handler);
  const server = createServer(h3.toNodeListener(app));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/files/download`;
  const url = (filename = name) => base + '?path=' + encodeURIComponent('home/' + filename);
  const cookie = { Cookie: 'auth_token=test-session' };

  await t.test('cookie-authenticated 192 MiB response has attachment headers and exact hash', async () => {
    const response = await fetch(url() + '&download=1', { headers: cookie });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Length'), String(size));
    assert.equal(response.headers.get('Content-Type'), 'application/octet-stream');
    assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const disposition = response.headers.get('Content-Disposition');
    assert.match(disposition, /^attachment; filename="C_mic/);
    assert.equal(decodeURIComponent(disposition.split("filename*=UTF-8''")[1]), name);
    assert.match(disposition, /%27oro%27%20%281%29/);
    const hash = createHash('sha256');
    let received = 0;
    for await (const chunk of response.body) { received += chunk.length; hash.update(chunk); }
    assert.equal(received, size);
    assert.equal(hash.digest('hex'), sha256);
    assert.ok(maxReadBuffer <= 65536);
  });
  await t.test('unauthenticated and expired sessions fail; query and bearer sessions work', async () => {
    for (const headers of [{}, { Cookie: 'auth_token=expired' }]) {
      const r = await fetch(url(), { headers });
      assert.equal(r.status, 401); await r.text();
    }
    for (const [target, headers] of [
      [url() + '&token=test-session', {}],
      [url(), { Authorization: 'Bearer test-session' }],
    ]) {
      const r = await fetch(target, { headers: { ...headers, Range: 'bytes=0-23' } });
      assert.equal(r.status, 206);
      assert.equal(await r.text(), 'PK original comic fixtur');
    }
  });
  await t.test('bounded, open, suffix and clamped ranges have exact lengths', async () => {
    for (const [range, length] of [['bytes=0-3', 4], [`bytes=${size - 3}-`, 3], ['bytes=-17', 17], [`bytes=${size - 2}-${size + 10}`, 2]]) {
      const r = await fetch(url(), { headers: { ...cookie, Range: range } });
      assert.equal(r.status, 206);
      assert.equal(r.headers.get('Content-Length'), String(length));
      assert.equal((await r.arrayBuffer()).byteLength, length);
      assert.match(r.headers.get('Content-Range'), /bytes \d+-\d+\/201326729/);
    }
    for (const range of ['bytes=999999999-', 'bytes=8-2', 'bytes=-0']) {
      const r = await fetch(url(), { headers: { ...cookie, Range: range } });
      assert.equal(r.status, 416); await r.text();
    }
  });
  await t.test('preview audio remains playable; explicit download forces attachment', async () => {
    for (const force of ['', '&download=1']) {
      const r = await fetch(url('song.mp3') + force, { headers: cookie });
      assert.equal(r.headers.get('Content-Type'), force ? 'application/octet-stream' : 'audio/mpeg');
      assert.equal(Boolean(r.headers.get('Content-Disposition')), Boolean(force));
      assert.equal(await r.text(), 'test audio');
    }
  });
  await t.test('empty, missing files, directories and missing path', async () => {
    for (const [target, status] of [[url('empty.cbz'), 200], [url('missing.cbz'), 404], [base + '?path=home', 400], [base, 400]]) {
      const r = await fetch(target, { headers: cookie });
      assert.equal(r.status, status); await r.text();
    }
  });
  await t.test('cancelled download preserves original contents and metadata', async () => {
    const controller = new AbortController();
    const r = await fetch(url(), { headers: cookie, signal: controller.signal });
    const reader = r.body.getReader();
    await reader.read(); controller.abort();
    for (let i = 0; i < 50 && !lastStream.closed; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(lastStream.closed, true, 'cancel must close the server file descriptor');
    const st = await fsp.stat(file);
    for (const key of ['size', 'ino', 'mtimeMs', 'ctimeMs']) assert.equal(st[key], original[key]);
    assert.equal(await digest(file), sha256);
  });
});
