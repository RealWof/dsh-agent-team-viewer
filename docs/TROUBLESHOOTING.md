# Troubleshooting

Start with the [install guide](INSTALL.md); for development and packaging questions see the
[development guide](DEVELOPMENT.md). Security problems go through
[private vulnerability reporting](../SECURITY.md), never a public issue.

## Install, update, uninstall

| Symptom | Check |
|---|---|
| Plugin row is missing | **Settings → Plugins** lists it. If not, install with the `web` profile for the browser UI or the `desktop` profile for the desktop app: `dsh plugin --profile web add dsh-agent-team-viewer` / `--profile desktop add …`. Restart `dsh web` after installing or updating. |
| Row exists but the details page shows **Retry** or a metadata diagnostic | The bundle did not load. Check the `dsh` logs, remove and reinstall the package, and confirm the package contains `docs/DETAIL*.md` and `docs/preview.svg`. |
| A local `link:` install does not show a rebuilt UI | Rebuild `client.js` with `npm run build` and refresh the page. Restart DSH after changing host code; `files` does not filter a linked checkout. |
| Install prompts for build approval | This package has no `prepare`/`postinstall` script. If a prompt appears, the installed package is not this one; check the source and remove it. |
| `restart-required` or a failed activation after updating | Restart the app, then reinstall. A replaced package needs a fresh process to load the new JavaScript. |
| Version rejected by the host | The declared range is `engines.dsh` `>=0.2.1-rc.5 <0.3.0`. Upgrade DSH or install a plugin version that matches; older hosts lack the Jobs client API. |

To uninstall, use **Settings → Plugins → Agent Team viewer → Remove**, or
`dsh plugin --profile web remove dsh-agent-team-viewer` (desktop: `--profile desktop`). Disabling the
bundle hides the board without removing it; an already loaded page keeps the old bundle until refresh.

## The board

| Symptom | Cause and fix |
|---|---|
| No board button in the session header | The plugin is disabled, the session is not open in the app, or the header slot is not visible in that layout. Open the **Board** tab from the right panel or the start-page card instead. |
| Board is empty | With Team mode off and no retained tasks there is nothing to show; the panel explains how to enable it. With retained tasks, they stay visible while Team mode is off. Team mode is required only for task creation and changes. |
| No money chip | [`dsh-cost-meter`](https://github.com/Han-1413141/dsh-cost-meter) is optional and not installed. The board states that the cost plugin is missing; this is expected. |
| No clock chip or background-process block | The session's DSH build has no `ctx.jobs` client service. The board treats it as a soft dependency and renders without it; open the shipped **Jobs** popover for output and stop controls. Upgrade DSH to get attribution. |
| A settled agent has no chip | The agent owned no background jobs; only owned jobs are counted. Unowned jobs belong to no agent. |
| Totals look different from a single row | The totals row is the whole tree in the agents' order: run time, background time, tokens, agent-hours, API-equivalent cost. Background time is the union of that agent's job intervals, not a sum of rows. |
| Wrong language in the panel | The panel follows the DSH locale; eight are supported (`en`, `zh`, `ru`, `ja`, `es`, `fr`, `de`, `pt`). Switch the app language and refresh. |
| Panel blank after an update | Refresh the page once; if it stays blank, restart the app and verify that `client.js` exists in the installed package. |

## npm and the marketplace

- The npm tarball is runtime-only by design: `src/`, `scripts/`, `dev/` and the development guides are
  not shipped. They live in the repository; `files` is the allowlist.
- README screenshots use repository-relative paths, so they render on GitHub. The npm page does not
  serve `docs/screenshots/` from the tarball; open the repository for the images. The marketplace card
  reads `screenshots.json` from the repository instead.
- If the market card has no images, check that `screenshots.json` is a repository-relative array (or
  the older `{"screenshots": [...]}` shape), at most eight paths, and that every file exists on the
  default branch.

## Diagnostics for an issue

Include the plugin version, DSH and Node versions, OS, install method, profile (`web`/`desktop`), Team
mode state, other plugins (especially themes and [`dsh-cost-meter`](https://github.com/Han-1413141/dsh-cost-meter)), and the relevant console or `dsh`
log lines with secrets removed. Use the bug report template; security issues go to
[the private channel](../SECURITY.md).
