// Snatch URL - value-inspect.test.js
//
// One case per kind of value the inspector recognises, and the cases where it
// must keep its hands off: a plain value is one layer, and a badge only when
// something is really hidden.

import test from 'node:test';
import assert from 'node:assert/strict';

import { peel, badgeFor, plainText } from './value-inspect.js';
import { safeDecode } from './url-model.js';

const kinds = raw => peel(raw).map(l => l.kind);

test('a plain value is a single layer with no badge', () => {
  assert.deepEqual(kinds('price_desc'), ['raw']);
  assert.equal(badgeFor('price_desc'), null);
  assert.equal(plainText('price_desc'), 'price_desc');
});

test('a long plain word is not mistaken for base64', () => {
  for (const word of ['unsubscribed', 'internationals', 'abcdefghijklmnop', '2026-07-01']) {
    assert.deepEqual(kinds(word), ['raw'], word);
  }
});

test('percent-encoding peels to one decoded layer', () => {
  const layers = peel('running%20shoes');
  assert.deepEqual(layers.map(l => [l.kind, l.text]), [['raw', 'running%20shoes'], ['percent', 'running shoes']]);
  assert.equal(badgeFor('running%20shoes'), 'encoded');
});

test('a + reads as a space, as a form would send it', () => {
  assert.equal(plainText('c%2B%2B+tips'), 'c++ tips');
});

test('a malformed escape stays as written', () => {
  assert.deepEqual(kinds('report%zz.pdf'), ['raw']);
  assert.equal(badgeFor('report%zz.pdf'), null);
});

test('an encoded nested URL is flagged on its decoded layer', () => {
  const layers = peel('https%3A%2F%2Fpartner.io%2Fgo%3Fcid%3D42%26utm%3Demail');
  assert.equal(layers.length, 2);
  assert.equal(layers[1].text, 'https://partner.io/go?cid=42&utm=email');
  assert.equal(layers[0].isUrl, false);
  assert.equal(layers[1].isUrl, true);
  assert.equal(badgeFor('https%3A%2F%2Fpartner.io%2Fgo%3Fcid%3D42%26utm%3Demail'), 'url');
});

test('a nested URL written in the clear is still a URL', () => {
  const layers = peel('https://x.io/cb');
  assert.equal(layers.length, 1);
  assert.equal(layers[0].isUrl, true);
  assert.equal(badgeFor('https://x.io/cb'), 'url');
});

test('base64 text peels to the text', () => {
  const raw = btoa('hello from base64');
  assert.deepEqual(kinds(raw), ['raw', 'base64']);
  assert.equal(plainText(raw), 'hello from base64');
  assert.equal(badgeFor(raw), 'base64');
});

test('base64 of JSON peels to pretty JSON', () => {
  const raw = 'eyJ1c2VyIjoiYWx2YXJvIiwicm9sZSI6ImFkbWluIiwic2NvcGUiOlsicmVhZCIsIndyaXRlIl19';
  assert.deepEqual(kinds(raw), ['raw', 'base64', 'json']);
  assert.equal(JSON.parse(plainText(raw)).user, 'alvaro');
  assert.equal(badgeFor(raw), 'json');
});

test('base64url is accepted', () => {
  const raw = btoa('{"a":"?>>?"}').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(kinds(raw), ['raw', 'base64', 'json']);
});

test('base64 that decodes to binary is not called base64', () => {
  assert.deepEqual(kinds('AAAAAAAAAAAAAAAA'), ['raw']);
});

test('percent-encoded base64 peels through both layers', () => {
  const raw = encodeURIComponent(btoa('{"ok":true}'));
  assert.deepEqual(kinds(raw), ['raw', 'percent', 'base64', 'json']);
});

test('a JWT shows its header and payload', () => {
  const b64url = s => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url('{"sub":"alvaro","admin":true}')}.sig-goes-here`;
  const layers = peel(jwt);
  assert.deepEqual(layers.map(l => l.kind), ['raw', 'jwt']);
  assert.match(layers[1].text, /"alg": "HS256"/);
  assert.match(layers[1].text, /"sub": "alvaro"/);
  assert.equal(badgeFor(jwt), 'jwt');
});

test('three dotted words are not a JWT', () => {
  assert.deepEqual(kinds('www.example.com'), ['raw']);
});

test('inline JSON peels to pretty JSON', () => {
  const raw = '%7B%22a%22%3A1%7D';
  assert.deepEqual(kinds(raw), ['raw', 'percent', 'json']);
  assert.equal(plainText(raw), '{\n  "a": 1\n}');
});

test('an empty value is one empty layer', () => {
  assert.deepEqual(peel(''), [{ kind: 'raw', label: 'as written', text: '', isUrl: false }]);
  assert.equal(badgeFor(''), null);
});

test('a path segment keeps + as a plus', () => {
  assert.deepEqual(peel('c++', safeDecode).map(l => l.kind), ['raw']);
  assert.equal(plainText('c++', safeDecode), 'c++');
  assert.equal(badgeFor('c++', safeDecode), null);
  assert.equal(plainText('c%2B%2B%20intro', safeDecode), 'c++ intro');
});
