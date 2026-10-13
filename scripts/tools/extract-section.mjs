/**
 * Move a run of top-level declarations out of a page and into its own module.
 *
 *   node scripts/extract-section.mjs <source> <dest> "<start marker>" "<end marker>" <Name,Name,…>
 *
 * ── Why a script and not fifteen hand edits ──
 *
 * Settings.jsx was 3,522 lines and Accounts.jsx 2,547, and the only safe way to
 * split either is a PURE MOVE - the same characters, in a different file. Done
 * by hand across a dozen sections that is a dozen chances to drop a line, and
 * the diff is too large to eyeball.
 *
 * So the block is copied verbatim between two `// ── ` banners, `export` is
 * prefixed onto the named declarations, and the source is left with a hole. It
 * deliberately does NOT try to work out the new file's imports: scopecheck.mjs
 * already lists every unbound identifier, which is a better answer than
 * anything this could guess, and it is checked rather than assumed.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [source, dest, startMark, endMark, names = ''] = process.argv.slice(2)
if (!source || !dest || !startMark || !endMark) {
  console.error(process.argv[1] + ': <source> <dest> "<start>" "<end>" [Names,…]')
  process.exit(1)
}

const raw = readFileSync(source, 'utf8')
const bom = raw.charCodeAt(0) === 0xfeff
const lines = (bom ? raw.slice(1) : raw).split('\n')

const start = lines.findIndex(l => l.startsWith(startMark))
const end = endMark === 'EOF' ? lines.length : lines.findIndex(l => l.startsWith(endMark))
if (start < 0) { console.error(`start marker not found: ${startMark}`); process.exit(1) }
if (end < 0 || end <= start) { console.error(`end marker not found after start: ${endMark}`); process.exit(1) }

let block = lines.slice(start, end).join('\n').replace(/\s+$/, '')

for (const name of names.split(',').map(s => s.trim()).filter(Boolean)) {
  const before = block
  block = block
    .replace(new RegExp(`^(const ${name}\\b)`, 'm'), 'export $1')
    .replace(new RegExp(`^(function ${name}\\b)`, 'm'), 'export $1')
  if (block === before && !new RegExp(`^export (const|function) ${name}\\b`, 'm').test(block)) {
    console.error(`  ! ${name} not found as a top-level declaration`)
  }
}

writeFileSync(dest, block + '\n', 'utf8')
writeFileSync(source, (bom ? '﻿' : '') + lines.slice(0, start).concat(lines.slice(end)).join('\n'), 'utf8')

console.log(`${dest}  <-  ${block.split('\n').length} lines`)
console.log(`${source}  now ${lines.length - (end - start)} lines`)
