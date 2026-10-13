// Two devices, one account, live: the phone's first sync fills the cloud, both
// listen on every table, and an expense saved on the phone reaches the laptop
// within seconds, with a toast and the figures rolling up.
import { session, APP } from './harness.mjs'
const API = 'http://localhost:54321'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const DELAY = Number(process.env.DB_EVENT_DELAY_MS ?? 0)
const num = (s) => Number(String(s).replace(/[^\d.]/g, ''))
const peso = (n) => '₱' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const state = async () => (await fetch(`${API}/__state`)).json()
const logLen = async () => (await (await fetch(`${API}/__log`)).json()).filter(l => !l.path.startsWith('/__')).length
const rows = async (t) => (await fetch(`${API}/__rows?table=${t}`)).json()
await fetch(`${API}/__reset`)

const A = await session({ port: 9993 })   // the phone
const B = await session({ port: 9994 })   // the laptop
const all = []
const check = (name, ok, detail = '') => { A.check(name, ok, detail); all.push(ok) }

const fake = (dev) => JSON.stringify({ access_token: 'tok' + dev, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh' + dev, user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: { full_name: 'Test User' }, created_at: '2026-01-01T00:00:00Z' } })
const signIn = (s, mode, dev) => s.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(fake(dev))}); localStorage.setItem('spendr-view-mode', '${mode}'); localStorage.setItem('spendr-theme', 'light'); localStorage.setItem('spendr-sidebar', 'open')`)
const addTx = (s, desc, amount) => s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); await db.transactions.add({ txId: 'live-' + Math.random().toString(36).slice(2), type: 'expense', amount: ${amount}, description: ${JSON.stringify(desc)}, category: 'Food', account: 'Cash', date: new Date().toISOString(), synced: 0, updatedAt: new Date().toISOString() }); return true })()`)
const statValue = (label) => `(() => { const l = [...document.querySelectorAll('.d-stat-label')].find(e => /^${label}/.test(e.textContent.trim())); return l ? l.closest('.d-panel').querySelector('.d-stat-value').textContent.trim() : null })()`
const watchStat = (s, label, ms) => s.evaluate(`new Promise(res => { const seen = []; const t0 = performance.now(); const tick = () => { const v = ${statValue(label)}; if (v && seen[seen.length - 1] !== v) seen.push(v); if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick); else res(seen) }; tick() })`)

try {
  // ── The phone: sample data, signed in, first sync up ──
  await A.send('Page.navigate', { url: APP + '/dev/local/seed-sample-data.html' })
  await A.until(`document.getElementById('status').textContent.startsWith('Sample data loaded')`, 90000)
  await signIn(A, 'phone', 'A')
  await A.goto(APP + '/', 3000)
  await A.until(`document.querySelector('h1')`, 30000)
  let st = await state()
  for (let i = 0; i < 60 && !(st.tables.transactions > 20 && st.tables.accounts >= 4 && st.tables.user_preferences >= 1 && st.subs >= 15); i++) { await sleep(500); st = await state() }
  check('the phone\'s first sync put its ledger in the cloud', st.tables.transactions > 20 && st.tables.accounts >= 4, JSON.stringify(st.tables))
  check('the phone is listening: one socket, a channel for each of the 15 tables', st.sockets === 1 && st.subs === 15, `${st.sockets} sockets, ${st.subs} subscriptions`)

  // ── The laptop: signed in to the same account, a fresh device ──
  await B.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await B.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await B.send('Page.navigate', { url: APP + '/src/db/db.js' })
  await sleep(1500)
  await signIn(B, 'desktop', 'B')
  await B.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); await db.meta.put({ key: 'onboarded', value: true }) })()`)
  await B.goto(APP + '/', 3000)
  await B.until(`[...document.querySelectorAll('button')].some(b => /Use my account's data/.test(b.textContent))`, 30000)
  check('a fresh laptop is asked, as it should be, before it takes the account', true)
  await B.evaluate(`[...document.querySelectorAll('button')].find(b => /Use my account's data/.test(b.textContent)).click()`)
  await B.until(`[...document.querySelectorAll('.d-stat-label')].some(e => /^Spent in/.test(e.textContent.trim()))`, 60000)
  await sleep(2500)
  st = await state()
  check('the laptop is listening too', st.sockets === 2 && st.subs === 30, `${st.sockets} sockets, ${st.subs} subscriptions`)
  check('both are joined to the private channel for direct messages', process.env.REJECT_PRIVATE ? st.shareJoined === 0 : st.shareJoined === 2, String(st.shareJoined))
  const laptopBefore = await B.evaluate(statValue('Spent in'))
  check('the laptop shows the phone\'s month', /^₱[\d,]+\.\d\d$/.test(laptopBefore ?? ''), laptopBefore)

  // ── The phone adds a transaction ──
  // Out of the achievement overlay first, and let what that starts settle: it mounts the app proper, which syncs.
  await B.evaluate(`[...document.querySelectorAll('button')].find(b => /Back to Home/.test(b.textContent))?.click()`)
  await sleep(5000)
  const quietAt = await logLen()
  const watching = watchStat(B, 'Spent in', 9000)
  const t0 = Date.now()
  await addTx(A, 'Coffee from the phone', 777)
  let toast = null
  for (let i = 0; i < 60 && !toast; i++) { toast = await B.evaluate(`(document.querySelector('[data-sonner-toaster]')?.innerText ?? '').split(String.fromCharCode(10)).find(l => l.includes('other device')) ?? null`); if (!toast) await sleep(200) }
  const took = Date.now() - t0
  check('the laptop says so: a toast naming the transaction', /^From your other device: Coffee from the phone, ₱777\.00$/.test(toast ?? ''), `${toast} (${took} ms)`)
  check('within a few seconds of the phone saving it', took < (DELAY ? DELAY - 500 : 2500), `${took} ms`)
  await B.shot('live-laptop-toast.png')
  const seen = await watching
  check('and the laptop\'s Spent figure rolled up by it', seen.length >= 5 && seen[0] === laptopBefore && seen.at(-1) === peso(num(laptopBefore) + 777), `${seen[0]} ... ${seen.at(-1)} (${seen.length} values)`)
  const phoneToasts = await A.evaluate(`[...document.querySelectorAll('[role="status"]')].map(e => e.textContent.trim()).filter(t => /other device/.test(t))`)
  check('the phone does not announce its own transaction', phoneToasts.length === 0, JSON.stringify(phoneToasts))
  const cloud = (await rows('transactions')).filter(r => r.description === 'Coffee from the phone')
  check('it reached the cloud once', cloud.length === 1, String(cloud.length))
  await sleep(DELAY + 1500)
  const onLaptop = await B.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); return (await db.transactions.toArray()).filter(t => t.description === 'Coffee from the phone').map(t => ({ txId: t.txId, synced: t.synced })) })()`)
  check('the laptop holds it once, after the database announces it too', onLaptop.length === 1, JSON.stringify(onLaptop))
  const onPhone = await A.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); return (await db.transactions.toArray()).filter(t => t.description === 'Coffee from the phone').length })()`)
  check('and the phone holds it once, after hearing its own echo', onPhone === 1, String(onPhone))

  // What each device asked of the cloud, second by second, after the phone saved.
  const full = await (await fetch(`${API}/__log`)).json()
  const mine = full.filter(l => l.t >= t0 && l.path.startsWith('/rest/v1/'))
  const by = {}
  for (const l of mine) { const sec = Math.floor((l.t - t0) / 1000); const k = `${l.dev}@${sec}s`; by[k] = by[k] ?? { GET: 0, POST: 0, other: 0 }; by[k][l.method === 'GET' || l.method === 'POST' ? l.method : 'other']++ }
  console.log('TIMELINE', JSON.stringify(by))
  const paths = {}
  for (const l of mine) { const k = `${l.dev} ${l.method} ${l.path.replace('/rest/v1/', '')}`; paths[k] = (paths[k] ?? 0) + 1 }
  console.log('PATHS', JSON.stringify(paths))
  const lc = (s) => s.consoleLog.filter(l => /\[trace\]/.test(l.text)).map(l => l.text.slice(0, 170))
  console.log('T0', t0 % 100000)
  const rel = (s2) => s2.consoleLog.filter(l => /\[dbg\]/.test(l.text)).map(l => l.text.replace('[dbg] ', '').replace(/\d{13}/, m => String(Number(m) - t0))).filter(x => !/^(creating)/.test(x))
  console.log('DBG-B', JSON.stringify(rel(B).slice(-8)))
  console.log('DBG-A', JSON.stringify(rel(A).slice(-4)))
  const fmt = (s) => { const out = []; let last = ''; let n = 0; for (const l of lc(s)) { const m = /(\d+)$/.exec(l); const rel = m ? Number(m[1]) - (t0 % 100000) : null; if (rel === null || rel < -3000) continue; const k = l.replace(/ ?\d+$/, '').replace('[trace] ', '').replace(/ (true|false)$/, ''); if (k === last) { n++; continue } if (n) out.push('  x' + (n + 1)); n = 0; last = k; out.push(rel + 'ms ' + k) } if (n) out.push('  x' + (n + 1)); return out.join(' | ') }
  console.log('A TRACE', fmt(A))
  console.log('B TRACE', fmt(B))
  console.log('B LOG', JSON.stringify(B.consoleLog.filter(l => /warn|error/.test(l.type)).map(l => l.text.slice(0, 200)).slice(0, 8)))
  console.log('A LOG', JSON.stringify(A.consoleLog.filter(l => /warn|error/.test(l.type)).map(l => l.text.slice(0, 200)).slice(0, 8)))

  // ── Nothing keeps going back and forth ──
  {
    const probe = (s) => s.evaluate(`(async () => {
      const { default: db } = await import('/src/db/db.js')
      const out = {}
      for (const name of ['accounts','categories','debts','recurring','templates','goals','badges','challenges','note_folders','notes','trash']) {
        const rows = await db.table(name).toArray()
        const bad = rows.filter(r => !r.syncedAt || (r.updatedAt != null && r.updatedAt !== r.syncedAt))
        if (bad.length) out[name] = bad.slice(0, 3).map(r => ({ id: r.id ?? r.key, u: r.updatedAt, s: r.syncedAt, synced: r.synced }))
      }
      return JSON.stringify(out)
    })()`)
    await sleep(2000)
    console.log('UNSENT-A', await probe(A))
    console.log('UNSENT-B', await probe(B))
    const lg = await (await fetch(`${API}/__log`)).json()
    const tail = lg.slice(-60).filter(l => !l.path.startsWith('/__')).map(l => `${l.dev} ${l.method} ${l.path.replace('/rest/v1/','')}`)
    const c = {}; for (const k of tail) c[k] = (c[k] ?? 0) + 1
    console.log('LAST60', JSON.stringify(c))
  }
  await sleep(2500)
  const afterSettle = await logLen()
  await sleep(6000)
  const later = await logLen()
  { const lg = await (await fetch(`${API}/__log`)).json(); console.log('QUIET-WINDOW', JSON.stringify(lg.slice(afterSettle).map(l => `${l.dev} ${l.method} ${l.path}`))) }
  check('then everything goes quiet - no pull answered by a push answered by a pull', later === afterSettle, `${later - afterSettle} requests in 6 s, ${afterSettle - quietAt} in the exchange`)

  // ── The laptop changes something else: a budget ──
  const t1 = Date.now()
  await B.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); const c = await db.categories.where('name').equals('Food').first(); await db.categories.update(c.id, { budget: 9999 }) })()`)
  let got = null
  for (let i = 0; i < 40 && got !== 9999; i++) { got = await A.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); return (await db.categories.where('name').equals('Food').first())?.budget })()`); if (got !== 9999) await sleep(250) }
  check('a budget changed on the laptop arrives on the phone', got === 9999, `${got} after ${Date.now() - t1} ms`)
  const quietToasts = await A.evaluate(`[...document.querySelectorAll('[role="status"]')].map(e => e.textContent.trim()).filter(t => /other device/.test(t))`)
  check('without a toast: only new transactions are announced', quietToasts.length === 0, JSON.stringify(quietToasts))

  // ── Settings says so ──
  await A.goto(APP + '/settings/sync', 3000)
  await A.until(`/Sync is on/.test(document.body.innerText)`, 20000)
  const line = await A.evaluate(`document.body.innerText.match(/Changes arrive as they happen|Live updates are off[^\\n]*|Connecting for live updates/)?.[0] ?? null`)
  check('Cloud sync says changes arrive as they happen', line === 'Changes arrive as they happen', String(line))
  await A.shot('live-phone-sync.png')

  for (const [n, s] of [['phone', A], ['laptop', B]]) {
    const errs = s.consoleLog.filter(l => ['error', 'exception'].includes(l.type) && !/favicon|Failed to load resource|ERR_|net::/.test(l.text))
    check(`nothing logged as an error on the ${n}`, errs.length === 0, JSON.stringify(errs.slice(0, 3)))
  }
} catch (e) {
  console.log('SCRIPT ERROR', e.message)
  await A.shot('live-error-a.png').catch(() => {})
  await B.shot('live-error-b.png').catch(() => {})
} finally {
  console.log(`\n${all.filter(Boolean).length}/${all.length} passed`)
  await A.close(); await B.close()
}
