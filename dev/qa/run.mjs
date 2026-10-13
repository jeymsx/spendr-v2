// Runs browser checks and adds them up.
//
//   node dev/qa/run.mjs                    every check below except csp, website and tap-targets
//   node dev/qa/run.mjs wishlist notes     just these
//   node dev/qa/run.mjs --jobs 3           three at a time
//
// Needs the stand-in and a dev server pointed at it: see README.md.
//
// Two lanes. Checks that sign in share the stand-in, the one fake cloud, so
// they run one at a time and the stand-in is emptied before each: one
// check's synced rows must never meet the next one's first-sync question.
// Checks that stay on the device have nothing to share but the dev server,
// so with --jobs they run side by side, each in its own Chrome.
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const STANDIN = process.env.STANDIN_URL ?? 'http://localhost:54321'
/* Not checks, or not for every run: csp needs a production build, website
   needs the site's dev server, and tap-targets is a list to read rather
   than a pass or a fail. Name them to run them. */
const NOT_BY_DEFAULT = new Set(['harness', 'seed', 'run', 'csp', 'website', 'tap-targets'])

const args = process.argv.slice(2)
const jobsAt = args.indexOf('--jobs')
const JOBS = jobsAt >= 0 ? Math.max(1, Number(args[jobsAt + 1]) || 1) : 1
const picked = args.filter((a, i) => a !== '--jobs' && !(jobsAt >= 0 && i === jobsAt + 1))

const all = readdirSync(HERE).filter(f => f.endsWith('.mjs')).map(f => f.replace(/\.mjs$/, ''))
const names = picked.length ? picked : all.filter(n => !NOT_BY_DEFAULT.has(n))
const unknown = names.filter(n => !all.includes(n))
if (unknown.length) { console.error(`No such check: ${unknown.join(', ')}`); process.exit(2) }

/** A check that signs in syncs to the stand-in. */
const usesCloud = (/** @type {string} */ name) => readFileSync(join(HERE, `${name}.mjs`), 'utf8').includes('sb-localhost-auth-token')

/** @type {Array<{name: string, passed: number, total: number, code: number|null, ms: number}>} */
const rows = []

/** Runs one check, printing its output whole when it ends so side-by-side runs don't interleave. */
async function runOne(/** @type {string} */ name) {
  const started = Date.now()
  const child = spawn(process.execPath, [join(HERE, `${name}.mjs`)], { env: process.env })
  let out = ''
  child.stdout.on('data', c => { out += c })
  child.stderr.on('data', c => { out += c })
  // desktop-sweep alone takes seven minutes, more on a busy machine.
  const killer = setTimeout(() => child.kill(), 15 * 60 * 1000)
  const code = await new Promise(r => child.on('close', r))
  clearTimeout(killer)
  // Counted from the PASS and FAIL lines, which every check prints, rather
  // than from the summaries, which not all of them do. A check that stops
  // early prints SCRIPT ERROR, which counts as a failure too.
  let passed = 0, total = 0
  for (const m of out.matchAll(/^(PASS|FAIL|SCRIPT ERROR)\b/gm)) { total++; if (m[1] === 'PASS') passed++ }
  console.log(`\n── ${name} ──\n${out.trimEnd()}`)
  rows.push({ name, passed, total, code, ms: Date.now() - started })
}

const cloud = names.filter(usesCloud)
const local = names.filter(n => !usesCloud(n))
const runCloud = async () => {
  for (const name of cloud) {
    await fetch(`${STANDIN}/__reset`, { method: 'POST' }).catch(() => {})
    await runOne(name)
  }
}
const queue = [...local]
const runLocal = () => Promise.all(Array.from({ length: JOBS }, async () => {
  while (queue.length) await runOne(/** @type {string} */ (queue.shift()))
}))
// One at a time means one at a time: without --jobs the lanes take turns.
if (JOBS === 1) { await runCloud(); await runLocal() } else await Promise.all([runCloud(), runLocal()])

console.log('\n── Summary ──')
const good = (/** @type {typeof rows[number]} */ r) => r.code === 0 && r.total > 0 && r.passed === r.total
for (const r of [...rows].sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`${good(r) ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(26)} ${String(r.passed).padStart(3)}/${String(r.total).padEnd(4)} ${Math.round(r.ms / 1000)}s`)
}
process.exitCode = rows.every(good) ? 0 : 1
