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

### Fixed

- The agents section filed working subagents under **idle**. `running` was read from the sessions-list
  summary, but a row the client synthesizes from a parent's `subagentCatalog` carries only an
  already-open session's run state — or `false` — and never the Host's current answer, so a busy agent
  looked stopped. The board now reads the live `useSessionStatus` map first, exactly as the shipped
  Subagents menu does, and falls back to the list summary only when the host supplies no status; the
  agent's run timer and the running-group order follow the same truth.

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
