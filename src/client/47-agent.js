/* ------------------------------------------------------------------ *
 * The agent side of the board: the compact metric line on a strip row, the
 * full metric tiles, and the agent dialog that holds the detail.
 * ------------------------------------------------------------------ */

    /**
     * The compact metric line of one agent row: tasks, run duration, tokens,
     * active agent time and API money, each only when it is known.
     * @param stats - the agent's metrics.
     * @param t - translate function.
     * @returns the statistic elements.
     */
    function agentMetricLine(stats, t) {
      const items = []
      if (stats === null || stats === undefined) return items
      if (stats.taskCount > 0) {
        items.push(h(Stat, { key: 'tasks', icon: 'kanban', value: String(stats.taskCount), title: t('agentTasksHint') }))
      }
      if (stats.durationMs !== undefined) {
        items.push(h(Stat, {
          key: 'duration',
          icon: 'clock',
          value: formatSpan(stats.durationMs, t, true),
          title: t('metricDuration'),
        }))
      }
      if (stats.backgroundMs !== undefined && stats.backgroundMs > 0) {
        items.push(h(Stat, {
          key: 'background',
          icon: 'activity',
          value: formatSpan(stats.backgroundMs, t, true),
          title: t('metricBackground'),
        }))
      }
      if (stats.hasTokens) {
        items.push(h(Stat, {
          key: 'tokens',
          icon: 'hash',
          value: formatTokens(stats.tokens.total),
          title: t('metricTokens') + ': ' + formatTokens(stats.tokens.input) + ' ' + t('tokensIn') + ', '
            + formatTokens(stats.tokens.output) + ' ' + t('tokensOut'),
        }))
      }
      if (stats.hours !== undefined) {
        items.push(h(Stat, {
          key: 'hours',
          icon: 'gauge',
          value: formatHours(stats.hours) + t('unitHour'),
          title: t('metricAgentHours'),
        }))
      }
      const money = moneyOf(stats.cost)
      if (money !== undefined) {
        items.push(h(Stat, {
          key: 'cost',
          icon: 'coin',
          value: money.text,
          title: costSpendTitle(stats.cost, t) ?? t('metricCostEquivalent'),
        }))
      }
      return items
    }

    /**
     * The five metric tiles of an agent: run time, background time, tokens,
     * agent-hours and the API equivalent.
     * @param props - `stats`, `agent`, `t`.
     */
    function AgentMetrics({ stats, agent, costState, t }) {
      const value = stats ?? {}
      const tokens = value.tokens ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      const money = moneyOf(value.cost)
      const running = agent?.running === true
      const tokenSub = value.hasTokens
        ? t('tokensIn') + ' ' + formatTokens(tokens.input) + ' · ' + t('tokensOut') + ' ' + formatTokens(tokens.output)
          + ' · ' + t('tokensCache') + ' ' + formatTokens(tokens.cacheRead + tokens.cacheWrite)
        : t('agentNoData')
      const durationSub = value.durationMs === undefined
        ? t('agentNoData')
        : (running && agent?.startedAt !== undefined
          ? t('agentSince') + ' ' + formatStamp(agent.startedAt)
          : (agent?.isLead === true ? t('agentNoData') : t('agentSettled')))
      const hoursSub = value.steps === undefined
        ? undefined
        : String(value.steps) + ' ' + t('stepsLabel') + ' · ' + String(value.turns ?? 0) + ' ' + t('turnsLabel')
      const costSub = money === undefined
        ? (costState === 'missing' ? t('costMissing') : t('agentNoData'))
        : (() => {
          const spend = costSpendTitle(value.cost, t)
          const plan = costOnPlan(value.cost) ? t('costPlanNote') + ' · ' : ''
          return plan + (spend === undefined ? t('metricCostEquivalent') : spend)
        })()

      return h('div', { className: 'tk-metrics' },
        h(Metric, {
          icon: 'clock',
          label: running ? t('metricElapsed') : t('metricDuration'),
          value: value.durationMs === undefined ? '—' : formatSpan(value.durationMs, t),
          sub: durationSub,
        }),
        h(Metric, {
          icon: 'activity',
          label: t('metricBackground'),
          value: value.backgroundMs === undefined ? '—' : formatSpan(value.backgroundMs, t),
          sub: value.backgroundMs === undefined ? t('agentNoData') : undefined,
        }),
        h(Metric, {
          icon: 'hash',
          label: t('metricTokens'),
          value: value.hasTokens ? formatTokens(tokens.input + tokens.output) : '—',
          sub: tokenSub,
        }),
        h(Metric, {
          icon: 'gauge',
          label: t('metricAgentHours'),
          value: value.hours === undefined ? '—' : formatHours(value.hours) + ' ' + t('unitHour'),
          sub: hoursSub,
        }),
        h(Metric, {
          icon: 'coin',
          label: t('metricCostEquivalent'),
          value: money === undefined ? '—' : money.text,
          sub: costSub,
        }))
    }

    /**
     * One background job of the agent dialog. Read-only by design: a status
     * dot, the kind, the command line, its elapsed time and the live progress
     * or terminal reason. Output and the kill switch stay in the Jobs popover.
     * @param props - `job`, `now`, `t`.
     */
    function JobRow({ job, now, t }) {
      const elapsed = jobElapsed(job, now)
      const progress = typeof job.progress === 'string' && job.progress !== '' ? job.progress : undefined
      const detail = typeof job.detail === 'string' && job.detail !== '' ? job.detail : undefined
      const note = progress ?? detail
      const label = typeof job.label === 'string' ? job.label : ''
      return h('li', {
        className: 'tk-job',
        'data-job-id': String(job.id),
        'data-job-status': String(job.status),
      },
      h(StateDot, { state: jobStateOf(job), size: 9 }),
      h('div', { className: 'tk-job-main' },
        h('div', { className: 'tk-job-head' },
          h('span', { className: 'tk-job-kind' }, String(job.kind ?? '')),
          h('span', { className: 'tk-job-label', title: label }, label),
          h('span', { className: 'tk-head-spacer' }),
          elapsed === undefined ? null : h('span', { className: 'tk-job-time' }, formatSpan(elapsed, t))),
        note === undefined ? null : h('span', { className: 'tk-job-note' }, note)))
    }

    /**
     * The agent dialog: what this agent did, the tasks it owns and the
     * background jobs it is running — the two lists fold and scroll on their
     * own, and the tasks come first.
     * @param props - `agent`, `stats`, `jobs`, `error`, `tasks`, `whoById`, `now`,
     *   `t`, `tAgent`, `onOpenAgent`, `onOpenTask`, `onClose`.
     */
    function AgentDialog({
      agent, stats, jobs, error = undefined, tasks, whoById, now, costState, t, tAgent, onOpenAgent, onOpenTask, onClose,
    }) {
      useEffect(() => {
        const onKey = event => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => { window.removeEventListener('keydown', onKey) }
      }, [onClose])

      // The dialog scale is its own view preference; only the panel zooms.
      const [viewSettings] = useViewSettings()

      // The two lists can grow; each folds away on its own, and the dialog is
      // short-lived, so the choice lives with the open card.
      const [jobsOpen, setJobsOpen] = useState(true)
      const [tasksOpen, setTasksOpen] = useState(true)

      const dot = agent.running ? 'ongoing' : agent.completed ? 'done' : 'idle'
      const activityLabel = activityOf(agent, tAgent)
      const mode = modeOf(agent, tAgent)
      const parent = agent.parentId === undefined ? undefined : whoById[agent.parentId]
      const sessionId = String(agent.id).replace(/^session-/, '')
      // The row marks a failed last turn; the dialog repeats the text when the
      // failure is still the agent's current state.
      const errorText = error === null || error === undefined
        ? undefined
        : (typeof error.message === 'string' && error.message !== '' ? error.message : t('errorTurnFailed'))

      // The agent's actions sit in the header's right corner, left of the
      // close control, exactly like the task dialog's; the body below stays
      // facts and lists only.
      const headActions = h('span', { className: 'tk-insp-actions' },
        h('button', {
          type: 'button',
          className: 'tk-icon-btn',
          title: t('agentOpenHint'),
          'aria-label': t('agentOpenHint'),
          onClick: () => { onOpenAgent(agent.id, 'main') },
        }, h(Icon, { name: 'chevron-right', size: 13 })),
        agent.isLead === true ? null : h('button', {
          type: 'button',
          className: 'tk-icon-btn',
          title: t('agentOpenAsideHint'),
          'aria-label': t('agentOpenAsideHint'),
          onClick: () => { onOpenAgent(agent.id, 'aside') },
        }, h(Icon, { name: 'panel-right', size: 13 })))

      const head = h('div', { className: 'tk-insp-head' },
        h('div', { className: 'tk-insp-heading' },
          h('h2', { className: 'tk-insp-title' }, agent.name),
          h('div', { className: 'tk-insp-meta' },
            h(StateDot, { state: dot, size: 10 }),
            h(Chip, { tone: agent.running ? undefined : agent.completed ? 'ok' : undefined }, activityLabel),
            agent.isLead === true
              ? h(Chip, { tone: 'info', icon: 'users' }, t('leadLabel'))
              : (mode === undefined ? null : h(Chip, { icon: 'users' }, mode)))),
        h('span', { className: 'tk-head-spacer' }),
        headActions,
        h('button', {
          type: 'button', className: 'tk-icon-btn', title: t('close'), 'aria-label': t('close'), onClick: onClose,
        }, h(Icon, { name: 'x', size: 14 })))

      const model = agent.model
      const modelValue = model === undefined
        ? undefined
        : h('span', null,
          h('span', { className: 'tk-mono' }, model.model),
          model.provider === undefined ? null : h('span', { className: 'tk-note' }, ' · ' + model.provider))
      const effortValue = model?.effort === undefined ? undefined : capitalize(model.effort)

      const facts = h('dl', { className: 'tk-kv' },
        KeyRow({ name: 'session', label: t('agentSession'), children: h('span', { className: 'tk-mono' }, sessionId) }),
        KeyRow({ name: 'created', label: t('agentCreated'), children: formatStamp(agent.createdAt) }),
        KeyRow({ name: 'activity', label: t('agentLastActivity'), children: formatStamp(agent.updatedAt ?? agent.startedAt) }),
        errorText === undefined
          ? null
          : KeyRow({
            name: 'error',
            label: t('sessionError'),
            children: h('span', { className: 'tk-error-note' }, errorText),
          }),
        agent.model === undefined ? null : KeyRow({ name: 'model', label: t('agentModel'), children: modelValue }),
        effortValue === undefined ? null : KeyRow({ name: 'effort', label: t('agentEffort'), children: effortValue }),
        agent.preset === undefined ? null : KeyRow({
          name: 'preset',
          label: t('agentPresetLabel'),
          children: h('span', { className: 'tk-mono' }, agent.preset),
        }),
        agent.isLead === true ? null : KeyRow({ name: 'level', label: t('agentLevel'), children: String(agent.depth) }))

      // A running agent or the Lead always gets the block, even with nothing in
      // it: "no background processes" answers "why is it still running?". A
      // settled agent only gets it when it has history to show.
      const jobItems = orderJobs(jobs)
      const showJobs = jobs !== undefined
        && (jobItems.length > 0 || agent.running === true || agent.isLead === true)
      const jobsBlock = showJobs === false
        ? null
        : (jobItems.length === 0
          ? h(Section, { title: t('jobsHeading'), icon: 'activity' },
            h('span', { className: 'tk-note' }, t('jobsEmpty')))
          : h(FoldSection, {
            title: t('jobsHeading'),
            icon: 'activity',
            note: String(jobItems.length),
            target: 'agent-jobs',
            expanded: jobsOpen,
            scroll: false,
            label: (jobsOpen ? t('foldSection') : t('unfoldSection')) + ' · ' + t('jobsHeading'),
            onToggle: () => { setJobsOpen(value => !value) },
          }, h('ul', {
            className: 'tk-jobs',
            tabIndex: 0,
            role: 'group',
            'aria-label': t('jobsHeading'),
          }, jobItems.map(job => h(JobRow, { key: job.id, job, now, t })))))

      const taskList = h('ul', {
        className: 'tk-list',
        tabIndex: 0,
        role: 'group',
        'aria-label': t('agentTasksHeading'),
      }, tasks.map(task => h('li', { key: task.id },
        h('button', {
          type: 'button',
          className: 'tk-task-link',
          onClick: () => { onOpenTask(task.id) },
        },
        h(StateDot, { state: stateOfTask(task), size: 9 }),
        h('span', { className: 'tk-card-id' }, '#' + String(task.id).replace(/^task-/, '')),
        h('span', null, String(task.subject ?? task.id))))))

      const tasksBlock = tasks.length === 0
        ? h(Section, { title: t('agentTasksHeading'), icon: 'kanban' },
          h('span', { className: 'tk-note' }, t('agentNoTasks')))
        : h(FoldSection, {
          title: t('agentTasksHeading'),
          icon: 'kanban',
          note: String(tasks.length),
          target: 'agent-tasks',
          expanded: tasksOpen,
          scroll: false,
          label: (tasksOpen ? t('foldSection') : t('unfoldSection')) + ' · ' + t('agentTasksHeading'),
          onToggle: () => { setTasksOpen(value => !value) },
        }, taskList)

      return h(Portal, null,
        h('div', {
          className: 'tk-backdrop',
          onMouseDown: event => { if (event.target === event.currentTarget) onClose() },
        },
        h('div', {
          className: 'tk-insp',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('agentHeading'),
          'data-agent-dialog': agent.id,
          style: { zoom: viewSettings.dialogScale },
        },
        head,
        h('div', { className: 'tk-insp-body' },
          h(Section, { title: t('statsHeading'), icon: 'gauge', note: agent.running ? t('statsNoteActive') : undefined },
            h(AgentMetrics, { stats, agent, costState, t })),
          h(Section, { title: t('stateLabel'), icon: 'layers' }, facts),
          tasksBlock,
          jobsBlock))))
    }
