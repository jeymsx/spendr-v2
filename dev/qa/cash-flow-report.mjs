// Insights' cash flow on the computer, by mouse and keyboard: hovering a band
// names it and dims the rest, pressing one lists its transactions, Escape and
// Enter work, grouping by account, and saving the picture.
import { session, APP, OUT } from './harness.mjs'
import { mkdirSync, readdirSync, statSync } from 'node:fs'
const DL = OUT + '/downloads'
mkdirSync(DL, { recursive: true })
const s = await session()
const move = (x, y) => s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
const press = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await s.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }) }
const rect = (sel) => s.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`)
const key = async (k, code = k, vk = 27, text) => {
  await s.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) })
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk })
}
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await s.send('Page.navigate', { url: APP + '/dev/seed-sample-data.html' })
  await s.until(`document.getElementById('status').textContent.startsWith('Sample data loaded')`, 90000)
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open'); localStorage.setItem('spendr-theme', '${process.env.THEME ?? 'light'}')`)
  await s.send('Page.navigate', { url: APP + '/insights' })
  await s.until(`document.querySelector('.d-sankey svg') && !document.querySelector('.d-skel')`, 60000); await s.sleep(1500)
  await s.evaluate(`[...document.querySelectorAll('.d-seg-item')].find(b => b.textContent.trim() === '3M')?.click()`); await s.sleep(1200)
  await s.shot('cf-rest.png')
  const readout0 = await s.evaluate(`document.querySelector('.d-flow-readout').textContent`)
  s.check('names nothing until the mouse is on it, and says what to do', /Click a band/.test(readout0), readout0)

  const bar = await rect('.d-sankey g[role="button"][aria-label^="Rent"] .d-sankey-bar')
  await move(bar.x + 4, bar.y + bar.h / 2); await s.sleep(400)
  const readout1 = await s.evaluate(`document.querySelector('.d-flow-readout').textContent`)
  s.check('hovering Rent names it, with share and transactions', /Rent/.test(readout1) && /% of money out/.test(readout1) && /transaction/.test(readout1), readout1)
  const dimmed = await s.evaluate(`[...document.querySelectorAll('.d-sankey g[role="button"]')].filter(g => g.getAttribute('opacity') === '0.25').length`)
  s.check('and picks its path out, dimming the rest', dimmed >= 3, `${dimmed} dimmed`)

  await press(bar.x + 4, bar.y + bar.h / 2); await s.sleep(600)
  const pop = await s.evaluate(`(() => { const p = document.querySelector('.d-flow-pop'); if (!p) return null; const rows = [...p.querySelectorAll('.d-flow-row')]; const amounts = rows.map(r => parseFloat(r.lastElementChild.textContent.replace(/[^0-9.]/g, ''))); const b = p.getBoundingClientRect(); return { head: p.querySelector('.d-flow-head').textContent, rows: rows.length, sorted: amounts.every((a, i) => i === 0 || amounts[i - 1] >= a), inView: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight } })()`)
  s.check('pressing it opens its transactions, biggest first, on screen', pop && pop.rows > 0 && pop.sorted && pop.inView, JSON.stringify(pop))
  await s.shot('cf-popover.png')

  await s.evaluate(`document.querySelector('.d-flow-row').click()`); await s.sleep(900)
  const afterRow = await s.evaluate(`({ pop: !!document.querySelector('.d-flow-pop'), sheet: !!document.querySelector('.sheet-panel') })`)
  s.check('a row opens that transaction and closes the panel', !afterRow.pop && afterRow.sheet, JSON.stringify(afterRow))
  await key('Escape'); await s.sleep(700)

  const band = await s.evaluate(`(() => { const p = [...document.querySelectorAll('.d-sankey path.d-sankey-hit')][1]; const r = p.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  await move(band.x, band.y); await s.sleep(300)
  await press(band.x, band.y); await s.sleep(600)
  s.check('pressing a band opens its panel too', await s.evaluate(`!!document.querySelector('.d-flow-pop')`))
  await key('Escape'); await s.sleep(400)
  s.check('Escape closes it', await s.evaluate(`!document.querySelector('.d-flow-pop')`))

  const mid = await rect('.d-sankey g[role="button"][aria-label^="Money in"] .d-sankey-bar')
  await press(mid.x + 4, mid.y + mid.h / 2); await s.sleep(600)
  const sum = await s.evaluate(`document.querySelector('.d-flow-pop')?.textContent ?? null`)
  s.check('the middle node gives the period in short', /in short/.test(sum ?? '') && /Came in/.test(sum) && /Went out/.test(sum), sum)
  await s.shot('cf-summary.png')
  await key('Escape'); await s.sleep(300)

  await s.evaluate(`document.querySelector('.d-sankey g[role="button"][aria-label^="Rent"]').focus()`); await s.sleep(200)
  await key('Enter', 'Enter', 13, '\r'); await s.sleep(500)
  s.check('Enter on a focused node opens it', await s.evaluate(`!!document.querySelector('.d-flow-pop')`))
  await key('Escape'); await s.sleep(300)

  await s.evaluate(`[...document.querySelectorAll('.d-seg-item')].find(b => b.textContent.trim() === 'Accounts')?.click()`); await s.sleep(700)
  const accts = await s.evaluate(`[...document.querySelectorAll('.d-sankey g[role="button"]')].map(g => g.getAttribute('aria-label').split(':')[0])`)
  s.check('grouping by account lists accounts on the right', accts.includes('Cash') && accts.includes('BPI'), accts.join(', '))
  await s.shot('cf-accounts.png')
  await s.evaluate(`[...document.querySelectorAll('.d-seg-item')].find(b => b.textContent.trim() === 'Categories')?.click()`); await s.sleep(500)

  await s.browserSend('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: DL, eventsEnabled: true }).catch(e => console.log('download behaviour:', e.message))
  const btn = await rect('button[aria-label="Save as a picture"]')
  await press(btn.x + btn.w / 2, btn.y + btn.h / 2); await s.sleep(3500)
  const toast = await s.evaluate(`document.body.innerText.match(/Saved spendr-cash-flow[^\\n]*/)?.[0] ?? null`)
  s.check('the camera reports a saved picture', !!toast, toast)
  const files = readdirSync(DL).map(f => [f, statSync(DL + '\\' + f).size])
  console.log('downloads:', JSON.stringify(files))

  const errs = s.consoleLog.filter(l => l.type === 'exception' || l.type === 'error')
  s.check('no console errors', errs.length === 0, errs.map(e => e.text.slice(0, 200)).join(' | '))
} finally { await s.close() }
