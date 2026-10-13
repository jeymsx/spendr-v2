// Insights' Trend on the computer: one line to start, more lines by their
// chips, the tooltip, the last line kept on, every range, and the settings
// drawer re-cutting the chart behind it.
import { session, APP } from './harness.mjs'
const THEME = process.env.THEME ?? 'light'
const s = await session()
const rect = (sel) => s.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`)
const strokes = () => s.evaluate(`(() => {
  const w = document.querySelector('.d-panel .recharts-wrapper') ?? document.querySelector('.recharts-wrapper')
  if (!w) return null
  return { lines: [...w.querySelectorAll('.recharts-line-curve')].map(e => e.getAttribute('stroke')), areas: w.querySelectorAll('.recharts-area-curve').length,
    bars: [...new Set([...w.querySelectorAll('.recharts-bar-rectangle path')].map(p => p.getAttribute('fill')))],
    dots: w.querySelectorAll('.recharts-line-dots circle, .recharts-area-dots circle').length, ref: w.querySelectorAll('.recharts-reference-line line').length,
    ticks: w.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick').length }
})()`)
const seg = (label) => s.evaluate(`(() => { const b = [...document.querySelectorAll('.d-seg-item')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true })()`)
const on = () => s.evaluate(`[...document.querySelectorAll('.d-panel .d-seg-item[aria-pressed="true"]')].map(b => b.textContent.trim()).filter(x => ['Spent', 'Came in', 'Net'].includes(x))`)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const NEG = 'var(--d-neg)', POS = 'var(--d-pos)', ACC = 'var(--d-accent)'
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await s.send('Page.navigate', { url: APP + '/dev/seed-sample-data.html' })
  await s.until(`document.getElementById('status').textContent.startsWith('Sample data loaded')`, 90000)
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open'); localStorage.setItem('spendr-theme', '${THEME}')`)
  await s.send('Page.navigate', { url: APP + '/insights/trend' })
  await s.until(`document.querySelector('.recharts-wrapper') && !document.querySelector('.d-skel')`, 60000); await s.sleep(1800)

  let st = await strokes()
  s.check('desktop: opens as one line of what was spent', st && same(st.lines, [NEG]) && same(await on(), ['Spent']), JSON.stringify(st) + JSON.stringify(await on()))
  const chart = await rect('.d-panel .recharts-wrapper')
  const stat = await s.evaluate(`(() => { const g = [...document.querySelectorAll('.grid')].find(g => /Average a day/.test(g.textContent) && g.children.length === 3); if (!g) return null; const r = g.getBoundingClientRect(); return { y: r.y, h: r.height } })()`)
  s.check('desktop: the three cards are below the chart', chart && stat && stat.y > chart.y + chart.h, `chart bottom ${chart && Math.round(chart.y + chart.h)}, cards top ${stat && Math.round(stat.y)}`)
  await s.shot('trend-desktop-line.png')

  await seg('Came in'); await s.sleep(1200)
  st = await strokes()
  s.check('desktop: Came in joins it - two lines, both pressed', same(st.lines, [NEG, POS]) && same(await on(), ['Spent', 'Came in']), JSON.stringify(st) + JSON.stringify(await on()))
  await seg('Net'); await s.sleep(1200)
  st = await strokes()
  s.check('desktop: all three at once', same(st.lines, [NEG, POS, ACC]) && (await on()).length === 3, JSON.stringify(st))
  await s.shot('trend-desktop-three.png')
  // tooltip names every line
  const pr = await rect('.d-panel .recharts-wrapper')
  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pr.x + pr.w * 0.2, y: pr.y + pr.h * 0.5 }); await s.sleep(500)
  const tip = await s.evaluate(`document.querySelector('.d-pop')?.textContent ?? null`)
  s.check('desktop: the tooltip lists each line with its figure', tip && /Spent/.test(tip) && /Came in/.test(tip) && /Net/.test(tip), String(tip))
  await seg('Spent'); await seg('Net'); await s.sleep(1200)
  st = await strokes()
  s.check('desktop: turning two off leaves Came in alone', same(st.lines, [POS]) && same(await on(), ['Came in']), JSON.stringify(st) + JSON.stringify(await on()))
  await seg('Came in'); await s.sleep(400)
  s.check('desktop: the last one cannot be turned off', same(await on(), ['Came in']), JSON.stringify(await on()))
  await seg('Net'); await s.sleep(1000)

  for (const r of ['3M', '6M', 'All', '7D']) {
    await seg(r); await s.sleep(1400)
    st = await strokes()
    s.check(`desktop: ${r} keeps Came in + Net, a line each`, same(await on(), ['Came in', 'Net']) && st && st.lines.length === 2, JSON.stringify(st) + JSON.stringify(await on()))
  }
  await seg('3M'); await s.sleep(1200)
  await s.shot('trend-desktop-3m.png')

  // settings drawer
  await s.evaluate(`document.querySelector('button[aria-label="Trend settings"]').click()`); await s.sleep(1500)
  s.check('desktop: the sliders button opens Trend settings in a drawer', (await s.evaluate(`location.pathname`)) === '/insights/trend/settings' && (await s.evaluate(`!!document.querySelector('[role="dialog"], .d-drawer')`)), await s.evaluate(`location.pathname`))
  await s.until(`document.querySelectorAll('.recharts-wrapper').length >= 2`, 10000); await s.sleep(800)
  await s.shot('trend-desktop-drawer.png')
  const clickIn = (text) => s.evaluate(`[...document.querySelectorAll('[role="dialog"] *, .d-drawer *')].filter(e => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(text)}).at(-1)?.closest('button')?.click()`)
  await clickIn('Day'); await s.sleep(1400)
  const behind = await s.evaluate(`(() => { const w = document.querySelectorAll('.recharts-wrapper')[0]; return w.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick').length })()`)
  s.check('desktop: choosing Day in the drawer re-cuts the chart behind it', behind > 60, `${behind} points`)
  await s.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await s.sleep(900)
  s.check('desktop: closing the drawer returns to Trend', (await s.evaluate(`location.pathname`)) === '/insights/trend', await s.evaluate(`location.pathname`))
  s.check('desktop: the chart\'s panel is now titled by day', await s.evaluate(`/Day by day/.test(document.querySelector('.recharts-wrapper')?.closest('.d-panel')?.textContent ?? '')`))
  await s.shot('trend-desktop-daily-3m.png')

  await s.evaluate(`document.querySelector('button[aria-label="Trend settings"]').click()`); await s.sleep(1500)
  await clickIn('Bars'); await s.sleep(1300)
  await clickIn('Auto'); await s.sleep(500)
  await s.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await s.sleep(900)
  st = await strokes()
  s.check('desktop: Bars draws grouped bars for each line', st && st.bars.length === 2 && st.lines.length === 0, JSON.stringify(st))
  await s.shot('trend-desktop-bars.png')

  // cold load of the settings address: Trend drawn under the drawer
  await s.send('Page.navigate', { url: APP + '/insights/trend/settings' })
  await s.until(`document.querySelectorAll('.recharts-wrapper').length >= 1`, 30000); await s.sleep(1500)
  s.check('desktop: a cold /insights/trend/settings has Trend under it', await s.evaluate(`/Trend settings/.test(document.body.textContent) && /Day by day|Week by week|Month by month/.test(document.body.textContent)`))

  const errs = s.consoleLog.filter(l => ['error', 'exception'].includes(l.type) && !/favicon|Failed to load resource|supabase|ERR_/.test(l.text))
  s.check('desktop: nothing logged as an error', errs.length === 0, JSON.stringify(errs.slice(0, 3)))
} catch (e) {
  console.log('SCRIPT ERROR', e.message)
  await s.shot('trend-error-desktop.png').catch(() => {})
} finally { await s.close() }
