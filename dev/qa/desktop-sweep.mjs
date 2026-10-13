// Every desktop page, light and dark, two widths: loads, no console errors,
// nothing wider than its page, a title at the top. W=1100|1440 THEME=light|dark
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
const THEME = process.env.THEME || 'light'
const W = Number(process.env.W || 1440)
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`) }
const s = await session()
const open = async (url, settle = 1600) => {
  await s.send('Page.navigate', { url })
  await s.until(`document.readyState === 'complete' && !!document.querySelector('#root')?.childElementCount`, 90000)
  await s.sleep(settle)
}
const PAGES = [
  '/', '/transactions', '/transactions/deleted', '/accounts', '/accounts/new', '/insights', '/insights/spending', '/insights/trend',
  '/insights/net-worth', '/insights/forecast', '/insights/forecast/settings', '/budget', '/categories/Food', '/goals', '/recurring',
  '/recurring/new', '/recurring/1', '/goals/1', '/debts', '/debts/person/ana', '/notes', '/achievements', '/notifications', '/import', '/settings/preferences', '/settings/categories',
  '/settings/budgets', '/settings/backup', '/settings/sync', '/settings', '/settings/accent', '/settings/deleted', '/recap', '/expense', '/transfer',
]
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: false })
  let seeded = ''
  for (let i = 0; i < 4 && !seeded; i++) {
    await open(APP + '/', 3000)
    const version = await s.evaluate(`(async () => (await import('/src/lib/release.js')).APP_VERSION)()`).catch(() => '0.0.0')
    try { seeded = await s.evaluate(seedIdb({ version })) } catch { /* not yet */ }
  }
  await s.evaluate(`localStorage.setItem('spendr-theme', ${JSON.stringify(THEME)}); localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.removeItem('spendr-sidebar')`)
  const ids = JSON.parse(await s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); const a = await db.accounts.toArray(); const g = await db.goals.toArray(); const r = await db.recurring.toArray(); const d = await db.debts.toArray(); return JSON.stringify({ acct: a.map(x => x.id), goal: g[0]?.id, rec: r[0]?.id, person: d[0] ? encodeURIComponent(String(d[0].name).trim().toLowerCase()) : null }) })()`))
  const extra = [...ids.acct.map(i => `/accounts/${i}`), ids.goal && `/goals/${ids.goal}`, ids.rec && `/recurring/${ids.rec}`, ids.person && `/debts/person/${ids.person}`].filter(Boolean)
  for (const p of [...PAGES, ...extra]) {
    const before = s.consoleLog.length
    await open(APP + p)
    // A page's code arrives on its first visit; give its title a moment.
    await s.until(`document.querySelector('.d-title, .page-header-title, h1, [aria-label="Close Wrapped"]')`, 8000)
    const st = await s.evaluate(`(() => {
      const page = document.querySelector('.d-page, .web-split, .web-scroll')
      const over = [...document.querySelectorAll('.d-page, .web-pane, .web-scroll')].map(el => el.scrollWidth - el.clientWidth).reduce((a, b) => Math.max(a, b), 0)
      const h = document.querySelector('.d-title, .page-header-title, h1')
      // Wrapped is a story over the page, named in its own header rather than a page title.
      const story = document.querySelector('[aria-label="Close Wrapped"]') ? 'Wrapped' : null
      return { path: location.pathname, page: !!page, over, title: h?.textContent?.trim().slice(0, 40) ?? story, crashed: !!document.querySelector('[data-error-boundary], .error-boundary') || /Something went wrong/i.test(document.body.innerText) }
    })()`)
    const errs = s.consoleLog.slice(before).filter(l => l.type === 'error' || l.type === 'exception')
    check(`${p}`, st.page && st.over <= 1 && !!st.title && !st.crashed && errs.length === 0,
      JSON.stringify({ at: st.path, over: st.over, title: st.title, crashed: st.crashed, errs: errs.slice(0, 2).map(e => String(e.text ?? e.description ?? e).slice(0, 160)) }))
  }
} finally {
  await s.close()
  console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}`)
}
