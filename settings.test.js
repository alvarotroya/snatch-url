// Snatch URL - settings.test.js
//
// Run with `npm test` (node --test, no dependencies).
//
// The text form of the host groups, the lookups the popup makes, and the
// storage fallback from sync to local, driven by a fake chrome object.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  parseGroups,
  formatGroups,
  normalizeSettings,
  groupOf,
  alternatives,
  loadSettings,
  saveSettings,
} from './settings.js';
import { parseUrl } from './url-model.js';

const GROUPS = [
  ['example.com', 'example-demo.com', 'http://localhost:3000'],
  ['shop.example.com:8443', 'shop-demo.example.com:8443'],
];

const at = url => parseUrl(url);

// --- The text form ---

test('parseGroups reads one group per line, hosts split by commas', () => {
  const { groups, errors } = parseGroups(
    'example.com, example-demo.com,HTTP://localhost:3000,\n\n  shop.example.com:8443 ,shop-demo.example.com:8443  \n'
  );
  assert.deepEqual(groups, GROUPS);
  assert.deepEqual(errors, []);
});

test('parseGroups normalises hosts and ignores repeats', () => {
  const { groups, errors } = parseGroups('Example.COM, example.com, EXAMPLE-demo.com\n');
  assert.deepEqual(groups, [['example.com', 'example-demo.com']]);
  assert.deepEqual(errors, []);
});

test('parseGroups takes neither spaces nor # as anything but part of a host', () => {
  const { groups, errors } = parseGroups('example.com example-demo.com\n# note, a.com');
  assert.deepEqual(groups, []);
  assert.deepEqual(errors.map(e => [e.line, e.text]), [
    [1, 'example.com example-demo.com'],
    [2, '# note'],
    [2, 'a.com'],
  ]);
});

test('parseGroups reports what is not a host, with its line', () => {
  const { groups, errors } = parseGroups('example.com, ftp://example-demo.com\nlocalhost:3000, localhost:4000');
  assert.deepEqual(groups, [['localhost:3000', 'localhost:4000']]);
  assert.equal(errors.length, 2);
  assert.equal(errors[0].line, 1);
  assert.equal(errors[0].text, 'ftp://example-demo.com');
  assert.equal(errors[1].line, 1);
  assert.equal(errors[1].text, 'example.com');
  assert.match(errors[1].error, /at least two/);
});

test('a line with one host is an error, not a group', () => {
  const { groups, errors } = parseGroups('example.com');
  assert.deepEqual(groups, []);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 1);
});

test('formatGroups and parseGroups round trip', () => {
  const text = formatGroups(GROUPS);
  assert.equal(text, 'example.com, example-demo.com, http://localhost:3000\nshop.example.com:8443, shop-demo.example.com:8443');
  assert.deepEqual(parseGroups(text).groups, GROUPS);
  assert.equal(formatGroups([]), '');
});

// --- Stored values ---

test('normalizeSettings keeps only lists of at least two valid hosts', () => {
  assert.deepEqual(normalizeSettings(null), { groups: [] });
  assert.deepEqual(normalizeSettings({}), { groups: [] });
  assert.deepEqual(normalizeSettings({ groups: 'nope' }), { groups: [] });
  assert.deepEqual(normalizeSettings({ groups: [['a.com'], ['b.com', 42, 'not a host', 'C.com'], 'x'] }), {
    groups: [['b.com', 'c.com']],
  });
  assert.deepEqual(normalizeSettings({ groups: GROUPS }), { groups: GROUPS });
});

test('the defaults have no groups and are frozen', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { groups: [] });
  assert.ok(Object.isFrozen(DEFAULT_SETTINGS));
});

// --- Lookups ---

test('groupOf finds the group a tab is in, port and all', () => {
  assert.deepEqual(groupOf(GROUPS, at('https://example-demo.com/p')), GROUPS[0]);
  assert.deepEqual(groupOf(GROUPS, at('https://EXAMPLE.com/p')), GROUPS[0]);
  assert.deepEqual(groupOf(GROUPS, at('https://shop.example.com:8443/p')), GROUPS[1]);
  assert.equal(groupOf(GROUPS, at('https://shop.example.com/p')), null);
  assert.equal(groupOf(GROUPS, at('https://other.com/p')), null);
  assert.equal(groupOf(GROUPS, at('mailto:someone@example.com')), null);
  assert.equal(groupOf([], at('https://example.com/')), null);
});

test('a host written with a scheme matches only that scheme', () => {
  assert.deepEqual(groupOf(GROUPS, at('http://localhost:3000/')), GROUPS[0]);
  assert.equal(groupOf(GROUPS, at('https://localhost:3000/')), null);
});

test('a written default port matches the tab on that default port', () => {
  const groups = [['example.com:443', 'staging.example.com:443'], ['a.com:80', 'b.com:80']];
  assert.deepEqual(groupOf(groups, at('https://example.com/')), groups[0]);
  assert.deepEqual(alternatives(groups, at('https://example.com/')), ['staging.example.com:443']);
  assert.deepEqual(groupOf(groups, at('http://a.com/')), groups[1]);
  assert.equal(groupOf(groups, at('https://a.com/')), null);
});

test('alternatives are the rest of the group, in order', () => {
  assert.deepEqual(alternatives(GROUPS, at('https://example-demo.com/')), ['example.com', 'http://localhost:3000']);
  assert.deepEqual(alternatives(GROUPS, at('http://localhost:3000/')), ['example.com', 'example-demo.com']);
  assert.deepEqual(alternatives(GROUPS, at('https://other.com/')), []);
});

// --- Storage ---

/** A chrome.storage area that behaves like the real one, or fails on demand. */
function fakeArea(store, { fail = false } = {}) {
  return {
    get(key, cb) {
      if (fail) { chromeStub.runtime.lastError = { message: 'sync is unavailable' }; cb(undefined); chromeStub.runtime.lastError = undefined; return; }
      cb({ [key]: store[key] });
    },
    set(items, cb) {
      if (fail) { chromeStub.runtime.lastError = { message: 'sync is unavailable' }; cb(); chromeStub.runtime.lastError = undefined; return; }
      Object.assign(store, items);
      cb();
    },
  };
}

let chromeStub;
function fakeChrome({ sync = true, syncFails = false, local = true } = {}) {
  const stores = { sync: {}, local: {} };
  chromeStub = { runtime: {}, storage: {} };
  if (sync) chromeStub.storage.sync = fakeArea(stores.sync, { fail: syncFails });
  if (local) chromeStub.storage.local = fakeArea(stores.local);
  return { chrome: chromeStub, stores };
}

test('settings round trip through sync', async () => {
  const { chrome, stores } = fakeChrome();
  assert.equal(await saveSettings(chrome, { groups: GROUPS }), 'sync');
  assert.deepEqual(stores.sync[STORAGE_KEY], { groups: GROUPS });
  assert.deepEqual(stores.local, {});
  assert.deepEqual(await loadSettings(chrome), { groups: GROUPS });
});

test('local is used when sync is missing', async () => {
  const { chrome, stores } = fakeChrome({ sync: false });
  assert.equal(await saveSettings(chrome, { groups: GROUPS }), 'local');
  assert.deepEqual(stores.local[STORAGE_KEY], { groups: GROUPS });
  assert.deepEqual(await loadSettings(chrome), { groups: GROUPS });
});

test('local is used when sync errors', async () => {
  const { chrome, stores } = fakeChrome({ syncFails: true });
  assert.equal(await saveSettings(chrome, { groups: GROUPS }), 'local');
  assert.deepEqual(stores.sync, {});
  assert.deepEqual(await loadSettings(chrome), { groups: GROUPS });
});

test('settings saved to local after sync refuses the write are the ones loaded', async () => {
  const stores = { sync: { [STORAGE_KEY]: { groups: [['old.com', 'older.com']] } }, local: {} };
  const chrome = { runtime: {}, storage: {} };
  const area = store => ({
    get(key, cb) { cb(key in store ? { [key]: store[key] } : {}); },
    set(items, cb) { Object.assign(store, items); cb(); },
    remove(key, cb) { delete store[key]; cb(); },
  });
  chrome.storage.sync = {
    ...area(stores.sync),
    set(_items, cb) { chrome.runtime.lastError = { message: 'QUOTA_BYTES_PER_ITEM quota exceeded' }; cb(); chrome.runtime.lastError = undefined; },
  };
  chrome.storage.local = area(stores.local);
  assert.equal(await saveSettings(chrome, { groups: GROUPS }), 'local');
  assert.deepEqual(stores.sync, {});
  assert.deepEqual(await loadSettings(chrome), { groups: GROUPS });
});

test('local is read when sync answers with nothing', async () => {
  const { chrome, stores } = fakeChrome();
  stores.local[STORAGE_KEY] = { groups: GROUPS };
  assert.deepEqual(await loadSettings(chrome), { groups: GROUPS });
});

test('loading with nothing stored, or no storage at all, gives the defaults', async () => {
  assert.deepEqual(await loadSettings(fakeChrome().chrome), { groups: [] });
  assert.deepEqual(await loadSettings({ runtime: {} }), { groups: [] });
  assert.deepEqual(await loadSettings(undefined), { groups: [] });
});

test('saving cleans what it is given', async () => {
  const { chrome, stores } = fakeChrome();
  await saveSettings(chrome, { groups: [['A.com', 'b.com'], ['lonely.com']], extra: true });
  assert.deepEqual(stores.sync[STORAGE_KEY], { groups: [['a.com', 'b.com']] });
});

test('saving with no storage rejects', async () => {
  await assert.rejects(saveSettings({ runtime: {} }, { groups: GROUPS }));
});
