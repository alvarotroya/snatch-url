// Snatch URL - settings.js
//
// The owner's settings: host groups. A group is a list of hosts that stand
// in for each other - `example.com`, `example-demo.com`,
// `http://localhost:3000` - so that when the tab is on one of them the popup
// can offer the others. A host may carry a scheme; switching to it then
// switches the scheme too.
//
// The first half is pure: the options page's text form of the groups, and
// the lookups the popup makes. The second half is storage: settings live in
// `chrome.storage.sync` so they follow the browser profile, and fall back to
// `chrome.storage.local` where sync is not available (Firefox without an
// add-on id, or a browser that refuses sync). The `chrome` object is passed
// in rather than read from the global, so the tests and the demo can hand
// over a fake one.

import { normalizeHost, isHostOf } from './url-model.js';

/** @typedef {{groups: string[][]}} Settings */

export const DEFAULT_SETTINGS = Object.freeze({ groups: [] });

/** Where the settings sit in a storage area. */
export const STORAGE_KEY = 'settings';

// --- The text form ---
//
// One group per line, hosts separated by commas. That is the whole grammar,
// so the options page is one textarea.

/**
 * @param {string} text
 * @returns {{groups: string[][], errors: {line: number, text: string, error: string}[]}}
 */
export function parseGroups(text) {
  const groups = [];
  const errors = [];
  String(text ?? '').split(/\r?\n/).forEach((line, i) => {
    const words = line.split(',').map(w => w.trim()).filter(Boolean);
    if (words.length === 0) return;
    const hosts = [];
    for (const word of words) {
      const checked = normalizeHost(word);
      if (!checked.ok) { errors.push({ line: i + 1, text: word, error: checked.error }); continue; }
      if (!hosts.includes(checked.text)) hosts.push(checked.text);
    }
    if (hosts.length === 1) errors.push({ line: i + 1, text: hosts[0], error: 'A group needs at least two hosts.' });
    if (hosts.length >= 2) groups.push(hosts);
  });
  return { groups, errors };
}

/** The inverse of parseGroups, for filling the options page. */
export function formatGroups(groups) {
  return groups.map(hosts => hosts.join(', ')).join('\n');
}

/**
 * Whatever came out of storage, made into a Settings value the code can
 * trust: anything that is not a list of lists of valid hosts is dropped.
 * @returns {Settings}
 */
export function normalizeSettings(raw) {
  const groups = [];
  const list = raw && Array.isArray(raw.groups) ? raw.groups : [];
  for (const entry of list) {
    if (!Array.isArray(entry)) continue;
    const hosts = [];
    for (const item of entry) {
      if (typeof item !== 'string') continue;
      const checked = normalizeHost(item);
      if (checked.ok && !hosts.includes(checked.text)) hosts.push(checked.text);
    }
    if (hosts.length >= 2) groups.push(hosts);
  }
  return { groups };
}

// --- Lookups ---

/**
 * The first group the model's host belongs to, or null. Hosts compare the
 * way the address bar shows them, under the URL's scheme: `example.com:8443`
 * and `example.com` are different, `example.com:443` on https is not, and a
 * host written with a scheme matches only that scheme.
 * @param {string[][]} groups
 * @param {import('./url-model.js').UrlModel} model
 * @returns {string[]|null}
 */
export function groupOf(groups, model) {
  return groups.find(hosts => hosts.some(h => isHostOf(model, h))) ?? null;
}

/**
 * The hosts the model's host can be switched to: the rest of its group, in
 * the group's order. Empty when the host is in no group.
 * @param {string[][]} groups
 * @param {import('./url-model.js').UrlModel} model
 * @returns {string[]}
 */
export function alternatives(groups, model) {
  const group = groupOf(groups, model);
  return group ? group.filter(h => !isHostOf(model, h)) : [];
}

// --- Storage ---

/**
 * The storage area to use: sync where the browser offers it, local
 * otherwise. Null when there is no storage API at all (the demo's stub, or
 * a popup opened as a plain page), in which case settings are the defaults.
 */
function areaOf(chrome) {
  const storage = chrome && chrome.storage;
  if (!storage) return null;
  return storage.sync || storage.local || null;
}

/** A callback-style storage call as a promise; a lastError rejects. */
function call(chrome, area, method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      area[method](...args, result => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err) reject(new Error(err.message || String(err)));
        else resolve(result);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Read the settings. Sync is tried first; when it errors - Firefox reports
 * sync as unavailable this way rather than by leaving it undefined - or holds
 * none, local is read instead. Never rejects: unreadable settings are the defaults.
 *
 * @param {object} chrome
 * @returns {Promise<Settings>}
 */
export async function loadSettings(chrome) {
  const area = areaOf(chrome);
  if (!area) return normalizeSettings(null);
  const areas = [area];
  if (chrome.storage.local && area !== chrome.storage.local) areas.push(chrome.storage.local);
  for (const a of areas) {
    try {
      const result = await call(chrome, a, 'get', STORAGE_KEY);
      if (result && result[STORAGE_KEY] !== undefined) return normalizeSettings(result[STORAGE_KEY]);
    } catch {
      // Try the next area.
    }
  }
  return normalizeSettings(null);
}

/**
 * Write the settings, to sync when it takes them and to local otherwise - a
 * sync that refuses the write (its quota, say) counts as not taking them, and
 * then sync's older copy is removed so it cannot hide the local one. Resolves
 * to the name of the area that kept them; rejects only when neither would.
 *
 * @param {object} chrome
 * @param {Settings} settings
 * @returns {Promise<'sync'|'local'>}
 */
export async function saveSettings(chrome, settings) {
  const clean = normalizeSettings(settings);
  const area = areaOf(chrome);
  if (!area) throw new Error('No storage available.');
  const candidates = [[area === chrome.storage.sync ? 'sync' : 'local', area]];
  if (chrome.storage.local && area !== chrome.storage.local) candidates.push(['local', chrome.storage.local]);
  let lastError = null;
  for (const [name, a] of candidates) {
    try {
      await call(chrome, a, 'set', { [STORAGE_KEY]: clean });
      if (a !== area) await call(chrome, area, 'remove', STORAGE_KEY).catch(() => {});
      return name;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
