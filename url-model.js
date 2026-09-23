// Snatch URL - url-model.js
//
// A raw-preserving URL model.
//
// The rule this module exists for: an edit must change only the part it
// touches. Every untouched byte of the path and query survives a parse ->
// build round trip exactly as it arrived, so `%20` stays `%20`, `a,b` stays
// `a,b`, a bare `debug` stays bare, and a trailing slash is kept.
//
// To do that the model stores the RAW text of every segment and every
// key/value, and only re-encodes the single part an edit touches. Decoded
// text is carried alongside for display, and decoding never throws: a
// malformed escape like `%zz` falls back to the raw text.

// --- Encoding ---

// Characters that are legal unescaped inside a path segment (RFC 3986 pchar:
// sub-delims plus ":" and "@"). encodeURIComponent escapes them, so we put
// them back, which is what keeps `me@corp.com` readable in a segment.
const SEGMENT_KEEP = /%(2C|3B|3A|40|24|26|2B|3D|21|27|28|29|2A)/gi;

// Same idea for a query part, minus the characters that would end or split
// the part itself: `&`, `=`, `+` and `#` stay escaped.
const QUERY_KEEP = /%(2C|3B|3A|40|24|2F|3F|21|27|28|29|2A)/gi;

function encodeWith(keep, text) {
  return encodeURIComponent(text).replace(keep, m => decodeURIComponent(m));
}

export function encodeSegment(text) {
  return encodeWith(SEGMENT_KEEP, text);
}

export function encodeQueryPart(text) {
  return encodeWith(QUERY_KEEP, text);
}

// --- Decoding ---

/** decodeURIComponent that returns the raw text instead of throwing. */
export function safeDecode(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** A query part also decodes `+` as a space, the way a browser form does. */
export function decodeQueryPart(raw) {
  try {
    return decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch {
    return raw.replace(/\+/g, ' ');
  }
}

// --- Parse ---

/**
 * @typedef {Object} Segment
 * @property {string} raw   the segment exactly as it appears in the URL
 * @property {string} text  the decoded segment, for display and editing
 *
 * @typedef {Object} Entry
 * @property {string} rawKey
 * @property {string|null} rawValue  null for a bare flag such as `debug`
 * @property {string} key
 * @property {string} value
 *
 * @typedef {Object} UrlModel
 * @property {string} href           the URL the prefix was taken from (setHost moves it)
 * @property {string} prefix         everything before the path (scheme, host, port)
 * @property {Segment[]} segments
 * @property {boolean} trailingSlash
 * @property {Entry[]} entries
 * @property {boolean} hasQuery      whether the URL carried a `?` at all
 * @property {string} hash           the raw hash including `#`, or ''
 */

/**
 * @param {string} url
 * @returns {UrlModel|null} null when the URL cannot be parsed
 */
export function parseUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  const tail = u.pathname + u.search + u.hash;
  const prefix = u.href.endsWith(tail)
    ? u.href.slice(0, u.href.length - tail.length)
    : u.origin;

  return {
    href: u.href,
    prefix,
    ...parsePath(u.pathname),
    entries: parseQuery(u.search),
    hasQuery: u.search !== '',
    hash: u.hash,
  };
}

function parsePath(pathname) {
  // An empty path segment is real (`/a//b`) and is preserved, so this keeps
  // every `/` the URL had. Only a trailing one is lifted out into a flag.
  const parts = pathname.startsWith('/') ? pathname.slice(1).split('/') : pathname.split('/');
  let trailingSlash = false;
  if (parts.length > 0 && parts[parts.length - 1] === '') {
    parts.pop();
    trailingSlash = true;
  }
  return {
    segments: parts.map(raw => ({ raw, text: safeDecode(raw) })),
    trailingSlash,
  };
}

function parseQuery(search) {
  const q = search.startsWith('?') ? search.slice(1) : search;
  if (q === '') return [];
  // An empty chunk (`a=1&&b=2`) carries nothing to edit, so it is dropped.
  return q.split('&').filter(chunk => chunk !== '').map(toEntry);
}

function toEntry(chunk) {
  const eq = chunk.indexOf('=');
  const rawKey = eq === -1 ? chunk : chunk.slice(0, eq);
  const rawValue = eq === -1 ? null : chunk.slice(eq + 1);
  return {
    rawKey,
    rawValue,
    key: decodeQueryPart(rawKey),
    value: rawValue === null ? '' : decodeQueryPart(rawValue),
  };
}

// --- Origin ---

/**
 * The prefix split into its parts for display: scheme, optional user info,
 * host, optional port. Joined back they are exactly `model.prefix`. When the
 * arithmetic does not add up - an exotic URL the WHATWG parser normalises in a
 * way the prefix does not follow - the whole prefix is returned as one host
 * part rather than offsets that lie. Nothing here is rebuilt from the parts.
 *
 * @param {UrlModel} model
 * @returns {{role: 'scheme'|'userinfo'|'host'|'port', raw: string}[]}
 */
export function originParts(model) {
  const whole = [{ role: 'host', raw: model.prefix }];
  let u;
  try {
    u = new URL(model.href);
  } catch {
    return whole;
  }
  const userinfo = u.username + (u.password ? ':' + u.password : '');
  const parts = [
    { role: 'scheme', raw: u.protocol + '//' },
    userinfo ? { role: 'userinfo', raw: userinfo + '@' } : null,
    { role: 'host', raw: u.hostname },
    u.port ? { role: 'port', raw: ':' + u.port } : null,
  ].filter(Boolean);
  return parts.map(p => p.raw).join('') === model.prefix ? parts : whole;
}

/**
 * The host the way the address bar shows it: `hostname` or `hostname:port`,
 * with no scheme or user info. Empty when the prefix cannot be split.
 *
 * @param {UrlModel} model
 * @returns {string}
 */
export function hostOf(model) {
  const parts = originParts(model);
  if (parts.length === 1 && parts[0].raw === model.prefix) return '';
  return parts.filter(p => p.role === 'host' || p.role === 'port').map(p => p.raw).join('');
}

// --- Hosts ---

export const BLANK_HOST = 'Host cannot be empty.';
export const BAD_HOST = 'Not a valid host: write it the way the address bar shows it, such as example.com, localhost:3000 or http://localhost:3000.';
export const FIXED_HOST = "The host of this URL can't be changed.";

/**
 * Check a host as a user would write it: `example.com`, `localhost:3000`,
 * `[::1]:8080`, optionally led by `http://` or `https://`. Anything more - a
 * path, user info, a query, another scheme - is refused. The host comes back
 * lower-cased and IDNA-encoded, the way the URL parser writes it. A port the
 * text gives is kept even when it is a default one, because without a scheme
 * nothing says which default it would be; with a scheme, that scheme's default
 * port is dropped. `text` is the whole entry in that normal form.
 *
 * @param {string} text
 * @returns {{ok: true, scheme: string, host: string, text: string} | {ok: false, error: string}}
 */
export function normalizeHost(text) {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '') return { ok: false, error: BLANK_HOST };
  const [, given = '', rest] = /^(?:(https?:)\/\/)?(.*)$/is.exec(trimmed);
  const scheme = given.toLowerCase();
  if (rest === '' || /[\s/?#@\\]/.test(rest)) return { ok: false, error: BAD_HOST };
  const probe = s => {
    try {
      const u = new URL(`${s}//${rest}/`);
      return u.hostname !== '' && u.pathname === '/' && u.search === '' && u.hash === '' ? u : null;
    } catch {
      return null;
    }
  };
  let host;
  if (scheme) {
    const u = probe(scheme);
    if (!u) return { ok: false, error: BAD_HOST };
    host = u.host;
  } else {
    const http = probe('http:');
    const https = probe('https:');
    if (!http || !https) return { ok: false, error: BAD_HOST };
    const port = http.port || https.port;
    host = http.hostname + (port ? ':' + port : '');
  }
  return { ok: true, scheme, host, text: (scheme ? scheme + '//' : '') + host };
}

/**
 * Whether a host as normalizeHost takes it names the model's host: compared
 * under the URL's own scheme, so `example.com:443` is `example.com` on https,
 * and a text that carries a scheme matches only a URL with that scheme.
 *
 * @param {UrlModel} model
 * @param {string} text
 * @returns {boolean}
 */
export function isHostOf(model, text) {
  const checked = normalizeHost(text);
  const current = hostOf(model);
  if (!checked.ok || current === '') return false;
  let protocol;
  try {
    protocol = new URL(model.href).protocol;
    if (checked.scheme && checked.scheme !== protocol) return false;
    return new URL(`${protocol}//${checked.host}/`).host === current;
  } catch {
    return false;
  }
}

// --- Build ---

/** @param {UrlModel} model @returns {string} */
export function buildUrl(model) {
  return model.prefix + buildPath(model) + buildQuery(model) + model.hash;
}

function buildPath({ segments, trailingSlash }) {
  if (segments.length === 0) return '/';
  return '/' + segments.map(s => s.raw).join('/') + (trailingSlash ? '/' : '');
}

function buildQuery({ entries }) {
  // Emptying the query drops the `?` too, which is what Clear All should do.
  if (entries.length === 0) return '';
  return '?' + entries
    .map(e => (e.rawValue === null ? e.rawKey : e.rawKey + '=' + e.rawValue))
    .join('&');
}

// --- Edits ---
//
// Every edit returns a result rather than throwing, so the popup can put a
// rejected value back and show a message. Rejected edits leave the model
// untouched.

const OK = { ok: true };
function reject(error) {
  return { ok: false, error };
}

export const BLANK_SEGMENT = 'Segment cannot be empty.';
export const BLANK_KEY = 'Key cannot be empty.';

/** Replace one path segment. A blank segment is rejected (F6). */
export function setSegment(model, index, text) {
  const trimmed = text.trim();
  if (trimmed === '') return reject(BLANK_SEGMENT);
  model.segments[index] = { raw: encodeSegment(trimmed), text: trimmed };
  return OK;
}

export function deleteSegment(model, index) {
  model.segments.splice(index, 1);
  return OK;
}

/** Rename one query param. A blank key is rejected (F6). */
export function setKey(model, index, text) {
  const trimmed = text.trim();
  if (trimmed === '') return reject(BLANK_KEY);
  const entry = model.entries[index];
  entry.rawKey = encodeQueryPart(trimmed);
  entry.key = trimmed;
  return OK;
}

/**
 * Set one query value. Clearing the value of a bare flag leaves it bare, so
 * `debug` does not silently become `debug=`.
 */
export function setValue(model, index, text) {
  const entry = model.entries[index];
  if (text === '' && entry.rawValue === null) return OK;
  entry.rawValue = encodeQueryPart(text);
  entry.value = text;
  return OK;
}

export function deleteEntry(model, index) {
  model.entries.splice(index, 1);
  return OK;
}

/** Append a new query param. A blank key is rejected, as Add already did. */
export function addEntry(model, key, value) {
  const trimmedKey = key.trim();
  if (trimmedKey === '') return reject(BLANK_KEY);
  model.entries.push({
    rawKey: encodeQueryPart(trimmedKey),
    rawValue: encodeQueryPart(value),
    key: trimmedKey,
    value,
  });
  model.hasQuery = true;
  return OK;
}

export function clearEntries(model) {
  model.entries.length = 0;
  return OK;
}

/**
 * Replace the host. The text is `host` or `host:port`, as the address bar
 * shows it: a port in the text replaces the URL's, and no port means none, so
 * switching `localhost:3000` to `example.com` drops the 3000. A text led by
 * `http://` or `https://` sets the scheme too; otherwise the scheme is kept.
 * User info, path, query and fragment are not touched; an invalid host, or a
 * URL whose prefix cannot be split into parts, is refused and the model left
 * alone.
 */
export function setHost(model, text) {
  const checked = normalizeHost(text);
  if (!checked.ok) return reject(checked.error);
  const parts = originParts(model);
  if (parts.length === 1 && parts[0].raw === model.prefix) return reject(FIXED_HOST);

  // The host as the target scheme normalises it (`:443` on https is no port
  // at all), which also refuses what the scheme cannot take, such as a port
  // on `file:`. Scheme, hostname and port are then set one by one, because
  // the `host` setter keeps an old port when the text carries none.
  const u = new URL(model.href);
  const scheme = checked.scheme || u.protocol;
  let wanted;
  try {
    wanted = new URL(`${scheme}//${checked.host}/`);
  } catch {
    return reject(BAD_HOST);
  }
  u.protocol = scheme;
  u.hostname = wanted.hostname;
  u.port = wanted.port;
  if (u.protocol !== scheme || u.hostname !== wanted.hostname || u.port !== wanted.port) return reject(BAD_HOST);
  const userinfo = parts.filter(p => p.role === 'userinfo').map(p => p.raw).join('');
  model.prefix = u.protocol + '//' + userinfo + u.host;
  model.href = u.href;
  return OK;
}

// --- Export ---

/**
 * The model as plain JSON, for Copy All: the decoded path segments in order,
 * and the query as an object where a key that repeats carries an array of its
 * values, so `tag=a&tag=b` is not flattened to the last one (F5).
 *
 * @param {UrlModel} model
 * @returns {{path: string[], query: Object}}
 */
export function toJson(model) {
  // A null prototype so a key such as `__proto__` is an ordinary own property.
  const query = Object.create(null);
  for (const { key, value } of model.entries) {
    if (!Object.hasOwn(query, key)) query[key] = value;
    else if (Array.isArray(query[key])) query[key].push(value);
    else query[key] = [query[key], value];
  }
  return { path: model.segments.map(s => s.text), query };
}
