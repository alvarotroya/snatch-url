# State of the project

A handover for whoever picks this up next, on any machine. Read this first, then `AGENTS.md` for the
build, test and browser-verification details.

## Where things stand

**The extension works and is stable. Its next step is a UX redesign, and the captain is choosing the
direction.** Nothing should be built toward that redesign until he has picked.

## What the extension does today

A Manifest V3 popup for Chrome, Edge and Firefox that takes the current tab's URL apart so you can
edit it: path segments and query parameters as editable rows, each with copy and delete, staged until
you press Apply or Apply in new tab. No build step, no runtime dependencies, one directory loaded
unpacked serves all three browsers. `README.md` → *What it does today* has the full feature list.

Health: `npm test` → 71 tests, all passing. Permissions are `activeTab` only.

## What has landed

| PR | What it did |
|---|---|
| #1 | A raw-preserving URL model (`url-model.js`) with tests — untouched parts of a URL survive a round trip byte for byte. |
| #2 | Renamed to Snatch URL, dropped the `tabs` permission, added the licence and docs. |
| #3 | Fixed popup rendering, copy and error-reporting bugs. |
| #4 | Runs in Firefox and Edge from the same unpacked directory as Chrome. |
| #5 | Edits are staged behind an Apply step (`draft.js`), so nothing navigates until you say so; accessibility gaps fixed. |

## In flight: the UX direction

The captain, after using the extension: *"I'm thinking of a pop up that really allows me feel I'm
touching that URL with my hands. Copy parts of it, overwrite parts of it, select certain chars
there, select entire portions."* The row-of-input-boxes popup is what stands between him and that.

Eight working prototypes answer it, in [`docs/ux-review/`](docs/ux-review/). Open
[`docs/ux-review/index.html`](docs/ux-review/index.html) in a browser — no server needed. The
written findings are in [`docs/ux-review/FINDINGS.md`](docs/ux-review/FINDINGS.md).

**Settled so far, by the captain:** it stays a **popup**, not a side panel — but a **wider** one,
*"like a secondary adress bar below the real one? Just smarter and with more functions?"* That is
prototype E.

## Decisions that are the captain's

Do not make these on his behalf. They are the four questions at the end of the review page.

1. **The shell** — how the URL is laid out and how wide the popup is. E, the wide second address bar,
   is the front-runner because it is his own idea, but he has not confirmed it.
2. **The action mechanism** — how you act on a part once you have it: a menu, a hover card, a fixed
   action bar, or typing a command.
3. **Characters or sections.** Dragging a selection through raw characters and click-selecting
   coloured sections both want the same mouse gesture. He has asked for both. **This one unblocks the
   rest.**
4. **Which "smarter" functions** make the cut — stripping tracking parameters, decoding nested and
   base64 values, drag to reorder, paste any URL to take it apart, per-site presets.

## Next work, in order

1. **Wait for the captain's pick.** If his answers are not in the repository or the conversation,
   ask for them. Do not choose.
2. **Measure the real popup size limit.** Every wide design assumes Chrome's documented 800 × 600
   cap. Install the extension unpacked (the recipe is in `AGENTS.md`), set `popup.html` to 800px
   wide, and measure before any layout depends on it. Check Firefox too, where the panel sizes itself
   from its content.
3. **Move the URL tokeniser into the extension**, with tests. `docs/ux-review/src/proto-core.js` maps
   each part of a URL to its exact character range — the one piece every direction needs and no
   shipped module has. It belongs next to `url-model.js` as `url-tokens.js`.
4. **Move the value inspector in**, with tests — `peel` and `badgeFor` from the same file, which
   decode percent, base64, JSON, JWT and nested-URL values.
5. **Build the chosen shell and action mechanism** in place of the row list in `popup.js`, keeping
   `applyDraft` as the only thing that navigates.

`docs/ux-review/FINDINGS.md` → *Concrete first ship tasks* has the full list with the detail.

## Rules that must keep holding

These are easy to break by accident while redesigning. `AGENTS.md` explains each.

- `url-model.js` is the only place URLs are parsed and rebuilt; nothing else re-implements it.
- Only `applyDraft` in `popup.js` navigates.
- `activeTab` is the only permission. Adding `tabs` buys nothing and adds a browsing-history warning.
- No build step, bundler, framework or runtime dependency in the extension itself.
