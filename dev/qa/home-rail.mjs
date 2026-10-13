// Home's shortcuts as a sideways rail: eight doors in order, the row scrolls
// with feathered ends, and Challenges, Quick log, Forecast and Notes go where
// they should.
import { session, sleep, APP } from './harness.mjs'

const fake = JSON.stringify({ access_token: 'tokA', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refreshA', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: { full_name: 'Test User' }, created_at: '2026-01-01T00:00:00Z' } })

const s = await session()
await s.send('Page.navigate', { url: APP + '/dev/seed-sample-data.html' })
await s.until(`document.getElementById('status')?.textContent.startsWith('Sample data loaded')`, 90000)
await s.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(fake)}); localStorage.setItem('spendr-view-mode', 'phone'); localStorage.setItem('spendr-theme', '${process.env.THEME ?? 'light'}')`)
await s.goto(APP + '/', 5000)
if (await s.until(`[...document.querySelectorAll('button')].some(b => /Move them to my account|Keep both/.test(b.textContent))`, 6000)) {
  await s.evaluate(`[...document.querySelectorAll('button')].find(b => /Move them to my account|Keep both/.test(b.textContent)).click()`)
  await sleep(5000)
  await s.evaluate(`[...document.querySelectorAll('button')].find(b => /Back to Home/.test(b.textContent))?.click()`)
}
await s.until(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Got it')`, 8000)
await s.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Got it')?.click()`)
await sleep(1200)

const rail = `document.querySelector('[aria-label="Shortcuts"]')`
const labels = await s.evaluate(`[...${rail}.querySelectorAll('a')].map(a => a.textContent.replace(/\\d+/g, '').trim())`)
s.check('eight doors, in order', JSON.stringify(labels) === JSON.stringify(['Goals', 'Debts', 'Recurring', 'Wishlist', 'Challenges', 'Quick log', 'Forecast', 'Notes']), JSON.stringify(labels))
const geo = await s.evaluate(`(() => { const r = ${rail}; return { scroll: r.scrollWidth, client: r.clientWidth, mask: getComputedStyle(r).maskImage || getComputedStyle(r).webkitMaskImage } })()`)
s.check('the row is wider than the screen, so it scrolls', geo.scroll > geo.client + 40, JSON.stringify(geo))
const fit = await s.evaluate(`(() => { const r = ${rail}.getBoundingClientRect(); return [...${rail}.querySelectorAll('a')].map(a => { const b = a.getBoundingClientRect(); return { label: a.textContent.replace(/\\d+/g, '').trim(), left: Math.round(b.left), right: Math.round(b.right), inView: b.left >= r.left + 19 && b.right <= r.right - 19 } }) })()`)
s.check('Goals to Quick log are all in view at rest, Forecast and Notes past the edge', fit.slice(0, 6).every(f => f.inView) && !fit[6].inView && !fit[7].inView, JSON.stringify(fit.map(f => f.label + ':' + f.left + '-' + f.right)))
await s.evaluate(`window.scrollTo(0, Math.max(0, ${rail}.getBoundingClientRect().top + window.scrollY - 300))`)
await sleep(400)
await s.shot('home-rail-start.png')
const startMask = await s.evaluate(`getComputedStyle(${rail}).maskImage || getComputedStyle(${rail}).webkitMaskImage || 'none'`)
s.check('at rest, only the far end fades', /linear-gradient/.test(startMask), startMask.slice(0, 160))
await s.evaluate(`${rail}.scrollLeft = 80`)
await sleep(500)
await s.shot('home-rail-middle.png')
const midMask = await s.evaluate(`getComputedStyle(${rail}).maskImage || getComputedStyle(${rail}).webkitMaskImage || 'none'`)
s.check('scrolled, both ends fade', midMask !== startMask && /linear-gradient/.test(midMask), midMask.slice(0, 160))
await s.evaluate(`${rail}.scrollLeft = 9999`)
await sleep(500)
await s.shot('home-rail-end.png')
const badgesClipped = await s.evaluate(`(() => { const r = ${rail}.getBoundingClientRect(); return [...${rail}.querySelectorAll('.qa-badge')].some(b => b.getBoundingClientRect().top < r.top) })()`)
s.check('a count on a disc is not clipped by the row', !badgesClipped)

// Where they go.
const go = async (label) => {
  await s.evaluate(`[...${rail}.querySelectorAll('a')].find(a => a.textContent.includes(${JSON.stringify(label)}))?.click()`)
  await sleep(1500)
  return s.evaluate(`({ path: location.pathname + location.search, text: document.body.innerText.slice(0, 200) })`)
}
let r = await go('Challenges')
s.check('Challenges opens Achievements on its Challenges tab', r.path.startsWith('/achievements'), r.path)
await s.evaluate(`history.back()`); await sleep(1500)
r = await go('Quick log')
const quickOpen = await s.evaluate(`!!document.querySelector('.quick-log')`)
s.check('Quick log opens the quick log over Home, and the address is put back', quickOpen && r.path === '/', r.path)
await s.shot('home-rail-quicklog.png')
await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
await sleep(800)
if (await s.evaluate(`!!document.querySelector('.quick-log')`)) { await s.goto(APP + '/', 3000) }
r = await go('Forecast')
s.check('Forecast opens the forecast', r.path === '/insights/forecast', r.path)
await s.evaluate(`history.back()`); await sleep(1500)
r = await go('Notes')
s.check('Notes opens Notes', r.path.startsWith('/notes'), r.path)
const errors = s.consoleLog.filter(l => l.type === 'error' || l.type === 'exception')
s.check('nothing logged as an error', errors.length === 0, JSON.stringify(errors.slice(0, 3)))
await s.close()
process.exit()
