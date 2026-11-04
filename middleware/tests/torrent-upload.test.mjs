import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import ts from 'typescript';
import * as h3 from 'h3';

const source = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/^import[^;]+;/gm, '').replace('export default', 'globalThis.handler =').replace(/^export /gm, '');
const encode = value => {
  if (Buffer.isBuffer(value) || typeof value === 'string') {
    const data = Buffer.from(value); return Buffer.concat([Buffer.from(`${data.length}:`), data]);
  }
  if (typeof value === 'number') return Buffer.from(`i${value}e`);
  if (Array.isArray(value)) return Buffer.concat([Buffer.from('l'), ...value.map(encode), Buffer.from('e')]);
  return Buffer.concat([Buffer.from('d'), ...Object.keys(value).sort().flatMap(key => [encode(key), encode(value[key])]), Buffer.from('e')]);
};
const info = { length: 1, name: 'synthetic.txt', 'piece length': 16384, pieces: Buffer.alloc(20, 1) };
const valid = encode({ info }); // Synthetic metadata only; never contacts peers or a real daemon.

async function fixture(t) {
  const calls = [];
  let mode = 'added';
  const context = createContext({ ...h3, Buffer, console, defineRouteMeta() {},
    verifyToken: token => token === 'test-session' ? { userId: 1 } : null,
  });
  runInContext(source('../server/utils/requireUser.ts'), context);
  runInContext(source('../server/utils/transmission-client.ts') + '\nglobalThis.Client = TransmissionRPCClient;', context);
  const client = new context.Client({ url: 'http://unused.invalid', username: '', password: '' });
  client.rpc = async (method, params) => {
    calls.push({ method, params });
    if (mode === 'error') throw new Error('private upstream detail');
    if (mode === 'missing') return {};
    return { [mode === 'duplicate' ? 'torrent-duplicate' : 'torrent-added']: { id: 7, name: 'synthetic.txt', hashString: 'test-hash' } };
  };
  context.useTransmissionClient = () => client;
  runInContext(source('../server/utils/torrent-metainfo.ts'), context);
  runInContext(source('../server/api/transmission/upload.post.ts'), context);
  const upload = context.handler;
  runInContext(source('../server/api/transmission/torrents.post.ts'), context);
  const magnet = context.handler;
  runInContext(source('../server/middleware/02.user-auth.ts'), context);
  const auth = context.handler;
  const dispatch = async (path, { body, headers = {}, chunked = false } = {}) => {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
    const req = Readable.from(Array.from({ length: Math.ceil(bytes.length / 65536) }, (_, i) => bytes.subarray(i * 65536, (i + 1) * 65536)));
    req.url = path;
    req.method = 'POST';
    req.headers = { host: 'localhost', ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])) };
    if (!chunked) req.headers['content-length'] = String(bytes.length);
    const event = h3.createEvent(req, new ServerResponse(req));
    try {
      await auth(event);
      const result = await (path.startsWith('/api/transmission/upload') ? upload(event) : magnet(event));
      return new Response(JSON.stringify(result), { status: 200 });
    } catch (error) {
      return new Response(JSON.stringify({ statusMessage: error.statusMessage || error.message }), { status: error.statusCode || 500 });
    }
  };
  const send = (body = valid, query = '?filename=test.torrent&paused=true', headers = {}, chunked = false) => dispatch('/api/transmission/upload' + query, {
    headers: { Cookie: 'auth_token=test-session', 'Content-Type': 'application/x-bittorrent', ...headers }, body, chunked,
  });
  return { calls, context, client, dispatch, send, mode: value => { mode = value; } };
}

test('authenticated upload and magnet routes with mocked Transmission RPC', async t => {
  const f = await fixture(t);
  await t.test('valid file is forwarded unchanged in Base64, with paused and no path override', async () => {
    const r = await f.send(); assert.equal(r.status, 200);
    assert.equal((await r.json()).duplicate, false);
    assert.equal(f.calls.at(-1).method, 'torrent-add');
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1).params)), { metainfo: valid.toString('base64'), paused: true });
  });
  await t.test('duplicates return existing torrent and explicit status', async () => {
    f.mode('duplicate'); const r = await f.send();
    assert.equal(r.status, 200); const body = await r.json();
    assert.equal(body.duplicate, true); assert.equal(body.torrent.id, 7); f.mode('added');
  });
  await t.test('missing and expired authentication, including forged query token, are rejected', async () => {
    const before = f.calls.length;
    for (const cookie of ['', 'auth_token=expired']) {
      const r = await f.send(valid, '?filename=test.torrent&token=test-session', { Cookie: cookie });
      assert.equal(r.status, 401); await r.text();
    }
    assert.equal(f.calls.length, before);
    const bearer = await f.send(valid, '?filename=test.torrent', { Cookie: '', Authorization: 'Bearer test-session' });
    assert.equal(bearer.status, 200); await bearer.text();
  });
  await t.test('empty, malformed, trailing bytes, wrong structure, unsafe paths and piece counts fail', async () => {
    const before = f.calls.length;
    for (const data of [Buffer.alloc(0), Buffer.from('not a torrent'), Buffer.from('d4:info'),
      Buffer.concat([valid, Buffer.from('junk')]), encode({ info: {} }), encode({ info: { ...info, name: '../escape' } }),
      encode({ info: { ...info, pieces: Buffer.alloc(19) } }),
      encode({ info: { name: 'dir', 'piece length': 16384, pieces: Buffer.alloc(20), files: [{ length: 1, path: ['..', 'escape'] }] } }),
      Buffer.from('d4:infod4:name1:a4:name1:bee'), Buffer.from('l'.repeat(66) + 'e'.repeat(66))]) {
      const r = await f.send(data); assert.equal(r.status, 400, data.subarray(0, 60).toString()); await r.text();
    }
    assert.equal(f.calls.length, before);
  });
  await t.test('filename, MIME type, arbitrary paths and option types are checked', async () => {
    for (const query of ['?filename=test.txt', '?filename=..%2Ftest.torrent', '?filename=test.torrent&download_dir=/tmp', '?filename=test.torrent&paused=1', '?filename=a.torrent&filename=b.torrent']) {
      const r = await f.send(valid, query); assert.equal(r.status, 400); await r.text();
    }
    const r = await f.send(valid, '?filename=test.torrent', { 'Content-Type': 'text/plain' });
    assert.equal(r.status, 415); await r.text();
  });
  await t.test('limit applies to Content-Length and chunked requests; exact boundary is accepted', async () => {
    const limit = 5 * 1024 * 1024;
    // Add opaque metadata to reach the exact limit without modifying the info hash.
    let padding = limit - valid.length - 14;
    let boundary = encode({ info, padding: Buffer.alloc(padding) });
    padding += limit - boundary.length; boundary = encode({ info, padding: Buffer.alloc(padding) });
    assert.equal(boundary.length, limit);
    const ok = await f.send(boundary); assert.equal(ok.status, 200); await ok.text();
    const tooBig = await f.send(Buffer.alloc(limit + 1)); assert.equal(tooBig.status, 413); await tooBig.text();
    const chunked = await f.send(Buffer.alloc(limit + 1), '?filename=test.torrent', {}, true);
    assert.equal(chunked.status, 413);
  });
  await t.test('RPC failures, network errors and empty results are safe actionable errors', async () => {
    for (const mode of ['error', 'missing']) {
      f.mode(mode); const r = await f.send(); assert.equal(r.status, 503);
      const text = await r.text(); assert.match(text, /Transmission unavailable/); assert.doesNotMatch(text, /private upstream/);
    }
    f.mode('added');
  });
  await t.test('existing multiline magnet endpoint retains filename and options', async () => {
    const filename = 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789';
    const r = await f.dispatch('/api/transmission/torrents', { headers: { Cookie: 'auth_token=test-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', filename, paused: true }) });
    assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1).params)), { filename, paused: true });
  });
  await t.test('multifile and v2 metadata are accepted; malformed v2 trees fail', async () => {
    for (const info of [
      { name: 'dir', 'piece length': 16384, pieces: Buffer.alloc(20), files: [{ length: 1, path: ['safe.txt'] }] },
      { name: 'v2', 'meta version': 2, 'piece length': 16384, 'file tree': { 'safe.txt': { '': { length: 1, 'pieces root': Buffer.alloc(32, 1) } } } },
    ]) {
      const r = await f.send(encode({ info })); assert.equal(r.status, 200); await r.text();
    }
    const r = await f.send(encode({ info: { name: 'v2', 'meta version': 2, 'piece length': 16384, 'file tree': { '..': { '': { length: 0 } } } } }));
    assert.equal(r.status, 400); await r.text();
  });
});
