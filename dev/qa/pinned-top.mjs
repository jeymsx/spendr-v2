// The top blurs are off at rest: Home's status bar frost, and a page's
// pinned header (components/ui/PinnedTop.jsx), which is clear at rest and
// frosted only once the page scrolls under it, even with the window left a
// few pixels down, as an iPhone leaves it after the keyboard. Watched against
// the window, that offset frosted the bar on a page nobody had scrolled.
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
await sleep(800)
// The sample ledger earns a milestone, whose celebration covers the app.
if (await s.until(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Back to Home')`, 4000)) {
  await s.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Back to Home').click()`)
  await sleep(1200)
}

/* Home has no pinned top: the status bar's frost covers its greeting. At
   rest it is hidden, not only see-through, since an iPhone can still blur
   through a backdrop filter at opacity 0. */
const status = (el) => s.evaluate(`(() => { const cs = getComputedStyle(${el}); return cs.visibility + ' ' + Number(cs.opacity).toFixed(2) })()`)
const statusFrost = `document.querySelector('.status-frost')`
const home = `document.getElementById('app-main')`
s.check('Home at rest: the status frost is hidden', await status(statusFrost) === 'hidden 0.00', await status(statusFrost))
await s.evaluate(`${home}.scrollTop = 300`)
await sleep(600)
s.check('Home scrolled: the status frost is drawn', await status(statusFrost) === 'visible 1.00', await status(statusFrost))
await s.evaluate(`${home}.scrollTop = 0`)
await sleep(80)
const fading = await s.evaluate(`${statusFrost}.getAnimations().some(a => a.transitionProperty === 'opacity')`)
s.check('back at the top, it fades out rather than vanishing', fading)
await sleep(600)
s.check('and is hidden once faded', await status(statusFrost) === 'hidden 0.00', await status(statusFrost))

const frosted = `document.querySelector('#app-main .pinned-top')?.hasAttribute('data-under')`
const headerFrost = `document.querySelector('#app-main .pinned-top-frost')`
const main = `document.getElementById('app-main')`
/* Client-side, as a tap would: a fresh load would put the window back. */
const open = async (path) => {
  await s.evaluate(`(() => { history.pushState({}, '', ${JSON.stringify(path)}); dispatchEvent(new PopStateEvent('popstate')) })()`)
  await s.until(`document.querySelector('#app-main .pinned-top') && location.pathname === ${JSON.stringify(path)}`, 10000)
  await sleep(900)
}

await open('/recurring')
s.check('at rest, the header is clear', await s.evaluate(frosted) === false)
s.check('and its frost is hidden, not only see-through', await status(headerFrost) === 'hidden 0.00', await status(headerFrost))
await s.evaluate(`${main}.scrollTop = 240`)
await sleep(500)
s.check('scrolled, the header frosts', await s.evaluate(frosted) === true)
s.check('and its frost is drawn', await status(headerFrost) === 'visible 1.00', await status(headerFrost))
await s.shot('pinned-top-scrolled.png')
await s.evaluate(`${main}.scrollTop = 0`)
await sleep(500)
s.check('back at the top, it clears', await s.evaluate(frosted) === false)

/* What the iPhone keyboard leaves behind: the window moved down a little,
   with the page itself still at its top. A spacer gives the window
   something to scroll; the app's own box never does. */
await s.evaluate(`(() => { const d = document.createElement('div'); d.id = 'qa-spacer'; d.style.height = '200px'; document.body.append(d); window.scrollTo(0, 14) })()`)
await sleep(500)
const moved = await s.evaluate(`window.scrollY`)
s.check('(setup) the window is moved', moved >= 10, `scrollY ${moved}`)
s.check('window moved, page at its top: the header is still clear', await s.evaluate(frosted) === false)
await s.shot('pinned-top-window-moved.png')

// A page opened while the window is still moved starts clear too.
await open('/budget')
await s.evaluate(`window.scrollTo(0, 14)`)
await sleep(500)
s.check('a page opened with the window moved starts clear', await s.evaluate(frosted) === false)
await s.evaluate(`${main}.scrollTop = 240`)
await sleep(500)
s.check('and still frosts when it is scrolled', await s.evaluate(frosted) === true)

/* Every kind of page with a pinned top watches it against <main>, which is
   what it scrolls in, and still does while a sheet has <main> locked. */
await s.evaluate(`document.getElementById('qa-spacer')?.remove(); window.scrollTo(0, 0)`)
for (const path of ['/settings', '/debts', '/expense', '/inflow', '/transfer', '/accounts/new', '/wishlist/new']) {
  await open(path)
  const root = await s.evaluate(`import('/src/utils/scrollParent.js').then(({ scrollParent }) => {
    const sentinel = document.querySelector('#app-main .pinned-top')?.previousElementSibling
    if (!sentinel) return 'no pinned top'
    const main = document.getElementById('app-main')
    const free = scrollParent(sentinel) === main
    main.classList.add('scroll-locked')
    const locked = scrollParent(sentinel) === main
    main.classList.remove('scroll-locked')
    return free && locked ? 'main' : 'not main'
  })`)
  s.check(`${path}: watched against <main>, locked or not`, root === 'main', root)
  s.check(`${path}: clear at rest`, await s.evaluate(frosted) === false)
}

const errors = s.consoleLog.filter(l => l.type === 'error' || l.type === 'exception')
s.check('nothing logged as an error', errors.length === 0, JSON.stringify(errors.slice(0, 3)))
await s.close()
process.exit()
