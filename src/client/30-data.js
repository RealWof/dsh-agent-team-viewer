/* ------------------------------------------------------------------ *
 * Data layer: the Team projection, the subagent tree with its session
 * metrics, the optional cost-meter remote, and the observation ledger that
 * supplies the one thing the task record does not carry — when a task started
 * and finished.
 * ------------------------------------------------------------------ */

    /**
     * Read the observation ledger from localStorage.
     * @returns `{ [taskId]: { s?: number, c?: number } }` with unix ms stamps.
     */
    function readLedger() {
      try {
        const raw = window.localStorage.getItem(LEDGER_KEY)
        if (raw === null || raw === '') return {}
        const parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        // A blocked or corrupt store only costs the elapsed-time labels.
        return {}
      }
    }

    /**
     * Persist the observation ledger.
     * @param ledger - the record to store.
     * @returns whether the write went through.
     */
    function writeLedger(ledger) {
      try {
        window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger))
        return true
      } catch {
        return false
      }
    }

    /** Module-wide ledger: the watcher folds into it, the board reads it. */
    const LEDGER = { value: readLedger(), listeners: new Set() }

    /** Tell every mounted surface that the ledger moved. */
    function notifyLedger() {
      for (const listener of LEDGER.listeners) {
        try {
          listener()
        } catch {
          // One broken listener must not stop the others.
        }
      }
    }

    /**
     * Fold the given task views into the shared ledger, stamping first-seen
     * transitions. Called by the always-on watcher and by the board.
     * @param tasks - the Team task views.
     * @returns whether anything changed.
     */
    function noteObservations(tasks) {
      const at = Date.now()
      const next = { ...LEDGER.value }
      let changed = false
      for (const task of tasks) {
        if (task === null || typeof task !== 'object' || typeof task.id !== 'string') continue
        const previous = next[task.id] !== null && typeof next[task.id] === 'object' ? next[task.id] : {}
        const record = { ...previous }
        if (task.status === 'in_progress' && typeof record.s !== 'number') {
          record.s = at
          changed = true
        }
        if (task.status === 'completed' && typeof record.c !== 'number') {
          record.c = at
          changed = true
        }
        if (task.status === 'pending' && typeof record.c === 'number') {
          // Reopening starts a new run; the previous completion is history.
          delete record.c
          changed = true
        }
        if (changed) next[task.id] = record
      }
      const ids = Object.keys(next)
      if (ids.length > LEDGER_LIMIT) {
        ids
          .sort((left, right) => num(next[right].c ?? next[right].s, 0) - num(next[left].c ?? next[left].s, 0))
          .slice(LEDGER_LIMIT)
          .forEach(id => { delete next[id] })
        changed = true
      }
      if (!changed) return false
      LEDGER.value = next
      writeLedger(next)
      notifyLedger()
      return true
    }

    /**
     * Subscribe one component to the ledger.
     * @returns the current ledger, re-read on every change.
     */
    function useLedger() {
      const [value, setValue] = useState(() => LEDGER.value)
      useEffect(() => {
        const listener = () => { setValue(LEDGER.value) }
        LEDGER.listeners.add(listener)
        return () => { LEDGER.listeners.delete(listener) }
      }, [])
      return value
    }

    /* ------------------------------------------------------------------ *
     * Fold state: which sections and status groups the reader folded away.
     * It is per-browser view state, so it lives in localStorage next to the
     * ledger; the overflow expansion below it is a page-session detail only.
     * ------------------------------------------------------------------ */

    /**
     * Keep only the boolean entries of one persisted fold map.
     * @param value - whatever the stored JSON held.
     * @returns a fresh map of booleans.
     */
    function booleansOf(value) {
      const map = {}
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return map
      for (const key of Object.keys(value)) {
        if (typeof value[key] === 'boolean') map[key] = value[key]
      }
      return map
    }

    /**
     * Read the fold state of the board.
     * @returns `{ sections, groups }`, each a map of booleans; empty on a
     *   blocked or corrupt store.
     */
    function readCollapse() {
      const empty = { sections: {}, groups: {} }
      try {
        const raw = window.localStorage.getItem(COLLAPSE_KEY)
        if (raw === null || raw === '') return empty
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return empty
        return { sections: booleansOf(parsed.sections), groups: booleansOf(parsed.groups) }
      } catch {
        // A blocked store only costs the remembered folds.
        return empty
      }
    }

    /** Module-wide fold state: the stored maps plus the unpersisted overflow set. */
    const COLLAPSE = {
      value: readCollapse(),
      /** Groups the reader expanded past the cap; page-session state, not stored. */
      expanded: new Set(),
    }

    /**
     * Persist the fold state, always with both section flags so the stored
     * shape is complete even before a section has ever been folded.
     * @returns whether the write went through.
     */
    function writeCollapse() {
      const value = {
        sections: {
          agents: COLLAPSE.value.sections.agents === true,
          tasks: COLLAPSE.value.sections.tasks === true,
        },
        groups: { ...COLLAPSE.value.groups },
      }
      try {
        window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(value))
        return true
      } catch {
        return false
      }
    }

    /**
     * The persisted id of one status group.
     * @param section - `agents` or `tasks`.
     * @param key - the group key within the section.
     * @returns the stable id, e.g. `tasks:active`.
     */
    function groupIdOf(section, key) {
      return section + ':' + key
    }

    /**
     * Whether a section body is folded away.
     * @param section - `agents` or `tasks`.
     * @returns the stored choice.
     */
    function isSectionCollapsed(section) {
      return COLLAPSE.value.sections[section] === true
    }

    /**
     * Whether a status group is folded away. A group seen for the first time
     * with a pile past AUTO_COLLAPSE_AT counts as folded before the write in
     * `noteAutoCollapse` lands, so the very first render already shows it
     * folded instead of jumping under the reader. A group the reader expanded
     * past the cap in this page session stays open: that click is a decision
     * too, even though it is not persisted.
     * @param groupId - the stable group id.
     * @param count - how many items the group currently holds.
     * @returns the effective fold state.
     */
    function isGroupCollapsed(groupId, count = 0) {
      if (COLLAPSE.value.groups[groupId] === true) return true
      if (COLLAPSE.expanded.has(groupId)) return false
      if (count <= AUTO_COLLAPSE_AT) return false
      return !Object.prototype.hasOwnProperty.call(COLLAPSE.value.groups, groupId)
    }

    /**
     * Whether a group shows every item this page session.
     * @param groupId - the stable group id.
     * @returns the session expansion state.
     */
    function isGroupExpanded(groupId) {
      return COLLAPSE.expanded.has(groupId)
    }

    /**
     * Fold or unfold one section and store the choice.
     * @param section - `agents` or `tasks`.
     */
    function toggleSection(section) {
      COLLAPSE.value.sections[section] = isSectionCollapsed(section) !== true
      writeCollapse()
    }

    /**
     * Fold or unfold one status group and store the choice. The stored entry
     * also pins the group against the auto-collapse, so an explicit choice
     * always wins.
     * @param groupId - the stable group id.
     * @param count - how many items the group currently holds.
     */
    function toggleGroup(groupId, count = 0) {
      const collapsed = isGroupCollapsed(groupId, count) !== true
      COLLAPSE.value.groups[groupId] = collapsed
      if (collapsed) COLLAPSE.expanded.delete(groupId)
      writeCollapse()
    }

    /**
     * Show every item of one group for the rest of the page session.
     * @param groupId - the stable group id.
     */
    function expandGroup(groupId) {
      COLLAPSE.expanded.add(groupId)
    }

    /**
     * Fall back to the visible cap for one group.
     * @param groupId - the stable group id.
     */
    function collapseGroup(groupId) {
      COLLAPSE.expanded.delete(groupId)
    }

    /**
     * Fold a pile bigger than the threshold the first time it is seen that
     * big, so a long finished column cannot push the whole panel down. Only
     * groups the reader has not decided about are touched.
     * @param counts - group id -> item count.
     * @returns whether the stored state changed.
     */
    function noteAutoCollapse(counts) {
      let changed = false
      for (const groupId of Object.keys(counts)) {
        if (counts[groupId] <= AUTO_COLLAPSE_AT) continue
        if (COLLAPSE.expanded.has(groupId)) continue
        if (Object.prototype.hasOwnProperty.call(COLLAPSE.value.groups, groupId)) continue
        COLLAPSE.value.groups[groupId] = true
        changed = true
      }
      if (!changed) return false
      writeCollapse()
      return true
    }

    /**
     * The board column a task belongs to.
     * @param task - a Team task view.
     * @returns the column key from COLUMNS.
     */
    function columnOf(task) {
      if (task.status === 'completed') return 'done'
      if (task.status === 'in_progress') return 'active'
      return task.ready === false ? 'blocked' : 'queued'
    }

    /**
     * Read one projection value out of the sessions list payload. The list
     * carries every projection that has been loaded for a session, including
     * the summary-excluded ones once it has been refreshed.
     * @param state - the sessions list state.
     * @param sessionId - the session id, or undefined.
     * @param key - the projection key.
     * @returns the value, or undefined when it has not been loaded.
     */
    function listProjection(state, sessionId, key) {
      if (typeof sessionId !== 'string' || sessionId === '') return undefined
      const bundle = state?.projectionsBySession?.[sessionId]
      const values = bundle?.values ?? bundle
      const value = values?.[key]
      return value === null ? undefined : value
    }

    /**
     * Walk parent links to the root (Lead) session of a tree.
     * @param state - the sessions list state.
     * @param sessionId - any session in the tree.
     * @returns the root session id, or undefined.
     */
    function rootOf(state, sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return undefined
      let current = sessionId
      let summary = state?.byId?.[current]
      for (let step = 0; step < 32 && summary !== undefined; step += 1) {
        const parent = typeof summary.parentId === 'string' && summary.parentId !== '' ? summary.parentId : undefined
        if (parent === undefined) return current
        current = parent
        summary = state?.byId?.[current]
      }
      return current
    }

    /**
     * Sum a token-usage projection into the counters the board shows.
     * @param usage - the tokenUsage projection value.
     * @returns normalized counters; zeros when the projection is missing.
     */
    function tokensOf(usage) {
      return {
        input: num(usage?.uncachedInputTokens),
        output: num(usage?.outputTokens),
        cacheRead: num(usage?.cacheReadTokens),
        cacheWrite: num(usage?.cacheWriteTokens),
        total: num(usage?.uncachedInputTokens) + num(usage?.outputTokens),
      }
    }

    /**
     * Unwrap the connection RPC envelope: `{ ok: true, value }` or `{ ok: false, error }`.
     * @param raw - whatever the remote method resolved with.
     * @returns the payload, or undefined when the call reported failure.
     */
    function unwrapRpc(raw) {
      if (raw === null || raw === undefined) return undefined
      if (typeof raw === 'object' && typeof raw.ok === 'boolean') {
        return raw.ok === true ? raw.value : undefined
      }
      return raw
    }

    /**
     * Normalize one cost-meter session record into the money figures the board
     * shows. `cost` is the plan-inclusive equivalent value; `apiCost` is the
     * real API money, and older snapshots omit it — then the whole `cost` is
     * API money (the cost-meter plugin's own fallback).
     * @param row - one SessionCost record, or a bare session cost record.
     * @returns `{ equivalentUsd, realUsd, equivalentCny, realCny, subApiUsd, subagentCount, calls, found }`.
     */
    function normalizeCost(row) {
      const own = row?.own !== null && typeof row?.own === 'object' ? row.own : row
      const sub = row?.subagents !== null && typeof row?.subagents === 'object' ? row.subagents : undefined
      const pick = (source, keys) => {
        for (const key of keys) {
          const value = source?.[key]
          if (typeof value === 'number' && Number.isFinite(value)) return value
        }
        return undefined
      }
      // `cost` is the list-price equivalent of every token the session burned,
      // plan-classified calls included; `apiCost` is the real money that left
      // the wallet (zero on a subscription). Both are kept, and the board shows
      // the equivalent, because that is what the same tokens would have cost.
      const equivalent = pick(own, ['cost'])
      const real = pick(own, ['apiCost'])
      return {
        equivalentUsd: equivalent ?? real,
        realUsd: real,
        equivalentCny: pick(own, ['costCny']),
        realCny: pick(own, ['apiCostCny']),
        subApiUsd: pick(sub, ['apiCost']),
        subagentCount: num(row?.subagentCount),
        calls: pick(own, ['calls']),
        found: row?.found !== false,
      }
    }

    /**
     * The model this session runs, with its provider and reasoning effort.
     * `modelSelection.next` is the pending-or-last-used choice, so it is the
     * effective one; effort names live in the model catalog, so the raw id is
     * returned and the dialog capitalizes it.
     * @param state - the sessions list state.
     * @param sessionId - the session id.
     * @returns `{ model, provider, effort }`, or undefined when unknown.
     */
    function selectionOf(state, sessionId) {
      const value = listProjection(state, sessionId, MODEL_SELECTION)
      const active = value?.next ?? value?.lastUsed
      if (active === null || active === undefined || typeof active !== 'object') return undefined
      const model = typeof active.model === 'string' && active.model !== '' ? active.model : undefined
      if (model === undefined) return undefined
      return {
        model,
        provider: typeof active.provider === 'string' && active.provider !== '' ? active.provider : undefined,
        effort: typeof active.reasoningEffort === 'string' && active.reasoningEffort !== '' ? active.reasoningEffort : undefined,
      }
    }

    /**
     * The agent preset id the session was started with.
     * @param state - the sessions list state.
     * @param sessionId - the session id.
     * @returns the preset id, or undefined.
     */
    function presetOf(state, sessionId) {
      const value = listProjection(state, sessionId, AGENT_PRESET)
      return typeof value === 'string' && value !== '' ? value : undefined
    }

    /**
     * Walk the subagent tree below one session, breadth first.
     *
     * `subagentCatalog` lists only a session's DIRECT children, so the tree is
     * walked level by level; each child's own catalog is read from the same
     * sessions list once the host has loaded it.
     *
     * Activity is derived the way the Subagents menu derives it: `running` comes
     * from the live Session status store, falling back to the list summary only
     * while that store has no answer. The summary alone is not enough: a row the
     * client synthesizes from a parent's catalog carries the run state of an
     * already-open session, or `false`, and never the Host's current answer — so
     * a running agent would sit in "idle" (the product's own `useSessionStatus`
     * comment: catalog rows "do not establish Host running state"). The
     * "completed" word still needs the closed-turn marker.
     *
     * @param state - the sessions list state.
     * @param rootId - the Lead session of the tree.
     * @param statuses - the live `useSessionStatus` map, when the host supplies it.
     * @param limit - how many agents to keep, from the row's Config; a negative value keeps every one.
     * @returns `{ agents, childIds }` — flat entries plus the ids whose catalogs are still needed.
     */
    function collectAgents(state, rootId, statuses, limit) {
      const agents = []
      const childIds = []
      const seen = new Set()
      if (typeof rootId !== 'string' || rootId === '') return { agents, childIds }
      // A negative limit (the shipped default is -1) means "no limit": the board
      // follows the catalogs to the end and counts the whole tree for the totals.
      const configured = num(limit, AGENTS_LIMIT_DEFAULT)
      const cap = configured < 0 ? Number.POSITIVE_INFINITY : Math.floor(configured)
      seen.add(rootId)
      const queue = [{ id: rootId, depth: 0 }]
      while (queue.length > 0 && agents.length < cap) {
        const node = queue.shift()
        const catalog = listProjection(state, node.id, AGENT_CATALOG)
        if (!Array.isArray(catalog)) {
          if (node.depth > 0) childIds.push(node.id)
          continue
        }
        for (const entry of catalog) {
          if (entry === null || typeof entry !== 'object') continue
          if (typeof entry.id !== 'string' || entry.id === '' || seen.has(entry.id)) continue
          seen.add(entry.id)
          const summary = state?.byId?.[entry.id]
          const timing = listProjection(state, entry.id, AGENT_TIMING)
          const mode = typeof entry.mode === 'string' ? entry.mode : 'unknown'
          const running = (statuses?.get(entry.id)?.running ?? summary?.running) === true
          const completed = mode !== 'external' && !running && timing?.lastTurnCompleted === true
          agents.push({
            id: entry.id,
            name: typeof entry.name === 'string' && entry.name !== ''
              ? entry.name
              : (typeof entry.label === 'string' && entry.label !== ''
                ? entry.label
                : (typeof summary?.displayTitle === 'string' && summary.displayTitle !== ''
                  ? summary.displayTitle
                  : (typeof summary?.title === 'string' && summary.title !== '' ? summary.title : entry.id))),
            mode,
            depth: node.depth + 1,
            parentId: node.id,
            createdAt: num(entry.createdAt, 0) || undefined,
            running,
            completed,
            activity: running ? 'running' : completed ? 'completed' : 'inactive',
            settledMs: num(timing?.settledMs),
            startedAt: num(timing?.active?.since, 0) || undefined,
            updatedAt: num(summary?.updatedAt, 0) || undefined,
            model: selectionOf(state, entry.id),
            preset: presetOf(state, entry.id),
          })
          if (agents.length >= cap) break
          queue.push({ id: entry.id, depth: node.depth + 1 })
        }
      }
      return { agents, childIds }
    }

    /**
     * The session metrics of one agent: everything the board can say about the
     * work an agent did, as opposed to what a task claims.
     * @param agent - one agent entry.
     * @param context - `{ state, costs, now, faceOf, taskCounts }`.
     * @returns tokens, active agent time, money, run duration and task count.
     */
    function metricsOf(agent, context) {
      const usage = listProjection(context.state, agent.id, TOKENS_PROJECTION)
      const rawStats = listProjection(context.state, agent.id, STATS_PROJECTION) ?? context.faceOf(agent.id, STATS_PROJECTION)
      const activeMs = rawStats === undefined ? undefined : num(rawStats.llmMs) + num(rawStats.toolMs)
      const settled = num(agent.settledMs)
      const runningMs = agent.running && agent.startedAt !== undefined ? Math.max(0, context.now - agent.startedAt) : 0
      const durationMs = settled > 0 || runningMs > 0 ? settled + runningMs : undefined
      const jobRows = context.jobs?.[agent.id]
      return {
        tokens: tokensOf(usage),
        hasTokens: usage !== undefined,
        activeMs,
        hours: activeMs === undefined ? undefined : activeMs / 3_600_000,
        steps: rawStats === undefined ? undefined : num(rawStats.steps),
        turns: rawStats === undefined ? undefined : num(rawStats.turns),
        cost: context.costs[agent.id],
        durationMs,
        // Known for the agents whose roster is watched; undefined otherwise.
        backgroundMs: jobRows === undefined ? undefined : backgroundSpanOf(jobRows, context.now),
        taskCount: context.taskCounts?.[agent.id] ?? 0,
      }
    }

    /**
     * The task's own timeline. A task record keeps no timestamps, so these come
     * from the observation ledger; nothing here belongs to an agent.
     * @param task - a Team task view.
     * @param context - `{ ledger, now }`.
     * @returns `{ startedAt, completedAt, elapsedMs, running }`.
     */
    function timelineOf(task, context) {
      const record = context.ledger[task.id] ?? {}
      const startedAt = typeof record.s === 'number' ? record.s : undefined
      const completedAt = typeof record.c === 'number' ? record.c : undefined
      const running = task.status === 'in_progress'
      return {
        startedAt,
        completedAt,
        running,
        elapsedMs: startedAt === undefined
          ? undefined
          : (running ? context.now - startedAt : (completedAt === undefined ? undefined : completedAt - startedAt)),
      }
    }

    /* ------------------------------------------------------------------ *
     * Background jobs: attribution only.
     *
     * The roster of a session carries every job its owner can see — its own
     * plus every unowned one — so the join is `job.owner`, never the roster a
     * job arrived in. Nothing here reads output or touches the kill switch:
     * the shipped Jobs popover stays the place for both.
     * ------------------------------------------------------------------ */

    /**
     * Whether a job status still holds the agent.
     * @param job - one JobView.
     * @returns whether the job is running or being stopped.
     */
    function isLiveJob(job) {
      return JOB_LIVE[job?.status] === true
    }

    /**
     * The status dot of a job, in the product's own state vocabulary.
     * @param job - one JobView.
     * @returns `idle`, `ongoing`, `warning`, `done` or `error`.
     */
    function jobStateOf(job) {
      return JOB_STATES[job?.status] ?? 'idle'
    }

    /**
     * The jobs one agent owns. An unowned job is visible in every roster but
     * belongs to no agent, so it is attributed to none of them.
     * @param rows - one session's roster from `JobsSnapshot.rows`.
     * @param agentId - the agent's session id.
     * @returns the jobs the agent started.
     */
    function jobsOfOwner(rows, agentId) {
      if (!Array.isArray(rows) || typeof agentId !== 'string' || agentId === '') return []
      const jobs = []
      for (const job of rows) {
        if (job === null || typeof job !== 'object') continue
        if (job.owner !== agentId) continue
        jobs.push(job)
      }
      return jobs
    }

    /**
     * The live jobs of one agent, the longest running first.
     * @param jobs - the agent's jobs.
     * @returns the ordered live jobs.
     */
    function liveJobsOf(jobs) {
      const live = []
      for (const job of jobs ?? []) {
        if (isLiveJob(job)) live.push(job)
      }
      return live.sort((left, right) => num(left.startedAt) - num(right.startedAt))
    }

    /**
     * The job order of the agent dialog: live jobs first (oldest first, so the
     * one that has held the agent longest is on top), then settled ones
     * newest-first.
     * @param jobs - the agent's jobs.
     * @returns the ordered copy.
     */
    function orderJobs(jobs) {
      const live = []
      const settled = []
      for (const job of jobs ?? []) {
        if (isLiveJob(job)) live.push(job)
        else settled.push(job)
      }
      live.sort((left, right) => num(left.startedAt) - num(right.startedAt))
      settled.sort((left, right) => num(right.finishedAt, num(right.startedAt))
        - num(left.finishedAt, num(left.startedAt)))
      return live.concat(settled)
    }

    /**
     * How long a job has been, or was, running.
     * @param job - one JobView.
     * @param now - the ticking clock.
     * @returns the span in milliseconds, or undefined when it never started.
     */
    function jobElapsed(job, now) {
      const startedAt = num(job?.startedAt, 0)
      if (startedAt <= 0) return undefined
      const end = isLiveJob(job) ? num(now, 0) : num(job?.finishedAt, 0)
      return end > 0 ? Math.max(0, end - startedAt) : undefined
    }

    /**
     * The wall time the given jobs occupied: the union of their intervals, so
     * two concurrent commands are counted once. A live job runs up to `now`.
     * This is the "time in background processes" figure, next to the agent's
     * own run time.
     * @param jobs - the agent's jobs.
     * @param now - the ticking clock.
     * @returns the occupied milliseconds; 0 when nothing ever ran.
     */
    function backgroundSpanOf(jobs, now) {
      const spans = []
      for (const job of jobs ?? []) {
        const startedAt = num(job?.startedAt, 0)
        if (startedAt <= 0) continue
        const end = isLiveJob(job) ? num(now, 0) : num(job?.finishedAt, 0)
        if (end > startedAt) spans.push([startedAt, end])
      }
      spans.sort((left, right) => left[0] - right[0])
      let total = 0
      let from
      let to
      for (const span of spans) {
        if (from === undefined) {
          from = span[0]
          to = span[1]
          continue
        }
        if (span[0] <= to) {
          to = Math.max(to, span[1])
          continue
        }
        total += to - from
        from = span[0]
        to = span[1]
      }
      if (from !== undefined) total += to - from
      return total
    }

    /**
     * Watch the job rosters of the given sessions while the board is mounted,
     * and read them again on every change. Only the rosters are read: no
     * observation stream, no kill. Without the jobs service the board renders
     * exactly as before, because every call degrades to "nothing".
     * @param services - the injected face: `jobsSnapshot`, `watchJobs`, `subscribeJobs`.
     * @param sessionIds - the sessions to watch, already capped by the caller.
     * @returns `{ byAgent }`; `byAgent` holds only watched agents, and is empty
     *   when the jobs service is absent.
     */
    function useAgentJobs(services, sessionIds) {
      const [version, setVersion] = useState(0)
      const key = sessionIds.join(',')
      useEffect(() => {
        const stops = []
        for (const id of sessionIds) {
          try {
            const stop = typeof services.watchJobs === 'function' ? services.watchJobs(id) : undefined
            if (typeof stop === 'function') stops.push(stop)
          } catch {
            // One roster that cannot be watched only costs that agent's attribution.
          }
        }
        // The whole snapshot also changes when output is observed elsewhere;
        // only the watcher's own roster arrays decide whether the board must
        // re-render. The first pass also re-reads after subscribing, which
        // closes the gap between the render that read the snapshot and this
        // effect.
        const seen = new Map()
        const onChange = () => {
          let rows
          try {
            rows = typeof services.jobsSnapshot === 'function' ? services.jobsSnapshot()?.rows : undefined
          } catch {
            rows = undefined
          }
          let changed = false
          for (const id of sessionIds) {
            const value = rows?.[id]
            if (seen.get(id) !== value) {
              seen.set(id, value)
              changed = true
            }
          }
          if (changed) setVersion(value => value + 1)
        }
        let off
        try {
          off = typeof services.subscribeJobs === 'function' ? services.subscribeJobs(onChange) : undefined
        } catch {
          off = undefined
        }
        onChange()
        return () => {
          if (typeof off === 'function') off()
          for (const stop of stops) {
            try {
              stop()
            } catch {
              // The service may already be gone with the page; the board is unmounting.
            }
          }
        }
        // The key stands for the id list and stays stable across identical renders.
      }, [key, services])
      return useMemo(() => {
        let snapshot
        try {
          snapshot = typeof services.jobsSnapshot === 'function' ? services.jobsSnapshot() : undefined
        } catch {
          snapshot = undefined
        }
        if (snapshot === null || typeof snapshot !== 'object') return { byAgent: {} }
        const rows = snapshot.rows
        const byAgent = {}
        for (const id of sessionIds) byAgent[id] = jobsOfOwner(rows?.[id], id)
        return { byAgent }
        // `version` is the subscription's re-render trigger, not a read input.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [key, version, services])
    }

    /**
     * Resolve the team board of the Lead session. The seat's own projection is
     * the live one, so it wins whenever this board is rendered for the Lead
     * session itself; otherwise the list payload of the root session is used,
     * which the host keeps in step with the same durable board.
     * @param state - the sessions list state.
     * @param sessionId - the session this board is rendered for.
     * @param own - the `useProjection('agentTeam')` value of that session.
     * @returns `{ team, rootId }`.
     */
    function resolveTeam(state, sessionId, own) {
      const rootId = rootOf(state, sessionId) ?? sessionId
      if (rootId === sessionId && own !== undefined) return { team: own, rootId }
      const fromRoot = listProjection(state, rootId, TEAM_PROJECTION)
      if (fromRoot !== undefined) return { team: fromRoot, rootId }
      if (own !== undefined) return { team: own, rootId }
      return { team: listProjection(state, sessionId, TEAM_PROJECTION), rootId }
    }

    /**
     * The board model: the Team projection, the subagent tree with its session
     * metrics, the observed ledger and a ticking clock.
     *
     * @param props - the slot's framework props (`useProjection`, `useSessions`,
     *   `useSessionStatus`, `sessionId`).
     * @param services - the injected face: `faceOf`, `refreshProjections`, `loadCosts`, `listState`, `subscribeList`.
     * @returns the model the board renders.
     */
    function useTeamModel(props, services) {
      const { t } = props
      // The seat supplies these hooks for session-scoped slots. Fall back to
      // the injected session-list face when a host build does not, so the board
      // still renders instead of failing on an absent prop.
      const useProjectionProp = typeof props.useProjection === 'function' ? props.useProjection : null
      const useSessionsProp = typeof props.useSessions === 'function' ? props.useSessions : null
      // `useSessionStatus` is a global standard prop, so every slot gets it; the
      // fallback keeps an older host rendering with the list summary alone.
      const useStatusProp = typeof props.useSessionStatus === 'function' ? props.useSessionStatus : null
      const own = useProjectionProp === null ? undefined : useProjectionProp(TEAM_PROJECTION)
      const [, setVersion] = useState(0)
      const state = useSessionsProp === null
        ? services.listState()
        : useSessionsProp(snapshot => snapshot)
      const statuses = useStatusProp === null ? undefined : useStatusProp(value => value)
      useEffect(() => {
        if (useSessionsProp !== null) return undefined
        return services.subscribeList(() => { setVersion(value => value + 1) })
        // Both props and services are stable for the life of the mount.
      }, [])

      const resolved = useMemo(() => resolveTeam(state, props.sessionId, own), [state, props.sessionId, own])
      const team = resolved.team
      const rootId = resolved.rootId
      const [limit, setLimit] = useState(AGENTS_LIMIT_DEFAULT)
      const tree = useMemo(() => collectAgents(state, rootId, statuses, limit), [state, rootId, statuses, limit])
      const agents = tree.agents
      const agentIds = tree.childIds
      const ledger = useLedger()
      const [costs, setCosts] = useState({})
      const [now, setNow] = useState(() => Date.now())
      const [costState, setCostState] = useState('idle')
      const refreshed = useRef({})
      /** Whether the row's limit has been read; a late settings surface retries until it has. */
      const limitKnown = useRef(false)

      /**
       * Read the row's `agentsLimit` from the settings document. The board
       * renders before the answer arrives and after a failed read, so the
       * built-in default covers both.
       */
      const readLimit = useCallback(async () => {
        let value
        try {
          value = await services.pluginLimit()
        } catch {
          value = undefined
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) return
        limitKnown.current = true
        setLimit(current => (current === value ? current : value))
      }, [services])

      useEffect(() => { readLimit() }, [readLimit])

      const tasks = useMemo(() => {
        const list = Array.isArray(team?.tasks) ? team.tasks : []
        return list.filter(task => task !== null && typeof task === 'object' && task.status !== 'deleted')
      }, [team])

      useEffect(() => {
        noteObservations(tasks)
      }, [tasks])

      useEffect(() => {
        const timer = window.setInterval(() => { setNow(Date.now()) }, TICK_MS)
        return () => { window.clearInterval(timer) }
      }, [])

      /** The Lead session as an agent-shaped row, so owner lookups cover it too. */
      const lead = useMemo(() => {
        if (typeof rootId !== 'string' || rootId === '') return undefined
        const summary = state?.byId?.[rootId]
        const running = (statuses?.get(rootId)?.running ?? summary?.running) === true
        const name = typeof summary?.title === 'string' && summary.title !== ''
          ? summary.title
          : (typeof summary?.displayTitle === 'string' && summary.displayTitle !== ''
            ? summary.displayTitle
            : t('leadLabel'))
        return {
          id: rootId,
          name,
          mode: 'lead',
          depth: 0,
          parentId: undefined,
          createdAt: undefined,
          updatedAt: num(summary?.updatedAt, 0) || undefined,
          running,
          completed: false,
          activity: running ? 'running' : 'inactive',
          settledMs: 0,
          startedAt: undefined,
          isLead: true,
          model: selectionOf(state, rootId),
          preset: presetOf(state, rootId),
        }
      }, [state, rootId, statuses, t])

      const taskCounts = useMemo(() => {
        const counts = {}
        for (const task of tasks) {
          const owner = typeof task.ownerId === 'string' ? task.ownerId : undefined
          if (owner !== undefined) counts[owner] = (counts[owner] ?? 0) + 1
        }
        return counts
      }, [tasks])

      /** Owner lookup for cards and the task dialog: subagents plus the Lead. */
      const whoById = useMemo(() => {
        const map = {}
        for (const agent of agents) map[agent.id] = agent
        if (lead !== undefined) map[lead.id] = lead
        return map
      }, [agents, lead])

      /**
       * The strip: the Lead always first, then running agents, then the rest by
       * name. The group split happens later, so a Lead-first order here also
       * makes the Lead the first row of whichever group it falls into.
       */
      const stripAgents = useMemo(() => {
        const rows = lead === undefined ? [...agents] : [lead, ...agents]
        const order = row => (row.isLead ? 0 : row.running ? 1 : 2)
        return rows.sort((left, right) => {
          const delta = order(left) - order(right)
          if (delta !== 0) return delta
          return String(left.name).localeCompare(String(right.name))
        })
      }, [agents, lead])

      /**
       * The sessions whose job rosters the board watches. The strip lists the
       * Lead first and then the running agents, so the cap takes those before
       * the settled ones; the rosters make the chip, the dialog and the totals
       * cover the whole tree rather than only what is live right now.
       */
      const jobsIds = useMemo(() => {
        const ids = []
        for (const agent of stripAgents) {
          if (ids.length >= JOBS_WATCH_CAP) break
          ids.push(agent.id)
        }
        return ids
      }, [stripAgents])

      /** The attributed jobs of every watched agent; read-only and optional. */
      const jobs = useAgentJobs(services, jobsIds)

      /** The same rows, grouped by the status the task columns use. */
      const agentColumns = useMemo(() => {
        const groups = AGENT_COLUMNS.map(column => ({ ...column, agents: [] }))
        for (const agent of stripAgents) {
          const key = agent.running ? 'active' : agent.completed ? 'done' : 'idle'
          const group = groups.find(candidate => candidate.key === key) ?? groups[groups.length - 1]
          group.agents.push(agent)
        }
        return groups
      }, [stripAgents])

      const costIds = useMemo(() => {
        const ids = []
        for (const agent of stripAgents) ids.push(agent.id)
        for (const task of tasks) {
          const owner = typeof task.ownerId === 'string' ? task.ownerId : undefined
          if (owner !== undefined && !ids.includes(owner)) ids.push(owner)
        }
        return ids
      }, [stripAgents, tasks])

      const metricsContext = useMemo(() => ({
        state, costs, now, faceOf: services.faceOf, taskCounts, jobs: jobs.byAgent,
      }), [state, costs, now, services, taskCounts, jobs.byAgent])

      const agentStats = useMemo(() => {
        const map = {}
        for (const agent of stripAgents) map[agent.id] = metricsOf(agent, metricsContext)
        return map
      }, [stripAgents, metricsContext])

      /**
       * The whole tree's totals: every agent's run time, tokens, active hours,
       * money and task count added up. The Lead's own figures are its
       * session's, and each subagent's are its own, so nothing is counted
       * twice. The order here is the order the agent rows and the dialog use:
       * duration, tokens, agent-hours, cost.
       */
      const totals = useMemo(() => {
        let costUsd
        let costCny
        let realUsd
        let durationMs
        let durationKnown = false
        let backgroundMs
        let backgroundKnown = false
        let tokens = 0
        let tokensKnown = false
        let hours = 0
        let hoursKnown = false
        for (const agent of stripAgents) {
          const stats = agentStats[agent.id]
          if (stats === undefined) continue
          if (stats.durationMs !== undefined) {
            durationKnown = true
            durationMs = num(durationMs) + stats.durationMs
          }
          if (stats.backgroundMs !== undefined) {
            backgroundKnown = true
            backgroundMs = num(backgroundMs) + stats.backgroundMs
          }
          if (stats.hasTokens) {
            tokensKnown = true
            tokens += stats.tokens.total
          }
          if (stats.hours !== undefined) {
            hoursKnown = true
            hours += stats.hours
          }
          const cost = stats.cost
          if (cost !== undefined) {
            if (typeof cost.equivalentUsd === 'number') costUsd = num(costUsd) + cost.equivalentUsd
            else if (typeof cost.equivalentCny === 'number') costCny = num(costCny) + cost.equivalentCny
            if (typeof cost.realUsd === 'number') realUsd = num(realUsd) + cost.realUsd
          }
        }
        return {
          agents: stripAgents.length,
          durationMs: durationKnown ? durationMs : undefined,
          backgroundMs: backgroundKnown ? backgroundMs : undefined,
          cost: costUsd === undefined && costCny === undefined
            ? undefined
            : {
              usd: costUsd,
              cny: costCny,
              realUsd: costUsd === undefined ? undefined : num(realUsd),
              text: costUsd !== undefined ? formatMoney(costUsd, '$') : formatMoney(costCny, '¥'),
              currency: costUsd !== undefined ? 'USD' : 'CNY',
            },
          tokens: tokensKnown ? tokens : undefined,
          hours: hoursKnown ? hours : undefined,
          tasks: tasks.length,
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [stripAgents, agentStats, tasks.length])

      /** Refresh whatever the board has not loaded yet, plus the money figures. */
      const pull = useCallback(async (force) => {
        const targets = new Set()
        // A board rendered inside the Lead session already reads the live
        // projection; a board rendered inside a subagent session needs the
        // Lead's values fetched, and the host memoizes that fold per session.
        if (typeof rootId === 'string' && rootId !== props.sessionId) targets.add(rootId)
        for (const id of costIds) {
          if (force === true || refreshed.current[id] !== true) {
            refreshed.current[id] = true
            targets.add(id)
          }
        }
        // A child's own catalog only arrives after its projections are loaded,
        // so the tree widens one level per pass.
        for (const id of agentIds) {
          if (force === true || refreshed.current[id] !== true) {
            refreshed.current[id] = true
            targets.add(id)
          }
        }
        for (const id of targets) services.refreshProjections(id)
        // A configuration edit reaches the board on an explicit refresh; a
        // settings surface that mounted late is retried by the periodic pass
        // until it has answered once.
        if (force === true || limitKnown.current !== true) readLimit()
        if (costIds.length === 0) return
        const result = await services.loadCosts(costIds)
        if (result === null) {
          setCostState('missing')
          return
        }
        setCosts(result)
        setCostState('ready')
        setNow(Date.now())
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [costIds.join(','), agentIds.join(','), rootId, props.sessionId, services, readLimit])

      useEffect(() => {
        pull(false)
        const timer = window.setInterval(() => { pull(false) }, REFRESH_MS)
        return () => { window.clearInterval(timer) }
      }, [pull])

      const refresh = useCallback(() => {
        setNow(Date.now())
        pull(true)
      }, [pull])

      const columns = useMemo(() => {
        const grouped = {}
        for (const column of COLUMNS) grouped[column.key] = []
        for (const task of tasks) grouped[columnOf(task)].push(task)
        return COLUMNS.map(column => ({
          ...column,
          tasks: grouped[column.key].sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, { numeric: true })),
        }))
      }, [tasks])

      const timelines = useMemo(() => {
        const map = {}
        for (const task of tasks) map[task.id] = timelineOf(task, { ledger, now })
        return map
      }, [tasks, ledger, now])

      return {
        team,
        tasks,
        columns,
        timelines,
        agents: stripAgents,
        agentColumns,
        jobs,
        totals,
        agentStats,
        whoById,
        taskCounts,
        rootId,
        now,
        t,
        costState,
        enabled: team?.enabled === true,
        hasTeam: team !== null && team !== undefined && typeof team === 'object',
        failure: typeof team?.failure === 'string' && team.failure !== '' ? team.failure : undefined,
        refresh,
      }
    }
