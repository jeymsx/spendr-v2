/**
 * The website's screens, captured from the real app with the demo ledger.
 *
 *   1. Run the app from the repo root:          npm run dev -- --port 5195
 *   2. Once, in site/:                          npm i --no-save playwright
 *   3. In site/:                                node scripts/capture.mjs [dark|light|both] [name,name]
 *
 * It needs Google Chrome installed. The ledger (scripts/demo-ledger.json) is
 * a dump of Mika's demo data - IndexedDB tables and localStorage - and is
 * loaded into a fresh profile, so nothing of yours is read or changed.
 *
 * Phones are an iPhone 15 Pro, 393 x 852 at 3x, with the phone's real safe
 * areas emulated: every page pads for the island and the home indicator as
 * it does on the phone, and Phone.astro draws the status bar into that space.
 * The desktop is 1440 x 900 at 2x. Output is WebP in src/assets/screens.
 */
import { chromium } from 'playwright'
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [WHICH = 'both', ONLY = ''] = process.argv.slice(2)
const BASE = process.env.APP_BASE ?? 'http://localhost:5195'
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = fileURLToPath(new URL('../src/assets/screens/', import.meta.url))
const dump = readFileSync(new URL('./demo-ledger.json', import.meta.url), 'utf8')
const only = new Set(ONLY.split(',').filter(Boolean))
const want = name => only.size === 0 || only.has(name)
const errors = new Set()

const browser = await chromium.launch({ executablePath: CHROME })

async function open(theme, desktop = false) {
  const ctx = await browser.newContext(desktop
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: theme }
    : { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: theme })
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.add(`pageerror: ${e.message}`))
  if (!desktop) {
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } })
  }
  // Seed on a same-origin page that is not the app, so nothing reads the
  // ledger before it is all in place.
  await page.goto(BASE + '/favicon.png')
  await page.evaluate(async ([json, theme]) => {
    const data = JSON.parse(json)
    const fromB64 = (s, type) => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Blob([u], { type }) }
    const dec = v => {
      if (Array.isArray(v)) return v.map(dec)
      if (v && typeof v === 'object') {
        if (v.__t === 'date') return new Date(v.v)
        if (v.__t === 'blob') return fromB64(v.v, v.type)
        const o = {}; for (const [k, x] of Object.entries(v)) o[k] = dec(x); return o
      }
      return v
    }
    localStorage.clear()
    for (const [k, v] of Object.entries(data.ls)) localStorage.setItem(k, v)
    localStorage.setItem('spendr-theme', theme)
    const { default: db } = await import('/src/db/db.js')
    await db.open()
    for (const t of db.tables) {
      await t.clear()
      const rows = (data.tables[t.name] ?? []).map(dec)
      if (rows.length) await t.bulkPut(rows)
    }
    // This version's What's New has been read, whatever the dump saw.
    const { APP_VERSION } = await import('/src/lib/release.js')
    await db.meta.put({ key: 'whatsNewSeen', value: APP_VERSION })
    db.close()
  }, [dump, theme])
  return { ctx, page }
}

const wait = (page, ms) => page.waitForTimeout(ms)
async function settle(page, extra = 1600) {
  await page.waitForFunction(() => document.querySelector('h1, main') && !document.querySelector('.skeleton, .animate-spin'), null, { timeout: 20000 })
  await wait(page, extra)
  await page.evaluate(() => document.querySelector('#app-main')?.scrollTo(0, 0))
  await wait(page, 250)
}
async function save(page, name, theme) {
  const png = await page.screenshot()
  await sharp(png).webp({ quality: 92, effort: 6 }).toFile(`${OUT}${name}-${theme}.webp`)
  console.log('saved', `${name}-${theme}.webp`)
}
async function showBalance(page) {
  const b = page.locator('button[aria-label="Show balance"]')
  if (await b.count()) { await b.first().click(); await wait(page, 1200) }
}
async function quickLog(page, phrase) {
  await page.goto(BASE + '/')
  await settle(page, 1200)
  await page.locator('button[aria-label="Add transaction. Hold to quick log."]').hover()
  await page.mouse.down(); await wait(page, 900); await page.mouse.up(); await wait(page, 900)
  await page.keyboard.type(phrase, { delay: 50 })
  await wait(page, 1400)
  await page.keyboard.press('Enter')
  await wait(page, 600)
  await settle(page, 1400)
  await page.evaluate(() => document.activeElement?.blur?.())
  await wait(page, 300)
}

const PAGES = [
  ['home', '/', showBalance], ['transactions', '/transactions'], ['accounts', '/accounts'], ['card', '/accounts/9'],
  ['budget', '/budget'], ['recurring', '/recurring'], ['debts', '/debts'], ['goals', '/goals'],
  ['insights', '/insights', null, 2400], ['networth', '/insights/net-worth', null, 2400],
  ['forecast', '/insights/forecast', null, 2400], ['achievements', '/achievements?tab=badges', null, 2000],
]
const SLIDES = ['intro', 'receipt', 'kept', 'top', 'busiest', 'biggest', 'goto', 'budgets', 'networth', 'badges', 'personality', 'summary']

for (const theme of WHICH === 'both' ? ['dark', 'light'] : [WHICH]) {
  const { ctx, page } = await open(theme)
  for (const [name, path, act, extra] of PAGES) {
    if (!want(name)) continue
    await page.goto(BASE + path)
    await settle(page, extra ?? 1600)
    if (act) await act(page)
    await save(page, name, theme)
  }
  if (want('expense')) {
    await page.goto(BASE + '/expense')
    await settle(page, 1200)
    await page.locator('input[aria-label="Amount"]').click()
    await page.keyboard.type('185')
    await page.locator('input[placeholder="Optional"]').fill('Starbucks, venti latte')
    await page.getByRole('radio', { name: 'Coffee' }).click()
    await page.getByRole('button', { name: 'Select account' }).click()
    await wait(page, 900)
    await page.getByRole('button', { name: /^GCash E-wallet/ }).click()
    await wait(page, 900)
    await page.evaluate(() => { document.activeElement?.blur?.(); document.querySelector('#app-main')?.scrollTo(0, 0) })
    await wait(page, 400)
    await save(page, 'expense', theme)
  }
  for (const [name, phrase] of [['ql-expense-form', '185 starbucks'], ['ql-transfer-form', '1000 from gcash to bpi savings']]) {
    if (!want(name)) continue
    await quickLog(page, phrase)
    await save(page, name, theme)
  }
  // Wrapped is the same in both themes, so it is captured once.
  if (theme === 'dark' && want('wrapped')) {
    await page.goto(BASE + '/recap/2026-08')
    await page.waitForSelector('button[aria-label="Pause recap"]', { timeout: 20000 })
    await page.locator('button[aria-label="Pause recap"]').click()
    await wait(page, 300)
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowLeft'); await wait(page, 300) }
    for (let i = 0; i < SLIDES.length; i++) {
      await wait(page, 2600)
      await save(page, `wrapped-${SLIDES[i]}`, 'dark')
      if (i < SLIDES.length - 1) await page.keyboard.press('ArrowRight')
    }
  }
  await ctx.close()

  if (want('desktop')) {
    const d = await open(theme, true)
    await d.page.goto(BASE + '/')
    await settle(d.page, 2000)
    await showBalance(d.page)
    await save(d.page, 'desktop', theme)
    await d.page.goto(BASE + '/insights')
    await settle(d.page, 2600)
    await save(d.page, 'desktop-insights', theme)
    await d.ctx.close()
  }
}

await browser.close()
if (errors.size) console.log('page errors:\n' + [...errors].join('\n'))
