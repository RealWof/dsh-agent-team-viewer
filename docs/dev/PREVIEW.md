# Screenshot mocks

[Back to development](../DEVELOPMENT.md)

The board is a **live projection**. It has no fixture mode: it reads the
session's `agentTeam` projection, walks the real subagent tree and, when the
cost plugin is installed, sums real spend. Pointing a camera at it would expose
somebody's workspace, session ids, paths and account.

So the README screenshots are taken from a **standalone HTML mock** instead: the
same stylesheet, the same markup, the same strings — on invented data. The mocks
live under `dev/`, which is gitignored, so they never reach the package. This
guide is tracked in the repository but excluded from the npm tarball; only the
PNGs under `docs/screenshots/` are published, and they are regenerated from the
mock.

## Privacy rule

> Screenshots contain **fictional data only**: never a real workspace, session,
> path or account.

Every string and number a mock renders comes from `dev/preview/fixtures.mjs`.
The project there (`atlas-console`), the write scopes (`src/board/…`), the
session ids (fixed UUIDs) and the tokens/cost/hours are all invented. Do not
paste real board data into the fixtures, and do not screenshot the live app for
the README.

## What is generated

| File | Content |
| --- | --- |
| `board-<lang>-<theme>.html` | the docked panel: header, agents section (three status groups + totals), task board (four columns), footer |
| `task-<lang>-<theme>.html` | the same board with the task dialog open |
| `agent-<lang>-<theme>.html` | the same board with the agent dialog open |
| `docs/screenshots/*.png` | one localized set per README language: board, panel, task dialog, agent dialog and dark board, with `-zh` and `-ru` variants |

Languages: `en`, `zh`, `ru`, `ja`. Themes: `light`, `dark` (24 HTML files).

Each language README embeds its own localized screenshots; the marketplace card
(`screenshots.json`) keeps a seven-image cross-language set instead: the English
board, panel and dialogs, the dark board, and one localized board per README
language.

Add `?view=panel` to any page to drop the fake window and render the panel
alone — that is what the `panel-*.png` shots use.

## Regenerate the mocks

```powershell
node dev/preview/build-mock.mjs                 # writes dev/preview/out/
node dev/preview/build-mock.mjs --only board    # one page kind
node dev/preview/check-mock.mjs                 # asserts classes, strings, sizes
```

Nothing in the mock is a copy typed by hand. `build-mock.mjs` reads, at build
time:

- **the stylesheet** from `src/client/20-ui.js` (the `const CSS` template
  literal) — the mock cannot drift from the plugin's CSS;
- **the glyph geometry** from `src/client/07-icons.js` (`ICON_GLYPHS`);
- **the number formatters** from `src/client/20-ui.js` (`formatTokens`,
  `formatSpan`, `formatMoney`, `formatHours`, `formatStamp`, `plural`, …), so
  `1.4M`, `1 ч 19 мин` and `$3.06` are produced by the board's own code;
- **every visible string** from `src/client/locales/<lang>.js`, substituted for
  the same `t('key')` names the components use. A missing key fails the build;
- **the `--dsw-*` theme tokens** from `dev/preview/theme-tokens.mjs`.

The markup in `build-mock.mjs` mirrors `40-board.js`, `45-inspector.js` and
`47-agent.js` class for class. Two deliberate differences, both because static
HTML is parsed once and React is not:

1. The owner control inside a card is a `<span class="tk-owner-link"
   role="button">` — the live component nests a `<button>` inside the card's
   `<button>`, and the HTML parser would close the card at it. Same class, same
   look.
2. The dialogs are placed at the end of `.tk-root` instead of being portalled to
   `document.body`; the page frames the window with `contain: paint` so the
   fixed backdrop covers the window, exactly as the modal covers the app.

## Theme tokens

`dev/preview/theme-tokens.mjs` is generated, not edited. It holds the real
values of the light and dark token sets:

```powershell
node dev/preview/generate-theme-tokens.mjs          # rewrite the module
node dev/preview/generate-theme-tokens.mjs --check  # fail if stale
```

It reads two theme sheets out of the installed application
(`resources/app.asar`, `@deepseek-ai/dsh-client-ui-theme/.../design-platform.css`
and `.../base.css`), resolves every `var(--dsw-static-*)` chain, and freezes the
result. Each generated page then declares both sets — `:root` and
`body[data-ds-dark-theme]` — so the board's own `var(--dsw-alias-*)` references
resolve without the application shell, which is how the product themes itself.
`mock.css` carries no colour of its own; it only uses those variables.

If the application is not installed where the script expects, pass its archive:

```powershell
node dev/preview/generate-theme-tokens.mjs --asar "<install-dir>\resources\app.asar"
```

## What the mock does not show

- **Fold state.** The board has foldable sections (`tk-fold`) and status groups
  (`tk-col-fold`); the mocks always render them expanded, so the `tk-more`
  "show all" control (which appears past `VISIBLE_LIMIT` items in a group) never
  shows. The fixtures never hold a pile that big.
- **The natural column count.** The mock pins `data-cols` to the four-column and
  three-group layouts and widens the docked panel to 620px, the plugin's own
  `COLUMNS_WIDE` breakpoint. A real sidebar is 380px by default, which the live
  board renders as two columns — `mock.css` keeps that 420px framing default,
  and a page may override `--mock-panel-width` (the generated ones do).
- **Live changes.** Cards, dialogs and strings update in the app; a mock is a
  snapshot. When a component's markup changes, the hand-mirrored functions in
  `build-mock.mjs` must be updated — the stylesheet, formatters and strings
  follow on their own.

## Capture

```powershell
node scripts/capture.mjs                       # headless Chrome/Edge found on this machine
node scripts/capture.mjs --base http://127.0.0.1:9222
node scripts/capture.mjs --electron "<install-dir>\DeepSeek Harness.exe"
node scripts/capture.mjs --detect              # which browser would be used
node scripts/capture.mjs --only board-dark     # one shot
node scripts/capture.mjs --help
```

- **default** — launches `--headless=new` Chrome or Edge from the standard
  install locations with a throwaway profile, drives CDP on port 9333 and cleans
  up afterwards.
- **`--base <url>`** — attaches to an endpoint that already exists: a browser
  started with `--remote-debugging-port`, or the application started that way.
  It screenshots the page it finds and leaves the process running.
- **`--electron <exe>`** — starts the application itself with
  `--remote-debugging-port=<port>`, attaches, screenshots, then closes it.
- **`--browser <exe>`** — use a specific browser binary.

With no browser and no endpoint the script prints what to install and exits 0,
so it is safe to run in CI; the mock pages can always be opened by hand.

The script needs no dependencies: CDP speaks WebSocket, and the minimal RFC 6455
client (handshake, masked frames, fragmented replies) lives at the bottom of the
file. Screenshot sizes are part of the contract:

| Files | Size |
| --- | --- |
| `board-{light,zh,ru,dark,dark-zh,dark-ru}.png` | 1680 × 1050 |
| `panel-{light,zh,ru}.png` | 1080 × 600 (panel only) |
| `task-dialog{,-zh,-ru}.png` | 1280 × 860 |
| `agent-dialog{,-zh,-ru}.png` | 1280 × 900 |

## Files

```
dev/preview/
  build-mock.mjs            generates dev/preview/out/*.html
  check-mock.mjs            verifies the generated pages
  fixtures.mjs              the invented agents, tasks and numbers
  mock.css                  page framing: stage, window chrome, panel width
  mock-window.mjs           the fake application window around the panel
  theme-tokens.mjs          GENERATED --dsw-* values (light + dark)
  generate-theme-tokens.mjs regenerates theme-tokens.mjs from app.asar
  agent-labels.mjs          the shipped subagent activity/mode words
  out/                      generated pages (gitignored with dev/)
docs/DEVELOPMENT.md         development index
docs/dev/
  PREVIEW.md                this guide
  JOBS.md                   background-process attribution: API contract and boundary
  SCREENSHOTS.md            screenshot set and capture notes
docs/INSTALL.md             install and verification guide
docs/RELEASING.md           release checklist
scripts/
  capture.mjs               CDP screenshots into docs/screenshots/
```
