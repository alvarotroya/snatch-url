// Build self-contained prototypes.
//
// Why this exists: Lavish renders an artifact inside
//   <iframe sandbox="allow-scripts allow-forms allow-popups ...">
// with no `allow-same-origin`, so the artifact document has an opaque origin.
// A nested prototype frame inherits that sandbox, and every ES-module import
// it makes is then a cross-origin fetch from `origin: null`:
//
//   Access to script at '.../proto-core.js' from origin 'null' has been
//   blocked by CORS policy: No 'Access-Control-Allow-Origin' header ...
//
// The stylesheet still loads (link elements are not CORS-checked) so the
// prototype renders its empty shell and looks broken - which is exactly what
// the review showed. An INLINE module script runs fine in the same place.
//
// So: concatenate the real modules and the page's own script into one inline
// module, inline the stylesheet, and write a single file with no subresources
// at all. The sources stay normal ES modules; only the built copy is flat.
//
// The same property is what lets a built prototype open straight from a clone
// over file:// with no server.
//
//   node docs/ux-review/src/build.js            # rebuild all eight
//   node docs/ux-review/src/build.js p5-addressbar.html
//
// url-model.js and draft.js are read from the repository root, never copied,
// so a prototype always runs on the extension's real URL model.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));   // docs/ux-review/src
const root = join(here, '..', '..', '..');              // repository root
const dist = join(here, '..', 'prototypes');

// Where each shared module lives. The extension's own modules come from the
// root; only the prototype toolkit lives beside the sources.
const SOURCE = {
  'url-model.js': join(root, 'url-model.js'),
  'draft.js': join(root, 'draft.js'),
  'proto-core.js': join(here, 'proto-core.js'),
};

/** Strip the module syntax that only means anything across files. */
function flatten(source) {
  return source
    // import { a, b } from './x.js';  (single or multi-line)
    .replace(/^import\s+[\s\S]*?from\s+'[^']+';\s*$/gm, '')
    // export { a, b } from './x.js';  and  export { a, b };
    .replace(/^export\s*\{[\s\S]*?\}\s*(from\s+'[^']+')?;\s*$/gm, '')
    // export function / const / let / class
    .replace(/^export\s+(?=(function|const|let|class|async))/gm, '');
}

// What each shared module needs underneath it. Order here is also the order
// they are concatenated in.
const DEPS = {
  'url-model.js': [],
  'draft.js': ['url-model.js'],
  'proto-core.js': ['url-model.js'],
};
const ORDER = ['url-model.js', 'draft.js', 'proto-core.js'];

/** The modules a source file imports, by filename. */
function importsOf(source) {
  return [...source.matchAll(/from\s+'\.\/([\w-]+\.js)(?:\?[^']*)?'/g)].map(m => m[1]);
}

/**
 * Only the modules the page actually imports, plus their dependencies.
 *
 * Inlining all of them unconditionally is what broke p8-command: it declares
 * its own `addParam`, and so does draft.js, which the page never imported.
 * In separate modules that is fine; in one flat script it is a SyntaxError
 * that kills the whole page.
 */
function neededBy(pageSource) {
  const want = new Set();
  const visit = name => {
    if (want.has(name)) return;
    want.add(name);
    for (const dep of DEPS[name] || []) visit(dep);
  };
  for (const name of importsOf(pageSource)) {
    if (DEPS[name] !== undefined) visit(name);
  }
  return ORDER.filter(n => want.has(n));
}

function bundleFor(html) {
  const scriptRe = /<script type="module">([\s\S]*?)<\/script>/;
  const match = html.match(scriptRe);
  if (!match) throw new Error('no module script found');

  const modules = neededBy(match[1]);
  const shared = modules.map(f => `// ---- ${f} ----\n` + flatten(readFileSync(SOURCE[f], 'utf8')))
    .join('\n');
  const page = flatten(match[1]);

  const css = readFileSync(join(here, 'proto.css'), 'utf8');

  return html
    .replace(/<link rel="stylesheet" href="proto\.css">/, `<style>\n${css}\n</style>`)
    .replace(scriptRe, () =>
      '<script type="module">\n'
      + '// Bundled by build.js - see that file for why this is inline.\n'
      + shared + '\n// ---- page ----\n' + page + '\n</script>');
}

mkdirSync(dist, { recursive: true });

const pages = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(here).filter(f => /^p\d+-.*\.html$/.test(f));

for (const name of pages) {
  const src = readFileSync(join(here, basename(name)), 'utf8');
  const out = bundleFor(src);
  writeFileSync(join(dist, basename(name)), out);
  console.log(`${basename(name)} -> prototypes/${basename(name)} (${out.length} bytes, `
    + `inlined: ${neededBy(src.match(/<script type="module">([\s\S]*?)<\/script>/)[1]).join(' ')})`);
}
