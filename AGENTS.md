# AGENTS.md — repository rules for AI agents

Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) before changing anything.

## Commands

```sh
npm run check      # rebuild, syntax, i18n, smoke and pack-check
npm run build      # regenerate client.js from src/client/**
npm run i18n       # eight-dictionary parity
npm run smoke      # headless board checks
npm run check:commits  # PR commit messages (origin/main..HEAD)
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

## Git workflow

`main` is protected. Never commit to `main` and never push to it — every change, including a one-line
docs fix, goes through a branch and a pull request.

- Branch from an up-to-date `main`:
  `git switch main && git pull --ff-only && git switch -c agent/<slug>`. Use `agent/` for work you
  open on the user's behalf; `feat/`, `fix/`, `docs/`, `ci/` and `chore/` belong to the user.
- Run `npm run check` before the first push. Do not claim CI is green without a real run.
- Commit in English: `type(scope): subject`, imperative, at most 72 characters, no trailing period.
  Allowed types: `feat`, `fix`, `docs`, `test`, `chore`, `ci`, `refactor`, `perf`, `build`, `revert`.
  One logical change per commit; split a large feature instead of landing one huge commit. CI enforces
  the messages (`scripts/check-commits.mjs`), and the PR title — which becomes the squash commit —
  must follow the same rules.
- Open a pull request against `main`; describe what changed, why and how it was verified, and link the
  issue. Fill in the pull request template.
- Wait for every required check. Fix by adding commits to the same branch. Rebase or
  `--force-with-lease` only on your own open PR branch, never on `main`.
- Merge with **Squash and merge** only after CI is green, unless the user asked to review the pull
  request first. Delete the branch afterwards. Never disable branch protection, use an admin bypass,
  push a tag or publish a release without an explicit request.
- Leave unrelated working-tree changes untouched: if the tree already contains someone else's WIP,
  commit only the files of your task and never `git add -A` over it.

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
or push a `v*` tag and let `.github/workflows/release.yml` publish through trusted publishing. With
protected `main`, prepare the release on a `release/x.y.z` branch, merge it through a pull request,
then tag the merge commit; never push the release commit to `main` directly. Update the README version
badges through the script, not by hand.
