#!/usr/bin/env node
/**
 * Run the four AST checkers over src/**.
 *
 * These exist because `vite build` succeeding proves nothing about whether the
 * app runs: esbuild transforms each module in isolation, so an identifier that
 * is never bound is legal JS until it executes. Real crashes that shipped past
 * a green build include three `showToast` ReferenceErrors, a `<Backdrop>` used
 * but never defined, and an `<OverdrawWarningSheet>` reading state from a
 * sibling component.
 *
 * importcheck is the mirror image: it catches what a green `npm run check` and
 * a clean eslint BOTH miss, because an import statement binds its identifiers
 * and every scope-based analysis therefore sees a valid binding. Only reading
 * the target module's real exports finds it. This session alone they caught an undefined `<SegTabs>`,
 * fourteen unbound identifiers in a form, two parse failures from a mangled
 * import, and a `tplCat` that never existed.
 *
 *   npm run check
 *
 * Collecting the file list here rather than in the npm script is deliberate:
 * `$(...)` command substitution does not work in cmd.exe, and a shell glob
 * would blow the command-line length limit on Windows once src grew.
 */
import { readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CHECKERS = ['scopecheck.mjs', 'tdzcheck.mjs', 'hookcheck.mjs', 'importcheck.mjs']

function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collect(full, out)
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(full)
  }
  return out
}

const files = collect(join(ROOT, 'src'))
let failed = 0

for (const checker of CHECKERS) {
  const r = spawnSync(process.execPath, [join(HERE, checker), ...files], {
    encoding: 'utf8',
    // Not `inherit`: the verdict line has to be parsed, and one checker
    // prints a leading blank line - a `tail` of its output once hid a real
    // failure from me, so the summary is built here instead.
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  const bad = /problem\(s\)/.test(out) || r.status !== 0
  const name = checker.replace('.mjs', '')
  if (bad) {
    failed++
    const verdict = out.split('\n').find(l => /problem\(s\)/.test(l)) ?? `exit ${r.status}`
    console.log(`FAIL  ${name.padEnd(11)} ${verdict.trim()}`)
    for (const line of out.split('\n')) {
      if (/^(UNBOUND|TDZ|HOOK|IMPORT|PARSE)/.test(line)) console.log(`        ${line}`)
    }
  } else {
    const verdict = out.split('\n').find(l => l.startsWith('OK')) ?? 'ok'
    console.log(`ok    ${name.padEnd(11)} ${verdict.trim()}`)
  }
}

console.log(`\n${files.length} files checked`)
process.exit(failed ? 1 : 0)
