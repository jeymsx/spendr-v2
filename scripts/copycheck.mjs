/**
 * Reports an em dash in anything the user will read.
 *
 * ── Why a checker and not a note in a style guide ──
 *
 * The em dash is a fine mark and this app is not the place for it. Used as
 * punctuation it reads like an essay rather than an interface - "Your data is
 * safe — it's stored on this device" is a sentence explaining itself, where
 * "Your data is safe. It's stored on this device" simply says the thing. At
 * 11px in a hint under a field, the long rule also just looks like damage.
 *
 * Forty-four of them had accumulated across 25 files before anyone counted,
 * and roughly half arrived in a single copy pass. That is the shape of a rule
 * that needs a ratchet rather than good intentions: nothing stands between a
 * new line of copy and the forty-fifth except whether someone remembers.
 *
 * The fixes are always ordinary punctuation. A full stop where the dash was
 * joining two sentences, a comma where it was adding a clause, a colon where
 * it was introducing a list, "·" where it was separating two labels, or
 * brackets where it was wrapping an aside.
 *
 * ── What it reads, and what it deliberately does not ──
 *
 * COPY ONLY: JSX text, string literals and template chunks. Comments are
 * exempt, and that is not laziness - a comment is written for whoever is
 * reading the source, where a dash costs nothing and the alternative is
 * churning several hundred lines of prose that no user will ever see.
 *
 * A string that is NOTHING but an em dash is also exempt. That is the app's
 * "no value" glyph, the thing a table cell holds when a row has no amount,
 * and it is typography rather than writing. Twenty-two of the ninety-six
 * found on the first sweep were that, and a rule that cannot tell them apart
 * gets switched off within a week.
 *
 * ── Escape hatch ──
 *
 * `copy-ok: <reason>` in a comment on the line or in the eight above it, the
 * same convention designcheck.mjs uses.
 *
 *   node scripts/copycheck.mjs
 *   node scripts/copycheck.mjs src/pages/Foo.jsx
 */
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const traverse = _traverse.default ?? _traverse

const EM = '—'

/**
 * The character, and every way of writing it that is not the character.
 *
 * This rule shipped without the entities and was immediately wrong: the copy
 * it was written to guard contained `&mdash;`, the checker read the source
 * string as the eight literal characters `& m d a s h ;`, found no em dash,
 * and passed a page that renders one. An entity is invisible to a rule that
 * only knows the glyph, which makes it the exact thing somebody reaches for
 * when a checker complains.
 *
 * So all four spellings count, and the message names the entity when that is
 * what was found - otherwise the report points at a line where the dash is
 * nowhere to be seen.
 */
const FORMS = [
  { find: EM,          label: 'em dash' },
  { find: '&mdash;',   label: '&mdash;' },
  { find: '&#8212;',   label: '&#8212;' },
  { find: '&#x2014;',  label: '&#x2014;' },
]

/* Tests name themselves after the thing they test, and a couple quote a
   heading that has one in it. Nobody reads a test title but us. */
const EXEMPT_PATH = /\.test\.jsx?$/

function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collect(full, out)
    else if (/\.jsx?$/.test(name)) out.push(full)
  }
  return out
}

const HERE = dirname(fileURLToPath(import.meta.url))
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : collect(join(HERE, '..', 'src'))

const norm = (p) => p.replace(/\\/g, '/')
let problems = 0

for (const file of files) {
  if (EXEMPT_PATH.test(file) || !/\.jsx?$/.test(file)) continue

  const src = readFileSync(file, 'utf8')
  if (!FORMS.some(f => src.includes(f.find))) continue
  const lines = src.split('\n')

  let ast
  try {
    ast = parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    })
  } catch (e) {
    problems++
    console.log(`PARSE  ${norm(file)}  ${e.message}`)
    continue
  }

  const waived = (line) => {
    for (let i = line - 1; i >= 0 && i > line - 9; i--) {
      if (/copy-ok:/.test(lines[i] ?? '')) return true
    }
    return false
  }

  const report = (node, text) => {
    const found = FORMS.find(f => text.includes(f.find))
    if (!found) return
    /* The "no value" glyph, not a sentence. Every form is stripped, so an
       entity-only cell is exempt on the same terms as a character-only one. */
    let bare = text
    for (const f of FORMS) bare = bare.split(f.find).join('')
    if (!bare.trim()) return
    const line = node.loc?.start.line ?? 0
    if (waived(line)) return
    problems++
    const shown = text.replace(/\s+/g, ' ').trim().slice(0, 90)
    console.log(`COPY   ${norm(file)}:${line}  ${found.label} in copy - use a full stop, comma, colon or "·"\n         ${shown}`)
  }

  traverse(ast, {
    JSXText(path)         { report(path.node, path.node.value) },
    StringLiteral(path)   { report(path.node, path.node.value) },
    TemplateElement(path) { report(path.node, path.node.value.cooked ?? '') },
  })
}

if (problems) {
  console.log(`\n${problems} problem(s) across ${files.length} files`)
  process.exit(1)
} else {
  console.log(`OK - no em dashes in user-facing copy, across ${files.length} files`)
}
