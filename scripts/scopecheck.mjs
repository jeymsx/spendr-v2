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
