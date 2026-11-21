# Screenshots

[Back to development](../DEVELOPMENT.md) · [Mock guide](PREVIEW.md)

The README and marketplace screenshots come from the standalone HTML mocks in `dev/preview/out/`.
Every page renders fictional data from `dev/preview/fixtures.mjs`: no real workspace, session, path or
account appears in an image.

Generate and capture:

```powershell
node dev/preview/build-mock.mjs   # rebuild the pages from the real CSS and dictionaries
node dev/preview/check-mock.mjs   # assert classes, strings, sizes and the dialog blocks
node scripts/capture.mjs          # headless Chrome/Edge -> docs/screenshots/*.png
```

## The README sets

Each language README embeds a full set in its own language: the board hero, the task dialog, the
narrow panel, the agent dialog and the dark board. The locales section of each README shows another
language on purpose.

| README | Screenshots |
|---|---|
| `README.md` | `board-light`, `panel-light`, `task-dialog`, `agent-dialog`, `board-dark`; locales: `board-zh` |
| `README.zh.md` | `board-zh`, `panel-zh`, `task-dialog-zh`, `agent-dialog-zh`, `board-dark-zh`; locales: `board-light` |
| `README.ru.md` | `board-ru`, `panel-ru`, `task-dialog-ru`, `agent-dialog-ru`, `board-dark-ru`; locales: `board-zh` |

Each README embeds its images as a top-level centered HTML block with a repository-relative path,
GitHub-style. The hero picks the light or dark board via `<picture>`:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/board-dark-ru.png">
  <img src="docs/screenshots/board-ru.png" width="1280" alt="...">
</picture>

<p align="center">
  <img src="docs/screenshots/task-dialog-ru.png" width="640" alt="...">
</p>
```

The relative path is what GitHub resolves against the repository root; `width="640"` keeps the board
readable without taking the whole page. The npm tarball does not include `docs/screenshots`, so the
previews on npm are not guaranteed; the marketplace card uses `screenshots.json` instead.

## The marketplace set

`screenshots.json` is the card on the plugin market: a repository-relative array (the catalog also
accepts the older `{"screenshots": [...]}` shape, but the array is canonical) capped at eight images.
Ours keeps seven, in this order:

1. `board-light.png`
2. `panel-light.png`
3. `task-dialog.png`
4. `agent-dialog.png`
5. `board-dark.png`
6. `board-zh.png`
7. `board-ru.png`

The card includes one localized board per README language; the localized panel and dialog variants
stay in the READMEs. The catalog resolves these paths against the repository at `HEAD` and checks
liveness, so a renamed screenshot must be updated here in the same commit.

## Sizes (part of the contract)

| Files | Size |
|---|---|
| `board-{light,zh,ru,dark,dark-zh,dark-ru}.png` | 1680 × 1050 |
| `panel-{light,zh,ru}.png` | 1080 × 600 (panel only) |
| `task-dialog{,-zh,-ru}.png` | 1280 × 860 |
| `agent-dialog{,-zh,-ru}.png` | 1280 × 900 |

`docs/preview.svg` (the plugin detail page) is a separate illustration, not part of this set.

## Notes

- The agent dialog shows five metric tiles (run time, background time, tokens, agent-hours, API
  equivalent), then the task list and the background-process block, tasks first; each list is its own
  scroll box.
- The mocks always render the block sections expanded; the fold controls and the scroll boxes are in
  the markup, but a short list shows no scrollbar.
- The native column count is breakpoint-driven; the mock pins the four-column layout and widens the
  panel so a screenshot shows the full board. A real sidebar is narrower and shows two columns.
- The mock directory `dev/` is gitignored and never ships; this guide is tracked but excluded from the
  npm tarball. Only the PNGs under `docs/screenshots/` are published.
