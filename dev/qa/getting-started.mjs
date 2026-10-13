// The Getting started list lives only in Notifications: pinned atop the page
// on the phone, a panel on the computer's Notifications page and a row in the
// bell. Not on Home, not in Help. It ticks itself off from the ledger, says
// so when everything is done, and the help centre's article brings it back.
import { session, APP } from './harness.mjs'
const s = await session()
const THEME = process.env.THEME ?? 'light'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const db = (code) => s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); ${code} })()`)
const text = () => s.evaluate(`document.body.innerText`)
const has = (sel) => s.evaluate(`!!document.querySelector(${JSON.stringify(sel)})`)
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: true })
  await s.send('Page.navigate', { url: APP + '/src/db/db.js' })
  await sleep(1500)
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'mobile'); localStorage.setItem('spendr-theme', '${THEME}')`)
  // A fresh ledger that has been through setup, as Onboarding leaves it, less most categories.
  await db(`const { APP_VERSION } = await import('/src/lib/release.js');
    await db.meta.put({ key: 'onboarded', value: true }); await db.meta.put({ key: 'whatsNewSeen', value: APP_VERSION });
    await db.categories.bulkAdd([{ name: 'Food', icon: '🍔', color: '#f59e0b', type: 'expense', budget: 0 }])`)

  // The help centre's button brings it back, to the notifications.
  await s.goto(APP + '/notifications?checklist=show', 3000)
  await s.until(`document.querySelector('[aria-label="Getting started"]')`, 20000)
  s.check('phone: the list is pinned atop the notifications', /Getting started[\s\S]*Next: Add your accounts/.test(await text()))
  s.check('the address loses ?checklist=show', !(await s.evaluate('location.search')).includes('checklist'))
  await s.shot(`gs-phone-notifs-${THEME}.png`)

  await s.goto(APP + '/', 3000)
  await sleep(1200)
  s.check('phone Home: no list', !(await has('[aria-label="Getting started"]')))
  await s.goto(APP + '/help', 2500)
  await sleep(800)
  s.check('phone Help: no list', !(await has('[aria-label="Getting started"]')) && /How can we help\?/.test(await text()))

  // The help centre finds its article, which has the button that brings it back.
  await s.evaluate(`(() => { const i = document.querySelector('input[type=search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'getting started'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(600)
  s.check('help: search finds the Getting started article', /What is the Getting started list\?/.test(await text()))
  await s.goto(APP + '/help/getting-started-list', 2500)
  await s.until(`/Show the Getting started list/.test(document.body.innerText)`, 10000)
  s.check('help: the article has its button', /Show the Getting started list/.test(await text()))
  await s.goto(APP + '/help/what-is-spendr', 2500)
  await sleep(1500)
  const img = await s.evaluate(`(() => { const i = document.querySelector('.help-shot img'); return i ? { ok: i.complete && i.naturalWidth > 0, src: i.src.slice(-40) } : null })()`)
  s.check('help: an article\'s screenshot loads', !!img?.ok, JSON.stringify(img))

  // Everything done: the pin says so, and Done puts it away.
  await db(`await db.accounts.add({ name: 'GCash', type: 'ewallet', balance: 1000, currency: 'PHP', color: '#2563eb' });
    const now = new Date().toISOString();
    await db.transactions.bulkAdd([
      { txId: 'a', type: 'expense', amount: 120, description: 'Lunch', category: 'Food', account: 'Cash', date: now, synced: 0, updatedAt: now },
      { txId: 'b', type: 'inflow', amount: 5000, description: 'Pay', category: 'Salary', account: 'GCash', date: now, synced: 0, updatedAt: now },
      { txId: 'c', type: 'transfer', amount: 200, description: 'Cash out', fromAccount: 'GCash', toAccount: 'Cash', date: now, synced: 0, updatedAt: now }]);
    const food = await db.categories.where('name').equals('Food').first(); await db.categories.update(food.id, { budget: 3000 });
    await db.recurring.add({ name: 'Netflix', amount: 549, category: 'Food', account: 'GCash', frequency: 'monthly', nextDate: now, active: true, type: 'expense' })`)
  await sleep(2500)
  // The first-entry milestone celebrates over the page; put it away, as a person would.
  await s.evaluate(`[...document.querySelectorAll('button')].find(b => /Back to Home/.test(b.textContent))?.click()`)
  await s.goto(APP + '/notifications', 2500)
  await sleep(1200)
  s.check('phone: all done, it says so', /You’re all set/.test(await text()))
  await s.shot(`gs-phone-done-${THEME}.png`)
  await s.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Done')?.click()`)
  await sleep(800)
  s.check('Done puts it away', !(await has('[aria-label="Getting started"]')))

  // ── Desktop: Notifications page and the bell; not Home ──
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open')`)
  await db(`await db.recurring.clear()`)
  await s.goto(APP + '/notifications?checklist=show', 3500)
  await s.until(`document.querySelector('.d-gs-grid')`, 20000)
  s.check('desktop: the panel on the Notifications page', (await s.evaluate(`document.querySelectorAll('.d-gs-step').length`)) === 6)
  await s.shot(`gs-desk-notifs-${THEME}.png`)
  await s.goto(APP + '/', 3000)
  await sleep(1200)
  s.check('desktop Home: no panel', !(await has('.d-gs-grid')))
  await s.evaluate(`document.querySelector('[data-bell] button, button[aria-label*="otification"]')?.click()`)
  await s.until(`[...document.querySelectorAll('[role=dialog] button')].some(b => /Getting started/.test(b.textContent))`, 10000)
  s.check('desktop bell: the row, going to Notifications', /Getting started[\s\S]*Next: Add a recurring bill/.test(await text()))
  await s.evaluate(`[...document.querySelectorAll('[role=dialog] button')].find(b => /Getting started/.test(b.textContent))?.click()`)
  await sleep(1200)
  s.check('the row opens the Notifications page', (await s.evaluate('location.pathname')) === '/notifications')
  await s.goto(APP + '/help', 2500)
  await sleep(900)
  s.check('desktop Help: no list', !(await has('.d-gs-grid')))

  const errs = s.consoleLog.filter(l => ['error', 'exception'].includes(l.type) && !/favicon|Failed to load resource|ERR_/.test(l.text))
  s.check('nothing logged as an error', errs.length === 0, JSON.stringify(errs.slice(0, 3)))
} catch (e) {
  s.check('the check ran to the end', false, e.message)
  await s.shot('gs-error.png').catch(() => {})
} finally { await s.close() }
process.exit()
