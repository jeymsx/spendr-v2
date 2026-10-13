// "Change the others too?": file one "QA Jollibee" under Food from its tile,
// take the offer to move the others, then Undo - on the phone and the desktop.
import { session, sleep, APP } from './harness.mjs'

const fake = JSON.stringify({ access_token: 'tokA', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refreshA', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: { full_name: 'Test User' }, created_at: '2026-01-01T00:00:00Z' } })

const seed = (tag) => `(async () => {
  const { default: db } = await import('/src/db/db.js')
  for (const [name, color] of [['Shopping', '#ec4899'], ['Food', '#f97316']]) {
    if (!(await db.categories.where('name').equals(name).first())) await db.categories.add({ name, type: 'expense', icon: '🛍️', color, budget: 0 })
  }
  const acct = (await db.accounts.toArray())[0]?.name ?? 'Cash'
  const at = (m) => new Date(Date.now() - m * 60000).toISOString()
  const rows = [
    { d: 'QA Jollibee ${tag}', c: 'Shopping', m: 1 }, { d: 'qa jollibee ${tag}', c: 'Shopping', m: 30 },
    { d: 'QA  Jollibee ${tag} ', c: 'Shopping', m: 60 }, { d: 'QA Jollibee ${tag}', c: 'Bills', m: 90 },
    { d: 'QA Mang Inasal ${tag}', c: 'Shopping', m: 120 },
  ]
  for (const r of rows) await db.transactions.add({ txId: crypto.randomUUID(), type: 'expense', amount: 99, description: r.d, category: r.c, account: acct, date: at(r.m), synced: 0, updatedAt: at(r.m) })
  return acct
})()`
const cats = (tag) => `(async () => {
  const { default: db } = await import('/src/db/db.js')
  const all = await db.transactions.toArray()
  return all.filter(t => /${tag}/i.test(t.description ?? '')).sort((a, b) => b.date.localeCompare(a.date)).map(t => t.description.trim().split(' ').slice(-2, -1)[0] + ':' + t.category).join(' ')
})()`
const bodyText = (s) => s.evaluate('document.body.innerText')

async function run(mode) {
  const s = await session()
  if (mode === 'desktop') await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  const tag = (mode === 'phone' ? 'P' : 'D') + Date.now().toString(36)
  await s.goto(APP + '/', 1500)
  await s.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(fake)}); localStorage.setItem('spendr-view-mode', '${mode}'); localStorage.setItem('spendr-theme', 'light')`)
  await s.goto(APP + '/', 4000)
  await s.evaluate(seed(tag))
  await s.goto(APP + '/transactions', 3500)
  // The phone opens on Home with What's New over it: put that away and go by the tab bar.
  if (await s.clickText('Got it')) await sleep(800)
  if (mode === 'phone') {
    const went = await s.evaluate(`(() => { const a = document.querySelector('a[href="/transactions"]'); a?.click(); return !!a })()`)
    if (!went) console.log('no Transactions tab link; at', await s.evaluate('location.pathname'))
    await sleep(2500)
  }
  const before = await s.evaluate(cats(tag))

  if (mode === 'phone') {
    const opened = await s.evaluate(`(() => {
      const row = [...document.querySelectorAll('.row-press')].find(r => /QA Jollibee ${tag}/.test(r.textContent))
      const b = row?.querySelector('button[aria-label^="Change category"]'); b?.click(); return !!b })()`)
    s.check(`${mode}: the row's tile opens the category picker`, opened)
    await sleep(900)
    s.check(`${mode}: picked Food`, await s.clickText('Food'))
  } else {
    const opened = await s.evaluate(`(() => {
      const row = [...document.querySelectorAll('tr, [role=row]')].find(r => /QA Jollibee ${tag}/.test(r.textContent))
      const b = row?.querySelector('button[data-stop]'); b?.click(); return !!b })()`)
    s.check(`${mode}: the row's category opens the menu`, opened)
    await sleep(700)
    s.check(`${mode}: picked Food`, await s.clickText('Food'))
  }
  await sleep(700)
  let text = await bodyText(s)
  s.check(`${mode}: the toast offers the two others like it`, /Filed under Food/.test(text) && /Move 2 more/.test(text), (text.match(/Filed under[^\n]*\n?[^\n]*/) ?? [''])[0])
  await s.shot(`others-${mode}-offer.png`)
  s.check(`${mode}: Move 2 more is there`, await s.clickText('Move 2 more'))
  await sleep(900)
  text = await bodyText(s)
  s.check(`${mode}: then it says three moved`, /3 filed under Food/.test(text), (text.match(/\d+ filed under[^\n]*/) ?? [''])[0])
  const after = await s.evaluate(cats(tag))
  s.check(`${mode}: the three Shopping ones are under Food; the Bills one and Mang Inasal are not touched`,
    /^Jollibee:Food Jollibee:Food Jollibee:Food Jollibee:Bills Inasal:Shopping$/i.test(after), `${before}  ->  ${after}`)
  await s.shot(`others-${mode}-moved.png`)
  s.check(`${mode}: Undo is there`, await s.clickText('Undo'))
  await sleep(900)
  const undone = await s.evaluate(cats(tag))
  s.check(`${mode}: Undo puts all three back`, undone === before, `${before}  ->  ${undone}`)
  const errors = s.consoleLog.filter(l => l.type === 'error' || l.type === 'exception')
  s.check(`${mode}: nothing logged as an error`, errors.length === 0, JSON.stringify(errors.slice(0, 3)))
  await s.close()
}

await run('phone')
await run('desktop')
process.exit()
