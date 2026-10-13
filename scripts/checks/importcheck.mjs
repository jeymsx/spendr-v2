/**
 * Reports imports of names the target module does not actually export.
 *
 * ── Why the other three checkers cannot see this ──
 *
 * An `import` statement BINDS its identifiers. So every scope-based analysis -
 * eslint's no-undef, and scopecheck.mjs next door - sees a perfectly valid
 * binding and says nothing. Only a tool that opens the target module and reads
 * what it really exports can tell.
 *
 * Rollup does that, which is why `vite build` catches it. Nothing earlier in
 * the chain does, so a wrong import name runs in dev and dies at build time,
 * usually minutes later and often in a file you were not editing.
 *
 * Three of these were written in a single session:
 *
 *   import { IconTransferUI } from './icons'   // never existed
 *   import { IconArrowDown } from './icons'    // a LOCAL fn in two other files
 *   import { Skeleton } from './ui/Skeleton'   // it is the default export
 *
 * ── What it checks ──
 *
 * Relative imports that resolve to a .js/.jsx/.mjs file under src. Package
 * imports are skipped: resolving them means walking node_modules and reading
 * package.json "exports" maps, which is a lot of surface for a class of bug
 * that npm install already catches.
 *
 * `export … from` and `export * from` are followed, so a barrel file reports
 * against what it really re-exports rather than appearing to export nothing.
 *
 * ── Being quiet is the whole job ──
 *
 * A checker that cries wolf gets removed from the gate, so anything it cannot
 * resolve with certainty is skipped rather than guessed at: unresolvable
 * specifiers, non-JS assets, `import * as ns`, and any module that fails to
 * parse. It reports a name only when it has read the target and the name is
 * definitively not there.
 */
import { parse } from '@babel/parser'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, resolve as resolvePath, join } from 'node:path'

const PLUGINS = ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport']
const JS = new Set(['.js', '.jsx', '.mjs'])

function parseFile(file) {
  return parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: PLUGINS })
}

/**
 * Where a relative specifier actually lands, or null.
 *
 * Vite resolves extensionless imports itself, so the source says './icons' and
 * the file is 'icons.jsx'. Directory imports fall back to index, the same
 * order Vite uses.
 */
function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  // './styles.css?inline' and friends - the query is not part of the path, and
  // a non-JS asset has no exports to check anyway.
  const clean = spec.split('?')[0]
  const base = resolvePath(dirname(fromFile), clean)

  const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`,
                      join(base, 'index.js'), join(base, 'index.jsx')]
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile() && JS.has(extname(c))) return c
  }
  return null
}

/**
 * Every name a module exports, following re-exports.
 *
 * `seen` breaks cycles: two modules that re-export from each other is legal
 * and would otherwise recurse forever. Returns null when the module cannot be
 * parsed or a star re-export leaves the set incomplete - null means "do not
 * judge imports against this", which is how the checker stays quiet rather
 * than guessing.
 */
const cache = new Map()

function exportsOf(file, seen = new Set()) {
  if (cache.has(file)) return cache.get(file)
  if (seen.has(file)) return new Set()   // cycle: contributes nothing, not unknown
  seen.add(file)

  let ast
  try { ast = parseFile(file) } catch { cache.set(file, null); return null }

  const names = new Set()
  let complete = true

  for (const node of ast.program.body) {
    switch (node.type) {
      case 'ExportDefaultDeclaration':
        names.add('default')
        break

      case 'ExportNamedDeclaration': {
        // export const x = …  /  export function f() {}  /  export class C {}
        const d = node.declaration
        if (d) {
          if (d.type === 'VariableDeclaration') {
            for (const decl of d.declarations) collectPattern(decl.id, names)
          } else if (d.id) {
            names.add(d.id.name)
          }
        }
        // export { a, b as c }  /  export { x } from './y'
        for (const s of node.specifiers ?? []) {
          names.add(s.exported.name ?? s.exported.value)
        }
        break
      }

      case 'ExportAllDeclaration': {
        // export * from './y' - follow it, or give up honestly.
        const target = resolveSpecifier(file, node.source.value)
        const inner = target ? exportsOf(target, seen) : null
        if (inner) for (const n of inner) names.add(n)
        else complete = false
        break
      }

      default:
        break
    }
  }

  const result = complete ? names : null
  cache.set(file, result)
  return result
}

/** `export const { a, b } = …` and `export const [x] = …` are real exports. */
function collectPattern(id, out) {
  if (!id) return
  if (id.type === 'Identifier') out.add(id.name)
  else if (id.type === 'ObjectPattern') {
    for (const p of id.properties) {
      if (p.type === 'RestElement') collectPattern(p.argument, out)
      else collectPattern(p.value, out)
    }
  } else if (id.type === 'ArrayPattern') {
    for (const el of id.elements) collectPattern(el, out)
  } else if (id.type === 'AssignmentPattern') collectPattern(id.left, out)
  else if (id.type === 'RestElement') collectPattern(id.argument, out)
}

/** A short hint, because "not exported" without the alternatives means going
 *  to look at the file anyway. Case-insensitive first, then anything. */
function suggest(wanted, available) {
  const lower = wanted.toLowerCase()
  const near = [...available].filter(n => n.toLowerCase() === lower
    || n.toLowerCase().includes(lower) || lower.includes(n.toLowerCase()))
  const list = near.length ? near : [...available]
  const shown = list.slice(0, 6).join(', ')
  return list.length > 6 ? `${shown}, …` : (shown || 'nothing')
}

const files = process.argv.slice(2)
let problems = 0

for (const file of files) {
  let ast
  try {
    ast = parseFile(file)
  } catch (e) {
    console.log(`PARSE FAIL ${file}: ${e.message}`)
    problems++
    continue
  }

  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue
    const target = resolveSpecifier(file, node.source.value)
    if (!target) continue                       // package, or a non-JS asset

    const available = exportsOf(target)
    if (!available) continue                    // unparseable, or an opaque star

    for (const s of node.specifiers) {
      // `import * as ns` takes the whole module - nothing to be wrong about.
      if (s.type === 'ImportNamespaceSpecifier') continue

      const wanted = s.type === 'ImportDefaultSpecifier'
        ? 'default'
        : (s.imported.name ?? s.imported.value)

      if (available.has(wanted)) continue

      const line = s.loc?.start.line ?? node.loc?.start.line
      const what = wanted === 'default'
        ? 'has no default export'
        : `does not export '${wanted}'`
      console.log(
        `IMPORT   ${file}:${line}  ${node.source.value} ${what}`
        + `  (exports: ${suggest(wanted, available)})`,
      )
      problems++
    }
  }
}

console.log(problems === 0
  ? `\nOK - every import resolves to a real export across ${files.length} files`
  : `\n${problems} problem(s)`)
process.exit(problems === 0 ? 0 : 1)
