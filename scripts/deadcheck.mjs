/**
 * Reports exported names that nothing imports and the file itself never uses.
 *
 *   node scripts/deadcheck.mjs src/**
 *
 * A report, not a gate. Deleting code is a judgement call - a thing can be
 * unreferenced because it is genuinely dead, or because the feature that used
 * it is half-built, or because it is the documented shape of a module other
 * people extend. This finds the candidates; a person decides.
 *
 * ── What it will not flag ──
 *
 * Default exports of anything under pages/, because routes reach them through
 * `lazy(() => import(…))` and the specifier is a string this cannot follow.
 * Entry points, config and test files, for the same reason.
 *
 * It also counts a symbol as live if its own module references it, so a
 * component exported for testing but used in its own file is not reported.
 */
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, resolve as resolvePath, join, sep } from 'node:path'

const traverse = _traverse.default ?? _traverse
const JS = new Set(['.js', '.jsx', '.mjs'])
const SKIP = /\.test\.|\.spec\.|[\\/](main|index)\.jsx?$/

/* Absolute, because resolveSpecifier below returns absolute paths and the two
   have to be the same key. Keying one map by the relative argv path and the
   other by the resolved one made every export in the codebase look dead - 189
   of them, including useToast and parseMoney, which was the tell. */
const files = process.argv.slice(2)
  .filter(f => JS.has(extname(f)))
  .map(f => resolvePath(f))

function parseFile(file) {
  return parse(readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport'],
  })
}

function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = resolvePath(dirname(fromFile), spec.split('?')[0])
  for (const c of [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`,
                   join(base, 'index.js'), join(base, 'index.jsx')]) {
    if (existsSync(c) && statSync(c).isFile() && JS.has(extname(c))) return c
  }
  return null
}

/** file -> Set of names it exports, with the line each is declared on. */
const exported = new Map()
/** file -> Set of names some other module imports from it. */
const imported = new Map()
/** file -> Set of identifiers referenced anywhere inside it. */
const usedLocally = new Map()

for (const file of files) {
  let ast
  try { ast = parseFile(file) } catch { continue }

  const mine = new Map()
  const locals = new Set()
  exported.set(file, mine)
  usedLocally.set(file, locals)

  for (const node of ast.program.body) {
    if (node.type === 'ExportNamedDeclaration') {
      const d = node.declaration
      if (d) {
        if (d.type === 'VariableDeclaration') {
          for (const decl of d.declarations) {
            if (decl.id.type === 'Identifier') mine.set(decl.id.name, decl.id.loc?.start.line)
          }
        } else if (d.id) mine.set(d.id.name, d.id.loc?.start.line)
      }
      // `export { a, b }` re-exports something declared elsewhere in the file,
      // or forwarded from another module. Either way it is a deliberate
      // surface, so it is not a declaration this can call dead.
    }

    if (node.type === 'ImportDeclaration') {
      const target = resolveSpecifier(file, node.source.value)
      if (!target) continue
      if (!imported.has(target)) imported.set(target, new Set())
      for (const s of node.specifiers) {
        if (s.type === 'ImportNamespaceSpecifier') imported.get(target).add('*')
        else if (s.type === 'ImportDefaultSpecifier') imported.get(target).add('default')
        else imported.get(target).add(s.imported.name ?? s.imported.value)
      }
    }

    // `export { X } from './y'` keeps X alive in y.
    if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) {
      const target = resolveSpecifier(file, node.source.value)
      if (!target) continue
      if (!imported.has(target)) imported.set(target, new Set())
      if (node.type === 'ExportAllDeclaration') imported.get(target).add('*')
      else for (const s of node.specifiers) imported.get(target).add(s.local.name)
    }
  }

  traverse(ast, {
    ReferencedIdentifier(path) { locals.add(path.node.name) },
    // `export { Foo }` at the bottom is a reference for our purposes.
    ExportSpecifier(path) { locals.add(path.node.local.name) },
  })
}

let problems = 0
for (const file of files) {
  if (SKIP.test(file)) continue
  const mine = exported.get(file)
  if (!mine) continue
  const taken = imported.get(file) ?? new Set()
  if (taken.has('*')) continue           // a namespace import takes everything

  for (const [name, line] of mine) {
    if (taken.has(name)) continue
    // Referenced by its own module - a component used in the file that
    // exports it, or a helper the page below calls.
    const locals = usedLocally.get(file)
    if (locals && [...locals].filter(n => n === name).length > 1) continue
    if (locals && locals.has(name) && !mine.has(name)) continue
    // Counted once for the declaration itself; more than that means a real use.
    const uses = (readFileSync(file, 'utf8').match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length
    if (uses > 1) continue

    console.log(`DEAD     ${file}:${line}  ${name} - exported, never imported, never used here`)
    problems++
  }
}

console.log(problems === 0
  ? `\nOK - no unreferenced exports across ${files.length} files`
  : `\n${problems} unreferenced export(s)`)
