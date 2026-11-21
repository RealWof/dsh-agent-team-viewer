# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-21

### Added

- A dedicated **Agent Team Viewer** page in DSH Settings with browser-local preferences: grouping,
  sorting, motion, panel and dialog zoom, and agent model display. The page ends with an About block
  linking the repository, the README and this changelog.
- **Grouping**
  - Agents group by a repeated name base (the part before the first `-`, trailing digits dropped) or by
    user-defined groups; tasks group by user rules.
  - Group headers fold with a count, long groups cap and scroll, and agents with a unique base collect
    under a localized **Ungrouped** group whenever Roles is on.
  - The Agents and Tasks headers carry the same individual grouping switches as Settings.
- **Sorting**: newest first by default, oldest first or by name, from either section header or Settings;
  tasks follow their first-seen time and agents their creation time.
- Clicking anywhere on an agent row, not only its name or button, opens the agent dialog; hovering a
  card's owner highlights that agent, and the assignee chip opens the owning agent.
- The task dialog gains **Description** and **Report** tabs. Report reads the owning agent's final
  answer, waits briefly for a never-opened agent instead of showing an empty report, and offers a jump
  to that chat.
- A compact line with the agent's model, provider and reasoning effort, with separate part switches;
  it shares the statistics row when it fits and wraps only when needed.
- Safe Markdown in task descriptions and reports: headings, emphasis, lists, code, quotes, links,
  images and autolinks. Bare workspace paths and folders become links too.
- Local links are checked against the workspace before they become clickable; missing files stay plain
  text, and the result is cached for as long as the task dialog is open.
- File references in text appear as attachment chips, and write scopes in the task dialog are links.
- Background wall time keeps a lifetime total after jobs finish, and the background-jobs chip stays on
  the agent row after its jobs settle.
- Agent cards highlight sessions whose last turn failed and show the error on hover.
- **Animations**
  - Cards glide between columns instead of jumping.
  - Changing values — time, tokens, totals, cost — fade and update smoothly.
  - One Motion preference controls both, with a duration slider and reduced-motion support.
- Separate panel zoom and dialog zoom sliders.
- A profile option for the maximum number of agents the board draws, with no limit by default.

### Changed

- The task dialog is two columns now: its agent statistics moved into the header, secondary notes wrap
  below their headings (an empty section's note always does), and its **Open** and **Aside** actions sit
  in the header instead of a footer.
- The agent dialog's **Open** and **Aside** actions moved into its header, and its lists now show tasks
  before background processes.
- Cost figures now explain both the real API spend and the subscription-equivalent value.
- The static open-chat hint in the agents header was removed; the action lives on each agent row.

### Fixed

- Working agents no longer appear idle.
- Folding a group on one board no longer changes another board's folds.
- Observation pruning keeps a task's first-seen order.

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
