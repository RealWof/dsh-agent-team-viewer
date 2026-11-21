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
     * Subagents menu's, and the model line is opt-in. `showModelProvider` stays
     * off too: the line starts at `model · effort`, and the provider joins it
     * only when the reader asks for it — the tooltip always carries it.
     * @type {{ autoRoleGroups: boolean, customGroups: boolean, customGroupsText: string, taskCustomGroups: boolean, taskCustomGroupsText: string, sort: string, animateCards: boolean, animationMs: number, uiScale: number, dialogScale: number, showAgentModel: boolean, showModelProvider: boolean }}
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
      showModelProvider: false,
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
        showModelProvider: boolean(read('showModelProvider'), VIEW_SETTINGS_DEFAULTS.showModelProvider),
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
     * One titled block of the Settings page: a small muted heading over a calm
     * list of rows, with no card around it.
     * @param props - `title`, optional `icon`, and the rows.
     */
    function SettingsGroup({ title, icon = undefined, children }) {
      return h('section', { className: 'tk-set-group' },
        h('h3', { className: 'tk-set-group-title' },
          icon === undefined ? null : h(Icon, { name: icon, size: 11 }),
          h('span', null, title)),
        children)
    }

    /**
     * One row of the Settings page: the title and its short description on the
     * left, the control on the right, closed by a hairline rule. `stacked`
     * drops the rule because the full-width editor of the row follows it, and
     * `disabled` mutes a row whose control only applies under another switch.
     * @param props - `title`, optional `description`, optional `control`,
     *   `stacked` and `disabled`.
     */
    function SettingsRow({ title, description = undefined, control = undefined, stacked = false, disabled = false }) {
      return h('div', {
        className: 'tk-set-row',
        'data-stacked': stacked === true ? 'true' : undefined,
        'data-disabled': disabled === true ? 'true' : undefined,
      },
      h('div', { className: 'tk-set-copy' },
        h('span', { className: 'tk-set-title' }, title),
        description === undefined || description === null ? null : h('span', { className: 'tk-set-desc' }, description)),
      control === undefined ? null : h('div', { className: 'tk-set-control' }, control))
    }

    /**
     * A boolean row control: the real checkbox behind a CSS track and knob, so
     * `checked` and `onChange` keep the native contract while the row reads as
     * one of the product's own switches.
     * @param props - the `label` (also the accessible name), `checked`, an
     *   optional `disabled`, and `onChange`.
     */
    function SettingsSwitch({ label, checked, disabled = false, onChange }) {
      return h('label', { className: 'tk-set-switch' },
        h('input', {
          type: 'checkbox',
          className: 'tk-set-switch-input',
          checked: checked === true,
          'aria-label': label,
          disabled,
          onChange,
        }),
        h('span', { className: 'tk-set-switch-track', 'aria-hidden': true }))
    }

    /**
     * The full-width editor that follows a stacked row.
     * @param props - the editor and its note.
     */
    function SettingsTextBlock({ children }) {
      return h('div', { className: 'tk-set-text-block' }, children)
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

      /** A boolean row: title and hint on the left, a switch on the right. */
      const switchRow = (key, title, description, stacked = false, disabled = false) => h(SettingsRow, {
        title,
        description,
        stacked,
        disabled,
        control: h(SettingsSwitch, {
          label: title,
          checked: settings[key] === true,
          disabled,
          onChange: event => { update({ [key]: event.target.checked }) },
        }),
      })
      /** A full-width text editor below its own row. */
      const textBlock = (label, key, value, placeholder, disabled) => h(SettingsTextBlock, null,
        h('textarea', {
          className: 'tk-set-text',
          rows: 3,
          value,
          placeholder,
          'aria-label': label,
          disabled,
          onChange: event => { update({ [key]: event.target.value }) },
        }),
        h('span', { className: 'tk-set-desc tk-set-example' }, t('setCustomGroupsNote')))
      /** A slider row: its value sits at the right of the track. */
      const sliderRow = (key, title, description, min, max, step, format, disabled = false) => h(SettingsRow, {
        title,
        description,
        disabled,
        control: h(React.Fragment, null,
          h('input', {
            className: 'tk-set-range',
            type: 'range',
            min,
            max,
            step,
            value: settings[key],
            'aria-label': title,
            disabled,
            onChange: event => { update({ [key]: Number(event.target.value) }) },
          }),
          h('span', { className: 'tk-set-value' }, format(settings[key]))),
      })

      // The stylesheet normally arrives with the board; the Settings page may
      // be the only surface mounted, so it carries its own copy.
      return h('div', { className: 'tk-set', 'data-view-settings': 'true' },
        h(Styles, null),
        h('p', { className: 'tk-set-note' }, t('settingsNote')),

        h(SettingsGroup, { title: t('setGrouping'), icon: 'layers' },
          switchRow('autoRoleGroups', t('setAutoRoleGroups'), t('setAutoRoleGroupsHint')),
          switchRow('customGroups', t('setCustomGroups'), t('setCustomGroupsHint'), true),
          textBlock(t('setCustomGroups'), 'customGroupsText', settings.customGroupsText,
            t('setCustomGroupsExample'), settings.customGroups !== true),
          switchRow('taskCustomGroups', t('setTaskCustomGroups'), t('setTaskCustomGroupsHint'), true),
          textBlock(t('setTaskCustomGroups'), 'taskCustomGroupsText', settings.taskCustomGroupsText,
            t('setTaskCustomGroupsExample'), settings.taskCustomGroups !== true)),

        h(SettingsGroup, { title: t('setSorting'), icon: 'hash' },
          h(SettingsRow, {
            title: t('setSorting'),
            control: h('select', {
              className: 'tk-set-select',
              'aria-label': t('setSorting'),
              value: settings.sort,
              onChange: event => { update({ sort: event.target.value }) },
            },
            h('option', { value: 'newest' }, t('setSortNewest')),
            h('option', { value: 'oldest' }, t('setSortOldest')),
            h('option', { value: 'name' }, t('setSortName'))),
          })),

        h(SettingsGroup, { title: t('setMotion'), icon: 'activity' },
          switchRow('animateCards', t('setAnimateCards'), t('setAnimateCardsHint')),
          h(SettingsRow, {
            title: t('setAnimationDuration'),
            disabled: settings.animateCards !== true,
            control: h(React.Fragment, null,
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
              h('span', { className: 'tk-set-value' }, String(settings.animationMs) + ' ' + t('setMs'))),
          })),

        h(SettingsGroup, { title: t('setScale'), icon: 'gauge' },
          sliderRow('uiScale', t('setScale'), t('setScaleHint'),
            VIEW_SCALE_MIN, VIEW_SCALE_MAX, VIEW_SCALE_STEP, formatScale),
          sliderRow('dialogScale', t('setDialogScale'), t('setDialogScaleHint'),
            VIEW_SCALE_MIN, VIEW_SCALE_MAX, VIEW_SCALE_STEP, formatScale)),

        h(SettingsGroup, { title: t('agentsHeading'), icon: 'users' },
          switchRow('showAgentModel', t('setShowAgentModel'), t('setShowAgentModelHint')),
          switchRow('showModelProvider', t('setShowModelProvider'), t('setShowModelProviderHint'), false,
            settings.showAgentModel !== true)),

        h(SettingsGroup, { title: t('aboutHeading'), icon: 'link' },
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
