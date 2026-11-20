# Development

Everything needed to change the board, its locales and its screenshots. The plugin has no runtime
dependencies; the browser half is generated from ordered fragments and committed as `client.js`.

## Requirements

- Node.js 20+ (CI uses 22)
- git
- A checkout of this repository

## Quick start

```sh
npm run check      # rebuild, syntax, i18n, smoke and pack-check
npm run build      # rebuild client.js only
npm run i18n       # dictionary parity
npm run smoke      # headless board checks
```

`npm run check` ends with the pack check: it prints the exact npm file list and fails if a development
file leaked into the tarball.

## Layout

| Path | Purpose |
|---|---|
| `src/client/*.js` | ordered browser fragments; `scripts/build-client.js` concatenates them into `client.js` |
| `client.js` | generated bundle, committed; never edit by hand |
| `index.js` | host plugin entry |
| `cordis.patch.yml` | loader patch |
| `locale/*.json` | plugin metadata in eight languages |
| `src/client/locales/*.js` | UI dictionaries in the same eight languages |
| `scripts/` | build, smoke, i18n, pack, icon and release tooling; not shipped |
| `dev/preview/` | standalone HTML mocks (gitignored) |
| `docs/` | shipped detail pages and the development guides |
| `docs/screenshots/` | published PNGs, not shipped in the npm tarball |

The fragment order is the filename order, so a new fragment must be named to sort where it belongs.
After editing any fragment, run `npm run build` and commit the regenerated `client.js`.

## Locales

The client dictionary is `src/client/locales/<lang>.js` and the plugin metadata is
`locale/<lang>.json`; both must carry every key in all eight languages:
`en`, `zh`, `ru`, `ja`, `es`, `fr`, `de`, `pt`. Add a string with `t('key')` and update all eight
dictionaries; `npm run i18n` fails on a missing key or a changed order.

`docs/DETAIL*.md` is intentionally one image line. The detail page's text lives in
`locale/<lang>.json` under `meta.description`.

## Browser half and read-only boundary

The viewer reads projections and `ctx.jobs`; it never claims, completes, reassigns or deletes a task,
and it never exposes a kill switch or terminal output. Background jobs are attributed by
`job.owner === agent.id` and are visualised only. Read
[background processes](dev/JOBS.md) before changing that part.

## Screenshots

The README and marketplace images come from the standalone mocks; no live workspace, session or
account is photographed. See [the mock guide](dev/PREVIEW.md) and
[the screenshot set](dev/SCREENSHOTS.md).

```sh
node dev/preview/build-mock.mjs
node dev/preview/check-mock.mjs
node scripts/capture.mjs
```

## What ships

`package.json` `files` is an allowlist. The npm tarball contains the runtime (`index.js`, `client.js`,
`cordis.patch.yml`, locales, detail pages, the preview, icons, `screenshots.json`, READMEs, changelog
and licence) plus the user-facing [install guide](INSTALL.md).

It does **not** contain `src/`, `scripts/`, `dev/`, `docs/DEVELOPMENT.md`, `docs/RELEASING.md` or
`docs/dev/`. `npm run check:pack` asserts the exact list and rejects a leaked development path. Packed
npm and git installs use the file list; a local `link:` install uses the checkout as-is, so a developer
linking the folder sees everything.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the contribution rules and
[SECURITY.md](../SECURITY.md) for private vulnerability reporting. Keep the read-only boundary and the
eight-locale parity intact.

## Release

See [releasing](RELEASING.md). The short version:

```sh
npm run release            # dry run: checks and pack preview
npm run release:publish    # publish the current version, commit and tag
```
