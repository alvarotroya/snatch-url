// Snatch URL - draft.js
//
// The staging layer between the popup and the URL model (F3).
//
// Editing a field used to navigate the tab on blur, so tabbing through the
// rows fired a navigation per field. Every edit now lands in a *draft* and
// the tab is only navigated when the user applies it.
//
// A draft holds two parses of the same URL: `base`, which is never edited and
// is what the tab still points at, and `work`, which every edit mutates
// through the same `url-model.js` functions the popup used before. Comparing
// the two is what tells the popup which rows changed.
//
// Deletions are staged too: a removed row moves to `draft.removed` with the
// index it came from, so it can be put back. That is what gives Clear All its
// undo - it removes five rows the same way a delete removes one, and each is
// restorable until the draft is applied.

import {
  parseUrl,
  buildUrl,
  setSegment,
  deleteSegment,
  setKey,
  setValue,
  deleteEntry,
  addEntry,
  setHost,
  normalizeHost,
} from './url-model.js';

/**
 * @typedef {Object} Draft
 * @property {import('./url-model.js').UrlModel} base  the URL the tab is on
 * @property {import('./url-model.js').UrlModel} work  the edited copy
 * @property {Removed[]} removed  staged deletions, newest last
 *
 * @typedef {Object} Removed
 * @property {'segment'|'entry'} kind
 * @property {number} index  where it sat when it was removed
 * @property {string} uid
 * @property {string} label  what to show in the ghost row
 * @property {Object} item   the model row itself, ready to be spliced back
 */

// A row keeps its uid across edits, so a renamed key is still recognised as
// the same row rather than as an add plus a delete.
let uidCounter = 0;
function newUid(prefix) {
  uidCounter += 1;
  return `${prefix}-new-${uidCounter}`;
}

/**
 * @param {string} url
 * @returns {Draft|null} null when the URL cannot be parsed
 */
export function createDraft(url) {
  const base = parseUrl(url);
  const work = parseUrl(url);
  if (!base || !work) return null;
  work.segments.forEach((s, i) => { s.uid = `seg-${i}`; });
  work.entries.forEach((e, i) => { e.uid = `ent-${i}`; });
  return { base, work, removed: [] };
}

/** The URL the draft would navigate to. */
export function draftUrl(draft) {
  return buildUrl(draft.work);
}

/** The URL the tab is still on. */
export function baseUrl(draft) {
  return buildUrl(draft.base);
}

// --- Row status ---

function baseRow(draft, kind, uid) {
  const match = /^(seg|ent)-(\d+)$/.exec(uid);
  if (!match) return null;
  const list = kind === 'segment' ? draft.base.segments : draft.base.entries;
  return list[Number(match[2])] ?? null;
}

/**
 * How a live row differs from the URL the tab is on.
 * @returns {'added'|'modified'|'unchanged'}
 */
export function rowStatus(draft, kind, row) {
  const original = baseRow(draft, kind, row.uid);
  if (!original) return 'added';
  if (kind === 'segment') return original.raw === row.raw ? 'unchanged' : 'modified';
  const same = original.rawKey === row.rawKey && original.rawValue === row.rawValue;
  return same ? 'unchanged' : 'modified';
}

/**
 * Whether the host differs from the tab's. The host is one part, not a row,
 * so it has its own status; the prefix is where the model keeps it.
 * @returns {'modified'|'unchanged'}
 */
export function hostStatus(draft) {
  return draft.work.prefix === draft.base.prefix ? 'unchanged' : 'modified';
}

/** How many parts the user has touched: the host, edits, additions and deletions. */
export function changeCount(draft) {
  const touched = (kind, rows) => rows.filter(r => rowStatus(draft, kind, r) !== 'unchanged').length;
  return (hostStatus(draft) === 'modified' ? 1 : 0)
    + touched('segment', draft.work.segments)
    + touched('entry', draft.work.entries)
    + draft.removed.length;
}

export function isDirty(draft) {
  return changeCount(draft) > 0;
}

/** One short line for the status bar, e.g. `2 unapplied changes`. */
export function changeSummary(draft) {
  const n = changeCount(draft);
  if (n === 0) return 'No unapplied changes';
  return `${n} unapplied change${n === 1 ? '' : 's'}`;
}

// --- Edits ---
//
// These mirror the url-model edit functions and return the same
// `{ ok }` / `{ ok: false, error }` results, minus the navigation.

/** setSegment, keeping the row's uid - the model replaces the object. */
export function editSegment(draft, index, text) {
  const { uid } = draft.work.segments[index];
  const result = setSegment(draft.work, index, text);
  if (result.ok) draft.work.segments[index].uid = uid;
  return result;
}

export function editKey(draft, index, text) {
  return setKey(draft.work, index, text);
}

/**
 * setHost on the working copy; a host switch from a group lands here too. A
 * host with no scheme takes the tab's, not the working copy's, so switching to
 * `http://localhost:3000` and back restores the tab's URL.
 */
export function editHost(draft, text) {
  const checked = normalizeHost(text);
  const { protocol } = new URL(draft.base.href);
  if (checked.ok && !checked.scheme && /^https?:$/.test(protocol)) {
    return setHost(draft.work, `${protocol}//${checked.host}`);
  }
  return setHost(draft.work, text);
}

export function editValue(draft, index, text) {
  return setValue(draft.work, index, text);
}

export function addParam(draft, key, value) {
  const result = addEntry(draft.work, key, value);
  if (result.ok) draft.work.entries.at(-1).uid = newUid('ent');
  return result;
}

/**
 * Take back a parameter that was added in this draft and never kept, such as
 * + param's placeholder when its name is cancelled. It was never on the tab,
 * so nothing is staged: the draft reads as if it had not been added.
 */
export function discardAdded(draft, index) {
  const entry = draft.work.entries[index];
  if (!entry || rowStatus(draft, 'entry', entry) !== 'added') {
    return { ok: false, error: 'Only a new parameter can be discarded.' };
  }
  return deleteEntry(draft.work, index);
}

function stageRemoval(draft, kind, index, label, item) {
  draft.removed.push({ kind, index, uid: item.uid, label, item });
}

export function removeSegment(draft, index) {
  const item = draft.work.segments[index];
  stageRemoval(draft, 'segment', index, item.text, item);
  return deleteSegment(draft.work, index);
}

export function removeEntry(draft, index) {
  const item = draft.work.entries[index];
  const label = item.rawValue === null ? item.key : `${item.key}=${item.value}`;
  stageRemoval(draft, 'entry', index, label, item);
  return deleteEntry(draft.work, index);
}

/**
 * Clear All, staged. Removing from the end keeps each recorded index right,
 * and the removals are listed in their original order so the ghost rows read
 * the way the query did.
 */
export function clearQuery(draft) {
  const from = draft.removed.length;
  for (let i = draft.work.entries.length - 1; i >= 0; i -= 1) removeEntry(draft, i);
  const cleared = draft.removed.splice(from).sort((a, b) => a.index - b.index);
  draft.removed.push(...cleared);
  return { ok: true };
}

/**
 * Query parameters a URL is usually better off without: the tracking tags
 * marketing tools append. Clean strips exactly these, by name, and nothing
 * else. One list, so the popup and the tests agree on it.
 */
export const TRACKING_KEY =
  /^(utm_|fbclid$|gclid$|gbraid$|wbraid$|msclkid$|yclid$|igshid$|mc_cid$|mc_eid$|_ga$|_gl$|vero_|mkt_tok$)/i;

/**
 * Clean, staged: every tracking parameter is removed the way a delete
 * removes one, so each is restorable and all of them count as changes.
 *
 * @returns {{ok: true, count: number}}
 */
export function cleanTracking(draft) {
  const from = draft.removed.length;
  for (let i = draft.work.entries.length - 1; i >= 0; i -= 1) {
    if (TRACKING_KEY.test(draft.work.entries[i].key)) removeEntry(draft, i);
  }
  const cleared = draft.removed.splice(from).sort((a, b) => a.index - b.index);
  draft.removed.push(...cleared);
  return { ok: true, count: cleared.length };
}

/**
 * Put a staged deletion back where it came from. Later edits may have made
 * the list shorter, so the index is clamped rather than trusted.
 */
export function restoreRemoved(draft, uid) {
  const at = draft.removed.findIndex(r => r.uid === uid);
  if (at === -1) return { ok: false, error: 'Nothing to restore.' };
  const [removed] = draft.removed.splice(at, 1);
  const list = removed.kind === 'segment' ? draft.work.segments : draft.work.entries;
  list.splice(Math.min(removed.index, list.length), 0, removed.item);
  if (removed.kind === 'entry') draft.work.hasQuery = true;
  return { ok: true };
}

/** Throw the whole draft away and start again from the URL the tab is on. */
export function revert(draft) {
  const fresh = createDraft(buildUrl(draft.base));
  draft.work = fresh.work;
  draft.removed = [];
  return { ok: true };
}

/**
 * Called once the draft has been applied to the tab: the draft URL is now the
 * URL the tab is on, so nothing is outstanding any more.
 */
export function rebase(draft) {
  const fresh = createDraft(draftUrl(draft));
  draft.base = fresh.base;
  draft.work = fresh.work;
  draft.removed = [];
  return { ok: true };
}
