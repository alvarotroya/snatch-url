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

const GROUPS = [
  ['example.com', 'example-demo.com', 'localhost:3000'],
  ['shop.example.com:8443', 'shop-demo.example.com:8443'],
];

// --- The text form ---

test('parseGroups reads one group per line, hosts split by commas or spaces', () => {
  const { groups, errors } = parseGroups(
    'example.com, example-demo.com localhost:3000\n\n  shop.example.com:8443 ,shop-demo.example.com:8443  \n'
  );
  assert.deepEqual(groups, GROUPS);
  assert.deepEqual(errors, []);
});

test('parseGroups normalises hosts and ignores comments and repeats', () => {
  const { groups, errors } = parseGroups('# staging\nExample.COM, example.com, EXAMPLE-demo.com # same as prod\n');
  assert.deepEqual(groups, [['example.com', 'example-demo.com']]);
  assert.deepEqual(errors, []);
});

test('parseGroups reports what is not a host, with its line', () => {
  const { groups, errors } = parseGroups('example.com, https://example-demo.com\nlocalhost:3000, localhost:4000');
  assert.deepEqual(groups, [['localhost:3000', 'localhost:4000']]);
  assert.equal(errors.length, 2);
  assert.equal(errors[0].line, 1);
  assert.equal(errors[0].text, 'https://example-demo.com');
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
  assert.equal(text, 'example.com, example-demo.com, localhost:3000\nshop.example.com:8443, shop-demo.example.com:8443');
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

test('groupOf finds the group a host is in, case-insensitively, port and all', () => {
  assert.deepEqual(groupOf(GROUPS, 'example-demo.com'), GROUPS[0]);
  assert.deepEqual(groupOf(GROUPS, 'EXAMPLE.com'), GROUPS[0]);
  assert.deepEqual(groupOf(GROUPS, 'shop.example.com:8443'), GROUPS[1]);
  assert.equal(groupOf(GROUPS, 'shop.example.com'), null);
  assert.equal(groupOf(GROUPS, 'other.com'), null);
  assert.equal(groupOf(GROUPS, ''), null);
  assert.equal(groupOf([], 'example.com'), null);
});

test('alternatives are the rest of the group, in order', () => {
  assert.deepEqual(alternatives(GROUPS, 'example-demo.com'), ['example.com', 'localhost:3000']);
  assert.deepEqual(alternatives(GROUPS, 'localhost:3000'), ['example.com', 'example-demo.com']);
  assert.deepEqual(alternatives(GROUPS, 'other.com'), []);
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
