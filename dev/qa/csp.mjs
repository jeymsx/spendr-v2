// The production build served with vercel.json's headers and rewrites, then
// walked in headless Chrome: any Content-Security-Policy violation fails it.
//
//   npx vite build && node dev/qa/csp.mjs             signed out
//   (not npm run build while a dev server is up: its prebuild rewrites
//   public/flags, and the dev server's file watcher crashed on that)
//   STANDIN=1 node dev/qa/csp.mjs                      signed in, against the stand-in;
//                                                      build with VITE_SUPABASE_URL=http://localhost:54321
//   DIST=<folder>                                      a build somewhere other than dist/
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { session, sleep, ROOT } from './harness.mjs'

const DIST = process.env.DIST ?? join(ROOT, 'dist')
const PORT = 5230
const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
const headers = cfg.headers[0].headers.map(h => process.env.STANDIN && h.key === 'Content-Security-Policy' ? { ...h, value: h.value.replaceAll('https://edsxieulenqxrtzuvcdq.supabase.co', 'http://localhost:54321').replaceAll('wss://edsxieulenqxrtzuvcdq.supabase.co', 'ws://localhost:54321') } : h)
const rewrite = new RegExp('^' + cfg.rewrites[0].source + '$')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json', '.wasm': 'application/wasm' }

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = join(DIST, path)
  if (!(existsSync(file) && statSync(file).isFile())) {
    if (rewrite.test(path)) file = join(DIST, 'index.html')
    else { res.writeHead(404); return res.end() }
  }
  for (const h of headers) res.setHeader(h.key, h.value)
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
  res.end(readFileSync(file))
}).listen(PORT)

const s = await session()
const violations = []
const logs = []
s.listeners.push(m => {
  if (m.method === 'Log.entryAdded') logs.push(m.params.entry.text)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(m.params.args.map(a => a.value ?? a.description).join(' '))
})
await s.send('Log.enable')
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `
  document.addEventListener('securitypolicyviolation', e => {
    (window.__csp ??= []).push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile ?? '') + ':' + e.lineNumber)
  })` })

const base = `http://127.0.0.1:${PORT}`
const fake = JSON.stringify({ access_token: 'tokA', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refreshA', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: { full_name: 'Test User' }, created_at: '2026-01-01T00:00:00Z' } })
if (process.env.STANDIN) { await s.goto(base + '/', 1500); await s.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(fake)}); localStorage.setItem('spendr-view-mode', '${process.env.MODE ?? 'phone'}')`) }
const routes = ['/', '/settings', '/settings/sync', '/settings/sync/delete', '/transactions', '/insights', '/insights/forecast', '/accounts', '/budget', '/recurring', '/goals', '/debts', '/achievements', '/settings/help', '/settings/backup', '/settings/feedback', '/notes', '/import']
for (const r of routes) {
  await s.goto(base + r, 2500)
  const got = await s.evaluate('window.__csp ?? []')
  for (const v of got) violations.push(`${r}: ${v}`)
  const text = await s.evaluate('document.body.innerText.slice(0, 80).replace(/\\s+/g, " ")')
  console.log(`visited ${r.padEnd(16)} ${text}`)
}
const sw = await s.evaluate('navigator.serviceWorker.getRegistrations().then(r => r.length)')
const hdr = await s.evaluate(`fetch('/').then(r => r.headers.get('content-security-policy') ? 'yes' : 'no')`)
const scripts = await s.evaluate(`[...document.scripts].filter(x => !x.src).length`)

s.check('CSP header is sent', hdr === 'yes')
s.check('service worker registered under worker-src', sw > 0, `${sw} registration(s)`)
s.check('inline scripts present (hashed)', scripts >= 1, `${scripts}`)
s.check('no CSP violations', violations.length === 0, violations.join(' | '))
const cspLogs = logs.filter(t => /Content Security Policy|Refused to/i.test(t))
s.check('no CSP refusals in the console', cspLogs.length === 0, cspLogs.slice(0, 5).join(' | '))
console.log('errors seen:', logs.filter(t => !/Content Security Policy|Refused to/i.test(t)).slice(0, 8))
await s.close()
server.close()
await sleep(200)
process.exit()
