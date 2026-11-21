#!/usr/bin/env node
/**
 * Set the release version without publishing anything.
 *
 *   npm run set-version -- 0.1.1
 *
 * Updates `package.json` and the `version-x.y.z-` badge in the three READMEs —
 * the same two edits the release script makes on a bump. It never commits,
 * tags or publishes: the release commit on the version branch carries the
 * result, and publishing stays a separate, explicit step.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const READMES = ['README.md', 'README.ru.md', 'README.zh.md']
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const version = process.argv[2]
if (version === undefined || !SEMVER.test(version)) {
  console.error('usage: npm run set-version -- <x.y.z>')
  process.exit(1)
}

const packagePath = join(ROOT, 'package.json')
const manifest = readFileSync(packagePath, 'utf8')
const stamped = manifest.replace(/"version": "[^"]+"/, `"version": "${version}"`)
if (stamped === manifest) {
  console.error('set-version: package.json has no version field')
  process.exit(1)
}
writeFileSync(packagePath, stamped, 'utf8')

for (const name of READMES) {
  const path = join(ROOT, name)
  const source = readFileSync(path, 'utf8')
  const next = source.replace(/version-\d+\.\d+\.\d+-/g, `version-${version}-`)
  if (next === source) {
    console.warn(`set-version: no version badge found in ${name}`)
    continue
  }
  writeFileSync(path, next, 'utf8')
}

console.log(`set-version: ${version}; include it in the release commit (no tag, no publish)`)
