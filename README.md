# Snatch URL

A small browser extension that opens the current tab's URL as editable rows: one row
per path segment, one row per query parameter. Edits are staged until you apply them,
either to the tab you are on or to a new one. It runs in Chrome, Edge and Firefox from
the same directory.

It is a prototype, built to work out what the tool should really be. Expect rough
edges, and expect the UI to change.

## What it does today

Click the toolbar icon and the popup reads the active tab's URL.

**Path** — one row per segment, in order:

- edit a segment in place
- copy a segment to the clipboard
- delete a segment

**Query** — one row per parameter, in order:

- edit a key or a value in place
- copy a value to the clipboard
- delete a parameter
- **Copy All** puts every parameter on the clipboard as a JSON object
- **Clear All** removes every query parameter
- the field at the bottom adds a new `key=value` pair (Enter also adds it)

**Applying changes.** Nothing touches the tab until you say so. Every edit, deletion
and addition goes into a draft, and the bar at the bottom says how many changes are
waiting:

- **Apply** navigates this tab to the draft URL.
- **New tab** opens the draft URL in a new tab and leaves this one where it is.
- **Revert** throws the whole draft away.
- Pressing **Enter** in a path or parameter field applies the draft to this tab, so a
  single edit is still one keystroke. (Enter in the add fields at the bottom adds the
  parameter, as before - it does not apply.)

While changes are waiting, the header URL turns amber and shows the URL the draft
would go to, and every row you touched carries an amber bar: edited, added, or - for a
deleted row - struck through with a **Restore** button. That is also Clear All's undo:
the parameters it removes stay on screen until you apply, one Restore button each.

An edit the model rejects, such as a blank key or segment, is put back and explained
rather than staged.

Rebuilding preserves the parts you did not touch: `%20` stays `%20`, `a,b` stays
`a,b`, a bare `debug` stays bare, and a trailing slash is kept.

Because the popup drives the tab it was opened from, it cannot act on the pages a
browser keeps extensions out of: `chrome://` pages and the Chrome Web Store, or
`about:` pages and addons.mozilla.org in Firefox.

## Permissions

Only `activeTab`: the extension can read and change the URL of the tab you are on,
and only from the moment you click its icon. It has no access to your other tabs, no
browsing history access, and no network access of its own.

## Install

One unpacked directory works in all three browsers: Chrome and Edge read the MV3
manifest, and the `browser_specific_settings.gecko` block in it is what Firefox needs.
Chrome and Edge ignore that block, so there is no build step and nothing to generate.

### Chrome

1. Clone or download this repository.
2. Open `chrome://extensions/`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick this directory.
5. Pin **Snatch URL** to the toolbar so the icon is one click away.

After changing any file, press the reload button on the extension's card in
`chrome://extensions/`.

### Edge

The same steps, at `edge://extensions/`: turn on **Developer mode**, click **Load
unpacked**, pick this directory. Edge runs the Chrome package as-is.

### Firefox

Firefox will not keep an unsigned add-on installed, so it is loaded temporarily and
goes away when you close the browser.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `manifest.json` in this directory.
3. Pin **Snatch URL** to the toolbar from the extensions (puzzle piece) menu.

`about:debugging` also has a **Reload** button, which is the equivalent of Chrome's.

`web-ext` does the same thing from a terminal, and starts a throwaway profile with the
add-on already loaded:

```sh
npx web-ext run --source-dir .
```

It is deliberately not a dependency of this repo — run it through `npx` when you want
it.

## Browser differences

`strict_min_version` claims Firefox 115. What is actually exercised is the popup's
`chrome.*` namespace, `action.default_popup`, `tabs.query`, `tabs.update`,
`tabs.create` and `navigator.clipboard.writeText`; all of them behave the same in
Chrome and Firefox, including the raw-encoding round trip. In particular Firefox resolves
`navigator.clipboard.writeText` from the popup with no extra permission and no prompt,
so the copy buttons need nothing Firefox-specific.

What does differ is the install, not the extension: Chrome and Edge keep an unpacked
extension across restarts, while Firefox drops a temporary add-on when it closes and
gives it a fresh random `moz-extension://` origin every time it is loaded.

`browser_specific_settings` costs Chrome nothing: it neither strips the key —
`chrome.runtime.getManifest()` still returns it — nor warns about it, which is why one
directory serves every browser and there is no `dist/` step.

Verified on Chrome 151 and Firefox 140 ESR. Edge was not available on the machine this
was checked on, so its instructions rest on it being the same Chromium extension stack,
not on a run.

## Layout

| File | What it is |
| --- | --- |
| `manifest.json` | MV3 manifest: the popup, the `activeTab` permission, the Firefox add-on id |
| `popup.html` | popup markup |
| `popup.js` | renders the rows and is the only place the tab is navigated |
| `draft.js` | staging: what is edited, what is deleted, and what is still unapplied |
| `url-model.js` | the one place a URL is parsed and rebuilt |
| `url-model.test.js`, `draft.test.js` | tests for them |
| `styles.css` | popup styling |
| `icon{16,48,128}.png` | toolbar icons, generated by `tools/make-icons.sh` |

No build step and no runtime dependencies: edit the files and reload the extension.

`npm test` runs the URL-model and draft tests with `node --test`, which is built into
Node, so there is nothing to install first.

## License

[MIT](LICENSE).
