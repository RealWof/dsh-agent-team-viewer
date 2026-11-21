# Release guide

Everything from a local folder to a card in the DSH community plugin market. Commands are PowerShell
(Windows); the GitHub and npm steps are the same everywhere.

Repository: `https://github.com/RealWof/dsh-agent-team-viewer` · Package: `dsh-agent-team-viewer`
Market catalog: `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`

---

## 0. Prerequisites

- Node.js 20+ (`node --version`; CI uses 22), `git`, an npm account, the GitHub account **RealWof**.
- A checkout of the repository; the commands below assume you are in it.
- Nothing in the package needs a build step at install time: `client.js` is committed, there is no
  `postinstall`, and no native dependency. Keep it that way — the market blocks build scripts by
  default and a `github:` install runs `prepare` before you can approve anything.

## What ships in the npm tarball

`package.json` `files` is a runtime allowlist. The tarball contains `index.js`, `client.js`,
`cordis.patch.yml`, locales, the detail pages and preview, icons, `screenshots.json`, the three
READMEs, `CHANGELOG.md`, `LICENSE`, and the user-facing `docs/INSTALL.md`. It excludes `src/`,
`scripts/`, `dev/`, `docs/DEVELOPMENT.md`, `docs/RELEASING.md` and `docs/dev/`. A local `link:` install
uses the checkout as-is and is the one case where `files` does not filter.

`npm run check:pack` prints the exact packed list and fails if a development path leaks.

## Version branches

Every release target lives on one branch, `release/x.y.z`, cut from an up-to-date `main`. Fixes and
features for that version accumulate there as separate commits, so `main` stays at the last published
version and a half-finished batch never reaches an installer.

```powershell
git switch main
git pull --ff-only
git switch -c release/0.1.1
# one commit per fix or feature; npm run check after each change
```

Nothing is pushed until the maintainer confirms. On that confirmation the branch receives its release
commit:

1. `CHANGELOG.md`: rename `## [Unreleased]` to `## [x.y.z] - <YYYY-MM-DD>`.
2. `npm run set-version -- x.y.z` — sets `package.json` and the `version-x.y.z-` badge in the three
   READMEs without tagging or publishing.
3. `npm run check`, commit `chore(release): x.y.z`, push the branch.
4. Open the pull request against `main`, wait for CI, merge with **Squash and merge**.

Publishing is a separate, explicit act: tag the merged commit `vX.Y.Z` and push the tag for
`.github/workflows/release.yml` (trusted publishing), or run the documented `npm run release:publish`
path. A merged pull request never publishes anything.

## 1. Verify before publishing

```powershell
cd <path-to-checkout>
npm run check          # rebuild, syntax, i18n, smoke and pack-check
```

Expected: `i18n ok: 102 keys × 8 locales …`, `smoke ok: …`, then `pack ok: …` with no
`src/`, `scripts/`, `dev/` or dev-doc entries.

Also confirm that `package.json` has: `name`, `version`, `license`, `repository.url` pointing at the
final GitHub URL, `engines.dsh`, `publishConfig.access: public`, and `dsh.bundle.patch`.

## 2. Create the repository on GitHub

1. <https://github.com/new> → **Repository name**: `dsh-agent-team-viewer`; **Public**.
2. Do **not** initialise with README, `.gitignore` or a licence — the folder already has them.
3. After creation: **About** → *Description*:
   `Read-only kanban view of the DSH Agent Team board with per-agent cost, tokens and agent-hours.`
   **Topics**: `dsh-plugin` `deepseek-harness` `agent-teams` `kanban` `subagents` `observability`.
   Topics are a listing gate in the catalog and the `dsh-plugin` one is required.
4. The repository must be at least **one day old** before the catalog PR is accepted (see step 7).

## 3. Push the code

```powershell
cd <path-to-checkout>
git init -b main
git add -A
git commit -m "feat: read-only Agent Team board viewer for DSH"
git remote add origin https://github.com/RealWof/dsh-agent-team-viewer.git
git push -u origin main
```

Check on GitHub that `client.js`, `docs/screenshots/*.png`, `assets/icon-180.png`, `LICENSE` and the
three READMEs arrived, and that the **CI** workflow starts green (`.github/workflows/ci.yml`).
The CI badge in the README starts resolving only after the first run.

## 4. Publish to npm (recommended, not required)

The catalog can install from GitHub alone; npm gives you a versioned, provenance-signed artifact.

```powershell
npm login                     # once per machine
npm whoami                    # confirm the account

npm run release               # dry run: checks and pack preview, no publish
npm run release:publish       # publish current version, commit and tag
# or bump first:
npm run release:publish -- --bump patch
```

`npm run release` never publishes or commits. `release:publish` runs `npm publish` (which triggers
`prepublishOnly` → `npm run check`), then commits the release files and creates `vX.Y.Z`; it never
pushes. Add the `CHANGELOG.md` section for the new version **before** `--bump`; the script stops if the
section is missing.

With protected `main`, the release commit goes through a pull request: prepare it on a
`release/x.y.z` branch and merge it, then tag the merge commit. The tag route below is the supported
one; `release:publish` publishes from `main` and commits locally, which is only usable when a
maintainer temporarily lifts protection.

```powershell
npm view dsh-agent-team-viewer version dist.tarball repository.url
```

The `repository.url` printed by npm **must** equal the GitHub URL: that is how the catalog links the
npm package to the repository (`npm:` may not be written by hand in the catalog entry).

Smoke-test the real install in throwaway profiles (web UI and desktop app):

```powershell
dsh plugin --profile web add dsh-agent-team-viewer
dsh plugin --profile desktop add dsh-agent-team-viewer
dsh plugin --profile web add github:RealWof/dsh-agent-team-viewer    # the GitHub route
```

In the app: **Settings → Plugins** shows a `dsh-agent-team-viewer` row with its icon; open a session
(Team mode on or off — retained tasks are visible either way), click the board button in the header,
and check the panel renders.

## Trusted publishing (GitHub Actions)

The package is set up for trusted publishing; `.github/workflows/release.yml` runs on `v*` tags and
publishes with OIDC, without a token or OTP. One-time npm configuration: package **Settings → Trusted
Publisher → GitHub Actions** with owner `RealWof`, repository `dsh-agent-team-viewer`, workflow
filename `release.yml`, and **`npm publish` allowed** (not only staged publishing).

Requirements: npm CLI 11.5.1+, Node 22.14+, GitHub-hosted runner. The workflow uses Node 24. If the
workflow gets a 403/OIDC error, check the workflow filename and the allowed action in the npm setting.

Future release flow:

1. On a `release/x.y.z` branch, add the `## [x.y.z]` CHANGELOG section, then run
   `npm run set-version -- x.y.z` to stamp `package.json` and the three README badges.
2. Open a pull request, let CI pass, and merge with **Squash and merge**.
3. On an up-to-date `main`, tag the merge commit and push the tag:
   ```sh
   git tag -a vX.Y.Z -m vX.Y.Z
   git push origin vX.Y.Z
   ```
4. The Release workflow verifies that the tag matches `package.json`, rebuilds and publishes.

The manual `npm run release:publish` path remains for a local release or an emergency. Do not publish
the same version through both paths.

## 5. Merge the release pull request, then tag it

`main` is protected, so the release reaches it like any other change: prepare `CHANGELOG.md`, the
version bump and the README badges on a `release/x.y.z` branch, open a pull request, let CI pass, and
merge with **Squash and merge**. Then tag the merge commit on an up-to-date `main`:

```powershell
git switch main
git pull --ff-only
git tag -a vX.Y.Z -m vX.Y.Z
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md
```

Pushing the tag is allowed by branch protection; pushing `main` is not. If you publish manually, create
the same annotated tag after `npm publish`, from the merged release commit.

Attach nothing to the release: the market accepts either npm or the repository, and a hand-made
tarball would need to be rebuilt on every version.

## 6. Screenshots and page

- Screenshots already live in `docs/screenshots/` and are listed in `screenshots.json`, which is what
  the market card shows, in that order. It is a repository-relative array with a marketplace cap of
  eight images, and `npm run check` validates the count and every path. The workflow is documented in
  [the mock guide](dev/PREVIEW.md) and [the screenshot set](dev/SCREENSHOTS.md).
- Regenerate them after any UI change:

```powershell
node dev/preview/build-mock.mjs     # rebuilds the mock pages from the real CSS and dictionaries
node scripts/capture.mjs            # headless Chrome/Edge → docs/screenshots/*.png
```

- The mock under `dev/` is gitignored and never ships; the guides in `docs/dev/` are tracked in the
  repository but excluded from the npm tarball. The screenshots use fictional data only — no real
  workspace, session, path or account.
- Optional: publish a format-1 `docs/index.json` on GitHub Pages (branch `main`, folder `/docs`,
  add `.nojekyll`) and add it under **Plugins → Discover → Index sources**. This covers hosts without
  the market app. Not needed for the market card itself.

## 7. Submit to the community market

1. Fork <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>.
2. Add **one** file `data/plugins/RealWof__dsh-agent-team-viewer.yml` — the ready content is in this
   repository at `.github/market-entry.yml`:

```yaml
url: https://github.com/RealWof/dsh-agent-team-viewer
name: RealWof/dsh-agent-team-viewer
category: ui
description:
  en: Read-only kanban view of the Agent Team board, with the subagent tree grouped by status and per-agent tokens, agent-hours and API-equivalent cost.
  zh: 只读的 Agent Team 看板视图，按状态分组显示子代理树，并提供每个代理的 Token、代理工时与 API 等值费用。
icon: https://raw.githubusercontent.com/RealWof/dsh-agent-team-viewer/main/assets/icon-180.png
```

3. Hard rules: `url` must match the repository exactly; do **not** add an `npm:` key (the catalog
   crawls it); at most 3 entries per PR; the repository must declare `dsh.bundle` (this one does) and
   be older than a day; the description must be factual — overstating is what gets a submission sent
   back.
4. Open the PR against `main`. CI runs `awesome-lint` and a site build; a maintainer then reads the
   code against the description.
5. After merge, the nightly build refreshes the catalog. Verify:

```powershell
curl https://awesome-dsh-plugin.com/plugins.json | Select-String "dsh-agent-team-viewer"
```

and open `https://awesome-dsh-plugin.com/p/RealWof/dsh-agent-team-viewer/`.

6. In the app: **Plugins → Plugin Market**, search `agent team viewer` → the card shows the icon, the
   screenshots, the category and "Requires DSH …" from `engines.dsh`; installing must proceed without
   a build-approval prompt.

## 8. After the release

- Follow the Keep-a-Changelog discipline: add the `## [x.y.z]` section first, then run
  `npm run release:publish -- --bump patch`; the script bumps the version, publishes and tags. Push the
  tag and create the GitHub release. The catalog periodically refreshes version and download counts.
- Keep the README's `description` consistent with what ships — stale or overstated entries get
  removed.
- When the UI changes, re-run `node dev/preview/build-mock.mjs` and `node scripts/capture.mjs`, since
  the mock mirrors the components by hand.
- Watch the store: the market tells you about install failures (`restart-required`, `failed`), and a
  package without its declared entry artifact is removed by the installer's validation.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Release workflow gets 403/OIDC errors | The trusted publisher must name this repository, the workflow filename `release.yml`, and allow **`npm publish`**. The pushed tag must equal `v` + `package.json` version. |
| Install rejected: *"Cannot validate installed package … is not valid JSON"* | a UTF-8 **BOM** at the start of `package.json`; rewrite it without BOM |
| Market says the plugin is not in the curated registry | the entry is not merged yet, or `url` differs from the real repository URL |
| `dsh plugin add` installs but nothing appears | the bundle has no `dsh.bundle.patch` row, or the client artifact id ≠ package name |
| Build-approval prompt on install | a `prepare`/`postinstall` script ran; remove it and ship the built `client.js` |
| PR held by a maintainer | the description does not match the code; fix the claim, push to the same branch, comment once |
| Screenshots missing from the card | `screenshots.json` paths are wrong, or the files are not committed on the default branch |
| Card shows no icon | the catalog refuses SVG: use the raster `assets/icon-180.png` |
