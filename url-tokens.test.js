// Snatch URL - url-tokens.test.js
//
// The one property that matters: the tokens tile the built URL with no gaps
// and no overlap, so every offset is one the popup can trust. Then the shape
// of the tokens on the awkward URLs the model tests already cover.

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseUrl, setValue, deleteEntry } from './url-model.js';
import {
  tokenize,
  tokenizeModel,
  tokenAt,
  tokensIn,
  groupRange,
  isPunct,
  ROLE_LABEL,
} from './url-tokens.js';

const REPORT_URL =
  'http://127.0.0.1:8765/docs/guide/?q=hello%20world&tags=a,b&redirect=https://x.io/cb&debug&tag=a&tag=b#section-2';

// The review's samples, so the popup and the demo run on tokens that are
// known to tile.
const SAMPLES = [
  'https://example.com/docs/guide?page=2',
  'https://shop.example.com:8443/eu/catalog/women%27s%20shoes/item'
    + '?q=running%20shoes&sort=price_desc&tags=sale,new'
    + '&ref=https%3A%2F%2Fpartner.io%2Fgo%3Fcid%3D42%26utm%3Demail'
    + '&debug&tag=a&tag=b#reviews',
  'https://analytics.example.co.uk:8443/v2/reports/2026/q3/campaign%20roll-up/export'
    + '?state=eyJ1c2VyIjoiYWx2YXJvIiwicm9sZSI6ImFkbWluIiwic2NvcGUiOlsicmVhZCIsIndyaXRlIl19'
    + '&filters=country%3Ade%2Ces%7Cdevice%3Amobile%7Cplan%3Apro%2Cteam'
    + '&from=2026-07-01&to=2026-09-30&granularity=week&currency=EUR'
    + '&next=https%3A%2F%2Fapp.example.co.uk%2Fdash%3Ftab%3Dspend%26range%3D90d'
    + '&utm_source=newsletter&utm_medium=email&utm_campaign=q3%20wrap&debug#panel-spend',
];

/** Tokens must tile the text: contiguous, in order, covering every byte. */
function assertTiles({ text, tokens }) {
  let pos = 0;
  for (const t of tokens) {
    assert.equal(t.start, pos, `token ${t.id} starts at ${t.start}, expected ${pos}`);
    assert.equal(text.slice(t.start, t.end), t.raw, `token ${t.id} raw does not match the text`);
    pos = t.end;
  }
  assert.equal(pos, text.length, 'tokens stop short of the end of the text');
  assert.equal(tokens.map(t => t.raw).join(''), text);
}

const roles = tokens => tokens.map(t => t.role);
const byId = (tokens, id) => tokens.find(t => t.id === id);

// --- Tiling ---

for (const url of [
  REPORT_URL,
  ...SAMPLES,
  'https://example.com/',
  'https://example.com/search?q=c%2B%2B+tips&empty=&flag',
  'https://example.com/u/me@corp.com',
  'https://example.com/files/report%zz.pdf?download=1&v=2',
  'https://example.com/a//b',
  'https://example.com:8443/p?x=1#frag',
  'https://user:pw@example.com/p?x=1',
  'http://[::1]:8080/p?x=1',
]) {
  test(`tokens tile the text and the text is the input: ${url}`, () => {
    const result = tokenize(url);
    assert.equal(result.ok, true);
    assert.equal(result.text, url);
    assertTiles(result);
  });
}

test('tokenize refuses a non-URL', () => {
  assert.deepEqual(tokenize('not a url'), { ok: false, error: 'Not a URL.' });
});

// --- Shape ---

test('the origin splits into scheme, host and port', () => {
  const { tokens } = tokenize('https://example.com:8443/p?x=1#frag');
  assert.deepEqual(roles(tokens), ['scheme', 'host', 'port', 'sep', 'seg', 'qmark', 'key', 'eq', 'val', 'hash']);
  assert.equal(byId(tokens, 'host-1').raw, 'example.com');
  assert.equal(tokens[2].raw, ':8443');
  assert.deepEqual(tokens.map(t => t.group), [
    'origin', 'origin', 'origin', 'path', 'path', 'query', 'query', 'query', 'query', 'hash',
  ]);
});

test('user info is its own token', () => {
  const { tokens } = tokenize('https://user:pw@example.com/p');
  assert.deepEqual(roles(tokens), ['scheme', 'userinfo', 'host', 'sep', 'seg']);
  assert.equal(tokens[1].raw, 'user:pw@');
});

test('a root path is a single separator', () => {
  const { tokens } = tokenize('https://example.com/');
  assert.deepEqual(roles(tokens), ['scheme', 'host', 'sep']);
});

test('a trailing slash is a trailing separator', () => {
  const { tokens } = tokenize('https://example.com/docs/guide/');
  assert.deepEqual(roles(tokens), ['scheme', 'host', 'sep', 'seg', 'sep', 'seg', 'sep']);
});

test('an empty segment is a zero-width token with the right index', () => {
  const { tokens } = tokenize('https://example.com/a//b');
  const segs = tokens.filter(t => t.role === 'seg');
  assert.deepEqual(segs.map(t => [t.index, t.raw]), [[0, 'a'], [1, ''], [2, 'b']]);
  assert.equal(segs[1].start, segs[1].end);
});

test('a bare flag is a key with no = and no value', () => {
  const { tokens } = tokenize('https://example.com/p?debug&a=1');
  const query = tokens.filter(t => t.group === 'query');
  assert.deepEqual(roles(query), ['qmark', 'key', 'amp', 'key', 'eq', 'val']);
  assert.equal(query[1].index, 0);
  assert.equal(query[3].index, 1);
});

test('duplicate keys keep separate indices', () => {
  const { tokens } = tokenize('https://example.com/p?tag=a&tag=b');
  const keys = tokens.filter(t => t.role === 'key');
  assert.deepEqual(keys.map(t => t.id), ['key-0', 'key-1']);
});

test('raw and text differ only by decoding', () => {
  const { tokens } = tokenize('https://example.com/women%27s%20shoes?q=c%2B%2B+tips#sec%20two');
  const seg = byId(tokens, 'seg-0');
  assert.equal(seg.raw, 'women%27s%20shoes');
  assert.equal(seg.text, "women's shoes");
  const val = byId(tokens, 'val-0');
  assert.equal(val.raw, 'c%2B%2B+tips');
  assert.equal(val.text, 'c++ tips');
  const hash = tokens.at(-1);
  assert.equal(hash.raw, '#sec%20two');
  assert.equal(hash.text, 'sec two');
});

test('a malformed escape reads as its raw text', () => {
  const { tokens } = tokenize('https://example.com/files/report%zz.pdf?v=%zz');
  assert.equal(byId(tokens, 'seg-1').text, 'report%zz.pdf');
  assert.equal(byId(tokens, 'val-0').text, '%zz');
});

test('punctuation is punctuation and parts are not', () => {
  const { tokens } = tokenize(REPORT_URL);
  for (const t of tokens) {
    assert.equal(isPunct(t.role), ['scheme', 'sep', 'qmark', 'eq', 'amp'].includes(t.role), t.role);
    assert.ok(ROLE_LABEL[t.role], `no label for ${t.role}`);
  }
});

test('an origin the arithmetic cannot split is one opaque host token', () => {
  const model = parseUrl('https://example.com/p');
  model.prefix = 'weird://thing';
  model.href = 'https://example.com/p';
  const { tokens } = tokenizeModel(model);
  assert.deepEqual(roles(tokens).slice(0, 2), ['host', 'sep']);
  assert.equal(tokens[0].raw, 'weird://thing');
});

// --- Tokens follow the model ---

test('tokens are laid over the model as it is now, not as it was parsed', () => {
  const model = parseUrl('https://example.com/p?a=1&b=2&c=3');
  setValue(model, 1, 'two words');
  deleteEntry(model, 0);
  const result = tokenizeModel(model);
  assert.equal(result.text, 'https://example.com/p?b=two%20words&c=3');
  assertTiles(result);
  assert.equal(byId(result.tokens, 'key-0').raw, 'b');
  assert.equal(byId(result.tokens, 'val-0').text, 'two words');
  assert.equal(byId(result.tokens, 'key-1').raw, 'c');
});

// --- Selection maths ---

const TYPICAL = tokenize(SAMPLES[1]);

test('tokenAt finds the part under an offset, and ties go to the token that starts there', () => {
  const host = byId(TYPICAL.tokens, 'host-1');
  assert.equal(tokenAt(TYPICAL.tokens, host.start), host);
  assert.equal(tokenAt(TYPICAL.tokens, host.end - 1), host);
  assert.equal(tokenAt(TYPICAL.tokens, host.end).role, 'port');
  assert.equal(tokenAt(TYPICAL.tokens, TYPICAL.text.length).role, 'hash');
  assert.equal(tokenAt(TYPICAL.tokens, TYPICAL.text.length + 1), null);
});

test('tokensIn returns every token a range touches, in order', () => {
  const q = byId(TYPICAL.tokens, 'val-0');       // running%20shoes
  const sort = byId(TYPICAL.tokens, 'val-1');    // price_desc
  const hit = tokensIn(TYPICAL.tokens, q.start + 2, sort.end - 2);
  assert.deepEqual(hit.map(t => t.id), ['val-0', 'amp-15', 'key-1', 'eq-17', 'val-1']);
});

test('a caret on the & after a value still means the value', () => {
  const q = byId(TYPICAL.tokens, 'val-0');
  assert.deepEqual(tokensIn(TYPICAL.tokens, q.end, q.end).map(t => t.id), ['val-0']);
});

test('a caret inside a part means that part', () => {
  const host = byId(TYPICAL.tokens, 'host-1');
  assert.deepEqual(tokensIn(TYPICAL.tokens, host.start + 3, host.start + 3), [host]);
});

test('groupRange covers a whole section and is null for a missing one', () => {
  const query = groupRange(TYPICAL.tokens, 'query');
  assert.equal(TYPICAL.text.slice(query.start, query.end),
    '?q=running%20shoes&sort=price_desc&tags=sale,new'
    + '&ref=https%3A%2F%2Fpartner.io%2Fgo%3Fcid%3D42%26utm%3Demail&debug&tag=a&tag=b');
  const hash = groupRange(TYPICAL.tokens, 'hash');
  assert.equal(TYPICAL.text.slice(hash.start, hash.end), '#reviews');
  assert.equal(groupRange(tokenize('https://example.com/').tokens, 'query'), null);
});
