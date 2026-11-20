#!/usr/bin/env node
/**
 * Release helper for dsh-agent-team-viewer.
 *
 *   npm run release                         dry run: checks, pack preview, no changes
 *   npm run release:publish                 publish the current version, commit and tag
 *   npm run release:publish -- --bump patch bump first, then publish
 *
 * It never pushes. `npm publish` triggers `prepublishOnly` → `npm run check`, and the
 * release itself runs the same checks once more before publishing.
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = process.cwd()
const READMES = ['README.md', 'README.ru.md', 'README.zh.md']
const args = process.argv.slice(2)

const fail = message => {
  console.error(`release: ${message}`)
  process.exit(1)
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: npm run release [-- --bump patch|minor|major] [--publish]

  no flags        verify the checkout and print a pack preview (no changes)
  --publish       publish the current version, then commit and tag
  --bump <kind>   bump package.json and the README version badges first;
                  requires --publish and an existing CHANGELOG section

The script never pushes; it prints the push command at the end.`)
  process.exit(0)
}

const flagValue = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const publish = args.includes('--publish')
const bump = flagValue('--bump')
if (args.includes('--bump') && bump === undefined) fail('--bump needs patch, minor or major')
if (bump !== undefined && !['patch', 'minor', 'major'].includes(bump)) fail(`unknown bump "${bump}"`)
if (bump !== undefined && !publish) fail('--bump is only allowed together with --publish')

const git = (...gitArgs) => execFileSync('git', gitArgs, {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()
const gitStatus = () => git('status', '--porcelain')
const npm = (npmArgs, stdio = 'inherit') => {
  const result = spawnSync('npm', npmArgs, {
    cwd: ROOT,
    stdio,
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) fail(`npm ${npmArgs.join(' ')} failed`)
  return result
}
const npmCapture = npmArgs => execSync(`npm ${npmArgs.join(' ')}`, {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
  shell: process.platform === 'win32',
}).trim()
const readPackage = () => JSON.parse(readFileSync('package.json', 'utf8'))
const tag = version => `v${version}`

if (gitStatus().length > 0 && publish) {
  fail('the working tree is dirty; commit or stash before publishing')
}
if (publish && git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') {
  fail('publish from the main branch')
}
if (gitStatus().length > 0) {
  console.warn('release: warning: the working tree is dirty; a dry run does not publish')
}

let version = readPackage().version
if (bump !== undefined) {
  npm(['version', bump, '--no-git-tag-version'])
  version = readPackage().version
  for (const file of READMES) {
    const source = readFileSync(file, 'utf8')
    const next = source.replace(/version-\d+\.\d+\.\d+-/g, `version-${version}-`)
    if (next === source) console.warn(`release: warning: no version badge found in ${file}`)
    else writeFileSync(file, next, 'utf8')
  }
  if (!readFileSync('CHANGELOG.md', 'utf8').includes(`## [${version}]`)) {
    fail(`CHANGELOG.md has no "## [${version}]" section; add it and rerun`)
  }
}

console.log(`release: version ${version} (${tag(version)})`)
npm(['run', 'check'])

if (!publish) {
  console.log('release: dry run complete; nothing was published or committed')
  console.log(`release: run "npm run release:publish"${bump === undefined ? '' : ` -- --bump ${bump}`} to publish`)
  process.exit(0)
}

try {
  const who = npmCapture(['whoami'])
  console.log(`release: npm user ${who}`)
} catch {
  fail('npm is not authenticated; run "npm login" first')
}

npm(['publish'])

git('add', 'package.json', ...READMES, 'CHANGELOG.md')
const staged = git('diff', '--cached', '--name-only')
if (staged.length > 0) {
  git('commit', '-m', `chore: release ${tag(version)}`)
  console.log(`release: committed ${tag(version)}`)
} else {
  console.warn('release: no release files changed; commit skipped')
}

try {
  git('rev-parse', '--verify', '--quiet', `refs/tags/${tag(version)}`)
  console.warn(`release: tag ${tag(version)} already exists; tag skipped`)
} catch {
  git('tag', '-a', tag(version), '-m', tag(version))
  console.log(`release: created tag ${tag(version)}`)
}

console.log(`release: published ${readPackage().name}@${version}`)
console.log('release: push when ready: git push origin main --follow-tags')
