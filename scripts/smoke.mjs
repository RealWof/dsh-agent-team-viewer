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
let boardRegistration
let actionRegistration
let titleSeat
let settingsSection
let settingsRegistration
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
              status: 'in_progress', blockedBy: [], writeScopes: ['src/client', 'src/client/'], ownerId: 'session-a',
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
      if (options.name === 'sidebar.right.pane.tab') {
        tabBody = component
        boardRegistration = options
      }
      if (options.name === 'sidebar.right.pane.tab.title') titleSeat = options
      if (options.name === 'conversation.session.header.actions') actionRegistration = options
      if (options.name === 'settings.section') {
        settingsSection = component
        settingsRegistration = options
      }
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
check(settingsRegistration !== undefined, 'the Settings section was not registered')
check(settingsRegistration?.id === 'agent-team-viewer', 'the Settings section id is wrong')
check(settingsRegistration?.order === 80, 'the Settings section is not in the expected order')
check(typeof settingsRegistration?.label === 'function', 'the Settings section label must be a thunk')
check(settingsRegistration?.label?.() === 'settingsTitle', 'the Settings section label lost its title')
check(settingsRegistration?.locale === 'agent-team-viewer', 'the Settings section lost its locale namespace')

/* The injected service face the body reads. */
const boardServices = boardRegistration?.inject?.('session-a')?.services
check(boardServices !== undefined, 'the board registration injects no services')
check(typeof boardServices?.loadAgentReport === 'function', 'the board has no agent-report reader')
check(typeof boardServices?.openFileLink === 'function', 'the board has no write-scope opener')

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
const openedFiles = []
const reportCalls = []
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
    openFileLink: (sessionId, path) => { openedFiles.push([sessionId, path]) },
    loadAgentReport: async (agentId) => {
      reportCalls.push(agentId)
      return agentId === 'session-a' ? 'Final answer from builder.' : undefined
    },
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
check(board.nodes.some(node => node.props?.['data-flip-id'] === 'task:task-1'), 'the task card has no FLIP id')
check(board.nodes.find(node => node.props?.['data-task-id'] === 'task-1')?.props?.['data-flip-group'] === 'active',
  'the task card does not carry its logical column for the FLIP pass')
check(artifact.includes('cubic-bezier(0.2,0,0,1)'), 'the FLIP move easing is missing from the bundle')
check(artifact.includes('getAnimations'), 'the FLIP pass does not cancel an in-flight animation')
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
check(rowOf('session-a')?.props?.['data-flip-id'] === 'agent:session-a', 'the agent row has no FLIP id')
check(rowOf('session-a')?.props?.['data-flip-group'] === 'active', 'the agent row does not carry its logical group for the FLIP pass')

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
const costStat = within(rowOf('session-a'), node => typeof node.props?.title === 'string'
  && node.props.title.startsWith('metricCostApiSpend'))[0]
check(costStat !== undefined, 'the agent cost figure has no API-spend tooltip')
check(costStat?.props?.title.includes('metricCostEquivalent') && costStat.props.title.includes('$0')
  && costStat.props.title.includes('$1.23'),
'the agent cost tooltip does not show both the API spend and the substitute plan value: ' + String(costStat?.props?.title))
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
const jobsMeta = within(rowOf('session-a'), node => node.props?.className === 'tk-agent-meta')[0]
const jobsMetaChildren = Array.isArray(jobsMeta?.props?.children) ? jobsMeta.props.children : []
check(jobsMetaChildren.length > 0 && jobsMetaChildren[jobsMetaChildren.length - 1] === ownerChip,
  'the jobs chip does not close the metric line after the metrics')

/* A job that finished keeps the chip as a muted zero: the agent was seen working. */
const BACKGROUND_STORAGE_KEY = 'dsh.agent-team-viewer.background.v1'
const savedJobs = jobsState.rows['session-a']
jobsState.rows['session-a'] = []
for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const settledJobsBoard = surface(tabBody(props))
const settledRow = settledJobsBoard.nodes.find(node => node.props?.['data-agent-id'] === 'session-a'
  && node.props?.className === 'tk-agent-row')
const settledChip = jobsChipOf(settledRow)
check(settledChip !== undefined, 'an agent whose jobs settled lost its chip')
check(chipCount(settledChip) === '0', 'the settled chip does not show the current zero count')
check(settledChip?.props?.['data-live'] === 'false', 'the settled chip is still marked live')
check(String(settledChip?.props?.title ?? '').includes('jobsHeading'), 'the settled chip lost its tooltip')
check(storage.has(BACKGROUND_STORAGE_KEY), 'the board never persisted the background intervals')
const storedBackground = storage.has(BACKGROUND_STORAGE_KEY)
  ? JSON.parse(storage.get(BACKGROUND_STORAGE_KEY))
  : undefined
check(Array.isArray(storedBackground?.['session-a']) && storedBackground['session-a'].length > 0,
  'the stored background intervals do not cover the agent, got: ' + JSON.stringify(storedBackground))
check(within(settledRow, node => node.props?.title === 'metricBackground').length > 0,
  'the settled agent row lost the remembered background time')
jobsState.rows['session-a'] = savedJobs

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
const totalsCostTitle = String(totalsChips[totalsChips.length - 1]?.props?.title)
check(totalsCostTitle.startsWith('metricCostApiSpend'), 'the totals row does not end with the cost')
check(totalsCostTitle.includes('metricCostEquivalent') && totalsCostTitle.includes('$0')
  && totalsCostTitle.includes('$1.23') && totalsCostTitle.includes('costPlanNote'),
'the totals cost tooltip does not carry both figures: ' + totalsCostTitle)

/* The same figures in CNY keep the yuan sign on both halves. */
for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetSlots()
const cnyProps = {
  ...props,
  services: {
    ...props.services,
    loadCosts: async () => ({ 'session-a': { equivalentCny: 9.1, realCny: 0, found: true } }),
  },
}
surface(tabBody(cnyProps))
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const cnyBoard = surface(tabBody(cnyProps))
const cnyRow = cnyBoard.nodes.find(node => node.props?.['data-agent-id'] === 'session-a'
  && node.props?.className === 'tk-agent-row')
const cnyCost = within(cnyRow, node => typeof node.props?.title === 'string'
  && node.props.title.startsWith('metricCostApiSpend'))[0]
check(cnyCost?.props?.title.includes('¥0') && cnyCost.props.title.includes('¥9.10'),
  'the CNY cost tooltip lost the yuan sign: ' + String(cnyCost?.props?.title))
// Return to the USD services and let the promises settle before the dialogs.
for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
surface(tabBody(props))
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()

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

/* Both section headers carry the sort menu, and it edits the same setting. */
const sortMenus = strip.nodes.filter(node => node.props?.className === 'tk-sort')
const sortButtons = strip.nodes.filter(node => node.props?.className === 'tk-sort-btn')
check(sortMenus.length === 2 && sortButtons.length === 2,
  'the section headers do not both carry a sort menu, got ' + sortButtons.length)
check(sortButtons.every(node => node.props?.['aria-haspopup'] === 'menu'
  && node.props?.['aria-expanded'] === 'false' && node.props?.['aria-label'] === 'setSorting'),
'the sort button has no localized accessibility state')
check(strip.texts.filter(text => text === 'setSortNewest').length === 2,
  'the section sort menus do not name the current option')
const agentsHeadNode = strip.nodes.find(node => node.props?.className === 'tk-agents-head')
const tasksHeadNode = strip.nodes.find(node => node.props?.className === 'tk-section-head')
check(within(agentsHeadNode, node => node.props?.className === 'tk-sort').length === 1,
  'the agents section header has no sort control')
check(within(tasksHeadNode, node => node.props?.className === 'tk-sort').length === 1,
  'the tasks section header has no sort control')
check(!strip.texts.includes('agentOpenHint'), 'the agents header still shows the static open-chat hint')

/* --- Role grouping: two agents of one role share a nested head -------- */

const sharedRoleState = (() => {
  const next = JSON.parse(JSON.stringify(listState))
  next.byId['session-b'].running = true
  next.projectionsBySession['session-b'].values.agentPreset = 'standard'
  // The role now comes from the name first; `builder-2` shares `builder`.
  next.projectionsBySession.root.values.subagentCatalog
    .find(entry => entry.id === 'session-b').name = 'builder-2'
  return next
})()
for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const sharedRole = surface(tabBody({ ...props, useSessions: selector => selector(sharedRoleState) }))
const sharedActive = sharedRole.nodes.find(node => node.props?.['data-agent-column'] === 'active')
const roleHead = within(sharedActive, node => node.props?.['data-target'] === 'agents:active:role:builder')[0]
check(roleHead !== undefined, 'two agents sharing a role did not get a nested group head')
check(roleHead?.props?.['data-subgroup'] === 'true', 'the nested group head is not marked as a subgroup')
check(within(roleHead, node => node.props?.className === 'tk-col-count')[0]?.props?.children === '2',
  'the nested group head does not count its members')
check(within(sharedActive, node => node.props?.className === 'tk-agent-row').length === 3,
  'the nested role group did not render its two members under the lead')
const sharedRows = within(sharedActive, node => node.props?.className === 'tk-agent-row')
check(sharedRows[0]?.props?.['data-lead'] === 'true' && sharedRows[1]?.props?.['data-agent-id'] === 'session-b',
  'agents inside a role group are not ordered newest first')
roleHead?.props?.onClick?.()
resetHooks()
const roleFolded = surface(tabBody({ ...props, useSessions: selector => selector(sharedRoleState) }))
const foldedRoleHead = within(roleFolded.nodes.find(node => node.props?.['data-agent-column'] === 'active'),
  node => node.props?.['data-target'] === 'agents:active:role:builder')[0]
check(foldedRoleHead?.props?.['aria-expanded'] === 'false', 'the nested group head did not report the folded state')
check(within(roleFolded.nodes.find(node => node.props?.['data-agent-column'] === 'active'),
  node => node.props?.className === 'tk-agent-row').length === 1,
'the folded nested group left its rows rendered')
foldedRoleHead?.props?.onClick?.()

// The harness default preset is still named `standard`; the role key must not
// turn it into one group when the agents have real names.
check(!sharedRole.nodes.some(node => String(node.props?.['data-target'] ?? '').includes('role:standard')),
  'the harness default preset still names an agent group')
// A generic name falls back to the preset, so two unnamed agents still group.
const genericNameState = (() => {
  const next = JSON.parse(JSON.stringify(listState))
  next.byId['session-b'].running = true
  next.projectionsBySession['session-b'].values.agentPreset = 'standard'
  next.projectionsBySession.root.values.subagentCatalog
    .find(entry => entry.id === 'session-a').name = 'agent-2'
  next.projectionsBySession.root.values.subagentCatalog
    .find(entry => entry.id === 'session-b').name = 'agent-3'
  return next
})()
resetHooks()
const genericNameBoard = surface(tabBody({ ...props, useSessions: selector => selector(genericNameState) }))
const genericActive = genericNameBoard.nodes.find(node => node.props?.['data-agent-column'] === 'active')
check(within(genericActive, node => node.props?.['data-target'] === 'agents:active:role:standard').length === 1,
  'a generic agent name did not fall back to the preset role')

/* Navigation: name -> main view, panel icon -> beside, owner -> main view. */
within(rowOf('session-a'), node => node.props?.className === 'tk-agent-name')[0]?.props?.onClick?.()
check(opened.length === 1 && opened[0][0] === 'session-a' && opened[0][1] === 'main', 'the agent name did not open the main view')
within(rowOf('session-a'), node => node.props?.className === 'tk-icon-btn tk-agent-jump')[0]?.props?.onClick?.()
check(opened.length === 2 && opened[1][1] === 'aside', 'the beside control did not ask for the side target')
const ownerLink = strip.nodes.find(node => node.props?.className === 'tk-owner-link')
check(ownerLink !== undefined, 'the card owner is not a link to the agent')
ownerLink?.props?.onClick?.({ stopPropagation: () => {} })
check(opened.length === 3 && opened[2][0] === 'session-a' && opened[2][1] === 'main', 'the card owner did not open the agent')

/* Hovering the owner line lights that agent's row in the strip. */
ownerLink?.props?.onMouseEnter?.()
resetHooks()
const hoveredOwner = surface(tabBody(props))
const litRows = hoveredOwner.nodes.filter(node => node.props?.className === 'tk-agent-row'
  && node.props?.['data-hover'] === 'true')
check(litRows.length === 1 && litRows[0].props['data-agent-id'] === 'session-a',
  'hovering a card owner did not highlight the agent row')
ownerLink?.props?.onMouseLeave?.()
resetHooks()
surface(tabBody(props))

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
check(withTask.nodes.find(node => node.props?.['data-task-id'] === 'task-1' && node.props?.role === 'dialog')
  ?.props?.style?.zoom === 1, 'the task dialog does not use the default dialog scale')
check(withTask.texts.includes('taskTimeline'), 'the task dialog lost its own timeline')
check(withTask.texts.includes('description'), 'the task dialog lost its description block')
check(withTask.texts.includes('Draw the columns.'), 'the task dialog lost the description text')
check(withTask.texts.includes('agentHeading'), 'the task dialog lost its agent block')
check(withTask.texts.includes('agentMetricsNote'), 'the agent metrics are not labelled as the agent session')
check(withTask.texts.includes('builder'), 'the task dialog does not name the owning agent')
check(withTask.texts.includes('agentOpen') && withTask.texts.includes('agentOpenAside') && withTask.texts.includes('agentDetails'),
  'the task dialog lost one of its agent actions')
check(withTask.nodes.some(node => node.props?.className === 'tk-stats'), 'the task dialog shows no compact agent metrics')

/* Every write scope is a real link; a folder asks for the Files page instead. */
const scopeLinks = withTask.nodes.filter(node => node.props?.className === 'tk-file-link')
check(scopeLinks.length === 2, 'the write scopes are not rendered as links, got ' + scopeLinks.length)
const fileLink = scopeLinks.find(node => node.props?.['data-scope'] === 'src/client')
const folderLink = scopeLinks.find(node => node.props?.['data-scope'] === 'src/client/')
check(fileLink?.props?.title === 'openFileHint', 'a file scope has no file-link hint')
check(folderLink?.props?.title === 'openFolderHint', 'a folder scope has no folder-link hint')
fileLink?.props?.onClick?.()
check(openedFiles.length === 1 && openedFiles[0][0] === 'root' && openedFiles[0][1] === 'src/client',
  'clicking a file scope did not open it in the workspace')
folderLink?.props?.onClick?.()
check(openedFiles.length === 2 && openedFiles[1][0] === 'root' && openedFiles[1][1] === 'src/client/',
  'clicking a folder scope did not ask for the files page')

/* The dialog has a Description and a Report tab; Report holds the final answer. */
const taskTabs = withTask.nodes.filter(node => node.props?.className === 'tk-tab')
check(taskTabs.length === 2, 'the task dialog does not have two tabs, got ' + taskTabs.length)
const descriptionTab = taskTabs.find(node => node.props?.['data-tab'] === 'description')
const reportTab = taskTabs.find(node => node.props?.['data-tab'] === 'report')
check(descriptionTab?.props?.role === 'tab' && descriptionTab.props['aria-selected'] === 'true',
  'the Description tab is not the selected tab')
check(reportTab?.props?.['aria-selected'] === 'false', 'the Report tab does not start unselected')
reportTab?.props?.onClick?.()
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
check(reportCalls.includes('session-a'), 'opening an owned task did not request its report')
resetHooks()
const reportTree = tabBody(props)
const reportView = surface(reportTree)
const selectedReport = reportView.nodes.find(node => node.props?.['data-tab'] === 'report')
check(selectedReport?.props?.['aria-selected'] === 'true', 'the Report tab did not become selected')
check(reportView.nodes.some(node => node.props?.['data-tabpanel'] === 'report' && node.props?.role === 'tabpanel'),
  'the Report tab has no panel')
check(reportView.joined.includes('Final answer from builder.'),
  'the Report tab lost the agent final answer, got: ' + reportView.joined.slice(0, 240))
check(!reportView.texts.includes('Draw the columns.'), 'the Report tab still renders the description blocks')
reportView.nodes.find(node => node.props?.['data-tab'] === 'description')?.props?.onClick?.()
resetHooks()
surface(tabBody(props))

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

// A fresh mount keeps the dialog's own fold state from colliding with the
// task dialog's hook slots in this minimal renderer.
for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetSlots()
surface(tabBody(props))
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const freshBoard = surface(tabBody(props))
const freshRow = freshBoard.nodes.find(node => node.props?.['data-agent-id'] === 'session-a'
  && node.props?.className === 'tk-agent-row')
check(freshRow?.props?.role === 'button', 'the agent row is not the dialog trigger')
freshRow?.props?.onClick?.()
resetHooks()
const withAgent = surface(tabBody(props))
check(withAgent.nodes.some(node => node.props?.['data-agent-dialog'] === 'session-a'), 'the agent dialog did not open')
check(withAgent.texts.includes('agentTasksHeading'), 'the agent dialog has no task list section')
check(withAgent.texts.includes('Wire the board'), 'the agent dialog does not list the task it owns')
check(withAgent.nodes.some(node => node.props?.className === 'tk-metrics'), 'the agent dialog has no metric grid')
check(withAgent.texts.includes('metricTokens') && withAgent.texts.includes('metricCostEquivalent'), 'the agent dialog lost its metrics')
check(withAgent.joined.includes('metricCostApiSpend') && withAgent.joined.includes('$0')
  && withAgent.joined.includes('$1.23'),
'the agent cost sub-line does not show both the real API spend and the equivalent')
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
check(dialogNode?.props?.style?.zoom === 1, 'the agent dialog does not use the default dialog scale')
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
const settledAgentRow = withAgent.nodes.find(node => node.props?.['data-agent-id'] === 'session-b'
  && node.props?.className === 'tk-agent-row')
settledAgentRow?.props?.onClick?.()
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

/** One board's persisted fold state, or undefined when nothing is stored. */
const foldState = (boardId = 'root') => {
  const raw = storage.get(COLLAPSE_STORAGE_KEY)
  if (raw === undefined) return undefined
  return JSON.parse(raw)?.boards?.[boardId]
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
const firstQueued = within(cappedQueued, node => node.props?.['data-task-id'] !== undefined)[0]
check(firstQueued?.props?.['data-task-id'] === 'task-bulk-8',
  'the default newest-first order does not put the newest id on top: ' + String(firstQueued?.props?.['data-task-id']))

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
check(noJobsRow?.props?.role === 'button', 'the agent row is not clickable without the jobs service')
noJobsRow?.props?.onClick?.()
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
  boards: {
    root: {
      sections: { agents: false, tasks: true },
      groups: { 'agents:active': true, 'agents:done': false, 'agents:idle': false },
    },
  },
}
storage.set(COLLAPSE_STORAGE_KEY, JSON.stringify(seeded))
const storedSeed = JSON.parse(storage.get(COLLAPSE_STORAGE_KEY))
check(storedSeed?.boards?.root?.sections?.tasks === true
  && storedSeed?.boards?.root?.groups?.['agents:active'] === true,
'the seeded per-board fold state did not round-trip through the mocked storage')

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

/* --- View settings: custom grouping and the flat fallback -------------- */

const SETTINGS_STORAGE_KEY = 'dsh.agent-team-viewer.settings.v1'

/** Load another copy of the bundle so its view-settings store is re-read. */
const boardFromFreshBundle = (state = listState, sessionId = props.sessionId) => {
  let captured
  const target = { ...globalThis.window, __ModuleLoader__: { load: definition => { captured = definition } } }
  new Function('window', artifact)(target)
  const plugin = captured.factory((name) => {
    if (name === 'react') return React
    throw new Error('unexpected require: ' + name)
  })
  plugin.apply(ctx)
  resetSlots()
  resetHooks()
  return surface(tabBody({ ...props, sessionId, useSessions: selector => selector(state) }))
}

/* --- The fold state is scoped to one board ----------------------------- */

const twoRootsState = (() => {
  const next = JSON.parse(JSON.stringify(listState))
  next.ids = [...next.ids, 'root-two']
  next.byId['root-two'] = { id: 'root-two', running: false, updatedAt: 0 }
  next.byId['session-c'] = { id: 'session-c', parentId: 'root-two', running: true, updatedAt: 0 }
  next.projectionsBySession['root-two'] = {
    values: {
      subagentCatalog: [{ id: 'session-c', mode: 'continuable', name: 'tester', createdAt: 99 }],
      agentTeam: {
        enabled: true,
        tasks: [{
          id: 'task-9',
          revision: 1,
          subject: 'Second board task',
          description: '',
          status: 'in_progress',
          blockedBy: [],
          writeScopes: [],
          ownerId: 'session-c',
          ownerName: 'tester',
          ready: true,
          writeScopeWarnings: [],
        }],
      },
    },
  }
  return next
})()
storage.set(COLLAPSE_STORAGE_KEY, JSON.stringify({
  boards: {
    root: { sections: { tasks: true }, groups: { 'agents:active': true } },
    'root-two': { sections: { tasks: false }, groups: { 'agents:active': false } },
  },
}))
const perBoardRoot = boardFromFreshBundle(listState)
check(!perBoardRoot.nodes.some(node => node.props?.className === 'tk-board'),
  "the root board's stored folded tasks section did not hide its board")
const perBoardRootActive = perBoardRoot.nodes.find(node => node.props?.['data-agent-column'] === 'active')
check(within(perBoardRootActive, node => node.props?.className === 'tk-agent-row').length === 0,
  "the root board's stored folded agent group did not fold")
// One bundle instance serves both boards, exactly as the real page does.
resetSlots()
resetHooks()
const perBoardTwo = surface(tabBody({ ...props, sessionId: 'session-c', useSessions: selector => selector(twoRootsState) }))
check(perBoardTwo.nodes.some(node => node.props?.className === 'tk-board'),
  "the second board inherited the first board's folded tasks section")
const perBoardTwoActive = perBoardTwo.nodes.find(node => node.props?.['data-agent-column'] === 'active')
check(within(perBoardTwoActive, node => node.props?.className === 'tk-agent-row').length === 1,
  "the second board inherited the first board's folded agent group")

// Unfolding on one board must not touch the other board's stored entry.
foldButton(perBoardRoot, 'section', 'tasks')?.props?.onClick?.()
const afterUnfold = JSON.parse(storage.get(COLLAPSE_STORAGE_KEY))
check(afterUnfold.boards.root.sections.tasks === false,
  'unfolding the root board was not stored under its own id')
check(afterUnfold.boards['root-two'].sections.tasks === false
  && afterUnfold.boards['root-two'].groups['agents:active'] === false,
'the root board write changed the second board')
resetHooks()
const perBoardTwoAgain = surface(tabBody({ ...props, sessionId: 'session-c', useSessions: selector => selector(twoRootsState) }))
foldButton(perBoardTwoAgain, 'group', 'agents:active')?.props?.onClick?.()
const afterTwoFold = JSON.parse(storage.get(COLLAPSE_STORAGE_KEY))
check(afterTwoFold.boards['root-two'].groups['agents:active'] === true,
  'folding the second board was not stored under its own id')
check(afterTwoFold.boards.root.groups['agents:active'] === true
  && afterTwoFold.boards.root.sections.tasks === false,
'folding the second board changed the root board')

// The pre-0.2 flat shape carried no board id; it must not fold every board.
storage.set(COLLAPSE_STORAGE_KEY, JSON.stringify({
  sections: { tasks: true },
  groups: { 'tasks:queued': true },
}))
const legacyFoldBoard = boardFromFreshBundle()
check(legacyFoldBoard.nodes.some(node => node.props?.className === 'tk-board'),
  'the legacy flat fold shape leaked into a board')
check(legacyFoldBoard.nodes.some(node => node.props?.['data-task-id'] === 'task-2'),
  'the legacy flat fold shape hid a task card')

// The seeded fold state above would hide the columns; start from a clean one.
storage.delete(COLLAPSE_STORAGE_KEY)
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({
  autoRoleGroups: true,
  customGroups: true,
  customGroupsText: 'crew: standard',
  sort: 'newest',
  animateCards: false,
  animationMs: 0,
  uiScale: 1,
}))
const customBoard = boardFromFreshBundle()
const customActive = customBoard.nodes.find(node => node.props?.['data-agent-column'] === 'active')
const customHead = within(customActive, node => node.props?.['data-target'] === 'agents:active:custom:crew')[0]
check(customHead !== undefined, 'the custom group editor did not produce a group head')
check(within(customHead, node => node.props?.className === 'tk-col-count')[0]?.props?.children === '1',
  'the custom group head does not count its single member')
check(within(customActive, node => node.props?.className === 'tk-agent-row').length === 2,
  'the custom group did not keep the lead and its one member')

// With both grouping switches off the column goes back to a flat list.
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ autoRoleGroups: false, customGroups: false }))
const flatBoard = boardFromFreshBundle()
check(!flatBoard.nodes.some(node => node.props?.['data-subgroup'] !== undefined),
  'a subgroup head is rendered with both grouping switches off')
check(flatBoard.nodes.filter(node => node.props?.className === 'tk-agent-row').length === 3,
  'the flat fallback lost an agent row')

// ...and the flat rows still follow the view sort, with the Lead pinned first.
const flatSortState = JSON.parse(JSON.stringify(listState))
flatSortState.byId['session-a'].running = false
delete flatSortState.projectionsBySession['session-b'].values.subagentTiming
const flatIdleRows = rendered => {
  const idle = rendered.nodes.find(node => node.props?.['data-agent-column'] === 'idle')
  return within(idle, node => node.props?.className === 'tk-agent-row').map(node => node.props?.['data-agent-id'])
}
const setFlatSort = sort => {
  storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ autoRoleGroups: false, customGroups: false, sort }))
  return boardFromFreshBundle(flatSortState)
}
const newestFlatRows = flatIdleRows(setFlatSort('newest'))
check(newestFlatRows.join(',') === 'session-b,session-a',
  'the flat agent strip ignores the newest-first view sort, got: ' + newestFlatRows.join(','))
const oldestFlatRows = flatIdleRows(setFlatSort('oldest'))
check(oldestFlatRows.join(',') === 'session-a,session-b',
  'the flat agent strip ignores the oldest-first view sort, got: ' + oldestFlatRows.join(','))
const nameFlatRows = flatIdleRows(setFlatSort('name'))
check(nameFlatRows.join(',') === 'session-a,session-b',
  'the flat agent strip ignores the name view sort, got: ' + nameFlatRows.join(','))

// The header menu writes the same `sort` preference the Settings page edits.
const sortable = boardFromFreshBundle()
sortable.nodes.find(node => node.props?.className === 'tk-sort-btn')
  ?.props?.onClick?.({ stopPropagation: () => {} })
resetHooks()
const menuOpen = surface(tabBody(props))
const sortOptions = menuOpen.nodes.filter(node => node.props?.className === 'tk-sort-option')
check(sortOptions.length === 3, 'the sort menu does not offer three options, got ' + sortOptions.length)
check(menuOpen.nodes.some(node => node.props?.className === 'tk-sort-btn' && node.props?.['aria-expanded'] === 'true'),
  'the sort menu did not report itself open')
check(sortOptions.every(node => node.props?.role === 'menuitemradio'),
  'the sort options do not expose the radio menu role')
sortOptions.find(node => node.props?.['data-value'] === 'oldest')
  ?.props?.onClick?.({ stopPropagation: () => {} })
check(JSON.parse(storage.get(SETTINGS_STORAGE_KEY)).sort === 'oldest',
  'the header sort menu did not persist the view sort')

// The dialog scale is its own preference: a seeded value zooms only the panel.
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ sort: 'newest', dialogScale: 1.25 }))
const scaledBoard = boardFromFreshBundle()
const scaledCard = scaledBoard.nodes.find(node => typeof node.type === 'function'
  && node.type.name === 'TaskCard' && node.props?.task?.id === 'task-1')
scaledCard?.props?.onOpen?.('task-1')
resetHooks()
const scaledTree = surface(tabBody(props))
const scaledInspector = scaledTree.nodes.find(node => node.props?.['data-task-id'] === 'task-1'
  && node.props?.role === 'dialog')
check(scaledInspector?.props?.style?.zoom === 1.25,
  'the dialog scale setting is not applied to the task dialog, got: ' + JSON.stringify(scaledInspector?.props?.style))

// The Settings page exposes both scale sliders.
resetSlots()
const settingsView = surface(settingsSection({ t: key => key }))
const scaleRanges = settingsView.nodes.filter(node => node.props?.className === 'tk-set-range')
check(scaleRanges.some(node => node.props?.['aria-label'] === 'setScale'),
  'the Settings page lost the panel scale slider')
check(scaleRanges.some(node => node.props?.['aria-label'] === 'setDialogScale'),
  'the Settings page has no dialog scale slider')

/* --- The sort menu reorders the columns, not only the stored value ----- */

const sortOrderState = JSON.parse(JSON.stringify(listState))
sortOrderState.projectionsBySession.root.values.agentTeam.tasks.push({
  id: 'task-4',
  revision: 1,
  subject: 'Newest queued task',
  description: '',
  status: 'pending',
  blockedBy: [],
  writeScopes: [],
  ready: true,
  writeScopeWarnings: [],
})
// task-2 is blocked in the shipped fixture; unblock it so the queued column
// holds two cards with different first-seen stamps.
const sortOldTask = sortOrderState.projectionsBySession.root.values.agentTeam.tasks.find(task => task.id === 'task-2')
sortOldTask.blockedBy = []
sortOldTask.ready = true
/** The queued column's card ids, in render order. */
const queuedOrder = rendered => {
  const queued = rendered.nodes.find(node => node.props?.['data-column'] === 'queued')
  return within(queued, node => node.props?.['data-task-id'] !== undefined).map(node => node.props['data-task-id'])
}
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({
  autoRoleGroups: false, customGroups: false, sort: 'newest',
}))
// The first pass records the new task's first-seen stamp; the second render
// reads that ledger back exactly as a page reload would.
boardFromFreshBundle(sortOrderState)
resetSlots()
resetHooks()
const newestMenuBoard = surface(tabBody({ ...props, useSessions: selector => selector(sortOrderState) }))
check(queuedOrder(newestMenuBoard)[0] === 'task-4',
  'the newest-first default does not put the freshly seen task on top: ' + queuedOrder(newestMenuBoard).join(','))
const headerSorters = newestMenuBoard.nodes.filter(node => node.props?.className === 'tk-sort-btn')
check(headerSorters.length === 2, 'the two header sort controls are missing')
headerSorters[1]?.props?.onClick?.({ stopPropagation: () => {} })
resetHooks()
const openedSortMenu = surface(tabBody({ ...props, useSessions: selector => selector(sortOrderState) }))
openedSortMenu.nodes.find(node => node.props?.className === 'tk-sort-option' && node.props?.['data-value'] === 'oldest')
  ?.props?.onClick?.({ stopPropagation: () => {} })
const switchedOrderBoard = boardFromFreshBundle(sortOrderState)
check(queuedOrder(switchedOrderBoard)[0] === 'task-2',
  'the header sort menu did not reorder the column oldest-first: ' + queuedOrder(switchedOrderBoard).join(','))
check(JSON.parse(storage.get(SETTINGS_STORAGE_KEY)).sort === 'oldest',
  'the header sort menu did not persist the switched order')

/* --- The dialog scale reaches the agent dialog as well ----------------- */

storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({
  sort: 'newest', autoRoleGroups: false, customGroups: false, dialogScale: 1.25,
}))
const scaledAgentBoard = boardFromFreshBundle()
scaledAgentBoard.nodes.find(node => node.props?.['data-agent-id'] === 'session-a'
  && node.props?.className === 'tk-agent-row')?.props?.onClick?.()
resetHooks()
const scaledAgentTree = surface(tabBody(props))
const scaledAgentDialog = scaledAgentTree.nodes.find(node => node.props?.['data-agent-dialog'] === 'session-a')
check(scaledAgentDialog?.props?.style?.zoom === 1.25,
  'the dialog scale is not applied to the agent dialog, got: ' + JSON.stringify(scaledAgentDialog?.props?.style))

/* --- Remembered background time survives a roster drop on a fresh page - */

const savedAgentRoster = jobsState.rows['session-a']
const savedBackgroundText = storage.get(BACKGROUND_STORAGE_KEY)
jobsState.rows['session-a'] = []
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ autoRoleGroups: false, customGroups: false }))
const droppedRosterBoard = boardFromFreshBundle()
const droppedRosterRow = droppedRosterBoard.nodes.find(node => node.props?.['data-agent-id'] === 'session-a'
  && node.props?.className === 'tk-agent-row')
check(droppedRosterRow !== undefined, 'the agent row disappeared with its roster')
check(within(droppedRosterRow, node => node.props?.title === 'metricBackground').length > 0,
  'a roster drop erased the remembered background time on a fresh page')
const droppedBackground = JSON.parse(storage.get(BACKGROUND_STORAGE_KEY) ?? '{}')
check(Array.isArray(droppedBackground['session-a']) && droppedBackground['session-a'].length > 0,
  'a roster drop erased the persisted background intervals: ' + JSON.stringify(droppedBackground))
check(storage.get(BACKGROUND_STORAGE_KEY) === savedBackgroundText,
  'an empty roster rewrote the persisted background intervals')
jobsState.rows['session-a'] = savedAgentRoster

/* --- Settings store: sanitized reads and clamped writes ---------------- */

storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({
  autoRoleGroups: 'yes',
  customGroups: true,
  customGroupsText: 42,
  sort: 'bogus',
  animateCards: false,
  animationMs: 99999,
  uiScale: 0.01,
  dialogScale: 9,
}))
const clampedBoard = boardFromFreshBundle()
const clampedRoot = clampedBoard.nodes.find(node => node.props?.className === 'tk-root')
check(clampedRoot?.props?.style?.zoom === 0.8,
  'the sanitized panel scale was not applied to the board root, got: ' + JSON.stringify(clampedRoot?.props?.style))
resetSlots()
const clampedSettings = surface(settingsSection({ t: key => key }))
const settingBoxes = clampedSettings.nodes.filter(node => node.props?.type === 'checkbox')
check(settingBoxes.length === 3, 'the Settings page lost a grouping or animation checkbox')
check(settingBoxes[0]?.props?.checked === true && settingBoxes[1]?.props?.checked === true
  && settingBoxes[2]?.props?.checked === false,
'the Settings page does not render the sanitized booleans')
const settingTextarea = clampedSettings.nodes.find(node => node.props?.className === 'tk-set-text')
check(settingTextarea?.props?.value === '' && settingTextarea?.props?.disabled === false,
  'the custom-groups editor did not sanitize a non-string value')
const settingSelect = clampedSettings.nodes.find(node => node.props?.className === 'tk-set-select')
check(settingSelect?.props?.value === 'newest', 'the Settings page did not fall back to the default sort')
const rangeByLabel = (rendered, label) => rendered.nodes.find(node => node.props?.type === 'range'
  && node.props?.['aria-label'] === label)
const animationRange = rangeByLabel(clampedSettings, 'setAnimationDuration')
check(animationRange?.props?.value === 1000 && animationRange?.props?.disabled === true,
  'the animation duration was not clamped to its maximum')
check(rangeByLabel(clampedSettings, 'setScale')?.props?.value === 0.8,
  'the panel scale was not clamped to its minimum')
check(rangeByLabel(clampedSettings, 'setDialogScale')?.props?.value === 1.4,
  'the dialog scale was not clamped to its maximum')
check(clampedSettings.texts.includes('1000 setMs'),
  'the clamped animation duration has no value label')
check(clampedSettings.texts.includes('x0.80') && clampedSettings.texts.includes('x1.40'),
  'a clamped scale has no formatted value label')
// Every control writes through the same sanitizer.
animationRange?.props?.onChange?.({ target: { value: '9999' } })
rangeByLabel(clampedSettings, 'setScale')?.props?.onChange?.({ target: { value: '5' } })
settingSelect?.props?.onChange?.({ target: { value: 'bogus' } })
const clampedWrite = JSON.parse(storage.get(SETTINGS_STORAGE_KEY))
check(clampedWrite.animationMs === 1000 && clampedWrite.uiScale === 1.4 && clampedWrite.dialogScale === 1.4,
  'the settings writer did not clamp an out-of-range value: ' + JSON.stringify(clampedWrite))
check(clampedWrite.sort === 'newest' && clampedWrite.autoRoleGroups === true
  && clampedWrite.customGroups === true && clampedWrite.customGroupsText === '',
'the settings writer did not sanitize the invalid fields: ' + JSON.stringify(clampedWrite))
settingTextarea?.props?.onChange?.({ target: { value: 'crew: builder, reviewer\nqa: test' } })
check(JSON.parse(storage.get(SETTINGS_STORAGE_KEY)).customGroupsText === 'crew: builder, reviewer\nqa: test',
  'the custom-groups text was not stored verbatim')

/* --- Task dialog Report: loading, ready and empty ---------------------- */

// A dedicated owner keeps late async updates from the earlier dialog tests,
// which are keyed by `session-a`, away from these Report states.
const reportState = JSON.parse(JSON.stringify(listState))
reportState.byId['session-report'] = { id: 'session-report', parentId: 'root', running: false, updatedAt: 0 }
reportState.projectionsBySession.root.values.agentTeam.tasks.push({
  id: 'task-report',
  revision: 1,
  subject: 'Report task',
  description: '',
  status: 'in_progress',
  blockedBy: [],
  writeScopes: [],
  ready: true,
  ownerId: 'session-report',
  ownerName: 'reporter',
  writeScopeWarnings: [],
})

/** Mount the board, open one task, and leave the task dialog on its Report tab. */
const openTaskReport = (taskId, loadAgentReport) => {
  const testProps = {
    ...props,
    useSessions: selector => selector(reportState),
    services: { ...props.services, loadAgentReport },
  }
  resetSlots()
  resetHooks()
  const start = surface(tabBody(testProps))
  start.nodes.find(node => typeof node.type === 'function' && node.type.name === 'TaskCard'
    && node.props?.task?.id === taskId)?.props?.onOpen?.(taskId)
  resetHooks()
  const opened = surface(tabBody(testProps))
  opened.nodes.find(node => node.props?.['data-tab'] === 'report')?.props?.onClick?.()
  resetHooks()
  return { props: testProps, view: surface(tabBody(testProps)) }
}
const loadingReport = openTaskReport('task-report', () => new Promise(() => {}))
check(loadingReport.view.nodes.some(node => node.props?.['data-report'] === 'loading'),
  'the Report tab does not show its loading state while the answer is pending')
check(loadingReport.view.texts.includes('reportLoading'), 'the loading state has no localized note')
check(!loadingReport.view.nodes.some(node => node.props?.['data-report'] === 'ready'),
  'the Report tab claimed a ready answer before one arrived')
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const stillLoadingReport = surface(tabBody(loadingReport.props))
check(stillLoadingReport.nodes.some(node => node.props?.['data-report'] === 'loading'),
  'the Report tab dropped its loading state without an answer')
const readyReportProps = {
  ...loadingReport.props,
  services: {
    ...loadingReport.props.services,
    loadAgentReport: async () => 'The held report.',
  },
}
resetHooks()
surface(tabBody(readyReportProps))
for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const readyReport = surface(tabBody(readyReportProps))
const readyReportPanel = readyReport.nodes.find(node => node.props?.['data-tabpanel'] === 'report')
check(readyReportPanel !== undefined, 'the Report panel disappeared after the answer arrived')
check(readyReport.nodes.some(node => node.props?.['data-report'] === 'ready')
  && surface(readyReportPanel).joined.includes('The held report.'),
'the Report tab did not show the agent final answer: ' + surface(readyReportPanel)?.joined?.slice(0, 200))
const emptyReport = openTaskReport('task-report', async () => undefined)
for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const emptyReportView = surface(tabBody(emptyReport.props))
const emptyReportPanel = emptyReportView.nodes.find(node => node.props?.['data-tabpanel'] === 'report')
check(emptyReportView.nodes.some(node => node.props?.['data-report'] === 'empty'),
  'an agent without a final answer did not show the empty Report state')
check(surface(emptyReportPanel).texts.includes('reportEmptyNote'),
  'the empty Report state has no explanation')
check(surface(emptyReportPanel).texts.includes('agentOpen'),
  'the empty Report state has no open-chat fallback')

/* --- loadAgentReport waits for the chat snapshot ----------------------- */

const heldState = { releaseCount: 0, chatClosed: 0 }
let chatRows = []
let publishChat
const heldChat = {
  getSnapshot: () => ({ nodes: { values: () => chatRows } }),
  subscribe: listener => {
    publishChat = listener
    return () => { heldState.chatClosed += 1 }
  },
}
const heldSessions = {
  retain: () => ({
    binding: { sessionId: 'session-a' },
    ready: Promise.resolve(),
    release: () => { heldState.releaseCount += 1 },
  }),
  subagentAddress: () => ({ childSessionId: 'session-a', parentSessionId: 'root', mode: 'continuable' }),
}
const previousGet = ctx.get
ctx.get = name => {
  if (name === 'sessions') return heldSessions
  if (name === 'uiConversation') return { binding: () => ({ target: () => heldChat }) }
  return undefined
}
const heldReport = boardServices.loadAgentReport('session-a')
let heldSettled = false
heldReport.then(() => { heldSettled = true })
await new Promise(resolve => setTimeout(resolve, 20))
check(heldSettled === false, 'the report reader resolved while the never-opened chat was still empty')
chatRows = [{
  kind: 'assistant-step',
  anchorSeq: 4,
  data: { blocks: [{ kind: 'reasoning', text: 'not the answer' }, { kind: 'text', text: '  Held final answer.  ' }] },
}]
publishChat()
const heldAnswer = await heldReport
check(heldAnswer === 'Held final answer.',
  'the report reader did not return the answer that filled the snapshot: ' + String(heldAnswer))
check(heldState.releaseCount === 1, 'the report reader did not release its retained reference')
check(heldState.chatClosed === 1, 'the report reader did not unsubscribe from the chat target')

// A builder that answers from inside subscribe still unsubscribes and resolves.
heldState.releaseCount = 0
heldState.chatClosed = 0
let syncRows = []
const syncChat = {
  getSnapshot: () => ({ nodes: { values: () => syncRows } }),
  subscribe: listener => {
    syncRows = [{
      kind: 'assistant-step',
      anchorSeq: 7,
      data: { blocks: [{ kind: 'text', text: 'Synchronous answer.' }] },
    }]
    listener()
    return () => { heldState.chatClosed += 1 }
  },
}
ctx.get = name => {
  if (name === 'sessions') return heldSessions
  if (name === 'uiConversation') return { binding: () => ({ target: () => syncChat }) }
  return undefined
}
check(await boardServices.loadAgentReport('session-a') === 'Synchronous answer.',
  'a chat target that answers inside subscribe did not resolve')
check(heldState.chatClosed === 1, 'a synchronous subscriber leaked its chat subscription')
check(heldState.releaseCount === 1, 'a synchronous subscriber leaked its reference')

// A target without a subscription resolves immediately and still releases.
heldState.releaseCount = 0
ctx.get = name => {
  if (name === 'sessions') return heldSessions
  if (name === 'uiConversation') {
    return { binding: () => ({ target: () => ({ getSnapshot: () => ({ nodes: { values: () => [] } }) }) }) }
  }
  return undefined
}
check(await boardServices.loadAgentReport('session-a') === undefined,
  'an empty chat target without a subscription did not resolve empty')
check(heldState.releaseCount === 1, 'the no-subscription path leaked its reference')

// A failed initial open settles the wait empty and clears its timer.
heldState.releaseCount = 0
ctx.get = name => {
  if (name === 'sessions') {
    return {
      retain: () => ({
        binding: { sessionId: 'session-a' },
        ready: Promise.reject(new Error('open failed')),
        release: () => { heldState.releaseCount += 1 },
      }),
    }
  }
  if (name === 'uiConversation') {
    return {
      binding: () => ({
        target: () => ({
          getSnapshot: () => ({ nodes: { values: () => [] } }),
          subscribe: () => () => {},
        }),
      }),
    }
  }
  return undefined
}
check(await boardServices.loadAgentReport('session-a') === undefined,
  'a failed chat open rejected instead of resolving empty')
check(heldState.releaseCount === 1, 'the failed-open path leaked its reference')

// Missing services and invalid owners are silent, as before.
ctx.get = () => undefined
check(await boardServices.loadAgentReport('session-a') === undefined,
  'a missing sessions service rejected')
check(await boardServices.loadAgentReport('') === undefined, 'an empty owner id rejected')

/* --- Write scopes: real file addresses and the folder heuristic -------- */

const navigation = { tabs: [], resources: [] }
ctx.get = name => (name === 'sidebarRight'
  ? {
    openTab: kind => { navigation.tabs.push(kind) },
    openResource: address => { navigation.resources.push(address) },
  }
  : undefined)
boardServices.openFileLink('root', 'src/client')
check(navigation.resources[0] === 'dsh-resource://file/session/root/src/client',
  'a file write scope did not become a file resource: ' + String(navigation.resources[0]))
boardServices.openFileLink('root', 'C:\\work\\file name.ts')
check(navigation.resources[1] === 'dsh-resource://file/session/root/C:/work/file%20name.ts',
  'the file resource did not encode a workspace path: ' + String(navigation.resources[1]))
boardServices.openFileLink('root', 'src/client/')
check(navigation.tabs[0] === 'files', 'a trailing-slash folder scope did not open the Files page')
boardServices.openFileLink('root', 'src\\client\\')
check(navigation.tabs[1] === 'files', 'a trailing-backslash folder scope did not open the Files page')
boardServices.openFileLink('root', '')
boardServices.openFileLink('', 'src/client')
check(navigation.tabs.length === 2 && navigation.resources.length === 2,
  'an empty scope or session id was treated as a link')
ctx.get = previousGet

/* --- Report ----------------------------------------------------------- */

if (failures.length > 0) {
  console.error('FAILED (' + failures.length + ')')
  for (const failure of failures) console.error(' - ' + failure)
  process.exit(1)
}

console.log('smoke ok: ' + registrations.length + ' slot registrations, ' + strip.texts.length + ' strip texts, '
  + withTask.texts.length + ' task texts, ' + withAgent.texts.length + ' agent texts, ' + effects.length + ' effects, ' + storage.size + ' storage keys')
