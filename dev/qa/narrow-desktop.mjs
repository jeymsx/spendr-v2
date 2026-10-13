// Narrow windows: at 1100px with the sidebar open, no page is wider than
// itself and no stat or panel title is cut off. SIDEBAR=open|collapsed
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
const W = Number(process.env.W || 1100)
const SIDEBAR = process.env.SIDEBAR || 'open'
const PAGES = ['/', '/transactions', '/accounts', '/accounts/1', '/accounts/5', '/insights', '/insights/spending', '/insights/trend', '/insights/net-worth', '/insights/forecast',
  '/budget', '/categories/Food', '/goals', '/recurring', '/debts', '/achievements', '/settings', '/settings/deleted']
let failures = 0
const s = await session()
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Page.navigate', { url: APP + '/' }); await s.sleep(3000)
  const version = await s.evaluate(`(async () => (await import('/src/lib/release.js')).APP_VERSION)()`).catch(() => '0.0.0')
  await s.evaluate(seedIdb({ version }))
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', ${JSON.stringify(SIDEBAR)})`)
  for (const p of PAGES) {
    await s.send('Page.navigate', { url: APP + p })
    try { await s.until(`!!document.querySelector('.d-title, .d-page-inner')`, 60000) } catch { console.log('FAIL', p, 'never loaded'); failures++; continue }
    await s.sleep(1600)
    const r = JSON.parse(await s.evaluate(`JSON.stringify((() => {
      const page = document.querySelector('.d-page')
      const over = page ? page.scrollWidth - page.clientWidth : 0
      const cut = [...document.querySelectorAll('.d-stat-value, .d-stat-note, .d-stat-label, .d-panel-title, .d-section-title, .d-title')]
        .filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map(e => e.textContent.trim().slice(0, 30))
      for (const t of document.querySelectorAll('.d-table')) {
        const panel = t.closest('.d-panel')
        if (panel && t.getBoundingClientRect().right > panel.getBoundingClientRect().right + 1) cut.push('table wider than its panel: ' + (t.getAttribute('aria-label') || ''))
      }
      const stats = document.querySelector('.d-stats')
      const cols = stats ? getComputedStyle(stats).gridTemplateColumns.split(' ').length : null
      return { over, cut, cols }
    })())`))
    const ok = r.over <= 1 && r.cut.length === 0
    if (!ok) failures++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${p}  cols=${r.cols}  ${r.over > 1 ? 'over ' + r.over : ''} ${r.cut.length ? 'cut: ' + JSON.stringify(r.cut) : ''}`)
    if (process.env.SHOTS) await s.shot(`narrow-${SIDEBAR}${p.replace(/\//g, '_')}.png`)
  }
} finally {
  await s.close()
  console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}`)
}
