/* ------------------------------------------------------------------ *
 * Data layer: the Team projection, the subagent tree with its session
 * metrics, the optional cost-meter remote, and the observation ledger that
 * supplies the one thing the task record does not carry — when a task started
 * and finished.
 * ------------------------------------------------------------------ */

    /**
     * Read the observation ledger from localStorage.
     * @returns `{ [taskId]: { f?: number, s?: number, c?: number } }` with unix
     *   ms stamps: first seen, started and completed.
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
     *
     * Every task gets `f`, the first moment the board ever saw it, so the
     * columns can be ordered by when the work appeared rather than by id. A
     * record from an older version only carries `s`/`c`; it keeps them and
     * gains `f` the next time the task is seen.
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
        let touched = false
        if (typeof record.f !== 'number') {
          record.f = at
          touched = true
        }
        if (task.status === 'in_progress' && typeof record.s !== 'number') {
          record.s = at
          touched = true
        }
        if (task.status === 'completed' && typeof record.c !== 'number') {
          record.c = at
          touched = true
        }
        if (task.status === 'pending' && typeof record.c === 'number') {
          // Reopening starts a new run; the previous completion is history.
          delete record.c
          touched = true
        }
        if (touched) {
          next[task.id] = record
          changed = true
        }
      }
      const ids = Object.keys(next)
      if (ids.length > LEDGER_LIMIT) {
        // `f` is the last key: a task that never started has no `s`/`c`, and
        // without the fallback its fresh first-seen record would sort as 0 and
        // be the first one dropped on every pass.
        ids
          .sort((left, right) => num(next[right].c ?? next[right].s ?? next[right].f, 0)
            - num(next[left].c ?? next[left].s ?? next[left].f, 0))
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
     *
     * Every board keeps its own folds, keyed by its root session id: two
     * boards can be open at once (a Lead and a subagent view), and folding a
     * group on one must not fold the same group on the other. The stored shape
     * is versioned (`{ boards: { <rootId>: { sections, groups } } }`); the
     * pre-0.2 flat `{ sections, groups }` carried no board id, so it is
     * dropped once instead of leaking into every board.
     * ------------------------------------------------------------------ */

    /** Board key used only when a caller has no root session id. */
    const COLLAPSE_FALLBACK_BOARD = 'default'

    /**
     * The stored key of one board's fold state.
     * @param boardId - the root session id.
     * @returns the key, safe to use as an object property.
     */
    function foldBoardKeyOf(boardId) {
      return typeof boardId === 'string' && boardId !== '' && boardId !== '__proto__'
        && boardId !== 'constructor' && boardId !== 'prototype'
        ? boardId
        : COLLAPSE_FALLBACK_BOARD
    }

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
     * Read the per-board fold state.
     * @returns `{ boards }`, each entry `{ sections, groups }`; empty on a
     *   blocked or corrupt store and after a legacy flat shape.
     */
    function readCollapse() {
      const empty = { boards: {} }
      try {
        const raw = window.localStorage.getItem(COLLAPSE_KEY)
        if (raw === null || raw === '') return empty
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return empty
        const source = parsed.boards
        if (source === null || typeof source !== 'object' || Array.isArray(source)) {
          // A pre-0.2 flat `{ sections, groups }` carried no board id; applying
          // it to every board would preserve the leak, so it is dropped.
          return empty
        }
        const boards = {}
        for (const key of Object.keys(source)) {
          if (foldBoardKeyOf(key) !== key) continue
          const entry = source[key]
          if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
          boards[key] = { sections: booleansOf(entry.sections), groups: booleansOf(entry.groups) }
        }
        return { boards }
      } catch {
        // A blocked store only costs the remembered folds.
        return empty
      }
    }

    /** Module-wide fold state: every board's stored maps plus the page expansion set. */
    const COLLAPSE = {
      value: readCollapse(),
      /** `${boardKey}\u0000${groupId}` entries expanded past the cap; page-session state. */
      expanded: new Set(),
    }

    /**
     * The stored fold entry of one board, without creating it.
     * @param boardId - the root session id.
     * @returns that board's `{ sections, groups }`, or undefined.
     */
    function foldBoardOf(boardId) {
      return COLLAPSE.value.boards[foldBoardKeyOf(boardId)]
    }

    /**
     * The stored fold entry of one board, created on first write.
     * @param boardId - the root session id.
     * @returns that board's mutable `{ sections, groups }`.
     */
    function ensureFoldBoard(boardId) {
      const key = foldBoardKeyOf(boardId)
      if (COLLAPSE.value.boards[key] === undefined) {
        COLLAPSE.value.boards[key] = { sections: {}, groups: {} }
      }
      return COLLAPSE.value.boards[key]
    }

    /**
     * The page-session key of one expanded group.
     * @param boardId - the root session id.
     * @param groupId - the stable group id.
     * @returns the scoped key.
     */
    function expandedKeyOf(boardId, groupId) {
      return foldBoardKeyOf(boardId) + '\u0000' + groupId
    }

    /**
     * Persist every board's fold state, always with both section flags so the
     * stored shape is complete even before a section has ever been folded.
     * @returns whether the write went through.
     */
    function writeCollapse() {
      const boards = {}
      for (const key of Object.keys(COLLAPSE.value.boards)) {
        if (foldBoardKeyOf(key) !== key) continue
        const entry = COLLAPSE.value.boards[key]
        boards[key] = {
          sections: {
            agents: entry.sections.agents === true,
            tasks: entry.sections.tasks === true,
          },
          groups: { ...entry.groups },
        }
      }
      try {
        window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify({ boards }))
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
     * Whether a section body is folded away on one board.
     * @param boardId - the root session id.
     * @param section - `agents` or `tasks`.
     * @returns the stored choice.
     */
    function isSectionCollapsed(boardId, section) {
      const board = foldBoardOf(boardId)
      return board !== undefined && board.sections[section] === true
    }

    /**
     * Whether a status group is folded away on one board. A group seen for the
     * first time with a pile past AUTO_COLLAPSE_AT counts as folded before the
     * write in `noteAutoCollapse` lands, so the very first render already shows
     * it folded instead of jumping under the reader. A group the reader
     * expanded past the cap in this page session stays open: that click is a
     * decision too, even though it is not persisted. Both maps are scoped to
     * the board, so two open boards never share a fold.
     * @param boardId - the root session id.
     * @param groupId - the stable group id.
     * @param count - how many items the group currently holds.
     * @returns the effective fold state.
     */
    function isGroupCollapsed(boardId, groupId, count = 0) {
      const board = foldBoardOf(boardId)
      if (board !== undefined && board.groups[groupId] === true) return true
      if (COLLAPSE.expanded.has(expandedKeyOf(boardId, groupId))) return false
      if (count <= AUTO_COLLAPSE_AT) return false
      return board === undefined || !Object.prototype.hasOwnProperty.call(board.groups, groupId)
    }

    /**
     * Whether a group shows every item this page session.
     * @param boardId - the root session id.
     * @param groupId - the stable group id.
     * @returns the session expansion state.
     */
    function isGroupExpanded(boardId, groupId) {
      return COLLAPSE.expanded.has(expandedKeyOf(boardId, groupId))
    }

    /**
     * Fold or unfold one section on one board and store the choice.
     * @param boardId - the root session id.
     * @param section - `agents` or `tasks`.
     */
    function toggleSection(boardId, section) {
      const board = ensureFoldBoard(boardId)
      board.sections[section] = isSectionCollapsed(boardId, section) !== true
      writeCollapse()
    }

    /**
     * Fold or unfold one status group on one board and store the choice. The
     * stored entry also pins the group against the auto-collapse, so an
     * explicit choice always wins.
     * @param boardId - the root session id.
     * @param groupId - the stable group id.
     * @param count - how many items the group currently holds.
     */
    function toggleGroup(boardId, groupId, count = 0) {
      const board = ensureFoldBoard(boardId)
      const collapsed = isGroupCollapsed(boardId, groupId, count) !== true
      board.groups[groupId] = collapsed
      if (collapsed) COLLAPSE.expanded.delete(expandedKeyOf(boardId, groupId))
      writeCollapse()
    }

    /**
     * Show every item of one group for the rest of the page session.
     * @param boardId - the root session id.
     * @param groupId - the stable group id.
     */
    function expandGroup(boardId, groupId) {
      COLLAPSE.expanded.add(expandedKeyOf(boardId, groupId))
    }

    /**
     * Fall back to the visible cap for one group.
     * @param boardId - the root session id.
     * @param groupId - the stable group id.
     */
    function collapseGroup(boardId, groupId) {
      COLLAPSE.expanded.delete(expandedKeyOf(boardId, groupId))
    }

    /**
     * Fold a pile bigger than the threshold the first time it is seen that
     * big on one board, so a long finished column cannot push the whole panel
     * down. Only groups the reader has not decided about are touched.
     * @param boardId - the root session id.
     * @param counts - group id -> item count.
     * @returns whether the stored state changed.
     */
    function noteAutoCollapse(boardId, counts) {
      let changed = false
      let board
      const key = foldBoardKeyOf(boardId)
      for (const groupId of Object.keys(counts)) {
        if (counts[groupId] <= AUTO_COLLAPSE_AT) continue
        if (COLLAPSE.expanded.has(key + '\u0000' + groupId)) continue
        const current = COLLAPSE.value.boards[key]
        if (current !== undefined && Object.prototype.hasOwnProperty.call(current.groups, groupId)) continue
        board = board ?? ensureFoldBoard(boardId)
        board.groups[groupId] = true
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

    /* ------------------------------------------------------------------ *
     * Ordering: the view setting decides how the cards of a column and the
     * agents of a group are sorted. A task's first-seen stamp comes from the
     * observation ledger; an agent carries its own createdAt/updatedAt. The
     * Lead is always pinned first in its own column, and a task the ledger
     * never saw sorts after the ones it did.
     * ------------------------------------------------------------------ */

    /**
     * The first-seen stamp of a task from the observation ledger. A record
     * written before `f` existed falls back to its start and completion
     * stamps, so the order does not jump when the version changes.
     * @param ledger - the observation ledger.
     * @param task - a Team task view.
     * @returns unix ms, or undefined when the task was never observed.
     */
    function firstSeenOf(ledger, task) {
      const record = ledger?.[task?.id]
      if (record === null || typeof record !== 'object') return undefined
      if (typeof record.f === 'number' && Number.isFinite(record.f)) return record.f
      if (typeof record.s === 'number' && Number.isFinite(record.s)) return record.s
      if (typeof record.c === 'number' && Number.isFinite(record.c)) return record.c
      return undefined
    }

    /**
     * Compare two task ids the way the board has always ordered them: numeric
     * natural order, so `#2` stays before `#10`.
     * @returns a negative, zero or positive number.
     */
    function compareTaskIds(left, right) {
      return String(left?.id).localeCompare(String(right?.id), undefined, { numeric: true })
    }

    /**
     * Sort one status column's tasks by the view setting. `newest` puts the
     * freshest work on top (`oldest` reverses that); a task without a stamp
     * sorts last, and the id breaks every remaining tie so the order is
     * deterministic across renders.
     * @param tasks - the column's tasks.
     * @param sort - `newest`, `oldest` or `name`.
     * @param ledger - the observation ledger.
     * @returns a sorted copy.
     */
    function sortTasks(tasks, sort, ledger) {
      const rows = [...tasks]
      const idOrder = (left, right) => (sort === 'oldest' ? compareTaskIds(left, right) : -compareTaskIds(left, right))
      rows.sort((left, right) => {
        if (sort === 'name') {
          const byName = String(left.subject ?? left.id).localeCompare(String(right.subject ?? right.id))
          return byName !== 0 ? byName : compareTaskIds(left, right)
        }
        const leftAt = firstSeenOf(ledger, left)
        const rightAt = firstSeenOf(ledger, right)
        if (leftAt === undefined && rightAt === undefined) return idOrder(left, right)
        if (leftAt === undefined) return 1
        if (rightAt === undefined) return -1
        const delta = sort === 'oldest' ? leftAt - rightAt : rightAt - leftAt
        return delta !== 0 ? delta : idOrder(left, right)
      })
      return rows
    }

    /**
     * The agent's own clock: when it was created, else when it was last seen.
     * @param agent - one agent entry.
     * @returns unix ms; 0 when neither stamp is known.
     */
    function agentStampOf(agent) {
      if (typeof agent?.createdAt === 'number' && Number.isFinite(agent.createdAt)) return agent.createdAt
      if (typeof agent?.updatedAt === 'number' && Number.isFinite(agent.updatedAt)) return agent.updatedAt
      return 0
    }

    /**
     * Compare two agents by name, then by id, so equally named rows keep a
     * stable order.
     * @returns a negative, zero or positive number.
     */
    function compareAgents(left, right) {
      const byName = String(left?.name ?? '').localeCompare(String(right?.name ?? ''))
      return byName !== 0 ? byName : String(left?.id).localeCompare(String(right?.id))
    }

    /**
     * Sort agents by the view setting, freshest first by default. Pinning the
     * Lead is the caller's job, because the pin is per column.
     * @param agents - the agents to order.
     * @param sort - `newest`, `oldest` or `name`.
     * @returns a sorted copy.
     */
    function sortAgents(agents, sort) {
      const rows = [...agents]
      if (sort === 'oldest') {
        rows.sort((left, right) => agentStampOf(left) - agentStampOf(right) || compareAgents(left, right))
        return rows
      }
      if (sort === 'name') {
        rows.sort(compareAgents)
        return rows
      }
      rows.sort((left, right) => agentStampOf(right) - agentStampOf(left) || compareAgents(left, right))
      return rows
    }

    /* ------------------------------------------------------------------ *
     * Agent grouping: a role is the first part of the agent's name, before the
     * first `-`, without trailing digits and lower-cased (`builder-b2` ->
     * builder, `round1` -> round). A single agent's prefix is not a group: only
     * a base two or more agents of the same status column share becomes a role
     * group, and every other agent joins Ungrouped. There is no preset
     * fallback: the harness default `standard` would otherwise fold every
     * default agent into one meaningless group. Custom groups come from the
     * Settings editor and match substrings of the role base, name, preset or
     * id. The Lead is pinned before every group.
     * ------------------------------------------------------------------ */

    /**
     * Bases that describe no role at all; they never form a group, even when
     * every agent carries the same one (`agent-1`, `agent-2`).
     */
    const GENERIC_ROLE_BASE = /^(agent|subagent|assistant|worker|session)$/

    /**
     * The role base of an agent: the first name part before the first `-`,
     * with trailing digits removed and lower-cased (`builder-b2` -> builder,
     * `scribe-r9` -> scribe, `round1` -> round).
     * @param agent - one agent entry.
     * @returns the lower-case base, or '' when the name carries none.
     */
    function roleBaseOf(agent) {
      const name = typeof agent?.name === 'string' ? agent.name.trim() : ''
      if (name === '') return ''
      const base = name.split('-')[0].replace(/\d+$/, '').trim().toLowerCase()
      return GENERIC_ROLE_BASE.test(base) ? '' : base
    }

    /**
     * The first custom group an agent belongs to, if any. A pattern matches
     * case-insensitively as a substring of the role, name, preset or id, and a
     * group matches at most once because a row belongs to one group.
     * @param agent - one agent entry.
     * @param groups - the parsed custom groups, in editor order.
     * @returns the matching group, or undefined.
     */
    function customGroupOf(agent, groups) {
      if (!Array.isArray(groups) || groups.length === 0) return undefined
      const values = [roleBaseOf(agent), agent?.name, agent?.preset, agent?.id]
        .filter(value => typeof value === 'string' && value !== '')
        .map(value => value.toLowerCase())
      for (const group of groups) {
        for (const pattern of group.patterns) {
          const needle = pattern.toLowerCase()
          if (needle !== '' && values.some(value => value.includes(needle))) return group
        }
      }
      return undefined
    }

    /**
     * The newest member stamp of one group; role groups are ordered by it so
     * the group holding the freshest agent comes first.
     * @param group - one group unit.
     * @returns unix ms; 0 when no member has a stamp.
     */
    function groupRecencyOf(group) {
      let newest = 0
      for (const agent of group.agents) newest = Math.max(newest, agentStampOf(agent))
      return newest
    }

    /**
     * Build the rows of one agent status column after its Lead: custom groups
     * in editor order (each with a head, even for a single member), then the
     * role groups when `autoRoleGroups` is on — only a base two or more
     * remaining agents share gets a head. Every other remaining agent collects
     * under one Ungrouped head, so a column whose bases are all unique is still
     * a single Ungrouped group rather than a flat list.
     * @param agents - the column's agents, the Lead already removed.
     * @param settings - the view settings.
     * @returns the row units; `null` when both grouping switches are off.
     */
    function planAgentGroups(agents, settings) {
      const custom = settings !== null && settings.customGroups === true
        ? parseCustomGroups(settings.customGroupsText)
        : []
      const auto = settings !== null && settings.autoRoleGroups === true
      if (custom.length === 0 && auto !== true) return null
      const units = []
      let leftover = [...agents]
      if (custom.length > 0) {
        const buckets = custom.map(group => ({ key: 'custom:' + group.name, title: group.name, agents: [] }))
        const unclaimed = []
        for (const agent of leftover) {
          const match = customGroupOf(agent, custom)
          if (match === undefined) {
            unclaimed.push(agent)
            continue
          }
          buckets[custom.indexOf(match)].agents.push(agent)
        }
        for (const bucket of buckets) {
          if (bucket.agents.length === 0) continue
          units.push({
            key: bucket.key,
            title: bucket.title,
            agents: sortAgents(bucket.agents, settings.sort),
            head: true,
          })
        }
        leftover = unclaimed
      }
      if (auto !== true) {
        if (leftover.length > 0) {
          units.push(units.length > 0
            ? {
              key: 'ungrouped',
              titleKey: 'ungrouped',
              agents: sortAgents(leftover, settings.sort),
              head: true,
            }
            : { key: 'other', agents: sortAgents(leftover, settings.sort), head: false })
        }
        return units
      }
      // A role group is a repeated base, not one agent's prefix: count the
      // bases in this column and keep only those two or more agents share. The
      // rest — a unique base or no meaningful base — joins Ungrouped.
      const counts = new Map()
      const bases = leftover.map(agent => roleBaseOf(agent))
      for (const base of bases) {
        if (base !== '') counts.set(base, (counts.get(base) ?? 0) + 1)
      }
      const byBase = new Map()
      const ungrouped = []
      for (let index = 0; index < leftover.length; index += 1) {
        const base = bases[index]
        if (base === '' || counts.get(base) < 2) {
          ungrouped.push(leftover[index])
          continue
        }
        if (!byBase.has(base)) byBase.set(base, [])
        byBase.get(base).push(leftover[index])
      }
      const groups = []
      for (const [base, members] of byBase) {
        groups.push({ key: 'role:' + base, title: base, agents: sortAgents(members, settings.sort), head: true })
      }
      groups.sort((left, right) => groupRecencyOf(right) - groupRecencyOf(left)
        || String(left.title).localeCompare(String(right.title)))
      if (ungrouped.length > 0) {
        groups.push({
          key: 'ungrouped',
          titleKey: 'ungrouped',
          agents: sortAgents(ungrouped, settings.sort),
          head: true,
        })
      }
      return units.concat(groups)
    }

    /**
     * The first custom task group a task belongs to, if any. A pattern matches
     * case-insensitively as a substring of the task subject, id, owner name or
     * any write scope; a task belongs to one group.
     * @param task - a Team task view.
     * @param groups - the parsed custom groups, in editor order.
     * @returns the matching group, or undefined.
     */
    function taskCustomGroupOf(task, groups) {
      if (!Array.isArray(groups) || groups.length === 0) return undefined
      const scopes = Array.isArray(task?.writeScopes) ? task.writeScopes : []
      const values = [task?.subject, task?.id, task?.ownerName, ...scopes]
        .filter(value => typeof value === 'string' && value !== '')
        .map(value => value.toLowerCase())
      for (const group of groups) {
        for (const pattern of group.patterns) {
          const needle = pattern.toLowerCase()
          if (needle !== '' && values.some(value => value.includes(needle))) return group
        }
      }
      return undefined
    }

    /**
     * Build the task rows of one status column after its sort: the custom
     * groups in editor order (each with a head, even for a single member), then
     * the unmatched tasks. When at least one custom group has members, the
     * unmatched tasks get their own Ungrouped head; otherwise they stay flat,
     * so an empty group is never drawn for a whole column. There is no
     * automatic role grouping for tasks.
     * @param tasks - the column's tasks, already sorted.
     * @param settings - the view settings.
     * @returns the row units; `null` when task grouping is off or empty.
     */
    function planTaskGroups(tasks, settings) {
      const custom = settings !== null && settings.taskCustomGroups === true
        ? parseCustomGroups(settings.taskCustomGroupsText)
        : []
      if (custom.length === 0) return null
      const buckets = custom.map(group => ({ key: 'custom:' + group.name, title: group.name, tasks: [] }))
      const unmatched = []
      for (const task of tasks) {
        const match = taskCustomGroupOf(task, custom)
        if (match === undefined) {
          unmatched.push(task)
          continue
        }
        buckets[custom.indexOf(match)].tasks.push(task)
      }
      const units = []
      for (const bucket of buckets) {
        if (bucket.tasks.length === 0) continue
        units.push({ key: bucket.key, title: bucket.title, tasks: bucket.tasks, head: true })
      }
      if (unmatched.length > 0) {
        units.push(units.length > 0
          ? { key: 'ungrouped', titleKey: 'ungrouped', tasks: unmatched, head: true }
          : { key: 'other', title: '', tasks: unmatched, head: false })
      }
      return units
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
      // The roster is live and may already have dropped settled jobs with
      // their owner session; the browser store keeps what it saw before.
      const storedSpans = BACKGROUND.value[agent.id]
      const rosterSpans = jobRows === undefined ? undefined : jobSpansOf(jobRows, context.now)
      const backgroundSpans = storedSpans === undefined && rosterSpans === undefined
        ? undefined
        : mergeIntervals([...(storedSpans ?? []), ...(rosterSpans ?? [])])
      return {
        tokens: tokensOf(usage),
        hasTokens: usage !== undefined,
        activeMs,
        hours: activeMs === undefined ? undefined : activeMs / 3_600_000,
        steps: rawStats === undefined ? undefined : num(rawStats.steps),
        turns: rawStats === undefined ? undefined : num(rawStats.turns),
        cost: context.costs[agent.id],
        durationMs,
        // Known for the agents whose roster is watched or remembered.
        backgroundMs: backgroundSpans === undefined ? undefined : backgroundMsOf(backgroundSpans),
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
     * The `[start, end]` intervals the given jobs occupied. A live job runs up
     * to `now`; a job that never started contributes nothing.
     * @param jobs - the agent's jobs.
     * @param now - the ticking clock.
     * @returns the intervals, unmerged.
     */
    function jobSpansOf(jobs, now) {
      const spans = []
      for (const job of jobs ?? []) {
        const startedAt = num(job?.startedAt, 0)
        if (startedAt <= 0) continue
        const end = isLiveJob(job) ? num(now, 0) : num(job?.finishedAt, 0)
        if (end > startedAt) spans.push([startedAt, end])
      }
      return spans
    }

    /**
     * Merge overlapping or touching intervals, sorted by their start.
     * @param intervals - candidate `[start, end]` pairs, in any order.
     * @returns the coalesced, sorted intervals; invalid pairs are dropped.
     */
    function mergeIntervals(intervals) {
      const spans = []
      for (const span of intervals ?? []) {
        const from = num(span?.[0], NaN)
        const to = num(span?.[1], NaN)
        if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue
        spans.push([from, to])
      }
      spans.sort((left, right) => left[0] - right[0] || left[1] - right[1])
      const merged = []
      for (const span of spans) {
        const last = merged[merged.length - 1]
        if (last !== undefined && span[0] <= last[1]) {
          last[1] = Math.max(last[1], span[1])
          continue
        }
        merged.push([span[0], span[1]])
      }
      return merged
    }

    /**
     * The wall time a set of intervals occupies, counting overlaps once.
     * @param intervals - merged or unmerged `[start, end]` pairs.
     * @returns the occupied milliseconds; 0 when nothing ran.
     */
    function backgroundMsOf(intervals) {
      let total = 0
      for (const span of mergeIntervals(intervals)) total += span[1] - span[0]
      return total
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
      return backgroundMsOf(jobSpansOf(jobs, now))
    }

    /* ------------------------------------------------------------------ *
     * Background-time history: the DSH jobs service only exposes the live
     * roster. A settled JobView stays in its owner's roster until the owner
     * session is disposed, and then it is gone, so no API can answer "how much
     * background time did this agent ever use?". The board therefore folds the
     * roster's intervals into localStorage, merged per agent, and totals the
     * union of that store and the live roster. Nothing here touches a job.
     * ------------------------------------------------------------------ */

    /** Whether a stored key is safe to copy through `Object.keys`. */
    function safeBackgroundKey(key) {
      return typeof key === 'string' && key !== '' && key !== '__proto__'
        && key !== 'constructor' && key !== 'prototype'
    }

    /**
     * Read the stored background intervals.
     * @returns `{ value, raw }`: sanitized merged intervals per agent id, and
     *   the stored text used to skip an unchanged write.
     */
    function readBackground() {
      try {
        const raw = window.localStorage.getItem(BACKGROUND_KEY)
        if (raw === null || raw === '') return { value: {}, raw: '' }
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { value: {}, raw: '' }
        const value = {}
        for (const key of Object.keys(parsed)) {
          if (!safeBackgroundKey(key) || !Array.isArray(parsed[key])) continue
          const merged = mergeIntervals(parsed[key])
          if (merged.length > 0) value[key] = merged
        }
        return { value, raw }
      } catch {
        // A blocked or corrupt store only costs the lifetime background time.
        return { value: {}, raw: '' }
      }
    }

    /** Module-wide background store: the jobs fold writes it, the metrics read it. */
    const BACKGROUND = readBackground()

    /**
     * Apply the per-agent and agent-count caps to a background store. Merged
     * intervals are kept newest-first within an agent, and agents are kept by
     * their latest interval, so a long-lived tree cannot grow the store without
     * bound.
     * @param value - the candidate store.
     * @returns the capped copy.
     */
    function capBackground(value) {
      const rows = []
      for (const key of Object.keys(value)) {
        if (!safeBackgroundKey(key)) continue
        const merged = mergeIntervals(value[key])
        if (merged.length === 0) continue
        const kept = merged.length > BACKGROUND_INTERVALS_LIMIT
          ? merged.slice(merged.length - BACKGROUND_INTERVALS_LIMIT)
          : merged
        rows.push({ key, intervals: kept, latest: kept[kept.length - 1][1] })
      }
      rows.sort((left, right) => right.latest - left.latest)
      const capped = {}
      for (const row of rows.slice(0, BACKGROUND_AGENTS_LIMIT)) capped[row.key] = row.intervals
      return capped
    }

    /**
     * Persist the background store only when it changed.
     * @param value - the capped store to write.
     * @returns whether a write happened.
     */
    function writeBackground(value) {
      const text = JSON.stringify(value)
      if (text === BACKGROUND.raw) return false
      try {
        window.localStorage.setItem(BACKGROUND_KEY, text)
        BACKGROUND.raw = text
        return true
      } catch {
        // A blocked store stops persistence for this page only.
        return false
      }
    }

    /**
     * Fold one jobs-update's roster intervals into the background store. Called
     * on every jobs change, not on the ticking clock: a live job's interval is
     * already counted up to this moment. Writes only when the merged store
     * actually moved, so an unchanged update costs nothing.
     * @param jobsByAgent - `useAgentJobs().byAgent`.
     * @param now - the moment the roster was read.
     * @returns whether the store changed.
     */
    function noteBackground(jobsByAgent, now) {
      if (jobsByAgent === null || typeof jobsByAgent !== 'object') return false
      const at = num(now, Date.now())
      const next = { ...BACKGROUND.value }
      let changed = false
      for (const agentId of Object.keys(jobsByAgent)) {
        if (!safeBackgroundKey(agentId)) continue
        const rows = jobsByAgent[agentId]
        if (!Array.isArray(rows)) continue
        const spans = jobSpansOf(rows, at)
        if (spans.length === 0) continue
        const previous = Array.isArray(next[agentId]) ? next[agentId] : []
        const merged = mergeIntervals(previous.concat(spans))
        const same = merged.length === previous.length
          && merged.every((span, index) => span[0] === previous[index][0] && span[1] === previous[index][1])
        if (same) continue
        next[agentId] = merged
        changed = true
      }
      if (!changed) return false
      const capped = capBackground(next)
      BACKGROUND.value = capped
      writeBackground(capped)
      return true
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
     * Track which agent sessions ended their last turn with an error.
     *
     * The durable truth is each session's event log, and no projection carries
     * it, so the board checks a settled agent once per mount and follows every
     * new failure through the live `api-session/error` push. State is per-mount
     * only: a fresh page re-checks, a reload loses nothing durable.
     *
     * A running agent is treated as not broken: a retry clears the old mark,
     * and only a new live failure re-adds it. The live payload has no replay,
     * so the first check per settled agent is what covers failures that
     * happened before the board was opened.
     *
     * @param services - the injected face: `subscribeSessionErrors`, `loadSessionError`.
     * @param agents - the strip rows, including the Lead, in render order.
     * @returns a map from agent id to `{ message, code?, at }`; only agents
     *   that are not running appear in it.
     */
    function useAgentErrors(services, agents) {
      const [errors, setErrors] = useState({})
      const checked = useRef(new Set())
      const mounted = useRef(true)
      const controller = useRef(undefined)
      const agentsRef = useRef(agents)
      agentsRef.current = agents
      const errorsRef = useRef(errors)
      errorsRef.current = errors
      // A settled/running flip is the retry edge the mark follows.
      const agentKey = agents.map(agent => agent.id + ':' + (agent.running === true ? '1' : '0')).join(',')

      // The live push fires for every failed turn, including sessions whose
      // card is not open and subagents the chat never activated.
      useEffect(() => {
        let off
        try {
          off = typeof services.subscribeSessionErrors === 'function'
            ? services.subscribeSessionErrors(event => {
              if (mounted.current !== true) return
              if (event === null || typeof event !== 'object') return
              if (typeof event.sessionId !== 'string' || event.sessionId === '') return
              const message = typeof event.message === 'string' ? event.message : ''
              const at = typeof event.at === 'number' && Number.isFinite(event.at) ? event.at : Date.now()
              setErrors(current => ({ ...current, [event.sessionId]: { message, at } }))
            })
            : undefined
        } catch {
          off = undefined
        }
        return () => {
          try {
            if (typeof off === 'function') off()
          } catch {
            // The Remote may already be gone with the page.
          }
        }
      }, [services])

      // A retry starts a new turn: the old failure must not survive it. The
      // live push re-adds the mark if this new turn fails again.
      useEffect(() => {
        setErrors(current => {
          let next
          for (const agent of agentsRef.current) {
            if (agent.running !== true || current[agent.id] === undefined) continue
            next = next ?? { ...current }
            delete next[agent.id]
          }
          return next ?? current
        })
      }, [agentKey])

      // One abort lifetime per mount; a changing agent list must not cancel a
      // check that is already in flight.
      useEffect(() => {
        mounted.current = true
        return () => {
          mounted.current = false
          const active = controller.current
          controller.current = undefined
          try {
            if (active !== undefined && typeof active.abort === 'function') active.abort()
          } catch {
            // Aborting an already aborted check is harmless.
          }
        }
      }, [])

      // Backfill once per settled agent, low concurrency and bounded in count.
      // `checked` is marked before the read so re-renders cannot duplicate it.
      useEffect(() => {
        if (typeof services.loadSessionError !== 'function') return
        let active = controller.current
        if (active === undefined && typeof AbortController === 'function') {
          active = new AbortController()
          controller.current = active
        }
        const signal = active?.signal
        const pending = []
        for (const agent of agentsRef.current) {
          if (checked.current.size >= SESSION_ERROR_CHECK_CAP) break
          if (agent.running === true) continue
          if (errorsRef.current[agent.id] !== undefined) continue
          if (checked.current.has(agent.id)) continue
          checked.current.add(agent.id)
          pending.push(agent.id)
        }
        if (pending.length === 0) return
        const run = async () => {
          for (const id of pending) {
            if (mounted.current !== true || signal?.aborted === true) return
            let value
            try {
              value = await services.loadSessionError(id, signal)
            } catch {
              value = undefined
            }
            if (mounted.current !== true || signal?.aborted === true) return
            if (value === null || value === undefined) continue
            setErrors(current => (current[id] === undefined ? { ...current, [id]: value } : current))
          }
        }
        run()
      }, [agentKey, services])

      return useMemo(() => {
        const visible = {}
        for (const agent of agentsRef.current) {
          if (agent.running === true) continue
          const value = errors[agent.id]
          if (value !== undefined) visible[agent.id] = value
        }
        return visible
        // The agent key is the running-state identity for this projection.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [errors, agentKey])
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
      // The card order, the agent order and the grouping all follow the view
      // settings, so the model subscribes to the same browser-local store.
      const [settings] = useViewSettings()
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

      /** The failed-last-turn marks of the strip, per mount and by agent id. */
      const agentErrors = useAgentErrors(services, stripAgents)

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

      // Settled JobViews are dropped with their owner session, so the roster
      // alone cannot total the lifetime background time: fold each roster
      // change into the browser store. Live jobs are already counted up to
      // this moment, so the ticking clock does not need this effect.
      useEffect(() => {
        noteBackground(jobs.byAgent, Date.now())
      }, [jobs.byAgent])

      /** The same rows, grouped by the status the task columns use. */
      const agentColumns = useMemo(() => {
        const groups = AGENT_COLUMNS.map(column => ({ ...column, agents: [] }))
        for (const agent of stripAgents) {
          const key = agent.running ? 'active' : agent.completed ? 'done' : 'idle'
          const group = groups.find(candidate => candidate.key === key) ?? groups[groups.length - 1]
          group.agents.push(agent)
        }
        // The Lead is pinned on top of its own column, without a group head.
        // The rest follow the role/custom grouping when a switch is on; with
        // both switches off they follow the view sort like every other list.
        return groups.map(column => {
          const leadRow = column.agents.find(agent => agent.isLead === true)
          const rest = column.agents.filter(agent => agent.isLead !== true)
          const units = planAgentGroups(rest, settings)
          if (units === null) {
            const ordered = sortAgents(rest, settings.sort)
            return {
              ...column,
              agents: leadRow === undefined ? ordered : [leadRow, ...ordered],
              groups: null,
              lead: leadRow,
            }
          }
          const rows = leadRow === undefined ? [] : [leadRow]
          for (const unit of units) rows.push(...unit.agents)
          return { ...column, agents: rows, groups: units, lead: leadRow }
        })
      }, [stripAgents, settings])

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
        let realCny
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
            if (typeof cost.realCny === 'number') realCny = num(realCny) + cost.realCny
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
              realCny: costUsd === undefined ? num(realCny) : undefined,
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
        return COLUMNS.map(column => {
          const ordered = sortTasks(grouped[column.key], settings.sort, ledger)
          return {
            ...column,
            tasks: ordered,
            // `null` keeps the flat list the board has always drawn; an array
            // adds the custom task groups and the unmatched tail.
            groups: planTaskGroups(ordered, settings),
          }
        })
      }, [tasks, ledger, settings])

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
        agentErrors,
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
