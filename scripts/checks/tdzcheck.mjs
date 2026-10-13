/**
 * Finds `let`/`const`/`class` read before it is declared, in the same
 * synchronous scope — a temporal dead zone error.
 *
 * The existing scope check looks for identifiers with no binding at all. This
 * is the neighbouring failure: the binding EXISTS, so that check passes and
 * `vite build` passes, and the component throws "Cannot access 'x' before
 * initialization" the moment it renders. That shipped once already, from
 * inserting a derived value a few lines above the value it derives from.
 *
 * The subtlety is closures. A function body may freely reference a const
 * declared after it, because the body runs later:
 *
 *     const f = () => total      // fine
 *     const total = 1
 *
 * So a reference only counts when no function boundary separates it from the
 * declaration. Walking up from the reference to the binding's scope and
 * bailing at the first function scope is what encodes that.
 */
import { readFileSync } from 'node:fs'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'

const traverse = _traverse.default ?? _traverse

const files = process.argv.slice(2)
let problems = 0

for (const file of files) {
  let ast
  try {
    ast = parse(readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
      errorRecovery: true,
    })
  } catch (err) {
    console.log(`${file}: parse failed - ${err.message}`)
    problems++
    continue
  }

  traverse(ast, {
    ReferencedIdentifier(path) {
      const binding = path.scope.getBinding(path.node.name)
      if (!binding) return                                   // the other check's job
      if (!['let', 'const', 'class'].includes(binding.kind)) return

      const decl = binding.identifier
      if (decl === path.node) return
      if (typeof decl.start !== 'number' || typeof path.node.start !== 'number') return
      if (decl.start <= path.node.start) return              // declared first: fine

      // Is a function boundary crossed between the reference and the scope
      // that owns the binding? If so the reference is inside a closure and
      // will not run until after the declaration is evaluated.
      let scope = path.scope
      let deferred = false
      while (scope && scope !== binding.scope) {
        if (scope.path.isFunction() || scope.path.isClassMethod() || scope.path.isObjectMethod()) {
          deferred = true
          break
        }
        scope = scope.parent
      }
      if (deferred) return

      const line = path.node.loc?.start.line ?? '?'
      const declLine = decl.loc?.start.line ?? '?'
      console.log(
        `${file}:${line}  reads '${path.node.name}' but it is ${binding.kind}-declared at line ${declLine}`
      )
      problems++
    },
  })
}

console.log(
  problems
    ? `\n${problems} temporal-dead-zone problem(s) across ${files.length} files`
    : `OK - no use-before-declaration across ${files.length} files`
)
process.exit(problems ? 1 : 0)
