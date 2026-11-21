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
npm run set-version -- x.y.z  # package.json + README badges, no tag, no publish
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

`main` is protected and stays at the last released version. Never commit to `main` and never push to it:
every change reaches `main` through a pull request.

### Version branches

Each release target lives on one branch, `release/x.y.z`, cut from an up-to-date `main`:

```sh
git switch main && git pull --ff-only && git switch -c release/0.1.1
```

- A request such as "fix version 0.1.0" or "prepare 0.2.0" with a list of bugs and features means: open
  the branch for the target version, or continue the open one, and commit each item there as its own
  logical commit. A bug-fix batch targets the next patch (`0.1.0` → `0.1.1`); new capabilities may target
  a minor (`0.2.0`). The user may name the version; when the target is not explicit, state the chosen
  one in the branch name.
- Do not change the version in `package.json`, the README badges or the versioned `CHANGELOG.md` heading
  in those commits; collect the entries under `## [Unreleased]`.
- Commit in English: `type(scope): subject`, imperative, at most 72 characters, no trailing period.
  Allowed types: `feat`, `fix`, `docs`, `test`, `chore`, `ci`, `refactor`, `perf`, `build`, `revert`.
  One logical change per commit. CI enforces the messages (`scripts/check-commits.mjs`), and the pull
  request title — which becomes the squash commit — follows the same rules.
- Run `npm run check`; rebuild and commit `client.js` in every commit that touches `src/client/**`.
- Do not push the version branch or open a pull request until the user confirms. A merge never publishes
  a version.
- A second version target while one branch is still open needs an explicit decision: release the open
  version first, or base the new branch on it. If the target changes before the release, rename the
  branch (`release/0.2.0`).

### Release pull request

On the user's push confirmation, finish the same branch:

1. Rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD` in `CHANGELOG.md`.
2. `npm run set-version -- x.y.z` — sets `package.json` and the `version-x.y.z-` badge in the three
   READMEs without tagging or publishing.
3. `npm run check`, then commit `chore(release): x.y.z`.
4. Push the branch and open the pull request against `main`, filling the template and linking the issue.
   Wait for every required check; fix by adding commits to the same branch. Merge with
   **Squash and merge** only after CI is green, unless the user asked to review first. Delete the branch
   afterwards.
5. Publishing is a separate request: only then tag the merged commit `vX.Y.Z` and push the tag for
   `.github/workflows/release.yml`, or run the documented `npm run release:publish` path.

- Rebase or `--force-with-lease` only on your own open branch, never on `main`.
- Never disable branch protection, use an admin bypass, push a tag or publish a release without the
  explicit request.
- Work outside a version target (tooling, CI, docs) still uses its own branch and pull request; name it
  `agent/<slug>` unless the user names one.
- Leave unrelated working-tree changes untouched: commit only the files of your task and never
  `git add -A` over someone else's WIP.

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
