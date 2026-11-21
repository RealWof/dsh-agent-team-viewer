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
const refSlots = {}
let hookIndex = 0
let refIndex = 0
const resetHooks = () => {
  hookIndex = 0
  refIndex = 0
}
/**
 * When set, `useRef` keeps its box in a hook slot like React does across the
 * re-renders of one mount. Off by default: most checks re-render the whole
 * tree without a real mount, and the shipped hooks stay boxed per call there.
 */
let persistRefs = false
/**
 * When set, an effect's cleanup waits for `flushCleanups()` instead of running
 * the moment the effect is created, which is what a real unmount does. Tests
 * that keep one component mounted across re-renders turn this on.
 */
let deferCleanups = false
const deferredCleanups = []
const flushCleanups = () => {
  const pending = deferredCleanups.splice(0)
  for (const cleanup of pending) cleanup()
}

/** Wipe the hook slots so the next render is a fresh mount. */
const resetSlots = () => {
  for (const key of Object.keys(stateSlots)) delete stateSlots[key]
  for (const key of Object.keys(refSlots)) delete refSlots[key]
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
    if (typeof cleanup !== 'function') return
    if (deferCleanups) {
      deferredCleanups.push(cleanup)
      return
    }
    cleanup()
  },
  useMemo: compute => compute(),
  useCallback: callback => callback,
  useRef: (initial) => {
    if (!persistRefs) return { current: initial }
    // A separate key space keeps `useState` indices identical to the default
    // render, so a stale async setter from an earlier mount cannot land on a
    // state slot this one uses.
    const index = refIndex++
    if (!(index in refSlots)) refSlots[index] = { current: initial }
    return refSlots[index]
  },
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
let settingsIcon
let settingsIconRegistration
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

/** The service lookup the plugin's `ctx.get` answers; tests may swap it. */
let ctxGet = () => undefined
const ctx = {
  get: (...args) => ctxGet(...args),
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
      if (options.name === 'settings.section.icon') {
        settingsIcon = component
        settingsIconRegistration = options
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
check(settingsRegistration?.label?.() === 'Agent Team Viewer',
  'the Settings nav item is not the literal plugin name')
check(settingsRegistration?.label?.('ru') === 'Agent Team Viewer',
  'the Settings nav item follows the language instead of the literal plugin name')
check(settingsRegistration?.locale === 'agent-team-viewer', 'the Settings section lost its locale namespace')
check(settingsIconRegistration?.name === 'settings.section.icon', 'the Settings nav icon was not registered')
check(settingsIconRegistration?.id === settingsRegistration?.id,
  'the Settings nav icon id does not match the section id')
check(settingsIconRegistration?.locale === 'agent-team-viewer', 'the Settings nav icon lost its locale namespace')

/* The injected service face the body reads. */
const boardServices = boardRegistration?.inject?.('session-a')?.services
check(boardServices !== undefined, 'the board registration injects no services')
check(typeof boardServices?.loadAgentReport === 'function', 'the board has no agent-report reader')
check(typeof boardServices?.openFileLink === 'function', 'the board has no write-scope opener')

/* The local-path checker: folders use `list`, files use `stat`, and a file
   miss falls back to `list` because an API may not classify a directory. */
const pathCalls = []
const fakeWorkspaceFiles = {
  stat: async (sessionId, path) => {
    pathCalls.push(['stat', sessionId, path])
    if (path === 'gone.js' || path === 'plainfolder' || path === 'listerr') {
      return { ok: false, error: { code: 'workspace-file/not-found' } }
    }
    if (path === 'dir') {
      return { ok: false, error: { code: 'workspace-file/not-regular-file', details: { kind: 'directory' } } }
    }
    if (path === 'weird') return { ok: false, error: { code: 'gateway/bad-request' } }
    return { ok: true, value: { absolutePath: path } }
  },
  list: async (sessionId, path) => {
    pathCalls.push(['list', sessionId, path])
    if (path === 'nodir' || path === 'gone.js') return { ok: false, error: { code: 'workspace-file/not-found' } }
    if (path === 'listerr') return { ok: false, error: { code: 'gateway/bad-request' } }
    return { ok: true, value: { entries: [], truncated: false } }
  },
}
ctxGet = name => {
  if (name === 'remote.workspaceFiles') return fakeWorkspaceFiles
  if (name === 'remote') return { workspaceFiles: fakeWorkspaceFiles }
  return undefined
}
check(typeof boardServices?.checkLocalPath === 'function', 'the board has no local-path checker')
check(await boardServices.checkLocalPath('root', 'src\\client\\', undefined) === true,
  'an existing folder is not reported as present')
check(pathCalls[0]?.[0] === 'list' && pathCalls[0]?.[1] === 'root' && pathCalls[0]?.[2] === 'src/client',
  'a folder path did not delegate to the workspace list, got: ' + JSON.stringify(pathCalls[0]))
check(await boardServices.checkLocalPath('root', 'src\\client\\10-settings.js', undefined) === true,
  'an existing file is not reported as present')
check(pathCalls[1]?.[0] === 'stat' && pathCalls[1]?.[2] === 'src/client/10-settings.js',
  'a file path did not delegate to stat with a normalized path: ' + JSON.stringify(pathCalls[1]))
check(await boardServices.checkLocalPath('root', 'gone.js', undefined) === false,
  'a not-found answer is not reported as missing')
check(await boardServices.checkLocalPath('root', 'dir', undefined) === true,
  'a directory a file stat rejects is not reported as present')
check(await boardServices.checkLocalPath('root', 'nodir/', undefined) === false,
  'a missing folder is not reported as missing')
check(await boardServices.checkLocalPath('root', 'weird', undefined) === undefined,
  'an unclassifiable Remote error is reported as a verdict')
check(await boardServices.checkLocalPath('root', 'plainfolder', undefined) === true,
  'a folder a file stat calls not-found is not confirmed through list')
check(pathCalls[pathCalls.length - 2]?.[0] === 'stat'
  && pathCalls[pathCalls.length - 2]?.[2] === 'plainfolder'
  && pathCalls[pathCalls.length - 1]?.[0] === 'list'
  && pathCalls[pathCalls.length - 1]?.[2] === 'plainfolder',
'a stat miss did not fall back to the workspace list for the same path: '
  + JSON.stringify(pathCalls.slice(-2)))
check(await boardServices.checkLocalPath('root', 'listerr', undefined) === undefined,
  'a list error after a stat miss is reported as a verdict')
check(await boardServices.checkLocalPath('root', 'src/unity-integration/Assets/Plugins/CUE4Parse/', undefined) === true,
  'a nested folder scope with a trailing slash is not reported as present')
check(pathCalls[pathCalls.length - 1]?.[0] === 'list'
  && pathCalls[pathCalls.length - 1]?.[2] === 'src/unity-integration/Assets/Plugins/CUE4Parse',
'a folder scope did not delegate to the workspace list: ' + JSON.stringify(pathCalls[pathCalls.length - 1]))
ctxGet = () => undefined
check(await boardServices.checkLocalPath('root', 'src/client', undefined) === undefined,
  'the checker reports a verdict without the workspace-files Remote')

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
check(!board.nodes.some(node => node.props?.className === 'tk-stat' && cardNodes.some(card => card === node)), 'a card still renders session statistics')
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

/* Only the outer status group headers repeat the column's state dot; a nested
   role/custom head stays chevron + title + count. Cards and agent rows keep
   their own dot. */
const groupHeadNodes = board.nodes.filter(node => node.props?.['data-fold'] === 'group')
check(groupHeadNodes.length > 0, 'the board has no group header')
const outerHeads = groupHeadNodes.filter(head => head.props?.['data-subgroup'] === undefined)
const outerTargets = outerHeads.map(head => head.props?.['data-target'])
check(['tasks:queued', 'tasks:blocked', 'tasks:active', 'tasks:done', 'agents:active', 'agents:done', 'agents:idle']
  .every(target => outerTargets.includes(target)),
'not every status column has an outer group header: ' + outerTargets.join(','))
check(outerHeads.every(head => within(head, node => node.props?.className === 'tk-state').length === 1),
  'an outer status group header lost its state dot')
const nestedHeads = groupHeadNodes.filter(head => head.props?.['data-subgroup'] === 'true')
check(nestedHeads.every(head => within(head, node => node.props?.className === 'tk-state').length === 0),
  'a nested group header still carries a state dot')
const headDotState = target => within(groupHeadNodes.find(node => node.props?.['data-target'] === target),
  node => node.props?.className === 'tk-state')[0]?.props?.['data-state']
check(headDotState('tasks:queued') === 'idle' && headDotState('tasks:blocked') === 'warning'
  && headDotState('tasks:active') === 'ongoing' && headDotState('tasks:done') === 'done'
  && headDotState('agents:active') === 'ongoing' && headDotState('agents:idle') === 'idle',
'the outer group dots do not follow the column state: '
  + ['tasks:queued', 'tasks:blocked', 'tasks:active', 'tasks:done', 'agents:active', 'agents:idle']
    .map(target => target + '@' + headDotState(target)).join(', '))
check(board.nodes.some(node => node.props?.className === 'tk-state'), 'the task cards lost their state dot')
check(within(rowOf('session-a'), node => node.props?.className === 'tk-state').length > 0,
  'the agent row lost its state dot')

/* The word beside an agent name is the DSH subagent mode: its tooltip names
   the mode and explains it, and the Lead has no mode at all. */
const modeSpanOf = id => within(rowOf(id), node => node.props?.className === 'tk-agent-mode')[0]
const modeTitle = String(modeSpanOf('session-a')?.props?.title ?? '')
check(modeSpanOf('session-a')?.props?.children === 'continuable',
  'the continuable agent lost its mode word beside the name')
check(modeTitle.includes('agentMode') && modeTitle.includes('continuable')
  && modeTitle.includes('agentModeHint'),
'the agent mode has no localized explanation: ' + modeTitle)
check(String(modeSpanOf('session-b')?.props?.title ?? '').includes('one-shot'),
  'the one-shot agent mode has no mode name in its tooltip')
check(String(modeSpanOf('session-b')?.props?.title ?? '').includes('agentModeHint'),
  'the one-shot agent mode does not share the explanation')
check(modeSpanOf('root') === undefined, 'the Lead row shows a subagent mode')

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
check(jobsMetaChildren.every(child => child?.props?.className !== 'tk-chip tk-agent-jobs'),
  'the jobs chip is still on the metric line')
const jobsMain = within(rowOf('session-a'), node => node.props?.className === 'tk-agent-main')[0]
const jobsMainChildren = Array.isArray(jobsMain?.props?.children) ? jobsMain.props.children : []
const chipMainIndex = jobsMainChildren.indexOf(ownerChip)
const jumpMainIndex = jobsMainChildren.findIndex(child => child?.props?.className === 'tk-icon-btn tk-agent-jump')
check(chipMainIndex > 0 && chipMainIndex === jumpMainIndex - 1,
  'the jobs chip does not sit right before the jump button on the title row')

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
  // The base is the part before the first `-`, so both builders share
  // `builder` while the ordinal-like suffix differs.
  next.projectionsBySession.root.values.subagentCatalog
    .find(entry => entry.id === 'session-a').name = 'builder-b1'
  next.projectionsBySession.root.values.subagentCatalog
    .find(entry => entry.id === 'session-b').name = 'builder-b2'
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
check(within(roleHead, node => node.props?.className === 'tk-state').length === 0,
  'a nested group head still carries a state dot')
const sharedOuterHead = within(sharedActive, node => node.props?.['data-target'] === 'agents:active')[0]
check(within(sharedOuterHead, node => node.props?.className === 'tk-state').length === 1,
  'the outer agent status header lost its state dot beside nested groups')
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

// The harness default preset is still named `standard`; the role base never
// falls back to it, so no `standard` group appears.
check(!sharedRole.nodes.some(node => String(node.props?.['data-target'] ?? '').includes('role:standard')),
  'the harness default preset still names an agent group')

// All names unique: no base repeats, so the whole column becomes one Ungrouped
// head when Roles is on, and the two `standard` presets still do not group.
const uniqueNameState = (() => {
  const next = JSON.parse(JSON.stringify(listState))
  next.byId['session-b'].running = true
  next.projectionsBySession['session-b'].values.agentPreset = 'standard'
  return next
})()
resetHooks()
const uniqueNameBoard = surface(tabBody({ ...props, useSessions: selector => selector(uniqueNameState) }))
const uniqueActive = uniqueNameBoard.nodes.find(node => node.props?.['data-agent-column'] === 'active')
check(within(uniqueActive, node => String(node.props?.['data-target'] ?? '').includes(':role:')).length === 0,
  'a unique name base still produced a role group')
const uniqueUngrouped = within(uniqueActive, node => node.props?.['data-target'] === 'agents:active:ungrouped')
check(uniqueUngrouped.length === 1, 'all-unique agent names did not produce exactly one Ungrouped head')
check(within(uniqueUngrouped[0], node => node.props?.className === 'tk-col-count')[0]?.props?.children === '2',
  'the all-unique Ungrouped head does not count both agents')
check(within(uniqueActive, node => String(node.props?.['data-target'] ?? '').includes('role:standard')).length === 0,
  'the harness default preset still names an agent group')

// round1/round2/round3 share the base `round` even without a separator.
const roundState = (() => {
  const next = JSON.parse(JSON.stringify(listState))
  next.byId['session-b'].running = true
  next.ids.push('session-c')
  next.byId['session-c'] = { id: 'session-c', parentId: 'root', running: true, updatedAt: 0 }
  next.projectionsBySession['session-c'] = { values: {} }
  const catalog = next.projectionsBySession.root.values.subagentCatalog
  catalog.find(entry => entry.id === 'session-a').name = 'round1'
  catalog.find(entry => entry.id === 'session-b').name = 'round2'
  catalog.push({ id: 'session-c', mode: 'continuable', name: 'round3', createdAt: 3 })
  return next
})()
resetHooks()
const roundBoard = surface(tabBody({ ...props, useSessions: selector => selector(roundState) }))
const roundActive = roundBoard.nodes.find(node => node.props?.['data-agent-column'] === 'active')
const roundHead = within(roundActive, node => node.props?.['data-target'] === 'agents:active:role:round')[0]
check(roundHead !== undefined, 'round1/round2/round3 did not share the round group')
check(within(roundHead, node => node.props?.className === 'tk-col-count')[0]?.props?.children === '3',
  'the round group does not count its three agents')
check(within(roundActive, node => node.props?.['data-target'] === 'agents:active:ungrouped').length === 0,
  'a column with only a repeated base got an Ungrouped head')

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
check(withTask.texts.includes('builder'), 'the task dialog does not name the owning agent')
// The agent actions live in the header's right corner, left of the close
// control, and the agent section keeps no action footer of its own.
const taskDialogNode = withTask.nodes.find(node => node.props?.['data-task-id'] === 'task-1'
  && node.props?.role === 'dialog')
const taskHead = within(taskDialogNode, node => node.props?.className === 'tk-insp-head')[0]
const headActionBar = within(taskHead, node => node.props?.className === 'tk-insp-actions')[0]
check(headActionBar !== undefined, 'the task dialog header has no agent actions')
const headActionLabels = within(headActionBar, node => node.type === 'button')
  .map(node => node.props?.['aria-label'])
check(headActionLabels.join(',') === 'agentOpenHint,agentOpenAsideHint',
  'the task dialog header actions are not the open/aside controls: ' + headActionLabels.join(','))
check(within(headActionBar, node => node.type === 'button' && node.props?.className === 'tk-icon-btn').length === 2,
  'the task dialog header actions are not compact icon buttons')
const headChildren = Array.isArray(taskHead?.props?.children) ? taskHead.props.children : []
check(headChildren.findIndex(child => child?.props?.className === 'tk-insp-actions')
  === headChildren.length - 2, 'the agent actions are not immediately left of the close button')
check(headChildren[headChildren.length - 1]?.props?.['aria-label'] === 'close',
  'the close button is not the last control of the task dialog header')
check(within(taskDialogNode, node => node.props?.className === 'tk-actions').length === 0,
  'the agent block still carries the old action footer')

/* The owning agent's statistics live in the header meta line, right after
   the assignee chip, instead of a second line in the Agent section. */
const taskMeta = within(taskHead, node => node.props?.className === 'tk-insp-meta')[0]
const taskStats = within(taskMeta, node => node.props?.className === 'tk-insp-stats')[0]
check(taskStats !== undefined, 'the task dialog header shows no compact agent statistics')
check(taskStats?.props?.title === 'agentMetricsNote' && taskStats?.props?.['aria-label'] === 'agentMetricsNote',
  'the header agent statistics are not labelled as the agent session')
check(within(taskStats, node => node.props?.className === 'tk-stat').length > 0,
  'the header agent statistics render no figures')
check(within(taskDialogNode, node => node.props?.className === 'tk-stat').length
  === within(taskStats, node => node.props?.className === 'tk-stat').length,
'the agent statistics are duplicated outside the task dialog header')
const metaKids = Array.isArray(taskMeta?.props?.children) ? taskMeta.props.children : []
const assigneeAt = metaKids.findIndex(child => child?.props?.className === 'tk-chip tk-owner-chip')
const statsAt = metaKids.findIndex(child => child?.props?.className === 'tk-insp-stats')
check(assigneeAt >= 0 && statsAt === assigneeAt + 1,
  'the header statistics do not follow the assignee chip: ' + assigneeAt + ' vs ' + statsAt)
check(artifact.includes('.tk-insp-stats{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;min-width:0;max-width:100%}'),
  'the header statistics have no compact inline stylesheet rule')

/* The assignee chip is the details affordance: a real button with the
   details tooltip, and the separate gauge control is gone. */
const taskOwnerChip = metaKids[assigneeAt]
check(taskOwnerChip?.type === 'button', 'the task dialog assignee chip is not an interactive button')
check(taskOwnerChip?.props?.title === 'agentDetails' && taskOwnerChip?.props?.['aria-label'] === 'agentDetails',
  'the assignee chip has no agent-details tooltip')
check(surface(taskOwnerChip).texts.includes('builder'), 'the clickable assignee chip lost the owner name')
check(within(headActionBar, node => node.type === 'button'
  && node.props?.['aria-label'] === 'agentDetails').length === 0,
  'the task dialog header still carries the separate details button')
check(artifact.includes('.tk-owner-chip{font-family:inherit;min-width:0;max-width:100%;padding:0 5px;overflow:hidden;cursor:pointer}'),
  'the clickable assignee chip has no stylesheet rule')

/* The task dialog is two columns: facts on the left, Markdown on the right. */
const taskDialog = withTask.nodes.find(node => node.props?.['data-task-id'] === 'task-1'
  && node.props?.role === 'dialog')
check(taskDialog?.props?.['data-layout'] === 'task', 'the task dialog does not opt into the wide two-column layout')
const splitBody = within(taskDialog, node => node.props?.className === 'tk-insp-body tk-insp-split')[0]
check(splitBody !== undefined, 'the task dialog body is not the two-column grid')
const metaColumn = within(splitBody, node => node.props?.['data-inspector-column'] === 'meta')[0]
const textColumn = within(splitBody, node => node.props?.['data-inspector-column'] === 'text')[0]
check(metaColumn !== undefined && textColumn !== undefined, 'the task dialog is missing a column')
const metaTexts = surface(metaColumn).texts
check(metaTexts.includes('taskTimeline') && metaTexts.includes('agentHeading')
  && metaTexts.includes('dependencies') && metaTexts.includes('writeScopes'),
'the metadata column lost a task block')
check(!metaTexts.includes('Draw the columns.'), 'the description still lives in the metadata column')
const descriptionProse = within(textColumn, node => node.props?.className === 'tk-insp-prose')[0]
check(descriptionProse?.props?.tabIndex === 0 && descriptionProse?.props?.role === 'tabpanel',
  'the Markdown scroll box is not a focusable tab panel')
check(descriptionProse?.props?.['data-tabpanel'] === 'description',
  'the Description tab does not draw its own scroll panel')
check(surface(descriptionProse).texts.includes('Draw the columns.'), 'the Markdown column lost the description text')
check(within(textColumn, node => node.props?.className === 'tk-tabs').length === 1,
  'the Description/Report tabs are not in the text column')
check(within(metaColumn, node => node.props?.className === 'tk-tabs').length === 0,
  'the tabs are still in the metadata column')
check(artifact.includes('.tk-insp[data-layout="task"]{width:min(860px,100%);max-width:min(860px,96vw)'),
  'the task dialog is not sized to the tight two-column width in the stylesheet')
check(artifact.includes('grid-template-columns:minmax(0,240px) minmax(0,1fr);gap:14px;align-items:start'),
  'the task dialog grid does not start-align a 240px metadata column')
check(artifact.includes('.tk-insp[data-layout="task"] .tk-insp-body{padding:10px 12px 12px}'),
  'the task dialog body still carries the full inspector padding')
check(artifact.includes('border-right:1px solid var(--dsw-alias-border-l1)'),
  'the metadata column has no vertical hairline divider')
check(artifact.includes('.tk-insp-aside{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;max-height:min(54vh,460px)'),
  'the metadata column lost its own capped scroll box')
check(artifact.includes('.tk-insp-prose{'), 'the Markdown scroll box has no stylesheet rule')
check(artifact.includes('@media (max-width:640px)'), 'the two-column layout has no narrow-screen fallback')
check(artifact.includes('.tk-insp-aside{border-right:0;padding-right:0}'),
  'the narrow layout keeps the metadata divider')

/* A secondary note wraps below its heading when the narrow metadata column
   runs out of room instead of being squeezed beside it or clipped. */
check(artifact.includes('.tk-sec-head{display:flex;align-items:center;gap:5px;flex-wrap:wrap;row-gap:2px;min-width:0}'),
  'section headers do not wrap their note below the heading')
check(artifact.includes('.tk-sec-head>.tk-sec-title{flex:1 1 auto;min-width:0}'),
  'section titles cannot shrink beside a note')
check(artifact.includes('.tk-sec-note{min-width:0;flex:0 1 auto;max-width:100%;margin-left:auto;'),
  'section notes are not shrinkable and right-aligned on their line')
check(artifact.includes('.tk-sec-note-below{display:block;width:100%;flex:0 0 auto;margin-left:0;text-align:left}'),
  'a note below its heading is not a full-width, left-aligned line')
check(artifact.includes('.tk-kv dd{min-width:0;margin:0;overflow-wrap:anywhere;word-break:break-word;font-variant-numeric:tabular-nums}'),
  'definition-list values do not wrap in the narrow metadata column')
check(artifact.includes('font-variant-numeric:tabular-nums;\n  min-width:0;overflow-wrap:anywhere}'),
  'mono values have no wrapping rule')

/** The rendered `.tk-sec` block whose heading is `title`. */
const sectionBlock = (rendered, title) => rendered.nodes.find(node => {
  if (node.props?.className !== 'tk-sec') return false
  const kids = Array.isArray(node.props?.children) ? node.props.children : []
  return kids.some(child => child?.props?.className === 'tk-sec-head'
    && (Array.isArray(child.props.children) ? child.props.children : [])
      .some(grand => grand?.props?.className === 'tk-sec-title' && grand.props.children === title))
})
/** The heading row, its children, and the line directly under it. */
const sectionParts = block => {
  const kids = Array.isArray(block?.props?.children) ? block.props.children : []
  const head = kids.find(child => child?.props?.className === 'tk-sec-head')
  const headKids = Array.isArray(head?.props?.children) ? head.props.children : []
  return { kids, head, headKids, below: kids[kids.indexOf(head) + 1] }
}
const noteIn = headKids => headKids.some(child => child?.props?.className === 'tk-sec-note')

/* An empty section states its absence under the heading, full width and
   left-aligned, instead of keeping the note beside the title. */
const depsParts = sectionParts(sectionBlock(withTask, 'dependencies'))
check(!noteIn(depsParts.headKids),
  'the empty dependencies note still sits in the shared section heading row')
check(depsParts.below?.props?.className === 'tk-sec-note tk-sec-note-below'
  && depsParts.below.props.children === 'noDependencies',
'the empty dependencies note is not a full-width line under its heading')
const timelineParts = sectionParts(sectionBlock(withTask, 'taskTimeline'))
check(noteIn(timelineParts.headKids), 'a default section note left the shared heading row')

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

/* The assignee chip opens the owning agent's dialog on top of the task
   dialog, which comes back when the stacked dialog closes. */
taskOwnerChip?.props?.onClick?.()
resetHooks()
const stackedDialogs = surface(tabBody(props))
check(stackedDialogs.nodes.some(node => node.props?.['data-agent-dialog'] === 'session-a'),
  'clicking the assignee chip did not open the agent dialog')
const ownTarget = {}
stackedDialogs.nodes.filter(node => node.props?.className === 'tk-backdrop').pop()
  ?.props?.onMouseDown?.({ target: ownTarget, currentTarget: ownTarget })
resetHooks()
const backToTask = surface(tabBody(props))
check(backToTask.nodes.some(node => node.props?.['data-task-id'] === 'task-1' && node.props?.role === 'dialog'),
  'closing the stacked agent dialog lost the task dialog')

/* A task without an owner keeps the plain, non-interactive chip. */
const ownerlessCard = withTask.nodes.find(node => typeof node.type === 'function'
  && node.type.name === 'TaskCard' && node.props?.task?.id === 'task-2')
ownerlessCard?.props?.onOpen?.('task-2')
resetHooks()
const ownerlessDialog = surface(tabBody(props))
const ownerlessNode = ownerlessDialog.nodes.find(node => node.props?.['data-task-id'] === 'task-2'
  && node.props?.role === 'dialog')
const ownerlessMeta = within(ownerlessNode, node => node.props?.className === 'tk-insp-meta')[0]
const ownerlessChildren = Array.isArray(ownerlessMeta?.props?.children) ? ownerlessMeta.props.children : []
check(ownerlessChildren.find(child => child?.props?.children === 'statusUnowned')?.type?.name === 'Chip',
  'a task without an owner got a clickable assignee chip')
check(!ownerlessDialog.classes.has('tk-owner-chip'),
  'an ownerless task rendered the clickable owner-chip styles')

/* Navigating from the task dialog must also close it. */
const openFromTask = within(taskTree, node => node.type === 'button'
  && node.props?.['aria-label'] === 'agentOpenHint')[0]
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

/* The dialog order is stats, facts, tasks, background jobs. */
const atText = label => withAgent.texts.indexOf(label)
check(atText('statsHeading') < atText('stateLabel') && atText('stateLabel') < atText('agentTasksHeading')
  && atText('agentTasksHeading') < atText('jobsHeading'),
'the agent dialog blocks are out of order: ' + ['statsHeading', 'stateLabel', 'agentTasksHeading', 'jobsHeading']
  .map(key => key + '@' + atText(key)).join(', '))

/* Both lists scroll inside the dialog and fold from their headers. */
const dialogNode = withAgent.nodes.find(node => node.props?.['data-agent-dialog'] === 'session-a')
check(dialogNode?.props?.style?.zoom === 1, 'the agent dialog does not use the default dialog scale')
check(dialogNode?.props?.['data-layout'] === undefined, 'the agent dialog picked up the task two-column layout')

/* The agent actions live in the header's right corner, left of the close
   control, and the dialog body keeps no action footer of its own. */
const agentDialogHead = within(dialogNode, node => node.props?.className === 'tk-insp-head')[0]
const agentHeadActionBar = within(agentDialogHead, node => node.props?.className === 'tk-insp-actions')[0]
check(agentHeadActionBar !== undefined, 'the agent dialog header has no agent actions')
const agentHeadActionLabels = within(agentHeadActionBar, node => node.type === 'button')
  .map(node => node.props?.['aria-label'])
check(agentHeadActionLabels.join(',') === 'agentOpenHint,agentOpenAsideHint',
  'the agent dialog header actions are not the open/aside controls: ' + agentHeadActionLabels.join(','))
check(within(agentHeadActionBar, node => node.type === 'button' && node.props?.className === 'tk-icon-btn').length === 2,
  'the agent dialog header actions are not compact icon buttons')
const agentHeadChildren = Array.isArray(agentDialogHead?.props?.children) ? agentDialogHead.props.children : []
check(agentHeadChildren.findIndex(child => child?.props?.className === 'tk-insp-actions')
  === agentHeadChildren.length - 2, 'the agent actions are not immediately left of the close button')
check(agentHeadChildren[agentHeadChildren.length - 1]?.props?.['aria-label'] === 'close',
  'the close button is not the last control of the agent dialog header')
check(within(dialogNode, node => node.props?.className === 'tk-actions').length === 0,
  'the agent dialog still carries its old action footer')
within(agentHeadActionBar, node => node.type === 'button' && node.props?.['aria-label'] === 'agentOpenHint')[0]
  ?.props?.onClick?.()
check(opened.length === 5 && opened[4]?.[0] === 'session-a' && opened[4]?.[1] === 'main',
  'the agent header open action did not open the agent chat')
// The header action closes the dialog through the board; reopen it for the
// fold and list checks below.
resetHooks()
const reopenedAgentBoard = surface(tabBody(props))
reopenedAgentBoard.nodes.find(node => node.props?.['data-agent-id'] === 'session-a'
  && node.props?.className === 'tk-agent-row')?.props?.onClick?.()
resetHooks()
const metricTiles = within(dialogNode, node => node.props?.className === 'tk-metric')
const backgroundTile = metricTiles.find(tile => surface(tile).texts.includes('metricBackground'))
check(backgroundTile !== undefined, 'the agent dialog has no background-time tile')
check(surface(backgroundTile).joined.includes('unitMin'),
  'the background-time tile does not show the background span: ' + surface(backgroundTile).joined)
const taskScroller = within(dialogNode, node => node.props?.className === 'tk-list')[0]
const jobScroller = within(dialogNode, node => node.props?.className === 'tk-jobs')[0]
check(taskScroller !== undefined && jobScroller !== undefined, 'the agent dialog lists are missing')
check(taskScroller?.props?.tabIndex === 0 && jobScroller?.props?.tabIndex === 0,
  'an agent dialog list is not a keyboard-focusable scroll box')
check(taskScroller?.props?.role === 'group' && taskScroller?.props?.['aria-label'] === 'agentTasksHeading',
  'the task list has no accessible group label')
check(jobScroller?.props?.role === 'group' && jobScroller?.props?.['aria-label'] === 'jobsHeading',
  'the background-process list has no accessible group label')
check(artifact.includes('.tk-insp[data-agent-dialog] .tk-jobs')
  && artifact.includes('.tk-insp[data-agent-dialog] .tk-list'),
'the agent dialog lists have no dedicated scroll styles')

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

/* A task row in the agent dialog still opens the task dialog. */
const dialogTaskLink = withAgent.nodes.find(node => node.props?.className === 'tk-task-link')
check(dialogTaskLink !== undefined, 'the agent dialog has no task link')
dialogTaskLink?.props?.onClick?.()
resetHooks()
const afterTaskLink = surface(tabBody(props))
check(afterTaskLink.nodes.some(node => node.props?.['data-task-id'] === 'task-1' && node.props?.role === 'dialog'),
  'a task row in the agent dialog did not open the task dialog')
check(!afterTaskLink.nodes.some(node => node.props?.['data-agent-dialog'] === 'session-a'),
  'the agent dialog stayed open after its task row was clicked')

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

/* --- Task custom groups ------------------------------------------------ */

storage.delete(COLLAPSE_STORAGE_KEY)
const taskGroupState = JSON.parse(JSON.stringify(listState))
taskGroupState.projectionsBySession.root.values.agentTeam.tasks.push({
  id: 'task-5',
  revision: 1,
  subject: 'Review docs',
  description: '',
  status: 'pending',
  blockedBy: [],
  writeScopes: [],
  ready: true,
  writeScopeWarnings: [],
})
taskGroupState.projectionsBySession.root.values.agentTeam.tasks.push({
  id: 'task-6',
  revision: 1,
  subject: 'Chore',
  description: '',
  status: 'pending',
  blockedBy: [],
  writeScopes: [],
  ready: true,
  writeScopeWarnings: [],
})
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({
  autoRoleGroups: false,
  customGroups: false,
  taskCustomGroups: true,
  taskCustomGroupsText: 'board: Wire\nreview: Review',
  sort: 'newest',
}))
const taskGroupBoard = boardFromFreshBundle(taskGroupState)
const groupedActive = taskGroupBoard.nodes.find(node => node.props?.['data-column'] === 'active')
const boardTaskHead = within(groupedActive, node => node.props?.['data-target'] === 'tasks:active:custom:board')[0]
check(boardTaskHead !== undefined, 'a task matching a custom group got no group head')
check(boardTaskHead?.props?.['data-subgroup'] === 'true', 'the task group head is not marked as a subgroup')
check(within(boardTaskHead, node => node.props?.className === 'tk-state').length === 0,
  'a nested custom task group head carries a state dot')
check(within(boardTaskHead, node => node.props?.className === 'tk-col-count')[0]?.props?.children === '1',
  'the task group head does not count its tasks')
const boardTaskBody = within(groupedActive, node => node.props?.['data-group-body'] === 'tasks:active:custom:board')[0]
check(within(boardTaskBody, node => node.props?.['data-task-id'] === 'task-1').length === 1,
  'the matching task is missing from its custom group')
const groupedQueued = taskGroupBoard.nodes.find(node => node.props?.['data-column'] === 'queued')
const reviewTaskHead = within(groupedQueued, node => node.props?.['data-target'] === 'tasks:queued:custom:review')[0]
check(reviewTaskHead !== undefined, 'the second task custom group got no head')
const reviewTaskBody = within(groupedQueued, node => node.props?.['data-group-body'] === 'tasks:queued:custom:review')[0]
check(within(reviewTaskBody, node => node.props?.['data-task-id'] === 'task-5').length === 1,
  'the task matching the second group is missing')
const unmatchedTask = within(groupedQueued, node => node.props?.['data-task-id'] === 'task-6')
check(unmatchedTask.length === 1, 'an unmatched task disappeared instead of staying flat')
check(within(reviewTaskBody, node => node.props?.['data-task-id'] === 'task-6').length === 0,
  'an unmatched task was filed under a custom group it does not match')
// The unmatched tasks get their own Ungrouped head because another group exists.
const taskUngroupedHead = within(groupedQueued, node => node.props?.['data-target'] === 'tasks:queued:ungrouped')[0]
check(taskUngroupedHead !== undefined, 'the unmatched tasks did not get an Ungrouped head')
check(taskUngroupedHead?.props?.['data-subgroup'] === 'true',
  'the tasks Ungrouped head is not marked as a subgroup')
check(within(taskUngroupedHead, node => node.props?.className === 'tk-col-title')[0]?.props?.children === 'ungrouped',
  'the tasks Ungrouped head is not titled by the dictionary key')
check(within(taskUngroupedHead, node => node.props?.className === 'tk-col-count')[0]?.props?.children === '1',
  'the tasks Ungrouped head does not count its leftover task')
const taskUngroupedBody = within(groupedQueued, node => node.props?.['data-group-body'] === 'tasks:queued:ungrouped')[0]
check(within(taskUngroupedBody, node => node.props?.['data-task-id'] === 'task-6').length === 1,
  'the unmatched task is missing from its Ungrouped group')
// A column whose tasks all miss the custom groups stays flat: no empty group.
const groupedDone = taskGroupBoard.nodes.find(node => node.props?.['data-column'] === 'done')
check(within(groupedDone, node => node.props?.['data-task-id'] === 'task-3').length === 1,
  'an unmatched task in a column without a group disappeared')
check(within(groupedDone, node => node.props?.['data-target'] === 'tasks:done:ungrouped').length === 0,
  'an Ungrouped head was drawn for a column with no other group')

// The custom task group folds through the same board-scoped state as agents.
reviewTaskHead?.props?.onClick?.()
const taskGroupFold = JSON.parse(storage.get(COLLAPSE_STORAGE_KEY))
check(taskGroupFold.boards.root.groups['tasks:queued:custom:review'] === true,
  'the task group fold was not stored, got: ' + JSON.stringify(taskGroupFold))
resetHooks()
const taskGroupFolded = surface(tabBody({ ...props, useSessions: selector => selector(taskGroupState) }))
const foldedQueued = taskGroupFolded.nodes.find(node => node.props?.['data-column'] === 'queued')
check(within(foldedQueued, node => node.props?.['data-task-id'] === 'task-5').length === 0,
  'the folded task group left its cards rendered')
check(within(foldedQueued, node => node.props?.['data-target'] === 'tasks:queued:custom:review').length === 1,
  'the folded task group lost its head')

// An over-long task group caps and scrolls like an agent group.
storage.delete(COLLAPSE_STORAGE_KEY)
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({
  autoRoleGroups: false,
  customGroups: false,
  taskCustomGroups: true,
  taskCustomGroupsText: 'bulk: Bulk',
  sort: 'newest',
}))
const bulkGroupState = bulkState('completed', 8)
const bulkGroupBoard = boardFromFreshBundle(bulkGroupState)
const bulkDone = bulkGroupBoard.nodes.find(node => node.props?.['data-column'] === 'done')
const bulkTaskHead = within(bulkDone, node => node.props?.['data-target'] === 'tasks:done:custom:bulk')[0]
check(bulkTaskHead !== undefined, 'the over-long task group has no head')
check(within(bulkTaskHead, node => node.props?.className === 'tk-col-count')[0]?.props?.children === '8',
  'the over-long task group lost its count')
const bulkTaskCards = within(bulkDone, node => node.props?.['data-task-id']?.startsWith?.('task-bulk-'))
check(bulkTaskCards.length === 5, 'the capped task group did not show five cards, got ' + bulkTaskCards.length)
const bulkMore = within(bulkDone, node => node.props?.className === 'tk-more')[0]
check(bulkMore?.props?.['data-remaining'] === '3', 'the over-long task group has no show-all control')
bulkMore?.props?.onClick?.()
resetHooks()
const bulkGroupExpanded = surface(tabBody({ ...props, useSessions: selector => selector(bulkGroupState) }))
const expandedDone = bulkGroupExpanded.nodes.find(node => node.props?.['data-column'] === 'done')
const bulkScroll = within(expandedDone, node => node.props?.className === 'tk-col-items')[0]
check(bulkScroll !== undefined, 'the expanded task group does not scroll inside its column')
check(within(bulkScroll, node => node.props?.['data-task-id']?.startsWith?.('task-bulk-')).length === 8,
  'the expanded task group did not reveal the whole pile')

// A task group past the auto-collapse threshold folds itself on first sight.
// The status column is seeded unfolded, because a bigger status group would
// otherwise fold first and hide the nested group entirely.
storage.set(COLLAPSE_STORAGE_KEY, JSON.stringify({
  boards: { root: { sections: { tasks: false }, groups: { 'tasks:done': false } } },
}))
const bigTaskGroupBoard = boardFromFreshBundle(bulkState('completed', 13))
const bigTaskDone = bigTaskGroupBoard.nodes.find(node => node.props?.['data-column'] === 'done')
const bigTaskHead = within(bigTaskDone, node => node.props?.['data-target'] === 'tasks:done:custom:bulk')[0]
check(bigTaskHead?.props?.['aria-expanded'] === 'false',
  'a task group past the auto-collapse threshold did not start folded')
check(within(bigTaskDone, node => node.props?.['data-task-id']?.startsWith?.('task-bulk-')).length === 0,
  'the auto-collapsed task group rendered its cards')
const bigTaskFold = JSON.parse(storage.get(COLLAPSE_STORAGE_KEY))
check(bigTaskFold.boards.root.groups['tasks:done:custom:bulk'] === true,
  'the task group auto-collapse was not stored')

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
// The other agent missed the custom group; its unique base still puts it in
// one Ungrouped head, because the Roles switch is on.
const customDone = customBoard.nodes.find(node => node.props?.['data-agent-column'] === 'done')
check(within(customDone, node => node.props?.className === 'tk-agent-row').length === 1,
  'the ungrouped agent left its column')
const customDoneUngrouped = within(customDone, node => node.props?.['data-target'] === 'agents:done:ungrouped')[0]
check(customDoneUngrouped !== undefined,
  'an unmatched agent with a unique base did not get an Ungrouped head')
check(within(customDoneUngrouped, node => node.props?.className === 'tk-col-count')[0]?.props?.children === '1',
  'the unmatched agent\'s Ungrouped head does not count it')

// A unique base beside a repeated one joins an Ungrouped head.
const leftoverRoleState = JSON.parse(JSON.stringify(sharedRoleState))
leftoverRoleState.byId['session-c'] = { id: 'session-c', parentId: 'root', running: true, updatedAt: 0 }
leftoverRoleState.projectionsBySession['session-c'] = { values: {} }
leftoverRoleState.projectionsBySession.root.values.subagentCatalog.push(
  { id: 'session-c', mode: 'continuable', name: 'reviewer-x1', createdAt: 3 },
)
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ autoRoleGroups: true, customGroups: false }))
const leftoverRoleBoard = boardFromFreshBundle(leftoverRoleState)
const leftoverActive = leftoverRoleBoard.nodes.find(node => node.props?.['data-agent-column'] === 'active')
const leftoverBuilder = within(leftoverActive,
  node => node.props?.['data-target'] === 'agents:active:role:builder')[0]
check(leftoverBuilder !== undefined, 'the repeated builder base lost its role group')
const leftoverUngrouped = within(leftoverActive,
  node => node.props?.['data-target'] === 'agents:active:ungrouped')[0]
check(leftoverUngrouped !== undefined, 'a unique base was left flat beside a role group')
check(within(leftoverUngrouped, node => node.props?.className === 'tk-col-title')[0]?.props?.children === 'ungrouped',
  'the unique-base Ungrouped head is not titled by the dictionary key')
check(within(leftoverUngrouped, node => node.props?.className === 'tk-col-count')[0]?.props?.children === '1',
  'the unique-base Ungrouped head does not count its agent')
check(within(leftoverActive, node => node.props?.className === 'tk-agent-row').length === 4,
  'the unique-base Ungrouped group lost a row')

// With both grouping switches off the column goes back to a flat list.
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ autoRoleGroups: false, customGroups: false }))
const flatBoard = boardFromFreshBundle()
check(!flatBoard.nodes.some(node => node.props?.['data-subgroup'] !== undefined),
  'a subgroup head is rendered with both grouping switches off')
check(flatBoard.nodes.filter(node => node.props?.className === 'tk-agent-row').length === 3,
  'the flat fallback lost an agent row')

// With Roles on and no repeated base in a column, the whole column is one
// Ungrouped group, not a flat list.
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ autoRoleGroups: true, customGroups: false }))
const singletonBoard = boardFromFreshBundle()
const singletonActive = singletonBoard.nodes.find(node => node.props?.['data-agent-column'] === 'active')
const singletonDone = singletonBoard.nodes.find(node => node.props?.['data-agent-column'] === 'done')
check(!singletonBoard.nodes.some(node => String(node.props?.['data-target'] ?? '').includes(':role:')),
  'a unique base still produced a role group')
check(within(singletonActive, node => node.props?.['data-target'] === 'agents:active:ungrouped').length === 1,
  'the all-unique active column is not one Ungrouped group')
check(within(singletonDone, node => node.props?.['data-target'] === 'agents:done:ungrouped').length === 1,
  'the all-unique done column is not one Ungrouped group')

/* --- Grouping switches in the two section headers ---------------------- */

storage.delete(COLLAPSE_STORAGE_KEY)
const groupingTogglesOf = (rendered, headClass) => {
  const head = rendered.nodes.find(node => node.props?.className === headClass)
  return within(head, node => node.props?.className === 'tk-group-toggle')
}
const headerChildren = head => (Array.isArray(head?.props?.children) ? head.props.children : [])
/** Whether every grouping switch of a header comes before its sort control. */
const togglesBeforeSort = head => {
  const kids = headerChildren(head)
  const sortIndex = kids.findIndex(child => typeof child?.type === 'function' && child.type.name === 'SortSelect')
  const toggleIndexes = []
  for (let index = 0; index < kids.length; index += 1) {
    const child = kids[index]
    if (typeof child?.type === 'function' && child.type.name === 'GroupingToggle') toggleIndexes.push(index)
  }
  return sortIndex >= 0 && toggleIndexes.length > 0 && toggleIndexes.every(index => index < sortIndex)
}

// Each header switch is one Settings checkbox: the agents header owns the
// roles and custom flags, the tasks header owns the custom task flag. No
// combined switch and no remembered combined state exist any more.
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({
  autoRoleGroups: true,
  customGroups: true,
  customGroupsText: 'crew: standard',
  taskCustomGroups: false,
  taskCustomGroupsText: 'review: Review',
}))
const agentToggleBoard = boardFromFreshBundle(sharedRoleState)
const agentToggleHead = agentToggleBoard.nodes.find(node => node.props?.className === 'tk-agents-head')
const tasksHeaderNode = agentToggleBoard.nodes.find(node => node.props?.className === 'tk-section-head')
const agentToggles = groupingTogglesOf(agentToggleBoard, 'tk-agents-head')
const tasksToggles = groupingTogglesOf(agentToggleBoard, 'tk-section-head')
check(agentToggles.length === 2, 'the agents header does not carry exactly two grouping switches')
check(tasksToggles.length === 1, 'the tasks header does not carry exactly one grouping switch')
const toggleHints = toggles => toggles.map(toggle => toggle.props?.['aria-label'])
check(toggleHints(agentToggles).join(',') === 'setAutoRoleGroups,setCustomGroups',
  'the agents header switches are not the roles/custom flags: ' + toggleHints(agentToggles).join(','))
check(toggleHints(tasksToggles).join(',') === 'setTaskCustomGroups',
  'the tasks header switch is not the task-custom flag: ' + toggleHints(tasksToggles).join(','))
check(agentToggles[0]?.props?.['aria-pressed'] === 'true'
  && agentToggles[1]?.props?.['aria-pressed'] === 'true',
'the agents header switches do not report their own states')
check(tasksToggles[0]?.props?.['aria-pressed'] === 'false',
  'the tasks header switch does not report its own state')
check(surface(agentToggles[0]).texts.includes('groupRoles')
  && surface(agentToggles[1]).texts.includes('groupCustom'),
'the agents header switches have no short localized labels')
check(surface(tasksToggles[0]).texts.includes('groupCustom'),
  'the tasks header switch has no short localized label')
check(togglesBeforeSort(agentToggleHead), 'the agents grouping switches are not before the sort menu')
check(togglesBeforeSort(tasksHeaderNode), 'the tasks grouping switch is not before the sort menu')
check(artifact.includes('.tk-agents-head,.tk-section-head{display:flex;align-items:center;gap:5px;flex-wrap:wrap;row-gap:3px;min-width:0}'),
  'the section headers do not wrap their controls when the panel narrows')
check(!agentToggleBoard.texts.includes('groupingToggle')
  && !agentToggleBoard.texts.includes('groupingOn')
  && !agentToggleBoard.texts.includes('groupingOff'),
'a combined grouping switch is still rendered')

// The Roles switch writes exactly autoRoleGroups and leaves customGroups on.
agentToggles[0]?.props?.onClick?.()
let groupingWrite = JSON.parse(storage.get(SETTINGS_STORAGE_KEY))
check(groupingWrite.autoRoleGroups === false && groupingWrite.customGroups === true,
  'the roles switch did not write exactly autoRoleGroups: ' + JSON.stringify(groupingWrite))
const rolesOffBoard = boardFromFreshBundle(sharedRoleState)
const rolesOffToggles = groupingTogglesOf(rolesOffBoard, 'tk-agents-head')
check(rolesOffToggles[0]?.props?.['aria-pressed'] === 'false'
  && rolesOffToggles[1]?.props?.['aria-pressed'] === 'true',
'the agents header did not follow the stored roles flag')
check(rolesOffBoard.nodes.some(node => node.props?.['data-target'] === 'agents:active:custom:crew'),
  'turning roles off also flattened the still-enabled custom groups')

// The Custom switch writes exactly customGroups and leaves autoRoleGroups on.
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({
  autoRoleGroups: true,
  customGroups: true,
  customGroupsText: 'crew: standard',
}))
const customToggleBoard = boardFromFreshBundle(sharedRoleState)
groupingTogglesOf(customToggleBoard, 'tk-agents-head')[1]?.props?.onClick?.()
groupingWrite = JSON.parse(storage.get(SETTINGS_STORAGE_KEY))
check(groupingWrite.autoRoleGroups === true && groupingWrite.customGroups === false,
  'the custom switch did not write exactly customGroups: ' + JSON.stringify(groupingWrite))

// Both surfaces read the same store: the Settings checkboxes follow a header
// switch, and a stored Settings state is what the header shows next.
resetSlots()
const syncedSettings = surface(settingsSection({ t: key => key }))
const syncedBoxes = syncedSettings.nodes.filter(node => node.props?.type === 'checkbox')
check(syncedBoxes[0]?.props?.checked === true && syncedBoxes[1]?.props?.checked === false,
  'the Settings page did not follow the agents header switches')
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({
  autoRoleGroups: false,
  customGroups: true,
  customGroupsText: 'crew: standard',
  taskCustomGroups: true,
  taskCustomGroupsText: 'review: Review',
}))
const settingsDrivenBoard = boardFromFreshBundle(sharedRoleState)
const settingsDrivenAgents = groupingTogglesOf(settingsDrivenBoard, 'tk-agents-head')
const settingsDrivenTasks = groupingTogglesOf(settingsDrivenBoard, 'tk-section-head')
check(settingsDrivenAgents[0]?.props?.['aria-pressed'] === 'false'
  && settingsDrivenAgents[1]?.props?.['aria-pressed'] === 'true',
'the agents header did not follow the Settings checkboxes')
check(settingsDrivenTasks[0]?.props?.['aria-pressed'] === 'true',
  'the tasks header did not follow the Settings checkbox')

// The task Custom switch writes exactly taskCustomGroups, hides the groups
// and restores them from the same flag.
const taskSwitchBoard = boardFromFreshBundle(taskGroupState)
const taskSwitch = groupingTogglesOf(taskSwitchBoard, 'tk-section-head')[0]
check(taskSwitch?.props?.['aria-pressed'] === 'true', 'the tasks switch does not report its on state')
check(taskSwitchBoard.nodes.some(node => String(node.props?.['data-target'] ?? '')
  .includes('tasks:queued:custom:review')),
'a stored task grouping flag did not draw the custom task group')
taskSwitch?.props?.onClick?.()
groupingWrite = JSON.parse(storage.get(SETTINGS_STORAGE_KEY))
check(groupingWrite.taskCustomGroups === false
  && groupingWrite.autoRoleGroups === false && groupingWrite.customGroups === true,
'the tasks switch did not write exactly taskCustomGroups: ' + JSON.stringify(groupingWrite))
const tasksOffBoard = boardFromFreshBundle(taskGroupState)
check(!tasksOffBoard.nodes.some(node => String(node.props?.['data-target'] ?? '').startsWith('tasks:')
  && String(node.props?.['data-target'] ?? '').includes(':custom:')),
'the tasks switch left a custom task group head behind')
const tasksOffToggle = groupingTogglesOf(tasksOffBoard, 'tk-section-head')[0]
check(tasksOffToggle?.props?.['aria-pressed'] === 'false', 'the tasks switch did not report its off state')
check(surface(tasksOffToggle).texts.includes('groupCustom'), 'the off tasks switch lost its label')
tasksOffToggle?.props?.onClick?.()
check(JSON.parse(storage.get(SETTINGS_STORAGE_KEY)).taskCustomGroups === true,
  'the tasks switch did not turn task grouping back on')
const tasksBackBoard = boardFromFreshBundle(taskGroupState)
check(tasksBackBoard.nodes.some(node => String(node.props?.['data-target'] ?? '')
  .includes('tasks:queued:custom:review')),
'the restored task grouping did not come back')

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

// The Settings nav row draws the board's own kanban mark, at the size the
// settings shell passes into the icon slot.
const settingsGlyph = surface(settingsIcon === undefined ? null : settingsIcon({ size: 16, active: true }))
check(settingsGlyph.nodes.some(node => node.type === 'svg' && node.props?.width === 16),
  'the Settings nav icon does not honour the slot size')
check(settingsGlyph.nodes.some(node => node.props?.d === 'M8 7v9'),
  'the Settings nav icon does not draw the board kanban glyph')

/* The page is a calm row list: muted group headings, one row per preference
   with its control at the right, and no boxed inspector cards. */
const settingsRows = settingsView.nodes.filter(node => node.props?.className === 'tk-set-row')
check(settingsRows.length === 13, 'the Settings page is not a row list, got ' + settingsRows.length + ' rows')
const settingsRowTitles = settingsRows.map(node => {
  const copy = within(node, child => child.props?.className === 'tk-set-copy')[0]
  return within(copy, child => child.props?.className === 'tk-set-title')[0]?.props?.children
})
check(settingsRowTitles.includes('setAutoRoleGroups') && settingsRowTitles.includes('setCustomGroups')
  && settingsRowTitles.includes('setTaskCustomGroups') && settingsRowTitles.includes('setSorting')
  && settingsRowTitles.includes('setAnimateCards') && settingsRowTitles.includes('setAnimationDuration')
  && settingsRowTitles.includes('setAnimateText')
  && settingsRowTitles.includes('setScale') && settingsRowTitles.includes('setShowAgentModel')
  && settingsRowTitles.includes('setShowModelName') && settingsRowTitles.includes('setShowModelEffort'),
'the settings rows lost a title: ' + settingsRowTitles.join(', '))
check(settingsRows.every(node => within(node, child => child.props?.className === 'tk-set-control').length === 1),
  'a settings row has no right-aligned control')
check(settingsRows.filter(node => within(node, child => child.props?.className === 'tk-set-desc').length > 0).length >= 5,
  'the settings rows lost their short descriptions')
const settingsGroups = settingsView.nodes.filter(node => node.props?.className === 'tk-set-group')
check(settingsGroups.length === 7, 'the Settings page lost a section group, got ' + settingsGroups.length)
check(settingsGroups.every(group => within(group, child => child.props?.className === 'tk-set-group-title').length === 1),
  'a settings section has no muted heading')
const settingsGroupTitles = settingsGroups.map(group => surface(within(group,
  child => child.props?.className === 'tk-set-group-title')[0]).joined)
check(settingsGroupTitles.includes('setAgentGroups') && settingsGroupTitles.includes('setTaskGroups'),
  'the grouping preferences are not split into agent and task groups: ' + settingsGroupTitles.join(', '))
const agentGroupHead = settingsGroups.find(group => surface(within(group,
  child => child.props?.className === 'tk-set-group-title')[0]).joined === 'setAgentGroups')
const taskGroupHead = settingsGroups.find(group => surface(within(group,
  child => child.props?.className === 'tk-set-group-title')[0]).joined === 'setTaskGroups')
for (const [head, label] of [[agentGroupHead, 'agent'], [taskGroupHead, 'task']]) {
  check(within(head, child => child.type === 'path' && child.props?.d === 'm12 2 9 5-9 5-9-5 9-5Z').length === 1,
    'the ' + label + ' group heading does not carry the layers icon')
}
check(!settingsView.nodes.some(node => node.props?.className === 'tk-sec'),
  'the Settings page still wraps its sections in inspector boxes')
check(settingsView.nodes.filter(node => node.props?.className === 'tk-set-switch').length === 9,
  'the Settings page does not render its nine booleans as switches')
check(settingsView.nodes.filter(node => node.props?.className === 'tk-set-switch-input')
  .every(node => node.props?.type === 'checkbox'),
'the settings switch no longer wraps a real checkbox')
check(settingsView.nodes.filter(node => node.props?.className === 'tk-set-text-block').length === 2,
  'the custom-group editors are not full-width blocks below their rows')
check(artifact.includes('.tk-set{display:flex') && artifact.includes('max-width:760px'),
  'the Settings page does not use the wide row-list stylesheet')
check(artifact.includes('.tk-set-row{display:flex;align-items:flex-start')
  && artifact.includes('border-bottom:1px solid var(--dsw-alias-border-l1)'),
'the settings row is not a hairline-separated flex row')
check(artifact.includes('.tk-set-switch-input{appearance:none'),
  'the settings switch does not reset the native checkbox')

/* --- Changing metric values animate only while the preference is on ---- */

const animatedSwitchOf = view => view.nodes.find(node => node.props?.className === 'tk-set-switch-input'
  && node.props?.['aria-label'] === 'setAnimateText')
resetSlots()
const animationSettings = surface(settingsSection({ t: key => key }))
check(animatedSwitchOf(animationSettings)?.props?.checked === true,
  'changing metric values do not animate by default')
resetSlots()
const animatedBoard = surface(tabBody(props))
const animatedNodes = animatedBoard.nodes.filter(node => node.props?.className === 'tk-text-anim')
check(animatedNodes.length > 0, 'no metric value carries the change animation')
check(animatedNodes.every(node => String(node.props?.style?.['--tk-text-ms'] ?? '').endsWith('ms')),
  'an animated metric value has no animation duration')
check(artifact.includes('.tk-text-anim{display:inline-block;animation:tk-text-in')
  && artifact.includes('@keyframes tk-text-in'),
'the change animation has no stylesheet rule')
check(artifact.includes('@media (prefers-reduced-motion: reduce){.tk-text-anim{animation:none}}'),
  'the change animation ignores reduced motion')
// A changed value gets a new key, which restarts the CSS animation.
const animatedKeys = view => view.nodes.filter(node => node.props?.className === 'tk-text-anim')
  .map(node => String(node.props?.key))
const changedTokensState = JSON.parse(JSON.stringify(listState))
changedTokensState.projectionsBySession['session-a'].values.tokenUsage.outputTokens = 7777
resetSlots()
const changedTokensBoard = surface(tabBody({ ...props, useSessions: selector => selector(changedTokensState) }))
check(animatedKeys(animatedBoard).includes('51K'), 'the totals token value is not an animated metric')
check(!animatedKeys(changedTokensBoard).includes('51K'),
  'the totals token value did not change with the session tokens')
check(animatedKeys(changedTokensBoard).join('|') !== animatedKeys(animatedBoard).join('|'),
  'a changed metric value kept the old animation key')
// Switching the preference off leaves the plain values, not the animated span.
animatedSwitchOf(animationSettings)?.props?.onChange?.({ target: { checked: false } })
resetSlots()
const stillBoard = surface(tabBody(props))
check(!stillBoard.nodes.some(node => node.props?.className === 'tk-text-anim'),
  'the change animation still runs after switching it off')
check(stillBoard.joined.includes('51K'), 'the metric values disappeared with the animation off')
const offSettings = surface(settingsSection({ t: key => key }))
check(animatedSwitchOf(offSettings)?.props?.checked === false,
  'the change-animation switch does not reflect the stored preference')
animatedSwitchOf(offSettings)?.props?.onChange?.({ target: { checked: true } })
resetSlots()

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
  showAgentModel: 'yes',
}))
const clampedBoard = boardFromFreshBundle()
const clampedRoot = clampedBoard.nodes.find(node => node.props?.className === 'tk-root')
check(clampedRoot?.props?.style?.zoom === 0.8,
  'the sanitized panel scale was not applied to the board root, got: ' + JSON.stringify(clampedRoot?.props?.style))
resetSlots()
const clampedSettings = surface(settingsSection({ t: key => key }))
const settingBoxes = clampedSettings.nodes.filter(node => node.props?.type === 'checkbox')
check(settingBoxes.length === 9, 'the Settings page lost a checkbox')
check(settingBoxes[0]?.props?.checked === true && settingBoxes[1]?.props?.checked === true
  && settingBoxes[2]?.props?.checked === false && settingBoxes[3]?.props?.checked === false,
'the Settings page does not render the sanitized booleans')
check(settingBoxes[4]?.props?.checked === true && settingBoxes[4]?.props?.['aria-label'] === 'setAnimateText',
  'the change-animation switch is missing or does not default to on')
check(settingBoxes[5]?.props?.checked === false && settingBoxes[5]?.props?.['aria-label'] === 'setShowAgentModel',
  'the agent-model switch is missing or does not default to off')
check(settingBoxes[6]?.props?.checked === false && settingBoxes[6]?.props?.['aria-label'] === 'setShowModelProvider',
  'the provider switch is missing or does not default to off')
check(settingBoxes[7]?.props?.checked === true && settingBoxes[7]?.props?.['aria-label'] === 'setShowModelName',
  'the model-name switch is missing or does not default to on')
check(settingBoxes[8]?.props?.checked === true && settingBoxes[8]?.props?.['aria-label'] === 'setShowModelEffort',
  'the effort switch is missing or does not default to on')
check(settingBoxes.slice(6).every(box => box?.props?.disabled === true),
  'a model-line part switch is enabled while the agent model line is off')
const settingTextareas = clampedSettings.nodes.filter(node => node.props?.className === 'tk-set-text')
const settingTextarea = settingTextareas[0]
check(settingTextareas.length === 2, 'the Settings page lost a custom-groups editor')
check(settingTextarea?.props?.value === '' && settingTextarea?.props?.disabled === false,
  'the custom-groups editor did not sanitize a non-string value')
check(settingTextareas[1]?.props?.value === '' && settingTextareas[1]?.props?.disabled === true,
  'the task custom-groups editor is not disabled when its switch is off')
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
  && clampedWrite.customGroups === true && clampedWrite.customGroupsText === ''
  && clampedWrite.taskCustomGroups === false && clampedWrite.taskCustomGroupsText === ''
  && clampedWrite.showAgentModel === false && clampedWrite.showModelProvider === false,
'the settings writer did not sanitize the invalid fields: ' + JSON.stringify(clampedWrite))
settingTextarea?.props?.onChange?.({ target: { value: 'crew: builder, reviewer\nqa: test' } })
check(JSON.parse(storage.get(SETTINGS_STORAGE_KEY)).customGroupsText === 'crew: builder, reviewer\nqa: test',
  'the custom-groups text was not stored verbatim')
settingBoxes[2]?.props?.onChange?.({ target: { checked: true } })
settingTextareas[1]?.props?.onChange?.({ target: { value: 'ui: inspector, dialog' } })
const taskGroupWrite = JSON.parse(storage.get(SETTINGS_STORAGE_KEY))
check(taskGroupWrite.taskCustomGroups === true && taskGroupWrite.taskCustomGroupsText === 'ui: inspector, dialog',
  'the task custom-groups editor was not stored: ' + JSON.stringify(taskGroupWrite))

/* --- Agent row model line: off by default, opt-in from Settings -------- */

const settingsBeforeModel = storage.get(SETTINGS_STORAGE_KEY)
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ sort: 'newest' }))
const quietBoard = boardFromFreshBundle()
const quietRow = quietBoard.nodes.find(node => node.props?.['data-agent-id'] === 'session-a'
  && node.props?.className === 'tk-agent-row')
check(within(quietRow, node => node.props?.className === 'tk-agent-model').length === 0,
  'the agent row shows the model while the setting is off')

resetSlots()
const modelSettings = surface(settingsSection({ t: key => key }))
const modelSwitch = modelSettings.nodes.find(node => node.props?.type === 'checkbox'
  && node.props?.['aria-label'] === 'setShowAgentModel')
check(modelSwitch?.props?.checked === false, 'the agent-model switch does not default to off')
check(modelSettings.texts.includes('setShowAgentModelHint'), 'the agent-model switch has no hint')
const providerSwitch = modelSettings.nodes.find(node => node.props?.type === 'checkbox'
  && node.props?.['aria-label'] === 'setShowModelProvider')
check(providerSwitch?.props?.checked === false, 'the provider switch does not default to off')
check(modelSettings.texts.includes('setShowModelProviderHint'), 'the provider switch has no hint')
check(providerSwitch?.props?.disabled === true,
  'the provider switch is enabled while the agent-model master switch is off')
modelSwitch?.props?.onChange?.({ target: { checked: true } })
check(JSON.parse(storage.get(SETTINGS_STORAGE_KEY)).showAgentModel === true,
  'the agent-model switch did not persist')

// The provider row belongs under the master switch and only activates with it.
resetSlots()
const providerSettings = surface(settingsSection({ t: key => key }))
const providerBox = providerSettings.nodes.find(node => node.props?.type === 'checkbox'
  && node.props?.['aria-label'] === 'setShowModelProvider')
check(providerBox?.props?.disabled === false,
  'the provider switch stays disabled beside an enabled agent model line')
const settingsTitles = providerSettings.nodes.filter(node => node.props?.className === 'tk-set-title')
  .map(node => node.props?.children)
check(settingsTitles.indexOf('setShowModelProvider') === settingsTitles.indexOf('setShowAgentModel') + 1,
  'the provider switch is not the row right under the agent-model switch')

const modelBoard = boardFromFreshBundle()
const modelRow = modelBoard.nodes.find(node => node.props?.['data-agent-id'] === 'session-a'
  && node.props?.className === 'tk-agent-row')
const modelLine = within(modelRow, node => node.props?.className === 'tk-agent-model')[0]
check(modelLine !== undefined, 'the agent row has no model line with the setting on')
check(String(modelLine?.props?.children) === 'deepseek-chat · high',
  'the model line shows the provider while its switch is off: ' + String(modelLine?.props?.children))
check(modelLine?.props?.title === 'deepseek · deepseek-chat · high',
  'the model line tooltip lost the provider: ' + String(modelLine?.props?.title))
const modelMeta = within(modelRow, node => node.props?.className === 'tk-agent-meta')[0]
const metaChildren = Array.isArray(modelMeta?.props?.children) ? modelMeta.props.children : []
const metaModelIndex = metaChildren.findIndex(child => child?.props?.className === 'tk-agent-model')
check(metaModelIndex >= 0 && metaModelIndex === metaChildren.length - 1,
  'the model line is not the last child of the metric row: ' + metaModelIndex + ' of ' + metaChildren.length)
const rowChildren = Array.isArray(modelRow?.props?.children) ? modelRow.props.children : []
check(rowChildren.every(child => child?.props?.className !== 'tk-agent-model'),
  'the model line is still a separate block after the metric row')
const modelUnknownRow = modelBoard.nodes.find(node => node.props?.['data-agent-id'] === 'session-b'
  && node.props?.className === 'tk-agent-row')
check(within(modelUnknownRow, node => node.props?.className === 'tk-agent-model').length === 0,
  'an agent without a known model got a model line')
// A visible model line alone still draws the metric row.
const modelOnlyState = JSON.parse(JSON.stringify(listState))
modelOnlyState.projectionsBySession['session-b'].values = {
  modelSelection: {
    lastUsed: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' },
    next: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' },
  },
}
const modelOnlyRow = boardFromFreshBundle(modelOnlyState).nodes.find(node => node.props?.['data-agent-id'] === 'session-b'
  && node.props?.className === 'tk-agent-row')
const modelOnlyMeta = within(modelOnlyRow, node => node.props?.className === 'tk-agent-meta')
check(modelOnlyMeta.length === 1, 'a model line without a metric or a chip did not draw the metric row')
const modelOnlyChildren = Array.isArray(modelOnlyMeta[0]?.props?.children) ? modelOnlyMeta[0].props.children : []
check(modelOnlyChildren.length === 1 && modelOnlyChildren[0]?.props?.className === 'tk-agent-model',
  'the metric row of a model-only agent does not hold just the model line')

// Switching the provider on prepends it to the visible line and keeps the title.
providerBox?.props?.onChange?.({ target: { checked: true } })
check(JSON.parse(storage.get(SETTINGS_STORAGE_KEY)).showModelProvider === true,
  'the provider switch did not persist')
const providerBoard = boardFromFreshBundle()
const providerRow = providerBoard.nodes.find(node => node.props?.['data-agent-id'] === 'session-a'
  && node.props?.className === 'tk-agent-row')
const providerLine = within(providerRow, node => node.props?.className === 'tk-agent-model')[0]
check(String(providerLine?.props?.children) === 'deepseek · deepseek-chat · high',
  'the provider did not join the visible model line: ' + String(providerLine?.props?.children))
check(providerLine?.props?.title === 'deepseek · deepseek-chat · high',
  'the model line tooltip diverged from the visible full line')
check(artifact.includes('.tk-agent-meta{display:flex;align-items:center;flex-wrap:wrap;row-gap:2px;column-gap:5px;'),
  'the metric row does not wrap the model line onto its own line')
check(artifact.includes('.tk-agent-model{flex:none;margin-left:auto;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'),
  'the model line is not a right-aligned inline item in the metric row')
check(artifact.includes('font-size:9px;line-height:12px'), 'the model line lost its compact type')
if (settingsBeforeModel === undefined) storage.delete(SETTINGS_STORAGE_KEY)
else storage.set(SETTINGS_STORAGE_KEY, settingsBeforeModel)

/* --- Model-line parts: provider, model name and effort toggle alone ---- */

const partSwitchOf = (view, label) => view.nodes.find(node => node.props?.type === 'checkbox'
  && node.props?.['aria-label'] === label)
const modelLineOf = board => {
  const row = board.nodes.find(node => node.props?.['data-agent-id'] === 'session-a'
    && node.props?.className === 'tk-agent-row')
  return within(row, node => node.props?.className === 'tk-agent-model')[0]
}
storage.set(SETTINGS_STORAGE_KEY, JSON.stringify({ sort: 'newest' }))
boardFromFreshBundle()
resetSlots()
const partDefaults = surface(settingsSection({ t: key => key }))
check(partSwitchOf(partDefaults, 'setShowModelName')?.props?.checked === true,
  'the model-name part does not default to on')
check(partSwitchOf(partDefaults, 'setShowModelEffort')?.props?.checked === true,
  'the effort part does not default to on')
check(partSwitchOf(partDefaults, 'setShowModelName')?.props?.disabled === true
  && partSwitchOf(partDefaults, 'setShowModelEffort')?.props?.disabled === true,
'the model-line parts are enabled while the master switch is off')
partSwitchOf(partDefaults, 'setShowAgentModel')?.props?.onChange?.({ target: { checked: true } })
resetSlots()
const partMasterOn = surface(settingsSection({ t: key => key }))
check(partSwitchOf(partMasterOn, 'setShowModelName')?.props?.disabled === false,
  'the model-name part stays disabled beside an enabled agent model line')
// Model name off: the visible line keeps only the effort.
partSwitchOf(partMasterOn, 'setShowModelName')?.props?.onChange?.({ target: { checked: false } })
check(JSON.parse(storage.get(SETTINGS_STORAGE_KEY)).showModelName === false,
  'the model-name part did not persist')
const effortOnlyLine = modelLineOf(boardFromFreshBundle())
check(String(effortOnlyLine?.props?.children) === 'high',
  'the visible model line did not drop the disabled model name: ' + String(effortOnlyLine?.props?.children))
check(effortOnlyLine?.props?.title === 'deepseek · deepseek-chat · high',
  'the model line tooltip lost a hidden part')
// Provider on and effort off: the visible line keeps only the provider.
resetSlots()
partSwitchOf(surface(settingsSection({ t: key => key })), 'setShowModelProvider')
  ?.props?.onChange?.({ target: { checked: true } })
resetSlots()
partSwitchOf(surface(settingsSection({ t: key => key })), 'setShowModelEffort')
  ?.props?.onChange?.({ target: { checked: false } })
const providerOnlyWrite = JSON.parse(storage.get(SETTINGS_STORAGE_KEY))
check(providerOnlyWrite.showModelProvider === true && providerOnlyWrite.showModelEffort === false,
  'the provider and effort parts did not persist: ' + JSON.stringify(providerOnlyWrite))
const providerOnlyLine = modelLineOf(boardFromFreshBundle())
check(String(providerOnlyLine?.props?.children) === 'deepseek',
  'the visible model line did not keep only the provider: ' + String(providerOnlyLine?.props?.children))
// Turning off the last part hides the line and restores all three parts.
resetSlots()
partSwitchOf(surface(settingsSection({ t: key => key })), 'setShowModelProvider')
  ?.props?.onChange?.({ target: { checked: false } })
const allPartsOffWrite = JSON.parse(storage.get(SETTINGS_STORAGE_KEY))
check(allPartsOffWrite.showAgentModel === false,
  'turning off the last model-line part did not hide the whole line')
check(allPartsOffWrite.showModelProvider === true && allPartsOffWrite.showModelName === true
  && allPartsOffWrite.showModelEffort === true,
'turning off the last model-line part did not restore the three parts: ' + JSON.stringify(allPartsOffWrite))
check(modelLineOf(boardFromFreshBundle()) === undefined,
  'the model line survived the all-parts-off reset')
if (settingsBeforeModel === undefined) storage.delete(SETTINGS_STORAGE_KEY)
else storage.set(SETTINGS_STORAGE_KEY, settingsBeforeModel)

/* --- Settings About: the three public project links -------------------- */

resetSlots()
const aboutSettings = surface(settingsSection({ t: key => key }))
const aboutLinks = aboutSettings.nodes.filter(node => node.type === 'a' && node.props?.target === '_blank')
check(aboutLinks.length === 3, 'the Settings About block does not link three project pages')
check(aboutLinks.every(node => String(node.props?.rel).includes('noreferrer')
  && String(node.props?.rel).includes('noopener')),
'the Settings About links are not noreferrer noopener')
check(aboutLinks.every(node => String(node.props?.className).includes('tk-btn')),
  'the Settings About links do not use the settings button style')
const repositoryUrl = String(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).repository.url)
  .replace(/^git\+/, '').replace(/\.git$/, '')
check(repositoryUrl === 'https://github.com/RealWof/dsh-agent-team-viewer',
  'package.json no longer names the public repository: ' + repositoryUrl)
const aboutHrefs = aboutLinks.map(node => node.props?.href)
check(aboutHrefs.includes(repositoryUrl), 'the About block does not link the repository')
check(aboutHrefs.includes(repositoryUrl + '/blob/main/README.md'), 'the About block does not link the README')
check(aboutHrefs.includes(repositoryUrl + '/blob/main/CHANGELOG.md'), 'the About block does not link the CHANGELOG')
check(aboutSettings.texts.includes('aboutHeading') && aboutSettings.texts.includes('aboutRepository')
  && aboutSettings.texts.includes('aboutReadme') && aboutSettings.texts.includes('aboutChangelog'),
'the About block labels do not come from the dictionaries')
check(artifact.includes('.tk-set-about'), 'the About block has no stylesheet rule')

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

/* --- Safe Markdown in the description and the report ------------------- */

const markdownState = JSON.parse(JSON.stringify(listState))
const markdownTask = markdownState.projectionsBySession.root.values.agentTeam.tasks
  .find(task => task.id === 'task-1')
markdownTask.description = [
  '## Safety',
  'A **bold** and *italic* line with `inline code`.',
  '',
  '1. first',
  '2. second',
  '',
  '- bullet one',
  '- bullet two',
  '',
  '```js',
  'const x = 1',
  '```',
  '',
  '> quoted text',
  '',
  '---',
  '',
  'A [https link](https://example.com/docs), a [file](src/client/10-settings.js), a [folder](src/client/), and a [resource](dsh-resource://file/session/root/src/client/20-ui.js).',
  'A [bad](javascript:alert) link and ![bad](javascript:alert).',
  'Bare paths: docs/stats.md and src/a.js:12, plus 1.2.3 and https://example.com/a/b.',
  'A [docs/stats.md](https://example.com/page) link label stays plain.',
  'Read docs/guide.md. but leave `docs/code.md` in code.',
  'Folder src/unity-integration/Assets/Plugins/CUE4Parse/ opens it.',
  'A file ProjectSettings/ProjectSettings.asset exists.',
  '![diagram](https://example.com/pic.png)',
  '<script>alert("x")</script>',
].join('\n')
markdownState.byId['session-md'] = { id: 'session-md', parentId: 'root', running: true, updatedAt: 0 }
markdownState.projectionsBySession.root.values.agentTeam.tasks.push({
  id: 'task-md',
  revision: 1,
  subject: 'Markdown report',
  description: '',
  status: 'in_progress',
  blockedBy: [],
  writeScopes: [],
  ready: true,
  ownerId: 'session-md',
  ownerName: 'writer',
  writeScopeWarnings: [],
})
const markdownReport = '**Bold report** with [board source](src/client/40-board.js).'
const markdownProps = {
  ...props,
  useSessions: selector => selector(markdownState),
  services: { ...props.services, loadAgentReport: async () => markdownReport },
}
resetSlots()
resetHooks()
const markdownStart = surface(tabBody(markdownProps))
markdownStart.nodes.find(node => typeof node.type === 'function' && node.type.name === 'TaskCard'
  && node.props?.task?.id === 'task-1')?.props?.onOpen?.('task-1')
resetHooks()
const withMarkdown = surface(tabBody(markdownProps))
const mdText = node => surface(node).joined
check(withMarkdown.nodes.some(node => node.type === 'h2' && mdText(node).includes('Safety')),
  'a Markdown heading did not render')
check(withMarkdown.nodes.some(node => node.type === 'strong' && mdText(node).includes('bold')),
  'Markdown bold did not render')
check(withMarkdown.nodes.some(node => node.type === 'em' && mdText(node).includes('italic')),
  'Markdown italic did not render')
check(withMarkdown.nodes.some(node => node.type === 'code' && mdText(node).includes('inline code')),
  'Markdown inline code did not render')
check(withMarkdown.nodes.some(node => node.type === 'pre' && mdText(node).includes('const x = 1')),
  'a Markdown fenced code block did not render')
check(withMarkdown.nodes.some(node => node.type === 'ul')
  && withMarkdown.nodes.some(node => node.type === 'ol'),
'a Markdown list did not render')
check(withMarkdown.nodes.some(node => node.type === 'blockquote' && mdText(node).includes('quoted text')),
  'a Markdown blockquote did not render')
check(withMarkdown.nodes.some(node => node.type === 'hr'), 'a Markdown horizontal rule did not render')
const mdWebLink = withMarkdown.nodes.find(node => node.type === 'a'
  && node.props?.href === 'https://example.com/docs')
check(mdWebLink?.props?.target === '_blank' && String(mdWebLink?.props?.rel).includes('noreferrer')
  && String(mdWebLink?.props?.rel).includes('noopener'),
'a safe https link is missing target/rel')
check(withMarkdown.nodes.every(node => node.type !== 'a'
  || !String(node.props?.href).toLowerCase().startsWith('javascript:')),
'a javascript: link was rendered as an anchor')
check(withMarkdown.nodes.every(node => node.type !== 'a'
  || !String(node.props?.href).toLowerCase().startsWith('data:')),
'a data: link was rendered as an anchor')
check(!withMarkdown.nodes.some(node => node.type === 'script'),
  'raw HTML was rendered as an element')
check(withMarkdown.joined.includes('<script>'),
  'raw HTML was dropped instead of shown as escaped text')
const mdFileLink = withMarkdown.nodes.find(node => node.type === 'button'
  && node.props?.['data-scope'] === 'src/client/10-settings.js')
check(mdFileLink !== undefined, 'a file link in the description did not become a file button')
const filesBefore = openedFiles.length
mdFileLink?.props?.onClick?.()
check(openedFiles.length === filesBefore + 1
  && openedFiles[openedFiles.length - 1][1] === 'src/client/10-settings.js',
'a file link in the description did not call onOpenFile')
check(withMarkdown.nodes.some(node => node.type === 'button'
  && node.props?.['data-scope'] === 'src/client/'),
'a folder link in the description did not become a file button')
check(withMarkdown.nodes.some(node => node.type === 'button'
  && node.props?.['data-scope'] === 'src/client/20-ui.js'),
'a dsh-resource file link did not resolve to its workspace path')
const mdImage = withMarkdown.nodes.find(node => node.type === 'img' && node.props?.alt === 'diagram')
check(mdImage?.props?.src === 'https://example.com/pic.png' && mdImage?.props?.loading === 'lazy',
  'an https image did not render as a lazy image')
check(!withMarkdown.nodes.some(node => node.type === 'img' && node.props?.alt === 'bad'),
  'an unsupported image scheme was rendered as an image')
const mdAttachments = withMarkdown.nodes.find(node => node.props?.['data-attachments'] === 'true')
check(mdAttachments !== undefined, 'the description file links did not produce attachment chips')
check(surface(mdAttachments).texts.includes('attachments'),
  'the attachment chips have no localized label')
check(surface(mdAttachments).texts.includes('src/client/10-settings.js')
  && surface(mdAttachments).texts.includes('src/client/'),
'the attachment chips do not list the referenced files')

/* Bare workspace paths in prose become the same file buttons. */
const barePathFile = withMarkdown.nodes.find(node => node.type === 'button'
  && node.props?.['data-scope'] === 'docs/stats.md')
check(barePathFile !== undefined, 'a bare workspace path did not become a file button')
check(surface(barePathFile).texts.includes('docs/stats.md'), 'a bare workspace path lost its label')
const barePathLine = withMarkdown.nodes.find(node => node.type === 'button'
  && node.props?.['data-scope'] === 'src/a.js')
check(barePathLine !== undefined, 'a bare path with :line did not strip the line from the open path')
check(surface(barePathLine).texts.includes('src/a.js:12'),
  'a bare path with :line lost the full label, got: ' + surface(barePathLine).joined)
check(withMarkdown.nodes.every(node => node.type !== 'button' || node.props?.['data-scope'] !== '1.2.3'),
  'a version string was linked as a workspace path')
check(!withMarkdown.nodes.some(node => node.type === 'button'
  && node.props?.['data-scope'] === 'docs/code.md'), 'a path inside inline code was linked')
check(withMarkdown.nodes.some(node => node.type === 'code' && mdText(node).includes('docs/code.md')),
  'the inline-code path lost its code span')
check(withMarkdown.nodes.some(node => node.type === 'a'
  && node.props?.href === 'https://example.com/a/b'), 'a bare URL was not left to the URL autolinker')
const guidePath = withMarkdown.nodes.find(node => node.type === 'button'
  && node.props?.['data-scope'] === 'docs/guide.md')
check(guidePath !== undefined, 'a path followed by sentence punctuation was not linked')
check(surface(guidePath).texts.includes('docs/guide.md'),
  'the sentence punctuation leaked into the path label: ' + surface(guidePath).joined)
const bareFilesBefore = openedFiles.length
barePathFile?.props?.onClick?.()
check(openedFiles.length === bareFilesBefore + 1
  && openedFiles[openedFiles.length - 1][1] === 'docs/stats.md',
  'clicking a bare workspace path did not call onOpenFile')

// A bare folder keeps its trailing slash in the label and the open path, so
// the link draws the folder icon and asks for the Files page.
const bareFolder = withMarkdown.nodes.find(node => node.type === 'button'
  && node.props?.['data-scope'] === 'src/unity-integration/Assets/Plugins/CUE4Parse/')
check(bareFolder !== undefined, 'a bare folder path with a trailing slash did not become a file button')
check(surface(bareFolder).texts.includes('src/unity-integration/Assets/Plugins/CUE4Parse/'),
  'a bare folder path lost its trailing slash in the label')
check(bareFolder?.props?.title === 'openFolderHint', 'a bare folder path has no folder hint')
const bareFolderKids = Array.isArray(bareFolder?.props?.children) ? bareFolder.props.children : []
check(bareFolderKids[0]?.props?.name === 'folder', 'a bare folder path did not get the folder icon')
const bareProjectFile = withMarkdown.nodes.find(node => node.type === 'button'
  && node.props?.['data-scope'] === 'ProjectSettings/ProjectSettings.asset')
check(bareProjectFile !== undefined, 'a bare file path did not become a file button')
check(bareProjectFile?.props?.title === 'openFileHint', 'a bare file path has no file hint')
const bareProjectKids = Array.isArray(bareProjectFile?.props?.children) ? bareProjectFile.props.children : []
check(bareProjectKids[0]?.props?.name === 'pen', 'a bare file path did not get the file icon')
const bareFolderBefore = openedFiles.length
bareFolder?.props?.onClick?.()
check(openedFiles.length === bareFolderBefore + 1
  && openedFiles[openedFiles.length - 1][1] === 'src/unity-integration/Assets/Plugins/CUE4Parse/',
  'clicking a bare folder path did not keep the trailing slash for the workspace')

// A Markdown link whose label looks like a path keeps the label plain: an
// anchor must not contain a nested anchor or file button.
const labelAnchor = withMarkdown.nodes.find(node => node.type === 'a'
  && node.props?.href === 'https://example.com/page')
check(labelAnchor !== undefined, 'a link whose label is a workspace path lost its anchor')
const labelAnchors = withMarkdown.nodes.filter(node => node.type === 'a'
  && node.props?.href === 'https://example.com/page')
check(labelAnchors.length === 1, 'a link label produced more than one anchor, got ' + labelAnchors.length)
check(within(labelAnchor, node => node.props?.className === 'tk-file-link').length === 0,
  'a workspace path inside a link label became a nested file button')
check(surface(labelAnchor).texts.includes('docs/stats.md'), 'the link label lost its path text')
check(withMarkdown.nodes.some(node => node.type === 'button'
  && node.props?.['data-scope'] === 'docs/stats.md'),
'a bare docs/stats.md outside a link did not render a file button')

// The report text goes through the same renderer.
resetSlots()
resetHooks()
const markdownReportStart = surface(tabBody(markdownProps))
markdownReportStart.nodes.find(node => typeof node.type === 'function' && node.type.name === 'TaskCard'
  && node.props?.task?.id === 'task-md')?.props?.onOpen?.('task-md')
resetHooks()
const markdownReportOpened = surface(tabBody(markdownProps))
markdownReportOpened.nodes.find(node => node.props?.['data-tab'] === 'report')?.props?.onClick?.()
for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const withMarkdownReport = surface(tabBody(markdownProps))
const mdReportPanel = withMarkdownReport.nodes.find(node => node.props?.['data-tabpanel'] === 'report')
check(withMarkdownReport.nodes.some(node => node.type === 'strong'
  && mdText(node).includes('Bold report')),
'the report text did not render Markdown')
const reportFile = within(mdReportPanel, node => node.type === 'button'
  && node.props?.['data-scope'] === 'src/client/40-board.js')[0]
check(reportFile !== undefined, 'the report file link did not become a file button')
const reportFilesBefore = openedFiles.length
reportFile?.props?.onClick?.()
check(openedFiles.length === reportFilesBefore + 1
  && openedFiles[openedFiles.length - 1][1] === 'src/client/40-board.js',
'the report file link did not call onOpenFile')

/* --- Local file links are validated once per open task dialog ---------- */

const localPathState = JSON.parse(JSON.stringify(listState))
const localPathTask = localPathState.projectionsBySession.root.values.agentTeam.tasks
  .find(task => task.id === 'task-1')
localPathTask.description = 'See src/client/10-settings.js and missing/gone.js.'
  + ' Folder src/unity-integration/Assets/Plugins/CUE4Parse/ and'
  + ' ProjectSettings/ProjectSettings.asset.'
localPathTask.writeScopes = ['src/client', 'missing/folder/']
const localChecks = []
const localExistingPaths = [
  'src/client',
  'src/client/10-settings.js',
  'src/unity-integration/Assets/Plugins/CUE4Parse/',
  'ProjectSettings/ProjectSettings.asset',
]
const localPathProps = {
  ...props,
  useSessions: selector => selector(localPathState),
  services: {
    ...props.services,
    checkLocalPath: async (sessionId, path) => {
      localChecks.push([sessionId, path])
      return localExistingPaths.includes(path)
    },
  },
}
/** Open task-1 in the local-path state and return the surface after `flush`. */
const openLocalPathTask = async (flush) => {
  const start = surface(tabBody(localPathProps))
  start.nodes.find(node => typeof node.type === 'function' && node.type.name === 'TaskCard'
    && node.props?.task?.id === 'task-1')?.props?.onOpen?.('task-1')
  resetHooks()
  const opened = surface(tabBody(localPathProps))
  for (let index = 0; index < flush; index += 1) await new Promise(resolve => setTimeout(resolve, 0))
  resetHooks()
  return { opened, checked: surface(tabBody(localPathProps)) }
}
resetSlots()
persistRefs = true
deferCleanups = true
resetHooks()
const localPending = await openLocalPathTask(0)
const pendingPlain = view => view.nodes.every(node => node.type !== 'button'
  || ![...localExistingPaths, 'missing/folder/', 'missing/gone.js'].includes(node.props?.['data-scope']))
check(pendingPlain(localPending.opened) && pendingPlain(localPending.checked),
  'pending local paths rendered as clickable links before the check answered')
for (let flush = 0; flush < 6; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
resetHooks()
const localView = surface(tabBody(localPathProps))
const localExisting = localView.nodes.find(node => node.type === 'button'
  && node.props?.['data-scope'] === 'src/client/10-settings.js')
check(localExisting !== undefined, 'an existing local file is not a clickable link')
const localFolderLink = localView.nodes.find(node => node.type === 'button'
  && node.props?.['data-scope'] === 'src/unity-integration/Assets/Plugins/CUE4Parse/')
check(localFolderLink !== undefined, 'the validated description folder is not a clickable link')
check(localFolderLink?.props?.title === 'openFolderHint', 'the validated description folder has no folder hint')
const localProjectFile = localView.nodes.find(node => node.type === 'button'
  && node.props?.['data-scope'] === 'ProjectSettings/ProjectSettings.asset')
check(localProjectFile !== undefined, 'the validated bare file is not a clickable link')
check(localProjectFile?.props?.title === 'openFileHint', 'the validated bare file has no file hint')
const localMissing = localView.nodes.find(node => typeof node.props?.className === 'string'
  && node.props.className.includes('tk-md-missing'))
check(localMissing !== undefined && surface(localMissing).joined.includes('missing/gone.js'),
  'a missing local file did not render as plain text')
check(localView.nodes.every(node => node.type !== 'button'
  || node.props?.['data-scope'] !== 'missing/gone.js'), 'a missing local file is still a clickable link')
check(localMissing?.props?.title === 'fileMissingHint', 'a missing local file has no missing-file tooltip')
check(localMissing?.props?.tabIndex === undefined && localMissing?.props?.role === undefined,
  'a missing local file stayed focusable')
const localAttachments = localView.nodes.find(node => node.props?.['data-attachments'] === 'true')
check(localAttachments !== undefined, 'the existing file lost its attachment row')
const localAttachmentText = surface(localAttachments).joined
check(localAttachmentText.includes('src/client/10-settings.js'), 'the attachment row lost the existing file')
check(!localAttachmentText.includes('missing/gone.js'), 'a missing file reached the attachment row')
check(localView.nodes.some(node => node.type === 'button' && node.props?.['data-scope'] === 'src/client'),
  'an existing write scope is not a button')
const localScopeMissing = localView.nodes.find(node => typeof node.props?.className === 'string'
  && node.props.className.includes('tk-file-missing'))
check(localScopeMissing !== undefined && surface(localScopeMissing).joined.includes('missing/folder/'),
  'a missing write scope is not plain text')
check(localView.nodes.every(node => node.type !== 'button'
  || node.props?.['data-scope'] !== 'missing/folder/'), 'a missing write scope is still a button')
const localPaths = new Set(localChecks.map(call => call[1]))
check(localPaths.size === 6 && localChecks.length === localPaths.size,
  'the dialog did not check every unique path exactly once: ' + JSON.stringify(localChecks))
check(localChecks.every(call => call[0] === 'root'), 'the path checker got the wrong session id')
check(localChecks.some(call => call[1] === 'src/unity-integration/Assets/Plugins/CUE4Parse/'),
  'the description folder was not checked with its trailing slash: ' + JSON.stringify(localChecks))
const cachedPathCalls = localChecks.length
// A later render of the same open dialog reads the cache and asks nothing new.
resetHooks()
surface(tabBody(localPathProps))
for (let flush = 0; flush < 4; flush += 1) await new Promise(resolve => setTimeout(resolve, 0))
check(localChecks.length === cachedPathCalls, 'a re-render re-checked paths already known: '
  + JSON.stringify(localChecks))
// Reopening the task remounts the dialog and throws the cache away.
resetSlots()
flushCleanups()
resetHooks()
await openLocalPathTask(4)
check(localChecks.length === cachedPathCalls + 6,
  'reopening the task dialog did not check the paths again: ' + JSON.stringify(localChecks))
flushCleanups()
deferCleanups = false
persistRefs = false
resetSlots()

/* --- Empty sections: the absence note sits under the heading ----------- */

const emptySectionsState = JSON.parse(JSON.stringify(listState))
const emptySectionsTask = emptySectionsState.projectionsBySession.root.values.agentTeam.tasks
  .find(task => task.id === 'task-1')
emptySectionsTask.blockedBy = []
emptySectionsTask.writeScopes = []
const emptySectionsProps = {
  ...props,
  useSessions: selector => selector(emptySectionsState),
}
resetHooks()
const emptySectionsBoard = surface(tabBody(emptySectionsProps))
emptySectionsBoard.nodes.find(node => typeof node.type === 'function' && node.type.name === 'TaskCard'
  && node.props?.task?.id === 'task-1')?.props?.onOpen?.('task-1')
resetHooks()
const emptySectionsView = surface(tabBody(emptySectionsProps))
const emptySectionsDialog = emptySectionsView.nodes.find(node => node.props?.['data-task-id'] === 'task-1'
  && node.props?.role === 'dialog')
check(emptySectionsDialog !== undefined, 'the empty-sections task dialog did not open')
const emptyDepsParts = sectionParts(sectionBlock(emptySectionsView, 'dependencies'))
check(!noteIn(emptyDepsParts.headKids)
  && emptyDepsParts.below?.props?.className === 'tk-sec-note tk-sec-note-below'
  && emptyDepsParts.below.props.children === 'noDependencies',
'the empty dependencies note is not a full-width line under its heading')
const emptyScopesParts = sectionParts(sectionBlock(emptySectionsView, 'writeScopes'))
check(!noteIn(emptyScopesParts.headKids)
  && emptyScopesParts.below?.props?.className === 'tk-sec-note tk-sec-note-below'
  && emptyScopesParts.below.props.children === 'noWriteScopes',
'the empty write-scopes note is not a full-width line under its heading')
check(emptyScopesParts.kids.every(child => child?.props?.className !== 'tk-list'),
  'the empty write-scopes section still renders a list')

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
