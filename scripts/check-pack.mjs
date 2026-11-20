#!/usr/bin/env node
/**
 * Assert the published npm tarball is runtime-only.
 *
 * `files` is the allowlist, but a broad glob or a new top-level directory can quietly
 * pull development material back in. This check runs `npm pack --dry-run` and fails
 * on a missing runtime file, a leaked `src/`, `scripts/`, `dev/` or dev-doc path,
 * a BOM, or a private absolute path.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const LOCALES = ['en', 'ru', 'zh', 'ja', 'es', 'fr', 'de', 'pt']

const REQUIRED = [
  'package.json',
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'README.md',
  'README.ru.md',
  'README.zh.md',
  'CHANGELOG.md',
  'LICENSE',
  'screenshots.json',
  'icon.svg',
  'assets/icon-180.png',
  'docs/DETAIL.md',
  'docs/DETAIL.ru.md',
  'docs/DETAIL.zh.md',
  'docs/INSTALL.md',
  'docs/preview.svg',
  ...LOCALES.map(locale => `locale/${locale}.json`),
]

const FORBIDDEN = [
  'src/',
  'scripts/',
  'dev/',
  'docs/dev/',
  'docs/DEVELOPMENT.md',
  'docs/RELEASING.md',
]

let files
try {
  const output = execSync('npm pack --dry-run --json', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  files = JSON.parse(output)[0].files.map(file => file.path)
} catch (error) {
  console.error('pack check failed: `npm pack --dry-run --json` did not complete')
  if (error.stderr) console.error(String(error.stderr).trim())
  process.exit(1)
}

const problems = []
for (const file of REQUIRED) {
  if (!files.includes(file)) problems.push(`missing runtime file: ${file}`)
}
for (const file of files) {
  if (FORBIDDEN.some(prefix => file === prefix || file.startsWith(prefix))) {
    problems.push(`development path leaked into the tarball: ${file}`)
  }
  if (file.startsWith('docs/screenshots/')) {
    problems.push(`screenshots must stay out of the tarball: ${file}`)
  }
}
for (const file of files) {
  if (!/\.(md|json|yml|yaml|js|mjs|svg|txt)$/i.test(file)) continue
  const bytes = readFileSync(join(root, file))
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    problems.push(`UTF-8 BOM in a published text file: ${file}`)
  }
  if (/C:\\Users|H:\\Workspace|\/Users\/|AppData/i.test(bytes.toString('utf8'))) {
    problems.push(`private absolute path in a published text file: ${file}`)
  }
}

// The marketplace reads screenshots.json from the repository, but it is also
// part of the package. Keep it canonical (array, max eight) and verify paths.
try {
  const doc = JSON.parse(readFileSync('screenshots.json', 'utf8'))
  const list = Array.isArray(doc) ? doc : doc?.screenshots
  if (!Array.isArray(list) || list.length === 0) {
    problems.push('screenshots.json must be a non-empty array or {"screenshots": [...]}')
  } else {
    if (list.length > 8) problems.push(`screenshots.json declares ${list.length} images; the market cap is 8`)
    for (const shot of list) {
      if (typeof shot !== 'string' || shot.trim() === '') {
        problems.push('screenshots.json entries must be non-empty strings')
      } else if (!/^https?:/i.test(shot) && !existsSync(join(root, shot))) {
        problems.push(`missing screenshot: ${shot}`)
      }
    }
  }
} catch {
  problems.push('screenshots.json is not valid JSON')
}

if (problems.length > 0) {
  console.error(`pack check failed (${problems.length}):`)
  for (const problem of problems) console.error(` - ${problem}`)
  process.exit(1)
}

console.log(`pack ok: ${files.length} files, runtime only; dev docs and scripts excluded`)
