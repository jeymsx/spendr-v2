/**
 * Remove imports a file no longer uses.
 *
 *   node scripts/prune-imports.mjs <file>
 *
 * The companion to extract-section.mjs: moving a feature out of a 3,000-line
 * page leaves behind a dozen imports only that feature used, and eslint's
 * no-unused-vars finds every one of them. This reads that report and deletes
 * exactly what it names.
 *
 * ── Rebuilt, not cut ──
 *
 * The first version removed each dead specifier's own text plus its trailing
 * comma. That is right for one specifier and wrong for several: taking the
 * last three of
 *
 *     import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
 *
 * left `import { useState, useMemo, from 'react'`, because every cut took the
 * comma AFTER it and nothing removed the one now dangling at the end.
 *
 * So each declaration is rebuilt from the specifiers that survive. There is no
 * arithmetic to get wrong, and the shape is preserved: a declaration written
 * across several lines stays that way, at the indentation it already had.
 *
 * It edits only import declarations, and only bindings eslint has already
 * called unused, so it cannot remove anything that is referenced.
 */
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const traverse = _traverse.default ?? _traverse
const file = process.argv[2]
if (!file) { console.error('usage: prune-imports.mjs <file>'); process.exit(1) }

const eslint = spawnSync('npx', ['eslint', '--format', 'json', file], {
  encoding: 'utf8', shell: true,
})
let report
try {
  report = JSON.parse(eslint.stdout.slice(eslint.stdout.indexOf('[')))
} catch {
  console.error('could not read eslint output')
  process.exit(1)
}

const unused = new Set(
  (report[0]?.messages ?? [])
    .filter(m => m.ruleId === 'no-unused-vars')
    .map(m => /'([^']+)' is defined but never used/.exec(m.message)?.[1])
    .filter(Boolean),
)
if (!unused.size) { console.log(`${file}: nothing to prune`); process.exit(0) }

const raw = readFileSync(file, 'utf8')
const bom = raw.charCodeAt(0) === 0xfeff
const code = bom ? raw.slice(1) : raw
const ast = parse(code, {
  sourceType: 'module',
  plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport'],
})

const LF = String.fromCharCode(10)
const CR = String.fromCharCode(13)

/** [start, end, replacement], applied back to front so offsets stay valid. */
const edits = []
const removed = []

traverse(ast, {
  ImportDeclaration(path) {
    const specs = path.node.specifiers
    const dead = specs.filter(s => unused.has(s.local.name))
    if (!dead.length) return
    dead.forEach(s => removed.push(s.local.name))

    // Nothing left: take the whole statement and the newline it sits on.
    if (dead.length === specs.length) {
      let end = path.node.end
      if (code[end] === CR) end++
      if (code[end] === LF) end++
      edits.push([path.node.start, end, ''])
      return
    }

    const live = specs.filter(s => !unused.has(s.local.name))
    const dflt = live.find(s => s.type === 'ImportDefaultSpecifier')
    const ns = live.find(s => s.type === 'ImportNamespaceSpecifier')
    const named = live.filter(s => s.type === 'ImportSpecifier')

    const label = s => (s.imported && s.imported.name !== s.local.name)
      ? `${s.imported.name} as ${s.local.name}`
      : s.local.name

    const source = code.slice(path.node.start, path.node.end)
    const multiline = source.includes(LF)
    const indent = (source.match(new RegExp(LF + '(\\s*)')) || [, '  '])[1]

    const parts = []
    if (dflt) parts.push(dflt.local.name)
    if (ns) parts.push(`* as ${ns.local.name}`)
    if (named.length) {
      parts.push(multiline
        ? '{' + LF + indent + named.map(label).join(',' + LF + indent) + ',' + LF + '}'
        : `{ ${named.map(label).join(', ')} }`)
    }

    const quote = code[path.node.source.start]
    edits.push([path.node.start, path.node.end,
      `import ${parts.join(', ')} from ${quote}${path.node.source.value}${quote}`])
  },
})

let out = code
for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) {
  out = out.slice(0, start) + text + out.slice(end)
}
// Removing whole statements leaves runs of blank lines behind.
out = out.replace(new RegExp(`(${CR}?${LF}){3,}`, 'g'), (m, nl) => nl + nl)

writeFileSync(file, (bom ? '﻿' : '') + out, 'utf8')
console.log(`${file}: removed ${removed.length} - ${removed.join(', ')}`)
