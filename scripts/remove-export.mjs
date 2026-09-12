/**
 * Delete a top-level export, and the comment block that documents it.
 *
 *   node scripts/remove-export.mjs <file> <Name> [<Name> …]
 *
 * The companion to deadcheck.mjs. Text surgery is the wrong tool here - the
 * declarations vary from a one-line `export const X = …` to a 60-line
 * component with braces and template literals in it - so the span comes from
 * Babel, which knows exactly where each node starts and ends.
 *
 * The leading comment goes with it. A doc block explaining a function nobody
 * calls is worse than no comment: it reads as documentation of a live API.
 */
import { parse } from '@babel/parser'
import { readFileSync, writeFileSync } from 'node:fs'

const [file, ...names] = process.argv.slice(2)
if (!file || !names.length) {
  console.error('usage: remove-export.mjs <file> <Name> [<Name> …]')
  process.exit(1)
}

const raw = readFileSync(file, 'utf8')
const bom = raw.charCodeAt(0) === 0xfeff
const code = bom ? raw.slice(1) : raw
const ast = parse(code, {
  sourceType: 'module',
  plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport'],
})

const wanted = new Set(names)
const cuts = []
const found = []

for (const node of ast.program.body) {
  if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue
  const d = node.declaration

  let name = null
  if (d.type === 'VariableDeclaration') {
    if (d.declarations.length === 1 && d.declarations[0].id.type === 'Identifier') {
      name = d.declarations[0].id.name
    }
  } else if (d.id) {
    name = d.id.name
  }
  if (!name || !wanted.has(name)) continue

  // Start at the first attached leading comment rather than the `export`, so
  // the doc block goes too. Comments Babel attributes to the PREVIOUS node are
  // left alone - it only takes what is unambiguously this declaration's.
  let start = node.start
  const lead = node.leadingComments
  if (lead && lead.length) {
    const first = lead[0]
    // Only if nothing but whitespace sits between the comment and the export;
    // otherwise it belongs to whatever came before.
    if (/^\s*$/.test(code.slice(lead[lead.length - 1].end, node.start))) start = first.start
  }

  // Swallow the blank line the declaration leaves behind.
  let end = node.end
  while (code[end] === '\r' || code[end] === '\n') end++

  cuts.push([start, end])
  found.push(name)
}

const missing = [...wanted].filter(n => !found.includes(n))
if (missing.length) {
  console.error(`  ! not found as a top-level export: ${missing.join(', ')}`)
  process.exit(1)
}

let out = code
for (const [start, end] of cuts.sort((a, b) => b[0] - a[0])) {
  out = out.slice(0, start) + out.slice(end)
}
out = out.replace(/(\r?\n){3,}/g, (m, nl) => nl + nl)

writeFileSync(file, (bom ? '﻿' : '') + out, 'utf8')
console.log(`${file}: removed ${found.join(', ')}`)
