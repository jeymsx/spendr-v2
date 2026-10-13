// 0.22.0 regression: a template's amount could not be edited on its confirm
// sheet (the "−₱" sign made every key look like a minus). Type into it for real.
import { session, sleep, APP } from './harness.mjs'

const fake = JSON.stringify({ access_token: 'tokA', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refreshA', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: { full_name: 'Test User' }, created_at: '2026-01-01T00:00:00Z' } })

const s = await session({ port: 9484 })
await s.send('Emulation.setFocusEmulationEnabled', { enabled: true })
await s.goto(APP + '/', 1500)
await s.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(fake)}); localStorage.setItem('spendr-view-mode', 'phone'); localStorage.setItem('spendr-theme', 'light')`)
await s.goto(APP + '/', 4000)
const name = 'QA Coffee ' + Date.now().toString(36).slice(-4)
await s.evaluate(`(async () => {
  const { default: db } = await import('/src/db/db.js')
  const acct = (await db.accounts.toArray())[0]?.name ?? 'Cash'
  await db.templates.add({ name: ${JSON.stringify(name)}, type: 'expense', amount: 120, account: acct, category: 'Food', description: ${JSON.stringify(name)}, updatedAt: new Date().toISOString() })
})()`)
await sleep(1500)
if (await s.clickText('Got it')) await sleep(800)
const tapped = await s.evaluate(`(() => {
  const el = [...document.querySelectorAll('button, [role=button]')].find(b => b.textContent.includes(${JSON.stringify(name)}))
  el?.scrollIntoView({ block: 'center' }); el?.click(); return !!el })()`)
s.check('the template chip is on Home and opens', tapped)
await sleep(1000)
const field = `[...document.querySelectorAll('[role=dialog] input, .sheet input')].find(i => /120/.test(i.value))`
const before = await s.evaluate(`(${field})?.value ?? null`)
s.check('the sheet shows the amount', before != null, String(before))
// Select the whole figure and type a new one, key by key.
await s.evaluate(`(() => { const i = ${field}; i.focus(); i.setSelectionRange(0, i.value.length) })()`)
for (const ch of '150') { await s.send('Input.insertText', { text: ch }); await sleep(120) }
await sleep(300)
const after = await s.evaluate(`[...document.querySelectorAll('[role=dialog] input, .sheet input')].map(i => i.value).join(' | ')`)
s.check('typing a new amount takes', /150/.test(after) && !/120/.test(after), `${before} -> ${after}`)
await s.send('Input.insertText', { text: '-' })
await sleep(200)
const afterMinus = await s.evaluate(`[...document.querySelectorAll('[role=dialog] input, .sheet input')].map(i => i.value).join(' | ')`)
s.check('a minus typed after it is refused, the figure kept', afterMinus === after, `${after} -> ${afterMinus}`)
await s.shot('template-amount.png')
const errors = s.consoleLog.filter(l => l.type === 'error' || l.type === 'exception')
s.check('nothing logged as an error', errors.length === 0, JSON.stringify(errors.slice(0, 3)))
await s.close()
process.exit()
