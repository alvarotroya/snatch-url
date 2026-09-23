# Snatch URL

A small browser extension that opens the current tab's URL as a second address bar under
the real one: the URL on one coloured line, one button per part, a strip of section cells
(host, path, query, fragment) under it, and a drawer for whichever section you open. Click
a part to type over it. Edits are staged until you apply them, either to the tab you are
on or to a new one. It runs in Chrome, Edge and Firefox from the same directory.

It is a prototype, built to work out what the tool should really be. Expect rough
edges, and expect the UI to change. The design is prototype E of the UX review in
[`docs/ux-review/`](docs/ux-review/); the review's findings say why.

## What it does today

Click the toolbar icon and the popup reads the active tab's URL. It is 800 pixels wide,
Chrome's cap for a popup, so a typical URL fits on one to three lines.

**The bar.** The URL as it will be navigated to, coloured by role: host, path segments,
parameter names, parameter values, fragment. Click any path segment, parameter name or
parameter value and it turns into an input with its decoded text selected, so typing
replaces it. **Enter** commits, **Escape** cancels, clicking away commits. Nothing you
did not type is changed: `%20` stays `%20`, `a,b` stays `a,b`, and a part you click but
do not change is left byte for byte alone. A dragged selection in the bar is yours: copy
it with the keyboard.

- **⎘ URL** copies the whole URL.
- **decoded** shows every part decoded instead of as written; edits still write proper
  encoding.
- **one line** collapses the bar to a single line that scrolls sideways.

**The section strip.** One cell each for the host, the path (with its segment count), the
query (with its parameter count) and the fragment. Click a cell and a drawer opens under
the bar with one row per part of that section:

- click a name or value in a row to type over it, as in the bar
- **⎘** copies the part as written; a value that hides something - percent-encoding, a
  nested URL, base64, JSON, a JWT - carries a badge, and **⌄** unfolds it layer by layer,
  with **Copy decoded** for its most readable form
- **✕** deletes a segment or a whole parameter
- **Copy section** and **Copy decoded** in the drawer's header copy the whole section as
  written or as it reads
- the query drawer also has **Copy All**, which puts every path segment and parameter on
  the clipboard as a JSON object (a repeated key keeps all its values as an array), and
  **Clear**, which removes every parameter

**Host groups.** In the extension's settings page (the **⚙** in the popup's header, or the
extension's *Options* in the browser) you can list hosts that stand in for each other, one
group per line: `example.com, example-demo.com, localhost:3000`. When the tab is on a host
from a group, the host cell gains a **⇄ switch** dropdown of the group's other hosts;
picking one stages the switch like any other edit, and Apply goes there. A host that is in
no group changes nothing in the bar. Hosts are written the way the address bar shows them,
port included, so `localhost:3000` and `localhost:4000` are two hosts. A host may carry a
scheme, `http://localhost:3000`: switching to it sets that scheme too, where a bare host keeps
the tab's.

**⚡ Clean** strips the usual tracking parameters (`utm_*`, `fbclid`, `gclid` and
friends; the list is `TRACKING_KEY` in `draft.js`). **+ param** adds a `key=value`
parameter and opens it for typing: the name first, then, on Enter, the value. Escape, or
leaving the name empty, takes it back out.

**Applying changes.** Nothing touches the tab until you say so. Every edit, deletion
and addition goes into a draft, and the bar at the bottom says how many changes are
waiting:

- **Apply** (or **Ctrl+Enter**, **⌘+Enter** on a Mac) navigates this tab to the draft URL.
- **New tab** opens the draft URL in a new tab and leaves this one where it is.
- **Revert** throws the whole draft away.

While changes are waiting the count turns amber, every part you touched carries an amber
underline in the bar and an amber edge in its drawer row, and a deleted part stays in the
drawer struck through with a **Restore** button. That is also Clear's and Clean's undo:
the parameters they remove stay on screen until you apply, one Restore each.

An edit the model rejects, such as a blank key or segment, is put back and explained
rather than staged.

**Keyboard.** Tab reaches one part of the bar; **←** and **→** move between parts, **Enter**
types over the current one, **Backspace** deletes it, **Alt+←/→** move between parts from
anywhere, **Escape** closes the drawer.

Because the popup drives the tab it was opened from, it cannot act on the pages a
browser keeps extensions out of: `chrome://` pages and the Chrome Web Store, or
`about:` pages and addons.mozilla.org in Firefox.

## Trying it without installing

[`docs/demo/`](docs/demo/) wraps the real popup in a mock browser with a fake tab and a
built-in sample of host groups, so the second address bar and the host switch can be tried
in any browser with no extension installed; its **settings** button opens the real settings
page over the mock browser. Serve
the repository root over HTTP and open `/docs/demo/`:

```sh
python3 -m http.server 8000
# then http://localhost:8000/docs/demo/
```

The page says what the demo cannot show compared with the installed popup.

## Permissions

`activeTab` and `storage`. `activeTab` lets the extension read and change the URL of the
tab you are on, and only from the moment you click its icon: it has no access to your other
tabs, no browsing history access, and no network access of its own. `storage` is what keeps
the host groups: they live in the browser's synced extension storage (the profile's own,
not any server of ours) and fall back to this-device storage where sync is not available.
Neither permission shows an install warning.

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
`chrome.*` namespace, `action.default_popup`, `options_ui`, `tabs.query`, `tabs.update`,
`tabs.create`, `storage.sync` / `storage.local`, `runtime.openOptionsPage` and
`navigator.clipboard.writeText`; all of them behave the same in
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
| `manifest.json` | MV3 manifest: the popup, the options page, the `activeTab` and `storage` permissions, the Firefox add-on id |
| `popup.html` | popup markup |
| `popup.js` | renders the bar, the strip and the drawer, and is the only place the tab is navigated |
| `options.html`, `options.js` | the settings page: the host groups as one textarea |
| `settings.js` | host groups: their text form, the lookups, and `chrome.storage` with the sync-to-local fallback |
| `draft.js` | staging: what is edited, what is deleted, and what is still unapplied; the Clean list |
| `url-model.js` | the one place a URL is parsed and rebuilt |
| `url-tokens.js` | maps every part of a URL to the characters it occupies, for the bar |
| `value-inspect.js` | peels a value: percent, nested URL, base64, JSON, JWT |
| `*.test.js` | tests for the five modules |
| `styles.css` | popup and options page styling |
| `docs/demo/` | the popup in a mock browser, for trying it with no install |
| `docs/ux-review/` | the UX review the design came from |
| `icon{16,48,128}.png` | toolbar icons, generated by `tools/make-icons.sh` |

No build step and no runtime dependencies: edit the files and reload the extension.

`npm test` runs the module tests with `node --test`, which is built into
Node, so there is nothing to install first.

## License

[MIT](LICENSE).
