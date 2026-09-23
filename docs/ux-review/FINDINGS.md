# UX prototypes — findings

What the eight prototypes in this folder are, what each is good and bad at, what the captain has
said about them, and what is already settled versus still his to decide.

> **Status: decided and built.** The captain chose E, the second address bar, and the popup in the
> repository root is now that design on the real staging layer. `STATE.md` records which of the
> questions below are settled, which defaults were taken from E, and what is still open.

## In one screen

- **The ask is directness.** Today the popup shows the URL as a list of labelled rows with input
  boxes — you edit a field, not the URL. The captain wants to feel he is handling the URL itself:
  select any characters or whole parts, copy a piece out, type over a piece.
- **Eight working prototypes**, all on the extension's real `url-model.js`, all in its Catppuccin
  Mocha design language. Open [index.html](index.html) to try them in place, or any file in
  [prototypes/](prototypes/) on its own.
- **They are not eight rival designs but two independent choices:** a **shell** (how the URL is laid
  out, how wide the popup is) crossed with an **action mechanism** (menu, hover card, fixed bar,
  typing, or direct text). Pick one of each.
- **Already settled by the captain:** stay a popup, not a side panel — but make it wider, like *"a
  secondary address bar below the real one"*. That is prototype E.
- **The one question that unblocks the rest:** dragging a selection through raw characters and
  click-selecting coloured sections both want the same mouse gesture. He has asked for both.
- **The most reusable piece of code** is [`src/proto-core.js`](src/proto-core.js): the map from each
  part of a URL to its exact character range, which no shipped module has yet. Every direction needs
  it.

| | Prototype | One line |
|---|---|---|
| A | [Live Line](prototypes/p1-inline.html) | The URL *is* the input — one coloured editable line; `Alt+↑/↓` grows and shrinks the selection. |
| B | [Bricks](prototypes/p2-bricks.html) | The URL as chips you multi-select, drag to reorder, split, and walk inside. |
| C | [Split](prototypes/p3-split.html) | Raw text above a row list, wired both ways. |
| D | [Rail](prototypes/p4-rail.html) | Horizontal section cells; clicking one drops a panel of numbered rows. |
| **E** | [**Second Address Bar**](prototypes/p5-addressbar.html) | **The captain's own idea.** 800 wide, under the real omnibar, section cells, `⚡ Clean`. |
| F | [Hover Cards](prototypes/p6-hovercards.html) | No menus — point at a part and a card offers its actions. |
| G | [Action Bar](prototypes/p7-actionbar.html) | One fixed bar; selecting a part swaps its contents. Every action has a key. |
| H | [Command Bar](prototypes/p8-command.html) | Type a part's name to filter, `Enter` to edit it. |

Every prototype has three sample URLs — `short`, `typical`, and a 13-parameter `monster` with a
base64 JSON value and a nested URL — switchable from the dashed strip along its top.

## The captain's steers, in his words

1. **Round 1, the brief:** *"a pop up that really allows me feel I'm touching that URL with my hands.
   Copy parts of it, overwrite parts of it, select certain chars there, select entire portions."*
   → built **A · Live Line**, **B · Bricks**, **C · Split**.
2. **Round 2, after trying them:** *"…also try the following, the URL as an overlay or displayed
   horizontally with dropdowns for each section, quick actions for each section something like this.
   …build 5 prototypes."*
   → built **D · Rail**, **F · Hover Cards**, **G · Action Bar** and **H · Command Bar**.
3. **Round 3, mid-build:** *"We'll keep a popup but can we experiment with making it wider? like a
   secondary adress bar below the real one? Just smarter and with more functions?"*
   → built **E · Second Address Bar**: 800 wide, ~190 tall, anchored where a real popup anchors, which
   is directly under the browser's own address bar.

**This is the strongest signal so far.** It answers the popup-vs-side-panel question
(popup, but wide), and it names a shape rather than a feature.

## Why today's popup falls short of the ask

The parsing underneath is good and none of it needs replacing. The *surface* is the problem: the URL
is rendered as a read-only caption (`popup.html:14`, `popup.js:78-89`), and the thing the user's hands
reach is a list of `<input>` rows built in `popup.js:143-247`.

Measured against the four interactions he named:

| He said | Today | Why |
|---|---|---|
| select certain chars | only inside one box | Each row is its own `<input>`; a selection cannot cross from a key into its value, let alone between rows. |
| select entire portions | not possible | There is no "the whole query" object. `renderPath`/`renderQuery` emit independent rows. |
| copy parts of it | one value at a time | The ⎘ button copies one field (`popup.js:163,214`); Copy All gives JSON, not URL text. |
| overwrite parts | works | The one thing a form is good at, and the only direct-feeling interaction in the popup today. |

Secondary but relevant: on the demo URL, four of seven parameters are below the fold at 440×600, and
the header URL is clamped to two lines (`styles.css:43-53`).

## The one thing that was missing, and now exists

Every "touch the URL directly" design needs the same primitive that neither `url-model.js` nor
`draft.js` has: **a map from each part of the URL to the exact character range it occupies in the URL
string**. Selection, in-place highlighting, copy-a-piece and type-over-a-piece are all splices into
that string.

[`src/proto-core.js`](src/proto-core.js) adds it without re-implementing any parsing:

- `tokenize(url)` → `{ text, model, tokens }` where each token is
  `{ role, raw, text, start, end, group, index, id }`. Roles: `scheme, userinfo, host, port, sep, seg,
  qmark, key, eq, val, amp, hash`.
- `text` is `buildUrl(model)`, not the input string, so offsets are guaranteed to line up with what is
  rendered. Verified byte-identical to the input for all three sample URLs:

  ```
  short    text===input? true | tokens cover text? true | n= 10
  typical  text===input? true | tokens cover text? true | n= 38
  monster  text===input? true | tokens cover text? true | n= 58
  ```

- `tokensIn`, `tokenAt`, `groupRange` for selection maths; `encodeFor(role, text)` routes to the
  model's `encodeSegment` / `encodeQueryPart`; `spliceRaw` does the edit.
- `peel(raw)` decodes a value layer by layer — percent → base64 → JSON, plus JWT and nested-URL
  detection — which is what makes an encoded value touchable instead of a wall of `%3A%2F%2F`:

  ```
  peel('https%3A%2F%2Fpartner.io%2Fgo%3Fcid%3D42%26utm%3Demail')
    as written      : https%3A%2F%2Fpartner.io%2Fgo%3Fcid%3D42%26utm%3Demail
    percent-decoded : https://partner.io/go?cid=42&utm=email   (flagged isUrl)
  peel('eyJ1c2VyIjoiYWx2YXJvIiwicm9sZSI6ImFkbWluIiwic2NvcGUiOlsicmVhZCIsIndyaXRlIl19')
    as written -> base64-decoded -> JSON
  ```

**This module is the most reusable thing the prototyping produced.** Whichever direction wins, roughly 200 of
its 322 lines should move into the extension as `url-tokens.js` next to `url-model.js`.

## Round 1: the three designs

The demo URL used throughout (`SAMPLES.typical` in `proto-core.js`):

```
https://shop.example.com:8443/eu/catalog/women%27s%20shoes/item
  ?q=running%20shoes&sort=price_desc&tags=sale,new
  &ref=https%3A%2F%2Fpartner.io%2Fgo%3Fcid%3D42%26utm%3Demail&debug&tag=a&tag=b#reviews
```

Each prototype also carries a `monster` sample (13 params, base64 JSON, nested URL) and a `short` one.

### A · Live Line — [`prototypes/p1-inline.html`](prototypes/p1-inline.html)

**The URL is the input.** A `contenteditable="plaintext-only"` line, re-tokenised and re-coloured on
every keystroke, with the caret restored by character offset. Under it: a map strip
(`host / path / query / #`) that selects a whole portion, and an inspector for whatever the caret is
standing on.

- **Arbitrary characters** — native. Drag, shift-arrow, double-click, ⌘C all behave exactly as in a
  text field, because they *are* the browser's.
- **Whole part** — double-click snaps the selection to the token under the cursor.
  <kbd>Alt</kbd>+<kbd>↑</kbd> grows part → parameter → group → whole URL (expand-selection);
  <kbd>Alt</kbd>+<kbd>↓</kbd> shrinks; <kbd>Alt</kbd>+<kbd>←→</kbd> hops part to part.
- **Copy** — ⌘C copies exactly the characters; the inspector adds *Copy plain* (decoded) and *Copy raw*.
- **Type over** — select and type. Characters that are never legal in a URL (space, `"`, `<`, `>`,
  backtick, `{}`, `|`, `\`, `^`, anything non-ASCII) are percent-encoded **as they are typed**;
  structural characters are not, so typing `&` really does create a parameter and `/` really does split
  a segment.
- **Encoded / nested values** — the inspector peels the part under the caret and lets you edit the
  decoded form, re-encoding on commit. With nothing selected it shows a decoded reading of the whole
  line (percent only — peeling base64 there turned one line into thirty, so that is deliberately
  limited to the part inspector).

Verified in the browser: selecting chars 66–81 (`running%20shoes`) and typing `hiking boots` produced

```
…/item?q=hiking%20boots&sort=price_desc&tags=sale,new&ref=https%3A%2F%2F…
```

— the space auto-encoded, every other byte untouched, status bar `1 unapplied change`, and exactly one
token carrying the `edited` marker (`[...document.querySelectorAll('.tk.edited')]` → `hiking%20boots`).

**Good at:** every word of the brief, literally. No translation between what you see and what will be
navigated to. **Bad at:** readability (raw is raw), aiming on a long URL, reordering (cut and paste
only), and assistive technology — a re-highlighting contenteditable is the worst of the three.

### B · Bricks — [`prototypes/p2-bricks.html`](prototypes/p2-bricks.html)

**The URL is a handful of objects.** Wrapping rows of chips grouped by portion, with a gutter glyph
(`⌂ / ? #`) per row that selects the whole portion. Imports the real `draft.js`, so staging, ghosts and
Apply are the shipped behaviour, not a mock.

- **Selection** — click, <kbd>⇧</kbd>-click for a range, <kbd>⌘</kbd>-click to toggle, gutter glyph for
  a whole portion; arrows/space/Enter/⌫ for the keyboard.
- **Copy** — multi-select then *Copy* gives real URL text (`tags=sale,new&ref=…&debug`), *Plain* gives
  the decoded values one per line. Today's popup cannot copy two things at once at all.
- **Type over** — double-click a brick; the text comes up **pre-selected**, so typing replaces it.
  Verified: `type-over-armed=true`, and committing produced `…/catalog/men's%20boots/item?…` (space
  encoded, apostrophe left legible by `encodeSegment`).
- **Reorder** — drag within a row. Verified: dragging `tags` before `q` produced
  `?tags=sale,new&q=running%20shoes&sort=price_desc&…` with the status bar reading
  `1 unapplied change + reorder`. Reordering changes no text, so it needed its own marker: a part is
  "moved" when another part that started before it now sits after it (dashed yellow outline).
- **Pull apart / walk inside** — *Split* turns `sale,new` into separate sub-chips. *Inside* opens a
  nested URL as **its own row of bricks** (`partner.io [go] [cid=42] [utm=email]`), editable, with
  *Put it back* re-encoding into the parent value. Verified working.
- **Delete** — staged as dashed ghost chips that restore on click (that is `draft.js`'s `removed` list).

**Good at:** whole portions, multi-part copy, density (the 13-parameter monster URL fits with no
scrolling — the only design that gets *better* as URLs get worse), reordering, nesting, keyboard.

**Bad at, honestly:** you cannot drag a character selection from one brick into the next. Inside a
brick the caret is native; across bricks you select bricks. That is the one thing in the captain's list
this design does not do. It also has no URL text to trust, which is why I added a dim selectable
`resulting url` strip with a Copy URL button at the bottom — a patch on a real loss. And punctuation is
not the user's: you press *+ param* instead of typing `&`.

### C · Split — [`prototypes/p3-split.html`](prototypes/p3-split.html)

**Raw text and structure, wired both ways.** A real `<textarea>` (so selection is exactly the address
bar's) sits over a backdrop div that paints the role colours and the highlight bands; the textarea's
text is transparent with a translucent `::selection`, so the colours show through the selection. Below
it, one row per part — and one row per *parameter*, not per token, so 13 tokens do not become 13 rows.

- **Line → list**: selecting characters lights the covered rows and the strip says what you grabbed.
  Verified: `setSelectionRange(118,140)` (mid-way through the nested URL value) →
  `rows lit: param 4 | 22 chars · inside param value`.
- **List → line**: hovering a row glows its characters in the line; clicking makes it a *real*
  selection. Verified: clicking the `tags` row → `selected chars [98,111] = "tags=sale,new"`.
- Group headers select a whole portion. Parameter rows have two clickable halves (name / value).
- `⌄` unfolds the decode stack under the row; *Copy decoded* / *Edit decoded*.
- Because the top is a plain text field, **pasting any URL takes it apart** — something the popup
  cannot do today at all.

**Good at:** both kinds of selection with no trade, teaching the structure (it is the only design that
*shows* the mapping), accessibility, and it is the smallest build because half of it already exists.

**Bad at:** room. Two views of the same URL cost double the height; at 440×600 the line takes a third
of the popup and the list still scrolls on the monster URL. It is also still a form at the bottom — if
the complaint is "it feels like a form", C answers it halfway. No reordering.

## Round 2 and 3: five more designs

Built after the captain asked for "horizontal with dropdowns for each section, quick actions for each
section". E came last, after his third steer redefined what the wide one should be. Every interaction
described below was driven in a real browser, not just written.

### E · Second Address Bar — [`prototypes/p5-addressbar.html`](prototypes/p5-addressbar.html) (the captain's own idea)

A Chrome action popup is capped at **800 × 600** and is anchored under the toolbar icon, so a wide,
shallow popup lands directly beneath the real address bar. E is 800 wide and ~190 tall with its drawer
shut. The prototype draws a mock browser above it so the effect is visible.

- The whole demo URL fits in **three lines**; the 440px popup needed six and still clipped it.
- **Sections are cells with carets** — `HOST shop.example.com ▾ | PATH 4 segments ▾ | QUERY 7 params ▾ |
  # reviews ▾`. Clicking one opens a shallow drawer *under* the bar.
- **Click any part in the bar to type over it** (text pre-armed). Verified: editing `price_desc` to
  `price asc` produced `sort=price%20asc` with every other byte untouched.
- **Section actions**: copy the section raw, copy it decoded, clear it. Verified both copy modes give
  different correct strings (`?q=running%20shoes&…` vs `?q=running shoes&…`).
- **"More functions", which is where the width pays:**
  - `⚡ Clean` strips tracking parameters. Verified on the monster URL: *"Stripped 3 tracking
    parameters"*, 0 `utm_` left, URL still ends `&debug#panel-spend`.
  - `decoded` flips the whole bar to what the URL says; edits still write proper encoding.
  - `one line` collapses to a single sideways-scrolling line — the purest address-bar shape.
  - `+ param` inserts before the fragment (verified `…&tag=b&page=value#reviews`), peel-the-value in
    the drawer, copy the whole URL.
- **Honest weaknesses:** 800px covers most of a 1280px window; it is still a popup so it dies on blur —
  the thing it most resembles is the one thing it cannot be; no character selection (the bar is spans,
  not a text field); one-character parts like `tag=a` are tiny targets; the drawer repeats the bar.

### D · Rail — [`prototypes/p4-rail.html`](prototypes/p4-rail.html)

Horizontal rail of section cells; clicking one drops a roomy panel of numbered rows with copy / edit /
delete each, plus section actions (Copy / All / + Add / Clear) and a URL preview strip.
Verified: type-over armed, edit → 1 change, delete → 2 changes, Copy section →
`?q=running%20shoes&sort=price%20asc&ref=…` with the deleted parameter gone.
**Weak:** at 440 the rail scrolls sideways; one section at a time; URL and parts never co-visible.

### F · Hover Cards — [`prototypes/p6-hovercards.html`](prototypes/p6-hovercards.html)

No menus at all: point at a part and a card appears under it with the decoded value and
Copy / Edit / Delete; click to pin it. Verified: hovering the `sort` value produced a card reading
*"value of sort / price_desc / Copy Edit Delete param"*.
**Weak:** fiddly at 440px, nothing is discoverable until you hover, and hover is the worst input for
touch and assistive tech.

### G · Action Bar — [`prototypes/p7-actionbar.html`](prototypes/p7-actionbar.html)

One action bar, always in the same place; selecting a part swaps its contents. Every button carries its
key. Verified: selecting `price_desc` enabled `Copy C · Decoded ⇧C · Edit E · Dup ⇧D · Delete ⌫ ·
Decode D`, and pressing `C` copied `price_desc`.
**Weak:** permanent vertical space for a bar that is empty until you select; everything is two steps.

### H · Command Bar — [`prototypes/p8-command.html`](prototypes/p8-command.html)

URL on top, one input underneath: type to filter parts, keys to act, and the same input becomes the
editor. Verified: typing `sort` highlighted `sort=price_desc` above and listed it alone; Enter turned
the input into "edit param value" with the value armed; committing gave `price%20asc`, 1 unapplied
change, other params untouched.
**Weak:** five prefixes to learn and nothing teaches them; a mouse user gets almost nothing; it is the
least "touching it with your hands" of the eight.

## Comparison

Eight prototypes will not rank in a single line, and trying to rank them is the wrong question.
They vary along **two axes that are independent of each other**, and that is the framing the review
puts to the captain:

- **The shell** — how much room the URL gets and where it lives.
- **The action mechanism** — how you get from *"I can see that part"* to *"do something to it"*.

Any shell can carry any mechanism. The captain picks one of each rather than picking a prototype.

| | Shell | How you act on a part | Char-level select | Reorder | Monster URL (13 params) | Fits 440px |
|---|---|---|---|---|---|---|
| **A · Live Line** | one editable line | select it and type; `Alt+↑/↓` grows and shrinks the selection | **native, exact** | cut and paste | 6 wrapped lines, scrolls | yes |
| **B · Bricks** | wrapping chip canvas | click a chip, act from the chip | only inside one chip | **drag** | **fits, no scroll** | **best** |
| **C · Split** | raw line above a row list | edit the row, or the line | **native, exact** | no | both halves scroll | tight |
| **D · Rail** | horizontal section cells + dropdown | open a section, act per numbered row | no | no | dropdown scrolls | yes |
| **E · Second Address Bar** | **800-wide bar under the omnibar** + shallow drawer | click a section cell, act in the drawer; `⚡ Clean` strips tracking | no | no | one line + a 7-row drawer | needs 800 |
| **F · Hover Cards** | any of the above | hover a part, a card offers its actions | no | no | cards collide on dense lines | yes |
| **G · Action Bar** | any of the above | a fixed bar, every action on a single key | no | no | constant height, never moves | yes |
| **H · Command Bar** | any of the above | type a part's name to filter, `Enter` to edit it | no | no | **filtering makes length irrelevant** | yes |

**The one place the axes are not free.** F, D and E all claim the plain mouse-down on the URL:
it means *"target this part"*. A and C need that same gesture to mean *"start a character
selection"*. One gesture cannot do both, so a design either drag-selects characters or
click-selects parts, and the other has to move to a modifier or a mode. This is question 3 in the
review and the one I most want answered, because it decides whether the shipped surface is text
that happens to be structured (A/C) or structure that happens to render as text (B/D/E/F).

G and H have no such conflict — a bottom bar and a filter box sit *beside* the URL, not on it, so
either can be added to whatever wins.

**The prototyper's recommendation — a recommendation, not a decision.** E's shell — it is the captain's own idea, the extra
width is what makes a real URL stop wrapping, and `⚡ Clean` is the first thing in any of these
eight that does something a person cannot already do by hand. Inside it, A's line rather than E's
current section cells, so characters stay selectable. Then G's action bar along the bottom, because
it is the only mechanism that is discoverable and fast at the same time: it shows the whole
vocabulary without a hover, and every entry has a one-key shortcut. H's filter is a later addition
that costs nothing to defer.

## The popup-versus-side-panel question — answered

This was question 1 of round 1, raised with a live toggle that resized every demo between
`440×600` (popup) and `400×760` (side panel). The captain answered it in round 3, unprompted:

> "We'll keep a popup but can we experiment with making it wider? like a secondary adress bar below
> the real one? Just smarter and with more functions?"

So: **popup, not side panel.** What that settles and what it costs:

- A Chrome action popup dies on blur and is anchored under the toolbar icon. `chrome.sidePanel` (MV3)
  stays open while browsing and keeps state across tabs, but needs a `sidePanel` permission and is the
  one change here Firefox does not match one-to-one (it has `sidebarAction`, a different API) —
  relevant because `browser_specific_settings.gecko` already makes one directory serve all three
  browsers. Staying on the popup keeps that property for free.
- The popup is not stuck at 440. Chrome's documented ceiling is **800 × 600**, and 800 is what E uses:
  wide enough that `SAMPLES.typical` stops wrapping entirely and `SAMPLES.monster` takes one line plus
  a drawer. The review flags this number as worth re-verifying in a real installed popup before
  anything is committed to it — the prototypes are ordinary pages sized to 800, not a real popup.
- Height is the thing the popup cannot buy. At 600 a wide bar plus a deep list does not fit, which is
  why E's drawer is deliberately shallow (`max-height: 260px`) rather than a full row list. A design
  that wants both the URL and every part visible at once still wants the side panel; E's answer is to
  show the URL always and one section at a time.
- Every prototype is a single flex column, so none of them is pinned to a height either way.

## Captain's decision

Three steers have landed so far; the final direction is still open. What he has said, verbatim, and
what each one settles:

| His words | What it settles |
|---|---|
| *"a pop up that really allows me feel I'm touching that URL with my hands. Copy parts of it, overwrite parts of it, select certain chars there, select entire portions."* | The goal. Four verbs, all of which need part→character-range mapping, which is why `proto-core.js` exists. |
| *"the URL as an overlay or displayed horizontally with dropdowns for each section, quick actions for each section"* | Horizontal, section-oriented, with per-section actions — D and E are the direct answers, F/G/H are the other ways to hang actions off a section. |
| *"We'll keep a popup but can we experiment with making it wider? like a secondary adress bar below the real one? Just smarter and with more functions?"* | **Popup, not side panel.** Width is on the table up to Chrome's 800 cap. E is this idea built. |

_Still open: which shell and which action mechanism ship, and the four questions on the review page
([index.html](index.html#decide)). **The captain is choosing; nothing should be built until he has.**_

## Interaction decisions settled

1. **Popup, not side panel** — his words above. Keeps the single-directory, three-browser property and
   adds no permission.
2. **Wider than 440** — up to Chrome's 800 × 600 cap. E is built at 800 and the typical URL stops
   wrapping there. Flagged in the review as worth re-verifying in a real installed popup first.
3. **Horizontal, section-first** — a URL shown as one line with its portions addressable, not as a
   vertical form of rows. Every round-2 and round-3 prototype obeys this; the shipped popup does not.
4. **Nothing navigates until Apply** — unchanged from PR #5 and respected by all eight prototypes.
   Every edit is staged; the status bar counts unapplied changes.
5. **Every part carries both truths.** Raw and decoded are both reachable everywhere (`peel` for
   reading, `encodeFor` on commit). Which one a bare ⌘C gives is question 4 and still open.

_Pending the rest of the review: the shell, the action mechanism, and questions 1–4._

## What remains open

Independent of which shell and mechanism win:

1. **Encoding while typing.** A auto-encodes illegal characters as you type. Convenient, but the tool
   is quietly editing what the user typed. Alternatives: encode but mark it visibly, or never touch it
   and offer a one-click fix. (Question 3 in the review.)
2. **What Copy means.** Every part has two truths — `running%20shoes` and `running shoes`. One has to
   be what ⌘C gives. (Question 4.)
3. **Re-packing a peeled value.** `peel` decodes base64 and JSON for reading; committing an edit only
   re-encodes the percent layer. Editing decoded JSON and having it re-packed to base64 is not built.
4. **Reorder needs a home in `draft.js`.** The prototypes splice `draft.work.segments/entries`
   directly. `rowStatus` compares a row against its *base index*, so a pure reorder reads as
   "unchanged"; B computes a separate `movedUids` set. If reorder ships, that belongs in `draft.js`
   alongside `rowStatus`.
5. **Accessibility of the winning surface.** A contenteditable line (A), a chip canvas (B) and E's
   section cells all need deliberate ARIA work that the prototypes only sketch. C is free here, and
   G's action bar is the only mechanism that is keyboard-complete as prototyped.
6. **Duplicate keys.** `tag=a&tag=b` renders as two independent parts everywhere — correct, but no
   design offers "select both tags" other than by hand.
7. **Which tracking parameters `⚡ Clean` strips.** E ships a hard-coded regex (`utm_*`, `fbclid`,
   `gclid`, `gbraid`, `wbraid`, `msclkid`, `yclid`, `igshid`, `mc_cid`, `mc_eid`, `_ga`, `_gl`,
   `vero_*`, `mkt_tok`). Whether that list is editable, and whether Clean is one click or a preview,
   is unasked.
8. **800 is Chrome's documented cap, not a measured one.** Every wide prototype assumes it. Verify in
   a real installed popup — via the Chrome recipe in `AGENTS.md` — before any layout depends on it.

## Concrete first ship tasks

Ordered, each one a small PR, each leaving the extension loadable unpacked, no dependencies added.
Tasks 0–2 are needed whichever shell and mechanism win; 3 onwards wait on the pick.

0. **Verify the popup really goes to 800 × 600.** Install unpacked over CDP following the recipe in
   `AGENTS.md`, set `popup.html` to `width: 800px`, trigger the action, and measure. Every wide design
   assumes Chrome's documented cap; nothing should be built on it until it is a measured number. Also
   check Firefox, where the panel sizes itself from content.
1. **`url-tokens.js` + tests.** Move `tokenize`, `tokensIn`, `tokenAt`, `groupRange`, `encodeFor`,
   `spliceRaw` out of `proto-core.js` into the extension next to `url-model.js`, with `node --test`
   cases asserting that tokens concatenate back to `buildUrl(model)` for every URL already covered in
   `url-model.test.js`, plus the malformed-escape and empty-segment cases.
2. **`value-inspect.js` + tests.** `peel` and `badgeFor`, with cases for percent, nested URL, base64,
   base64-of-JSON, JWT, and "none of the above" (a plain value must stay a single layer).
3. **The chosen shell**, replacing `renderPath`/`renderQuery` in `popup.js:143-247` and widening
   `popup.html`. The header URL line and the status bar (`renderChrome`, `popup.js:78-89`) survive
   unchanged, as does `applyDraft` — nothing new may navigate.
4. **The chosen action mechanism** on top of it. If it is G's action bar, that is a single strip bound
   to the current target plus a key map; if it is E's drawer, it is a section→rows panel. Either way it
   reads `draft.js` and writes through the existing edit functions, never through the model directly.
5. **Selection-aware copy**, replacing the per-row ⎘ handler: one path for "copy these characters" and
   one for "copy these parts", honouring the decision from question 4.
6. **`⚡ Clean`** — the one function in these prototypes that does something a person cannot do by
   hand. Ships as a staged edit like any other, so it lands in the change count and Apply still
   navigates. The strip list wants to live in one named constant, not inline.
7. **Reorder in `draft.js`** (only if the direction includes it): `moveSegment`/`moveEntry` plus a
   `moved` status in `rowStatus`, with tests, so the popup does not reach into `draft.work` arrays.
8. **Keyboard map + ARIA pass** for the chosen surface, and a `README` section describing the new
   interaction model. The F3/F10 gaps PR #5 closed must not reopen.
