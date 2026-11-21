/* ------------------------------------------------------------------ *
 * View settings: the browser-local preferences of the board and the
 * Settings page that edits them. Nothing here reaches the Host — the
 * profile row keeps its own Config, and the view preferences live in
 * localStorage beside the observation ledger and the fold state.
 * ------------------------------------------------------------------ */

    /** Identity of the browser-local view settings. */
    const VIEW_SETTINGS_KEY = 'dsh.agent-team-viewer.settings.v1'
    /** The longest and shortest card animation the slider offers, in ms. */
    const VIEW_ANIMATION_MAX = 1000
    const VIEW_ANIMATION_STEP = 20
    /** The panel scale bounds and its slider step. */
    const VIEW_SCALE_MIN = 0.8
    const VIEW_SCALE_MAX = 1.4
    const VIEW_SCALE_STEP = 0.05
    /** The task orders the board offers; the first one is the default. */
    const VIEW_SORTS = ['newest', 'oldest', 'name']
    /**
     * The project's public pages, linked from the Settings page's About block.
     * The base is package.json's repository URL without the `git+` prefix and
     * the trailing `.git`, so the three links cannot drift apart.
     */
    const ABOUT_REPOSITORY = 'https://github.com/RealWof/dsh-agent-team-viewer'
    const ABOUT_README = ABOUT_REPOSITORY + '/blob/main/README.md'
    const ABOUT_CHANGELOG = ABOUT_REPOSITORY + '/blob/main/CHANGELOG.md'

    /**
     * Every view preference and its shipped default. `newest` keeps the board
     * in the order a session appends tasks: the newest work stays on top.
     * `showAgentModel` stays off so the agent rows stay as compact as the
     * Subagents menu's, and the model line is opt-in.
     * @type {{ autoRoleGroups: boolean, customGroups: boolean, customGroupsText: string, taskCustomGroups: boolean, taskCustomGroupsText: string, sort: string, animateCards: boolean, animationMs: number, uiScale: number, dialogScale: number, showAgentModel: boolean }}
     */
    const VIEW_SETTINGS_DEFAULTS = {
      autoRoleGroups: true,
      customGroups: false,
      customGroupsText: '',
      taskCustomGroups: false,
      taskCustomGroupsText: '',
      sort: 'newest',
      animateCards: true,
      animationMs: 220,
      uiScale: 1,
      dialogScale: 1,
      showAgentModel: false,
    }

    /**
     * Clamp one number to a range and snap it to a step.
     * @param value - anything the store may hold.
     * @param min - lower bound.
     * @param max - upper bound.
     * @param step - increment.
     * @param fallback - used when the value is not numeric.
     * @returns the sanitized number.
     */
    function snapSetting(value, min, max, step, fallback) {
      const number = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(number)) return fallback
      const snapped = Math.round(number / step) * step
      const clamped = Math.min(max, Math.max(min, snapped))
      // A step like 0.05 drifts in binary floating point; four decimals is
      // exact for every value this slider can produce.
      return Number(clamped.toFixed(4))
    }

    /**
     * Reduce any stored shape to a complete, valid view settings record.
     * @param input - whatever localStorage or a patch supplied.
     * @returns the sanitized record, always with every field.
     */
    function sanitizeViewSettings(input) {
      const source = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {}
      const has = key => Object.prototype.hasOwnProperty.call(source, key)
      const read = key => (has(key) ? source[key] : undefined)
      const boolean = (value, fallback) => (typeof value === 'boolean' ? value : fallback)
      const sort = VIEW_SORTS.includes(read('sort')) ? read('sort') : VIEW_SETTINGS_DEFAULTS.sort
      return {
        autoRoleGroups: boolean(read('autoRoleGroups'), VIEW_SETTINGS_DEFAULTS.autoRoleGroups),
        customGroups: boolean(read('customGroups'), VIEW_SETTINGS_DEFAULTS.customGroups),
        customGroupsText: typeof read('customGroupsText') === 'string'
          ? read('customGroupsText')
          : VIEW_SETTINGS_DEFAULTS.customGroupsText,
        taskCustomGroups: boolean(read('taskCustomGroups'), VIEW_SETTINGS_DEFAULTS.taskCustomGroups),
        taskCustomGroupsText: typeof read('taskCustomGroupsText') === 'string'
          ? read('taskCustomGroupsText')
          : VIEW_SETTINGS_DEFAULTS.taskCustomGroupsText,
        sort,
        animateCards: boolean(read('animateCards'), VIEW_SETTINGS_DEFAULTS.animateCards),
        animationMs: snapSetting(read('animationMs'), 0, VIEW_ANIMATION_MAX, VIEW_ANIMATION_STEP,
          VIEW_SETTINGS_DEFAULTS.animationMs),
        uiScale: snapSetting(read('uiScale'), VIEW_SCALE_MIN, VIEW_SCALE_MAX, VIEW_SCALE_STEP,
          VIEW_SETTINGS_DEFAULTS.uiScale),
        dialogScale: snapSetting(read('dialogScale'), VIEW_SCALE_MIN, VIEW_SCALE_MAX, VIEW_SCALE_STEP,
          VIEW_SETTINGS_DEFAULTS.dialogScale),
        showAgentModel: boolean(read('showAgentModel'), VIEW_SETTINGS_DEFAULTS.showAgentModel),
      }
    }

    /**
     * Read the stored view settings.
     * @returns the sanitized record; the defaults on a blocked or corrupt store.
     */
    function readViewSettings() {
      try {
        const raw = window.localStorage.getItem(VIEW_SETTINGS_KEY)
        if (raw === null || raw === '') return { ...VIEW_SETTINGS_DEFAULTS }
        return sanitizeViewSettings(JSON.parse(raw))
      } catch {
        // A blocked store only costs the remembered preferences.
        return { ...VIEW_SETTINGS_DEFAULTS }
      }
    }

    /** Module-wide view settings: the stored record plus this page's listeners. */
    const VIEW_SETTINGS = {
      value: readViewSettings(),
      listeners: new Set(),
    }

    /** Tell every mounted surface that the preferences moved. */
    function notifyViewSettings() {
      for (const listener of VIEW_SETTINGS.listeners) {
        try {
          listener()
        } catch {
          // One broken listener must not stop the others.
        }
      }
    }

    /**
     * Merge a patch into the view settings, sanitize, persist and notify.
     * @param patch - the fields to change.
     * @returns the new record.
     */
    function writeViewSettings(patch) {
      const valid = patch !== null && typeof patch === 'object' && !Array.isArray(patch)
      const merged = valid ? { ...VIEW_SETTINGS.value, ...patch } : { ...VIEW_SETTINGS.value }
      const next = sanitizeViewSettings(merged)
      VIEW_SETTINGS.value = next
      try {
        window.localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(next))
      } catch {
        // A blocked store keeps the change for this page only.
      }
      notifyViewSettings()
      return next
    }

    /**
     * Subscribe one surface to the view settings.
     * @param listener - called after every accepted write.
     * @returns the disposer.
     */
    function subscribeViewSettings(listener) {
      if (typeof listener !== 'function') return () => {}
      VIEW_SETTINGS.listeners.add(listener)
      return () => { VIEW_SETTINGS.listeners.delete(listener) }
    }

    /**
     * The view settings and a writer, as a hook.
     * @returns `[settings, update]`, where `update(patch)` writes one change.
     */
    function useViewSettings() {
      const [settings, setSettings] = useState(() => VIEW_SETTINGS.value)
      useEffect(() => subscribeViewSettings(() => { setSettings(VIEW_SETTINGS.value) }), [])
      const update = useCallback(patch => { writeViewSettings(patch) }, [])
      return [settings, update]
    }

    /**
     * Parse the custom-group editor into groups.
     *
     * One group per line, `Group name: pattern, pattern`; blank lines are
     * skipped and a later line reusing a name (case-insensitive) is dropped.
     * @param text - the editor's text.
     * @returns `[{ name, patterns }]`, in editor order.
     */
    function parseCustomGroups(text) {
      const groups = []
      const seen = new Set()
      if (typeof text !== 'string') return groups
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed === '') continue
        const colon = trimmed.indexOf(':')
        if (colon < 0) continue
        const name = trimmed.slice(0, colon).trim()
        if (name === '') continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        const patterns = trimmed.slice(colon + 1).split(',').map(part => part.trim()).filter(part => part !== '')
        if (patterns.length === 0) continue
        seen.add(key)
        groups.push({ name, patterns })
      }
      return groups
    }

    /**
     * Format the panel scale for the slider: `x1.00`.
     * @param value - the scale factor.
     * @returns the label.
     */
    function formatScale(value) {
      const scale = typeof value === 'number' && Number.isFinite(value) ? value : VIEW_SETTINGS_DEFAULTS.uiScale
      return 'x' + scale.toFixed(2)
    }

    /**
     * The view settings page of the Settings panel. The preferences are
     * browser-local, so every control writes localStorage directly and the
     * board picks the change up through the shared store.
     * @param props - `t` from the slot's locale register, plus the shell's `close`.
     */
    function SettingsSection(props) {
      const { t } = props
      const [settings, update] = useViewSettings()
      // The stylesheet normally arrives with the board; the Settings page may
      // be the only surface mounted, so it carries its own copy.
      return h('div', { className: 'tk-set', 'data-view-settings': 'true' },
        h(Styles, null),
        h('p', { className: 'tk-set-hint' }, t('settingsNote')),

        h(Section, { title: t('setGrouping'), icon: 'layers' },
          h('label', { className: 'tk-set-check' },
            h('input', {
              type: 'checkbox',
              checked: settings.autoRoleGroups,
              onChange: event => { update({ autoRoleGroups: event.target.checked }) },
            }),
            h('span', null, t('setAutoRoleGroups'))),
          h('span', { className: 'tk-set-hint' }, t('setAutoRoleGroupsHint')),
          h('label', { className: 'tk-set-check' },
            h('input', {
              type: 'checkbox',
              checked: settings.customGroups,
              onChange: event => { update({ customGroups: event.target.checked }) },
            }),
            h('span', null, t('setCustomGroups'))),
          h('span', { className: 'tk-set-hint' }, t('setCustomGroupsHint')),
          h('textarea', {
            className: 'tk-set-text',
            rows: 3,
            value: settings.customGroupsText,
            placeholder: t('setCustomGroupsExample'),
            'aria-label': t('setCustomGroups'),
            disabled: settings.customGroups !== true,
            onChange: event => { update({ customGroupsText: event.target.value }) },
          }),
          h('span', { className: 'tk-set-hint tk-set-example' }, t('setCustomGroupsNote')),

          h('label', { className: 'tk-set-check' },
            h('input', {
              type: 'checkbox',
              checked: settings.taskCustomGroups,
              onChange: event => { update({ taskCustomGroups: event.target.checked }) },
            }),
            h('span', null, t('setTaskCustomGroups'))),
          h('span', { className: 'tk-set-hint' }, t('setTaskCustomGroupsHint')),
          h('textarea', {
            className: 'tk-set-text',
            rows: 3,
            value: settings.taskCustomGroupsText,
            placeholder: t('setTaskCustomGroupsExample'),
            'aria-label': t('setTaskCustomGroups'),
            disabled: settings.taskCustomGroups !== true,
            onChange: event => { update({ taskCustomGroupsText: event.target.value }) },
          }),
          h('span', { className: 'tk-set-hint tk-set-example' }, t('setCustomGroupsNote'))),

        h(Section, { title: t('setSorting'), icon: 'hash' },
          h('div', { className: 'tk-set-field' },
            h('span', { className: 'tk-set-label' }, t('setSorting')),
            h('select', {
              className: 'tk-set-select',
              'aria-label': t('setSorting'),
              value: settings.sort,
              onChange: event => { update({ sort: event.target.value }) },
            },
            h('option', { value: 'newest' }, t('setSortNewest')),
            h('option', { value: 'oldest' }, t('setSortOldest')),
            h('option', { value: 'name' }, t('setSortName'))))),

        h(Section, { title: t('setMotion'), icon: 'activity' },
          h('label', { className: 'tk-set-check' },
            h('input', {
              type: 'checkbox',
              checked: settings.animateCards,
              onChange: event => { update({ animateCards: event.target.checked }) },
            }),
            h('span', null, t('setAnimateCards'))),
          h('span', { className: 'tk-set-hint' }, t('setAnimateCardsHint')),
          h('div', { className: 'tk-set-field', 'data-disabled': settings.animateCards !== true },
            h('span', { className: 'tk-set-label' }, t('setAnimationDuration')),
            h('input', {
              className: 'tk-set-range',
              type: 'range',
              min: 0,
              max: VIEW_ANIMATION_MAX,
              step: VIEW_ANIMATION_STEP,
              value: settings.animationMs,
              'aria-label': t('setAnimationDuration'),
              disabled: settings.animateCards !== true,
              onChange: event => { update({ animationMs: Number(event.target.value) }) },
            }),
            h('span', { className: 'tk-set-value' }, String(settings.animationMs) + ' ' + t('setMs')))),

        h(Section, { title: t('setScale'), icon: 'gauge' },
          h('div', { className: 'tk-set-field' },
            h('span', { className: 'tk-set-label' }, t('setScale')),
            h('input', {
              className: 'tk-set-range',
              type: 'range',
              min: VIEW_SCALE_MIN,
              max: VIEW_SCALE_MAX,
              step: VIEW_SCALE_STEP,
              value: settings.uiScale,
              'aria-label': t('setScale'),
              onChange: event => { update({ uiScale: Number(event.target.value) }) },
            }),
            h('span', { className: 'tk-set-value' }, formatScale(settings.uiScale))),
          h('span', { className: 'tk-set-hint' }, t('setScaleHint')),
          h('div', { className: 'tk-set-field' },
            h('span', { className: 'tk-set-label' }, t('setDialogScale')),
            h('input', {
              className: 'tk-set-range',
              type: 'range',
              min: VIEW_SCALE_MIN,
              max: VIEW_SCALE_MAX,
              step: VIEW_SCALE_STEP,
              value: settings.dialogScale,
              'aria-label': t('setDialogScale'),
              onChange: event => { update({ dialogScale: Number(event.target.value) }) },
            }),
            h('span', { className: 'tk-set-value' }, formatScale(settings.dialogScale))),
          h('span', { className: 'tk-set-hint' }, t('setDialogScaleHint'))),

        h(Section, { title: t('agentsHeading'), icon: 'users' },
          h('label', { className: 'tk-set-check' },
            h('input', {
              type: 'checkbox',
              checked: settings.showAgentModel,
              'aria-label': t('setShowAgentModel'),
              onChange: event => { update({ showAgentModel: event.target.checked }) },
            }),
            h('span', null, t('setShowAgentModel'))),
          h('span', { className: 'tk-set-hint' }, t('setShowAgentModelHint'))),

        h(Section, { title: t('aboutHeading'), icon: 'link' },
          h('div', { className: 'tk-set-about' },
            h('a', {
              className: 'tk-btn',
              href: ABOUT_REPOSITORY,
              target: '_blank',
              rel: 'noreferrer noopener',
            }, h(Icon, { name: 'link', size: 11 }), t('aboutRepository')),
            h('a', {
              className: 'tk-btn',
              href: ABOUT_README,
              target: '_blank',
              rel: 'noreferrer noopener',
            }, h(Icon, { name: 'eye', size: 11 }), t('aboutReadme')),
            h('a', {
              className: 'tk-btn',
              href: ABOUT_CHANGELOG,
              target: '_blank',
              rel: 'noreferrer noopener',
            }, h(Icon, { name: 'pen', size: 11 }), t('aboutChangelog')))))
    }
