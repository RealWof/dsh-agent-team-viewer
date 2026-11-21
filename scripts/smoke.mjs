/**
 * Headless smoke test for the generated browser bundle.
 *
 * The real page supplies React, the module loader and the browser globals, so
 * this test supplies a minimal stand-in for each and drives the plugin through
 * `apply`, one board render, and one inspector render after a card click. It
 * catches wiring mistakes and render-path crashes; it is not a visual check.
 *
 * Run: node scripts/smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const failures = []
const check = (condition, message) => {
  if (condition !== true) failures.push(message)
}

/* --- React stand-in --------------------------------------------------- */

const toElement = (type, props, ...children) => ({
  type,
  props: {
    ...(props ?? {}),
    children: children.length === 1 ? children[0] : children.length === 0 ? undefined : children,
  },
})

const stateSlots = {}
let hookIndex = 0
const resetHooks = () => { hookIndex = 0 }

/** Wipe the hook slots so the next render is a fresh mount. */
const resetSlots = () => {
  for (const key of Object.keys(stateSlots)) delete stateSlots[key]
  resetHooks()
}

const React = {
  Fragment: Symbol.for('react.fragment'),
  createElement: toElement,
  useState: (initial) => {
    const index = hookIndex++
    if (!(index in stateSlots)) stateSlots[index] = typeof initial === 'function' ? initial() : initial
    const set = (next) => {
      stateSlots[index] = typeof next === 'function' ? next(stateSlots[index]) : next
    }
    return [stateSlots[index], set]
  },
  useEffect: (effect) => {
    const cleanup = effect()
    if (typeof cleanup === 'function') cleanup()
  },
  useMemo: compute => compute(),
  useCallback: callback => callback,
  useRef: initial => ({ current: initial }),
}

/* --- Browser stand-ins ------------------------------------------------ */

const storage = new Map()

globalThis.window = {
  localStorage: {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => { storage.set(key, String(value)) },
    removeItem: key => { storage.delete(key) },
  },
  setInterval: () => 1,
  clearInterval: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
}

globalThis.document = { body: { nodeType: 1 } }

let captured
globalThis.window.__ModuleLoader__ = {
  load: (definition) => { captured = definition },
}

/* --- Load the bundle -------------------------------------------------- */

const artifact = readFileSync(join(root, 'client.js'), 'utf8')
// eslint-disable-next-line no-new-func
new Function('window', artifact)(globalThis.window)

check(captured !== undefined, 'the bundle never called __ModuleLoader__.load')
check(captured?.id === 'dsh-agent-team-viewer', 'the module id is not the package name')

const plugin = captured.factory((name) => {
  if (name === 'react') return React
  if (name === 'react-dom') throw new Error('no react-dom in the test')
  throw new Error('unexpected require: ' + name)
})

check(Array.isArray(plugin.inject), 'the plugin declares no inject list')
check(typeof plugin.apply === 'function', 'the plugin has no apply()')

/* --- Drive apply with a recording context ----------------------------- */

const registrations = []
const injected = []
const effects = []
let tabDefinition
let tabBody
let actionRegistration
let titleSeat
let reg

const listState = {
  ids: ['root', 'session-a', 'session-b'],
  byId: {
    root: { id: 'root', running: true, updatedAt: 0 },
    'session-a': { id: 'session-a', parentId: 'root', running: true, updatedAt: 0 },
    'session-b': { id: 'session-b', parentId: 'root', running: false, updatedAt: 0 },
  },
  phase: 'ready',
  projectionsBySession: {
    root: {
      values: {
        subagentCatalog: [
          { id: 'session-a', mode: 'continuable', name: 'builder', createdAt: 1 },
          { id: 'session-b', mode: 'one-shot', name: 'reviewer', createdAt: 2 },
        ],
        agentTeam: {
          enabled: true,
          tasks: [
            {
              id: 'task-1', revision: 3, subject: 'Wire the board', description: 'Draw the columns.',
              status: 'in_progress', blockedBy: [], writeScopes: ['src/client'], ownerId: 'session-a',
              ownerName: 'builder', ready: true, writeScopeWarnings: [],
            },
            {
              id: 'task-2', revision: 1, subject: 'Second task', description: '',
              status: 'pending', blockedBy: ['task-1'], writeScopes: [], ready: false, writeScopeWarnings: [],
            },
            {
              id: 'task-3', revision: 5, subject: 'Shipped task', description: 'Done already.',
              status: 'completed', blockedBy: [], writeScopes: [], ownerId: 'session-a', ownerName: 'builder',
              ready: true, writeScopeWarnings: [],
            },
          ],
        },
      },
    },
    'session-a': {
      values: {
        modelSelection: {
          lastUsed: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' },
          next: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' },
        },
        agentPreset: 'standard',
        sessionStats: { llmMs: 6_000_000, toolMs: 1_200_000, steps: 12, turns: 3 },
        tokenUsage: { uncachedInputTokens: 41_000, outputTokens: 9_500, cacheReadTokens: 120_000, cacheWriteTokens: 4_000 },
      },
    },
    'session-b': {
      values: {
        subagentTiming: { settledMs: 45_000, lastTurnCompleted: true },
      },
    },
  },
}

const ctx = {
  get: () => undefined,
  effect: (factory, label) => {
    effects.push(label)
    const cleanup = factory()
    return typeof cleanup === 'function' ? cleanup : () => {}
  },
  inject: (names, callback) => {
    injected.push(names.join(','))
    return callback(scope)
  },
  slots: {
    inject: (slot, factory) => factory(),
    register: (options, component) => {
      registrations.push(options)
      if (options.name === 'sidebar.right.pane.tab') tabBody = component
      if (options.name === 'sidebar.right.pane.tab.title') titleSeat = options
      if (options.name === 'conversation.session.header.actions') actionRegistration = options
      return () => {}
    },
  },
  locale: {
    bind: () => key => key,
    register: (ns, dicts) => {
      reg = { ns, dicts }
      return () => {}
    },
  },
}

const scope = {
  effect: ctx.effect,
  slots: ctx.slots,
  sessions: {
    list: { getSnapshot: () => listState, subscribe: () => () => {} },
    refreshProjections: () => Promise.resolve(),
    binding: () => undefined,
  },
  sidebarRightTabs: {
    register: (definition) => {
      tabDefinition = definition
      return () => {}
    },
  },
  sidebarRight: { openTab: () => {} },
}

plugin.apply(ctx)

/* --- Registration assertions ------------------------------------------ */

check(reg?.ns === 'agent-team-viewer', 'the locale namespace was not registered')

/* Every t('key') in the bundle must exist in the English dictionary. */
const usedKeys = new Set([...artifact.matchAll(/\bt\('([a-zA-Z0-9]+)'/g)].map(match => match[1]))
const dynamicPrefixes = new Set(['col'])
const missingKeys = [...usedKeys].filter(key => !dynamicPrefixes.has(key) && typeof reg?.dicts?.en?.[key] !== 'string')
check(missingKeys.length === 0, 'missing locale keys: ' + missingKeys.join(', '))
const LOCALES = ['en', 'ru', 'zh', 'ja', 'es', 'fr', 'de', 'pt']
for (const locale of LOCALES) {
  check(reg?.dicts?.[locale] !== undefined, 'the ' + locale + ' dictionary is missing')
}
for (const locale of LOCALES) {
  const english = Object.keys(reg?.dicts?.en ?? {})
  const other = Object.keys(reg?.dicts?.[locale] ?? {})
  check(english.join(',') === other.join(','), 'the ' + locale + ' keys diverge from en (order or membership)')
  const missing = english.filter(key => typeof (reg?.dicts?.[locale] ?? {})[key] !== 'string'
    || reg.dicts[locale][key] === '')
  check(missing.length === 0, 'the ' + locale + ' dictionary has empty values: ' + missing.join(', '))
}
check(tabDefinition !== undefined, 'the tab type was not registered')
check(tabDefinition?.kind === 'agent-team-viewer', 'the tab kind is wrong')
check(tabDefinition?.priority === 'extension', 'the tab type must register in the extension band')
check(typeof tabDefinition?.title === 'function', 'the tab title must be a thunk')
check(tabDefinition?.guide?.length === 1, 'expected exactly one guide entry')
check(typeof tabBody === 'function', 'the tab body was not registered')
check(titleSeat?.key === 'dsh-agent-team-viewer', 'the live tab-title seat was not registered')
check(actionRegistration !== undefined, 'the header action was not registered')
check(actionRegistration?.order === 8, 'the header action must sit left of Subagents (order 10)')
check(injected.includes('sidebarRight,sidebarRightTabs'), 'the sidebar services were not injected')
check(injected.includes('sessions'), 'the sessions service was not injected')

/* --- Walk helpers ----------------------------------------------------- */

const walk = (node, visit) => {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node === 'string' || typeof node === 'number') {
    visit({ text: String(node) })
    return
  }
  if (typeof node === 'object' && node.type !== undefined) {
    visit(node)
    if (typeof node.type === 'function') {
      walk(node.type(node.props ?? {}), visit)
      return
    }
    walk(node.props?.children, visit)
  }
}

const surface = (rendered) => {
  const texts = []
  const classes = new Set()
  const nodes = []
  walk(rendered, (node) => {
    if (node.text !== undefined) {
      texts.push(node.text)
      return
    }
    nodes.push(node)
    if (typeof node.props?.className === 'string') classes.add(node.props.className)
  })
  return { texts, classes, nodes, joined: texts.join(' ') }
}

/* --- Board render ----------------------------------------------------- */

/* --- Background jobs: a roster the board only attributes -------------- */

const jobsNow = Date.now()
const jobsState = {
  rows: {
    // The Lead owns one settled job: its chip stays muted but present.
    root: [
      {
        id: 'bash-root-1', kind: 'bash', label: 'npm run lint', owner: 'root', status: 'completed',
        detail: 'exit code: 0', startedAt: jobsNow - 30 * 60_000, finishedAt: jobsNow - 28 * 60_000,
        output: { total: 0, earliest: 0 },
      },
    ],
    'session-a': [
      {
        id: 'bash-live-1', kind: 'bash', label: 'npm test', owner: 'session-a', status: 'running',
        progress: 'running suite 3/9', startedAt: jobsNow - 8 * 60_000, output: { total: 0, earliest: 0 },
      },
      {
        id: 'bash-done-1', kind: 'bash', label: 'node scripts/lint.mjs', owner: 'session-a', status: 'completed',
        detail: 'exit code: 0', startedAt: jobsNow - 21 * 60_000, finishedAt: jobsNow - 19 * 60_000,
        output: { total: 0, earliest: 0 },
      },
      {
        id: 'bash-unowned-1', kind: 'bash', label: 'npm ci', status: 'running',
        startedAt: jobsNow - 2 * 60_000, output: { total: 0, earliest: 0 },
      },
    ],
  },
  observed: {},
}

const jobsWatch = { started: [], stopped: [] }
const jobsListeners = new Set()
const fakeJobs = {
  snapshot: () => jobsState,
  watch: (sessionId) => {
    jobsWatch.started.push(sessionId)
    return () => { jobsWatch.stopped.push(sessionId) }
  },
  subscribe: (listener) => {
    jobsListeners.add(listener)
    return () => { jobsListeners.delete(listener) }
  },
}

const opened = []
const props = {
  t: key => key,
  sessionId: 'session-a',
  useProjection: () => undefined,
  useSessions: selector => selector(listState),
  services: {
    faceOf: () => undefined,
    refreshProjections: () => {},
    loadCosts: async () => ({ 'session-a': { equivalentUsd: 1.234, realUsd: 0, equivalentCny: 9.1, realCny: 0, found: true } }),
    listState: () => listState,
    subscribeList: () => () => {},
    pluginLimit: async () => undefined,
    jobsSnapshot: () => fakeJobs.snapshot(),
    watchJobs: sessionId => fakeJobs.watch(sessionId),
    subscribeJobs: listener => fakeJobs.subscribe(listener),
    openAgent: (agentId, target) => { opened.push([agentId, target]) },
    agentLabel: (key, fallback) => fallback,
  },
}

resetHooks()
const board = surface(tabBody(props))

check(board.texts.some(text => text === 'tabTitle'), 'the board heading is missing')
check(board.texts.some(text => text === 'Wire the board'), 'the in-progress card is missing')
check(board.texts.some(text => text === 'Second task'), 'the blocked card is missing')
check(board.texts.some(text => text === 'Shipped task'), 'the completed card is missing')
check(board.classes.has('tk-board'), 'the board container is missing')
check(board.classes.has('tk-card'), 'no card rendered')
check(board.joined.includes('unitMin') || board.joined.includes('unitSec') || board.joined.includes('unitHour'), 'no duration text rendered')
check(board.joined.includes('#1'), 'task ids are not shortened')

/* --- Status colour contract ------------------------------------------- */

const cardNodes = board.nodes.filter(node => node.props?.['data-task-id'] !== undefined)
const stateOf = id => cardNodes.find(node => node.props['data-task-id'] === id)?.props['data-state']
check(stateOf('task-1') === 'ongoing', 'an in-progress card must carry the ongoing state')
check(stateOf('task-2') === 'warning', 'a blocked card must carry the warning state (amber)')
check(stateOf('task-3') === 'done', 'a completed card must carry the done state (green)')
check(board.nodes.some(node => node.props?.className === 'tk-spin'), 'the running card has no spinner')

/* The card carries task facts only: no session metrics on it. */
const firstCard = cardNodes[0]
check(firstCard !== undefined, 'no card rendered')
check(!board.nodes.some(node => node.props?.className === 'tk-stats' && cardNodes.some(card => card === node)), 'a card still renders session statistics')
check(!board.nodes.some(node => node.props?.className === 'tk-card-age'), 'a card still shows elapsed time')

/* --- The agent strip --------------------------------------------------- */

// The money figures arrive through a promise; let the effects settle, then
// render again so the strip shows them.
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const strip = surface(tabBody(props))
const rows = strip.nodes.filter(node => node.props?.['data-agent-id'] !== undefined && node.props?.className === 'tk-agent-row')
check(rows.length === 3, 'expected the lead plus two subagents, got ' + rows.length)
const rowOf = id => rows.find(node => node.props['data-agent-id'] === id)
check(rowOf('session-a') !== undefined, 'the subagent row is missing')
check(rowOf('session-a')?.props['data-activity'] === 'running', 'the running subagent is not marked running')
check(rowOf('session-b')?.props['data-activity'] === 'completed', 'the completed subagent is not marked completed')
check(rowOf('root')?.props['data-lead'] === 'true', 'the lead is not marked as the lead row')
check(rowOf('session-a')?.props?.role === 'button', 'the agent row is not a clickable card surface')
check(rowOf('session-a')?.props?.tabIndex === 0, 'the agent row is not keyboard reachable')

/** Find one descendant of a node. */
const within = (node, predicate) => {
  const hits = []
  walk(node, candidate => {
    if (candidate.text === undefined && predicate(candidate)) hits.push(candidate)
  })
  return hits
}

const agentMetricsRow = within(rowOf('session-a'), node => node.props?.className === 'tk-agent-meta')
check(agentMetricsRow.length === 1, 'the agent row has no metric line')
const agentStats = within(rowOf('session-a'), node => node.props?.className === 'tk-stat')
check(agentStats.length >= 3, 'the agent metric line is nearly empty: ' + agentStats.length)
check(strip.joined.includes('unitMin') || strip.joined.includes('unitSec'), 'the agent row shows no duration')
check(strip.joined.includes('$1.23'), 'the agent row shows no API cost')
check(within(rowOf('session-a'), node => node.props?.title === 'metricBackground').length > 0,
  'the agent row does not show how much time its background processes took')
check(within(rowOf('session-b'), node => node.props?.title === 'metricBackground').length === 0,
  'a settled agent row shows a background time it does not have')

/* Background jobs are attributed by `owner`, never by the roster they came from. */
const jobsChipOf = row => within(row, node => node.props?.className === 'tk-chip tk-agent-jobs')[0]
const chipCount = chip => {
  const children = chip?.props?.children
  return Array.isArray(children) ? String(children[1]) : undefined
}
const ownerChip = jobsChipOf(rowOf('session-a'))
check(ownerChip !== undefined, 'the agent owning background jobs has no jobs chip')
check(chipCount(ownerChip) === '2', 'the jobs chip does not count every owned job: ' + String(chipCount(ownerChip)))
check(ownerChip?.props?.['data-live'] === 'true', 'a chip with a live job is not marked live')
const ownerChipTitle = String(ownerChip?.props?.title ?? '')
check(ownerChipTitle.includes('jobsRunningCount'), 'the jobs chip has no running-count title')
check(ownerChipTitle.includes('jobsLongest'), 'the jobs chip does not name the longest-running job')
const leadChip = jobsChipOf(rowOf('root'))
check(leadChip !== undefined, 'a settled job leaves the agent card without an indicator')
check(chipCount(leadChip) === '1', 'the muted jobs chip does not count the settled job')
check(leadChip?.props?.['data-live'] === 'false', 'a settled-only jobs chip is marked live')
check(String(leadChip?.props?.title ?? '').includes('jobsHeading'), 'a settled-only chip has no background-processes title')
check(jobsChipOf(rowOf('session-b')) === undefined, 'an agent without background jobs got a chip')

const watchedJobs = [...new Set(jobsWatch.started)]
check(watchedJobs.length === 3 && ['root', 'session-a', 'session-b'].every(id => watchedJobs.includes(id)),
  'the board does not watch the whole tree, watched: ' + watchedJobs.join(','))
check(jobsWatch.stopped.length === jobsWatch.started.length,
  'the board did not release every roster stream it opened')
check(jobsListeners.size === 0, 'the board left a jobs subscription behind')

/* The agents section totals what the whole tree burned. */
const totalsNode = strip.nodes.find(node => node.props?.['data-agent-team-viewer'] === 'totals')
check(totalsNode !== undefined, 'the agents section has no totals row')
const totals = totalsNode === undefined ? { joined: '', texts: [] } : surface(totalsNode)
check(totals.joined.includes('$1.23'), 'the totals row does not sum the agent cost')
check(totals.joined.includes('51K'), 'the totals row does not sum the agent tokens, got: ' + totals.joined)
check(totals.joined.includes('unitHour'), 'the totals row does not sum the agent hours')
check(totals.joined.includes('unitSec'), 'the totals row does not sum the run time')
check(totals.joined.includes('agentsTotal'), 'the totals row has no label')
const totalsChips = within(totalsNode, node => node.props?.className === 'tk-chip')
check(totalsChips.length === 5,
  'the totals row must carry run time, background time, tokens, agent-hours and cost, got ' + totalsChips.length)
check(totalsChips[0]?.props?.title === 'metricDuration', 'the totals row does not start with the total run time')
check(totalsChips[1]?.props?.title === 'metricBackground', 'the totals row does not show the background time next to the run time')
check(String(totalsChips[totalsChips.length - 1]?.props?.title).startsWith('agentsTotalCost'),
  'the totals row does not end with the cost')

/* Both sections carry their own heading, separated by a rule. */
check(strip.texts.includes('tasksHeading'), 'the tasks section has no heading')
check(strip.texts.includes('agentsHeading'), 'the agents section has no heading')
check(strip.nodes.some(node => node.props?.className === 'tk-divider'), 'the sections are not separated')
check(strip.nodes.some(node => node.props?.className === 'tk-section-head'), 'the tasks heading row is missing')

/* Dialogs follow the product dialog surface, not a light overlay. */
check(artifact.includes('var(--dsw-alias-bg-layer-2)'), 'the dialog does not use the product dialog surface')
check(artifact.includes('var(--dsw-alias-bg-mask-1'), 'the dialog mask does not use the product mask token')
check(artifact.includes('var(--dsw-elevation-prominent'), 'the dialog does not use the product elevation')

/* The agents are broken down by status, like the task columns. */
const groups = strip.nodes.filter(node => node.props?.['data-agent-column'] !== undefined)
check(groups.length === 3, 'expected three agent status groups, got ' + groups.length)
const groupOf = key => groups.find(node => node.props['data-agent-column'] === key)
const rowsIn = key => (groupOf(key) === undefined
  ? -1
  : within(groupOf(key), node => node.props?.className === 'tk-agent-row').length)
check(rowsIn('active') === 2, 'the running group must hold the lead and the busy subagent, got ' + rowsIn('active'))
check(rowsIn('done') === 1, 'the completed group must hold one agent, got ' + rowsIn('done'))
check(rowsIn('idle') === 0, 'the idle group must be empty, got ' + rowsIn('idle'))
const activeRows = within(groupOf('active'), node => node.props?.className === 'tk-agent-row')
check(activeRows[0]?.props?.['data-lead'] === 'true', 'the lead is not the first row of its own group')

check(strip.texts.includes('colActive') && strip.texts.includes('colDone') && strip.texts.includes('colAgentIdle'),
  'an agent group header is missing its label')

/* --- Role grouping: two agents of one role share a nested head -------- */

const sharedRoleState = (() => {
  const next = JSON.parse(JSON.stringify(listState))
  next.byId['session-b'].running = true
  next.projectionsBySession['session-b'].values.agentPreset = 'standard'
  return next
})()
for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const sharedRole = surface(tabBody({ ...props, useSessions: selector => selector(sharedRoleState) }))
const sharedActive = sharedRole.nodes.find(node => node.props?.['data-agent-column'] === 'active')
const roleHead = within(sharedActive, node => node.props?.['data-target'] === 'agents:active:role:standard')[0]
check(roleHead !== undefined, 'two agents sharing a role did not get a nested group head')
check(roleHead?.props?.['data-subgroup'] === 'true', 'the nested group head is not marked as a subgroup')
check(within(roleHead, node => node.props?.className === 'tk-col-count')[0]?.props?.children === '2',
  'the nested group head does not count its members')
check(within(sharedActive, node => node.props?.className === 'tk-agent-row').length === 3,
  'the nested role group did not render its two members under the lead')
roleHead?.props?.onClick?.()
resetHooks()
const roleFolded = surface(tabBody({ ...props, useSessions: selector => selector(sharedRoleState) }))
const foldedRoleHead = within(roleFolded.nodes.find(node => node.props?.['data-agent-column'] === 'active'),
  node => node.props?.['data-target'] === 'agents:active:role:standard')[0]
check(foldedRoleHead?.props?.['aria-expanded'] === 'false', 'the nested group head did not report the folded state')
check(within(roleFolded.nodes.find(node => node.props?.['data-agent-column'] === 'active'),
  node => node.props?.className === 'tk-agent-row').length === 1,
'the folded nested group left its rows rendered')
foldedRoleHead?.props?.onClick?.()

/* Navigation: name -> main view, panel icon -> beside, owner -> main view. */
within(rowOf('session-a'), node => node.props?.className === 'tk-agent-name')[0]?.props?.onClick?.()
check(opened.length === 1 && opened[0][0] === 'session-a' && opened[0][1] === 'main', 'the agent name did not open the main view')
within(rowOf('session-a'), node => node.props?.className === 'tk-icon-btn tk-agent-jump')[0]?.props?.onClick?.()
check(opened.length === 2 && opened[1][1] === 'aside', 'the beside control did not ask for the side target')
const ownerLink = strip.nodes.find(node => node.props?.className === 'tk-owner-link')
check(ownerLink !== undefined, 'the card owner is not a link to the agent')
ownerLink?.props?.onClick?.({ stopPropagation: () => {} })
check(opened.length === 3 && opened[2][0] === 'session-a' && opened[2][1] === 'main', 'the card owner did not open the agent')

/* --- Task dialog: task facts plus a labelled agent block --------------- */

const card = strip.nodes.find(node => typeof node.type === 'function' && node.type.name === 'TaskCard'
  && node.props?.task?.id === 'task-1')
check(card !== undefined, 'the in-progress card did not render as a TaskCard')
card?.props?.onOpen?.(card.props.task.id)

resetHooks()
const taskTree = tabBody(props)
const withTask = surface(taskTree)
check(withTask.nodes.some(node => node.props?.['data-task-id'] === 'task-1' && node.props?.role === 'dialog'),
  'clicking a card did not open the task dialog')
check(withTask.texts.includes('taskTimeline'), 'the task dialog lost its own timeline')
check(withTask.texts.includes('description'), 'the task dialog lost its description block')
check(withTask.texts.includes('Draw the columns.'), 'the task dialog lost the description text')
check(withTask.texts.includes('agentHeading'), 'the task dialog lost its agent block')
check(withTask.texts.includes('agentMetricsNote'), 'the agent metrics are not labelled as the agent session')
check(withTask.texts.includes('builder'), 'the task dialog does not name the owning agent')
check(withTask.texts.includes('agentOpen') && withTask.texts.includes('agentOpenAside') && withTask.texts.includes('agentDetails'),
  'the task dialog lost one of its agent actions')
check(withTask.nodes.some(node => node.props?.className === 'tk-stats'), 'the task dialog shows no compact agent metrics')

/* Navigating from the task dialog must also close it. */
const openFromTask = within(taskTree, node => node.type === 'button'
  && (Array.isArray(node.props?.children) ? node.props.children.includes('agentOpen') : node.props?.children === 'agentOpen'))[0]
check(openFromTask !== undefined, 'the task dialog has no agent-open button to click')
openFromTask?.props?.onClick?.()
resetHooks()
const afterNavigate = surface(tabBody(props))
check(!afterNavigate.nodes.some(node => node.props?.['data-task-id'] === 'task-1' && node.props?.role === 'dialog'),
  'the task dialog stayed open after navigating to the agent')
check(opened.length === 4 && opened[3][1] === 'main', 'the task dialog did not navigate to the agent')

/* --- Agent dialog ------------------------------------------------------ */

within(rows.length > 0 ? board : board, node => false)
const infoButton = within(rowOf('session-a'), node => node.props?.className === 'tk-icon-btn tk-agent-info')[0]
check(infoButton !== undefined, 'the agent row has no details control')
infoButton?.props?.onClick?.()
resetHooks()
const withAgent = surface(tabBody(props))
check(withAgent.nodes.some(node => node.props?.['data-agent-dialog'] === 'session-a'), 'the agent dialog did not open')
check(withAgent.texts.includes('agentTasksHeading'), 'the agent dialog has no task list section')
check(withAgent.texts.includes('Wire the board'), 'the agent dialog does not list the task it owns')
check(withAgent.nodes.some(node => node.props?.className === 'tk-metrics'), 'the agent dialog has no metric grid')
check(withAgent.texts.includes('metricTokens') && withAgent.texts.includes('metricCostEquivalent'), 'the agent dialog lost its metrics')
check(withAgent.texts.includes('metricBackground'), 'the agent dialog does not separate the background time from the run time')
check(withAgent.joined.includes('costPlanNote'), 'the subscription case is not explained')
check(withAgent.texts.includes('agentModel'), 'the agent dialog does not show the model')
check(withAgent.joined.includes('deepseek-chat'), 'the model id is missing')
check(withAgent.joined.includes('deepseek'), 'the provider is missing')
check(withAgent.texts.includes('High'), 'the reasoning effort is not shown')
check(withAgent.texts.includes('agentPresetLabel') && withAgent.joined.includes('standard'), 'the preset is not shown')

/* The agent dialog names the background jobs that agent owns, live first. */
check(withAgent.texts.includes('jobsHeading'), 'the agent dialog has no background-processes section')
check(!withAgent.texts.includes('jobsEmpty'), 'the agent dialog says there are no jobs while it lists one')
const jobNodes = withAgent.nodes.filter(node => node.props?.['data-job-id'] !== undefined)
check(jobNodes.length === 2, 'the agent dialog lists ' + jobNodes.length + ' jobs instead of the two owned ones')
check(jobNodes[0]?.props?.['data-job-status'] === 'running', 'the live job is not first in the agent dialog')
check(jobNodes[1]?.props?.['data-job-status'] === 'completed', 'the settled job is not second in the agent dialog')
check(withAgent.joined.includes('npm test'), 'the running job command is missing from the agent dialog')
check(withAgent.joined.includes('node scripts/lint.mjs'), 'the settled job command is missing from the agent dialog')
check(withAgent.joined.includes('running suite 3/9'), 'the live progress line is missing from the agent dialog')
check(withAgent.joined.includes('exit code: 0'), 'the terminal reason is missing from the agent dialog')
check(!withAgent.joined.includes('npm ci'), 'an unowned job was attributed to an agent')

/* The dialog order is stats, facts, background jobs, tasks. */
const atText = label => withAgent.texts.indexOf(label)
check(atText('statsHeading') < atText('stateLabel') && atText('stateLabel') < atText('jobsHeading')
  && atText('jobsHeading') < atText('agentTasksHeading'),
'the agent dialog blocks are out of order: ' + ['statsHeading', 'stateLabel', 'jobsHeading', 'agentTasksHeading']
  .map(key => key + '@' + atText(key)).join(', '))

/* Both lists scroll inside the dialog and fold from their headers. */
const dialogNode = withAgent.nodes.find(node => node.props?.['data-agent-dialog'] === 'session-a')
const metricTiles = within(dialogNode, node => node.props?.className === 'tk-metric')
const backgroundTile = metricTiles.find(tile => surface(tile).texts.includes('metricBackground'))
check(backgroundTile !== undefined, 'the agent dialog has no background-time tile')
check(surface(backgroundTile).joined.includes('unitMin'),
  'the background-time tile does not show the background span: ' + surface(backgroundTile).joined)
const scrollers = within(dialogNode, node => node.props?.className === 'tk-sec-scroll')
check(scrollers.length === 2, 'expected two scrollable dialog blocks, got ' + scrollers.length)
check(scrollers.every(node => node.props?.tabIndex === 0), 'a scrollable dialog block is not keyboard focusable')

const foldBlockButton = (rendered, target) => rendered.nodes.find(node => node.type === 'button'
  && node.props?.['data-fold'] === 'section' && node.props?.['data-target'] === target)
const foldBlockNote = (rendered, target) => {
  const block = rendered.nodes.find(node => node.props?.['data-fold-block'] === target)
  return block === undefined
    ? undefined
    : within(block, node => node.props?.className === 'tk-sec-note')[0]?.props?.children
}

const jobsFold = foldBlockButton(withAgent, 'agent-jobs')
check(jobsFold !== undefined, 'the jobs block has no fold control')
check(jobsFold?.props?.['aria-expanded'] === 'true', 'the jobs block does not start expanded')
jobsFold?.props?.onClick?.()
resetHooks()
const jobsFolded = surface(tabBody(props))
check(!jobsFolded.nodes.some(node => node.props?.['data-job-id'] !== undefined),
  'folding the jobs block left its rows rendered')
check(jobsFolded.texts.includes('jobsHeading'), 'the folded jobs block lost its title')
check(foldBlockNote(jobsFolded, 'agent-jobs') === '2', 'the folded jobs block lost its count')
foldBlockButton(jobsFolded, 'agent-jobs')?.props?.onClick?.()
resetHooks()
const jobsBack = surface(tabBody(props))
check(jobsBack.nodes.filter(node => node.props?.['data-job-id'] !== undefined).length === 2,
  'the jobs block did not come back after unfolding')

const tasksFold = foldBlockButton(jobsBack, 'agent-tasks')
check(tasksFold !== undefined, 'the tasks block has no fold control')
check(tasksFold?.props?.['aria-expanded'] === 'true', 'the tasks block does not start expanded')
check(foldBlockNote(jobsBack, 'agent-tasks') === '2', 'the tasks block header has no count')
tasksFold?.props?.onClick?.()
resetHooks()
const dialogTasksFolded = surface(tabBody(props))
check(!dialogTasksFolded.nodes.some(node => node.props?.className === 'tk-task-link'),
  'folding the tasks block left its rows rendered')
check(dialogTasksFolded.texts.includes('agentTasksHeading'), 'the folded tasks block lost its title')
check(foldBlockNote(dialogTasksFolded, 'agent-tasks') === '2', 'the folded tasks block lost its count')

/* A settled agent has no roster, so it must not get an empty jobs block. */
within(rowOf('session-b'), node => node.props?.className === 'tk-icon-btn tk-agent-info')[0]?.props?.onClick?.()
resetHooks()
const withSettledAgent = surface(tabBody(props))
check(withSettledAgent.nodes.some(node => node.props?.['data-agent-dialog'] === 'session-b'),
  'the settled agent dialog did not open')
check(!withSettledAgent.texts.includes('jobsHeading'), 'the settled agent dialog shows a jobs block without a roster')

/* --- Fold state: sections, groups, and the overflow cap ---------------- */

const COLLAPSE_STORAGE_KEY = 'dsh.agent-team-viewer.collapsed.v1'

/** The disclosure button of one fold target. */
const foldButton = (rendered, kind, target) => rendered.nodes.find(node => node.type === 'button'
  && node.props?.['data-fold'] === kind && node.props?.['data-target'] === target)

/** The count pill inside one group header. */
const countPill = (rendered, kind, target) => {
  const head = foldButton(rendered, kind, target)
  return head === undefined
    ? undefined
    : within(head, node => node.props?.className === 'tk-col-count')[0]?.props?.children
}

/** The persisted fold state, parsed, or undefined when nothing is stored. */
const foldState = () => {
  const raw = storage.get(COLLAPSE_STORAGE_KEY)
  return raw === undefined ? undefined : JSON.parse(raw)
}

/** A sessions list whose root board carries `count` extra tasks in one column. */
const bulkState = (status, count) => {
  const next = JSON.parse(JSON.stringify(listState))
  const team = next.projectionsBySession.root.values.agentTeam
  for (let index = 1; index <= count; index += 1) {
    team.tasks.push({
      id: 'task-bulk-' + String(index),
      revision: 1,
      subject: 'Bulk task ' + String(index),
      description: '',
      status,
      blockedBy: [],
      writeScopes: [],
      ready: true,
      writeScopeWarnings: [],
    })
  }
  return next
}

/** The board props bound to another sessions snapshot. */
const propsWith = state => ({ ...props, useSessions: selector => selector(state) })

// The dialog tests above leave a dialog mounted; start from a clean mount.
resetSlots()
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
const foldStart = surface(tabBody(props))
check(foldButton(foldStart, 'section', 'agents') !== undefined, 'the agents section header has no fold toggle')
check(foldButton(foldStart, 'section', 'tasks') !== undefined, 'the tasks section header has no fold toggle')
check(foldButton(foldStart, 'section', 'tasks')?.props?.['aria-expanded'] === 'true',
  'the tasks section does not start expanded')
check(foldStart.texts.some(text => text.endsWith('tasksFew')), 'the tasks header has no count')
check(foldStart.nodes.some(node => node.props?.className === 'tk-chevron'), 'no disclosure chevron rendered')
check(String(foldButton(foldStart, 'section', 'tasks')?.props?.['aria-label']).startsWith('foldSection'),
  'the section toggle has no locale aria-label')
check(artifact.includes('rotate(-90deg)'), 'the stylesheet does not rotate the collapsed chevron')

// Folding a section hides its body (board, cards), keeps the header and count,
// and the choice lands in localStorage.
foldButton(foldStart, 'section', 'tasks')?.props?.onClick?.()
resetHooks()
const tasksFolded = surface(tabBody(props))
check(!tasksFolded.nodes.some(node => node.props?.className === 'tk-board'),
  'folding the tasks section left the board rendered')
check(!tasksFolded.nodes.some(node => node.props?.['data-task-id'] !== undefined),
  'folding the tasks section left the cards rendered')
check(tasksFolded.nodes.some(node => node.props?.['data-agent-column'] !== undefined),
  'folding the tasks section also hid the agents')
check(tasksFolded.texts.includes('tasksHeading'), 'the folded tasks header lost its heading')
check(tasksFolded.texts.some(text => text.endsWith('tasksFew')), 'the folded tasks header lost its count')
check(foldButton(tasksFolded, 'section', 'tasks')?.props?.['aria-expanded'] === 'false',
  'the folded toggle does not report the collapsed state')
check(foldState()?.sections?.tasks === true,
  'folding the tasks section was not persisted: ' + JSON.stringify(foldState()))
const storedFold = foldState()
check(typeof storedFold?.sections?.agents === 'boolean' && typeof storedFold?.sections?.tasks === 'boolean',
  'the stored fold state does not carry both section flags: ' + JSON.stringify(storedFold))
check(storedFold?.groups !== null && typeof storedFold?.groups === 'object',
  'the stored fold state carries no group map: ' + JSON.stringify(storedFold))

foldButton(tasksFolded, 'section', 'tasks')?.props?.onClick?.()
resetHooks()
const tasksBack = surface(tabBody(props))
check(tasksBack.nodes.some(node => node.props?.className === 'tk-board'), 'the board did not come back after unfolding')
check(tasksBack.texts.some(text => text === 'Wire the board'), 'the cards did not come back after unfolding')
check(foldState()?.sections?.tasks === false, 'unfolding the tasks section was not persisted')

// A status group folds its own items while the header keeps the count.
const activeHead = foldButton(tasksBack, 'group', 'agents:active')
check(activeHead !== undefined, 'an agent status group has no fold toggle')
check(activeHead?.props?.['aria-expanded'] === 'true', 'an agent group does not start expanded')
check(countPill(tasksBack, 'group', 'agents:active') === '2', 'the agent group header has no count')
activeHead?.props?.onClick?.()
resetHooks()
const groupFolded = surface(tabBody(props))
check(groupFolded.nodes.filter(node => node.props?.className === 'tk-agent-row').length === 1,
  'folding a group left ' + groupFolded.nodes.filter(node => node.props?.className === 'tk-agent-row').length + ' agent rows')
check(countPill(groupFolded, 'group', 'agents:active') === '2', 'the folded group header lost its count')
check(groupFolded.texts.includes('colActive'), 'the folded group header lost its label')
check(groupFolded.texts.includes('colDone'), 'folding one group hid another')
check(foldState()?.groups?.['agents:active'] === true, 'folding a group was not persisted')

foldButton(groupFolded, 'group', 'agents:active')?.props?.onClick?.()
resetHooks()
const groupBack = surface(tabBody(props))
check(groupBack.nodes.filter(node => node.props?.className === 'tk-agent-row').length === 3, 'the group did not come back')
check(foldState()?.groups?.['agents:active'] === false, 'unfolding a group was not persisted')

// An over-long group keeps VISIBLE_LIMIT items and puts the rest behind one
// control; the expansion is page-session state, never stored.
resetSlots()
const many = surface(tabBody(propsWith(bulkState('pending', 8))))
const queued = many.nodes.find(node => node.props?.['data-column'] === 'queued')
check(queued !== undefined, 'the queued column is missing from the bulk board')
const queuedCards = within(queued, node => node.props?.['data-task-id'] !== undefined).length
check(queuedCards === 5, 'the cap did not keep five cards, got ' + queuedCards)
check(countPill(many, 'group', 'tasks:queued') === '8', 'the capped group lost its full count')
const moreControl = many.nodes.find(node => node.props?.className === 'tk-more')
check(moreControl !== undefined, 'the over-long group has no show-all control')
check(moreControl?.props?.['data-remaining'] === '3', 'the show-all control does not say how many remain')
check(String(moreControl?.props?.['aria-label']).startsWith('showMore'), 'the show-all control has no locale label')
moreControl?.props?.onClick?.()
resetHooks()
const manyExpanded = surface(tabBody(propsWith(bulkState('pending', 8))))
const expandedQueued = manyExpanded.nodes.find(node => node.props?.['data-column'] === 'queued')
check(within(expandedQueued, node => node.props?.['data-task-id'] !== undefined).length === 8,
  'the show-all control did not render the whole pile')
const scrollBox = manyExpanded.nodes.find(node => node.props?.className === 'tk-col-items')
check(scrollBox?.props?.['data-scroll'] === 'true', 'the expanded pile does not scroll inside its column')
check(within(scrollBox, node => node.props?.['data-task-id'] !== undefined).length === 8,
  'the show-all scroll box does not hold the whole pile')
const lessControl = manyExpanded.nodes.find(node => node.props?.className === 'tk-more tk-more-less')
check(lessControl !== undefined, 'the expanded group has no show-less control')
check(foldState()?.groups?.['tasks:queued'] !== true, 'the session expansion leaked into the stored fold state')
lessControl?.props?.onClick?.()
resetHooks()
const manyCapped = surface(tabBody(propsWith(bulkState('pending', 8))))
const cappedQueued = manyCapped.nodes.find(node => node.props?.['data-column'] === 'queued')
check(within(cappedQueued, node => node.props?.['data-task-id'] !== undefined).length === 5,
  'the show-less control did not fall back to the cap')

// A pile past AUTO_COLLAPSE_AT folds itself on the first sight of that size,
// and an explicit toggle wins over the auto-collapse afterwards.
resetSlots()
const pile = surface(tabBody(propsWith(bulkState('completed', 13))))
const donePile = pile.nodes.find(node => node.props?.['data-column'] === 'done')
check(donePile !== undefined, 'the done column is missing from the piled board')
check(within(donePile, node => node.props?.['data-task-id'] !== undefined).length === 0,
  'a group past the auto-collapse threshold rendered its items on first sight')
check(countPill(pile, 'group', 'tasks:done') === '14', 'the auto-collapsed group lost its count')
check(foldButton(pile, 'group', 'tasks:done')?.props?.['aria-expanded'] === 'false',
  'the auto-collapsed group does not report the folded state')
check(foldState()?.groups?.['tasks:done'] === true, 'the auto-collapse was not written to the stored fold state')

foldButton(pile, 'group', 'tasks:done')?.props?.onClick?.()
resetHooks()
const pileOpen = surface(tabBody(propsWith(bulkState('completed', 13))))
const doneOpen = pileOpen.nodes.find(node => node.props?.['data-column'] === 'done')
check(within(doneOpen, node => node.props?.['data-task-id'] !== undefined).length === 5,
  'the explicit toggle did not unfold the group to the cap')
check(foldState()?.groups?.['tasks:done'] === false, 'the explicit toggle was not persisted')
resetHooks()
const pileAgain = surface(tabBody(propsWith(bulkState('completed', 13))))
const doneAgain = pileAgain.nodes.find(node => node.props?.['data-column'] === 'done')
check(within(doneAgain, node => node.props?.['data-task-id'] !== undefined).length === 5,
  'the auto-collapse overrode the explicit toggle')

/* --- Soft dependency: no cost plugin at all ---------------------------- */

// Let every promise queued by the earlier renders settle first: its setters
// capture hook indexes and would otherwise write into the fresh mount.
for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetSlots()
const propsNoCost = {
  ...props,
  services: { ...props.services, loadCosts: async () => null },
}
surface(tabBody(propsNoCost))
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const noCost = surface(tabBody(propsNoCost))
check(!noCost.joined.includes('$1.23'), 'a cost figure is shown even though the cost plugin is absent')
check(noCost.texts.includes('costMissing'), 'the board does not announce the absent cost plugin')
check(noCost.texts.includes('colAgentIdle'), 'the agent groups disappear when the cost plugin is absent')

/* --- Soft dependency: no jobs service at all --------------------------- */

for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetSlots()
const propsNoJobs = {
  ...props,
  services: {
    ...props.services,
    jobsSnapshot: () => undefined,
    watchJobs: () => undefined,
    subscribeJobs: () => () => {},
  },
}
const noJobs = surface(tabBody(propsNoJobs))
check(noJobs.texts.includes('tasksHeading') && noJobs.texts.includes('colActive'),
  'the board does not render normally without the jobs service')
check(!noJobs.nodes.some(node => node.props?.className === 'tk-chip tk-agent-jobs'),
  'a jobs chip is shown even though the jobs service is absent')
const noJobsRow = noJobs.nodes.find(node => node.props?.['data-agent-id'] === 'session-a'
  && node.props?.className === 'tk-agent-row')
const noJobsInfo = within(noJobsRow, node => node.props?.className === 'tk-icon-btn tk-agent-info')[0]
check(noJobsInfo !== undefined, 'the agent row lost its details control without the jobs service')
noJobsInfo?.props?.onClick?.()
resetHooks()
const noJobsDialog = surface(tabBody(propsNoJobs))
check(noJobsDialog.nodes.some(node => node.props?.['data-agent-dialog'] === 'session-a'),
  'the agent dialog did not open without the jobs service')
check(!noJobsDialog.texts.includes('jobsHeading'), 'the agent dialog shows a jobs block without the jobs service')

/* --- Live Session status, not the list summary, decides "running" ------ */

// The client synthesizes a list row for every catalog child, and that row's
// `running` is the state of an already-open session, or `false` — never the
// Host's current answer. The product's own Subagents menu reads
// `useSessionStatus` first for exactly this reason; the board must too, or a
// working agent is filed under "idle".
const summaryWith = running => {
  const next = JSON.parse(JSON.stringify(listState))
  next.byId['session-a'].running = running
  return next
}
const statusMap = running => new Map([
  ['root', { running: false }],
  ['session-a', { running }],
  ['session-b', { running: false }],
])
const rowsOf = rendered => rendered.nodes.filter(node => node.props?.['data-agent-id'] !== undefined
  && node.props?.className === 'tk-agent-row')
const rowIn = (rendered, id) => rowsOf(rendered).find(node => node.props['data-agent-id'] === id)
const propsWithStatus = (state, statuses) => ({
  ...props,
  useSessions: selector => selector(state),
  useSessionStatus: selector => selector(statuses),
})

for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetSlots()
const liveStatus = surface(tabBody(propsWithStatus(summaryWith(false), statusMap(true))))
check(rowIn(liveStatus, 'session-a')?.props['data-activity'] === 'running',
  'a subagent the list summary calls stopped is not shown as running from the live status')
const liveActive = liveStatus.nodes.find(node => node.props?.['data-agent-column'] === 'active')
check(within(liveActive, node => node.props?.['data-agent-id'] === 'session-a').length === 1,
  'the live-status running agent is missing from the running group')

resetSlots()
const stoppedStatus = surface(tabBody(propsWithStatus(summaryWith(true), statusMap(false))))
check(rowIn(stoppedStatus, 'session-a')?.props['data-activity'] === 'inactive',
  'a stopped session still marked running in a stale summary is shown as running')

// A host without the global standard prop keeps working from the summary alone.
resetSlots()
const summaryOnly = surface(tabBody({ ...props, useSessions: selector => selector(summaryWith(true)) }))
check(rowIn(summaryOnly, 'session-a')?.props['data-activity'] === 'running',
  'without the live status map the board does not fall back to the list summary')

/* --- The agent limit is the row's Config; the default is no limit -------- */

// `agentsLimit` is a volatile field of the row's Config and the board reads its
// live value from the settings document. The shipped default is -1: a session
// appends every new agent to the end of its catalog, so a cap would hide the
// newest agents — the ones most likely to be working.
const manyAgentsState = (() => {
  const next = JSON.parse(JSON.stringify(listState))
  const catalog = next.projectionsBySession.root.values.subagentCatalog
  for (let index = 3; index <= 70; index += 1) {
    const id = 'session-' + String(index)
    catalog.push({ id, mode: 'one-shot', name: 'agent-' + String(index), createdAt: index })
    next.byId[id] = { id, parentId: 'root', running: false, updatedAt: 0 }
  }
  return next
})()
const propsWithLimit = limit => ({
  ...props,
  useSessions: selector => selector(manyAgentsState),
  services: { ...props.services, pluginLimit: async () => limit },
})
/** The subagent count written beside the agents heading. */
const agentCountNote = rendered => rendered.texts.find(text => /^\d+ agents/.test(text))

for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
const defaultLimitProps = propsWithLimit(undefined)
resetSlots()
surface(tabBody(defaultLimitProps))
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const unlimitedByDefault = surface(tabBody(defaultLimitProps))
check(agentCountNote(unlimitedByDefault) === '70 agentsMany',
  'the default is not "no limit", got: ' + String(agentCountNote(unlimitedByDefault)))

const cappedProps = propsWithLimit(64)
resetSlots()
surface(tabBody(cappedProps))
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const capped = surface(tabBody(cappedProps))
check(agentCountNote(capped) === '64 agentsFew', 'the configured limit was not applied, got: ' + String(agentCountNote(capped)))

const oneLimitProps = propsWithLimit(1)
resetSlots()
surface(tabBody(oneLimitProps))
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const limited = surface(tabBody(oneLimitProps))
check(agentCountNote(limited) === '1 agentsOne', 'a limit of one kept more than one agent, got: ' + String(agentCountNote(limited)))

const noLimitProps = propsWithLimit(-1)
resetSlots()
surface(tabBody(noLimitProps))
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const unlimited = surface(tabBody(noLimitProps))
check(agentCountNote(unlimited) === '70 agentsMany', '-1 did not remove the limit, got: ' + String(agentCountNote(unlimited)))

/* --- Team mode gates mutations, not the read-only view ----------------- */

const teamState = (enabled, tasks) => {
  const next = JSON.parse(JSON.stringify(listState))
  next.projectionsBySession.root.values.agentTeam = { enabled, tasks }
  return next
}
const retainedTasks = listState.projectionsBySession.root.values.agentTeam.tasks

for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetSlots()
const retained = surface(tabBody(propsWith(teamState(false, retainedTasks))))
check(retained.nodes.some(node => node.props?.className === 'tk-board'),
  'retained tasks disappear when Team mode is off')
check(retained.texts.includes('Wire the board'), 'the retained task card is missing when Team mode is off')
check(retained.nodes.some(node => node.props?.['data-team-off'] === 'true'),
  'no Team-off notice while showing retained tasks')
check(retained.texts.includes('teamOffNote'), 'the Team-off notice has no explanation')
check(!retained.texts.includes('teamOff'), 'the empty Team-off state hid the retained board')
check(retained.nodes.some(node => node.props?.['data-agent-id'] !== undefined),
  'the agent tree disappears when Team mode is off')

resetSlots()
const offEmpty = surface(tabBody(propsWith(teamState(false, []))))
check(!offEmpty.nodes.some(node => node.props?.className === 'tk-board'),
  'an empty Team-off board still rendered columns')
check(offEmpty.texts.includes('teamOff') && offEmpty.texts.includes('teamOffNote'),
  'the empty Team-off state lost its explanation')

resetSlots()
const onEmpty = surface(tabBody(propsWith(teamState(true, []))))
check(onEmpty.texts.includes('emptyBoard'), 'Team mode on with no tasks lost its empty-board state')

/* --- A fresh start reads the stored folds back ------------------------- */

const seeded = {
  sections: { agents: false, tasks: true },
  groups: { 'agents:active': true, 'agents:done': false, 'agents:idle': false },
}
storage.set(COLLAPSE_STORAGE_KEY, JSON.stringify(seeded))
const storedSeed = JSON.parse(storage.get(COLLAPSE_STORAGE_KEY))
check(storedSeed?.sections?.tasks === true && storedSeed?.groups?.['agents:active'] === true,
  'the seeded fold state did not round-trip through the mocked storage')

// A second copy of the bundle gets its own module scope, so its fold store is
// read from the mocked localStorage exactly as on a page reload.
let capturedAgain
const secondWindow = {
  ...globalThis.window,
  __ModuleLoader__: { load: definition => { capturedAgain = definition } },
}
new Function('window', artifact)(secondWindow)
const secondPlugin = capturedAgain.factory((name) => {
  if (name === 'react') return React
  throw new Error('unexpected require: ' + name)
})
secondPlugin.apply(ctx)
resetSlots()
for (let flush = 0; flush < 2; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const restored = surface(tabBody(props))
check(!restored.nodes.some(node => node.props?.className === 'tk-board'),
  'a stored folded tasks section still rendered the board after the restart')
check(restored.texts.includes('tasksHeading') && restored.texts.some(text => text.endsWith('tasksFew')),
  'the restored folded section lost its heading or count')
const restoredActive = restored.nodes.find(node => node.props?.['data-agent-column'] === 'active')
check(restoredActive !== undefined, 'the restored board lost the agent groups')
check(within(restoredActive, node => node.props?.['data-group-body'] !== undefined).length === 0,
  'a stored folded group rendered its body after the restart')
check(countPill(restored, 'group', 'agents:active') === '2', 'a stored folded group lost its count')
check(restored.nodes.some(node => node.props?.['data-agent-column'] === 'done'), 'restoring one group hid another')

/* --- Report ----------------------------------------------------------- */

if (failures.length > 0) {
  console.error('FAILED (' + failures.length + ')')
  for (const failure of failures) console.error(' - ' + failure)
  process.exit(1)
}

console.log('smoke ok: ' + registrations.length + ' slot registrations, ' + strip.texts.length + ' strip texts, '
  + withTask.texts.length + ' task texts, ' + withAgent.texts.length + ' agent texts, ' + effects.length + ' effects, ' + storage.size + ' storage keys')
