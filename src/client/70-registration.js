    /* ------------------------------------------------------------------ *
     * Registration: the tab type, its body, the header action, and the
     * service face the body needs.
     * ------------------------------------------------------------------ */

    /** The guide card artwork for the tab type. */
    function KanbanArtwork(props) {
      return h(Icon, { name: 'kanban', size: props?.size ?? 16 })
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)

        // Every locale the client ships, so the board follows the application
        // language instead of falling back to raw keys on a system locale we
        // did not cover.
        ctx.effect(() => ctx.locale.register(NS, {
          en: EN,
          ru: RU,
          zh: ZH,
          ja: JA,
          es: ES,
          fr: FR,
          de: DE,
          pt: PT,
        }), 'agent-team-viewer: dictionaries')

        /**
         * Read one projection value for any reachable session.
         * @param sessionId - the session id.
         * @param key - the projection key.
         * @returns the snapshot value, or undefined when unavailable.
         */
        const faceOf = (sessionId, key) => {
          try {
            const sessions = ctx.get('sessions')
            const binding = sessions?.binding?.(sessionId)
            const face = binding?.session?.projections?.faceOf?.(key)
            return typeof face?.getSnapshot === 'function' ? face.getSnapshot() : undefined
          } catch {
            // A session that is not initialized simply has no face.
            return undefined
          }
        }

        /**
         * Ask the session controller to load a session's full projections.
         * @param sessionId - the session id.
         * @returns nothing; failures are silent because the board degrades.
         */
        const refreshProjections = (sessionId) => {
          try {
            const sessions = ctx.get('sessions')
            const pending = sessions?.refreshProjections?.(sessionId)
            if (pending !== null && typeof pending === 'object' && typeof pending.catch === 'function') {
              pending.catch(() => {})
            }
          } catch {
            // Refreshing is an optimization; the list payload may already carry the value.
          }
        }

        /**
         * The sessions list snapshot, read lazily so a late service still answers.
         * @returns the list state, or undefined before the service is ready.
         */
        const listState = () => {
          try {
            const sessions = ctx.get('sessions')
            return typeof sessions?.list?.getSnapshot === 'function' ? sessions.list.getSnapshot() : undefined
          } catch {
            return undefined
          }
        }

        /**
         * Subscribe to sessions list changes without the slot's helper hook.
         * @param listener - called on every change.
         * @returns the disposer.
         */
        const subscribeList = (listener) => {
          try {
            const sessions = ctx.get('sessions')
            const off = typeof sessions?.list?.subscribe === 'function' ? sessions.list.subscribe(listener) : undefined
            return typeof off === 'function' ? off : () => {}
          } catch {
            return () => {}
          }
        }

        /**
         * Load the API money figures of the given sessions from cost-meter,
         * when that plugin is installed. Its ledger is USD; `apiCost` is the
         * real-money part and `cost` the plan-inclusive equivalent.
         * @param sessionIds - owning session ids.
         * @returns a map from session id to a normalized record, or null when the remote is absent.
         */
        const loadCosts = async (sessionIds) => {
          let service
          try {
            service = ctx.get(COST_REMOTE)
          } catch {
            service = undefined
          }
          if (service === null || service === undefined || typeof service !== 'object') return null
          const map = {}
          let answered = false
          for (const sessionId of sessionIds) {
            try {
              if (typeof service.getSessionCost === 'function') {
                const value = unwrapRpc(await service.getSessionCost(sessionId))
                answered = true
                if (value !== null && value !== undefined) map[sessionId] = normalizeCost(value)
              } else if (typeof service.getSessionListCosts === 'function') {
                const value = unwrapRpc(await service.getSessionListCosts({ sessionIds: [sessionId], period: 'total' }))
                answered = true
                const rows = Array.isArray(value) ? value : []
                for (const row of rows) {
                  const id = typeof row?.id === 'string' ? row.id : sessionId
                  map[id] = normalizeCost(row)
                }
              }
            } catch {
              // One unavailable session must not blank the whole column.
            }
          }
          return answered ? map : null
        }

        /**
         * The agent limit the profile row's Config asks for, read from the
         * settings document the Host serves. `agentsLimit` is declared volatile,
         * so the Host projects the live value into that document; the settings
         * surface is optional for a viewer, and an unanswered read keeps the
         * built-in default.
         * @returns the configured limit, or undefined when the profile supplies none.
         */
        const pluginLimit = async () => {
          try {
            const remote = ctx.get('remote')
            const settings = remote?.settings ?? ctx.get('remote.settings')
            if (settings === null || settings === undefined || typeof settings.describe !== 'function') return undefined
            const answer = await settings.describe()
            if (answer === null || typeof answer !== 'object' || answer.ok !== true) return undefined
            const namespaces = answer.value?.namespaces
            if (!Array.isArray(namespaces)) return undefined
            // The namespace is this bundle's own row id; a profile that renames
            // the row is still found by the field the row declares.
            const row = namespaces.find(entry => entry?.ns === SETTINGS_NAMESPACE)
              ?? namespaces.find(entry => typeof entry?.value?.[AGENTS_LIMIT_FIELD] === 'number')
            const value = row?.value?.[AGENTS_LIMIT_FIELD]
            return typeof value === 'number' && Number.isFinite(value) ? value : undefined
          } catch {
            // Without the settings surface the board keeps its built-in limit.
            return undefined
          }
        }

        /**
         * The client jobs service installed by the job controller, when the
         * profile has it. The board only attributes jobs — it never kills one
         * and never opens an output observation — so the service is a soft
         * dependency and every read below degrades to "nothing".
         * @returns the service, or undefined when it is absent.
         */
        const jobsService = () => {
          try {
            return ctx.get('jobs') ?? undefined
          } catch {
            return undefined
          }
        }

        /**
         * The current jobs snapshot: the rosters of every watched session and
         * the per-job observation views. The board reads the rosters only.
         * @returns the snapshot, or undefined when the service is absent.
         */
        const jobsSnapshot = () => {
          try {
            const state = jobsService()?.state
            return typeof state?.getSnapshot === 'function' ? state.getSnapshot() : undefined
          } catch {
            return undefined
          }
        }

        /**
         * Keep one session's roster current. The client service is
         * reference-counted, so watching the same session twice shares one
         * stream; the returned function releases this watcher's reference.
         * @param sessionId - the session whose visible jobs to mirror.
         * @returns the stop function, or undefined when the service is absent.
         */
        const watchJobs = (sessionId) => {
          try {
            const service = jobsService()
            return typeof service?.watchRows === 'function' ? service.watchRows(sessionId) : undefined
          } catch {
            return undefined
          }
        }

        /**
         * Subscribe to jobs snapshot changes while the board is mounted.
         * @param listener - called on every roster or observation change.
         * @returns the disposer; a no-op when the service is absent.
         */
        const subscribeJobs = (listener) => {
          try {
            const state = jobsService()?.state
            return typeof state?.subscribe === 'function' ? state.subscribe(listener) : () => {}
          } catch {
            return () => {}
          }
        }

        /**
         * The resource address the shipped subagent chat tab parses. The plugin
         * builds it internally and exports no helper, so the format is spelled
         * here: `dsh-resource://subagentchat/session/<child>?parent=<parent>&mode=<mode>`.
         * @param address - a `SubagentAddress` from `sessions.subagentAddress()`.
         * @returns the resource address string.
         */
        const agentChatAddress = (address) => 'dsh-resource://subagentchat/session/'
          + encodeURIComponent(address.childSessionId)
          + '?parent=' + encodeURIComponent(address.parentSessionId)
          + '&mode=' + encodeURIComponent(address.mode)

        /**
         * The file resource address the workspace file provider parses. The
         * shipped builder exports no client helper, so the format is spelled
         * here: `dsh-resource://file/session/<sessionId>/<path>`, every id and
         * path segment component-encoded, `:` literal for a Windows drive.
         * @param sessionId - the session whose workspace root resolves the path.
         * @param path - workspace-relative or absolute path, either separator.
         * @returns the resource address string.
         */
        const fileAddress = (sessionId, path) => 'dsh-resource://file/session/'
          + encodeURIComponent(sessionId)
          + '/'
          + String(path)
            .replace(/\\/g, '/')
            .replace(/^(?:\.\/)+/, '')
            .split('/')
            .map(segment => encodeURIComponent(segment).replace(/%3A/gi, ':'))
            .join('/')

        /**
         * Open one write scope of a task in the workspace. A file opens the
         * shipped file resource; a folder opens the Files page, because that
         * page accepts no path. Navigation is best-effort: a missing sidebar
         * or a resource the installed types cannot open falls back to the
         * Files page and never throws into the read-only board.
         * @param sessionId - the session whose workspace root owns the path.
         * @param path - the task's write scope.
         * @returns nothing.
         */
        const openFileLink = (sessionId, path) => {
          if (typeof sessionId !== 'string' || sessionId === '') return
          if (typeof path !== 'string' || path === '') return
          const folder = path.endsWith('/') || path.endsWith('\\')
          const openFilesTab = () => {
            try {
              const sidebar = ctx.get('sidebarRight')
              if (sidebar !== null && sidebar !== undefined && typeof sidebar.openTab === 'function') {
                sidebar.openTab('files')
              }
            } catch {
              // The Files page is a convenience; a closed panel is not an error.
            }
          }
          if (folder) {
            openFilesTab()
            return
          }
          try {
            const sidebar = ctx.get('sidebarRight')
            if (sidebar !== null && sidebar !== undefined && typeof sidebar.openResource === 'function') {
              sidebar.openResource(fileAddress(sessionId, path))
              return
            }
          } catch {
            // An unopenable address falls back to the workspace page below.
          }
          openFilesTab()
        }

        /**
         * Go to a subagent: open its chat beside the board, or switch the main
         * column to it. This only navigates — the board is still a viewer.
         * @param agentId - the subagent's Session id.
         * @param target - `'aside'` (right panel) or `'main'` (conversation).
         * @returns nothing.
         */
        const openAgent = (agentId, target) => {
          try {
            const sessions = ctx.get('sessions')
            const address = typeof sessions?.subagentAddress === 'function'
              ? sessions.subagentAddress(agentId)
              : undefined
            const workspace = ctx.get('uiWorkspace')
            const openMain = () => {
              if (workspace !== null && workspace !== undefined && typeof workspace.openSession === 'function') {
                workspace.openSession(address === undefined ? agentId : address)
              }
            }
            if (target === 'main') {
              openMain()
              return
            }
            const sidebar = ctx.get('sidebarRight')
            if (address !== undefined && sidebar !== null && sidebar !== undefined
              && typeof sidebar.openResource === 'function') {
              sidebar.openResource(agentChatAddress(address), { kind: 'subagentchat', preferNewPane: true })
              return
            }
            openMain()
          } catch {
            // Navigation is best-effort: a closed panel must not swallow the click.
          }
        }

        /**
         * Translate a label in the shipped subagent plugin's namespace, so the
         * board says "running" / "one-shot" exactly as the Subagents menu does.
         * @param key - the key inside that namespace.
         * @param fallback - English text used when the namespace is unavailable.
         * @returns the label.
         */
        const agentLabel = (() => {
          let bound
          try {
            bound = ctx.locale.bind(AGENT_NS)
          } catch {
            bound = undefined
          }
          return (key, fallback) => {
            if (typeof bound !== 'function') return fallback
            try {
              const value = bound(key)
              return typeof value === 'string' && value !== '' && value !== key ? value : fallback
            } catch {
              return fallback
            }
          }
        })()

        /**
         * The final answer inside one Chat snapshot: the last non-empty
         * Assistant text row, in anchor order. Assistant rows are
         * `kind: 'assistant-step'` and their prose is the `text` blocks; the
         * last one is the answer the turn closed with. The navigation preview
         * is deliberately not used — it is bounded and loses the answer.
         * @param snapshot - a ChatSnapshot from `uiConversation.target('chat')`.
         * @returns the trimmed answer text, or undefined when there is none.
         */
        const finalAnswerOf = (snapshot) => {
          const store = snapshot?.nodes
          if (store === null || store === undefined || typeof store.values !== 'function') return undefined
          let rows
          try {
            rows = Array.from(store.values())
          } catch {
            return undefined
          }
          const answers = []
          for (const row of rows) {
            if (row === null || row === undefined || row.kind !== 'assistant-step') continue
            const blocks = row.data?.blocks
            if (!Array.isArray(blocks)) continue
            const text = blocks
              .filter(block => block !== null && typeof block === 'object'
                && block.kind === 'text' && typeof block.text === 'string')
              .map(block => block.text)
              .join('')
              .trim()
            if (text === '') continue
            answers.push({ anchor: num(row.anchorSeq), text })
          }
          if (answers.length === 0) return undefined
          answers.sort((left, right) => left.anchor - right.anchor)
          return answers[answers.length - 1].text
        }

        /**
         * The final answer inside one Chat target, read without throwing.
         * @param chat - the Chat target source from `assembly.target('chat')`.
         * @returns the answer text, or undefined when the target is absent,
         *   unreadable or still empty.
         */
        const chatAnswerOf = (chat) => {
          try {
            return finalAnswerOf(chat?.getSnapshot?.())
          } catch {
            return undefined
          }
        }

        /**
         * Wait for one Chat target to publish a non-empty answer.
         *
         * Retaining a never-opened agent starts its history opening in the
         * background, so the first synchronous snapshot is empty. Subscribing
         * to the target activates its view builder and wakes the caller on the
         * first conversation publication; the caller therefore settles on the
         * first answer, the initial open's failure, or the bounded timeout. The
         * wait is one-shot and never rejects; the caller releases the retained
         * reference in its own `finally`.
         * @param chat - the Chat target source.
         * @param reference - the retained Session reference; its `ready` may fail.
         * @returns the answer text, or undefined.
         */
        const waitForChatAnswer = (chat, reference) => new Promise(resolve => {
          let settled = false
          let off
          let timer
          const finish = (value) => {
            if (settled) return
            settled = true
            if (timer !== undefined && typeof clearTimeout === 'function') clearTimeout(timer)
            try {
              if (typeof off === 'function') off()
            } catch {
              // A source that already ended needs no unsubscribe.
            }
            resolve(value)
          }
          const read = () => {
            const answer = chatAnswerOf(chat)
            if (answer !== undefined) finish(answer)
            return answer
          }
          try {
            off = chat.subscribe(read)
          } catch {
            finish(undefined)
            return
          }
          // The builder may publish an answer from inside subscribe, before
          // the unsubscribe handle was assigned; release it now.
          if (settled) {
            try {
              if (typeof off === 'function') off()
            } catch {
              // A source that already ended needs no unsubscribe.
            }
            return
          }
          // A builder may fill synchronously inside subscribe.
          if (read() !== undefined) return
          if (typeof setTimeout === 'function') {
            timer = setTimeout(() => { finish(chatAnswerOf(chat)) }, REPORT_WAIT_MS)
          }
          const ready = reference === undefined || reference === null ? undefined : reference.ready
          if (ready !== null && typeof ready === 'object' && typeof ready.then === 'function') {
            ready.then(
              () => { read() },
              () => { finish(undefined) },
            )
          } else if (timer === undefined) {
            // No clock to bound the wait: report the empty state now.
            finish(undefined)
          }
        })

        /**
         * Read a subagent's final answer from its chat, without opening a tab.
         * The task record carries no report, so the answer is read from the
         * live conversation: retain the session, resolve its Chat target, read
         * the snapshot once, and — because a never-opened session's history is
         * still opening, so that first snapshot is empty — wait briefly for the
         * target to publish its first non-empty answer. The retained reference
         * is released in `finally`. A missing service, an unopened session, an
         * open that fails or a timeout resolves to undefined rather than
         * rejecting, so the dialog shows its empty state.
         * @param agentId - the owner session id.
         * @returns the final answer text, or undefined.
         */
        const loadAgentReport = async (agentId) => {
          let reference
          try {
            if (typeof agentId !== 'string' || agentId === '') return undefined
            const sessions = ctx.get('sessions')
            if (sessions === null || sessions === undefined || typeof sessions.retain !== 'function') return undefined
            const address = typeof sessions.subagentAddress === 'function'
              ? sessions.subagentAddress(agentId)
              : undefined
            // A Lead owner has no subagent address, but its identity is a
            // valid retain target too.
            reference = sessions.retain(address ?? agentId, { source: 'agent-team-viewer' })
            const binding = reference?.binding
            if (binding === null || binding === undefined) return undefined
            const conversation = ctx.get('uiConversation')
            if (conversation === null || conversation === undefined
              || typeof conversation.binding !== 'function') return undefined
            const assembly = conversation.binding(binding)
            if (assembly === null || assembly === undefined || typeof assembly.target !== 'function') return undefined
            const chat = assembly.target('chat')
            if (chat === null || chat === undefined || typeof chat.getSnapshot !== 'function') return undefined
            const immediate = chatAnswerOf(chat)
            if (immediate !== undefined) return immediate
            if (typeof chat.subscribe !== 'function') return undefined
            return await waitForChatAnswer(chat, reference)
          } catch {
            // The report is optional context; a failure is an empty tab.
            return undefined
          } finally {
            try {
              if (reference !== undefined && typeof reference.release === 'function') reference.release()
            } catch {
              // Releasing a reference that already ended is harmless.
            }
          }
        }

        /** The face the board body receives: reads, refreshes, costs, jobs and navigation. */
        const services = {
          faceOf,
          refreshProjections,
          loadCosts,
          pluginLimit,
          listState,
          subscribeList,
          jobsSnapshot,
          watchJobs,
          subscribeJobs,
          openAgent,
          openFileLink,
          loadAgentReport,
          agentLabel,
        }

        /** Open the board tab; a missing right sidebar must not break the click. */
        const openBoard = () => {
          try {
            const sidebar = ctx.get('sidebarRight')
            if (sidebar !== null && sidebar !== undefined && typeof sidebar.openTab === 'function') {
              sidebar.openTab(TAB_KIND)
            }
          } catch {
            // The button stays inert when the right sidebar is not mounted.
          }
        }

        ctx.inject(['sidebarRight', 'sidebarRightTabs'], (scope) => {
          scope.effect(() => scope.sidebarRightTabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            priority: 'extension',
            keepMounted: true,
            title: () => t('tabTitle'),
            guide: [{
              id: 'open',
              order: 40,
              title: () => t('tabTitle'),
              description: () => t('readOnlyHint'),
              icon: KanbanArtwork,
            }],
          }), 'agent-team-viewer: tab type')

          scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
            name: 'sidebar.right.pane.tab',
            key: TAB_ID,
            locale: NS,
            inject: (sessionId) => ({ sessionId, services }),
          }, BoardTab)), 'agent-team-viewer: board')

          // The chip's own title seat: `title()` is captured when the tab
          // opens, and only this registration follows a language change.
          scope.effect(() => scope.slots.inject('sidebar.right.pane.tab.title', () => scope.slots.register({
            name: 'sidebar.right.pane.tab.title',
            key: TAB_ID,
            locale: NS,
          }, BoardTitle)), 'agent-team-viewer: tab title')
        })

        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: ACTION_ID,
          order: ACTION_ORDER,
          locale: NS,
          inject: () => ({ open: openBoard }),
        }, HeaderBoardAction))

        // The Settings page of the board. Its preferences are browser-local
        // view state, so the page writes localStorage and never the Host
        // settings document. The nav label is the plugin's literal name and
        // stays untranslated in every language; the page content is localized.
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'agent-team-viewer',
          order: 80,
          label: () => 'Agent Team Viewer',
          locale: NS,
          inject: () => ({}),
        }, SettingsSection))

        // The task record keeps no timestamps, so the elapsed labels come from
        // watching the board. This watcher runs for as long as the page does,
        // which is what lets a task that started before the panel was opened
        // still show a start time.
        ctx.inject(['sessions'], (scope) => {
          scope.effect(() => {
            const collect = () => {
              try {
                const state = scope.sessions.list.getSnapshot()
                const bundles = state?.projectionsBySession ?? {}
                const seen = []
                for (const id of Object.keys(bundles)) {
                  const team = listProjection(state, id, TEAM_PROJECTION)
                  if (Array.isArray(team?.tasks)) {
                    for (const task of team.tasks) seen.push(task)
                  }
                }
                if (seen.length > 0) noteObservations(seen)
              } catch {
                // A snapshot without the projection is the normal first state.
              }
            }
            collect()
            const off = typeof scope.sessions.list.subscribe === 'function' ? scope.sessions.list.subscribe(collect) : undefined
            const timer = window.setInterval(collect, REFRESH_MS)
            return () => {
              if (typeof off === 'function') off()
              window.clearInterval(timer)
            }
          }, 'agent-team-viewer: observation watcher')
        })
      },
    }
