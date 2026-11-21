/* ------------------------------------------------------------------ *
 * The task inspector: the task's own facts and timeline, and the agent that
 * worked on it. The agent's numbers stay labelled as the agent's.
 * ------------------------------------------------------------------ */

    /** `react-dom` from the module table, when it exposes portals. */
    const REACT_DOM = (() => {
      try {
        const module = require('react-dom')
        return module !== null && module !== undefined && typeof module.createPortal === 'function' ? module : null
      } catch {
        return null
      }
    })()

    /**
     * Render into the document body when portals exist, else in place. The
     * dialog must leave the docked pane's clipping context.
     * @param props - the children to place.
     */
    function Portal({ children }) {
      if (REACT_DOM === null) return children
      return REACT_DOM.createPortal(children, document.body)
    }

    /**
     * One definition-list row. `name` keys the pair so several rows can sit in
     * one list without colliding.
     * @param props - `name`, `label` and the value content.
     */
    function KeyRow({ name, label, children }) {
      return h(React.Fragment, { key: name },
        h('dt', { key: 'k' }, label),
        h('dd', { key: 'v' }, children))
    }

    /**
     * Whether a write scope names a folder rather than a file. A trailing slash
     * is the one convention the task record offers, in either separator.
     * @param path - the scope string.
     * @returns whether the workspace should open the Files page for it.
     */
    function isFolderScope(path) {
      return typeof path === 'string' && (path.endsWith('/') || path.endsWith('\\'))
    }

    /**
     * The task dialog.
     * @param props - `task`, `timeline`, `agent`, `stats`, `t`, `tAgent`,
     *   `costState`, `onOpenAgent`, `onOpenFile`, `onInspect`, `onClose`.
     */
    function TaskInspector({ task, timeline, agent, stats, t, tAgent = undefined, costState, report = undefined, onOpenAgent = undefined, onOpenFile = undefined, onInspect = undefined, onClose }) {
      useEffect(() => {
        const onKey = event => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => { window.removeEventListener('keydown', onKey) }
      }, [onClose])

      // The dialog's two pages: the task's own facts (the default) and the
      // owning subagent's final answer. The report is read by the board and
      // handed in; this component only picks which page to draw.
      // The dialog scale is its own view preference: only the panel zooms, the
      // backdrop keeps its size and the dialog stays centred.
      const [viewSettings] = useViewSettings()
      const [activeTab, setActiveTab] = useState('description')

      const state = stateOfTask(task)
      const timelineValue = timeline ?? {}
      const startedAt = timelineValue.startedAt
      const completedAt = timelineValue.completedAt
      const running = task.status === 'in_progress'
      const statusTone = state === 'done' ? 'ok' : state === 'warning' ? 'warn' : undefined
      const statusLabel = task.status === 'completed'
        ? t('statusCompleted')
        : task.status === 'in_progress'
          ? t('statusActive')
          : t('statusPending')
      const owner = typeof task.ownerName === 'string' && task.ownerName !== ''
        ? task.ownerName
        : (typeof task.ownerId === 'string' && task.ownerId !== '' ? task.ownerId : t('statusUnowned'))
      const agentName = agent === undefined ? owner : agent.name
      const scopes = Array.isArray(task.writeScopes) ? task.writeScopes : []
      const deps = Array.isArray(task.blockedBy) ? task.blockedBy : []
      const warnings = Array.isArray(task.writeScopeWarnings) ? task.writeScopeWarnings : []
      const description = typeof task.description === 'string' ? task.description.trim() : ''
      const translateAgent = (key, fallback) => (typeof tAgent === 'function' ? tAgent(key, fallback) : fallback)
      const activityText = agent === undefined ? undefined : activityOf(agent, translateAgent)
      const modeText = agent === undefined ? undefined : modeOf(agent, translateAgent)

      const head = h('div', { className: 'tk-insp-head' },
        h('div', { className: 'tk-insp-heading' },
          h('h2', { className: 'tk-insp-title' }, String(task.subject ?? task.id)),
          h('div', { className: 'tk-insp-meta' },
            h(StateDot, { state, size: 10 }),
            h(Chip, { tone: statusTone }, statusLabel),
            h('span', { className: 'tk-card-id' }, '#' + String(task.id).replace(/^task-/, '')),
            agent === undefined
              ? h(Chip, { icon: 'users' }, owner)
              : h(Chip, { icon: 'users' }, agentName),
            deps.length > 0 ? h(Chip, { tone: 'warn', icon: 'link' }, String(deps.length)) : null)),
        h('span', { className: 'tk-head-spacer' }),
        h('button', {
          type: 'button', className: 'tk-icon-btn', title: t('close'), 'aria-label': t('close'), onClick: onClose,
        }, h(Icon, { name: 'x', size: 14 })))

      const descriptionBlock = h(Section, { title: t('description'), icon: 'pen' },
        h('p', { className: 'tk-body-text', 'data-empty': description === '' ? 'true' : 'false' },
          description === '' ? t('noDescription') : description))

      const timelineBlock = h(Section, {
        title: t('taskTimeline'),
        icon: 'clock',
        note: running ? t('statsNoteActive') : undefined,
      },
      h('dl', { className: 'tk-kv' },
        KeyRow({
          name: 'elapsed',
          label: running ? t('metricElapsed') : t('metricDuration'),
          children: timelineValue.elapsedMs === undefined ? '—' : formatSpan(timelineValue.elapsedMs, t),
        }),
        KeyRow({
          name: 'since',
          label: t('observedSince'),
          children: startedAt === undefined ? t('observedUnknown') : formatStamp(startedAt),
        }),
        completedAt === undefined
          ? null
          : KeyRow({ name: 'until', label: t('observedUntil'), children: formatStamp(completedAt) }),
        KeyRow({
          name: 'revision',
          label: t('revisionLabel'),
          children: h('span', { className: 'tk-mono' }, String(task.revision ?? '—')),
        })))

      const agentLine = agent === undefined ? [] : agentMetricLine(stats, t)
      const agentBlock = task.ownerId === undefined
        ? null
        : h(Section, { title: t('agentHeading'), icon: 'users', note: t('agentMetricsNote') },
          h('dl', { className: 'tk-kv' },
            KeyRow({ name: 'agentName', label: t('agentLabel'), children: agentName }),
            activityText === undefined ? null : KeyRow({ name: 'agentActivity', label: t('stateLabel'), children: activityText }),
            modeText === undefined ? null : KeyRow({ name: 'agentMode', label: t('agentMode'), children: modeText })),
          agentLine.length === 0 ? null : h('div', { className: 'tk-stats' }, agentLine),
          onOpenAgent === undefined ? null : h('div', { className: 'tk-actions' },
            h('button', {
              type: 'button',
              className: 'tk-btn',
              title: t('agentOpenHint'),
              onClick: () => { onOpenAgent(task.ownerId, 'main') },
            }, h(Icon, { name: 'chevron-right', size: 11 }), t('agentOpen')),
            agent === undefined ? null : h('button', {
              type: 'button',
              className: 'tk-btn',
              title: t('agentOpenAsideHint'),
              onClick: () => { onOpenAgent(task.ownerId, 'aside') },
            }, h(Icon, { name: 'panel-right', size: 11 }), t('agentOpenAside')),
            onInspect === undefined || agent === undefined ? null : h('button', {
              type: 'button',
              className: 'tk-btn',
              onClick: () => { onInspect(task.ownerId) },
            }, h(Icon, { name: 'gauge', size: 11 }), t('agentDetails'))))

      const depsBlock = h(Section, {
        title: t('dependencies'), icon: 'link', note: deps.length === 0 ? t('noDependencies') : undefined,
      },
      deps.length === 0 ? null : h('ul', { className: 'tk-list' }, deps.map(id => h('li', { key: id },
        h(Icon, { name: 'chevron-right', size: 10 }),
        h('span', { className: 'tk-mono' }, '#' + String(id).replace(/^task-/, '')),
        h('span', { className: 'tk-note' }, task.ready === false ? t('blockedBadge') : t('readyBadge'))))))

      const warningBlock = warnings.length === 0 ? null : h('ul', { className: 'tk-list' }, warnings.map(warning =>
        h('li', { key: warning },
          h('span', { className: 'tk-warn' }, h(Icon, { name: 'alert', size: 10 }), h('span', null, warning)))))

      const scopesBlock = h(Section, {
        title: t('writeScopes'), icon: 'folder', note: scopes.length === 0 ? t('noWriteScopes') : undefined,
      },
      scopes.length === 0 ? null : h('ul', { className: 'tk-list' }, scopes.map(scope => {
        const folder = isFolderScope(scope)
        const hint = folder ? t('openFolderHint') : t('openFileHint')
        return h('li', { key: scope },
          h('button', {
            type: 'button',
            className: 'tk-file-link',
            'data-scope': scope,
            title: hint,
            'aria-label': hint + ': ' + scope,
            onClick: () => { if (typeof onOpenFile === 'function') onOpenFile(scope) },
          },
          h(Icon, { name: folder ? 'folder' : 'pen', size: 10 }),
          h('span', { className: 'tk-mono' }, scope)))
      })),
      warningBlock)

      const ownerId = typeof task.ownerId === 'string' && task.ownerId !== '' ? task.ownerId : undefined
      const reportState = report !== null && typeof report === 'object' && typeof report.state === 'string'
        ? report.state
        : 'empty'
      const reportText = report !== null && typeof report === 'object' && typeof report.text === 'string'
        ? report.text
        : ''
      const reportBlock = reportState === 'loading'
        ? h('div', { className: 'tk-report', 'data-report': 'loading' },
          h('span', { className: 'tk-note' }, t('reportLoading')))
        : reportState === 'ready'
          ? h('div', { className: 'tk-report', 'data-report': 'ready' },
            h('p', { className: 'tk-body-text' }, reportText))
          : h('div', { className: 'tk-report', 'data-report': 'empty' },
            h('span', { className: 'tk-note' }, t('reportEmptyNote')),
            onOpenAgent === undefined || ownerId === undefined
              ? null
              : h('div', { className: 'tk-actions' },
                h('button', {
                  type: 'button',
                  className: 'tk-btn',
                  title: t('agentOpenHint'),
                  onClick: () => { onOpenAgent(ownerId, 'main') },
                }, h(Icon, { name: 'chevron-right', size: 11 }), t('agentOpen'))))

      const tabButton = (key, label) => h('button', {
        key,
        type: 'button',
        role: 'tab',
        className: 'tk-tab',
        'data-tab': key,
        'aria-selected': activeTab === key ? 'true' : 'false',
        onClick: () => { setActiveTab(key) },
      }, label)
      const tabs = h('div', { className: 'tk-tabs', role: 'tablist', 'aria-label': t('inspectorTitle') },
        tabButton('description', t('description')),
        tabButton('report', t('taskReport')))

      const body = activeTab === 'report'
        ? h('div', { className: 'tk-insp-body', role: 'tabpanel', 'data-tabpanel': 'report' },
          h(Section, { title: t('taskReport'), icon: 'eye' }, reportBlock))
        : h('div', { className: 'tk-insp-body', role: 'tabpanel', 'data-tabpanel': 'description' },
          descriptionBlock,
          timelineBlock,
          agentBlock,
          depsBlock,
          scopesBlock)

      const dialog = h('div', {
        className: 'tk-insp',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('inspectorTitle'),
        'data-task-id': task.id,
        style: { zoom: viewSettings.dialogScale },
      },
      head,
      tabs,
      body)

      return h(Portal, null,
        h('div', {
          className: 'tk-backdrop',
          onMouseDown: event => { if (event.target === event.currentTarget) onClose() },
        }, dialog))
    }
