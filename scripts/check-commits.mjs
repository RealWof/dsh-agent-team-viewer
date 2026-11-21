#!/usr/bin/env node
/**
 * Commit-message gate for pull requests.
 *
 *   node scripts/check-commits.mjs [<base>..<head>]
 *
 * CI passes the pull request range; locally it defaults to `origin/main..HEAD`. The pull request title
 * is validated from the PR_TITLE environment variable when present, because a squash merge puts the
 * title on `main`, not the individual commits.
 *
 * Rules: English ASCII, a Conventional Commit type, an imperative subject of at most 72 characters
 * without a trailing period, and an optional reason in the body.
 */
import { execFileSync } from 'node:child_process'

const TYPES = ['feat', 'fix', 'docs', 'test', 'chore', 'ci', 'refactor', 'perf', 'build', 'revert']
const SUBJECT = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9-]+\\))*!?: \\S.{0,71}$`)
const REVERT = /^Revert ".+"$/
const MAX_SUBJECT = 72
const MAX_BODY_LINE = 100

const fail = lines => {
  console.error('commit messages: failed')
  for (const line of lines) console.error(`  ${line}`)
  process.exit(1)
}

const isAscii = value => {
  for (const char of value) {
    const code = char.codePointAt(0)
    if (code !== 9 && code !== 10 && (code < 32 || code > 126)) return false
  }
  return true
}

const problems = []
const checkSubject = (label, subject) => {
  if (subject.length === 0) {
    problems.push(`${label}: empty subject`)
    return
  }
  if (!isAscii(subject)) {
    problems.push(`${label}: "${subject}" — use English ASCII only`)
    return
  }
  if (subject.length > MAX_SUBJECT) {
    problems.push(`${label}: subject is ${subject.length} characters, the limit is ${MAX_SUBJECT}`)
  }
  if (subject.endsWith('.')) problems.push(`${label}: "${subject}" — no trailing period`)
  if (REVERT.test(subject)) return
  if (!SUBJECT.test(subject)) {
    problems.push(`${label}: "${subject}" — expected "type(scope): subject" with type ${TYPES.join(', ')}`)
  }
}

const range = process.argv[2] ?? 'origin/main..HEAD'
if (!range.includes('..')) fail([`expected a git range like origin/main..HEAD, got "${range}"`])

let log = ''
try {
  log = execFileSync('git', ['log', '--no-merges', '--format=%H%x1f%s%x1f%b%x1e', range], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  fail([`cannot read the range "${range}"; fetch the base branch first`])
}

const commits = log.split('\x1e').map(record => record.trim()).filter(Boolean)
for (const record of commits) {
  const [hash, subject, ...bodyParts] = record.split('\x1f')
  const short = hash.slice(0, 7)
  checkSubject(short, subject)
  const body = bodyParts.join('\x1f')
  if (body.trim().length === 0) continue
  if (!isAscii(body)) problems.push(`${short}: the body is not English ASCII`)
  if (/\bWIP\b/i.test(body)) problems.push(`${short}: remove the WIP marker before opening the pull request`)
  for (const line of body.split('\n')) {
    if (line.length > MAX_BODY_LINE) {
      problems.push(`${short}: body line is ${line.length} characters, the limit is ${MAX_BODY_LINE}`)
      break
    }
  }
}

const title = process.env.PR_TITLE?.trim()
if (title !== undefined && title !== '') checkSubject('pull request title', title)

if (problems.length > 0) fail(problems)
const suffix = title === undefined || title === '' ? '' : ' + the pull request title'
console.log(`commit messages ok: ${commits.length} commit(s) in ${range}${suffix}`)
