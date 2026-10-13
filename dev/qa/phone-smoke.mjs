// The release build, end to end on a phone: data screens, the new pages, empty
// screens, pull to sync, Back on a cold page, and What's New.
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`) }
const s = await session({ port: 9791 })
const open = async (url, settle = 2500) => {
  await s.send('Page.navigate', { url })
  await s.until(`document.readyState === 'complete' && !!document.querySelector('#root')?.childElementCount`, 60000)
  await s.sleep(settle)
}
const text = () => s.evaluate(`(document.querySelector('main')?.innerText ?? document.body.innerText).replace(/\\s+/g, ' ')`)
const touch = (type, pts) => s.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1 })) })
async function pull() {
  await s.evaluate(`document.getElementById('app-main').scrollTop = 0`)
  await touch('touchStart', [[200, 220]])
  for (let i = 1; i <= 12; i++) { await touch('touchMove', [[200, 220 + i * 14]]); await s.sleep(16) }
  const h = await s.evaluate(`document.querySelector('#app-main > div[aria-hidden="true"]')?.getBoundingClientRect().height ?? -1`)
  await touch('touchEnd', [])
  await s.sleep(400)
  return h
}
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await open(APP + '/', 4000)

  // What's New for 0.12.0, on a set-up app that last saw 0.11.0.
  await s.evaluate(seedIdb({ version: '0.11.0' }))
  await open(APP + '/', 3500)
  const wn = await s.evaluate(`[...document.querySelectorAll('[role="dialog"]')].map(d => d.innerText).join(' ')`)
  check("What's New shows 0.12.0's notes", /0\.12\.0/.test(wn) && /Signing in asks first/.test(wn) && /Glass empty screens/.test(wn), wn.replace(/\s+/g, ' ').slice(0, 160))
  await s.shot('final-whatsnew.png')
  await s.clickText('Got it')
  await s.sleep(800)

  const home = await text()
  check('Home: found pay in Next 30 days', /Usual pay/.test(home), home.slice(0, 200))
  await open(APP + '/insights/forecast', 3000)
  const fc = await text()
  check('Forecast: pay found in history', /found in your history/i.test(fc) && /Safe to spend/.test(fc))
  check('Forecast: the sliders open its settings', await s.evaluate(`!!document.querySelector('button[aria-label="Forecast settings"]')`))
  await s.evaluate(`document.querySelector('button[aria-label="Forecast settings"]').click()`)
  await s.until(`location.pathname === '/insights/forecast/settings'`, 8000)
  await s.sleep(1500)
  const fs = await text()
  check('Forecast settings: lists the salary', /Salary/.test(fs) && /Twice a month/.test(fs), fs.slice(0, 200))
  check('no pull on Forecast settings', (await pull()) === 0)
  await s.evaluate(`document.querySelector('.subpage-back').click()`)
  await s.until(`location.pathname === '/insights/forecast'`, 8000)
  check('its Back returns to Forecast', (await s.evaluate('location.pathname')) === '/insights/forecast')

  await open(APP + '/accounts/new', 2500)
  check('no pull on New account', (await pull()) === 0)
  await open(APP + '/transactions', 2500)
  check('pull on Transactions', (await pull()) > 20)

  // A cold page: Back goes up, not nowhere.
  await open(APP + '/settings/profile', 2500)
  await s.evaluate(`document.querySelector('button[aria-label="Back"]')?.click()`)
  await s.sleep(1000)
  check('Back on a cold /settings/profile goes to Settings', (await s.evaluate('location.pathname')) === '/settings')

  // Empty screens, both themes.
  await s.evaluate(seedIdb({ empty: true, version: '0.12.0' }))
  for (const theme of ['light', 'dark']) {
    await s.evaluate(`localStorage.setItem('spendr-theme', '${theme}')`)
    for (const [path, want] of [['/', 'No transactions yet'], ['/goals', 'No goals yet'], ['/debts', 'No debts yet'], ['/recurring', 'Nothing recurring yet'], ['/insights/forecast', 'Nothing scheduled']]) {
      await open(APP + path, 2500)
      const hasArt = await s.evaluate(`!!document.querySelector('main .glass-live, main img[src^="data:image/svg"], main img[src^="blob:"]')`)
      const t = await text()
      check(`${theme} ${path}: "${want}" with a glass picture`, t.includes(want) && hasArt, t.slice(0, 120))
      if (path === '/goals') await s.shot(`final-empty-goals-${theme}.png`)
    }
  }
  console.log('ERRORS', JSON.stringify(s.consoleLog.filter(c => c.type === 'error' || c.type === 'exception').slice(0, 6)))
} finally { await s.close() }
console.log(failures ? `${failures} FAILED` : 'all passed')
