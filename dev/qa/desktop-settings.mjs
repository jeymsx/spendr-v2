// Settings on the desktop: the overview scrolled, the sticky nav's gap, the
// accent grid by click and by arrow keys, Recently deleted in the pane, the
// Report dialog. W=1440|1100 THEME=light|dark
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
const THEME = process.env.THEME || 'light'
const W = Number(process.env.W || 1440)
const TAG = process.env.TAG || 'sq'
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`) }
const s = await session({ port: Number(process.env.CDP || 9921) })
const open = async (url, settle = 1800) => {
  await s.send('Page.navigate', { url })
  await s.until(`document.readyState === 'complete' && !!document.querySelector('#root')?.childElementCount`, 90000)
  await s.sleep(settle)
}
const click = async (sel) => {
  const box = JSON.parse(await s.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 60) }) })()`))
  for (const type of ['mousePressed', 'mouseReleased']) await s.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
}
const key = async (k, code) => {
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37, Tab: 9, Escape: 27 }[k] })
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37, Tab: 9, Escape: 27 }[k] })
}
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  let seeded = ''
  for (let i = 0; i < 4 && !seeded; i++) {
    await open(APP + '/', 3000)
    const version = await s.evaluate(`(async () => (await import('/src/lib/release.js')).APP_VERSION)()`).catch(() => '0.0.0')
    try { seeded = await s.evaluate(seedIdb({ version })) } catch { /* the database is still opening: go round again */ }
  }
  await s.evaluate(`localStorage.setItem('spendr-theme', ${JSON.stringify(THEME)}); localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open'); localStorage.setItem('accentColor', '#2D9DFF')`)

  // Overview, then scrolled to its foot; the nav stuck with a gap under the top bar.
  await open(APP + '/settings')
  await s.until(`!!document.querySelector('.d-set-list')`, 30000)
  const over = await s.evaluate(`(() => { const p = document.querySelector('.d-page'); return p.scrollWidth - p.clientWidth })()`)
  check('overview: nothing wider than the page', over <= 1, `over ${over}`)
  const tiles = await s.evaluate(`[...document.querySelectorAll('.d-set-line-value .truncate')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent)`)
  check('overview: no tile value cut off', tiles.length === 0, JSON.stringify(tiles))
  await s.evaluate(`document.querySelector('.d-page').scrollTo(0, 99999)`)
  await s.sleep(500)
  const gap = JSON.parse(await s.evaluate(`JSON.stringify({ nav: document.querySelector('.d-twopane-side').getBoundingClientRect().top, bar: document.querySelector('.d-topbar').getBoundingClientRect().bottom })`))
  check('the sticky nav stays clear of the top bar', gap.nav >= gap.bar + 23, JSON.stringify(gap))
  await s.shot(`${TAG}-${THEME}-${W}-overview-foot.png`)

  // Report a bug opens the desktop dialog; Escape closes it.
  const report = await s.evaluate(`(() => { const b = [...document.querySelectorAll('.d-set-line button')].find(b => b.textContent.trim() === 'Report'); b?.click(); return !!b })()`)
  await s.sleep(400)
  const dlg = await s.evaluate(`document.querySelector('[role=dialog]')?.getAttribute('aria-label') ?? null`)
  check('Report opens its dialog', report && dlg === 'Report a bug', String(dlg))
  await s.shot(`${TAG}-${THEME}-${W}-report.png`)
  await key('Escape', 'Escape')
  await s.sleep(300)
  check('Escape closes it', !(await s.evaluate(`!!document.querySelector('[role=dialog]')`)))

  // A tile opens its section in the right half.
  await s.evaluate(`document.querySelector('.d-page').scrollTo(0, 0)`)
  await s.sleep(200)
  await s.evaluate(`[...document.querySelectorAll('.d-set-line')].find(b => /Recently deleted/.test(b.textContent))?.click()`)
  await s.sleep(1200)
  const del = JSON.parse(await s.evaluate(`JSON.stringify({ path: location.pathname, title: document.querySelector('.d-twopane-main .page-header-title, .d-twopane-main .d-title, .d-twopane-main h1')?.textContent ?? null, active: document.querySelector('.d-twopane-side .is-active')?.textContent ?? null })`))
  check('Recently deleted opens in the right half', del.path === '/settings/deleted' && /Recently deleted/.test(del.title ?? '') && /Recently deleted/.test(del.active ?? ''), JSON.stringify(del))

  // Accent: a click applies it everywhere; the arrows move and apply.
  await open(APP + '/settings/accent')
  await s.until(`!!document.querySelector('.d-accent')`, 30000)
  const titleTop = await s.evaluate(`document.querySelector('.d-pane-title').getBoundingClientRect().top - document.querySelector('.d-twopane-main').getBoundingClientRect().top`)
  await click('.d-accent:nth-child(2)')
  await s.sleep(500)
  const after = JSON.parse(await s.evaluate(`JSON.stringify({ stored: localStorage.getItem('accentColor'), on: document.querySelector('.d-accent.is-on .d-accent-name')?.textContent, checked: document.querySelector('[role=radio][aria-checked=true]')?.textContent?.slice(0, 12), primary: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() })`))
  check('clicking Cosmos applies it', after.stored === '#845EF7' || /cosmos/i.test(after.on ?? ''), JSON.stringify(after))
  await s.shot(`${TAG}-${THEME}-${W}-accent-cosmos.png`)
  await s.evaluate(`document.querySelector('.d-accent.is-on').focus()`)
  await key('ArrowRight', 'ArrowRight')
  await s.sleep(400)
  const arrowed = JSON.parse(await s.evaluate(`JSON.stringify({ on: document.querySelector('.d-accent.is-on .d-accent-name')?.textContent, focus: document.activeElement?.querySelector?.('.d-accent-name')?.textContent })`))
  check('ArrowRight moves to Blush and applies it', /Blush/.test(arrowed.on ?? '') && /Blush/.test(arrowed.focus ?? ''), JSON.stringify(arrowed))
  await key('ArrowLeft', 'ArrowLeft')
  await key('ArrowLeft', 'ArrowLeft')
  await s.sleep(400)
  const back = await s.evaluate(`document.querySelector('.d-accent.is-on .d-accent-name')?.textContent`)
  check('ArrowLeft twice is back on Azure', /Azure/.test(back ?? ''), String(back))
  console.log('accent title offset in pane:', titleTop)

  // Accent colour sits under Preferences: its back link, and Preferences lit.
  const under = JSON.parse(await s.evaluate(`JSON.stringify({ back: document.querySelector('.d-pane-head .d-eyebrow')?.textContent ?? null, lit: document.querySelector('.d-twopane-side .is-active')?.textContent ?? null })`))
  check('Accent colour is under Preferences', /Preferences/.test(under.back ?? '') && /Preferences/.test(under.lit ?? ''), JSON.stringify(under))
  // App lock is in Preferences now; its old address lands there.
  await open(APP + '/settings/app-lock')
  const lock = JSON.parse(await s.evaluate(`JSON.stringify({ path: location.pathname, lock: !!document.querySelector('#app-lock'), items: document.querySelectorAll('.d-twopane-side .d-nav-item').length })`))
  check('App lock opens inside Preferences', lock.path === '/settings/preferences' && lock.lock, JSON.stringify(lock))
  const errs = s.consoleLog.filter(l => l.type === 'error' || l.type === 'exception')
  check('no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)))
} finally {
  await s.close()
  console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}`)
}
