/**
 * Agent Team viewer — Host half.
 *
 * The board is a pure browser view: it reads the Team task board and session
 * statistics that other plugins already publish to the page, so this half owns
 * no service, no route and no tool. It exists so the bundle has an activatable
 * row; `dsh.client` loads the same package's browser artifact.
 *
 * @returns {void}
 */
export function apply() {}
