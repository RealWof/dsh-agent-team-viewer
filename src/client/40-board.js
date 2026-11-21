/* ------------------------------------------------------------------ *
 * The board tab: header, the agent strip, the columns, and the cards.
 *
 * The split follows the data: a card carries what belongs to a TASK (status,
 * dependencies, who works on it), while tokens, agent hours, money and run
 * duration belong to the AGENT and live in the strip and its dialog.
 * ------------------------------------------------------------------ */

    /** Narrow-width breakpoints for the column count. */
    const COLUMNS_WIDE = 620
    const COLUMNS_MID = 372

    /** Stand-in face so a missing injection degrades instead of throwing. */
    const NO_SERVICES = {
      faceOf: () => undefined,
      refreshProjections: () => {},
      loadCosts: async () => null,
      pluginLimit: async () => undefined,
      listState: () => undefined,
      subscribeList: () => () => {},
      jobsSnapshot: () => undefined,
      watchJobs: () => undefined,
      subscribeJobs: () => () => {},
      openAgent: () => {},
      openFileLink: () => {},
      agentLabel: (key, fallback) => fallback,
    }

    /**
     * Agent ids that owned at least one background job while this page has
     * been open. The set survives remounts of the tab, so a chip that appeared
     * once stays behind as a settled count instead of vanishing when the
     * process finishes. Page state only — nothing here reaches localStorage.
     */
    const JOBS_SEEN = new Set()

    /**
     * Pick the money figure to show. The board shows the API-equivalent value
     * of the tokens (list prices), not the wallet spend: on a subscription the
     * wallet spend is zero while the tokens still have an equivalent cost.
     * @param cost - a normalized cost record.
     * @returns `{ text, currency, equivalentUsd, realUsd }` or undefined.
     */
    function moneyOf(cost) {
      if (cost === null || cost === undefined) return undefined
      const equivalent = typeof cost.equivalentUsd === 'number' ? cost.equivalentUsd : undefined
      const real = typeof cost.realUsd === 'number' ? cost.realUsd : undefined
      if (equivalent !== undefined) {
        return { text: formatMoney(equivalent, '$'), currency: 'USD', equivalentUsd: equivalent, realUsd: real }
      }
      if (typeof cost.equivalentCny === 'number') {
        return {
          text: formatMoney(cost.equivalentCny, '¥'),
          currency: 'CNY',
          equivalentUsd: undefined,
          realUsd: typeof cost.realCny === 'number' ? cost.realCny : undefined,
        }
      }
      if (real !== undefined) return { text: formatMoney(real, '$'), currency: 'USD', equivalentUsd: undefined, realUsd: real }
      return undefined
    }

    /**
     * Whether the real spend is below the plan-inclusive equivalent, which is
     * what a subscription looks like: the tokens cost more at list price than
     * the wallet paid. `normalizeCost` keeps both currencies, so the CNY record
     * is judged on its own pair.
     * @param cost - a normalized cost record.
     * @returns whether the plan note applies.
     */
    function costOnPlan(cost) {
      if (cost === null || typeof cost !== 'object') return false
      if (typeof cost.equivalentUsd === 'number' && typeof cost.realUsd === 'number') {
        return cost.realUsd < cost.equivalentUsd
      }
      if (typeof cost.equivalentCny === 'number' && typeof cost.realCny === 'number') {
        return cost.realCny < cost.equivalentCny
      }
      return false
    }

    /**
     * The native title of every cost figure: the money the wallet paid beside
     * the plan-inclusive equivalent of the same tokens. The symbol follows the
     * record's currency — `realUsd` carries the CNY amount when `moneyOf` picked
     * the CNY equivalent — and a missing figure reads as an em dash.
     * @param cost - a normalized cost record.
     * @param t - translate function.
     * @returns the tooltip text, or undefined when there is no figure at all.
     */
    function costSpendTitle(cost, t) {
      const money = moneyOf(cost)
      if (money === undefined) return undefined
      const symbol = money.currency === 'CNY' ? '¥' : '$'
      const real = typeof money.realUsd === 'number' ? formatMoney(money.realUsd, symbol) : '—'
      return t('metricCostApiSpend') + ': ' + real + ' · ' + t('metricCostEquivalent') + ': ' + money.text
    }

    /**
     * The agent's activity word, reusing the Subagents menu's own copy.
     * @param agent - one agent entry.
     * @param tAgent - translator bound to the shipped `subagent` namespace.
     * @returns the localized word.
     */
    function activityOf(agent, tAgent) {
      if (agent.running) return tAgent('activity.running', 'running')
      if (agent.completed) return tAgent('activity.completed', 'completed')
      return tAgent('activity.inactive', 'not running')
    }

    /**
     * The agent's mode word, reusing the Subagents menu's own copy.
     * @param agent - one agent entry.
     * @param tAgent - translator bound to the shipped `subagent` namespace.
     * @returns the localized mode, or undefined for a plain continuable agent.
     */
    function modeOf(agent, tAgent) {
      if (agent.mode === 'lead') return undefined
      if (agent.mode === 'one-shot') return tAgent('mode.oneShot', 'one-shot')
      if (agent.mode === 'external') return tAgent('mode.external', 'external')
      if (agent.mode === 'continuable') return tAgent('mode.continuable', 'continuable')
      return tAgent('mode.unknown', 'unknown mode')
    }

    /**
     * The status column of a task, in the product's own state vocabulary.
     * @param task - a Team task view.
     * @returns `idle`, `warning`, `ongoing` or `done`.
     */
    function stateOfTask(task) {
      const blocked = task.status === 'pending' && task.ready === false
      return blocked ? 'warning' : (STATUS_STATES[task.status] ?? 'idle')
    }

    /**
     * The owner line of a card. A subagent owner is a link to that agent's
     * session; the Lead or an unknown owner stays plain text. Hovering either
     * variant reports the owner so the agents strip can light the agent row.
     * @param props - `task`, `whoById`, `t`, `onOpenAgent`, `onHoverOwner`.
     */
    function OwnerLine({ task, whoById, t, onOpenAgent, onHoverOwner = undefined }) {
      const ownerId = typeof task.ownerId === 'string' && task.ownerId !== '' ? task.ownerId : undefined
      const who = ownerId === undefined ? undefined : whoById[ownerId]
      const label = who !== undefined
        ? who.name
        : (typeof task.ownerName === 'string' && task.ownerName !== '' ? task.ownerName : t('statusUnowned'))
      const hoverIn = () => {
        if (typeof onHoverOwner === 'function' && ownerId !== undefined) onHoverOwner(ownerId)
      }
      const hoverOut = () => {
        if (typeof onHoverOwner === 'function') onHoverOwner(null)
      }
      if (who !== undefined && who.isLead !== true) {
        return h('button', {
          type: 'button',
          className: 'tk-owner-link',
          title: t('agentOpenHint'),
          'data-agent-id': who.id,
          onMouseEnter: hoverIn,
          onMouseLeave: hoverOut,
          onClick: event => {
            event.stopPropagation()
            onOpenAgent(who.id, 'main')
          },
        }, h(Icon, { name: 'users', size: 10 }), h('span', null, label))
      }
      return h('span', {
        className: 'tk-card-owner',
        title: who?.isLead === true ? t('agentHeading') : undefined,
        onMouseEnter: hoverIn,
        onMouseLeave: hoverOut,
      },
      who?.isLead === true ? h(Icon, { name: 'users', size: 10 }) : null,
      h('span', null, label))
    }

    /**
     * The task card. A button so keyboard users reach the inspector too. It
     * carries task facts only: the agent's numbers are in the strip.
     * @param props - `task`, `flipGroup`, `whoById`, `t`, `onOpen`, `onOpenAgent`, `onHoverOwner`.
     */
    function TaskCard({ task, flipGroup, whoById, t, onOpen, onOpenAgent, onHoverOwner = undefined }) {
      const state = stateOfTask(task)
      const broken = Array.isArray(task.blockedBy) ? task.blockedBy.length : 0
      const scopes = Array.isArray(task.writeScopes) ? task.writeScopes.length : 0
      return h('button', {
        type: 'button',
        className: 'tk-card',
        'data-status': task.status,
        'data-state': state,
        'data-blocked': state === 'warning' ? 'true' : 'false',
        'data-task-id': task.id,
        'data-flip-id': 'task:' + task.id,
        'data-flip-group': flipGroup,
        onClick: () => { onOpen(task.id) },
        'aria-label': task.subject,
      },
        h('span', { className: 'tk-card-head' },
          h(StateDot, { state }),
          h('span', { className: 'tk-card-title' }, String(task.subject ?? task.id))),
        h('span', { className: 'tk-card-meta' },
          h('span', { className: 'tk-card-id' }, '#' + String(task.id).replace(/^task-/, '')),
          h(OwnerLine, { task, whoById, t, onOpenAgent, onHoverOwner }),
          broken > 0 ? h(Chip, { tone: 'warn', icon: 'link' }, String(broken)) : null,
          scopes > 0 ? h(Chip, { icon: 'pen' }, String(scopes)) : null))
    }

    /**
     * The visible title of one group unit. A custom or role group carries its
     * data name; the built-in leftover group carries a dictionary key.
     * @param unit - one group unit.
     * @param t - translate function.
     * @returns the title text.
     */
    function groupUnitTitle(unit, t) {
      if (unit.titleKey === 'ungrouped') return t('ungrouped')
      return unit.titleKey === undefined ? unit.title : t(unit.titleKey)
    }

    /**
     * One status group's header. The whole row is the disclosure button, so a
     * click anywhere on it folds the pile; the count sits in the row and
     * therefore stays visible while the group is folded. Only a status column's
     * own header carries a state dot: the outer head repeats the column colour,
     * while a nested head (a role or custom group inside it) stays chevron,
     * title and count and is marked with `data-subgroup`. Callers pass `state`
     * for an outer head and leave it undefined for a nested one.
     * @param props - `groupId`, optional `state`, `title`, `count`, `expanded`,
     *   `label`, `onToggle`, and `subgroup` for a nested head.
     */
    function GroupHead({ groupId, state, title, count, expanded, label, onToggle, subgroup = false }) {
      return h('button', {
        type: 'button',
        className: 'tk-col-head tk-col-fold',
        'data-fold': 'group',
        'data-target': groupId,
        'data-subgroup': subgroup === true ? 'true' : undefined,
        'aria-expanded': expanded === true ? 'true' : 'false',
        'aria-label': label,
        title: label,
        onClick: () => { onToggle(groupId, count) },
      },
      h(Icon, { name: 'chevron-down', size: 11, className: 'tk-chevron' }),
      state === undefined ? null : h(StateDot, { state, size: 9 }),
      h('span', { className: 'tk-col-title' }, title),
      h('span', { className: 'tk-col-count' }, String(count)))
    }

    /**
     * The "show all / show less" control of one over-long group. It is a
     * single button, so its DOM node — and the keyboard focus on it — survives
     * the switch between the two labels. The callbacks receive the board id,
     * so the expansion stays scoped to the board that owns the group.
     * @param props - `boardId`, `groupId`, `remaining`, `expanded`, `t`,
     *   `onExpand`, `onCollapse`.
     */
    function OverflowToggle({ boardId, groupId, remaining, expanded, t, onExpand, onCollapse }) {
      const label = expanded ? t('showLess') : t('showMore') + ' +' + String(remaining)
      return h('button', {
        type: 'button',
        className: expanded ? 'tk-more tk-more-less' : 'tk-more',
        'data-group': groupId,
        'data-board': boardId,
        'data-remaining': String(expanded ? 0 : remaining),
        'aria-expanded': expanded === true ? 'true' : 'false',
        'aria-label': label,
        title: label,
        onClick: () => {
          if (expanded === true) onCollapse(boardId, groupId)
          else onExpand(boardId, groupId)
        },
      },
      h('span', { className: 'tk-more-label' }, expanded ? t('showLess') : t('showMore')),
      expanded === true ? null : h('span', { className: 'tk-more-count' }, '+' + String(remaining)))
    }

    /**
     * The items of one expanded status group: capped at VISIBLE_LIMIT until
     * the reader asks for the rest of the pile. The cap is view state only,
     * while the header count always comes from the data. A pile expanded past
     * the cap scrolls inside its own column, so the panel does not grow with
     * it; the show-less control stays below the scroll box. The board id scopes
     * the page-session expansion, so two open boards keep their own choices.
     * @param props - `boardId`, `groupId`, `count`, `t`, `renderEmpty`,
     *   `renderItem`, `onExpand`, `onCollapse`.
     */
    function GroupBody({ boardId, groupId, count, t, renderEmpty, renderItem, onExpand, onCollapse }) {
      const expanded = isGroupExpanded(boardId, groupId)
      const capped = count > VISIBLE_LIMIT && !expanded
      const shown = capped ? VISIBLE_LIMIT : count
      const items = []
      for (let index = 0; index < shown; index += 1) items.push(renderItem(index))
      const scroll = expanded && count > VISIBLE_LIMIT
      return h('div', { className: 'tk-col-body', 'data-group-body': groupId },
        count === 0
          ? renderEmpty()
          : (scroll ? h('div', { className: 'tk-col-items', 'data-scroll': 'true' }, items) : items),
        count <= VISIBLE_LIMIT
          ? null
          : h(OverflowToggle, {
            boardId,
            groupId,
            remaining: count - shown,
            expanded,
            t,
            onExpand,
            onCollapse,
          }))
    }

    /** One column with its header and cards. */
    function BoardColumn({ boardId, column, whoById, t, onOpen, onOpenAgent, onHoverOwner = undefined, onToggleGroup, onExpandGroup, onCollapseGroup }) {
      const count = column.tasks.length
      const groupId = groupIdOf('tasks', column.key)
      const collapsed = isGroupCollapsed(boardId, groupId, count)
      const title = t('col' + column.key.charAt(0).toUpperCase() + column.key.slice(1))
      const renderEmpty = () => h('span', { className: 'tk-col-empty' }, t('emptyColumn'))
      const renderCard = task => h(TaskCard, {
        key: task.id, task, flipGroup: column.key, whoById, t, onOpen, onOpenAgent, onHoverOwner,
      })
      /** One custom task group, or the flat unmatched tail after the groups. */
      const renderUnit = unit => {
        if (unit.head !== true) {
          return h(React.Fragment, { key: unit.key }, unit.tasks.map(renderCard))
        }
        const subgroupId = groupIdOf('tasks', column.key + ':' + unit.key)
        const folded = isGroupCollapsed(boardId, subgroupId, unit.tasks.length)
        const title = groupUnitTitle(unit, t)
        const label = (folded ? t('unfoldGroup') : t('foldGroup')) + ' · ' + title
        return h(React.Fragment, { key: unit.key },
          h(GroupHead, {
            groupId: subgroupId,
            title,
            count: unit.tasks.length,
            expanded: !folded,
            label,
            onToggle: (targetId, targetCount) => { onToggleGroup(boardId, targetId, targetCount) },
            subgroup: true,
          }),
          folded
            ? null
            : h(GroupBody, {
              boardId,
              groupId: subgroupId,
              count: unit.tasks.length,
              t,
              renderEmpty,
              renderItem: index => renderCard(unit.tasks[index]),
              onExpand: onExpandGroup,
              onCollapse: onCollapseGroup,
            }))
      }
      const units = Array.isArray(column.groups) ? column.groups : null
      return h('section', { className: 'tk-col', 'data-column': column.key },
        h(GroupHead, {
          groupId,
          state: column.state,
          title,
          count,
          expanded: !collapsed,
          label: (collapsed ? t('unfoldGroup') : t('foldGroup')) + ' · ' + title,
          onToggle: (targetId, targetCount) => { onToggleGroup(boardId, targetId, targetCount) },
        }),
        collapsed
          ? null
          : (units === null
            ? h(GroupBody, {
              boardId,
              groupId,
              count,
              t,
              renderEmpty,
              renderItem: index => renderCard(column.tasks[index]),
              onExpand: onExpandGroup,
              onCollapse: onCollapseGroup,
            })
            : h('div', { className: 'tk-col-body', 'data-group-body': groupId },
              count === 0 ? renderEmpty() : units.map(renderUnit))))
    }

    /**
     * One agent of the strip: identity on the first line, and on the second its
     * read-only background-jobs chip plus the session metrics. The whole row is
     * a clickable surface that opens the agent dialog, exactly like a task card
     * opens the task dialog; the name and the two icon buttons keep their own
     * actions and stop the click from reaching the row. `showAgentModel` adds
     * an opt-in ellipsized model line on the bottom-right; `showModelProvider`
     * decides whether its visible text starts with the provider or only the
     * model — the tooltip carries the full `provider · model · effort` either
     * way.
     * @param props - `agent`, `stats`, `jobs`, `now`, `t`, `tAgent`, `flipGroup`,
     *   `onOpenAgent`, `onInspect`, `hovered` when a card owner is hovered,
     *   `showAgentModel` and `showModelProvider` from the view settings.
     */
    function AgentRow({ agent, stats, jobs, now, t, tAgent, flipGroup, onOpenAgent, onInspect, hovered = false, showAgentModel = false, showModelProvider = false }) {
      const dot = agent.running ? 'ongoing' : agent.completed ? 'done' : 'idle'
      const mode = modeOf(agent, tAgent)
      const selection = agent.model
      const partsOf = fields => (selection === undefined
        ? []
        : fields.map(field => selection[field]).filter(part => typeof part === 'string' && part !== ''))
      // The tooltip always names the provider; the visible line drops it unless
      // the reader asked for it. An unknown selection adds no line at all.
      const modelTitle = partsOf(['provider', 'model', 'effort']).join(' · ')
      const modelLine = partsOf(showModelProvider === true
        ? ['provider', 'model', 'effort']
        : ['model', 'effort']).join(' · ')
      const modelVisible = showAgentModel === true && modelLine !== ''
      const items = agentMetricLine(stats, t)
      const rosterRead = Array.isArray(jobs)
      const agentJobs = rosterRead ? jobs : []
      // Once an agent owned a job, keep the chip as a settled count even after
      // the last process finishes; the set lives for the page, not the mount.
      if (rosterRead && agentJobs.length > 0) JOBS_SEEN.add(agent.id)
      const showJobs = rosterRead && JOBS_SEEN.has(agent.id)
      const live = liveJobsOf(agentJobs)
      const longest = live.length === 0 ? undefined : jobElapsed(live[0], now)
      // The metric already adds the remembered history to the live roster;
      // the chip's tooltip shows the same lifetime total.
      const backgroundMs = stats !== undefined && typeof stats.backgroundMs === 'number'
        ? stats.backgroundMs
        : backgroundSpanOf(agentJobs, now)
      // The chip counts every background job the agent owns, a settled zero
      // included; the live color and the tooltip tell how many of them still
      // hold it and how much wall time the background took.
      const jobsLabel = agentJobs.length === 0
        ? t('jobsHeading') + ': 0'
        : (live.length === 0
          ? t('jobsHeading') + ': ' + String(agentJobs.length)
          : t('jobsRunningCount') + ': ' + String(live.length)
            + (longest === undefined ? '' : ' · ' + t('jobsLongest') + ' ' + formatSpan(longest, t)))
          + ' · ' + t('metricBackground') + ' ' + formatSpan(backgroundMs, t)
      return h('div', {
        className: 'tk-agent-row',
        role: 'button',
        tabIndex: 0,
        'aria-label': agent.name,
        'data-activity': agent.activity,
        'data-agent-id': agent.id,
        'data-lead': agent.isLead === true ? 'true' : 'false',
        'data-hover': hovered === true ? 'true' : 'false',
        'data-flip-id': 'agent:' + agent.id,
        'data-flip-group': flipGroup,
        onClick: () => { onInspect(agent.id) },
        onKeyDown: event => {
          if (event === null || typeof event !== 'object') return
          if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return
          // Space would otherwise scroll the panel under the focused row.
          if (event.key !== 'Enter' && typeof event.preventDefault === 'function') event.preventDefault()
          onInspect(agent.id)
        },
      },
      h('div', { className: 'tk-agent-main' },
        h(StateDot, { state: dot, size: 9 }),
        h('button', {
          type: 'button',
          className: 'tk-agent-name',
          title: activityOf(agent, tAgent) + ' — ' + t('agentOpenHint'),
          onClick: event => {
            stopEvent(event)
            onOpenAgent(agent.id, 'main')
          },
        }, agent.name),
        // The word beside the name is the DSH subagent mode, not a status: its
        // tooltip names the mode and explains what it means.
        mode === undefined ? null : h('span', {
          className: 'tk-agent-mode',
          title: t('agentMode') + ': ' + mode + ' — ' + t('agentModeHint'),
        }, mode),
        h('span', { className: 'tk-head-spacer' }),
        h('button', {
          type: 'button',
          className: 'tk-icon-btn tk-agent-jump',
          title: t('agentOpenAsideHint'),
          'aria-label': t('agentOpenAsideHint'),
          onClick: event => {
            stopEvent(event)
            onOpenAgent(agent.id, 'aside')
          },
        }, h(Icon, { name: 'panel-right', size: 11 }))),
      showJobs !== true && items.length === 0
        ? null
        : h('div', { className: 'tk-agent-meta' },
          // The metrics keep their order and their place; the chip closes the
          // line, so appearing or vanishing never shifts a metric icon.
          items,
          showJobs === true
            ? h('span', {
              key: 'jobs',
              className: 'tk-chip tk-agent-jobs',
              'data-live': live.length > 0 ? 'true' : 'false',
              title: jobsLabel,
              'aria-label': jobsLabel,
            }, h(Icon, { name: 'clock', size: 10 }), String(agentJobs.length))
            : null),
      modelVisible ? h('span', { className: 'tk-agent-model', title: modelTitle }, modelLine) : null)
    }

    /** The sort choices the header menu offers, in display order. */
    const SORT_OPTIONS = [
      { value: 'newest', labelKey: 'setSortNewest' },
      { value: 'oldest', labelKey: 'setSortOldest' },
      { value: 'name', labelKey: 'setSortName' },
    ]

    /**
     * The grouping flags each section header's switch turned off, so switching
     * it back on restores exactly what the reader had. Page-lifetime, like the
     * fold state; a fresh page starts from the shipped fallbacks.
     */
    const GROUPING_MEMORY = { agents: null, tasks: null }

    /**
     * The view-settings patch that flips one section's grouping switch.
     *
     * Switching off remembers the flags it replaced; switching on restores
     * them, or the shipped fallback (`autoRoleGroups: true`,
     * `customGroups: false` for agents, `taskCustomGroups: false` for tasks)
     * when the reader has not switched the section off in this page.
     * @param section - `agents` or `tasks`.
     * @param settings - the current view settings.
     * @returns the patch to write through the shared store.
     */
    function groupingPatch(section, settings) {
      if (section === 'agents') {
        const on = settings.autoRoleGroups === true || settings.customGroups === true
        if (on) {
          GROUPING_MEMORY.agents = {
            autoRoleGroups: settings.autoRoleGroups === true,
            customGroups: settings.customGroups === true,
          }
          return { autoRoleGroups: false, customGroups: false }
        }
        const remembered = GROUPING_MEMORY.agents
        GROUPING_MEMORY.agents = null
        return remembered === null
          ? { autoRoleGroups: true, customGroups: false }
          : { autoRoleGroups: remembered.autoRoleGroups, customGroups: remembered.customGroups }
      }
      if (settings.taskCustomGroups === true) {
        GROUPING_MEMORY.tasks = true
        return { taskCustomGroups: false }
      }
      const remembered = GROUPING_MEMORY.tasks
      GROUPING_MEMORY.tasks = null
      return { taskCustomGroups: remembered === true }
    }

    /**
     * The compact grouping switch a section header carries next to its sort
     * control. It writes the same view settings the Settings page edits, so a
     * checkbox and a header switch always agree.
     * @param props - `on`, the visible `label`, the state `hint`, and `onToggle`.
     */
    function GroupingToggle({ on, label, hint, onToggle }) {
      return h('button', {
        type: 'button',
        className: 'tk-group-toggle',
        'data-on': on === true ? 'true' : 'false',
        'aria-pressed': on === true ? 'true' : 'false',
        'aria-label': hint,
        title: hint,
        onClick: () => { onToggle() },
      }, h(Icon, { name: 'layers', size: 10 }), h('span', null, label))
    }

    /**
     * The compact sort menu both section headers carry. It writes the same
     * `sort` view setting the Settings page edits, so the board reorders in
     * place without leaving the tab. A native `<select>` renders its popup in
     * the platform's own (light) surface over the dark panel, so the menu is
     * drawn from the product's theme tokens instead.
     * @param props - `sort`, `onChange` and `t`.
     */
    function SortSelect({ sort, onChange, t }) {
      const [open, setOpen] = useState(false)
      const [active, setActive] = useState(() => Math.max(0, SORT_OPTIONS.findIndex(option => option.value === sort)))
      const rootRef = useRef(null)
      const buttonRef = useRef(null)
      const label = t('setSorting')
      const current = SORT_OPTIONS.find(option => option.value === sort) ?? SORT_OPTIONS[0]

      // Close on an outside pointer press or Escape while the menu is open.
      useEffect(() => {
        if (!open) return undefined
        const onPointer = event => {
          const root = rootRef.current
          if (root !== null && typeof root.contains === 'function'
            && typeof event.target === 'object' && root.contains(event.target)) return
          setOpen(false)
        }
        const onKey = event => {
          if (event !== null && event.key === 'Escape') setOpen(false)
        }
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('pointerdown', onPointer)
        }
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          window.addEventListener('keydown', onKey)
        }
        return () => {
          if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
            document.removeEventListener('pointerdown', onPointer)
          }
          if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('keydown', onKey)
          }
        }
      }, [open])

      const choose = value => {
        setOpen(false)
        if (typeof onChange === 'function') onChange(value)
      }
      const move = step => {
        const from = open ? active : Math.max(0, SORT_OPTIONS.findIndex(option => option.value === sort))
        setActive((from + step + SORT_OPTIONS.length) % SORT_OPTIONS.length)
        if (!open) setOpen(true)
      }
      const closeMenu = () => {
        setOpen(false)
        const node = buttonRef.current
        if (node !== null && node !== undefined && typeof node.focus === 'function') node.focus()
      }
      const onKeyDown = event => {
        if (event === null || typeof event !== 'object') return
        if (event.key === 'Escape' && open) {
          stopEvent(event)
          closeMenu()
          return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          stopEvent(event)
          move(event.key === 'ArrowDown' ? 1 : -1)
          return
        }
        if (open && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')) {
          stopEvent(event)
          choose(SORT_OPTIONS[active].value)
        }
      }

      return h('div', {
        className: 'tk-sort',
        'data-sort': 'true',
        ref: rootRef,
        onKeyDown,
      },
      h('button', {
        type: 'button',
        className: 'tk-sort-btn',
        ref: buttonRef,
        title: label,
        'aria-label': label,
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : 'false',
        onClick: event => {
          stopEvent(event)
          if (!open) setActive(Math.max(0, SORT_OPTIONS.findIndex(option => option.value === sort)))
          setOpen(value => !value)
        },
      },
      h('span', { className: 'tk-sort-label' }, t(current.labelKey)),
      h(Icon, { name: 'chevron-down', size: 10, className: 'tk-sort-chevron' })),
      open
        ? h('div', { className: 'tk-sort-menu', role: 'menu', 'aria-label': label },
          SORT_OPTIONS.map((option, index) => h('button', {
            key: option.value,
            type: 'button',
            role: 'menuitemradio',
            className: 'tk-sort-option',
            'data-value': option.value,
            'data-active': index === active ? 'true' : 'false',
            'aria-checked': option.value === sort ? 'true' : 'false',
            onFocus: () => { setActive(index) },
            onClick: event => {
              stopEvent(event)
              choose(option.value)
            },
          },
          h(Icon, { name: 'check', size: 10, className: 'tk-sort-check' }),
          h('span', null, t(option.labelKey)))))
        : null)
    }

    /**
     * The whole tree's totals — what all agents of this session burned together.
     * @param props - `totals`, `t`.
     */
    function TotalsRow({ totals, t }) {
      if (totals === undefined) return null
      const items = []
      // The same order the agent rows and the dialog use: run time, tokens,
      // agent-hours, money.
      if (totals.durationMs !== undefined) {
        items.push(h(Chip, { key: 'duration', icon: 'clock', title: t('metricDuration') }, formatSpan(totals.durationMs, t)))
      }
      if (totals.backgroundMs !== undefined) {
        items.push(h(Chip, {
          key: 'background',
          icon: 'activity',
          title: t('metricBackground'),
        }, formatSpan(totals.backgroundMs, t)))
      }
      if (totals.tokens !== undefined) {
        items.push(h(Chip, { key: 'tokens', icon: 'hash', title: t('metricTokens') }, formatTokens(totals.tokens)))
      }
      if (totals.hours !== undefined) {
        items.push(h(Chip, { key: 'hours', icon: 'gauge', title: t('metricAgentHours') }, formatHours(totals.hours) + t('unitHour')))
      }
      if (totals.cost !== undefined) {
        const costRecord = {
          equivalentUsd: totals.cost.usd,
          equivalentCny: totals.cost.cny,
          realUsd: totals.cost.realUsd,
          realCny: totals.cost.realCny,
        }
        const spendTitle = costSpendTitle(costRecord, t)
        const planPart = costOnPlan(costRecord)
        items.push(h(Chip, {
          key: 'cost',
          icon: 'coin',
          title: spendTitle === undefined
            ? t('agentsTotalCost')
            : spendTitle + (planPart ? ' · ' + t('costPlanNote') : ''),
        }, totals.cost.text))
      }
      if (items.length === 0) return null
      return h('div', { className: 'tk-totals', 'data-agent-team-viewer': 'totals' },
        h('span', { className: 'tk-totals-label' }, t('agentsTotal')),
        items)
    }

    /**
     * The agents of the tree, broken down by the same statuses the task board
     * uses — the Lead first inside its own group, then every subagent. When a
     * grouping switch is on, each status column renders custom and role groups
     * with their own foldable headers; otherwise it stays a flat list.
     * @param props - `columns`, `agentStats`, `jobsByAgent`, `now`, `columnCount`,
     *   `costState`, `totals`, `sort`, `t`, `tAgent`, `onOpenAgent`, `onInspect`,
     *   `onSortChange`, `hoverOwnerId`, `onToggleSection`, `onToggleGroup`,
     *   `onExpandGroup`, `onCollapseGroup`, `showAgentModel`, `showModelProvider`,
     *   `agentGroupingOn` and `onToggleAgentGrouping`.
     */
    function AgentsStrip({
      boardId, columns, agentStats, jobsByAgent, now, columnCount, costState, totals, sort, onSortChange, t, tAgent,
      onOpenAgent, onInspect, hoverOwnerId = undefined, onToggleSection, onToggleGroup, onExpandGroup, onCollapseGroup,
      showAgentModel = false, showModelProvider = false, agentGroupingOn = false, onToggleAgentGrouping = undefined,
    }) {
      const total = columns.reduce((sum, column) => sum + column.agents.length, 0)
      const subagents = Math.max(0, total - 1)
      const countLabel = plural(t, subagents, ['agentsOne', 'agentsFew', 'agentsMany'])
      const seenCols = columnCount >= 4 ? 3 : columnCount
      const collapsed = isSectionCollapsed(boardId, 'agents')
      const renderRow = (agent, flipGroup) => h(AgentRow, {
        key: agent.id,
        agent,
        stats: agentStats[agent.id],
        jobs: jobsByAgent[agent.id],
        now,
        t,
        tAgent,
        flipGroup,
        onOpenAgent,
        onInspect,
        hovered: hoverOwnerId !== undefined && hoverOwnerId === agent.id,
        showAgentModel,
        showModelProvider,
      })
      /** Whether a nested group is a head, and the body it reveals when open. */
      const renderUnit = (column, unit) => {
        if (unit.head !== true) {
          return h(React.Fragment, { key: unit.key }, unit.agents.map(agent => renderRow(agent, column.key)))
        }
        const subgroupId = groupIdOf('agents', column.key + ':' + unit.key)
        const folded = isGroupCollapsed(boardId, subgroupId, unit.agents.length)
        const title = groupUnitTitle(unit, t)
        const label = (folded ? t('unfoldGroup') : t('foldGroup')) + ' · ' + title
        return h(React.Fragment, { key: unit.key },
          h(GroupHead, {
            groupId: subgroupId,
            title,
            count: unit.agents.length,
            expanded: !folded,
            label,
            onToggle: (targetId, targetCount) => { onToggleGroup(boardId, targetId, targetCount) },
            subgroup: true,
          }),
          folded
            ? null
            : h(GroupBody, {
              boardId,
              groupId: subgroupId,
              count: unit.agents.length,
              t,
              renderEmpty: () => h('span', { className: 'tk-col-empty' }, t('emptyColumn')),
              renderItem: index => renderRow(unit.agents[index], column.key),
              onExpand: onExpandGroup,
              onCollapse: onCollapseGroup,
            }))
      }
      return h('section', { className: 'tk-agents', 'data-agent-team-viewer': 'agents' },
        h('div', { className: 'tk-agents-head' },
          h(FoldToggle, {
            expanded: !collapsed,
            label: (collapsed ? t('unfoldSection') : t('foldSection')) + ' · ' + t('agentsHeading'),
            target: 'agents',
            onClick: target => { onToggleSection(boardId, target) },
          }),
          h(Icon, { name: 'users', size: 11 }),
          h('h3', { className: 'tk-sec-title' }, t('agentsHeading')),
          h('span', { className: 'tk-sec-note' }, String(subagents) + ' ' + countLabel),
          h('span', { className: 'tk-head-spacer' }),
          costState === 'missing'
            ? h('span', { className: 'tk-note', title: t('costMissingHint') }, t('costMissing'))
            : null,
          h(GroupingToggle, {
            on: agentGroupingOn,
            label: t('groupingToggle'),
            hint: (agentGroupingOn ? t('groupingOn') : t('groupingOff')) + ' · ' + t('groupingToggleHint'),
            onToggle: onToggleAgentGrouping,
          }),
          h(SortSelect, { sort, onChange: onSortChange, t })),
        collapsed
          ? null
          : h(React.Fragment, null,
            h(TotalsRow, { totals, t }),
            h('div', { className: 'tk-agent-board', 'data-cols': String(seenCols) },
              columns.map(column => {
                const groupId = groupIdOf('agents', column.key)
                const count = column.agents.length
                const folded = isGroupCollapsed(boardId, groupId, count)
                const title = t(column.labelKey)
                return h('section', {
                  key: column.key,
                  className: 'tk-col',
                  'data-agent-column': column.key,
                },
                h(GroupHead, {
                  groupId,
                  state: column.state,
                  title,
                  count,
                  expanded: !folded,
                  label: (folded ? t('unfoldGroup') : t('foldGroup')) + ' · ' + title,
                  onToggle: (targetId, targetCount) => { onToggleGroup(boardId, targetId, targetCount) },
                }),
                folded
                  ? null
                  : (column.groups === null
                    ? h(GroupBody, {
                      boardId,
                      groupId,
                      count,
                      t,
                      renderEmpty: () => h('span', { className: 'tk-col-empty' }, t('emptyColumn')),
                      renderItem: index => renderRow(column.agents[index], column.key),
                      onExpand: onExpandGroup,
                      onCollapse: onCollapseGroup,
                    })
                    : h('div', { className: 'tk-col-body', 'data-group-body': groupId },
                      count === 0
                        ? h('span', { className: 'tk-col-empty' }, t('emptyColumn'))
                        : [
                          column.lead === undefined ? null : renderRow(column.lead, column.key),
                          ...column.groups.map(unit => renderUnit(column, unit)),
                        ])))
              }))))
    }

    /**
     * The tab chip's text. The product captures `title()` when the tab opens,
     * so this seat is what keeps the chip in the current language. It falls
     * back to the captured title when the seat supplies no translator.
     * @param props - `t` from the seat's locale registration plus `useTabInfo`.
     */
    function BoardTitle(props) {
      const useTabInfo = typeof props.useTabInfo === 'function' ? props.useTabInfo : null
      const info = useTabInfo === null ? undefined : useTabInfo()
      const t = typeof props.t === 'function' ? props.t : null
      if (t !== null) return t('tabTitle')
      const captured = info?.tab?.title
      return typeof captured === 'string' && captured !== '' ? captured : null
    }

    /**
     * The right-sidebar tab body.
     * @param props - framework props plus the injected face (`services`).
     */
    function BoardTab(props) {
      const { t } = props
      const services = props.services ?? NO_SERVICES
      // Panel scale is a view preference; the panel root below is the only
      // element it touches — the header action and the dialogs are elsewhere.
      const [settings, updateSettings] = useViewSettings()
      const model = useTeamModel(props, services)
      const [selected, setSelected] = useState(null)
      const [inspectedAgent, setInspectedAgent] = useState(null)
      // Reports are read from the owning agent's chat, not from the task
      // record; they are cached per owner so reopening a task is instant.
      const [reports, setReports] = useState({})
      const reportRequests = useRef(new Set())
      // The owner line of a card lights its agent row while the pointer is on
      // it, so "who works on this" and "that row" read as one thing.
      const [hoverOwner, setHoverOwner] = useState(null)
      const [columnCount, setColumnCount] = useState(4)
      // Bumped after a local fold change: the fold state lives outside React so
      // it survives remounts of the tab, exactly like the observation ledger.
      const [, bumpView] = useState(0)
      const rootRef = useRef(null)
      /** Card and row rectangles of the previous render, keyed by FLIP id. */
      const flipRects = useRef(new Map())

      useEffect(() => {
        const node = rootRef.current
        if (node === null || typeof window.ResizeObserver !== 'function') return undefined
        const observer = new window.ResizeObserver(entries => {
          const width = entries[0]?.contentRect?.width ?? 0
          setColumnCount(width < COLUMNS_MID ? 1 : width < COLUMNS_WIDE ? 2 : 4)
        })
        observer.observe(node)
        return () => { observer.disconnect() }
      }, [])

      // FLIP: a card that moved to another column or group glides from where
      // it was to where it is. A card that only shifted because a sibling
      // resized did not change its logical place, so it stays put — animating
      // every layout shift made the cards twitch. The pass only reads the DOM;
      // no state. It no-ops when the harness has no real DOM, when the setting
      // is off or when the reader asked for reduced motion.
      useEffect(() => {
        const root = rootRef.current
        if (root === null || typeof root.querySelectorAll !== 'function') return
        if (typeof document === 'undefined' || typeof Element === 'undefined') return
        const nodes = root.querySelectorAll('[data-flip-id]')
        const previous = flipRects.current
        const next = new Map()
        const moves = []
        for (const node of nodes) {
          const id = typeof node.getAttribute === 'function' ? node.getAttribute('data-flip-id') : null
          if (id === null || id === '') continue
          const group = typeof node.getAttribute === 'function'
            ? (node.getAttribute('data-flip-group') ?? '')
            : ''
          const before = previous.get(id)
          const changedGroup = before !== undefined && before.group !== group
          // A transform feeds back into getBoundingClientRect; cancel the old
          // animation before measuring so a repeat pass reads the layout.
          if (changedGroup && typeof node.getAnimations === 'function') {
            for (const animation of node.getAnimations()) {
              try {
                animation.cancel()
              } catch {
                // An animation that already finished is nothing to cancel.
              }
            }
          }
          const box = node.getBoundingClientRect()
          next.set(id, { left: box.left, top: box.top, group })
          if (!changedGroup) continue
          const dx = before.left - box.left
          const dy = before.top - box.top
          if (dx === 0 && dy === 0) continue
          moves.push({ node, dx, dy })
        }
        // Replace the snapshot every pass, even when nothing animates: the next
        // move must be measured against the layout the reader just saw.
        flipRects.current = next
        if (moves.length === 0) return
        if (settings.animateCards !== true || !(settings.animationMs > 0)) return
        if (typeof window.matchMedia === 'function') {
          let reduced = false
          try {
            reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
          } catch {
            reduced = false
          }
          if (reduced) return
        }
        for (const move of moves) {
          if (typeof move.node.animate !== 'function') continue
          try {
            move.node.animate([
              { transform: 'translate(' + String(move.dx) + 'px,' + String(move.dy) + 'px)' },
              { transform: 'none' },
            ], { duration: settings.animationMs, easing: 'cubic-bezier(0.2,0,0,1)' })
          } catch {
            // An element that cannot start an animation lands in its new place.
          }
        }
      })

      /** How many items each status group holds, keyed by the stable group id. */
      const groupCounts = useMemo(() => {
        const counts = {}
        for (const column of model.agentColumns) {
          counts[groupIdOf('agents', column.key)] = column.agents.length
          // A nested role/custom group folds itself like a status group does.
          for (const unit of column.groups ?? []) {
            if (unit.head === true) {
              counts[groupIdOf('agents', column.key + ':' + unit.key)] = unit.agents.length
            }
          }
        }
        for (const column of model.columns) {
          counts[groupIdOf('tasks', column.key)] = column.tasks.length
          // A nested custom task group folds itself like a status group does.
          for (const unit of column.groups ?? []) {
            if (unit.head === true) {
              counts[groupIdOf('tasks', column.key + ':' + unit.key)] = unit.tasks.length
            }
          }
        }
        return counts
      }, [model.agentColumns, model.columns])

      // The one write the observation makes: a pile past the threshold folds
      // itself the first time it is seen that big. The headers already render
      // folded because the resolver reads the count, so nothing jumps here.
      useEffect(() => {
        noteAutoCollapse(model.rootId, groupCounts)
      }, [groupCounts, model.rootId])

      /** Re-render after a fold change; nothing here touches the board data. */
      const refreshView = useCallback(() => {
        bumpView(version => version + 1)
      }, [])
      // Each handler takes the board id explicitly, so the agents strip and the
      // task columns can reuse one handler without sharing the fold state.
      const foldSection = useCallback((boardId, section) => {
        toggleSection(boardId, section)
        refreshView()
      }, [refreshView])
      const foldGroup = useCallback((boardId, groupId, count) => {
        toggleGroup(boardId, groupId, count)
        refreshView()
      }, [refreshView])
      const showAllItems = useCallback((boardId, groupId) => {
        expandGroup(boardId, groupId)
        refreshView()
      }, [refreshView])
      const showCappedItems = useCallback((boardId, groupId) => {
        collapseGroup(boardId, groupId)
        refreshView()
      }, [refreshView])

      const selectedTask = selected === null
        ? undefined
        : model.tasks.find(task => task.id === selected)

      /** The owner whose final answer the dialog's Report tab reads. */
      const reportOwnerId = selectedTask !== undefined
        && typeof selectedTask.ownerId === 'string' && selectedTask.ownerId !== ''
        ? selectedTask.ownerId
        : undefined

      // One read per owner per mount: the answer cannot change while the
      // dialog is open in a way the viewer could follow cheaply, and the read
      // is a one-shot snapshot rather than a subscription.
      useEffect(() => {
        if (reportOwnerId === undefined) return
        if (reportRequests.current.has(reportOwnerId)) return
        reportRequests.current.add(reportOwnerId)
        if (typeof services.loadAgentReport !== 'function') {
          setReports(current => ({ ...current, [reportOwnerId]: { state: 'empty' } }))
          return
        }
        setReports(current => (current[reportOwnerId] === undefined
          ? { ...current, [reportOwnerId]: { state: 'loading' } }
          : current))
        Promise.resolve()
          .then(() => services.loadAgentReport(reportOwnerId))
          .then(text => {
            const ready = typeof text === 'string' && text.trim() !== ''
            setReports(current => ({
              ...current,
              [reportOwnerId]: ready ? { state: 'ready', text } : { state: 'empty' },
            }))
          })
          .catch(() => {
            setReports(current => ({ ...current, [reportOwnerId]: { state: 'empty' } }))
          })
      }, [reportOwnerId, services])

      const countLabel = plural(t, model.tasks.length, ['tasksOne', 'tasksFew', 'tasksMany'])
      // Navigating away must not leave a dialog hanging over the new view.
      const openAgent = (agentId, target) => {
        setSelected(null)
        setInspectedAgent(null)
        services.openAgent(agentId, target)
      }
      const tAgent = (key, fallback) => services.agentLabel(key, fallback)
      const inspectAgent = agentId => { setInspectedAgent(agentId) }

      const inspected = inspectedAgent === null ? undefined : model.whoById[inspectedAgent]
      const agentTasks = inspected === undefined
        ? []
        : model.tasks.filter(task => task.ownerId === inspected.id)
      const tasksCollapsed = isSectionCollapsed(model.rootId, 'tasks')

      return h('div', { className: 'tk-root', ref: rootRef, style: { zoom: settings.uiScale } },
        h(Styles, null),
        h('div', { className: 'tk-scroll' },
          h('div', { className: 'tk-head' },
            h(Icon, { name: 'kanban', size: 15 }),
            h('h2', { className: 'tk-head-title' }, t('tabTitle')),
            h('span', { className: 'tk-head-spacer' }),
            h('span', { className: 'tk-readonly', title: t('readOnlyHint') },
              h(Icon, { name: 'lock', size: 9 }), t('readOnly')),
            h('button', {
              type: 'button',
              className: 'tk-icon-btn',
              title: t('refresh'),
              'aria-label': t('refresh'),
              onClick: () => { model.refresh() },
            }, h(Icon, { name: 'refresh', size: 13 }))),

          // Team mode gates new task mutations, not the board data: retained
          // tasks stay readable, and the notice says why they cannot change.
          model.hasTeam && model.failure === undefined && model.enabled !== true && model.tasks.length > 0
            ? h('div', { className: 'tk-warn', 'data-team-off': 'true' },
              h(Icon, { name: 'alert', size: 11 }),
              h('span', null, t('teamOffNote')))
            : null,

          model.agents.length > 0
            ? h(AgentsStrip, {
              boardId: model.rootId,
              columns: model.agentColumns,
              agentStats: model.agentStats,
              jobsByAgent: model.jobs.byAgent,
              now: model.now,
              columnCount,
              costState: model.costState,
              totals: model.totals,
              sort: settings.sort,
              onSortChange: value => { updateSettings({ sort: value }) },
              t,
              tAgent,
              onOpenAgent: openAgent,
              onInspect: inspectAgent,
              hoverOwnerId: hoverOwner ?? undefined,
              onToggleSection: foldSection,
              onToggleGroup: foldGroup,
              onExpandGroup: showAllItems,
              onCollapseGroup: showCappedItems,
              showAgentModel: settings.showAgentModel === true,
              showModelProvider: settings.showModelProvider === true,
              agentGroupingOn: settings.autoRoleGroups === true || settings.customGroups === true,
              onToggleAgentGrouping: () => { updateSettings(groupingPatch('agents', settings)) },
            })
            : null,

          model.agents.length > 0 ? h('div', { className: 'tk-divider' }) : null,

          h('div', { className: 'tk-section-head' },
            h(FoldToggle, {
              expanded: !tasksCollapsed,
              label: (tasksCollapsed ? t('unfoldSection') : t('foldSection')) + ' · ' + t('tasksHeading'),
              target: 'tasks',
              onClick: target => { foldSection(model.rootId, target) },
            }),
            h(Icon, { name: 'kanban', size: 11 }),
            h('h3', { className: 'tk-sec-title' }, t('tasksHeading')),
            h('span', { className: 'tk-sec-note' }, String(model.tasks.length) + ' ' + countLabel),
            h('span', { className: 'tk-head-spacer' }),
            h(GroupingToggle, {
              on: settings.taskCustomGroups === true,
              label: t('groupingToggle'),
              hint: (settings.taskCustomGroups === true ? t('groupingOn') : t('groupingOff'))
                + ' · ' + t('groupingToggleHint'),
              onToggle: () => { updateSettings(groupingPatch('tasks', settings)) },
            }),
            h(SortSelect, {
              sort: settings.sort,
              onChange: value => { updateSettings({ sort: value }) },
              t,
            })),

          tasksCollapsed
            ? null
            : boardBody(model, t, columnCount, setSelected, openAgent, tAgent, {
              onToggleGroup: foldGroup,
              onExpandGroup: showAllItems,
              onCollapseGroup: showCappedItems,
              onHoverOwner: setHoverOwner,
            }),

          model.tasks.length > 0
            ? h('div', { className: 'tk-foot' },
              h(Icon, { name: 'eye', size: 10 }),
              h('span', null, t('footObserved') + ': ' + String(observedCount(model)) + ' · ' + t('footUpdated') + ' ' + formatClock(model.now)),
              model.costState === 'missing' ? h('span', null, '· ' + t('costMissing')) : null)
            : null),

        selectedTask === undefined
          ? null
          : h(TaskInspector, {
            task: selectedTask,
            timeline: model.timelines[selectedTask.id],
            agent: selectedTask.ownerId === undefined ? undefined : model.whoById[selectedTask.ownerId],
            stats: selectedTask.ownerId === undefined ? undefined : model.agentStats[selectedTask.ownerId],
            report: reportOwnerId === undefined
              ? undefined
              : (reports[reportOwnerId] ?? { state: 'loading' }),
            t,
            tAgent,
            costState: model.costState,
            onOpenAgent: openAgent,
            onOpenFile: path => { services.openFileLink(model.rootId, path) },
            onInspect: inspectAgent,
            onClose: () => { setSelected(null) },
          }),

        inspected === undefined
          ? null
          : h(AgentDialog, {
            agent: inspected,
            stats: model.agentStats[inspected.id],
            jobs: model.jobs.byAgent[inspected.id],
            tasks: agentTasks,
            costState: model.costState,
            whoById: model.whoById,
            now: model.now,
            t,
            tAgent,
            onOpenAgent: openAgent,
            onOpenTask: taskId => { setInspectedAgent(null); setSelected(taskId) },
            onClose: () => { setInspectedAgent(null) },
          }))
    }

    /**
     * How many visible tasks the ledger has a start or finish stamp for.
     * @param model - the team model.
     * @returns the count.
     */
    function observedCount(model) {
      let count = 0
      for (const task of model.tasks) {
        const timeline = model.timelines[task.id]
        if (timeline !== undefined && (timeline.startedAt !== undefined || timeline.completedAt !== undefined)) count += 1
      }
      return count
    }

    /**
     * The board or the empty state that replaces it.
     * @param model - the team model.
     * @param t - translate function.
     * @param columnCount - resolved column count.
     * @param setSelected - opens the task inspector.
     * @param openAgent - navigates to an agent.
     * @param tAgent - translator for the subagent namespace.
     * @param fold - the fold handlers plus the owner-hover reporter:
     *   `onToggleGroup`, `onExpandGroup`, `onCollapseGroup`, `onHoverOwner`.
     * @returns the body element.
     */
    function boardBody(model, t, columnCount, setSelected, openAgent, tAgent, fold) {
      if (model.failure !== undefined) {
        return h('div', { className: 'tk-error' }, h(Icon, { name: 'alert', size: 12 }), h('span', null, model.failure))
      }
      if (!model.hasTeam) {
        return h(Empty, { icon: 'users', title: t('noTeamData'), note: t('noTeamDataNote') })
      }
      if (model.tasks.length === 0) {
        // Team mode only gates task mutations; with no tasks there is nothing
        // to show, so the Team-off notice is the whole body.
        return model.enabled
          ? h(Empty, { icon: 'kanban', title: t('emptyBoard'), note: t('emptyBoardNote') })
          : h(Empty, { icon: 'users', title: t('teamOff'), note: t('teamOffNote') })
      }
      return h('div', { className: 'tk-board', 'data-cols': String(columnCount) },
        model.columns.map(column => h(BoardColumn, {
          key: column.key,
          boardId: model.rootId,
          column,
          whoById: model.whoById,
          t,
          tAgent,
          onOpen: setSelected,
          onOpenAgent: openAgent,
          onHoverOwner: fold.onHoverOwner,
          onToggleGroup: fold.onToggleGroup,
          onExpandGroup: fold.onExpandGroup,
          onCollapseGroup: fold.onCollapseGroup,
        })))
    }

    /**
     * The header action that opens the board tab. It carries the stylesheet
     * too: the button is visible while the board tab is not.
     * @param props - framework props plus the injected face (`open`).
     */
    function HeaderBoardAction(props) {
      const { t, open } = props
      return h(React.Fragment, null,
        h(Styles, null),
        h('button', {
          type: 'button',
          className: 'tk-icon-btn',
          'data-agent-team-viewer': 'action',
          title: t('actionHint'),
          'aria-label': t('actionLabel'),
          onClick: () => { open() },
        }, h(Icon, { name: 'kanban', size: 14 })))
    }
