// With nothing in the ledger, no page may wait forever: every skeleton gives way to its empty state.
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
const s = await session({ port: 9967 })
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s.send('Page.navigate', { url: APP + '/' }); await s.until(`document.querySelector('#root')?.children.length`, 60000); await s.sleep(2500)
  const version = await s.evaluate(`(async () => (await import('/src/lib/release.js')).APP_VERSION)()`).catch(() => '0.0.0')
  await s.evaluate(seedIdb({ version }))
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open')`)
  await s.send('Page.navigate', { url: APP + '/' })
  await s.until(`document.querySelector('.d-sidebar')`, 60000)
  await s.evaluate(`(async () => { const db = (await import('/src/db/db.js')).default; for (const n of ['transactions', 'balances', 'goals', 'recurring', 'debts', 'templates']) if (db[n]) await db[n].clear(); await db.accounts.clear(); await db.accounts.put({ id: 1, name: 'Cash', type: 'cash', balance: 0, currency: 'PHP', color: '#10b981', sort_order: 0 }) })()`)
  for (const p of ['/', '/transactions', '/accounts', '/insights', '/insights/net-worth', '/insights/forecast', '/budget', '/goals', '/recurring', '/debts', '/categories/Food', '/achievements', '/insights/trend', '/accounts/1']) {
    await s.evaluate(`history.pushState(null, '', ${JSON.stringify(p)}); dispatchEvent(new PopStateEvent('popstate'))`)
    await s.sleep(800)
    const settled = await s.until(`document.querySelector('.d-page:not([aria-hidden])') && document.querySelectorAll('.d-skel').length === 0`, 15000)
    await s.sleep(1500)
    for (let i = 0; i < 3 && await s.evaluate(`!!document.querySelector('[aria-label="Pause recap"], .celebration, [data-celebration]') || /Badge earned|Milestone/.test(document.body.innerText.slice(0, 400))`); i++) {
      await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await s.sleep(800)
    }
    const still = await s.evaluate(`document.querySelectorAll('.d-skel').length`)
    await s.shot(`empty-${p === '/' ? 'home' : p.slice(1).replace(/\//g, '-')}.png`)
    s.check(`no skeleton left on empty ${p}`, settled && still === 0, `${await s.evaluate(`document.querySelectorAll('.d-skel').length`)} left`)
  }
  await s.evaluate(`history.pushState(null, '', '/'); dispatchEvent(new PopStateEvent('popstate'))`)
  await s.sleep(1500)
  await s.shot('skel-empty-home.png')
  const errs = s.consoleLog.filter(l => l.type === 'exception' || l.type === 'error')
  s.check('no console errors', errs.length === 0, errs.map(e => e.text.slice(0, 200)).join(' | '))
} finally { await s.close() }
