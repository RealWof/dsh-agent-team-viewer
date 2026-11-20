# Contributing

Thanks for helping with **dsh-agent-team-viewer**. Bug reports, features, documentation and translations
are all welcome; issues and pull requests in English, Chinese or Russian are fine. By participating you
agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

Before changing code, read [SECURITY.md](SECURITY.md), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and,
for the jobs boundary, [docs/dev/JOBS.md](docs/dev/JOBS.md). For a larger change, open an issue first so
the direction is agreed before implementation.

## Setup

Node.js 20+ and git. There are no runtime dependencies, so there is nothing to install:

```sh
npm run check      # rebuild, syntax, i18n, smoke and pack-check
npm run build      # client.js only
npm run i18n       # dictionary parity
npm run smoke      # headless board checks
```

`npm run check` must stay green. It ends with `check-pack`, which inspects the actual npm file list and
fails if a development path leaks into the tarball.

## Layout

| Path | Purpose |
|---|---|
| `src/client/*.js` | ordered browser fragments; concatenated into `client.js` |
| `client.js` | generated bundle, committed; never edit by hand |
| `index.js` | host plugin entry |
| `cordis.patch.yml` | loader patch |
| `src/client/locales/*.js` | UI dictionaries, eight languages |
| `locale/*.json` | plugin metadata, same eight languages |
| `scripts/` | build, smoke, i18n, pack, icon and release tooling; not shipped |
| `dev/preview/` | standalone HTML mocks, gitignored |
| `docs/` | shipped detail pages plus contributor guides |
| `docs/screenshots/` | published PNGs, not shipped in the npm tarball |

## Rules

### Generated bundle

Edit `src/client/**`, run `npm run build`, and commit the regenerated `client.js`. CI rebuilds it and
fails on any diff, so a stale bundle blocks the pull request.

### Locales

Every user-facing string goes through `t('key')` and exists in all eight dictionaries:
`en`, `zh`, `ru`, `ja`, `es`, `fr`, `de`, `pt`. Add the key to `src/client/locales/*.js` and keep the
metadata in `locale/*.json` consistent. `npm run i18n` fails on a missing key or a changed order.

`docs/DETAIL*.md` is one image line; the detail page's text lives in `locale/<lang>.json` under
`meta.description`. Do not turn it back into a README.

### Read-only boundary

The viewer reads projections and `ctx.jobs`; it never writes to the task board. Do not add task
mutations, a kill switch, terminal output, or a second jobs dashboard. Background jobs are attribution
only, joined by `job.owner === agent.id`. The service is a soft dependency: an absent `ctx.jobs` must
render nothing rather than throw.

### Packaging

`package.json` `files` is a runtime allowlist. `src/`, `scripts/`, `dev/`, `docs/DEVELOPMENT.md`,
`docs/RELEASING.md` and `docs/dev/` stay in git but out of the npm tarball. Run `npm run check:pack`
after touching `files` or adding a runtime asset. The expected count is printed by the check; do not
hard-code it in documentation.

A local `link:` install uses the checkout as-is; the filter applies to packed npm and git installs.

### Screenshots and docs

UI changes need fresh screenshots from the mocks, never from a live workspace. The mocks use invented
data from `dev/preview/fixtures.mjs`; see [docs/dev/PREVIEW.md](docs/dev/PREVIEW.md) and
[docs/dev/SCREENSHOTS.md](docs/dev/SCREENSHOTS.md). Update all three READMEs and, for a new card image,
`screenshots.json` (repository-relative array, maximum eight). Screenshots are published under
`docs/screenshots/` but are not part of the npm package.

User-facing docs live in `README.md`, `README.ru.md` and `README.zh.md`; keep them in step. Avoid local
absolute paths and personal profile names in every committed document.

### Changelog

Add a `CHANGELOG.md` entry for any user-visible change. Follow Keep a Changelog; the release process
expects a `## [x.y.z]` section before `npm run release:publish -- --bump <kind>`.

## Pull requests

1. For a large change, discuss it in an issue first.
2. Branch from `main`, keep the change focused, and write a clear description.
3. Run `npm run check` and fix everything it reports.
4. Fill in the pull request template, including the read-only and packaging checks.
5. Include screenshots for UI changes and the matching CHANGELOG line.
6. Never commit tokens, `.env` files, local profile paths or real workspace data.

## Code style

- Client code is hand-written React with `React.createElement` and CSS variables; there is no JSX
  build step. Follow the existing fragment style.
- Comments explain *why*, not *what*; keep the existing density.
- Keep the read-only guarantee and the eight-locale parity intact.

## Release

Maintainers: see [docs/RELEASING.md](docs/RELEASING.md). The short path is `npm run release` (dry run)
and `npm run release:publish` (publish, commit and tag; it never pushes).

## Licence

By submitting a contribution you agree that it is licensed under the project's [MIT License](LICENSE).
