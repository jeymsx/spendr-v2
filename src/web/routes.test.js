import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Everything on the phone is on the desktop: every address App.jsx routes,
 * WebApp.jsx routes too - to a page, not to the catch-all that sends an
 * unknown address home. The desktop drifted for three weeks without Goals,
 * Budget or the Settings pages, and nothing said so; this says so.
 *
 * Read from the source rather than rendered: a route table is text, and
 * rendering both apps would need every provider and a database to answer a
 * question about strings.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = (/** @type {string} */ p) => readFileSync(join(here, p), 'utf8')

/**
 * Every full path a route table answers, nested routes joined to their
 * parents. `<Route path="/accounts" ...>` then `<Route path=":id" .../>`
 * inside it is /accounts/:id; an index route is its parent's path.
 *
 * @param {string} src
 */
function routesOf(src) {
  const paths = new Set()
  /** @type {(string|null)[]} */
  const stack = []
  let i = 0
  while (i < src.length) {
    const close = src.indexOf('</Route>', i)
    const open = src.indexOf('<Route', i)
    if (open < 0 && close < 0) break
    if (close >= 0 && (open < 0 || close < open)) { stack.pop(); i = close + 8; continue }
    // The tag runs to the first '>' outside any {...}: an element prop
    // holds a whole JSX element, '>' and '/>' included.
    let j = open + 6, depth = 0
    for (; j < src.length; j++) {
      const c = src[j]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    const attrs = src.slice(open + 6, j)
    const selfClosing = src[j - 1] === '/'
    const own = /\spath="([^"]+)"/.exec(attrs)?.[1] ?? null
    const parent = stack.filter(Boolean).at(-1) ?? ''
    const full = own == null ? parent
      : own.startsWith('/') ? own
      : `${parent.replace(/\/$/, '')}/${own}`
    if ((own != null || /\sindex[\s/]/.test(attrs)) && full) paths.add(full)
    if (!selfClosing) stack.push(own == null ? null : full)
    i = j + 1
  }
  return paths
}

describe('the desktop has every phone address', () => {
  const phone = routesOf(read('../App.jsx'))
  const desktop = routesOf(read('./WebApp.jsx'))

  it('reads both tables', () => {
    expect(phone.size).toBeGreaterThan(30)
    expect(desktop.has('/accounts/:id')).toBe(true)
  })

  it.each([...phone].filter(p => p !== '*').map(p => [p]))('routes %s', (path) => {
    expect(desktop.has(path), `WebApp.jsx has no route for ${path}`).toBe(true)
  })
})
