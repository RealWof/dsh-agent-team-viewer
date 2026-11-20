# Background processes on the board

The board shows, per agent, how many background jobs that agent owns and what they are. This note
records why the feature stops at attribution and the client contract it relies on.

## Why attribution only

The shipped **Jobs** popover (`@deepseek-ai/dsh-client-ui-jobs`, header slot
`conversation.session.header.actions`, id `job-list`, order 20) is one flat list **per session**: the
session's own jobs plus every unowned job. Rows render `kind`, `label`, `status`, `detail`/`progress`
and duration — never `owner` — and the Lead's roster does not contain subagent jobs
(`registry.list(request.sessionId)`). In an Agent Team tree you therefore cannot see that, say,
`reviewer` has been running `npm test` for eight minutes, which also explains why that agent is still
`running`.

A full jobs section would duplicate the popover (command, status, duration) without its terminal,
output tail or stop switch — strictly worse, and it would widen this plugin from "Agent Team viewer" to
"activity dashboard". So the board joins `job.owner` with the agent session ids it already has and
renders **attribution only**. If a feature needs the terminal, the answer is "open the Jobs popover",
not "add it here".

## The client contract (verified against 0.2.2-rc.5)

`JobView` (`@deepseek-ai/dsh-jobs/src/view.ts`) is the only shape a browser client sees:

```ts
readonly id: JobId            // '<kind>-<short-uuid>'
readonly kind: string         // 'bash' today
readonly label: string        // the command line
readonly owner?: SessionId    // the agent session that started it (absent = unowned, visible to all)
readonly status: JobStatus    // 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
readonly progress?: string    // live progress line, cleared at settlement
readonly detail?: string      // terminal reason, e.g. 'exit code: 3'
readonly startedAt: number
readonly finishedAt?: number  // absent while live
readonly output: { total: number; earliest: number; spillPaths?: readonly string[] }
```

- No `cwd`, no tokens, no cost, no model, no tool-call reference. "Blocked on a job" is **not**
  observable — only "owns a running job".
- Client service: `ctx.jobs` (`ClientJobs extends Service`, key `jobs`), state
  `JobsSnapshot { rows: Record<sessionId, JobView[]>, observed: Record<jobId, ObservedJob> }`,
  observable (`getSnapshot()` + `subscribe()`), plus `watchRows(sessionId)`.
- `watchRows(sessionId): () => void` is **reference-counted**: two watchers of one session share a
  stream, and the last release calls `rowsDropped(sessionId)`, which deletes the roster key. A
  reconnect's first frame is the whole truth, so there is nothing to seed from.
- `JobsSnapshot.rows` has **no key** for a session nobody watches and for a watched session that sees
  no job (`rowsReplaced` stores an empty set as an absent key). Consumers read absence, not a sentinel.
- Streams are coalesced (~100 ms flush). Output observations also mark the snapshot dirty, so the board
  compares its own roster arrays before re-rendering and ignores observation-only changes.
- Status → dot matches the product: `running → ongoing`, `stopping → warning`, `completed → done`,
  `killed → warning`, `failed → error`.

## What ships

1. `ctx.get('jobs')` in the registration (soft: an absent service renders nothing, exactly like
   [`dsh-cost-meter`](https://github.com/Han-1413141/dsh-cost-meter)). Every call is wrapped in `try/catch`; nothing throws into a click.
2. Subscription only while the board is mounted, for the whole tree — the Lead and the running agents
   come first, capped at 12 ids — so a settled agent keeps its chip and the totals cover the tree
   rather than only what is live right now. The roster is read from the snapshot and the board
   re-renders on `subscribe`.
3. **Agent row** (`AgentRow` in `src/client/40-board.js`): a clock chip with the number of background
   jobs the agent owns, highlighted while at least one is live; the tooltip names the live count, the
   longest elapsed and the wall time the background took. A facts-line item next to the run duration
   shows that background time in the same compact span format.
4. **Agent dialog** (`src/client/47-agent.js`): five metric tiles, with **background time** right after
   the run time so the two are never confused; then a foldable, scrollable block listing the agent's
   jobs — status dot, `kind`, `label` (truncated, full text in `title`), elapsed, `progress ?? detail`.
   Running first, then settled newest-first. A running agent or the Lead always gets the block, even
   empty ("no background processes" answers "why is it still running?"); a settled agent only gets it
   when it has history. The task list below it folds and scrolls the same way. Read-only: no kill, no
   output tail.
5. No new section and no global jobs board. The totals row keeps the agents' order and shows its own
   background time after the total run time.
6. Locale keys (same order in all eight dictionaries): `jobsHeading`, `jobsRunningCount`,
   `jobsLongest`, `jobsEmpty`, `metricBackground`. `en, zh, ru, ja, es, fr, de, pt`.
7. Smoke: a fake `jobs` snapshot with jobs owned by a subagent, by the Lead and by a settled agent,
   plus an unowned one; the chip counts only owned jobs, a settled-only chip stays muted, the dialog
   lists them, the run time and background time are separate, folding keeps the count, and the board
   renders unchanged when the service is absent.
