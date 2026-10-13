// Every panel opened from its page leaves that page mounted under it (same element, same scroll); a cold open still draws the page it belongs to.
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
const s = await session()
const wait = (ms = 900) => s.sleep(ms)
const mark = `document.querySelector('.d-page').dataset.mark = 'same'`
const state = `(() => ({ path: location.pathname, mark: document.querySelector('.d-page')?.dataset.mark ?? null, drawer: !!document.querySelector('.d-drawer'), width: Math.round(document.querySelector('.d-drawer')?.getBoundingClientRect().width ?? 0), title: document.querySelector('.d-title')?.textContent ?? null }))()`
const click = (sel, text) => s.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => ${text ? `b.textContent.trim() === ${JSON.stringify(text)}` : 'true'})?.click()`)
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s.send('Page.navigate', { url: APP + '/' }); await s.until(`document.querySelector('#root')?.children.length`, 60000); await s.sleep(2500)
  const version = await s.evaluate(`(async () => (await import('/src/lib/release.js')).APP_VERSION)()`).catch(() => '0.0.0')
  await s.evaluate(seedIdb({ version }))
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open')`)
  const open = async (path, ready) => { await s.send('Page.navigate', { url: APP + path }); await s.until(ready, 60000); await wait(1200) }
  const back = async () => { await s.evaluate(`document.querySelector('.d-drawer button[aria-label="Close"]').click()`); await wait() }

  // New account, from Accounts.
  await open('/accounts', `document.querySelector('.d-page .acct-card') && !document.querySelector('.d-skel')`)
  await s.evaluate(mark); await click('.d-page-head button', 'New account'); await s.until(`document.querySelector('.d-drawer')`, 8000); await wait()
  let st = await s.evaluate(state)
  s.check('New account: Accounts stays under, 600 wide', st.path === '/accounts/new' && st.mark === 'same' && st.drawer && st.width === 600, JSON.stringify(st))
  await back(); st = await s.evaluate(state)
  s.check('  closes to Accounts, same page', st.path === '/accounts' && st.mark === 'same' && !st.drawer, JSON.stringify(st))

  // Edit account and Statement history, from an account's page.
  const ids = await s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); const a = await db.accounts.toArray(); return { any: a.find(x => x.type !== 'credit')?.id, credit: a.find(x => x.type === 'credit')?.id } })()`)
  await open(`/accounts/${ids.any}`, `document.querySelector('.d-page-head') && !document.querySelector('.d-skel')`)
  await s.evaluate(mark); await click('.d-page-head button', 'Edit'); await s.until(`document.querySelector('.d-drawer input')`, 8000); await wait()
  st = await s.evaluate(state)
  s.check('Edit account: the account stays under', st.path === `/accounts/${ids.any}/edit` && st.mark === 'same' && st.drawer, JSON.stringify(st))
  await back(); st = await s.evaluate(state)
  s.check('  closes to the account, same page', st.path === `/accounts/${ids.any}` && st.mark === 'same' && !st.drawer, JSON.stringify(st))
  if (ids.credit != null) {
    await open(`/accounts/${ids.credit}`, `document.querySelector('.d-page-head') && !document.querySelector('.d-skel')`)
    await s.evaluate(mark)
    await s.evaluate(`navigator.clipboard; document.querySelector('.d-page').scrollTo(0, 0)`)
    const stmtAll = `[...document.querySelectorAll('.d-page .d-panel')].find(p => p.querySelector('.d-panel-title')?.textContent === 'Statements')?.querySelector('.d-panel-head button')`
    const link = await s.evaluate(`!!(${stmtAll})`)
    if (link) {
      await s.evaluate(`(${stmtAll}).click()`); await s.until(`document.querySelector('.d-drawer')`, 8000); await wait()
      st = await s.evaluate(state)
      s.check('Statement history: the card stays under', /statements$/.test(st.path) && st.mark === 'same' && st.drawer, JSON.stringify(st))
      await back()
    } else console.log('SKIP  statement history (no statements link)')
  }

  // New and edit recurring.
  await open('/recurring', `document.querySelector('.d-page-head') && !document.querySelector('.d-skel')`)
  await s.evaluate(mark); await click('.d-page-head button', 'New'); await s.until(`document.querySelector('.d-drawer input')`, 8000); await wait()
  st = await s.evaluate(state)
  s.check('New recurring: Recurring stays under', st.path === '/recurring/new' && st.mark === 'same' && st.drawer, JSON.stringify(st))
  await back(); st = await s.evaluate(state)
  s.check('  closes to Recurring, same page', st.path === '/recurring' && st.mark === 'same' && !st.drawer, JSON.stringify(st))
  await open('/recurring/1', `document.querySelector('.d-page-head') && !document.querySelector('.d-skel')`)
  await s.evaluate(mark); await click('.d-page-head button', 'Edit'); await s.until(`document.querySelector('.d-drawer input')`, 8000); await wait()
  st = await s.evaluate(state)
  s.check('Edit recurring: the bill stays under', st.path === '/recurring/1/edit' && st.mark === 'same' && st.drawer, JSON.stringify(st))
  await back()

  // Cold opens: the page the panel belongs to is drawn under it.
  for (const [p, title] of [['/accounts/new', 'Accounts'], ['/recurring/new', 'Recurring'], ['/insights/forecast/settings', 'Insights']]) {
    await open(p, `document.querySelector('.d-drawer')`)
    st = await s.evaluate(state)
    s.check(`cold ${p}: panel over ${title}`, st.drawer && st.title === title, JSON.stringify(st))
  }
  const errs = s.consoleLog.filter(l => l.type === 'exception' || l.type === 'error')
  s.check('no console errors', errs.length === 0, errs.map(e => e.text.slice(0, 200)).join(' | '))
} finally { await s.close() }
