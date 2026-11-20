# AGENTS.md — repository rules for AI agents

Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) before changing anything.

## Commands

```sh
npm run check      # rebuild, syntax, i18n, smoke and pack-check
npm run build      # regenerate client.js from src/client/**
npm run i18n       # eight-dictionary parity
npm run smoke      # headless board checks
npm run release    # dry run only; never publishes without --publish
```

## Hard rules

- `client.js` is generated from ordered `src/client/**` fragments. Never edit it by hand; rebuild and
  commit it. CI fails on a stale bundle.
- Every user-facing string goes through `t('key')` and exists in all eight dictionaries: `en`, `zh`,
  `ru`, `ja`, `es`, `fr`, `de`, `pt`. Update `locale/*.json` metadata when needed.
- Text files are LF, committed without a BOM. Do not add local absolute paths, personal profile names
  or real workspace data to any document or fixture.
- Keep the read-only boundary: no task mutations, no kill control, no terminal output, no second jobs
  dashboard. `ctx.jobs` stays a soft dependency; jobs are attributed by `owner` only.
- `docs/DETAIL*.md` is exactly one image line; the text belongs in `meta.description`.
- Screenshots come from the mocks with fictional data, never from a live workspace. Update the three
  README sets and `screenshots.json` (repository-relative array, maximum eight) together.
- `dev/` is gitignored; `docs/dev/` is tracked but excluded from npm. Do not stage `dev/`.

## Packaging

`package.json` `files` is a runtime allowlist. `src/`, `scripts/`, `dev/`, `docs/DEVELOPMENT.md`,
`docs/RELEASING.md` and `docs/dev/` stay in git but out of the npm tarball. Run `npm run check:pack`
after touching `files` or adding a runtime asset; it fails on a leaked development path, a BOM or a
private path.

## Issues and pull requests

- Credit the people whose report, reproduction or suggestion led to a change; link the issue. Do not
  invent contributions.
- Run `npm run check` before proposing a pull request and fill in the pull request template.
- Never write tokens, `.env` values, credentials or private logs into the repository, an issue or a
  command output.

## Release

Publish only on an explicit request. Add the `CHANGELOG.md` section first, then use
`npm run release` (dry run) and `npm run release:publish` (publish, commit and tag; it never pushes),
or push a `v*` tag and let `.github/workflows/release.yml` publish through trusted publishing. Update
the README version badges through the script, not by hand.
