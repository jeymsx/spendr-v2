import { describe, it, expect } from 'vitest'
// @ts-ignore - node:fs in a test; the app never imports it
import { readFileSync } from 'node:fs'
// @ts-ignore
import { createHash } from 'node:crypto'

/**
 * The site's security headers (vercel.json), held to what the app needs.
 *
 * The Content-Security-Policy allows exactly one inline script: the theme
 * script in index.html, which has to run before the first paint. It is allowed
 * by its hash, so the smallest edit to that script - a comment, a space - makes
 * the browser refuse it on the live site, and every launch paints in the wrong
 * theme with nothing but a console line to say why. This catches that before it
 * ships: the hash in the header must be the script's.
 */

const root = new URL('../../', import.meta.url)
const read = (/** @type {string} */ p) => readFileSync(new URL(p, root), 'utf8')
const vercel = JSON.parse(read('vercel.json'))
const headers = Object.fromEntries(vercel.headers[0].headers.map((/** @type {{key: string, value: string}} */ h) => [h.key, h.value]))
const csp = headers['Content-Security-Policy'] ?? ''

describe('the security headers', () => {
  it('allow index.html\'s inline scripts by their exact hashes, and no others', () => {
    const html = read('index.html')
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
    // Browsers hash the script as parsed, with line endings made \n.
    const hashes = inline.map(s => `'sha256-${createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('base64')}'`)
    const allowed = csp.match(/'sha256-[^']+'/g) ?? []
    expect(allowed.sort()).toEqual(hashes.sort())
  })

  it('keep the app out of other sites\' frames, and scripts to this site', () => {
    expect(csp).toMatch(/frame-ancestors 'none'/)
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(csp).toMatch(/script-src 'self'/)
    expect(csp).not.toMatch(/'unsafe-eval'|script-src[^;]*'unsafe-inline'/)
    expect(csp).toMatch(/object-src 'none'/)
  })

  it('let the app reach its cloud, live updates and exchange rates', () => {
    expect(csp).toMatch(/connect-src[^;]*https:\/\/edsxieulenqxrtzuvcdq\.supabase\.co/)
    expect(csp).toMatch(/connect-src[^;]*wss:\/\/edsxieulenqxrtzuvcdq\.supabase\.co/)
    expect(csp).toMatch(/connect-src[^;]*https:\/\/api\.fxratesapi\.com[^;]*https:\/\/open\.er-api\.com/)
  })
})
