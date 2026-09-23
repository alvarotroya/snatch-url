# UX review — eight prototypes of a more direct popup

> **Decided: prototype E, the second address bar, is what the extension now is.** The popup in the
> repository root is E rebuilt on the real staging layer; `docs/demo/` runs it in a mock browser.
> The other seven prototypes stay here as the record of what was tried and why, and as a source of
> mechanisms (A's character selection, G's action bar, H's filter) if the owner wants one added.

## Open the review

Open [`index.html`](index.html) in Chrome. That is all — no server, no install, no build step. It
works straight from a clone over `file://`.

The page walks through all eight prototypes, each embedded live and working, then compares them and
ends with four questions. Answer the ones you have a view on and press **Record**; your answers
collect in a box at the bottom that you can copy and hand to whoever builds the next step.

Each embedded prototype has an **open in its own tab ↗** link for a full-size copy. Clipboard buttons
work more reliably there than inside the embedded frame.

## What is here

| Path | What it is |
|---|---|
| [`index.html`](index.html) | The review page. Start here. |
| [`FINDINGS.md`](FINDINGS.md) | The written findings: each prototype's strengths and weaknesses, the captain's steers in his words, what is settled, what is open, and the proposed first ship tasks. |
| [`prototypes/`](prototypes/) | The eight prototypes, each a single self-contained HTML file you can open directly. |
| [`src/`](src/) | Their editable sources, the shared toolkit they run on, and the bundler. |

## Changing a prototype

Edit the source in `src/`, never the built copy in `prototypes/`, then rebuild:

```bash
node docs/ux-review/src/build.js                    # all eight
node docs/ux-review/src/build.js p5-addressbar.html # just one
```

`build.js` inlines the extension's real `url-model.js` and `draft.js` from the repository root, plus
`src/proto-core.js` and `src/proto.css`, into one file per prototype. The prototypes are single files
on purpose: a page that imports ES modules will not load over `file://`, nor inside a sandboxed
frame. The header comment in `build.js` has the detail.

If you change `url-model.js` or `draft.js`, rebuild — otherwise the prototypes keep running on the
old copy.
