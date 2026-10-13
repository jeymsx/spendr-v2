// The wishlist: Home's disc, the empty page, a wish added on its own page
// (a shop's share text pasted into Link fills the name and price, and the
// wait follows the price), a wait changed afterwards, Skip / Undo, Buy through
// Add expense, Save up into a goal, Delete / Undo - on the phone; then the
// computer's page and its drawer.
import { session, sleep, APP } from './harness.mjs'

const fake = JSON.stringify({ access_token: 'tokA', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refreshA', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: { full_name: 'Test User' }, created_at: '2026-01-01T00:00:00Z' } })
const tag = Date.now().toString(36).slice(-4)
const wishes = (s) => s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); return (await db.wishes.toArray()).map(w => ({ id: w.id, name: w.name, price: w.price, status: w.status, coolUntil: w.coolUntil, link: w.link, txId: w.txId, goalName: w.goalName })) })()`)
const text = (s) => s.evaluate('document.body.innerText')
const clickBtn = (s, label) => s.evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && b.textContent.trim() === ${JSON.stringify(label)}).at(-1)
  b?.scrollIntoView({ block: 'center' }); b?.click(); return !!b })()`)
const typeIn = (s, selector, value) => s.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false
  el.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return key(d) }
const path = (s) => s.evaluate('location.pathname')
const rowButton = (s, name, label) => s.evaluate(`(() => {
  const row = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(name)}))?.parentElement
  const b = [...(row?.querySelectorAll('button') ?? [])].find(b => b.textContent.trim() === ${JSON.stringify(label)}); b?.click(); return !!b })()`)

const s = await session()
await s.send('Emulation.setFocusEmulationEnabled', { enabled: true })
await s.send('Page.navigate', { url: APP + '/dev/seed-sample-data.html' })
await s.until(`document.getElementById('status')?.textContent.startsWith('Sample data loaded')`, 90000)
await s.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(fake)}); localStorage.setItem('spendr-view-mode', 'phone'); localStorage.setItem('spendr-theme', 'light')`)
await s.goto(APP + '/', 5000)
// This device's sample ledger goes up as the account's: the first-sync question, answered.
if (await s.until(`[...document.querySelectorAll('button')].some(b => /Move them to my account|Keep both/.test(b.textContent))`, 6000)) {
  await s.evaluate(`[...document.querySelectorAll('button')].find(b => /Move them to my account|Keep both/.test(b.textContent)).click()`)
  await sleep(5000)
  await s.evaluate(`[...document.querySelectorAll('button')].find(b => /Back to Home/.test(b.textContent))?.click()`)
}
await s.until(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Got it')`, 8000)
await clickBtn(s, 'Got it'); await sleep(900)
await s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); await db.wishes.clear() })()`)
await sleep(600)

let t = await text(s)
s.check('Home: Wishlist sits between Recurring and Challenges', /Goals\s+Debts\s+(\d+\s+)?Recurring\s+(\d+\s+)?Wishlist\s+(\d+\s+)?Challenges/.test(t), (t.match(/Goals[\s\S]{0,80}Challenges/) ?? [''])[0].replace(/\s+/g, ' '))
await s.shot('wish-home.png')
await s.evaluate(`document.querySelector('a[href="/wishlist"]')?.click()`)
await sleep(1500)
t = await text(s)
s.check('the empty page explains itself', /Nothing on your wishlist/.test(t))
await s.shot('wish-empty.png')

// ── A new wish, from a shop's share text ──
await s.evaluate(`document.querySelector('button[aria-label="New wish"]')?.click()`)
await sleep(1200)
s.check('New wish opens its own page', await path(s) === '/wishlist/new', await path(s))
await s.shot('wish-form-empty.png')
await typeIn(s, '#wish-link', `Check out Apple AirPods Pro ${tag} for ₱8,990. Get it on Shopee now! https://shp.ee/abc${tag}`)
await sleep(500)
const filled = await s.evaluate(`({ name: document.querySelector('#wish-name').value, link: document.querySelector('#wish-link').value, price: document.querySelector('input[aria-label="Price"]')?.value ?? '', until: document.querySelector('#wish-until')?.value ?? '', toggles: document.querySelectorAll('[role=radio]').length, words: document.body.innerText })`)
s.check('pasting share text fills the name', filled.name === `Apple AirPods Pro ${tag}`, filled.name)
s.check('and the price', /8,990/.test(filled.price), filled.price)
s.check('and keeps only the address in Link', filled.link === `https://shp.ee/abc${tag}`, filled.link)
s.check('a ₱8,990 wish asks a week from today, set by the price, with no day toggles', /Set by the price/.test(filled.words) && filled.until === inDays(7) && filled.toggles === 0, `${filled.until} toggles ${filled.toggles}`)
await s.shot('wish-form-filled.png')
await clickBtn(s, 'Add to wishlist'); await sleep(1400)
let rows = await wishes(s)
const added = rows.find(r => r.name === `Apple AirPods Pro ${tag}`)
s.check('saved, waiting a week, with its link', added && added.price === 8990 && added.status === 'waiting' && added.coolUntil === inDays(7) && added.link === `https://shp.ee/abc${tag}`, JSON.stringify(added))
s.check('and back on the list', await path(s) === '/wishlist', await path(s))
t = await text(s)
s.check('under Cooling off, asking in 7 days', /Cooling off/.test(t) && /Asks in 7 days/.test(t))

// ── Its wait changed afterwards ──
await s.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Apple AirPods Pro ${tag}'))?.click()`)
await sleep(1000)
const sheet = await s.evaluate(`(() => { const d = [...document.querySelectorAll('[role=dialog]')].at(-1); return { text: d?.innerText ?? '', buttons: [...(d?.querySelectorAll('button') ?? [])].map(b => b.textContent.trim()).filter(Boolean) } })()`)
s.check('a wish opens its details first, with Edit and Buy', sheet.buttons.includes('Edit') && sheet.buttons.includes('Buy') && /Cooling off/.test(sheet.text) && /shp\.ee/.test(sheet.text), JSON.stringify(sheet).slice(0, 300))
s.check('and no "Asks in" or "Parked" lines under its dates', !/Asks (in|tomorrow|today)|Parked/.test(sheet.text), sheet.text.replace(/\s+/g, ' ').slice(0, 200))
await s.shot('wish-detail.png')
await clickBtn(s, 'Edit'); await sleep(1300)
s.check('Edit opens its own page', /^\/wishlist\/\d+$/.test(await path(s)), await path(s))
await s.evaluate(`(() => { const el = document.querySelector('#wish-until'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '${inDays(1)}'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })()`)
await sleep(300)
await s.shot('wish-form-edit.png')
await clickBtn(s, 'Save changes'); await sleep(1300)
rows = await wishes(s)
s.check('its day can be changed afterwards', rows.find(r => r.name === `Apple AirPods Pro ${tag}`)?.coolUntil === inDays(1), rows.find(r => r.name === `Apple AirPods Pro ${tag}`)?.coolUntil)

// ── Three past their wait, to decide ──
await s.evaluate(`(async () => {
  const { default: db } = await import('/src/db/db.js')
  const past = new Date(Date.now() - 8 * 864e5).toISOString()
  for (const [name, price] of [['Keyboard ${tag}', 4500], ['Sneakers ${tag}', 6200], ['Lamp ${tag}', 1200]]) {
    await db.wishes.add({ name, price, currency: 'PHP', coolUntil: '2026-01-01', status: 'waiting', createdAt: past, updatedAt: past, synced: 0 })
  }
})()`)
await sleep(1200)
t = await text(s)
s.check('they show under Ready to decide, with how long they waited', /Ready to decide/.test(t) && /Waited 8 days/.test(t))
await s.shot('wish-ready.png')

s.check('Skip is on the row', await rowButton(s, `Keyboard ${tag}`, 'Skip'))
await sleep(900)
t = await text(s)
s.check('Skip says what it kept, with Undo', /₱4,500\.00 kept/.test(t) && /Undo/.test(t))
rows = await wishes(s)
s.check('the keyboard is skipped', rows.find(r => r.name === `Keyboard ${tag}`)?.status === 'skipped')
await clickBtn(s, 'Undo'); await sleep(900)
rows = await wishes(s)
s.check('Undo puts it back to waiting', rows.find(r => r.name === `Keyboard ${tag}`)?.status === 'waiting')
await rowButton(s, `Keyboard ${tag}`, 'Skip'); await sleep(1300)
t = await text(s)
s.check('Kept by waiting counts it', /Kept by waiting\s+₱4,500\.00/.test(t), (t.match(/Kept by waiting[^\n]*\n[^\n]*/) ?? [''])[0])
await s.shot('wish-kept.png')

// Buy: Add expense, filled in; the wish is marked once the expense is saved.
s.check('Buy on the sneakers', await rowButton(s, `Sneakers ${tag}`, 'Buy'))
await sleep(2000)
const form = await s.evaluate(`({ path: location.pathname, text: document.body.innerText.slice(0, 400), desc: [...document.querySelectorAll('input')].map(i => i.value).join(' | ') })`)
s.check('on Add expense with the price and name filled', form.path === '/expense' && /6,200/.test(form.desc + form.text) && form.desc.includes(`Sneakers ${tag}`), JSON.stringify(form).slice(0, 300))
rows = await wishes(s)
s.check('not marked bought before the expense is saved', rows.find(r => r.name === `Sneakers ${tag}`)?.status === 'waiting')
await s.shot('wish-buy-form.png')
// Pick an account and save, as a person would: the first account, then Review, then Save.
await s.evaluate(`document.querySelector('[aria-label="Back"]') && null`)
const acctOk = await s.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => /Select account|Choose/.test(b.textContent)); b?.click(); return !!b })()`)
await sleep(900)
await s.evaluate(`(() => { const opts = [...document.querySelectorAll('[role=dialog] button')].filter(b => /BPIBank/.test(b.textContent)); opts[0]?.click() })()`)
await sleep(700)
await s.clickText('Shopping'); await sleep(400)
await clickBtn(s, 'Review expense'); await sleep(1000)
await s.evaluate(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find(b => /^Save transaction/.test(b.textContent.trim())); b?.click() })()`)
await sleep(800)
// A same-day duplicate warning may ask first.
await s.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => /Save anyway/.test(b.textContent)); b?.click() })()`)
await sleep(1500)
rows = await wishes(s)
const sneakers = rows.find(r => r.name === `Sneakers ${tag}`)
s.check('saving the expense marks the wish bought, with the expense it was', acctOk && sneakers?.status === 'bought' && !!sneakers?.txId, JSON.stringify(sneakers))

// No Save up any more: the row has Skip and Buy only.
await s.goto(APP + '/wishlist', 2500)
const lampButtons = await s.evaluate(`(() => { const row = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Lamp ${tag}'))?.parentElement; return [...(row?.querySelectorAll('button') ?? [])].map(b => b.textContent.trim()).filter(x => x === 'Skip' || x === 'Buy' || x === 'Save up') })()`)
s.check('a ready wish answers with Skip and Buy, and nothing else', JSON.stringify(lampButtons) === '["Skip","Buy"]', JSON.stringify(lampButtons))
// Buy from the details sheet goes to Add expense too.
await s.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Lamp ${tag}'))?.click()`)
await sleep(1000)
await s.evaluate(`(() => { const d = [...document.querySelectorAll('[role=dialog]')].at(-1); [...(d?.querySelectorAll('button') ?? [])].find(b => b.textContent.trim() === 'Buy')?.click() })()`)
await sleep(1800)
const lampForm = await s.evaluate(`({ path: location.pathname, inputs: [...document.querySelectorAll('input')].map(i => i.value).join(' | ') })`)
s.check('Buy on the details opens Add expense, filled in', lampForm.path === '/expense' && lampForm.inputs.includes(`Lamp ${tag}`), JSON.stringify(lampForm).slice(0, 200))
await s.goto(APP + '/wishlist', 2500)

// Delete from its page, then Undo.
await s.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Apple AirPods Pro ${tag}'))?.click()`)
await sleep(1000)
await clickBtn(s, 'Edit'); await sleep(1300)
await clickBtn(s, 'Delete wish'); await sleep(1400)
rows = await wishes(s)
s.check('Delete takes it off, and goes back to the list', !rows.some(r => r.name === `Apple AirPods Pro ${tag}`) && await path(s) === '/wishlist', await path(s))
await clickBtn(s, 'Undo'); await sleep(900)
rows = await wishes(s)
s.check('Undo brings it back', rows.some(r => r.name === `Apple AirPods Pro ${tag}`))
await s.shot('wish-final-phone.png')

await s.evaluate(`document.querySelector('a[href="/"]')?.click()`); await sleep(1500)
const badge = await s.evaluate(`document.querySelector('a[href="/wishlist"]')?.textContent ?? ''`)
s.check("Home's Wishlist disc counts the one still ready to decide", /1/.test(badge), badge)
const errors = s.consoleLog.filter(l => l.type === 'error' || l.type === 'exception')
s.check('nothing logged as an error on the phone', errors.length === 0, JSON.stringify(errors.slice(0, 3)))
await s.close()

// ── The computer ──
const d = await session()
await d.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await d.goto(APP + '/', 1500)
await d.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(fake)}); localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-theme', 'light')`)
await d.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); await db.meta.put({ key: 'onboarded', value: true }) })()`)
await d.goto(APP + '/', 5000)
await d.evaluate(`[...document.querySelectorAll('button')].find(b => /Use my account's data/.test(b.textContent))?.click()`)
await sleep(5000)
await d.evaluate(`[...document.querySelectorAll('button')].find(b => /Back to Home/.test(b.textContent))?.click()`)
await d.until(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Got it')`, 6000)
await clickBtn(d, 'Got it'); await sleep(800)
const side = await d.evaluate(`document.querySelector('nav')?.innerText ?? ''`)
d.check('the sidebar has Wishlist under Plan, after Goals', /Goals[\s\S]*Wishlist[\s\S]*Recurring/.test(side), side.replace(/\s+/g, ' ').slice(0, 160))
await d.evaluate(`document.querySelector('a[href="/wishlist"]')?.click()`); await sleep(2000)
t = await text(d)
d.check('synced over: the wishes made on the phone are here', t.includes(`Apple AirPods Pro ${tag}`) && t.includes(`Keyboard ${tag}`))
d.check("the computer's page: kept, ready, cooling, decided", /Kept by waiting/.test(t) && /Ready to decide/.test(t) && /Cooling off/.test(t) && /Decided/.test(t))
await d.shot('wish-desktop.png')
await d.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Apple AirPods Pro ${tag}'))?.click()`)
await sleep(1000)
await d.shot('wish-desktop-detail.png')
await clickBtn(d, 'Edit')
await sleep(1500)
d.check('a wish opens in a drawer over the list', /^\/wishlist\/\d+$/.test(await path(d)) && /Kept by waiting/.test(await text(d)), await path(d))
await d.shot('wish-desktop-drawer.png')
const dErrors = d.consoleLog.filter(l => l.type === 'error' || l.type === 'exception')
d.check('nothing logged as an error on the computer', dErrors.length === 0, JSON.stringify(dErrors.slice(0, 3)))
await d.close()
process.exit()
