// Snatch URL - url-tokens.js
//
// A map from each part of a URL to the exact character range it occupies in
// the URL string. Selecting a part, highlighting it in place, copying a piece
// out and typing over a piece all need to know where a part starts and ends,
// and neither url-model.js nor draft.js says.
//
// Nothing here parses or rebuilds a URL: the model does both. A token list is
// laid over `buildUrl(model)`, so its offsets are guaranteed to line up with
// the text the popup shows, and for every URL that survives the model's round
// trip - which is every URL url-model.test.js covers - that text is byte for
// byte the input.
//
// A token is one part of the URL plus where it lives:
//
//   role    scheme | userinfo | host | port | sep | seg | qmark | key | eq |
//           val | amp | hash
//   group   origin | path | query | hash
//   raw     the characters as they appear in the URL
//   text    the decoded characters, for display and for editing
//   start   character offset in the text (inclusive)
//   end     character offset in the text (exclusive)
//   index   position among siblings: the segment or entry index in the model
//   id      stable within one tokenisation: `seg-2`, `key-0`, `val-0`, ...
//
// Punctuation (`isPunct`) is a token too, so the tokens cover the text with
// no gaps. Editability is the popup's decision, by role.

import { parseUrl, buildUrl, originParts, safeDecode } from './url-model.js';

/** What to call a part in a label or tooltip. */
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

const PUNCT = new Set(['scheme', 'sep', 'qmark', 'eq', 'amp']);

/** Punctuation: the characters between parts, never a part themselves. */
export function isPunct(role) {
  return PUNCT.has(role);
}

/**
 * @typedef {Object} Token
 * @property {string} role
 * @property {'origin'|'path'|'query'|'hash'} group
 * @property {string} raw
 * @property {string} text
 * @property {number} start
 * @property {number} end
 * @property {number|undefined} index
 * @property {string} id
 */

/**
 * Lay tokens over a model. The model is read, never changed.
 *
 * @param {import('./url-model.js').UrlModel} model
 * @returns {{text: string, tokens: Token[]}}
 */
export function tokenizeModel(model) {
  const tokens = [];
  let pos = 0;

  const push = (role, raw, group, extra = {}) => {
    const token = {
      role,
      group,
      raw,
      text: extra.text !== undefined ? extra.text : raw,
      start: pos,
      end: pos + raw.length,
      index: extra.index,
      id: `${role}-${extra.index ?? tokens.length}`,
    };
    tokens.push(token);
    pos = token.end;
  };

  for (const { role, raw } of originParts(model)) push(role, raw, 'origin');

  // Path. An empty path is still a `/`, and an empty segment (`/a//b`) is a
  // real, zero-width token so its index stays right.
  if (model.segments.length === 0) {
    push('sep', '/', 'path');
  } else {
    model.segments.forEach((seg, index) => {
      push('sep', '/', 'path');
      push('seg', seg.raw, 'path', { text: seg.text, index });
    });
    if (model.trailingSlash) push('sep', '/', 'path');
  }

  // Query. A bare flag has a key and nothing else.
  if (model.entries.length > 0) {
    push('qmark', '?', 'query');
    model.entries.forEach((entry, index) => {
      if (index > 0) push('amp', '&', 'query');
      push('key', entry.rawKey, 'query', { text: entry.key, index });
      if (entry.rawValue !== null) {
        push('eq', '=', 'query');
        push('val', entry.rawValue, 'query', { text: entry.value, index });
      }
    });
  }

  if (model.hash) push('hash', model.hash, 'hash', { text: safeDecode(model.hash.slice(1)) });

  return { text: buildUrl(model), tokens };
}

/**
 * Parse a URL and lay tokens over it.
 *
 * @param {string} url
 * @returns {{ok: true, model: object, text: string, tokens: Token[]}
 *   | {ok: false, error: string}}
 */
export function tokenize(url) {
  const model = parseUrl(url);
  if (!model) return { ok: false, error: 'Not a URL.' };
  return { ok: true, model, ...tokenizeModel(model) };
}

/**
 * The token containing a character offset. A tie at a boundary goes to the
 * token that starts there; the very end of the text belongs to the last one.
 */
export function tokenAt(tokens, offset) {
  return tokens.find(t => offset >= t.start && offset < t.end)
    || tokens.find(t => offset === t.end)
    || null;
}

/**
 * Every token the range [from, to) touches, in order.
 *
 * A caret - a zero-width range - touches one token. When that one is
 * punctuation but a real part ends exactly there, the part wins: after typing
 * at the end of a value the caret sits on the `&`, and the user is still
 * working on the value.
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
