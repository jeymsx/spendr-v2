import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The flag set, into public/ where Vite serves it as-is.
 *
 * ── Why these are files and not imports ──
 *
 * There are 180 currencies in the rate table and a flag for 172 of them.
 * Importing those as modules puts about 600KB of SVG in the bundle for a list
 * most people open once, and the "all currencies" sheet is the only screen
 * that shows more than a handful.
 *
 * As files in public/ they cost the bundle nothing, they are same-origin so
 * the service worker can cache them, and the browser asks for exactly the
 * ones it draws.
 *
 * ── Why they are copied rather than committed ──
 *
 * They are a dependency's output. Committing 250 SVGs would mean a repo that
 * disagrees with package.json the first time the package updates, and a diff
 * nobody can review. public/flags is gitignored and rebuilt by predev and
 * prebuild, so the copy is always the version in node_modules.
 *
 * ── 1x1, not 3x2 ──
 *
 * They are drawn in a circle. A 3:2 flag cropped to a circle loses a third of
 * its width off each side, which is where Singapore keeps its crescent and
 * the US, Australia, Taiwan and Malaysia keep their cantons - the part that
 * identifies them. The 1x1 set is redrawn square.
 */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const from = join(root, 'node_modules', 'country-flag-icons', '1x1')
const to = join(root, 'public', 'flags')

if (!existsSync(from)) {
  // Not fatal: a fresh clone runs this before install in some orders, and a
  // missing flag is a grey disc with the currency mark in it, not a crash.
  console.warn('[flags] country-flag-icons not installed yet, skipping')
  process.exit(0)
}

await rm(to, { recursive: true, force: true })
await mkdir(to, { recursive: true })
await cp(from, to, { recursive: true })

const n = (await readdir(to)).filter(f => f.endsWith('.svg')).length
console.log(`[flags] ${n} flags -> public/flags`)
