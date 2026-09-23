// Snatch URL - value-inspect.js
//
// What a value really is, peeled one layer at a time: percent-encoding, then
// base64, then JSON, plus a JWT and a nested URL recognised on the way. This
// is what makes an encoded value or a nested URL readable instead of a wall of
// `%3A%2F%2F`.
//
// It is read-only. Committing an edit re-encodes only the percent layer (see
// url-model.js); re-packing an edited JSON body into base64 is not built.

import { decodeQueryPart } from './url-model.js';

// Long enough that a plain word is unlikely to qualify, and only the base64
// and base64url alphabets.
const B64 = /^[A-Za-z0-9+/_-]{12,}={0,2}$/;

function tryBase64(s) {
  if (!B64.test(s)) return null;
  try {
    const decoded = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    // Only call it base64 if what comes out is plausible text.
    if (decoded.length < 4) return null;
    if (!/^[\x09\x0a\x0d\x20-\x7e]+$/.test(decoded)) return null;
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

const NESTED_URL = /^https?:\/\/\S+$/i;

/**
 * @typedef {Object} Layer
 * @property {'raw'|'percent'|'jwt'|'base64'|'json'} kind
 * @property {string} label   one or two words for the UI
 * @property {string} text    the value after this many decoding steps
 * @property {boolean} isUrl  this layer is itself a URL
 */

/**
 * Peel a raw query value (or path segment) into layers. The first layer is
 * the value as written; each later one is what one more decoding step gives;
 * the last is the most human form of the value.
 *
 * The percent layer decodes the way the part's own section does: a query part
 * reads `+` as a space, a path segment or fragment keeps it a plus - pass
 * `safeDecode` for those.
 *
 * @param {string} raw
 * @param {(raw: string) => string} [decode]
 * @returns {Layer[]} always at least one layer
 */
export function peel(raw, decode = decodeQueryPart) {
  const layers = [{ kind: 'raw', label: 'as written', text: raw, isUrl: false }];
  let current = raw;

  const decoded = decode(current);
  if (decoded !== current) {
    current = decoded;
    layers.push({ kind: 'percent', label: 'percent-decoded', text: current, isUrl: false });
  }

  if (NESTED_URL.test(current.trim())) {
    layers[layers.length - 1].isUrl = true;
    return layers;
  }

  const jwtParts = current.split('.');
  if (jwtParts.length === 3) {
    const head = tryBase64(jwtParts[0]);
    const body = tryBase64(jwtParts[1]);
    if (head && body && tryJson(head) && tryJson(body)) {
      const pretty = [tryJson(head), tryJson(body)].join('\n---\n');
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

/** The most human form of a value: the last layer's text. */
export function plainText(raw, decode) {
  return peel(raw, decode).at(-1).text;
}

/**
 * A one-word badge for a value that is hiding something, or null for a plain
 * value. A nested URL earns its badge whether or not it was percent-encoded.
 *
 * @returns {'encoded'|'url'|'base64'|'json'|'jwt'|null}
 */
export function badgeFor(raw, decode) {
  const layers = peel(raw, decode);
  const last = layers[layers.length - 1];
  if (last.isUrl) return 'url';
  if (layers.length === 1) return null;
  return { percent: 'encoded', base64: 'base64', json: 'json', jwt: 'jwt' }[last.kind] || null;
}
