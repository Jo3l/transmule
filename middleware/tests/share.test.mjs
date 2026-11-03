import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';

import {
  CODE_ALPHABET, CODE_LENGTH, generateCode, generateShareId, generateToken,
  hashToken, isValidCode, newShareCredentials, normalizeCode,
  signShareTicket, verifyShareTicket,
} from '../server/utils/share-token.ts';
import {
  isInsideAnyRoot, isInsideRoot, isSharableRoot, normalizeVirtualPath,
} from '../server/utils/share-paths.ts';

const SECRET = 'test-secret-not-the-real-one';

test('token is 256 bits of base64url entropy', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const token = generateToken();
    assert.equal(Buffer.from(token, 'base64url').length, 32, 'token must decode to 32 bytes');
    assert.match(token, /^[A-Za-z0-9_-]+$/, 'token must stay URL-safe');
    assert.ok(!seen.has(token), 'tokens must not repeat');
    seen.add(token);
  }
});

test('share ids are 10 URL-safe characters', () => {
  for (let i = 0; i < 50; i++) assert.match(generateShareId(), /^[0-9a-z]{10}$/);
});

test('codes avoid ambiguous characters and are case-insensitive', () => {
  assert.equal(CODE_LENGTH, 6);
  for (const char of 'IO01io') {
    assert.ok(!CODE_ALPHABET.includes(char), `${char} must not be in the alphabet`);
  }
  for (let i = 0; i < 500; i++) {
    const code = generateCode();
    assert.match(code, /^[2-9A-HJ-NP-Z]{6}$/);
    assert.ok(isValidCode(code));
  }
  assert.equal(normalizeCode(' abc-234 '), 'ABC234');
  assert.equal(normalizeCode('ABC 234'), 'ABC234');
  assert.ok(isValidCode('abc-234'), 'lowercase and dashes are accepted');
  assert.ok(!isValidCode('ABC23'), 'five characters is not a code');
  assert.ok(!isValidCode('ABC230'), '0 is not in the alphabet');
  assert.ok(!isValidCode(''), 'empty is not a code');
});

test('tokens are stored hashed, deterministically', () => {
  const token = generateToken();
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), hashToken(generateToken()));
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
  assert.ok(!hashToken(token).includes(token));
});

test('share ticket round-trips and is bound to one share', () => {
  const ticket = signShareTicket('share-a', SECRET);
  assert.deepEqual(verifyShareTicket(ticket, SECRET), { share: 'share-a' });
  assert.equal(verifyShareTicket(ticket, 'other-secret'), null);
  assert.equal(verifyShareTicket(undefined, SECRET), null);
  assert.equal(verifyShareTicket('not-a-jwt', SECRET), null);
});

test('a user session token is not a share ticket', () => {
  const userToken = jwt.sign({ userId: 1, username: 'jo', isAdmin: false }, SECRET, { expiresIn: '7d' });
  assert.equal(verifyShareTicket(userToken, SECRET), null, 'scope must be checked');
});

test('virtual paths are normalised or rejected', () => {
  assert.equal(normalizeVirtualPath('home/pelis'), 'home/pelis');
  assert.equal(normalizeVirtualPath('home/pelis/'), 'home/pelis');
  assert.equal(normalizeVirtualPath('home\\\\pelis'), 'home/pelis');
  assert.equal(normalizeVirtualPath('home//pelis'), 'home/pelis');
  assert.equal(normalizeVirtualPath('  home/pelis  '), 'home/pelis');
  for (const bad of ['', '   ', '/', '..', 'home/../etc', 'home/./pelis', '../home', '/home/pelis']) {
    assert.equal(normalizeVirtualPath(bad), null, `must reject ${JSON.stringify(bad)}`);
  }
  assert.equal(normalizeVirtualPath(42), null);
});

test('containment is segment-based, never prefix-based', () => {
  assert.ok(isInsideRoot('home/pelis', 'home/pelis'));
  assert.ok(isInsideRoot('home/pelis', 'home/pelis/2024/a.mkv'));
  assert.ok(!isInsideRoot('home/pelis', 'home/pelis2/a.mkv'), 'home/pelis2 is a sibling');
  assert.ok(!isInsideRoot('home/pelis', 'home'), 'parent is outside the root');
  assert.ok(!isInsideRoot('home/pelis', 'home/pelis/../otra'));
  assert.ok(!isInsideRoot('home/pelis', '/home/pelis'));
  assert.ok(!isInsideRoot('', 'home/pelis'));
});

test('multi-root shares accept any of their roots', () => {
  const roots = ['home/pelis', 'home/musica/2024'];
  assert.ok(isInsideAnyRoot(roots, 'home/pelis/a.mkv'));
  assert.ok(isInsideAnyRoot(roots, 'home/musica/2024/b.mp3'));
  assert.ok(!isInsideAnyRoot(roots, 'home/musica/2023/b.mp3'));
  assert.ok(!isInsideAnyRoot(roots, 'home/musica'));
  assert.ok(!isInsideAnyRoot([], 'home/pelis'));
});

test('only concrete items are shareable, never the manager root', () => {
  assert.ok(!isSharableRoot('home'), 'the downloads root is not shareable');
  assert.ok(!isSharableRoot('series'), 'an SMB mount root is not shareable');
  assert.ok(isSharableRoot('home/pelis'));
  assert.ok(isSharableRoot('series/Interestelar.mkv'));
});
