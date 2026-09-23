// Snatch URL - draft.test.js
//
// Run with `npm test` (node --test, no dependencies).
//
// These cover the staging rules the popup relies on (F3): an edit changes the
// draft and never the URL the tab is on, deletions stay restorable until the
// draft is applied, and the change count is what the status bar shows.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDraft,
  draftUrl,
  baseUrl,
  rowStatus,
  changeCount,
  changeSummary,
  isDirty,
  editSegment,
  editKey,
  editValue,
  editHost,
  hostStatus,
  addParam,
  discardAdded,
  removeSegment,
  removeEntry,
  clearQuery,
  cleanTracking,
  TRACKING_KEY,
  restoreRemoved,
  revert,
  rebase,
} from './draft.js';

const URL_UNDER_TEST = 'https://example.com/docs/guide?q=hello%20world&debug&tag=a';

const fresh = () => createDraft(URL_UNDER_TEST);

test('a new draft is clean and matches the tab', () => {
  const draft = fresh();
  assert.equal(draftUrl(draft), baseUrl(draft));
  assert.equal(isDirty(draft), false);
  assert.equal(changeCount(draft), 0);
  assert.equal(changeSummary(draft), 'No unapplied changes');
});

test('createDraft returns null for an unparseable URL', () => {
  assert.equal(createDraft('not a url'), null);
});

test('an edit changes the draft URL but not the tab URL', () => {
  const draft = fresh();
  assert.deepEqual(editValue(draft, 0, 'bye'), { ok: true });

  assert.equal(draftUrl(draft), 'https://example.com/docs/guide?q=bye&debug&tag=a');
  assert.equal(baseUrl(draft), URL_UNDER_TEST);
  assert.equal(changeSummary(draft), '1 unapplied change');
});

test('several edits stage up and are counted once per row', () => {
  const draft = fresh();
  editSegment(draft, 0, 'manual');
  editValue(draft, 0, 'bye');
  editValue(draft, 0, 'ciao');

  assert.equal(changeCount(draft), 2);
  assert.equal(changeSummary(draft), '2 unapplied changes');
  assert.equal(baseUrl(draft), URL_UNDER_TEST);
});

test('a rejected edit leaves the draft untouched', () => {
  const draft = fresh();
  const result = editSegment(draft, 0, '   ');

  assert.equal(result.ok, false);
  assert.equal(isDirty(draft), false);
  assert.equal(draftUrl(draft), URL_UNDER_TEST);
});

test('editing a value back to its original clears the change', () => {
  const draft = fresh();
  editValue(draft, 0, 'bye');
  editValue(draft, 0, 'hello world');

  assert.equal(isDirty(draft), false);
  assert.equal(draftUrl(draft), URL_UNDER_TEST);
});

test('a host change is staged, counted once and shown as modified', () => {
  const draft = fresh();
  assert.deepEqual(editHost(draft, 'example-demo.com'), { ok: true });

  assert.equal(draftUrl(draft), 'https://example-demo.com/docs/guide?q=hello%20world&debug&tag=a');
  assert.equal(baseUrl(draft), URL_UNDER_TEST);
  assert.equal(hostStatus(draft), 'modified');
  assert.equal(changeCount(draft), 1);
  assert.equal(changeSummary(draft), '1 unapplied change');

  editHost(draft, 'localhost:3000');
  assert.equal(changeCount(draft), 1);
  assert.equal(draftUrl(draft), 'https://localhost:3000/docs/guide?q=hello%20world&debug&tag=a');
});

test('switching the host back clears the change', () => {
  const draft = fresh();
  editHost(draft, 'example-demo.com');
  editHost(draft, 'example.com');
  assert.equal(hostStatus(draft), 'unchanged');
  assert.equal(isDirty(draft), false);
});

test('a host with no scheme takes the tab scheme after a switch that set one', () => {
  const draft = fresh();
  editHost(draft, 'http://localhost:3000');
  assert.equal(draftUrl(draft), 'http://localhost:3000/docs/guide?q=hello%20world&debug&tag=a');

  assert.deepEqual(editHost(draft, 'example.com'), { ok: true });
  assert.equal(draftUrl(draft), URL_UNDER_TEST);
  assert.equal(hostStatus(draft), 'unchanged');
  assert.equal(isDirty(draft), false);
});

test('a rejected host leaves the draft clean', () => {
  const draft = fresh();
  assert.equal(editHost(draft, 'not a host').ok, false);
  assert.equal(isDirty(draft), false);
  assert.equal(draftUrl(draft), URL_UNDER_TEST);
});

test('revert and rebase cover the host too', () => {
  const draft = fresh();
  editHost(draft, 'example-demo.com');
  revert(draft);
  assert.equal(draftUrl(draft), URL_UNDER_TEST);

  editHost(draft, 'example-demo.com');
  rebase(draft);
  assert.equal(hostStatus(draft), 'unchanged');
  assert.equal(baseUrl(draft), 'https://example-demo.com/docs/guide?q=hello%20world&debug&tag=a');
});

test('a renamed key is still the same row, not an add plus a delete', () => {
  const draft = fresh();
  editKey(draft, 0, 'query');

  assert.equal(changeCount(draft), 1);
  assert.equal(rowStatus(draft, 'entry', draft.work.entries[0]), 'modified');
});

test('an added param is marked added and counted', () => {
  const draft = fresh();
  assert.deepEqual(addParam(draft, 'page', '2'), { ok: true });

  const added = draft.work.entries.at(-1);
  assert.equal(rowStatus(draft, 'entry', added), 'added');
  assert.equal(changeCount(draft), 1);
  assert.equal(draftUrl(draft), `${URL_UNDER_TEST}&page=2`);
});

test('editing an added param keeps it marked added', () => {
  const draft = fresh();
  addParam(draft, 'page', '2');
  editValue(draft, draft.work.entries.length - 1, '3');

  assert.equal(rowStatus(draft, 'entry', draft.work.entries.at(-1)), 'added');
  assert.equal(changeCount(draft), 1);
});

test('editing a segment keeps its identity, so it is modified not added', () => {
  const draft = fresh();
  editSegment(draft, 1, 'reference');

  assert.equal(rowStatus(draft, 'segment', draft.work.segments[1]), 'modified');
  assert.equal(draftUrl(draft), 'https://example.com/docs/reference?q=hello%20world&debug&tag=a');
});

test('a deleted param is staged and restorable', () => {
  const draft = fresh();
  removeEntry(draft, 1);

  assert.equal(draftUrl(draft), 'https://example.com/docs/guide?q=hello%20world&tag=a');
  assert.equal(changeCount(draft), 1);
  assert.equal(draft.removed[0].label, 'debug');

  assert.deepEqual(restoreRemoved(draft, draft.removed[0].uid), { ok: true });
  assert.equal(draftUrl(draft), URL_UNDER_TEST);
  assert.equal(isDirty(draft), false);
});

test('a restored bare flag stays bare', () => {
  const draft = fresh();
  removeEntry(draft, 1);
  restoreRemoved(draft, draft.removed[0].uid);

  assert.equal(draft.work.entries[1].rawValue, null);
});

test('a deleted segment is staged and goes back where it came from', () => {
  const draft = fresh();
  removeSegment(draft, 0);

  assert.equal(draftUrl(draft), 'https://example.com/guide?q=hello%20world&debug&tag=a');
  restoreRemoved(draft, draft.removed[0].uid);
  assert.equal(draftUrl(draft), URL_UNDER_TEST);
});

test('restoring an unknown row is rejected rather than throwing', () => {
  const draft = fresh();
  assert.equal(restoreRemoved(draft, 'nope').ok, false);
});

test('Clear All is staged, and every cleared row can be put back', () => {
  const draft = fresh();
  clearQuery(draft);

  assert.equal(draftUrl(draft), 'https://example.com/docs/guide');
  assert.equal(baseUrl(draft), URL_UNDER_TEST);
  assert.equal(changeCount(draft), 3);
  assert.deepEqual(draft.removed.map(r => r.label), ['q=hello world', 'debug', 'tag=a']);

  for (const uid of draft.removed.map(r => r.uid)) restoreRemoved(draft, uid);
  assert.equal(draftUrl(draft), URL_UNDER_TEST);
  assert.equal(isDirty(draft), false);
});

test('Clear All keeps deletions staged before it in order', () => {
  const draft = fresh();
  removeSegment(draft, 0);
  clearQuery(draft);

  assert.deepEqual(draft.removed.map(r => r.kind), ['segment', 'entry', 'entry', 'entry']);
  assert.deepEqual(draft.removed.map(r => r.label), ['docs', 'q=hello world', 'debug', 'tag=a']);
});

test('revert throws the whole draft away', () => {
  const draft = fresh();
  editSegment(draft, 0, 'manual');
  addParam(draft, 'page', '2');
  clearQuery(draft);

  revert(draft);
  assert.equal(draftUrl(draft), URL_UNDER_TEST);
  assert.equal(isDirty(draft), false);
  assert.deepEqual(draft.removed, []);
});

test('rebase makes the applied draft the new starting point', () => {
  const draft = fresh();
  editValue(draft, 0, 'bye');
  removeEntry(draft, 1);
  const applied = draftUrl(draft);

  rebase(draft);
  assert.equal(baseUrl(draft), applied);
  assert.equal(draftUrl(draft), applied);
  assert.equal(isDirty(draft), false);

  // The rebased draft is editable again, and edits count from the new base.
  editValue(draft, 0, 'again');
  assert.equal(changeCount(draft), 1);
});

test('staging preserves the untouched parts of the URL', () => {
  const draft = createDraft('https://example.com/a%20b/c/?x=1,2&y=%zz#frag');
  editValue(draft, 0, '3,4');

  assert.equal(draftUrl(draft), 'https://example.com/a%20b/c/?x=3,4&y=%zz#frag');
});

// --- Clean: tracking parameters, staged ---

const TRACKED = 'https://example.com/p?q=shoes&utm_source=newsletter&utm_medium=email&fbclid=abc&debug#top';

test('TRACKING_KEY matches the usual suspects and nothing near them', () => {
  for (const key of ['utm_source', 'UTM_Campaign', 'fbclid', 'gclid', 'msclkid', 'mc_eid', '_ga', '_gl', 'vero_id', 'mkt_tok']) {
    assert.ok(TRACKING_KEY.test(key), key);
  }
  for (const key of ['utm', 'utmx', 'q', 'gclid2', 'ga', 'debug', 'ref']) {
    assert.ok(!TRACKING_KEY.test(key), key);
  }
});

test('cleanTracking strips only the tracking params and reports how many', () => {
  const draft = createDraft(TRACKED);
  assert.deepEqual(cleanTracking(draft), { ok: true, count: 3 });
  assert.equal(draftUrl(draft), 'https://example.com/p?q=shoes&debug#top');
  assert.equal(changeCount(draft), 3);
});

test('cleanTracking is staged: each stripped param is a ghost in query order and restorable', () => {
  const draft = createDraft(TRACKED);
  cleanTracking(draft);
  assert.deepEqual(draft.removed.map(r => r.label), [
    'utm_source=newsletter', 'utm_medium=email', 'fbclid=abc',
  ]);
  restoreRemoved(draft, draft.removed[0].uid);
  assert.equal(draftUrl(draft), 'https://example.com/p?q=shoes&utm_source=newsletter&debug#top');
});

test('cleanTracking on a clean URL changes nothing', () => {
  const draft = createDraft('https://example.com/p?q=shoes&debug');
  assert.deepEqual(cleanTracking(draft), { ok: true, count: 0 });
  assert.equal(isDirty(draft), false);
});

test('cleanTracking leaves an earlier staged deletion in place', () => {
  const draft = createDraft(TRACKED);
  removeEntry(draft, 0);
  cleanTracking(draft);
  assert.deepEqual(draft.removed.map(r => r.label), [
    'q=shoes', 'utm_source=newsletter', 'utm_medium=email', 'fbclid=abc',
  ]);
  assert.equal(draftUrl(draft), 'https://example.com/p?debug#top');
});

test('a cancelled + param placeholder is discarded, not staged', () => {
  const draft = fresh();
  addParam(draft, 'key', 'value');
  assert.deepEqual(discardAdded(draft, draft.work.entries.length - 1), { ok: true });
  assert.equal(draftUrl(draft), baseUrl(draft));
  assert.equal(changeCount(draft), 0);
  assert.equal(draft.removed.length, 0);
  assert.equal(isDirty(draft), false);
});

test('discarding refuses a parameter the tab already has', () => {
  const draft = fresh();
  assert.equal(discardAdded(draft, 0).ok, false);
  assert.equal(draftUrl(draft), baseUrl(draft));
});
