# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The agent model line's parts are independently switchable: **Show the provider**, **Show the model
  name** and **Show the reasoning effort** (provider off, the other two on by default) sit under the
  master **Show the agent model** switch. The visible line joins only the enabled parts, the tooltip
  always keeps the full `provider · model · effort` line, and turning off the last part hides the master
  switch and restores all three parts.
- Changing metric values — the agent-row figures, the agent-dialog tiles and the totals chips — fade and
  lift briefly when they update. The new **Animate changing values** Motion preference (on by default)
  turns it off, the existing animation duration sets the speed, and reduced-motion disables it.
- A **Show the provider** view setting (off by default, disabled while **Show the agent model** is
  off) puts the provider at the front of the agent model line. With it on the line reads
  `provider · model · effort`; with it off it reads `model · effort`; the tooltip always carries the
  full line, and an agent whose selection is unknown gets no line.
- A **Show the agent model** view setting (off by default) adds a compact, ellipsized
  `model · effort` line in the bottom-right of each agent row, with the full
  `provider · model · effort` text in its tooltip. An agent
  whose selection is unknown gets no line, and the agent dialog is unchanged.
- The Settings page ends with an **About** block whose localized button links open the repository,
  the README and the CHANGELOG on GitHub in a new tab.
- A status column that already has custom or role groups now files its leftover cards — unmatched
  tasks and singleton roles — under one localized **Ungrouped** group with the same count, per-board
  fold, cap and scroll as any other group. A column with no other group keeps its flat list, so an
  empty group is never drawn.
- The Agents and Tasks section headers now carry a compact **Groups** switch beside the sort control:
  switching a section off flattens it, switching it back on restores exactly the flags that were
  active (automatic roles are the agent fallback), and the Settings page checkboxes follow the same
  store.
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

- The agent dialog's **Open** and **Beside** actions moved from the body footer into the dialog
  header's right corner as compact icon buttons immediately left of the close control, matching the
  task dialog; the Lead keeps its single **Open** action, and the dialog body is facts and lists only.
- The task dialog shows the owning agent's statistics — run time, background time, tokens,
  agent-hours and cost — in the header meta line right after the assignee chip instead of a second
  line in the Agent section. The meta line wraps when the dialog narrows, the figures keep their
  tooltips and stay labelled as the agent session, and each number appears exactly once.
- The task dialog's agent actions (**Open**, **Aside**, **Details**) moved from the agent block's
  footer into the dialog header's right corner as compact icon buttons immediately left of the close
  control, so the agent block keeps only the agent's facts and metrics.
- The Settings page reads like a General settings tab: a calm vertical list inside a 760px column,
  small muted section headings, and one row per preference with its title and a short description on
  the left and the control on the right, separated by hairline rules. Booleans are now switch-style
  controls that still drive the native checkbox, sliders keep their value at the right, the two group
  editors run full width below their row, and no inspector-style cards are drawn.
- The word next to an agent name (`continuable`, `one-shot`, `external`) is the DSH subagent mode,
  not a status: its tooltip now names the mode and explains what the three modes mean, and the Lead
  still carries no mode.
- The Settings nav item now reads exactly **Agent Team Viewer** in every language: the plugin name is
  the one literal that never goes through a dictionary, while the page content and its hints stay
  translated.
- The wide task dialog is tighter: 860px instead of 920px, a fixed 240px metadata column with a
  vertical hairline divider, start alignment so the short metadata column no longer stretches into a
  tall empty box, smaller body padding and column gaps, and a height that follows the taller column
  instead of the stretched grid. Each column keeps its own scroll box, and below 640px the
  single-column layout drops the divider and scrolls as before.
- The task dialog is two columns on wide screens: the timeline, agent block, dependencies and write
  scopes keep the left column, while the Description/Report tabs and their Markdown sit in a right
  column with its own scroll box (`.tk-insp-prose`). Both columns scroll independently, so a long
  description never pushes the task's statistics below the fold; below 640px the columns stack and the
  dialog body scrolls as before.
- The agents header no longer shows the old static open-chat hint; the action moved into each row and
  its name control.
- The agent dialog now lists the agent's tasks before its background processes, and both lists are
  their own keyboard-focusable scroll boxes (`.tk-jobs`, `.tk-list`) with a dedicated height, so a long
  list no longer stretches the dialog. Each section keeps its title and count, and a task row still
  opens the task dialog.
- The agents strip now derives a role from the agent's name before its preset, so the harness default
  `standard` preset no longer collapses distinct builders and integrators into one meaningless group.

### Fixed

- The agent model line no longer always takes a line of its own: it closes the metric row and sits
  beside the statistics when the card is wide, wrapping to a right-aligned line only when the card or
  panel narrows. A model line with no metric still draws its row.
- Local file links — Markdown links, bare paths, attachment chips and write scopes — are checked
  against the workspace before they render as clickable buttons. A path the file API reports missing
  stays plain text with a **File not found** tooltip and never enters the attachment row, a path still
  being checked is plain until the answer arrives, and an install without the file Remote keeps every
  link. The answers are cached for the lifetime of one open task dialog, so each path is asked at most
  once, and reopening the dialog checks again.
- Group headers show the status dot on the outer status columns again — a task column and an agent
  status group repeat their column colour — while a nested role, custom or Ungrouped header stays
  chevron, title and count; task cards and agent rows keep their own dot.
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
