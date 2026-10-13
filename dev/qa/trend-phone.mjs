// Insights' Trend on the phone: one red line to start, Income and Net flow
// added and taken off, rapid toggling settling right, every range keeping the
// choice, and the settings page.
import { session, APP } from './harness.mjs'
const THEME = process.env.THEME ?? 'light'
const s = await session({ port: 9985 })
const SERIES = ['Expenses', 'Income', 'Net flow']
const RED = '#ef4444', GREEN = '#22c55e', PRIMARY = 'var(--color-primary)'
const strokes = () => s.evaluate(`(() => {
  const w = document.querySelector('.recharts-wrapper')
  if (!w) return null
  const lines = [...w.querySelectorAll('.recharts-line-curve')].map(e => e.getAttribute('stroke'))
  const areas = [...w.querySelectorAll('.recharts-area-curve')].map(e => e.getAttribute('stroke'))
  const bars = [...new Set([...w.querySelectorAll('.recharts-bar-rectangle path')].map(p => p.getAttribute('fill')))]
  const dots = w.querySelectorAll('.recharts-line-dots circle, .recharts-area-dots circle').length
  const ref = w.querySelectorAll('.recharts-reference-line line').length
  const ticks = w.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick').length
  const first = w.querySelector('.recharts-xAxis .recharts-cartesian-axis-tick text')?.textContent ?? null
  return { lines, areas, bars, dots, ref, ticks, first }
})()`)
const toggle = (label) => s.evaluate(`(() => { const b = [...document.querySelectorAll('button[aria-pressed]')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true })()`)
const pressed = () => s.evaluate(`[...document.querySelectorAll('button[aria-pressed="true"]')].map(b => b.textContent.trim()).filter(x => ${JSON.stringify(SERIES)}.includes(x))`)
const clickSwitch = (label) => s.evaluate(`(() => { const b = [...document.querySelectorAll('[role="switch"]')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(label)}); b?.click(); return !!b })()`)
const meta = () => s.evaluate(`new Promise((res) => { const r = indexedDB.open('SpendrDB'); r.onsuccess = () => { const db = r.result; try { const g = db.transaction('meta').objectStore('meta').get('trendSettings'); g.onsuccess = () => { res(g.result ?? null); db.close() } } catch (e) { res('ERR ' + e.message) } } })`)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
try {
  await s.send('Page.navigate', { url: APP + '/dev/local/seed-sample-data.html' })
  await s.until(`document.getElementById('status').textContent.startsWith('Sample data loaded')`, 90000)
  await s.evaluate(`localStorage.setItem('spendr-theme', '${THEME}'); localStorage.setItem('spendr-view-mode', 'phone')`)

  // ── Phone: the chart ──
  await s.goto(APP + '/insights/trend', 2500)
  await s.until(`document.querySelector('.recharts-wrapper') && !document.querySelector('.skeleton')`, 20000); await s.sleep(1200)
  let st = await strokes()
  s.check('phone: opens as one red line of expenses', st && same(st.lines, [RED]) && st.bars.length === 0, JSON.stringify(st))
  s.check('phone: only Expenses is on', same(await pressed(), ['Expenses']), JSON.stringify(await pressed()))
  await s.shot('trend-phone-line-expenses.png')

  await toggle('Income'); await s.sleep(1300)
  st = await strokes()
  s.check('phone: Income added - two lines, red and green, both on', same(st.lines, [RED, GREEN]) && same(await pressed(), ['Expenses', 'Income']), JSON.stringify(st) + JSON.stringify(await pressed()))
  await s.shot('trend-phone-two-lines.png')
  await toggle('Net flow'); await s.sleep(1300)
  st = await strokes()
  s.check('phone: all three at once', same(st.lines, [RED, GREEN, PRIMARY]) && (await pressed()).length === 3, JSON.stringify(st))
  await s.shot('trend-phone-three-lines.png')
  await toggle('Expenses'); await toggle('Net flow'); await s.sleep(1300)
  st = await strokes()
  s.check('phone: turning lines off leaves the ones still on, and no red', same(st.lines, [GREEN]) && same(await pressed(), ['Income']), JSON.stringify(st))
  await toggle('Income'); await s.sleep(500)
  s.check('phone: the last line cannot be turned off', same(await pressed(), ['Income']), JSON.stringify(await pressed()))

  // rapid toggling, then settle
  for (const l of ['Expenses', 'Net flow', 'Expenses', 'Income', 'Net flow', 'Expenses']) { await toggle(l); await s.sleep(60) }
  await s.sleep(1500)
  const now = await pressed()
  st = await strokes()
  const want = { Expenses: RED, Income: GREEN, 'Net flow': PRIMARY }
  s.check('phone: rapid toggling ends with exactly the lines that are on, none stale', same(st.lines, SERIES.filter(l => now.includes(l)).map(l => want[l])), `${JSON.stringify(now)} ${JSON.stringify(st.lines)}`)

  // every range has the toggle and keeps the choice: Income + Net flow
  for (const l of ['Income', 'Net flow']) if (!(await pressed()).includes(l)) await toggle(l)
  if ((await pressed()).includes('Expenses')) await toggle('Expenses')
  await s.sleep(800)
  const keep = await pressed()
  s.check('phone: set up Income + Net flow', same(keep, ['Income', 'Net flow']), JSON.stringify(keep))
  for (const r of ['3M', '6M', 'All', '7D', '1M']) {
    await s.clickText(r); await s.sleep(1500)
    const has = await s.evaluate(`[...document.querySelectorAll('button[aria-pressed]')].filter(b => ${JSON.stringify(SERIES)}.includes(b.textContent.trim())).length`)
    st = await strokes()
    s.check(`phone: ${r} has the toggle, keeps ${keep.join(' + ')}, one line each`, has === 3 && same(await pressed(), keep) && st && st.lines.length === keep.length, `${has} chips, ${JSON.stringify(await pressed())}, ${JSON.stringify(st)}`)
    if (r === '3M') await s.shot('trend-phone-3m-multi.png')
  }

  // ── Settings page ──
  await s.clickText('3M'); await s.sleep(1200)
  await s.evaluate(`document.querySelector('button[aria-label="Trend settings"]').click()`); await s.sleep(1500)
  s.check('phone: the sliders button opens Trend settings', (await s.evaluate(`location.pathname`)) === '/insights/trend/settings', await s.evaluate(`location.pathname`))
  await s.until(`document.querySelector('.recharts-wrapper')`, 15000); await s.sleep(1000)
  await s.shot('trend-phone-settings.png')
  const sws = await s.evaluate(`[...document.querySelectorAll('[role="switch"]')].map(b => b.getAttribute('aria-label'))`)
  s.check('phone: a switch for each line, then curved, dots, average', same(sws, ['Expenses', 'Income', 'Net flow', 'Curved line', 'Dots', 'Average']), JSON.stringify(sws))
  const onNow = await s.evaluate(`[...document.querySelectorAll('[role="switch"]')].slice(0, 3).map(b => b.getAttribute('aria-checked'))`)
  s.check('phone: settings still hold the default (expenses) - the toggle on the chart is only for now', same(onNow, ['true', 'false', 'false']), JSON.stringify(onNow))
  const lastOn = await s.evaluate(`(() => { const b = document.querySelector('[role="switch"][aria-label="Expenses"]'); return b.disabled || b.getAttribute('aria-disabled') === 'true' })()`)
  s.check('phone: the only line on cannot be switched off', lastOn === true, String(lastOn))
  await clickSwitch('Income'); await s.sleep(1300)
  st = await strokes()
  s.check('phone: switching Income on adds its line to the preview', same(st.lines, [RED, GREEN]), JSON.stringify(st))

  // grain, on 3M
  s.check('phone: auto on 3M is by month', st.ticks === 3, `${st.ticks} points, first ${st.first}`)
  await s.clickText('Day'); await s.sleep(1300)
  st = await strokes()
  s.check('phone: Day on 3M has a point for every day', st.ticks > 60, `${st.ticks} points, first ${st.first}`)
  await s.shot('trend-phone-3m-daily.png')
  await s.clickText('Week'); await s.sleep(1300)
  st = await strokes()
  s.check('phone: Week on 3M has about thirteen', st.ticks >= 10 && st.ticks <= 16, `${st.ticks} points, first ${st.first}`)
  await s.shot('trend-phone-3m-weekly.png')
  await s.clickText('Month'); await s.sleep(1300)
  st = await strokes()
  s.check('phone: Month on 3M has three', st.ticks === 3, `${st.ticks} points`)
  await s.clickText('Auto'); await s.sleep(500)

  await s.clickText('Area'); await s.sleep(1200)
  st = await strokes()
  s.check('phone: Area draws a filled line for each', st.areas.length === 2, JSON.stringify(st))
  await s.clickText('Bars'); await s.sleep(1200)
  st = await strokes()
  s.check('phone: Bars draws bars for each line', st.bars.length === 2 && st.lines.length === 0, JSON.stringify(st))
  await s.shot('trend-phone-settings-bars.png')
  const rowsBars = await s.evaluate(`[...document.querySelectorAll('[role="switch"]')].map(b => b.getAttribute('aria-label'))`)
  s.check('phone: with bars, curved and dots are not offered', !rowsBars.includes('Curved line') && !rowsBars.includes('Dots') && rowsBars.includes('Average'), JSON.stringify(rowsBars))
  await s.clickText('Line'); await s.sleep(1000)
  await clickSwitch('Dots'); await s.sleep(500)
  await clickSwitch('Average'); await s.sleep(1200)
  st = await strokes()
  s.check('phone: Dots and Average show in the preview', st.dots >= 6 && st.ref >= 2, JSON.stringify(st))
  const saved = await meta()
  const v = saved?.value
  s.check('phone: everything saved to meta as it was changed', v && same(v.series, ['expenses', 'income']) && v.chart === 'line' && v.points === true && v.average === true && v.grain === 'auto' && !!saved.updatedAt, JSON.stringify(saved))
  await s.shot('trend-phone-settings-line.png')

  // back to the Trend page (a fresh visit): opens on the saved lines and style
  await s.goto(APP + '/insights/trend', 2500)
  await s.until(`document.querySelector('.recharts-wrapper') && !document.querySelector('.skeleton')`, 20000); await s.sleep(1200)
  st = await strokes()
  s.check('phone: Trend opens on the saved lines, with dots and average', same(await pressed(), ['Expenses', 'Income']) && same(st.lines, [RED, GREEN]) && st.dots > 3, `${JSON.stringify(await pressed())} ${JSON.stringify(st)}`)
  await s.shot('trend-phone-saved.png')

  // grain Week, on 1M
  await s.evaluate(`document.querySelector('button[aria-label="Trend settings"]').click()`); await s.sleep(1500)
  await s.clickText('Week'); await s.sleep(800)
  await s.evaluate(`history.back()`); await s.sleep(1500)
  await s.until(`document.querySelector('.recharts-wrapper') && !document.querySelector('.skeleton')`, 20000); await s.sleep(800)
  await s.clickText('1M'); await s.sleep(1500)
  st = await strokes()
  s.check('phone: Week on 1M is five weeks', st.ticks >= 4 && st.ticks <= 5, `${st.ticks} points, first ${st.first}`)
  await s.clickText('7D'); await s.sleep(1500)
  st = await strokes()
  s.check('phone: 7D is always by day, whatever the setting', st.ticks === 7, `${st.ticks} points`)
  await s.shot('trend-phone-7d.png')

  // the series in the address still wins over the saved ones
  await s.goto(APP + '/insights/trend?type=income', 2500)
  await s.until(`document.querySelector('.recharts-wrapper') && !document.querySelector('.skeleton')`, 20000); await s.sleep(800)
  s.check('phone: ?type=income opens on Income alone', same(await pressed(), ['Income']), JSON.stringify(await pressed()))

  // an old single-name setting still reads
  await s.evaluate(`new Promise((res) => { const r = indexedDB.open('SpendrDB'); r.onsuccess = () => { const db = r.result; const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ key: 'trendSettings', value: { chart: 'area', series: 'netflow', smooth: true, points: false, average: false }, updatedAt: new Date().toISOString() }); tx.oncomplete = () => { db.close(); res(true) } } })`)
  await s.goto(APP + '/insights/trend', 2500)
  await s.until(`document.querySelector('.recharts-wrapper') && !document.querySelector('.skeleton')`, 20000); await s.sleep(1000)
  st = await strokes()
  s.check('phone: a setting stored by the first version (one name, no grain) still opens', same(await pressed(), ['Net flow']) && st.areas.length === 1, JSON.stringify(await pressed()) + JSON.stringify(st))

  const errs = s.consoleLog.filter(l => ['error', 'exception'].includes(l.type) && !/favicon|Failed to load resource|supabase|ERR_/.test(l.text))
  s.check('phone: nothing logged as an error', errs.length === 0, JSON.stringify(errs.slice(0, 3)))
} catch (e) {
  console.log('SCRIPT ERROR', e.message)
  await s.shot('trend-error.png').catch(() => {})
} finally { await s.close() }
