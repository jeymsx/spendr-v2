// Two devices, one account: does every account balance end where the ledger says it should?
import { session, APP } from './harness.mjs'
const API = 'http://localhost:54321'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rows = async (t) => (await fetch(`${API}/__rows?table=${t}`)).json()
await fetch(`${API}/__reset`)

const A = await session({ port: 9995 })   // the phone
const B = await session({ port: 9996 })   // the laptop
const all = []
const check = (name, ok, detail = '') => { A.check(name, ok, detail); all.push(ok) }
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean)
const wants = (k) => !ONLY.length || ONLY.includes(k)

const fake = (dev) => JSON.stringify({ access_token: 'tok' + dev, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh' + dev, user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: { full_name: 'Test User' }, created_at: '2026-01-01T00:00:00Z' } })
const signIn = (s, mode, dev) => s.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(fake(dev))}); localStorage.setItem('spendr-view-mode', '${mode}'); localStorage.setItem('spendr-theme', 'light'); localStorage.setItem('spendr-sidebar', 'open')`)

const ACCT = 'Cash'
const bal = (s) => s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); return (await db.accounts.where('name').equals(${JSON.stringify(ACCT)}).first())?.balance })()`)
// What the ledger on that device says the balance should be: its opening plus every row's move.
const cloudBal = async () => (await rows('accounts')).find(r => r.name === ACCT)?.balance
const addExp = (s, amount, desc) => s.evaluate(`(async () => {
  const { default: db } = await import('/src/db/db.js')
  const { applyBalanceEffect } = await import('/src/db/balances.js')
  const tx = { txId: crypto.randomUUID(), type: 'expense', amount: ${amount}, description: ${JSON.stringify(desc)}, category: 'Food', account: ${JSON.stringify(ACCT)}, date: new Date().toISOString(), synced: 0, updatedAt: new Date().toISOString() }
  await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => { await db.transactions.add(tx); await applyBalanceEffect(tx) })
  return tx.txId
})()`)
const del = (s, txId) => s.evaluate(`(async () => {
  const { default: db } = await import('/src/db/db.js')
  const { moveToTrash } = await import('/src/db/trash.js')
  const tx = await db.transactions.where('txId').equals(${JSON.stringify(txId)}).first()
  if (!tx) return 'missing'
  const r = await moveToTrash([tx])
  return r?.id ?? null
})()`)
const restore = (s, id) => s.evaluate(`(async () => { const { restoreFromTrash } = await import('/src/db/trash.js'); return restoreFromTrash(${id}) })()`)
const has = (s, txId) => s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); return !!(await db.transactions.where('txId').equals(${JSON.stringify(txId)}).first()) })()`)

const txIds = (s) => s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); return (await db.transactions.toArray()).map(t => t.txId).filter(Boolean).sort().join(',') })()`)
const cloudTxIds = async () => (await rows('transactions')).map(r => r.tx_id).filter(Boolean).sort().join(',')
// The cloud's balance is only the last sender's view of it now, so it is not held to the ledger unless asked.
const CLOUD = !process.env.SKIP_CLOUD_BALANCE

let expected = 0
async function settle(label, ms = 6000) {
  await sleep(ms)
  const [a, b, c] = [await bal(A), await bal(B), await cloudBal()]
  check(`${label}: phone, laptop${CLOUD ? ' and cloud' : ''} all at ${expected}`, a === expected && b === expected && (!CLOUD || c === expected), `phone ${a}, laptop ${b}, cloud ${c}`)
  const [ta, tb, tc] = [await txIds(A), await txIds(B), await cloudTxIds()]
  check(`${label}: the same transactions on the phone, the laptop and the cloud`, ta === tb && tb === tc, `${ta.split(',').length} / ${tb.split(',').length} / ${tc.split(',').length}`)
  // Carry on from the truth, so one failure does not fail every scenario after it.
  if (a !== expected || b !== expected || c !== expected) {
    await A.evaluate(`(async () => {
      const { default: db } = await import('/src/db/db.js')
      const b = await import('/src/db/balances.js')
      if (b.setOpeningBalance) return b.setOpeningBalance(${JSON.stringify(ACCT)}, ${expected})
      const a = await db.accounts.where('name').equals(${JSON.stringify(ACCT)}).first(); await db.accounts.update(a.id, { balance: ${expected} })
    })()`)
    await sleep(4000)
    const [a2, b2, c2] = [await bal(A), await bal(B), await cloudBal()]
    if (!(a2 === expected && b2 === expected && c2 === expected)) console.log('  (reset to truth did not take:', a2, b2, c2, ')')
  }
}

try {
  await A.send('Page.navigate', { url: APP + '/dev/local/seed-sample-data.html' })
  await A.until(`document.getElementById('status').textContent.startsWith('Sample data loaded')`, 90000)
  await signIn(A, 'phone', 'A')
  await A.goto(APP + '/', 3000)
  await A.until(`document.querySelector('h1')`, 30000)
  await sleep(6000)

  await B.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await B.send('Page.navigate', { url: APP + '/src/db/db.js' })
  await sleep(1500)
  await signIn(B, 'desktop', 'B')
  await B.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); await db.meta.put({ key: 'onboarded', value: true }) })()`)
  await B.goto(APP + '/', 3000)
  await B.until(`[...document.querySelectorAll('button')].some(b => /Use my account's data/.test(b.textContent))`, 30000)
  await B.evaluate(`[...document.querySelectorAll('button')].find(b => /Use my account's data/.test(b.textContent)).click()`)
  await sleep(6000)
  await B.evaluate(`[...document.querySelectorAll('button')].find(b => /Back to Home/.test(b.textContent))?.click()`)
  await A.evaluate(`[...document.querySelectorAll('button')].find(b => /Back to Home/.test(b.textContent))?.click()`)
  await sleep(5000)
  expected = await bal(A)
  check('to begin with, both devices and the cloud agree', expected === await bal(B) && expected === await cloudBal(), `phone ${expected}, laptop ${await bal(B)}, cloud ${await cloudBal()}`)

  if (wants('s1')) {
    const id = await addExp(A, 100, 's1 test')
    expected -= 100
    await settle('S1 an expense added on the phone')
    await del(A, id)
    expected += 100
    await settle('S1 then deleted on the phone')
  }

  if (wants('s2')) {
    const id = await addExp(A, 110, 's2 test')
    expected -= 110
    await settle('S2 an expense added on the phone')
    await del(B, id)
    expected += 110
    await settle('S2 then deleted on the laptop')
  }

  if (wants('s3')) {
    const x = await addExp(A, 120, 's3 one')
    const y = await addExp(A, 130, 's3 two')
    expected -= 250
    await settle('S3 two expenses added on the phone')
    await del(A, x)
    await sleep(800)
    await del(A, y)
    expected += 250
    await settle('S3 both deleted on the phone, 0.8 s apart')
  }

  if (wants('s4')) {
    const id = await addExp(A, 140, 's4 test')
    await sleep(600)
    await del(A, id)
    await settle('S4 added and deleted on the phone 0.6 s apart')
  }

  if (wants('s5')) {
    const id = await addExp(A, 150, 's5 test')
    expected -= 150
    await settle('S5 an expense added on the phone')
    const trashId = await del(A, id)
    await sleep(1000)
    await restore(A, trashId)
    await settle('S5 deleted, then Undo a second later')
    check('S5 the row is back on both', await has(A, id) && await has(B, id))
  }

  if (wants('s6')) {
    await Promise.all([addExp(A, 160, 's6 phone'), addExp(B, 50, 's6 laptop')])
    expected -= 210
    await settle('S6 one expense on each device at the same moment')
  }

  if (wants('s7')) {
    const id = await addExp(A, 170, 's7 test')
    expected -= 170
    await settle('S7 an expense added on the phone')
    // The laptop comes to the front: a full sync, every table, which takes a while.
    await B.evaluate(`window.dispatchEvent(new Event('focus'))`)
    await sleep(250)
    await del(A, id)
    expected += 170
    await settle('S7 deleted on the phone while the laptop was mid-sync')
  }

  if (wants('s8')) {
    await B.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await sleep(500)
    await addExp(B, 30, 's8 laptop offline')
    await addExp(A, 70, 's8 phone')
    await sleep(3000)
    await B.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await B.evaluate(`window.dispatchEvent(new Event('online'))`)
    expected -= 100
    await settle('S8 laptop offline adds one, phone adds one, laptop comes back', 8000)
  }

  for (const [n, s] of [['phone', A], ['laptop', B]]) {
    const errs = s.consoleLog.filter(l => ['error', 'exception'].includes(l.type) && !/favicon|Failed to load resource|ERR_|net::/.test(l.text))
    check(`nothing logged as an error on the ${n}`, errs.length === 0, JSON.stringify(errs.slice(0, 3)))
  }
} catch (e) {
  console.log('SCRIPT ERROR', e.message)
} finally {
  console.log(`\n${all.filter(Boolean).length}/${all.length} passed`)
  await A.close(); await B.close()
}
