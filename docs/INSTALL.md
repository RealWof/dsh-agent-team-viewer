# Install dsh-agent-team-viewer

Three install paths reach the same bundle: a package name, a local directory, or the GitHub repository.
Pick one; the plugin manager stores it in the `web` profile for the browser UI or the `desktop` profile
for the desktop app.

## From the DSH UI (npm name)

1. Open **Settings**.
2. Open **Plugins**.
3. Choose **Add plugin**.
4. Enter the npm name `dsh-agent-team-viewer` and confirm.
5. Find the new row titled **Agent Team viewer** in the plugin list and open it. Its details page shows
   the description and the preview from `docs/DETAIL.md`; a **Retry** line or a metadata diagnostic there
   means the bundle did not load correctly.

## From the DSH UI (local directory)

1. Open **Settings** → **Plugins** → **Add plugin**.
2. Choose the local-directory option and select this checkout — the folder containing `package.json`,
   `cordis.patch.yml` and `client.js`.
3. Confirm, then check the **Agent Team viewer** row as above.

A directory install links the checkout, so a rebuilt `client.js` is picked up after the page is reloaded
(see [Build](#build-the-browser-half) below).

## From the CLI

```sh
# npm name, web UI
dsh plugin --profile web add dsh-agent-team-viewer

# npm name, desktop app
dsh plugin --profile desktop add dsh-agent-team-viewer

# local checkout (pnpm links the directory into the profile)
dsh plugin --profile web add "<path-to-this-checkout>"
dsh plugin --profile desktop add "<path-to-this-checkout>"

# GitHub
dsh plugin --profile web add github:RealWof/dsh-agent-team-viewer
dsh plugin --profile desktop add github:RealWof/dsh-agent-team-viewer
```

`dsh plugin` forwards its arguments to pnpm inside the profile directory, so the usual pnpm forms work:
`add` to install, `remove` to uninstall, `why` to inspect the dependency.

## Open it

The board lives in the right sidebar. With a session open:

- **Header button**: the kanban button immediately left of **Subagents** in the session header opens the
  **Board** tab in the right panel.
- **Start page card**: on the right panel's start page, the **Board** card opens the same tab.
- **Tab**: an already-open **Board** tab switches back to it.

The board reads the Lead session's task board, so open it in a session whose tree you want to inspect.
Team mode is optional for viewing: with it off the board still shows the session's retained tasks and
subagent tree, and explains where to enable it for task changes.

## Verify

- The plugin list shows one row, **Agent Team viewer**, with the kanban icon and the localized
  description for the current language.
- Its details page renders the description plus one preview image and no error line.
- The session header shows the board button left of **Subagents**; clicking it opens a tab titled
  **Board** whose header carries the read-only badge `viewer`.
- With tasks on the board, the four columns and the agent groups appear; a card opens the task dialog and
  a row's gauge opens the agent dialog.
- With no [`dsh-cost-meter`](https://github.com/Han-1413141/dsh-cost-meter) installed, the money chip is absent and the board states that the cost plugin
  is not installed. This is expected, not a fault.

## Build the browser half

Only needed after changing `src/client/**`:

```sh
node scripts/build-client.js
node --check client.js
node scripts/smoke.mjs
```

## Uninstall

- **UI**: **Settings** → **Plugins**, open the **Agent Team viewer** row and remove the bundle.
- **CLI**: `dsh plugin --profile web remove dsh-agent-team-viewer` (web UI) or
  `dsh plugin --profile desktop remove dsh-agent-team-viewer` (desktop app).

To keep the package but hide the board, disable it in **Settings** → **Plugins** instead. The browser
bundle already loaded into an open window stays until that page is reloaded; removing the package does
not touch the task board itself, because this plugin never wrote to it.

## If something does not work

See the [troubleshooting guide](https://github.com/RealWof/dsh-agent-team-viewer/blob/main/docs/TROUBLESHOOTING.md)
for install errors, empty boards, Team mode, missing background chips and npm/marketplace issues.

## Development

See the [development guide](https://github.com/RealWof/dsh-agent-team-viewer/blob/main/docs/DEVELOPMENT.md)
for the fragment pipeline, mock screenshots, packaging and release steps. The detail pages
(`docs/DETAIL*.md` and `docs/preview.svg`) ship with the plugin; the other guides under `docs/` are for
contributors.
