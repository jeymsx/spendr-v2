// Runs browser checks one after another and adds them up.
//
//   node dev/qa/run.mjs                    every check below except csp and website
//   node dev/qa/run.mjs wishlist notes     just these
//
// Needs the stand-in and a dev server pointed at it: see README.md. The
// stand-in is emptied before each check, so one check's synced rows never
// meet the next one's first-sync question.
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const STANDIN = process.env.STANDIN_URL ?? 'http://localhost:54321'
/* Not checks, or checks with a setup of their own: csp needs a production
   build, website needs the site's dev server. Name them to run them. */
const NOT_BY_DEFAULT = new Set(['harness', 'seed', 'run', 'csp', 'website'])

const all = readdirSync(HERE).filter(f => f.endsWith('.mjs')).map(f => f.replace(/\.mjs$/, ''))
const picked = process.argv.slice(2)
const names = picked.length ? picked : all.filter(n => !NOT_BY_DEFAULT.has(n))
const unknown = names.filter(n => !all.includes(n))
if (unknown.length) { console.error(`No such check: ${unknown.join(', ')}`); process.exit(2) }

/** @type {Array<{name: string, passed: number, total: number, code: number|null, ms: number}>} */
const rows = []
for (const name of names) {
  await fetch(`${STANDIN}/__reset`, { method: 'POST' }).catch(() => {})
  console.log(`\n── ${name} ──`)
  const started = Date.now()
  const child = spawn(process.execPath, [join(HERE, `${name}.mjs`)], { env: process.env })
  // Counted from the PASS and FAIL lines, which every check prints, rather
  // than from the summaries, which not all of them do.
  let passed = 0, total = 0
  const read = (/** @type {Buffer} */ chunk) => {
    const text = chunk.toString()
    process.stdout.write(text)
    for (const m of text.matchAll(/^(PASS|FAIL)\b/gm)) { total++; if (m[1] === 'PASS') passed++ }
  }
  child.stdout.on('data', read)
  child.stderr.on('data', read)
  const killer = setTimeout(() => child.kill(), 10 * 60 * 1000)
  const code = await new Promise(r => child.on('close', r))
  clearTimeout(killer)
  rows.push({ name, passed, total, code, ms: Date.now() - started })
}

console.log('\n── Summary ──')
const good = (/** @type {typeof rows[number]} */ r) => r.code === 0 && r.total > 0 && r.passed === r.total
for (const r of rows) {
  const ok = good(r)
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(26)} ${String(r.passed).padStart(3)}/${String(r.total).padEnd(4)} ${Math.round(r.ms / 1000)}s`)
}
process.exitCode = rows.every(good) ? 0 : 1
