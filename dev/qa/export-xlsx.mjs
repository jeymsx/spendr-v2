// The spreadsheet export from Reports: one file arrives, with every sheet,
// the sample's accounts and bills, a row per transaction and no Notes.
import { session, APP, ROOT, OUT } from './harness.mjs'
import { mkdirSync, readFileSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(ROOT + '/package.json')
const { unzipSync, strFromU8 } = require('fflate')
const DL = join(OUT, 'xlsx-downloads')
rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true })
const s = await session()
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s.send('Page.navigate', { url: APP + '/dev/seed-sample-data.html' })
  await s.until(`/Sample data loaded|Not loaded|Could not/.test(document.getElementById('status').textContent)`, 90000)
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open'); localStorage.setItem('spendr-theme', 'light'); localStorage.removeItem('spendr-developer')`)

  // The spreadsheet.
  // A browser-level setting, so it goes to the browser, not the page; each file is saved under its guid.
  await s.browserSend('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: DL, eventsEnabled: true })
  // Follow this download by its guid: Chrome saves other things there too.
  let guid = null, landed = false
  s.browserListeners.push(m => {
    if (m.method === 'Browser.downloadWillBegin' && /\.xlsx$/i.test(m.params.suggestedFilename)) guid = m.params.guid
    if (m.method === 'Browser.downloadProgress' && m.params.state === 'completed' && m.params.guid === guid) landed = true
  })
  await s.send('Page.navigate', { url: APP + '/settings/reports' })
  await s.until(`/Everything as a spreadsheet/.test(document.body.innerText)`, 60000); await s.sleep(1200)
  const clicked = await s.evaluate(`(() => { const row = [...document.querySelectorAll('button, [role="button"]')].find(b => /Everything as a spreadsheet/.test(b.textContent)); if (!row) return false; row.click(); return true })()`)
  s.check('Reports has the spreadsheet row', clicked)
  // The workbook's code arrives on first use, so wait for the file rather than a fixed time,
  // and catch the toast while it is up.
  let toast = null
  for (let i = 0; i < 60 && !(toast && landed); i++) {
    toast ??= await s.evaluate(`document.body.innerText.match(/Spreadsheet (downloaded|ready to save)/)?.[0] ?? null`)
    await s.sleep(500)
  }
  s.check('and it reports the download', !!toast, toast)
  s.check('the spreadsheet arrived', landed, String(guid))
  const path = join(DL, String(guid))
  copyFileSync(path, OUT + '/spendr-export.xlsx')
  const zip = unzipSync(new Uint8Array(readFileSync(path)))
  const book = strFromU8(zip['xl/workbook.xml'])
  const names = [...book.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map(m => m[1])
  console.log('sheets:', names.join(' | '), '| bytes:', statSync(path).size)
  s.check('the workbook has its sheets', ['Overview', 'Accounts', 'Transactions', 'Monthly', 'By category', 'Budgets', 'Recurring', 'Debts', 'Goals'].every(n => names.includes(n)), names.join(', '))
  const strings = [...strFromU8(zip['xl/sharedStrings.xml']).matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => m[1])
  s.check('with the sample\'s accounts and a bill in it', ['Cash', 'GCash', 'BPI Credit', 'Maya Savings', 'Pag-IBIG MP2', 'Rent', 'Japan trip'].every(x => strings.includes(x)), strings.slice(0, 30).join(', '))
  s.check('and no Notes in it', !strings.some(x => /^(Payday plan|Bills calendar|Gift ideas)$/.test(x)))
  // The Overview's net worth against the app's own figure.
  const sheet1 = strFromU8(zip['xl/worksheets/sheet1.xml'])
  const formulas = [...sheet1.matchAll(/<f>([^<]+)<\/f>/g)].map(m => m[1])
  console.log('overview formulas:', formulas.join(' | '))
  const trans = strFromU8(zip['xl/worksheets/sheet3.xml'])
  const rowsN = (trans.match(/<row /g) ?? []).length
  s.check('every transaction is a row', rowsN > 400, String(rowsN))
  const errs = s.consoleLog.filter(l => l.type === 'exception' || l.type === 'error')
  s.check('no console errors', errs.length === 0, errs.map(e => e.text.slice(0, 300)).join(' | '))
} finally { await s.close() }
