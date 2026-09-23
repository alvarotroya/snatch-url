# The popup on narrow screens

At 800 wide and above the popup is prototype E unchanged. Below 800 the rules at the end of
`styles.css` take over: the shell is fluid, every control is a 44 px tap target, the row actions
are always visible instead of appearing on hover, and under 600 the bar's tools, the section
cells and the action row stack. The keyboard hints are the one thing hidden there.

`docs/demo/` follows the same cut: on a phone the mock browser is one scrolling page with the
sample switcher on top and the popup in flow under the omnibar.

## Verified

Chromium 153, the popup mounted at an exact viewport width (the demo's stub, no browser bubble),
query drawer open, one value peeled. No horizontal page scroll at any width, no button, cell or
row under 44 px below 800, and the 800 render is byte-identical to the previous stylesheet.

| Width | Capture |
|---|---|
| 360 | [`popup-360.png`](popup-360.png) |
| 412 | [`popup-412.png`](popup-412.png) |
| 768 | [`popup-768.png`](popup-768.png) |
| 800, installed popup | [`chromium-installed-800.png`](chromium-installed-800.png) |
| 360, the demo page | [`demo-360.png`](demo-360.png) |

Firefox 140 ESR, headless: the installed popup still opens at 800 with the narrow rules inactive;
the narrow layout rendered in Gecko with the frame forced to 360
([`firefox-360.png`](firefox-360.png), the window itself will not go under 450).

## Not verified

Firefox for Android, the one real mobile extension host. Its popup opens full-width in a
touch-driven page, which is what the rules target, but no device or emulator was available: the
44 px targets, the page-level scroll and the fixed-position toast are designed for it, not
measured on it.
