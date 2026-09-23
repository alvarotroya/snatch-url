# State of the project

A handover for whoever picks this up next, on any machine. Read this first, then `AGENTS.md` for the
build, test and browser-verification details.

## Where things stand

**The UX redesign is built: the popup is prototype E, the second address bar, on the real staging
layer, and the first "smarter function" is in: host groups.** The owner defines groups of
interchangeable hosts on a settings page; when the tab is on one of them the host cell offers the
others, and switching is staged like any edit. It is in the owner's hands to test, from the installed
extension or from the no-install demo in [`docs/demo/`](docs/demo/). The defaults listed below were
taken from the prototype where the review left a question open; each is his to change.

## What the extension does today

A Manifest V3 popup for Chrome, Edge and Firefox, 800 pixels wide, that shows the current tab's URL
as one coloured line with a button per part, a strip of section cells (host, path, query, fragment)
and a drawer per section. Click a part to type over it; copy, decode, delete and restore from the
drawer; ⚡ Clean strips tracking parameters; a host in one of the owner's host groups (settings page,
⚙ in the header) gets a ⇄ switch dropdown of the group's other hosts. Nothing navigates until Apply.
`README.md` → *What it does today* has the full list and the keyboard map.

Health: `npm test` → 157 tests, all passing, across `url-model`, `url-tokens`, `value-inspect`,
`draft` and `settings`. Permissions are `activeTab` and `storage`. No build step, no dependencies.

## What has landed

| PR | What it did |
|---|---|
| #1 | A raw-preserving URL model (`url-model.js`) with tests — untouched parts of a URL survive a round trip byte for byte. |
| #2 | Renamed to Snatch URL, dropped the `tabs` permission, added the licence and docs. |
| #3 | Fixed popup rendering, copy and error-reporting bugs. |
| #4 | Runs in Firefox and Edge from the same unpacked directory as Chrome. |
| #5 | Edits are staged behind an Apply step (`draft.js`), so nothing navigates until you say so; accessibility gaps fixed. |
| #6 | The UX review: eight working prototypes, findings, and the handover that led here. |
| #7 | The second address bar (prototype E) built into the popup; `url-tokens.js` and `value-inspect.js` moved in with tests; ⚡ Clean staged in `draft.js`; the no-install demo in `docs/demo/`. |
| next | Host groups: a settings page (`options.html`, `settings.js`, `chrome.storage.sync` with a local fallback, the `storage` permission), `setHost` in the model, the ⇄ switch beside the host cell, the demo's sample groups. |

## Decisions now settled

By the owner, in the review and before it:

1. **Popup, not side panel**, and **wide**: *"like a secondary adress bar below the real one? Just
   smarter and with more functions?"* Built at 800, which is the cap measured in an installed popup
   (Chromium 153: a 900 × 700 document was given exactly 800 × 600; Firefox 140 ESR gives the
   800 body its 800 and sizes the height from content).
2. **Horizontal and section-first.** The URL is one line with its parts addressable, not a form.

Taken from prototype E as the default where the review's questions had no owner answer, so the
owner can change any of them after trying it:

3. **The action mechanism** (review question 2): click a part to type over it, in the bar or in the
   drawer; per-row copy / look-inside / delete in the drawer; per-section copy-as-written,
   copy-decoded in the drawer head, plus Copy All (JSON) and Clear for the query. No hover cards, no fixed action bar, no command bar.
4. **Sections, not characters, own the mouse** (question 3): a plain click on a part types over it;
   a click on punctuation or a cell opens the section. A dragged character selection in the bar is
   left alone, so ⌘C / Ctrl+C still copies exact characters — but there is no typing over an
   arbitrary character range (that is prototype A's line).
5. **Encoding happens on commit, not while typing** (question 3, second half): the input holds the
   decoded text; the model encodes it when the edit is staged. Nothing is rewritten as you type.
6. **What Copy gives** (question 4): the per-part ⎘ and "Copy section" copy the text *as written*;
   "Copy decoded" is a separate, labelled action everywhere. A dragged selection copies characters.
7. **⚡ Clean is one click, not a preview**, and strips E's hard-coded list — now the `TRACKING_KEY`
   constant in `draft.js`. Everything it removes is a restorable ghost, like any staged deletion.
8. **Enter commits a type-over; Ctrl+Enter (⌘+Enter) applies.** PR #5's "Enter applies" was for
   the row form; in the bar, Enter ends the edit. Ctrl+Enter inside an input commits and applies.
9. **+ param** adds a `key=value` placeholder and arms the name, then (on Enter) the value — E's
   flow rather than the old key/value form at the bottom. Escape, or an empty name, takes the
   placeholder back out, so nothing is staged.
10. **The fragment is read-only** in the bar, and the host is typed over by nobody: the model now
    has `setHost`, but the bar offers the host only through the ⇄ switch of a configured group (the
    owner's ask), not as a free type-over. Both parts open their section, and copy.
11. **Host groups are a textarea, one group per line** (`example.com, example-demo.com,
    http://localhost:3000`), hosts written the way the address bar shows them, port included; a
    host with a scheme sets it on a switch, a bare host keeps the tab's. The first
    option of the switch is a label, so picking a host is an action and the control reads "switch"
    again once the change is staged; a host in no group changes nothing in the bar.

## Still open

1. **Typing over the host, and editing the fragment.** `setHost` and `hostStatus` exist now, so a
   host type-over in the bar is a popup change; the fragment still wants `setHash` in `url-model.js`.
2. **Character-level type-over.** Selecting characters across parts and typing is prototype A's
   editable line; the tokeniser it needs is now `url-tokens.js`, so it can be added inside E's shell.
3. **Re-packing a peeled value.** "Look inside" decodes base64 and JSON for reading; an edit only
   re-encodes the percent layer, so editing decoded JSON and having it re-packed is not built.
4. **Reorder.** Needs `moveSegment` / `moveEntry` and a `moved` status in `draft.js` first.
5. **Whether the Clean list is editable**, and paste-any-URL: the "smarter functions" from question
   4 still not built. The settings page is the natural home for an editable Clean list. Host groups
   could also grow: a `chrome.storage.onChanged` listener would let an open popup follow a save.
6. **Firefox at the 600 cap.** Measured in Firefox 140 ESR: the panel follows the 800 body width
   and sizes its height from content (226 shut, 486 with the query drawer open on the monster URL),
   so the shell never reaches the cap. What happens at 600 - whether the drawer scrolls or the panel
   does - has not been provoked there.

## Next work, in order

1. **The owner tests it** — the demo over the tailnet or the installed popup — and answers the
   defaults above with his hands. Change what he says; do not guess further.
2. Whatever he asks for from *Still open*, each as its own small PR that keeps the invariants below.

## Rules that must keep holding

These are easy to break by accident while iterating. `AGENTS.md` explains each.

- `url-model.js` is the only place URLs are parsed and rebuilt; nothing else re-implements it.
  `url-tokens.js` only lays offsets over what the model built.
- Only `applyDraft` in `popup.js` navigates. Every edit goes through `draft.js`.
- `activeTab` is the only tab-related permission; `storage` is the only other one. Adding `tabs` buys
  nothing and adds a browsing-history warning.
- No build step, bundler, framework or runtime dependency in the extension itself.
