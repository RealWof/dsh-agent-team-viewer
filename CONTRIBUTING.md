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
npm run check          # rebuild, syntax, i18n, smoke and pack-check
npm run build          # client.js only
npm run i18n           # dictionary parity
npm run smoke          # headless board checks
npm run check:commits  # pull request commit messages (origin/main..HEAD)
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

## Branch protection and the pull request flow

`main` is protected on GitHub. Every change — including the maintainer's — lands through a pull
request: CI must be green, the branch must be up to date with `main`, and the only merge method is
**Squash and merge**. Force pushes and deleting `main` are blocked, and the rules also apply to the
administrator. Tags are outside branch protection, so a release can still tag the merge commit.

A pull request is a comparison of your branch with `main` plus a page to discuss and merge it. You can
do the whole flow in the browser; the commands below are the same operations from a terminal.

### The loop

```text
main ──▶ branch ──▶ commits ──▶ push ──▶ pull request ──▶ CI ──▶ squash merge ──▶ main
```

1. **Sync and branch.** Start from an up-to-date `main`:

   ```sh
   git switch main
   git pull --ff-only
   git switch -c fix/board-row-height
   ```

   Prefix the branch with what it does: `feat/`, `fix/`, `docs/`, `test/`, `refactor/`, `ci/`,
   `chore/`. One branch carries one change; never reuse a merged branch.

2. **Commit small and in English.** See [Commit messages](#commit-messages) below. A commit is a
   checkpoint, not a release: one logical step, with the tree still buildable.

3. **Check locally.** `npm run check` must pass before you ask anyone to look at the branch. It
   rebuilds `client.js`, checks syntax, i18n, smoke and packaging. For a large change, open an issue
   first so the direction is agreed before implementation.

4. **Push and open the pull request.**

   ```sh
   git push -u origin fix/board-row-height
   ```

   GitHub prints a **Compare & pull request** link. Otherwise open **Pull requests → New pull
   request**, set base `main` and compare `fix/board-row-height`. Fill in the template: summary, type,
   screenshots for UI work, and the checklist. The **PR title becomes the commit on `main`** after a
   squash merge, so give it the same `type(scope): subject` shape as a commit.

5. **Wait for CI.** The **Checks** tab runs the full matrix (Ubuntu and Windows on Node 20 and 22) and
   the commit-message check. Red? Add a normal commit to the branch — the PR updates automatically.
   Do not force-push a shared branch; `git push --force-with-lease` is acceptable only on your own PR
   branch while you rewrite it. If `main` moved, click **Update branch** (or
   `git pull --rebase origin main` locally) and let CI run again.

6. **Merge.** Click **Squash and merge**, keep the PR title as the commit subject, confirm. GitHub
   deletes the branch. The result on `main` is one linear commit per change. "Create a merge commit"
   and "Rebase and merge" are disabled in the repository settings.

7. **Clean up locally.**

   ```sh
   git switch main
   git pull --ff-only
   git branch -D fix/board-row-height
   ```

   `-D` is expected: a squash merge rewrites your commits, so git no longer sees the branch as
   merged. The remote branch is already gone.

### Commit messages

CI rejects a commit that breaks these rules (`scripts/check-commits.mjs`), and the same script checks
the pull request title, because a squash merge puts the title on `main`:

- **English, ASCII only.** No Cyrillic, no emoji, no localisation in the history.
- **`type(scope): subject`** — for example `fix: keep a running subagent out of idle` or
  `ci: check pull request commit messages`. The scope is optional.
- Allowed types: `feat`, `fix`, `docs`, `test`, `chore`, `ci`, `refactor`, `perf`, `build`, `revert`.
- Imperative mood (`add`, not `added`), at most 72 characters, no trailing period.
- The body is optional and explains **why**, wrapped at 100 characters. Keep it short; the PR has the
  details.
- **Small changes, not one huge feature.** Split the work into reviewable commits; a 40-file commit
  cannot be reviewed or reverted cleanly.

### What the protection enforces

| Rule | Effect |
|---|---|
| Require a pull request | No direct push to `main`, not even by the owner |
| Required checks | The four CI matrix jobs and **Commit messages** must pass |
| Require branch up to date | CI runs against the current `main` |
| Squash only + linear history | One commit per PR, no merge commits |
| Resolve conversations | Unresolved review comments block the merge |
| No force push / no deletion | `main` cannot be rewritten or removed |
| Enforce for administrators | The settings apply to the maintainer too |

### If the merge button is grey

| Symptom | What to do |
|---|---|
| "Checks have not completed" | Wait for the matrix; a failed job has **Details → log**. |
| "This branch is out of date" | Click **Update branch**, then wait for CI again. |
| "Required status check … is expected" | The workflow did not run on the latest push; re-run the job from **Actions**. |
| "Changes must be made through a pull request" | You tried `git push origin main`; push the branch and open a pull request. |
| "Your branch is behind" | `git pull --ff-only` on `main`; never merge `main` into your branch to catch up. |
| Urgent fix while `main` is broken | Fix forward with a pull request. If the repository is unusable, a maintainer can lift the rule temporarily in **Settings → Branches**, then turn it back on. |

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
