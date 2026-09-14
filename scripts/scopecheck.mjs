/**
 * Reports identifiers that are read but never bound in any enclosing scope.
 *
 * vite build does not catch these: esbuild transforms each module in isolation
 * and an unresolved identifier is legal JS until it runs. Three showToast
 * ReferenceErrors in this codebase shipped past a green build.
 */
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import { readFileSync } from 'node:fs'


const traverse = _traverse.default ?? _traverse

const GLOBALS = new Set([
  'window', 'document', 'navigator', 'location', 'history', 'localStorage',
  'sessionStorage', 'indexedDB', 'console', 'fetch', 'URL', 'URLSearchParams',
  'Blob', 'File', 'FileReader', 'FormData', 'Image', 'Audio', 'Intl', 'Math',
  'JSON', 'Date', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Set',
  'Map', 'WeakMap', 'WeakSet', 'Symbol', 'Promise', 'Error', 'TypeError',
  'RangeError', 'RegExp', 'Function', 'Proxy', 'Reflect', 'BigInt',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'requestIdleCallback', 'structuredClone', 'crypto', 'performance',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'atob', 'btoa',
  'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'Event', 'AbortController',
  'matchMedia', 'getComputedStyle', 'alert', 'confirm', 'prompt',
  'globalThis', 'undefined', 'NaN', 'Infinity', 'process', 'import',
  'HTMLElement', 'Node', 'Text', 'DOMParser', 'XMLHttpRequest', 'WebSocket',
  'Worker', 'caches', 'Notification', 'ClipboardItem', 'DataTransfer',
  'Uint8Array', 'Int8Array', 'Float32Array', 'Float64Array', 'ArrayBuffer',
  'TextEncoder', 'TextDecoder', 'AggregateError', 'FinalizationRegistry',
  'screen', 'frames', 'top', 'self', 'parent', 'name', 'status', 'open',
  'close', 'focus', 'blur', 'scroll', 'scrollTo', 'scrollBy', 'print',
])

/**
 * Real globals that are almost never what a component meant to call.
 *
 * `close()` shipped as a bug: every sheet used to keep a local close() helper
 * that ran an exit animation before telling its parent, and when Sheet took
 * that job over the helpers were deleted. One file kept the CALLS. Nothing
 * complained, because window.close IS defined - and on a page a script did
 * not open it is a silent no-op, so the sheet simply stayed put with its
 * button reading "Saving..." for ever.
 *
 * That is the whole class: an identifier that reads as a local, resolves to a
 * window method, and does nothing. Only flagged when CALLED - `open` as a
 * prop name or a variable is everywhere and fine - and `window.close()`
 * spelled out is left alone, since that one is deliberate.
 */
const SUSPECT_CALLS = new Set(['close', 'open', 'print', 'stop', 'focus', 'blur'])

const files = process.argv.slice(2)
let problems = 0

for (const file of files) {
  const code = readFileSync(file, 'utf8')
  let ast
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport'],
    })
  } catch (e) {
    console.log(`PARSE FAIL ${file}: ${e.message}`)
    problems++
    continue
  }

  traverse(ast, {
    ReferencedIdentifier(path) {
      const name = path.node.name

      /* A bare call to one of these, with nothing local by that name. See
         SUSPECT_CALLS - this is the one bug class the globals list hides. */
      if (SUSPECT_CALLS.has(name)
        && path.parent.type === 'CallExpression'
        && path.parent.callee === path.node
        && !path.scope.hasBinding(name, true)) {
        const line = path.node.loc?.start.line
        console.log(`SUSPECT  ${file}:${line}  ${name}() resolves to window.${name}`)
        problems++
        return
      }

      if (GLOBALS.has(name)) return
      // JSX element names that start uppercase are components; lowercase ones
      // are HTML tags and are not identifier references at all.
      if (path.parent.type === 'JSXOpeningElement' || path.parent.type === 'JSXClosingElement') {
        if (!/^[A-Z]/.test(name)) return
      }
      if (path.scope.hasBinding(name, true)) return
      if (path.scope.hasGlobal?.(name) && GLOBALS.has(name)) return
      const line = path.node.loc?.start.line
      console.log(`UNBOUND  ${file}:${line}  ${name}`)
      problems++
    },
  })
}

console.log(problems === 0
  ? `\nOK - no unbound identifiers across ${files.length} files`
  : `\n${problems} problem(s)`)
process.exit(problems === 0 ? 0 : 1)
