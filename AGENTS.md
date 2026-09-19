# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## What this is

A Chrome MV3 popup extension, no build step and no runtime dependencies. Load it
unpacked straight from the repo root. It is a POC-style prototype kept in fast
iteration, so keep changes lightweight: no bundler, framework, lint or CI.

## Tests

`npm test` runs `node --test` (built in). `package.json` carries a test script and
nothing else.

## The URL model invariant

`url-model.js` is the single place URLs are parsed and rebuilt; `popup.js` must not
re-implement either. It stores the RAW text of every path segment and query
key/value and re-encodes only the part an edit touches, so every untouched byte
survives a parse -> build round trip: `%20` stays `%20`, `a,b` stays `a,b`, a bare
`debug` stays bare, a trailing slash is kept. Decoding never throws - a malformed
escape such as `%zz` falls back to the raw text. Any change here needs a case in
`url-model.test.js`.

Edit functions return `{ ok }` or `{ ok: false, error }` rather than throwing, so
the popup can restore a rejected input and show the message.

## Browser verification

`popup.html` loads `popup.js` as `type="module"`. Branded Chrome ignores
`--load-extension`; verify with Chrome for Testing
(`npx @puppeteer/browsers install chrome@stable`) launched with `--load-extension`
and `--remote-debugging-port`, driven by `chrome-devtools-axi` via
`CHROME_DEVTOOLS_AXI_BROWSER_URL`. That tool needs `--categoryExtensions` to touch
`chrome-extension://` pages: set `CHROME_DEVTOOLS_AXI_MCP_PATH` to a two-line
wrapper that pushes the flag onto `process.argv` before importing the MCP bin. The
popup reads the ACTIVE tab, so activate the target tab and then reload the popup
tab. An unpacked extension's id is derived from the absolute path: sha256 of it,
first 32 hex digits, each mapped 0-f to a-p.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
