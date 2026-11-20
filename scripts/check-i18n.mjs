/**
 * Localization and identity checks for the shipped browser half.
 *
 * Fails when a visible string bypasses `t()`, when the eight dictionaries drift
 * apart, when a dictionary value is empty, or when an old plugin name survives
 * in a shipped file. Warnings (dead keys) do not fail the run.
 *
 * Run: node scripts/check-i18n.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientDir = join(root, 'src', 'client')
const localesDir = join(clientDir, 'locales')
const LOCALES = ['en', 'ru', 'zh', 'ja', 'es', 'fr', 'de', 'pt']
const BASE = 'en'

const problems = []
const warnings = []
const fail = message => problems.push(message)
const warn = message => warnings.push(message)

/** Every file below one directory. */
function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else if (/\.(js|mjs)$/.test(entry.name)) files.push(path)
  }
  return files
}

/** Strip comments so commented examples never count as visible strings. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/* --- dictionaries ------------------------------------------------------ */

const dictionaries = {}
for (const locale of LOCALES) {
  const source = readFileSync(join(localesDir, `${locale}.js`), 'utf8')
  const match = /const [A-Z]{2} = \{([\s\S]*?)\n    \}/.exec(source)
  if (match === null) {
    fail(`${locale}.js: dictionary object not found`)
    continue
  }
  const entries = []
  const body = match[1]
  const pattern = /^\s{6}([a-zA-Z0-9_]+):\s*'([^']*)',$/gm
  let entry = pattern.exec(body)
  while (entry !== null) {
    entries.push([entry[1], entry[2]])
    entry = pattern.exec(body)
  }
  if (entries.length === 0) fail(`${locale}.js: no keys parsed`)
  dictionaries[locale] = entries
}

const baseKeys = (dictionaries[BASE] ?? []).map(([key]) => key)
for (const locale of LOCALES) {
  const entries = dictionaries[locale]
  if (entries === undefined) continue
  const keys = entries.map(([key]) => key)
  if (keys.join(',') !== baseKeys.join(',')) {
    const missing = baseKeys.filter(key => !keys.includes(key))
    const extra = keys.filter(key => !baseKeys.includes(key))
    if (missing.length > 0) fail(`${locale}.js: missing keys: ${missing.join(', ')}`)
    if (extra.length > 0) fail(`${locale}.js: unknown keys: ${extra.join(', ')}`)
    if (missing.length === 0 && extra.length === 0) fail(`${locale}.js: key order differs from ${BASE}.js`)
  }
  for (const [key, value] of entries) {
    if (value.trim() === '') fail(`${locale}.js: "${key}" is empty`)
    if (locale !== 'ru' && /[\u0400-\u04FF]/.test(value)) {
      fail(`${locale}.js: "${key}" contains Cyrillic outside the ru dictionary`)
    }
    if (locale !== 'zh' && locale !== 'ja' && /[\u4e00-\u9fff\u3040-\u30ff]/.test(value)) {
      fail(`${locale}.js: "${key}" contains CJK outside zh/ja`)
    }
  }
}

/* --- t() usage --------------------------------------------------------- */

const usedKeys = new Set()
const sourceFiles = walk(clientDir).filter(file => !file.includes(`${join('client', 'locales')}`))
for (const file of sourceFiles) {
  const source = stripComments(readFileSync(file, 'utf8'))
  const relativePath = relative(root, file)
  const call = /\bt\(\s*'([a-zA-Z0-9_]+)'\s*\)/g
  let hit = call.exec(source)
  while (hit !== null) {
    usedKeys.add(hit[1])
    if (!baseKeys.includes(hit[1])) fail(`${relativePath}: t('${hit[1]}') is not in the dictionaries`)
    hit = call.exec(source)
  }
  const dynamic = /\bt\(\s*'(col|agent[A-Za-z]*)'\s*\+/g
  if (dynamic.test(source)) {
    /* Dynamic prefix keys are checked by the smoke test, not here. */
  }

  /* Visible literals: children of an element, or an accessible label. */
  /* Glue literals (separators, dashes, counters) carry no words to translate. */
  const hasWords = text => /\p{L}/u.test(text)

  const child = /h\(\s*'[a-z]+'\s*,\s*\{[^{}]*\}\s*,\s*'([^']{2,})'/g
  let literal = child.exec(source)
  while (literal !== null) {
    if (hasWords(literal[1])) fail(`${relativePath}: hardcoded element text "${literal[1]}"`)
    literal = child.exec(source)
  }
  const attribute = /(?:title|'aria-label'|label):\s*'([^']{2,})'/g
  let attr = attribute.exec(source)
  while (attr !== null) {
    if (hasWords(attr[1]) && !/^(tk-|dsh-)/.test(attr[1])) fail(`${relativePath}: hardcoded label "${attr[1]}"`)
    attr = attribute.exec(source)
  }
}

for (const key of baseKeys) {
  if (!usedKeys.has(key) && !['tasksOne', 'tasksFew', 'tasksMany', 'agentsOne', 'agentsFew', 'agentsMany'].includes(key)) {
    warn(`dictionary key "${key}" is never used directly (check dynamic lookups)`)
  }
}

/* --- identity ---------------------------------------------------------- */

const LEGACY = [/dsh-team-kanban/, /\bteam-kanban\b/, /dsh\.team\.kanban/]
const shipped = [
  'index.js', 'client.js', 'cordis.patch.yml', 'package.json', 'icon.svg',
  'README.md', 'README.zh.md', 'README.ru.md', 'CHANGELOG.md', 'LICENSE',
  ...walk(join(root, 'src')).map(file => relative(root, file)),
  ...readdirSync(join(root, 'locale')).map(name => join('locale', name)),
  ...walk(join(root, 'docs')).map(file => relative(root, file)),
]
for (const file of shipped) {
  let text
  try {
    text = readFileSync(join(root, file), 'utf8')
  } catch {
    continue
  }
  for (const pattern of LEGACY) {
    if (pattern.test(text)) fail(`${file}: still mentions the old name (${pattern})`)
  }
}

/* --- plugin metadata --------------------------------------------------- */

for (const locale of LOCALES) {
  const metaSource = readFileSync(join(root, 'locale', `${locale}.json`), 'utf8')
  let meta
  try {
    meta = JSON.parse(metaSource).meta
  } catch (error) {
    fail(`locale/${locale}.json: invalid JSON (${error.message})`)
    continue
  }
  for (const field of ['title', 'description', 'detail']) {
    if (typeof meta?.[field] !== 'string' || meta[field].trim() === '') {
      fail(`locale/${locale}.json: meta.${field} is missing`)
    }
  }
  try {
    statSync(join(root, meta.detail))
  } catch {
    fail(`locale/${locale}.json: meta.detail points nowhere (${meta.detail})`)
  }
}

/* --- report ------------------------------------------------------------ */

if (warnings.length > 0) {
  console.log(`warnings (${warnings.length}):`)
  for (const message of warnings) console.log('  ! ' + message)
}
if (problems.length > 0) {
  console.error(`failed (${problems.length}):`)
  for (const message of problems) console.error('  - ' + message)
  process.exit(1)
}
console.log(`i18n ok: ${baseKeys.length} keys × ${LOCALES.length} locales, ${usedKeys.size} used, ${shipped.length} files scanned`)
