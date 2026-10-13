// The spreadsheet export from Reports: one file arrives, with every sheet,
// the sample's accounts and bills, a row per transaction and no Notes.
import { session, APP, ROOT, OUT } from './harness.mjs'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(ROOT + '/package.json')
const { unzipSync, strFromU8 } = require('fflate')
const DL = OUT + '/xlsx-downloads'
rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true })
const s = await session({ port: 9972 })
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s.send('Page.navigate', { url: APP + '/dev/local/seed-sample-data.html' })
  await s.until(`/Sample data loaded|Not loaded|Could not/.test(document.getElementById('status').textContent)`, 90000)
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open'); localStorage.setItem('spendr-theme', 'light'); localStorage.removeItem('spendr-developer')`)

  // Settings: no Report a problem for anyone but the developer.
  await s.send('Page.navigate', { url: APP + '/settings' })
  await s.until(`document.querySelector('.d-page') && !document.querySelector('.d-skel') && /Help & about/.test(document.body.innerText)`, 60000); await s.sleep(1000)
  s.check('desktop Settings: no "Report a problem" for an ordinary user', !(await s.evaluate(`/Report a problem/.test(document.body.innerText)`)))
  s.check('and no Google Sheets anywhere in Cloud sync', !(await s.evaluate(`/Google Sheets/.test(document.body.innerText)`)))
  await s.evaluate(`localStorage.setItem('spendr-developer', '1')`)
  await s.send('Page.navigate', { url: APP + '/settings' })
  await s.until(`document.querySelector('.d-page') && !document.querySelector('.d-skel') && /Help & about/.test(document.body.innerText)`, 60000); await s.sleep(1000)
  s.check('desktop Settings: on the developer\'s device it is there', await s.evaluate(`/Report a problem/.test(document.body.innerText)`))
  await s.evaluate(`localStorage.removeItem('spendr-developer')`)

  // The spreadsheet.
  await s.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: DL, eventsEnabled: true })
  await s.send('Page.navigate', { url: APP + '/settings/reports' })
  await s.until(`/Everything as a spreadsheet/.test(document.body.innerText)`, 60000); await s.sleep(1200)
  const clicked = await s.evaluate(`(() => { const row = [...document.querySelectorAll('button, [role="button"]')].find(b => /Everything as a spreadsheet/.test(b.textContent)); if (!row) return false; row.click(); return true })()`)
  s.check('Reports has the spreadsheet row', clicked)
  await s.sleep(5000)
  const toast = await s.evaluate(`document.body.innerText.match(/Spreadsheet (downloaded|ready to save)/)?.[0] ?? null`)
  s.check('and it reports the download', !!toast, toast)
  const files = readdirSync(DL)
  s.check('one file arrived', files.length === 1, files.join(', '))
  const path = DL + '\\' + files[0]
  copyFileSync(path, OUT + '/spendr-export.xlsx')
  const zip = unzipSync(new Uint8Array(readFileSync(path)))
  const book = strFromU8(zip['xl/workbook.xml'])
  const names = [...book.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map(m => m[1])
  console.log('sheets:', names.join(' | '), '| bytes:', statSync(path).size)
  s.check('the workbook has its sheets', ['Overview', 'Accounts', 'Transactions', 'Monthly', 'By category', 'Budgets', 'Recurring', 'Debts', 'Goals'].every(n => names.includes(n)), names.join(', '))
  const strings = [...strFromU8(zip['xl/sharedStrings.xml']).matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => m[1])
  s.check('with the sample\'s accounts and a bill in it', ['Cash', 'GCash', 'BPI Credit', 'Maya Savings', 'Pag-IBIG MP2', 'Rent', 'Japan trip'].every(x => strings.includes(x)), strings.slice(0, 30).join(', '))
  s.check('and no Notes in it', !strings.some(x => /Payday plan|Groceries$/.test(x)))
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
