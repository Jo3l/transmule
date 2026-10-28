// Run: node middleware/tests/transfer-self-copy.test.mjs
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createContext, runInContext } from 'node:vm';
import { test } from 'node:test';

// Load the production engine and virtual resolver without booting Nitro or
// accessing persisted mount configuration. All filesystem I/O stays in /tmp.
const engineSource = stripTypeScriptTypes(fs.readFileSync(
  new URL('../server/utils/transfer-engine.ts', import.meta.url), 'utf8',
)).replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, '').replace(/^export /gm, '');
const resolverSource = stripTypeScriptTypes(fs.readFileSync(
  new URL('../server/utils/remoteMounts.ts', import.meta.url), 'utf8',
)).split('export function resolveVirtualPath')[1];

async function fixture(t, overrides = {}) {
  const root = await fsp.mkdtemp(path.join(tmpdir(), 'transmule-self-copy-test-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const engine = createContext({
    ...fs, ...fsp, ...path, pipeline, Readable, Buffer, randomUUID, AbortController,
    getDownloadsRoot: () => root, getSmbConfigByName: () => null,
    ...overrides,
  });
  runInContext(`function resolveVirtualPath${resolverSource}`, engine);
  runInContext(engineSource, engine);
  const contents = Buffer.alloc(128 * 1024 + 37);
  for (let i = 0; i < contents.length; i++) contents[i] = i % 251;
  await fsp.writeFile(path.join(root, 'source.bin'), contents);
  return { root, engine, contents };
}

async function assertPreserved(file, contents, before) {
  const after = await fsp.stat(file);
  assert.equal(after.size, contents.length, 'source size must be preserved');
  assert.deepEqual(await fsp.readFile(file), contents, 'every source byte must be preserved');
  assert.equal(after.dev, before.dev);
  assert.equal(after.ino, before.ino);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(after.ctimeMs, before.ctimeMs);
}

for (const destination of [
  'home/source.bin',
  'downloads/source.bin',
  'source.bin',
  'home/./source.bin',
  'home/folder/../source.bin',
  'home//source.bin',
  'home\\source.bin',
  'home/%73ource.bin',
]) {
  test(`rejects self-copy to ${destination} before changing the file`, async (t) => {
    const { root, engine, contents } = await fixture(t);
    const file = path.join(root, 'source.bin');
    const before = await fsp.stat(file);
    let copied = 0;
    let error;
    try {
      await engine.copyPath('home/source.bin', destination, {
        onBytes: bytes => { copied += bytes; },
      });
    } catch (err) { error = err; }
    // Check preservation even when an unpatched engine incorrectly succeeds.
    await assertPreserved(file, contents, before);
    assert.match(error?.message ?? '', /same file/i);
    assert.equal(copied, 0);
  });
}

for (const alias of ['hard-link', 'symlink', 'symlink-parent', 'source-symlink']) {
  test(`rejects self-copy through ${alias}`, async (t) => {
    const { root, engine, contents } = await fixture(t);
    const file = path.join(root, 'source.bin');
    let source = 'home/source.bin';
    let destination = 'home/alias.bin';
    if (alias === 'hard-link') await fsp.link(file, path.join(root, 'alias.bin'));
    else if (alias === 'symlink-parent') {
      await fsp.symlink(root, path.join(root, 'alias-dir'));
      destination = 'home/alias-dir/source.bin';
    } else {
      await fsp.symlink('source.bin', path.join(root, 'alias.bin'));
      if (alias === 'source-symlink') [source, destination] = [destination, source];
    }
    const before = await fsp.stat(file);
    let error;
    try { await engine.copyPath(source, destination); } catch (err) { error = err; }
    await assertPreserved(file, contents, before);
    assert.match(error?.message ?? '', /same file/i);
  });
}

for (const existing of [false, true]) {
  test(`copies distinct files with ${existing ? 'existing' : 'new'} destination`, async (t) => {
    const { root, engine, contents } = await fixture(t);
    const file = path.join(root, 'source.bin');
    const before = await fsp.stat(file);
    const destination = path.join(root, 'nested', 'copy.bin');
    if (existing) {
      await fsp.mkdir(path.dirname(destination));
      // Equal contents do not make two distinct files identical.
      await fsp.writeFile(destination, contents);
    }
    let copied = 0;
    await engine.copyPath('home/source.bin', 'home/nested/copy.bin', {
      onBytes: bytes => { copied += bytes; },
    });
    await assertPreserved(file, contents, before);
    assert.equal((await fsp.stat(destination)).size, contents.length);
    assert.deepEqual(await fsp.readFile(destination), contents);
    assert.equal(copied, contents.length);
  });
}

test('keeps normal empty-file copies valid', async (t) => {
  const { root, engine } = await fixture(t);
  await fsp.writeFile(path.join(root, 'empty.bin'), '');
  await engine.copyPath('home/empty.bin', 'home/copy.bin');
  assert.equal((await fsp.stat(path.join(root, 'copy.bin'))).size, 0);
});

test('destination stat errors other than ENOENT fail before writing', async (t) => {
  const { root, engine, contents } = await fixture(t, {
    stat: async (file, ...args) => {
      if (file.endsWith('/copy.bin')) throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
      return fsp.stat(file, ...args);
    },
  });
  const destination = path.join(root, 'copy.bin');
  await fsp.writeFile(destination, contents);
  await assert.rejects(engine.copyPath('home/source.bin', 'home/copy.bin'), { code: 'EACCES' });
  assert.deepEqual(await fsp.readFile(destination), contents);
});


test('missing source preserves an existing destination', async (t) => {
  const { root, engine, contents } = await fixture(t);
  await assert.rejects(engine.copyPath('home/missing.bin', 'home/source.bin'), /Source not found/);
  assert.deepEqual(await fsp.readFile(path.join(root, 'source.bin')), contents);
});

for (const destination of ['', 'downloads']) {
  test(`real queue reports a self-copy to ${destination || 'virtual root'} as an error`, async (t) => {
    const { root, engine, contents } = await fixture(t);
    for (const name of ['files', 'transfer-queue']) {
      const source = stripTypeScriptTypes(fs.readFileSync(
        new URL(`../server/utils/${name}.ts`, import.meta.url), 'utf8',
      )).replace(/^import[^;]+;/gm, '').replace(/^export /gm, '');
      runInContext(source, engine);
    }
    const file = path.join(root, 'source.bin');
    const before = await fsp.stat(file);
    const id = engine.enqueueTransferJob(['home/source.bin'], destination, 'copy');
    const job = engine.__transferJobs.get(id);
    for (let i = 0; i < 200 && ['queued', 'running'].includes(job.status); i++) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(job.status, 'error');
    assert.match(job.error, /same file/i);
    assert.equal(job.bytesDone, 0);
    await assertPreserved(file, contents, before);
  });
}
