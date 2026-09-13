#!/usr/bin/env node
/**
 * Run the type checker and the five AST checkers over src/**.
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
 * the target module's real exports finds it.
 *
 * designcheck is the odd one out - it is about design drift rather than
 * crashes, and it ran as `npm run design` on its own while 18 real problems
 * remained, because a check that fails on a clean tree gets switched off. They
 * are fixed, so it gates now. This session alone they caught an undefined `<SegTabs>`,
 * fourteen unbound identifiers in a form, two parse failures from a mangled
 * import, and a `tplCat` that never existed.
 *
 * typecheck is `tsc --noEmit` over the logic layer - lib, utils, db, hooks -
 * reading the JSDoc on those modules and the record shapes in src/types.d.ts.
 * Nothing is emitted and no file is transformed, so it can only ever fail a
 * build, never change one. It runs FIRST because it is the cheapest way to
 * find the largest class of mistake, and because a type error usually
 * explains whatever the other five are about to complain about.
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
const CHECKERS = ['scopecheck.mjs', 'tdzcheck.mjs', 'hookcheck.mjs', 'importcheck.mjs',
                  'designcheck.mjs', 'copycheck.mjs']

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

const LF = String.fromCharCode(10)
const TS_ERROR = /error TS[0-9]+/

/* tsc first, and on its own: it takes a config rather than a file list, and
   its output is one line per error rather than the verdict line the loop
   below parses. */
{
  const r = spawnSync('npx', ['tsc'], {
    cwd: ROOT, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const out = ((r.stdout ?? '') + (r.stderr ?? '')).trim()
  const errors = out.split(LF).filter(l => TS_ERROR.test(l))
  if (errors.length) {
    failed++
    console.log(`FAIL  ${'typecheck'.padEnd(11)} ${errors.length} type error(s)`)
    for (const line of errors.slice(0, 25)) console.log(`        TYPE ${line}`)
    if (errors.length > 25) console.log(`        ... and ${errors.length - 25} more`)
  } else {
    console.log(`ok    ${'typecheck'.padEnd(11)} OK - no type errors in the logic layer`)
  }
}

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
      if (/^(UNBOUND|TDZ|HOOK|IMPORT|DESIGN|PARSE|TYPE)/.test(line)) console.log(`        ${line}`)
    }
  } else {
    const verdict = out.split('\n').find(l => l.startsWith('OK')) ?? 'ok'
    console.log(`ok    ${name.padEnd(11)} ${verdict.trim()}`)
  }
}

console.log(`\n${files.length} files checked`)
process.exit(failed ? 1 : 0)
