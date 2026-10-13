// An installment plan counted as one purchase: lists, budget, Insights, the card, delete.
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
const BASE = APP
const s = await session()
const ev = (x) => s.evaluate(x)
const ready = (p) => s.until(`location.pathname === ${JSON.stringify(p)} && document.querySelector('.d-page:not([aria-hidden])') && !document.querySelector('.d-skel')`, 30000)
const go = async (p) => { await ev(`history.pushState(null, '', ${JSON.stringify(p)}); dispatchEvent(new PopStateEvent('popstate'))`); await ready(p.split('?')[0]); await s.sleep(900) }
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s.send('Page.navigate', { url: BASE + '/' }); await s.until(`document.querySelector('#root')?.children.length`, 60000); await s.sleep(2000)
  const version = await ev(`(async () => (await import('/src/lib/release.js')).APP_VERSION)()`).catch(() => '0.0.0')
  await ev(seedIdb({ version }))
  await ev(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open'); localStorage.setItem('spendr-theme', 'dark')`)
  await s.send('Page.navigate', { url: BASE + '/' }); await s.until(`document.querySelector('.d-sidebar')`, 60000); await s.sleep(1200)

  // A 12 × ₱3,000 phone on BPI Credit, bought two months ago on the 10th.
  const plan = await ev(`(async () => {
    const db = (await import('/src/db/db.js')).default
    if (!(await db.categories.where('name').equals('Gadgets').first())) await db.categories.add({ name: 'Gadgets', icon: '📱', color: '#6366f1', type: 'expense', budget: 5000 })
    else await db.categories.where('name').equals('Gadgets').modify({ budget: 5000 })
    const now = new Date()
    const id = crypto.randomUUID()
    const rows = Array.from({ length: 12 }, (_, i) => ({
      txId: crypto.randomUUID(), type: 'expense', amount: 3000, category: 'Gadgets', account: 'BPI Credit',
      description: 'iPhone 17 (' + (i + 1) + '/12)', installmentId: id,
      date: new Date(now.getFullYear(), now.getMonth() - 2 + i, 10, 12).toISOString(), updatedAt: new Date().toISOString(),
    }))
    await db.transactions.bulkAdd(rows)
    const bought = new Date(now.getFullYear(), now.getMonth() - 2, 10)
    return { bought: bought.toISOString().slice(0, 7), billed: rows.filter(r => r.date <= new Date().toISOString()).length }
  })()`)
  console.log('plan', JSON.stringify(plan))

  // 1. Transactions: the plan once, its whole price, on the day bought.
  // Searched for: the table draws only the rows on screen, and the plan was bought two months back.
  await go('/transactions?q=' + encodeURIComponent('iPhone 17'))
  await s.until(`[...document.querySelectorAll('.d-page tbody tr')].some(r => /iPhone 17/.test(r.textContent))`, 10000)
  const listed = await ev(`[...document.querySelectorAll('.d-page tbody tr')].filter(r => /iPhone 17/.test(r.textContent)).map(r => r.textContent.replace(/\\s+/g, ' ').trim())`)
  s.check('Transactions lists the plan once', listed.length === 1, listed.join(' | '))
  s.check('at its whole price, with its term', /36,000\.00/.test(listed[0] ?? '') && /3,000\.00 × 12/.test(listed[0] ?? ''), listed[0])
  s.check('and no "(1/12)" in its name', !/\(1\/12\)/.test(listed[0] ?? ''))
  await s.shot('plan-transactions.png')

  // 2. Its drawer: the plan, what is billed; then the card's own page lists each payment.
  const id = await ev(`(async () => { const db = (await import('/src/db/db.js')).default; return (await db.transactions.filter(t => /iPhone 17 \\(1\\/12\\)/.test(t.description ?? '')).first()).id })()`)
  await go('/transactions?tx=' + id)
  await s.until(`document.querySelector('.d-drawer')`, 5000); await s.sleep(500)
  const drawer = await ev(`document.querySelector('.d-drawer').innerText.replace(/\\s+/g, ' ')`)
  s.check('the drawer shows the purchase whole and the plan', /36,000\.00/.test(drawer) && /3,000\.00 × 12 · \d+ of 12 billed/.test(drawer), drawer.slice(0, 220))
  await s.shot('plan-drawer.png')
  await ev(`history.back()`); await s.sleep(500)

  const card = await ev(`(async () => { const db = (await import('/src/db/db.js')).default; return (await db.accounts.where('name').equals('BPI Credit').first()).id })()`)
  await go('/accounts/' + card)
  await s.until(`/iPhone 17/.test(document.querySelector('.d-page')?.innerText ?? '')`, 15000)
  console.log('CARD', JSON.stringify(await ev(`document.querySelector('.d-page').innerText.replace(/\\s+/g, ' ').slice(0, 1600)`)))
  const cardText = await ev(`document.querySelector('.d-page').innerText`)
  const payments = (cardText.match(/iPhone 17 \(\d+\/12\)/g) ?? []).length
  s.check('the card still lists each payment', payments === 12, `${payments} payments listed`)

  // 3. Budget: this month nothing of it; the month bought all of it.
  await go('/budget')
  const gadgetsNow = await ev(`[...document.querySelectorAll('.d-page tbody tr')].find(r => /Gadgets/.test(r.textContent))?.textContent.replace(/\\s+/g, ' ') ?? 'not listed'`)
  s.check('this month’s budget has no payment of it', !/3,000\.00/.test(gadgetsNow), gadgetsNow)
  await ev(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Previous month')?.click()`); await s.sleep(500)
  await ev(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Previous month')?.click()`); await s.sleep(900)
  const gadgetsThen = await ev(`[...document.querySelectorAll('.d-page tbody tr')].find(r => /Gadgets/.test(r.textContent))?.textContent.replace(/\\s+/g, ' ') ?? 'not listed'`)
  s.check('the month bought has all of it', /36,000\.00/.test(gadgetsThen), gadgetsThen)
  await s.shot('plan-budget-then.png')

  // 4. Insights: the month bought spends it; last month does not.
  await go('/insights')
  const now = await ev(`document.querySelector('.d-stat-value').textContent`)
  await ev(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Previous month').click()`); await s.sleep(1200)
  const last = await ev(`document.querySelector('.d-stat-value').textContent`)
  await ev(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Previous month').click()`); await s.sleep(1200)
  const then = await ev(`document.querySelector('.d-stat-value').textContent`)
  const where = await ev(`document.querySelector('.d-page').innerText.includes('Gadgets')`)
  console.log('Insights spent: two months ago', then, '· last month', last, '· now', now)
  s.check('Insights counts it in the month bought', where)
  // Last month held only a payment of it: Gadgets is not in its breakdown.
  await ev(`[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Next month').click()`); await s.sleep(1200)
  s.check('and not in the month after', !(await ev(`[...document.querySelectorAll('.d-page button')].some(b => /^Gadgets/.test(b.textContent.trim()))`)))

  // 5. Available credit still takes the whole plan.
  await go('/accounts/' + card)
  const avail = await ev(`document.querySelector('.d-page').innerText.match(/Available[^₱]*₱([\\d,]+\\.\\d\\d)/i)?.[1] ?? 'n/a'`)
  console.log('BPI Credit available', avail)

  // 6. Deleting one payment - handed over as a list draws it - takes the whole plan, and stores nothing drawn.
  const del = await ev(`(async () => {
    const db = (await import('/src/db/db.js')).default
    const { foldPlans } = await import('/src/utils/installments.js')
    const { moveToTrash } = await import('/src/db/trash.js')
    const all = await db.transactions.toArray()
    const drawn = foldPlans(all).find(t => t.plan && /iPhone 17/.test(t.description ?? ''))
    const moved = await moveToTrash([drawn])
    const left = await db.transactions.filter(t => /iPhone 17/.test(t.description ?? '')).count()
    const trash = await db.trash.get(moved.id)
    return { count: moved.count, left, drawnStored: trash.txs.some(t => 'plan' in t || 'planOf' in t) }
  })()`)
  s.check('deleting one payment takes every month', del.left === 0 && del.count === 12, JSON.stringify(del))
  s.check('and the trash holds the rows as stored', !del.drawnStored)

  const errs = s.consoleLog.filter(l => l.type === 'exception' || l.type === 'error')
  s.check('no console errors', errs.length === 0, errs.map(e => e.text.slice(0, 200)).join(' | '))
} finally { await s.close() }
