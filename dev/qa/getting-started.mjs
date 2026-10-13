// The Getting started list: its card on Home ticks itself off from the
// ledger, its sheet lists the six steps, it is pinned in Notifications, and
// the help centre finds its article.
import { session, APP } from './harness.mjs'
const s = await session({ port: 9961 })
const THEME = process.env.THEME ?? 'light'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const db = (code) => s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); ${code} })()`)
const text = () => s.evaluate(`document.body.innerText`)
try {
  // ── Phone ──
  await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: true })
  await s.send('Page.navigate', { url: APP + '/src/db/db.js' })
  await sleep(1500)
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'mobile'); localStorage.setItem('spendr-theme', '${THEME}')`)
  // A fresh ledger that has been through setup, as Onboarding leaves it, less the categories.
  await db(`await db.meta.put({ key: 'onboarded', value: true }); await db.meta.put({ key: 'whatsNewSeen', value: '0.19.0' });
    await db.categories.bulkAdd([{ name: 'Food', icon: '🍔', color: '#f59e0b', type: 'expense', budget: 0 }, { name: 'Salary', icon: '💼', color: '#10b981', type: 'inflow', budget: 0 }])`)
  await s.goto(APP + '/?checklist=show', 3000)
  await s.until(`document.querySelector('[aria-label="Getting started"]')`, 20000)
  await sleep(800)
  s.check('phone Home: the card shows, at 0 of 6', /Getting started/.test(await text()) && /Six steps/.test(await text()))
  s.check('the address loses ?checklist=show', !(await s.evaluate('location.search')).includes('checklist'))
  await s.shot(`gs-phone-home-0-${THEME}.png`)

  // An account and an expense, as if done: the count moves on its own.
  await db(`await db.accounts.add({ name: 'GCash', type: 'ewallet', balance: 1000, currency: 'PHP', color: '#2563eb' });
    await db.transactions.add({ txId: 'q1', type: 'expense', amount: 120, description: 'Lunch', category: 'Food', account: 'Cash', date: new Date().toISOString(), synced: 0, updatedAt: new Date().toISOString() })`)
  await sleep(2500)
  // The first-entry milestone celebrates over Home; put it away, as a person would.
  await s.evaluate(`[...document.querySelectorAll('button')].find(b => /Back to Home/.test(b.textContent))?.click()`)
  await sleep(1500)
  s.check('ticks itself off from the ledger: 2 done, 4 to go', /2\/6/.test(await text()) && /4 to go/.test(await text()))
  s.check('offers the next step: Log income', /Next\s*Log income/.test(await text()))
  await s.shot(`gs-phone-home-2-${THEME}.png`)

  await s.evaluate(`[...document.querySelectorAll('button')].find(b => /See all/.test(b.textContent))?.click()`)
  await sleep(900)
  s.check('the sheet lists all six', (await text()).includes('Add a recurring bill') && (await text()).includes('Hide from Home'))
  await s.shot(`gs-phone-sheet-${THEME}.png`)
  await s.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(600)

  await s.goto(APP + '/notifications', 2500)
  await sleep(800)
  s.check('pinned at the top of the notifications', /Getting started[\s\S]*Next: Log income/.test(await text()))
  await s.shot(`gs-phone-notifs-${THEME}.png`)

  // ── Help centre on the phone ──
  await s.goto(APP + '/help', 2500)
  await sleep(800)
  s.check('help: hero and topics', /How can we help\?/.test(await text()) && /Topics/.test(await text()))
  await s.shot(`help-phone-hub-${THEME}.png`)
  await s.evaluate(`(() => { const i = document.querySelector('input[type=search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'getting started'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(600)
  s.check('help: search finds the Getting started article', /What is the Getting started list\?/.test(await text()))
  await s.shot(`help-phone-search-${THEME}.png`)
  await s.goto(APP + '/help/getting-started-list', 2500)
  await sleep(800)
  s.check('help: an answer, with its steps and its button', /Show the Getting started list/.test(await text()))
  await s.shot(`help-phone-article-${THEME}.png`)
  await s.goto(APP + '/help/what-is-spendr', 2500)
  await sleep(1500)
  const img = await s.evaluate(`(() => { const i = document.querySelector('.help-shot img'); return i ? { ok: i.complete && i.naturalWidth > 0, src: i.src.slice(-40) } : null })()`)
  s.check('help: the screenshot loads', !!img?.ok, JSON.stringify(img))
  await s.shot(`help-phone-shot-${THEME}.png`)

  // ── Hide, and bring back ──
  await s.goto(APP + '/', 2500)
  await sleep(600)
  await s.evaluate(`[...document.querySelectorAll('button')].find(b => /See all/.test(b.textContent))?.click()`)
  await sleep(800)
  await s.evaluate(`[...document.querySelectorAll('button')].find(b => /Hide from Home/.test(b.textContent))?.click()`)
  await sleep(900)
  s.check('hidden: off Home', !(await s.evaluate(`!!document.querySelector('[aria-label="Getting started"]')`)))

  // ── Desktop ──
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open')`)
  await s.goto(APP + '/?checklist=show', 3500)
  await s.until(`document.querySelector('.d-gs-grid')`, 20000)
  await sleep(800)
  s.check('desktop Home: the panel, six tiles', (await s.evaluate(`document.querySelectorAll('.d-gs-step').length`)) === 6)
  await s.shot(`gs-desk-home-${THEME}.png`)
  await s.evaluate(`document.querySelector('[aria-label="Notifications"], button[aria-label*="otification"]')?.click()`)
  await sleep(900)
  await s.shot(`gs-desk-bell-${THEME}.png`)
  await s.goto(APP + '/help', 2500)
  await sleep(1000)
  await s.shot(`help-desk-hub-${THEME}.png`)
  await s.goto(APP + '/help/getting-started-list', 2500)
  await sleep(1000)
  await s.shot(`help-desk-article-${THEME}.png`)
  await s.goto(APP + '/help/topic/start', 2500)
  await sleep(1000)
  await s.shot(`help-desk-topic-${THEME}.png`)

  const errs = s.consoleLog.filter(l => ['error', 'exception'].includes(l.type) && !/favicon|Failed to load resource|ERR_/.test(l.text))
  s.check('nothing logged as an error', errs.length === 0, JSON.stringify(errs.slice(0, 3)))
} catch (e) {
  console.log('SCRIPT ERROR', e.message)
  await s.shot('gs-error.png').catch(() => {})
} finally { await s.close() }
