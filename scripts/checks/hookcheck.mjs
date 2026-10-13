/**
 * Hooks called after an early return.
 *
 * React's rule of hooks: every render must call the same hooks in the same
 * order. A component that returns early - a loading skeleton, a "not found"
 * branch - and then calls a hook below that point runs fewer hooks on the
 * early render than on the full one, and React throws "Rendered more hooks
 * than during the previous render". The page dies at runtime.
 *
 * Neither `vite build` nor an unbound-identifier check can see this: the code
 * is perfectly valid JavaScript. There is no eslint in this project, so this
 * stands in for eslint-plugin-react-hooks' rules-of-hooks, narrowed to the one
 * failure that actually happens when editing a long component - inserting a
 * useMemo next to the constants it reads, which are below the guard clauses.
 *
 *   node hookcheck.mjs src/pages/*.jsx
 */
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
const HOOK = /^use[A-Z]/
const go = traverse.default ?? traverse

let problems = 0

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  let ast
  try {
    ast = parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    })
  } catch (e) {
    console.log(`PARSE FAIL ${file}: ${e.message}`)
    problems++
    continue
  }

  go(ast, {
    // Only look at things that can hold hooks: a component or a custom hook.
    Function(path) {
      const name = fnName(path)
      // A component is PascalCase; a custom hook is useSomething. Anything
      // else cannot legally call a hook anyway, so a violation there is a
      // different (and louder) error.
      if (!name || !(/^[A-Z]/.test(name) || HOOK.test(name))) return

      // The first return that is guarded by a condition. An unconditional
      // return at the end of a component is just the render, not a guard.
      let firstGuardReturn = null
      path.traverse({
        Function(inner) { inner.skip() },   // nested closures have their own scope
        ReturnStatement(ret) {
          if (firstGuardReturn !== null) return
          // Walk up to the component; a return inside an if/switch/&&/?: is a guard.
          let p = ret.parentPath
          while (p && p !== path) {
            if (p.isIfStatement() || p.isSwitchStatement() ||
                p.isConditionalExpression() || p.isLogicalExpression()) {
              firstGuardReturn = ret.node.start
              return
            }
            p = p.parentPath
          }
        },
      })
      if (firstGuardReturn === null) return

      path.traverse({
        Function(inner) { inner.skip() },
        CallExpression(call) {
          const callee = call.node.callee
          const hookName =
            callee.type === 'Identifier' ? callee.name
            : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
              ? callee.property.name
              : null
          if (!hookName || !HOOK.test(hookName)) return
          if (call.node.start <= firstGuardReturn) return

          const line = src.slice(0, call.node.start).split('\n').length
          const guardLine = src.slice(0, firstGuardReturn).split('\n').length
          console.log(
            `${file}:${line}  ${hookName}() runs after the early return on line ${guardLine} ` +
            `(in ${name}) - the hook count changes between renders`,
          )
          problems++
        },
      })
    },
  })
}

function fnName(path) {
  if (path.node.id?.name) return path.node.id.name
  const p = path.parentPath
  if (p?.isVariableDeclarator() && p.node.id.type === 'Identifier') return p.node.id.name
  if (p?.isCallExpression()) {
    // memo(function () {…}) / forwardRef(() => …) - named by the variable above.
    const gp = p.parentPath
    if (gp?.isVariableDeclarator() && gp.node.id.type === 'Identifier') return gp.node.id.name
  }
  return null
}

console.log(problems === 0
  ? `\nOK - no hooks after an early return across ${files.length} files`
  : `\n${problems} rules-of-hooks problem(s)`)
process.exit(problems === 0 ? 0 : 1)
