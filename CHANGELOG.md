# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `agentsLimit` — how many subagents the board walks and draws — is now the profile row's Config field:
  the default is `-1` (no limit), because a session appends every new agent to the end of its catalog and
  a cap therefore hides the newest, busiest agents; a positive number is available for a profile that must
  bound a huge tree. The field is volatile, so the browser half reads the live value from the settings
  document, the Plugins page offers it as a form, and the profile patch still sets it
  (`config: { agentsLimit: 128 }`). Without the settings surface the built-in default stands.
- A **Settings → Agent Team Viewer** page holds browser-local view preferences: automatic role
  grouping, custom agent groups, custom task groups, the task/agent sort, card animation and its
  duration, board zoom and dialog zoom. Nothing in this page reaches the Host settings document.
- The agent strip groups itself by derived role, and both the strip and every task column can group by
  the custom rules from Settings. A group has a foldable header, a count, a cap for long piles and its
  own scroll box; the Lead stays pinned above its group, and unmatched rows follow flat.
- Both section headers and the Settings page carry the sort control (newest first by default, oldest
  first or by name). Tasks are ordered by their first-seen stamp and agents by their creation time.
- The task dialog and the agent dialog are opened by the whole card/row surface: a task card opens the
  task dialog, an agent row opens the agent dialog with Enter or Space as well as a click, while the
  agent name and the jump control keep their own actions.
- Write scopes in the task dialog are links: a file opens the shipped workspace file viewer and a scope
  with a trailing slash opens the Files page.
- An expanded status group scrolls inside its own column (`.tk-col-items`) instead of growing the panel,
  and the show-more/show-less control stays below the scroll box.
- The background-jobs chip stays on an agent row after its jobs settle, counts the page's seen jobs and
  closes the metric line; its tooltip carries the longest live run and the remembered wall time.
- Every cost figure explains itself: the agent row, the totals chip and the agent dialog name both the
  API spend and the plan-inclusive equivalent of the same tokens, including the subscription case.
- The task dialog has **Description** and **Report** tabs. Report reads the owning agent's final answer
  from its chat, shows loading and empty states, and offers a jump to that chat; the read waits briefly
  for a never-opened agent's first snapshot and always releases the retained session.
- Background wall time is persisted in `localStorage` as merged intervals and unioned with the live
  roster, so the lifetime figure survives the Host dropping settled jobs with their owner session.
- A moved card glides between logical columns with a FLIP pass; a layout shift inside the same column no
  longer animates, and the animation switch, its duration and reduced motion are honored.
- Board zoom (the whole panel) and dialog zoom (`.tk-insp`) are separate preferences.
- Hovering a task card's owner highlights that agent's row in the strip, so "who works on this" and
  "that row" read as one thing.
- The task description and the agent report render a safe Markdown subset — headings, bold, italic,
  inline and fenced code, lists, quotes, rules, links, images and autolinks — as React nodes. Raw HTML is
  shown as text, and only `http(s):`, `mailto:` and workspace paths become active; `javascript:`,
  `data:` and other schemes stay flat. Workspace file references in the text become attachment-style
  chips, because a task record carries no attachment field of its own.
- Bare workspace paths in a description or report (`docs/stats.md`, `src/a.js:12`) are links now,
  rendered as the same `.tk-file-link` button as a Markdown file link. A trailing `:line` stays in the
  label while the click opens the file, trailing sentence punctuation stays outside the link, and a
  path inside code ticks, a URL or a version string stays plain text.

### Changed

- The task dialog is two columns on wide screens: the timeline, agent block, dependencies and write
  scopes keep the left column, while the Description/Report tabs and their Markdown sit in a right
  column with its own scroll box (`.tk-insp-prose`). Both columns scroll independently, so a long
  description never pushes the task's statistics below the fold; below 640px the columns stack and the
  dialog body scrolls as before.
- The agents header no longer shows the old static open-chat hint; the action moved into each row and
  its name control.
- The agents strip now derives a role from the agent's name before its preset, so the harness default
  `standard` preset no longer collapses distinct builders and integrators into one meaningless group.

### Fixed

- The agents section filed working subagents under **idle**. `running` was read from the sessions-list
  summary, but a row the client synthesizes from a parent's `subagentCatalog` carries only an
  already-open session's run state — or `false` — and never the Host's current answer, so a busy agent
  looked stopped. The board now reads the live `useSessionStatus` map first, exactly as the shipped
  Subagents menu does, and falls back to the list summary only when the host supplies no status; the
  agent's run timer and the running-group order follow the same truth.
- Fold state is stored per board (root session id) instead of once for every board, so two open boards
  no longer share section or group folds; the old flat shape is dropped once, not applied everywhere.
- The Report tab no longer shows "no report" for a never-opened agent. The retained session's chat opens
  asynchronously, so the dialog now subscribes to the Chat target and waits for the first answer (bounded,
  then falls back to the empty state) and releases the retained reference in every path.
- The observation ledger keeps a task's first-seen stamp when it prunes old records, so the board order
  no longer jumps when the ledger is trimmed.

## [0.1.0] - 2026-11-20

### Added

- Read-only kanban board of the Agent Team task board in the right sidebar, opened from a header
  button next to **Subagents**, the right-panel guide, or its own tab.
- Team mode is optional for viewing: the board keeps showing the session's retained tasks and its
  subagent tree while Team mode is off, with a notice that agents can create or change tasks only when
  it is on. Subagents work either way.
- Four task columns by status (queued, blocked, in progress, done) with the product's own status dots
  and colours, a responsive 4/2/1 column layout, and live updates from the `agentTeam` projection.
- Task dialog: description, task timeline, dependencies, write scopes with overlap warnings, and the
  agent that claimed it.
- Subagent tree grouped by status (in progress, done, idle), including agents that own no task,
  with each agent's tasks, run duration, tokens, agent-hours and API-equivalent cost.
- Background-process attribution, read-only: an agent row carries a clock chip with the number of
  background jobs that agent started (highlighted while at least one is live), and the agent dialog
  lists them with the command, state, elapsed time and the live progress line or the exit reason,
  running first. The row and the dialog also show the wall time those processes occupied next to the
  agent's own run time; the process list and the task list fold away and scroll when they grow. Jobs are
  joined strictly by `job.owner`, so an unowned job belongs to no agent and one session's roster never
  leaks onto another agent. Output and the stop control stay in the shipped **Jobs** popover.
- Agent dialog: the five metrics in detail (run time, background time, tokens, agent-hours and the API
  equivalent), session facts (created, last activity, depth, session id, model, provider, reasoning
  effort, agent preset), the background-process block and the tasks that agent owns.
- Whole-tree totals row in the same order as the agent rows: total run time, background time, tokens,
  agent-hours and API-equivalent cost of every agent of the session.
- Navigation to an agent in the main view or beside the board, from the strip, a card owner, or either
  dialog.
- Eight UI locales: `en`, `ru`, `zh`, `ja`, `es`, `fr`, `de`, `pt`.
- Soft dependencies: [`dsh-cost-meter`](https://github.com/Han-1413141/dsh-cost-meter) for the money figure, and the client `Jobs` service (`ctx.jobs`)
  for the background-process chip and block. The board watches the tree's rosters only while mounted,
  capped at 12 sessions with the Lead and the running agents first. Without either service, the
  affected figures are absent and the rest of the panel is unchanged.
- Headless smoke test (`node scripts/smoke.mjs`) covering registration, board and dialog rendering,
  status colours, navigation, background-process attribution and folding, totals order, and locale-key
  completeness.
