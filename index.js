/**
 * Agent Team viewer — Host half.
 *
 * The board is a pure browser view: it reads the Team task board and session
 * statistics that other plugins already publish to the page, so this half owns
 * no service, no route and no tool. It exists for two reasons: the bundle needs
 * an activatable row, and the row carries the board's one tunable — how many
 * subagents the browser half walks and draws.
 *
 * The schema library is a peer supplied by the Host, and it is imported lazily:
 * a profile that cannot resolve it loses the settings card (the board keeps its
 * built-in limit) instead of losing the whole board to a tuning knob.
 */

/**
 * Build the settings schema of the profile row.
 *
 * `agentsLimit` is volatile so the settings document the Host serves carries
 * the live value: the browser half reads it from there, and an edit applies
 * without remounting the plugin. `-1` — the default — means no limit, because a
 * session appends each new agent to the end of its catalog and a cap would hide
 * the newest (and busiest) agents; a positive number bounds a huge tree.
 *
 * @returns the schema, or nothing when the schema library is unavailable.
 */
async function buildConfig() {
  try {
    const { default: Schema } = await import('@deepseek-ai/schemastery')
    return Schema.object({
      agentsLimit: Schema.number()
        .step(1)
        .min(-1)
        .default(-1)
        .description('Maximum subagents drawn on the board; -1 (the default) means no limit')
        .volatile(),
    })
  } catch {
    return undefined
  }
}

/** The row's Config schema; absent when the profile cannot provide schemastery. */
export const Config = await buildConfig()

/**
 * Nothing to do on the Host: the board reads what other plugins publish.
 *
 * @returns {void}
 */
export function apply() {}
