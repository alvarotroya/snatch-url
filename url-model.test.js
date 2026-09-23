// Snatch URL - url-model.test.js
//
// Run with `npm test` (node --test, no dependencies).
//
// Every case the assessment report reproduced has a test here: trailing
// slash, %20 vs +, bare flag, duplicate keys, %zz, blank key, blank segment,
// and `@` in a segment.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseUrl,
  buildUrl,
  setSegment,
  deleteSegment,
  setKey,
  setValue,
  deleteEntry,
  addEntry,
  clearEntries,
  toJson,
  safeDecode,
  originParts,
  hostOf,
  normalizeHost,
  setHost,
  BLANK_KEY,
  BLANK_SEGMENT,
  BLANK_HOST,
  BAD_HOST,
  FIXED_HOST,
} from './url-model.js';

// The exact URL the report drove the extension with.
const REPORT_URL =
  'http://127.0.0.1:8765/docs/guide/?q=hello%20world&tags=a,b&redirect=https://x.io/cb&debug&tag=a&tag=b#section-2';

function edit(url, fn) {
  const model = parseUrl(url);
  fn(model);
  return buildUrl(model);
}

// --- Round trip with no edits ---

test('round trips the report URL byte for byte', () => {
  assert.equal(buildUrl(parseUrl(REPORT_URL)), REPORT_URL);
});

for (const url of [
  'https://example.com/',
  'https://example.com/docs/guide/?q=hello%20world&tags=a,b&redirect=https://x.io/cb&debug#section-2',
  'https://example.com/search?q=c%2B%2B+tips&empty=&flag',
  'https://example.com/u/me@corp.com',
  'https://example.com/files/report%zz.pdf?download=1&v=2',
  'https://example.com/a//b',
  'https://example.com:8443/p?x=1#frag',
  'https://user:pw@example.com/p?x=1',
]) {
  test(`round trips unchanged: ${url}`, () => {
    assert.equal(buildUrl(parseUrl(url)), url);
  });
}

test('parseUrl returns null for a non-URL', () => {
  assert.equal(parseUrl('not a url'), null);
});

// --- F1: an edit changes only what it touches ---

test('editing one value leaves every other byte alone', () => {
  const after = edit(REPORT_URL, m => setValue(m, 0, 'hello there'));
  assert.equal(
    after,
    'http://127.0.0.1:8765/docs/guide/?q=hello%20there&tags=a,b&redirect=https://x.io/cb&debug&tag=a&tag=b#section-2'
  );
});

test('a trailing slash survives an edit', () => {
  const after = edit('https://example.com/docs/guide/?q=1', m => setValue(m, 0, '2'));
  assert.equal(after, 'https://example.com/docs/guide/?q=2');
});

test('the absence of a trailing slash also survives', () => {
  const after = edit('https://example.com/docs/guide?q=1', m => setValue(m, 0, '2'));
  assert.equal(after, 'https://example.com/docs/guide?q=2');
});

test('a space is written as %20, never as +', () => {
  const after = edit('https://example.com/p?q=x', m => setValue(m, 0, 'a b'));
  assert.equal(after, 'https://example.com/p?q=a%20b');
});

test('an untouched + is kept as + but reads as a space', () => {
  const model = parseUrl('https://example.com/p?q=c%2B%2B+tips&other=1');
  assert.equal(model.entries[0].value, 'c++ tips');
  setValue(model, 1, '2');
  assert.equal(buildUrl(model), 'https://example.com/p?q=c%2B%2B+tips&other=2');
});

test('a comma is not re-encoded in a value the user edits', () => {
  const after = edit('https://example.com/p?tags=a,b', m => setValue(m, 0, 'a,b,c'));
  assert.equal(after, 'https://example.com/p?tags=a,b,c');
});

test('a URL inside a value keeps its : and /', () => {
  const after = edit('https://example.com/p?redirect=x', m =>
    setValue(m, 0, 'https://x.io/cb')
  );
  assert.equal(after, 'https://example.com/p?redirect=https://x.io/cb');
});

test('an & or = typed into a value is escaped so it cannot split the query', () => {
  const after = edit('https://example.com/p?a=1&b=2', m => setValue(m, 0, 'x&y=z'));
  assert.equal(after, 'https://example.com/p?a=x%26y%3Dz&b=2');
});

test('a # typed into a value is escaped so it cannot start a fragment', () => {
  const after = edit('https://example.com/p?a=1#frag', m => setValue(m, 0, 'x#y'));
  assert.equal(after, 'https://example.com/p?a=x%23y#frag');
});

// --- F1: bare flags ---

test('a bare flag stays bare when another param is edited', () => {
  const after = edit('https://example.com/p?debug&a=1', m => setValue(m, 1, '2'));
  assert.equal(after, 'https://example.com/p?debug&a=2');
});

test('a bare flag reads as an empty value', () => {
  const model = parseUrl('https://example.com/p?debug');
  assert.deepEqual(
    { key: model.entries[0].key, value: model.entries[0].value },
    { key: 'debug', value: '' }
  );
});

test('clearing a bare flag leaves it bare rather than making it debug=', () => {
  const after = edit('https://example.com/p?debug', m => setValue(m, 0, ''));
  assert.equal(after, 'https://example.com/p?debug');
});

test('giving a bare flag a value turns it into a normal param', () => {
  const after = edit('https://example.com/p?debug', m => setValue(m, 0, 'on'));
  assert.equal(after, 'https://example.com/p?debug=on');
});

test('renaming a bare flag keeps it bare', () => {
  const after = edit('https://example.com/p?debug', m => setKey(m, 0, 'verbose'));
  assert.equal(after, 'https://example.com/p?verbose');
});

test('an empty value keeps its = (empty= is not the same as a bare flag)', () => {
  const after = edit('https://example.com/p?empty=&a=1', m => setValue(m, 1, '2'));
  assert.equal(after, 'https://example.com/p?empty=&a=2');
});

// --- F1: duplicate keys ---

test('duplicate keys are kept as separate rows', () => {
  const model = parseUrl('https://example.com/p?tag=a&tag=b');
  assert.deepEqual(
    model.entries.map(e => [e.key, e.value]),
    [['tag', 'a'], ['tag', 'b']]
  );
});

test('editing one of two duplicate keys leaves the other alone', () => {
  const after = edit('https://example.com/p?tag=a&tag=b', m => setValue(m, 1, 'c'));
  assert.equal(after, 'https://example.com/p?tag=a&tag=c');
});

test('deleting one of two duplicate keys keeps the other', () => {
  const after = edit('https://example.com/p?tag=a&tag=b', m => deleteEntry(m, 0));
  assert.equal(after, 'https://example.com/p?tag=b');
});

// --- F2 territory: %zz must not throw in the model ---

test('a malformed escape in a segment decodes to itself instead of throwing', () => {
  const model = parseUrl('https://example.com/files/report%zz.pdf?download=1&v=2');
  assert.deepEqual(model.segments.map(s => s.text), ['files', 'report%zz.pdf']);
  assert.deepEqual(model.entries.map(e => [e.key, e.value]), [
    ['download', '1'],
    ['v', '2'],
  ]);
});

test('a malformed escape survives an edit elsewhere', () => {
  const after = edit('https://example.com/files/report%zz.pdf?v=2', m => setValue(m, 0, '3'));
  assert.equal(after, 'https://example.com/files/report%zz.pdf?v=3');
});

test('a malformed escape in a query value decodes to itself', () => {
  const model = parseUrl('https://example.com/p?a=%zz&b=1');
  assert.equal(model.entries[0].value, '%zz');
  setValue(model, 1, '2');
  assert.equal(buildUrl(model), 'https://example.com/p?a=%zz&b=2');
});

test('safeDecode falls back to the raw text', () => {
  assert.equal(safeDecode('%zz'), '%zz');
  assert.equal(safeDecode('a%20b'), 'a b');
});

// --- F6: blank key ---

test('setKey rejects a blank key and changes nothing', () => {
  const model = parseUrl('https://example.com/p?tags=a,b');
  const result = setKey(model, 0, '   ');
  assert.deepEqual(result, { ok: false, error: BLANK_KEY });
  assert.equal(buildUrl(model), 'https://example.com/p?tags=a,b');
});

test('addEntry rejects a blank key, as it already did', () => {
  const model = parseUrl('https://example.com/p');
  assert.deepEqual(addEntry(model, '', 'x'), { ok: false, error: BLANK_KEY });
  assert.equal(buildUrl(model), 'https://example.com/p');
});

// --- F6: blank segment ---

test('setSegment rejects a blank segment and changes nothing', () => {
  const model = parseUrl('http://127.0.0.1:8765/docs/guide?x=1');
  const result = setSegment(model, 0, '');
  assert.deepEqual(result, { ok: false, error: BLANK_SEGMENT });
  assert.equal(buildUrl(model), 'http://127.0.0.1:8765/docs/guide?x=1');
});

// --- @ in a segment ---

test('an @ in a segment is not re-encoded when that segment is edited', () => {
  const after = edit('https://example.com/u/placeholder', m =>
    setSegment(m, 1, 'me@corp.com')
  );
  assert.equal(after, 'https://example.com/u/me@corp.com');
});

test('an untouched @ segment is left alone', () => {
  const after = edit('https://example.com/u/me@corp.com?a=1', m => setValue(m, 0, '2'));
  assert.equal(after, 'https://example.com/u/me@corp.com?a=2');
});

test('a segment editor escapes / so it cannot add a segment', () => {
  const after = edit('https://example.com/a/b', m => setSegment(m, 1, 'x/y'));
  assert.equal(after, 'https://example.com/a/x%2Fy');
});

test('a space in a segment becomes %20', () => {
  const after = edit('https://example.com/a/b', m => setSegment(m, 1, 'my file'));
  assert.equal(after, 'https://example.com/a/my%20file');
});

// --- Structural edits ---

test('deleting the last segment leaves a root path', () => {
  const after = edit('https://example.com/only?a=1', m => deleteSegment(m, 0));
  assert.equal(after, 'https://example.com/?a=1');
});

test('deleting a middle segment keeps the trailing slash', () => {
  const after = edit('https://example.com/a/b/c/', m => deleteSegment(m, 1));
  assert.equal(after, 'https://example.com/a/c/');
});

test('adding a param to a URL with no query adds the ?', () => {
  const after = edit('https://example.com/p', m => addEntry(m, 'a', 'b c'));
  assert.equal(after, 'https://example.com/p?a=b%20c');
});

test('adding a param appends without touching the existing ones', () => {
  const after = edit(REPORT_URL, m => addEntry(m, 'new', 'v'));
  assert.equal(after, REPORT_URL.replace('#section-2', '&new=v#section-2'));
});

test('clearing every param drops the ? and keeps the hash', () => {
  const after = edit('https://example.com/p/?a=1&b=2#frag', m => clearEntries(m));
  assert.equal(after, 'https://example.com/p/#frag');
});

test('an empty path segment is preserved rather than collapsed', () => {
  const model = parseUrl('http://127.0.0.1:8765//guide?x=1');
  assert.deepEqual(model.segments.map(s => s.raw), ['', 'guide']);
  setValue(model, 0, '2');
  assert.equal(buildUrl(model), 'http://127.0.0.1:8765//guide?x=2');
});

// --- F5: Copy All keeps duplicate keys and the path ---

// toJson builds its query with a null prototype, so compare a plain copy.
const plain = query => ({ ...query });

test('toJson keeps a repeated key as an array of its values', () => {
  const json = toJson(parseUrl('https://example.com/p?tag=a&tag=b&q=1'));
  assert.deepEqual(plain(json.query), { tag: ['a', 'b'], q: '1' });
});

test('toJson collects three values of the same key in order', () => {
  const json = toJson(parseUrl('https://example.com/p?t=a&t=b&t=c'));
  assert.deepEqual(json.query.t, ['a', 'b', 'c']);
});

test('toJson includes the decoded path segments', () => {
  const json = toJson(parseUrl('https://example.com/files/my%20doc.pdf?a=1'));
  assert.deepEqual(json.path, ['files', 'my doc.pdf']);
});

test('toJson reports a bare flag as an empty value', () => {
  const json = toJson(parseUrl('https://example.com/p?debug'));
  assert.deepEqual(plain(json.query), { debug: '' });
});

test('toJson survives a key named __proto__', () => {
  const json = toJson(parseUrl('https://example.com/p?__proto__=1&__proto__=2'));
  assert.deepEqual(plain(json.query).__proto__, ['1', '2']);
});

test('toJson of a query-less URL is an empty object, and still has the path', () => {
  const json = toJson(parseUrl('https://example.com/a/b'));
  assert.deepEqual(json.path, ['a', 'b']);
  assert.equal(JSON.stringify(json.query), '{}');
});

test('toJson leaves a malformed escape as its raw text', () => {
  const json = toJson(parseUrl('https://example.com/files/report%zz.pdf?a=%zz'));
  assert.deepEqual(json.path, ['files', 'report%zz.pdf']);
  assert.deepEqual(plain(json.query), { a: '%zz' });
});

// --- originParts ---

test('originParts splits the prefix and joins back to it exactly', () => {
  for (const url of [
    'https://example.com/p',
    'https://example.com:8443/p?x=1#frag',
    'https://user:pw@example.com/p?x=1',
    'http://[::1]:8080/p',
    'http://127.0.0.1:8765/docs/guide/',
  ]) {
    const model = parseUrl(url);
    const parts = originParts(model);
    assert.equal(parts.map(p => p.raw).join(''), model.prefix, url);
  }
});

test('originParts names scheme, user info, host and port', () => {
  assert.deepEqual(originParts(parseUrl('https://user:pw@example.com:8443/p')), [
    { role: 'scheme', raw: 'https://' },
    { role: 'userinfo', raw: 'user:pw@' },
    { role: 'host', raw: 'example.com' },
    { role: 'port', raw: ':8443' },
  ]);
  assert.deepEqual(originParts(parseUrl('https://example.com/p')), [
    { role: 'scheme', raw: 'https://' },
    { role: 'host', raw: 'example.com' },
  ]);
});

test('originParts falls back to one host part when the pieces do not add up', () => {
  const model = parseUrl('https://example.com/p');
  model.prefix = 'something://else';
  assert.deepEqual(originParts(model), [{ role: 'host', raw: 'something://else' }]);
  model.href = 'not a url';
  assert.deepEqual(originParts(model), [{ role: 'host', raw: 'something://else' }]);
});

// --- setHost ---

test('setHost changes only the host, byte for byte', () => {
  assert.equal(
    edit(REPORT_URL, m => setHost(m, 'example-demo.com')),
    'http://example-demo.com/docs/guide/?q=hello%20world&tags=a,b&redirect=https://x.io/cb&debug&tag=a&tag=b#section-2'
  );
  assert.equal(
    edit('https://shop.example.com:8443/eu/women%27s%20shoes?q=a%20b&debug#reviews', m => setHost(m, 'shop-demo.example.com:8443')),
    'https://shop-demo.example.com:8443/eu/women%27s%20shoes?q=a%20b&debug#reviews'
  );
});

test('setHost keeps the scheme and the user info', () => {
  assert.equal(edit('https://user:pw@example.com/p?x=1', m => setHost(m, 'localhost')), 'https://user:pw@localhost/p?x=1');
  assert.equal(edit('http://example.com/p', m => setHost(m, 'example-demo.com')), 'http://example-demo.com/p');
});

test('the text carries the port: one in it replaces the port, none drops it', () => {
  assert.equal(edit('https://example.com/p', m => setHost(m, 'localhost:3000')), 'https://localhost:3000/p');
  assert.equal(edit('https://localhost:3000/p', m => setHost(m, 'example.com')), 'https://example.com/p');
  assert.equal(edit('https://localhost:3000/p', m => setHost(m, 'localhost:4000')), 'https://localhost:4000/p');
  assert.equal(edit('http://[::1]:8080/p', m => setHost(m, '[::1]:9090')), 'http://[::1]:9090/p');
});

test('setHost normalises the way the address bar does', () => {
  assert.equal(edit('https://example.com/p', m => setHost(m, ' Example-Demo.COM ')), 'https://example-demo.com/p');
  const model = parseUrl('https://example.com:8443/p');
  assert.deepEqual(setHost(model, 'example.com:443'), { ok: true });
  assert.equal(buildUrl(model), 'https://example.com/p');
});

test('setHost refuses a port on a file URL', () => {
  const model = parseUrl('file:///tmp/notes.txt');
  assert.deepEqual(setHost(model, 'nas:2049'), { ok: false, error: BAD_HOST });
  assert.equal(buildUrl(model), 'file:///tmp/notes.txt');
});

test('setHost leaves the parts readable afterwards', () => {
  const model = parseUrl('https://user:pw@example.com:8443/p');
  setHost(model, 'localhost:3000');
  assert.deepEqual(originParts(model), [
    { role: 'scheme', raw: 'https://' },
    { role: 'userinfo', raw: 'user:pw@' },
    { role: 'host', raw: 'localhost' },
    { role: 'port', raw: ':3000' },
  ]);
  assert.equal(hostOf(model), 'localhost:3000');
});

test('setHost refuses what is not a host and leaves the model alone', () => {
  const url = 'https://example.com/p?x=1#f';
  for (const [text, error] of [
    ['', BLANK_HOST],
    ['   ', BLANK_HOST],
    ['a/b', BAD_HOST],
    ['https://x.io', BAD_HOST],
    ['user@host', BAD_HOST],
    ['host?x=1', BAD_HOST],
    ['host#frag', BAD_HOST],
    ['two words', BAD_HOST],
    ['host:notaport', BAD_HOST],
    ['host:99999', BAD_HOST],
  ]) {
    const model = parseUrl(url);
    assert.deepEqual(setHost(model, text), { ok: false, error }, JSON.stringify(text));
    assert.equal(buildUrl(model), url, JSON.stringify(text));
  }
});

test('setHost refuses a URL whose prefix cannot be split', () => {
  const model = parseUrl('mailto:someone@example.com');
  assert.deepEqual(setHost(model, 'example.com'), { ok: false, error: FIXED_HOST });
  assert.equal(model.prefix, 'mailto:');
});

test('hostOf is the host with its port and nothing else', () => {
  assert.equal(hostOf(parseUrl('https://user:pw@example.com:8443/p')), 'example.com:8443');
  assert.equal(hostOf(parseUrl('https://example.com/p')), 'example.com');
  assert.equal(hostOf(parseUrl('mailto:someone@example.com')), '');
});

test('normalizeHost accepts a host, with or without a port, and rejects more than that', () => {
  assert.deepEqual(normalizeHost('Example.com'), { ok: true, host: 'example.com' });
  assert.deepEqual(normalizeHost('localhost:3000'), { ok: true, host: 'localhost:3000' });
  assert.deepEqual(normalizeHost('[::1]:8080'), { ok: true, host: '[::1]:8080' });
  assert.deepEqual(normalizeHost('bücher.de'), { ok: true, host: 'xn--bcher-kva.de' });
  assert.equal(normalizeHost('').ok, false);
  assert.equal(normalizeHost('https://example.com').ok, false);
  assert.equal(normalizeHost('example.com/path').ok, false);
});
