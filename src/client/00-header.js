
/**
 * Shared constants for the browser half.
 *
 * Strings live in locales/en.js and locales/ru.js — edit those for copy. The
 * numbers here are the board's identity and its tuning knobs.
 */
    /** React hooks used across the fragments. */
    const { useState, useEffect, useMemo, useRef, useCallback } = React

    /** Client locale namespace holding every visible string. */
    const NS = 'agent-team-viewer'
    /** Tab-type identity: the tab-type registration id and the body slot key. */
    const TAB_ID = 'dsh-agent-team-viewer'
    /** Page kind the header button opens. A page kind carries no resource patterns. */
    const TAB_KIND = 'agent-team-viewer'
    /** Header action id; `order` puts it immediately left of Subagents (order 10). */
    const ACTION_ID = 'agent-team-viewer'
    const ACTION_ORDER = 8

    /** The projection that publishes the Team board to the Lead session. */
    const TEAM_PROJECTION = 'agentTeam'
    /** Direct children of a session, in parent-catalog order. */
    const AGENT_CATALOG = 'subagentCatalog'
    /** Per-child run timing, including the "last turn completed" marker. */
    const AGENT_TIMING = 'subagentTiming'
    /** The session's model and reasoning effort, published for every session. */
    const MODEL_SELECTION = 'modelSelection'
    /** The agent preset id the session was started with. */
    const AGENT_PRESET = 'agentPreset'
    /** The shipped subagent plugin's locale namespace, reused for its labels. */
    const AGENT_NS = 'subagent'
    /**
     * How many subagents the tree walk keeps when the row's config names no
     * limit. `-1` — the shipped default — means no limit, because a session
     * appends each new agent to the end of its catalog: a cap always hides the
     * newest agents, which are the ones most likely to be working. The field
     * exists for a profile that needs to bound the walk of a huge tree.
     */
    const AGENTS_LIMIT_DEFAULT = -1
    /** Profile entry id of this plugin's Host row: the settings namespace and its config key. */
    const SETTINGS_NAMESPACE = 'agent-team-viewer'
    /** The row's Config field carrying the agent limit; `-1` means no limit. */
    const AGENTS_LIMIT_FIELD = 'agentsLimit'
    /** Per-session token counters published for every listed session. */
    const TOKENS_PROJECTION = 'tokenUsage'
    /** Per-session wall-clock agent stats; summary-excluded, so it needs a refresh. */
    const STATS_PROJECTION = 'sessionStats'

    /** Identity of the browser-local observation ledger. */
    const LEDGER_KEY = 'dsh.agent-team-viewer.observed.v1'
    /** How many observation records to retain, newest first. */
    const LEDGER_LIMIT = 400
    /** Re-render cadence for the ticking "running for" label, in milliseconds. */
    const TICK_MS = 15000
    /** Session-list refresh cadence while the board is open, in milliseconds. */
    const REFRESH_MS = 20000
    /**
     * How long the task dialog waits for a never-opened agent's Chat target to
     * publish its final answer. The retained session opens its history in the
     * background, so the first snapshot is empty; subscribing to the target and
     * waiting briefly is what lets the Report tab show the real answer instead
     * of its empty state. The bound keeps a slow or failed open from pinning
     * the dialog.
     */
    const REPORT_WAIT_MS = 2000

    /** Identity of the browser-local fold state: folded sections and groups. */
    const COLLAPSE_KEY = 'dsh.agent-team-viewer.collapsed.v1'
    /**
     * Identity of the browser-local background-time store. The jobs service
     * only publishes the live roster: a settled JobView stays until its owner
     * session is disposed and is then gone, so no API can total the lifetime
     * background time. The board merges the roster's intervals into this store
     * per agent and totals their union.
     */
    const BACKGROUND_KEY = 'dsh.agent-team-viewer.background.v1'
    /** Merged intervals one agent keeps; the newest win when the cap is hit. */
    const BACKGROUND_INTERVALS_LIMIT = 300
    /** Agents the background store keeps; the freshest win when the cap is hit. */
    const BACKGROUND_AGENTS_LIMIT = 200
    /** Items one expanded group shows before the "show all" control. */
    const VISIBLE_LIMIT = 5
    /** A group bigger than this folds itself the first time it is seen that big. */
    const AUTO_COLLAPSE_AT = 12

    /**
     * Board columns in display order. `status` matches TeamTaskStatus; the
     * ready/pending split is what separates queued work from blocked work.
     * `state` is the product's own status state, so the dot and the card
     * accent use the same colours as the Subagents task list: idle, warning,
     * ongoing, done.
     * @type {ReadonlyArray<{ key: string, status: string, blocked?: boolean, state: string }>}
     */
    const COLUMNS = [
      { key: 'queued', status: 'pending', blocked: false, state: 'idle' },
      { key: 'blocked', status: 'pending', blocked: true, state: 'warning' },
      { key: 'active', status: 'in_progress', blocked: false, state: 'ongoing' },
      { key: 'done', status: 'completed', blocked: false, state: 'done' },
    ]

    /**
     * The agents broken down by the same statuses the task board uses: running,
     * completed, and never run. Each group renders like a task column.
     * @type {ReadonlyArray<{ key: string, activity: string, state: string, labelKey: string }>}
     */
    const AGENT_COLUMNS = [
      { key: 'active', activity: 'running', state: 'ongoing', labelKey: 'colActive' },
      { key: 'done', activity: 'completed', state: 'done', labelKey: 'colDone' },
      { key: 'idle', activity: 'inactive', state: 'idle', labelKey: 'colAgentIdle' },
    ]

    /** Task status -> the product's state name, keyed like the Team task list. */
    const STATUS_STATES = { pending: 'idle', in_progress: 'ongoing', completed: 'done' }

    /** Job status -> the product's state name, as the shipped Jobs popover paints it. */
    const JOB_STATES = {
      running: 'ongoing',
      stopping: 'warning',
      completed: 'done',
      killed: 'warning',
      failed: 'error',
    }

    /** Job statuses that still hold the agent: a live job keeps it busy. */
    const JOB_LIVE = { running: true, stopping: true }

    /**
     * How many session rosters the board may watch at once. The service opens
     * one stream per watched session, so a huge tree must not open one per row.
     */
    const JOBS_WATCH_CAP = 12

    /** Statuses whose cards carry execution statistics. */
    const STATS_STATUSES = { in_progress: true, completed: true }

    /** Cost namespace of the optional cost-meter plugin, if the profile has it. */
    const COST_REMOTE = 'remote.costMeter'
