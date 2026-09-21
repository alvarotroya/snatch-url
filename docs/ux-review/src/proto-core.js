// Shared brain for the three UX prototypes.
//
// It sits on top of the SHIPPED url-model.js, and adds the one thing every
// "touch the URL directly" design needs and the current popup does not have:
// a map from each part of the URL to the exact character range it occupies in
// the URL string. Selection, highlighting, copy-a-piece and type-over-a-piece
// are all splices into that string.
//
// Nothing here re-implements parsing or encoding: parseUrl/buildUrl/encode*
// come from the model, so the raw-preserving invariant still holds.

import {
  parseUrl,
  buildUrl,
  encodeSegment,
  encodeQueryPart,
  safeDecode,
  decodeQueryPart,
} from './url-model.js';

export { parseUrl, buildUrl, encodeSegment, encodeQueryPart, safeDecode, decodeQueryPart };

// --- Sample URLs -------------------------------------------------------
// Demo scaffolding, not part of any design. Three lengths so each design can
// be felt short, typical and awful.

export const SAMPLES = {
  short: 'https://example.com/docs/guide?page=2',
  typical:
    'https://shop.example.com:8443/eu/catalog/women%27s%20shoes/item'
    + '?q=running%20shoes&sort=price_desc&tags=sale,new'
    + '&ref=https%3A%2F%2Fpartner.io%2Fgo%3Fcid%3D42%26utm%3Demail'
    + '&debug&tag=a&tag=b#reviews',
  monster:
    'https://analytics.example.co.uk:8443/v2/reports/2026/q3/campaign%20roll-up/export'
    + '?state=eyJ1c2VyIjoiYWx2YXJvIiwicm9sZSI6ImFkbWluIiwic2NvcGUiOlsicmVhZCIsIndyaXRlIl19'
    + '&filters=country%3Ade%2Ces%7Cdevice%3Amobile%7Cplan%3Apro%2Cteam'
    + '&from=2026-07-01&to=2026-09-30&granularity=week&currency=EUR'
    + '&next=https%3A%2F%2Fapp.example.co.uk%2Fdash%3Ftab%3Dspend%26range%3D90d'
    + '&utm_source=newsletter&utm_medium=email&utm_campaign=q3%20wrap&debug#panel-spend',
};

// --- Tokens ------------------------------------------------------------
//
// A token is one part of the URL plus where it lives in the string.
//
// role      what kind of part it is (drives colour and what you can do to it)
// start,end character range in the canonical URL text
// raw       the characters as they appear in the URL
// text      the decoded characters, for display and for editing
// index     position among siblings (segment index, entry index)
// editable  whether typing over it is a defined operation
// group     'origin' | 'path' | 'query' | 'hash'

export const ROLE_LABEL = {
  scheme: 'scheme',
  userinfo: 'user info',
  host: 'host',
  port: 'port',
  sep: 'separator',
  seg: 'path segment',
  qmark: 'separator',
  key: 'param name',
  eq: 'separator',
  val: 'param value',
  amp: 'separator',
  hash: 'fragment',
};

const PUNCT = new Set(['sep', 'qmark', 'eq', 'amp', 'scheme']);

export function isPunct(role) {
  return PUNCT.has(role);
}

/**
 * Parse a URL into a model plus offset-mapped tokens.
 *
 * The text the tokens index into is buildUrl(model), not the input string:
 * the model drops a few meaningless things (an empty `&&` chunk), so building
 * from it is the only way offsets are guaranteed to line up with what the user
 * sees. For every URL that survives a round trip - which is every URL the
 * model's tests cover - the two are byte for byte identical.
 *
 * @returns {{ok: boolean, text?: string, model?: object, tokens?: object[], error?: string}}
 */
export function tokenize(url) {
  const model = parseUrl(url);
  if (!model) return { ok: false, error: 'Not a URL.' };

  let u;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, error: 'Not a URL.' };
  }

  const tokens = [];
  let pos = 0;

  const push = (role, raw, extra = {}) => {
    const token = {
      role,
      raw,
      text: extra.text !== undefined ? extra.text : raw,
      start: pos,
      end: pos + raw.length,
      group: extra.group || 'origin',
      index: extra.index,
      editable: !isPunct(role),
      id: `${role}-${extra.index ?? tokens.length}`,
      ...extra,
    };
    tokens.push(token);
    pos = token.end;
    return token;
  };

  // Origin. Rebuilt part by part so the pieces add up to model.prefix; if the
  // arithmetic ever disagrees the whole origin is emitted as one opaque token
  // rather than producing offsets that lie.
  const origin = [
    ['scheme', u.protocol + '//'],
    u.username ? ['userinfo', u.username + (u.password ? ':' + u.password : '') + '@'] : null,
    ['host', u.hostname],
    u.port ? ['port', ':' + u.port] : null,
  ].filter(Boolean);

  if (origin.map(([, raw]) => raw).join('') === model.prefix) {
    for (const [role, raw] of origin) push(role, raw, { group: 'origin' });
  } else {
    push('host', model.prefix, { group: 'origin' });
  }

  // Path
  if (model.segments.length === 0) {
    push('sep', '/', { group: 'path' });
  } else {
    model.segments.forEach((seg, index) => {
      push('sep', '/', { group: 'path' });
      push('seg', seg.raw, { text: seg.text, index, group: 'path', id: `seg-${index}` });
    });
    if (model.trailingSlash) push('sep', '/', { group: 'path' });
  }

  // Query
  if (model.entries.length > 0) {
    push('qmark', '?', { group: 'query' });
    model.entries.forEach((entry, index) => {
      if (index > 0) push('amp', '&', { group: 'query' });
      push('key', entry.rawKey, { text: entry.key, index, group: 'query', id: `key-${index}` });
      if (entry.rawValue !== null) {
        push('eq', '=', { group: 'query' });
        push('val', entry.rawValue, { text: entry.value, index, group: 'query', id: `val-${index}` });
      }
    });
  }

  if (model.hash) push('hash', model.hash, { text: safeDecode(model.hash.slice(1)), group: 'hash' });

  return { ok: true, text: buildUrl(model), model, tokens };
}

/** The token containing a character offset (ties go to the token that starts there). */
export function tokenAt(tokens, offset) {
  return tokens.find(t => offset >= t.start && offset < t.end)
    || tokens.find(t => offset === t.end)
    || null;
}

/**
 * Every token the range [from,to) touches. A caret (a zero-width range)
 * touches one - and when that one is punctuation but a real part ends exactly
 * there, the part wins: after typing at the end of a value the caret sits on
 * the `&`, and the user is still working on the value.
 */
export function tokensIn(tokens, from, to) {
  if (from === to) {
    const here = tokenAt(tokens, from);
    if (here && isPunct(here.role)) {
      const before = tokens.find(t => t.end === from && !isPunct(t.role));
      if (before) return [before];
    }
    return here ? [here] : [];
  }
  return tokens.filter(t => t.start < to && t.end > from);
}

/** The character range covering a whole group, e.g. the entire query. */
export function groupRange(tokens, group) {
  const inGroup = tokens.filter(t => t.group === group);
  if (inGroup.length === 0) return null;
  return { start: inGroup[0].start, end: inGroup[inGroup.length - 1].end };
}

/**
 * The encoder that belongs to a role: typing `a b` into a path segment has to
 * produce `a%20b`, and into a param value `a%20b` too, but the two roles keep
 * different characters legible (see url-model.js).
 */
export function encodeFor(role, text) {
  if (role === 'seg') return encodeSegment(text);
  if (role === 'key' || role === 'val') return encodeQueryPart(text);
  if (role === 'hash') return '#' + encodeURI(text).replace(/#/g, '%23');
  return text;
}

/** Splice new RAW text into the URL at a character range. */
export function spliceRaw(text, start, end, raw) {
  return text.slice(0, start) + raw + text.slice(end);
}

/** Type over one token: encodes for its role, then splices. */
export function retype(text, token, newText) {
  return spliceRaw(text, token.start, token.end, encodeFor(token.role, newText));
}

// --- Value inspection --------------------------------------------------
//
// What a value really is, peeled one layer at a time. This is what makes an
// encoded value or a nested URL touchable instead of a wall of %3A%2F%2F.

const B64 = /^[A-Za-z0-9+/_-]{12,}={0,2}$/;

function tryBase64(s) {
  if (!B64.test(s)) return null;
  try {
    const decoded = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    // Only call it base64 if what comes out is plausible text.
    if (!/^[\x09\x0a\x0d\x20-\x7e]+$/.test(decoded)) return null;
    if (decoded.length < 4) return null;
    return decoded;
  } catch {
    return null;
  }
}

function tryJson(s) {
  const t = s.trim();
  if (!/^[[{]/.test(t)) return null;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return null;
  }
}

/**
 * Peel a raw value into layers. Each layer is what you get after one more
 * decoding step, and the last one is the most human form of the value.
 *
 * @returns {{kind: string, label: string, text: string, isUrl: boolean}[]}
 */
export function peel(raw) {
  const layers = [{ kind: 'raw', label: 'as written', text: raw, isUrl: false }];
  let current = raw;

  const decoded = decodeQueryPart(current);
  if (decoded !== current) {
    current = decoded;
    layers.push({ kind: 'percent', label: 'percent-decoded', text: current, isUrl: false });
  }

  if (/^https?:\/\/\S+$/i.test(current.trim())) {
    layers[layers.length - 1].isUrl = true;
    return layers;
  }

  const jwtParts = current.split('.');
  if (jwtParts.length === 3 && jwtParts.every(p => tryBase64(p) || p.length > 8)) {
    const head = tryBase64(jwtParts[0]);
    const body = tryBase64(jwtParts[1]);
    if (head && body) {
      const pretty = [head, body].map(p => tryJson(p) || p).join('\n---\n');
      layers.push({ kind: 'jwt', label: 'JWT header + payload', text: pretty, isUrl: false });
      return layers;
    }
  }

  const b64 = tryBase64(current);
  if (b64) {
    current = b64;
    layers.push({ kind: 'base64', label: 'base64-decoded', text: current, isUrl: false });
  }

  const json = tryJson(current);
  if (json) layers.push({ kind: 'json', label: 'JSON', text: json, isUrl: false });

  return layers;
}

/** A one-word badge for a value that is hiding something. */
export function badgeFor(raw) {
  const layers = peel(raw);
  if (layers.length === 1) return null;
  const last = layers[layers.length - 1];
  if (last.isUrl) return 'url';
  return { percent: 'encoded', base64: 'base64', json: 'json', jwt: 'jwt' }[last.kind] || null;
}

// --- Staged diff -------------------------------------------------------

/** Which tokens differ from the URL the tab is on, by id. */
export function changedIds(baseTokens, workTokens) {
  const base = new Map(baseTokens.filter(t => t.editable).map(t => [t.id, t.raw]));
  const changed = new Set();
  for (const t of workTokens) {
    if (!t.editable) continue;
    if (!base.has(t.id) || base.get(t.id) !== t.raw) changed.add(t.id);
  }
  return changed;
}

/**
 * How many parts the user has touched.
 *
 * Counting by token id is wrong the moment something is deleted: every later
 * part shifts its index, so `key-3` now holds what `key-4` used to and the
 * whole tail reads as edited. So this compares the two token lists as
 * multisets of (role, raw) instead: one edit is one part gone and one part
 * arrived, a delete is one gone, an add is one arrived.
 */
export function countChanges(baseText, workText, baseTokens, workTokens) {
  if (baseText === workText) return 0;

  // A parameter counts as ONE thing, so deleting `tags=sale,new` is one
  // change rather than two (its name and its value).
  const bag = tokens => {
    const m = new Map();
    const params = new Map();
    for (const t of tokens) {
      if (!t.editable) continue;
      if (t.role === 'key' || t.role === 'val') {
        const cur = params.get(t.index) || { key: '', val: null };
        if (t.role === 'key') cur.key = t.raw; else cur.val = t.raw;
        params.set(t.index, cur);
        continue;
      }
      const k = `${t.role}\u0000${t.raw}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    for (const p of params.values()) {
      const k = `param\u0000${p.key}\u0000${p.val}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  };
  const a = bag(baseTokens);
  const b = bag(workTokens);

  let gone = 0;
  let arrived = 0;
  for (const [k, n] of a) gone += Math.max(0, n - (b.get(k) || 0));
  for (const [k, n] of b) arrived += Math.max(0, n - (a.get(k) || 0));

  return Math.max(1, gone, arrived);
}
