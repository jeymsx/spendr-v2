// Back lands where you left a desktop page; a new page starts at its top.
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
const BASE = APP
const s = await session({ port: 9976 })
const top = () => s.evaluate(`Math.round(document.querySelector('.d-page:not([aria-hidden])')?.scrollTop ?? -1)`)
const ready = (p) => s.until(`location.pathname === ${JSON.stringify(p)} && document.querySelector('.d-page:not([aria-hidden])') && !document.querySelector('.d-skel')`, 30000)
const click = (sel) => s.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`)
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s.send('Page.navigate', { url: BASE + '/' }); await s.until(`document.querySelector('#root')?.children.length`, 60000); await s.sleep(2000)
  const version = await s.evaluate(`(async () => (await import('/src/lib/release.js')).APP_VERSION)()`).catch(() => '0.0.0')
  await s.evaluate(seedIdb({ version }))
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open')`)
  await s.send('Page.navigate', { url: BASE + '/transactions' })
  await ready('/transactions'); await s.sleep(800)

  // 1. Scroll Transactions, go to Accounts by the sidebar: Accounts starts at its top.
  await s.evaluate(`document.querySelector('.d-page').scrollTo(0, 1400)`); await s.sleep(400)
  const left = await top()
  await click('.d-sidebar a[href="/accounts"]')
  await ready('/accounts'); await s.sleep(300)
  s.check('a new page starts at its top', await top() === 0, `${await top()}`)
  await s.evaluate(`document.querySelector('.d-page').scrollTo(0, 300)`); await s.sleep(300)
  const leftAccounts = await top()

  // 2. Back: Transactions where it was left.
  await s.evaluate(`history.back()`)
  await ready('/transactions'); await s.sleep(600)
  s.check('Back lands where Transactions was left', Math.abs(await top() - left) <= 2, `left ${left}, back at ${await top()}`)

  // 3. Forward: Accounts where it was left.
  await s.evaluate(`history.forward()`)
  await ready('/accounts'); await s.sleep(600)
  s.check('Forward lands where Accounts was left', leftAccounts > 0 && Math.abs(await top() - leftAccounts) <= 2, `left ${leftAccounts}, back at ${await top()}`)

  // 4. A slow ledger: the place comes back once the rows do.
  await s.evaluate(`history.back()`); await ready('/transactions'); await s.sleep(400)
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__slowTx = true` })
  await s.evaluate(`(() => {
    window.__queue = []; window.__held = true
    window.__release = () => { window.__held = false; window.__queue.splice(0).forEach(f => f()) }
    const storeOf = (src) => src instanceof IDBIndex ? src.objectStore.name : src.name
    const d = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess')
    for (const proto of [IDBObjectStore.prototype, IDBIndex.prototype]) {
      for (const m of ['getAll', 'openCursor', 'count', 'get', 'getAllKeys']) {
        const orig = proto[m]
        if (!orig) continue
        proto[m] = function (...a) {
          const req = orig.apply(this, a)
          if (storeOf(this) !== 'transactions') return req
          Object.defineProperty(req, 'onsuccess', { configurable: true, get() { return d.get.call(this) }, set(fn) { if (!fn) return d.set.call(this, fn); d.set.call(this, function (ev) { if (!window.__held) return fn.call(this, ev); window.__queue.push(() => fn.call(req, ev)) }) } })
          return req
        }
      }
    }
  })()`)
  await click('.d-sidebar a[href="/budget"]')
  await s.until(`location.pathname === '/budget'`, 10000); await s.sleep(500)
  await s.evaluate(`history.back()`)
  await s.until(`location.pathname === '/transactions'`, 10000)
  await s.sleep(900)
  const during = await top()
  const skel = await s.evaluate(`document.querySelectorAll('.d-page .d-skel').length`)
  await s.evaluate(`window.__release()`)
  await ready('/transactions'); await s.sleep(600)
  s.check('a slow page still lands where it was left', Math.abs(await top() - left) <= 2, `while loading ${during} (${skel} skeleton blocks), then ${await top()}`)

  // 5. A wheel while it is putting the place back wins.
  await s.evaluate(`window.__held = true`)
  await click('.d-sidebar a[href="/budget"]')
  await s.until(`location.pathname === '/budget'`, 10000); await s.sleep(500)
  await s.evaluate(`history.back()`)
  await s.until(`location.pathname === '/transactions'`, 10000); await s.sleep(500)
  await s.evaluate(`document.querySelector('.d-page:not([aria-hidden])').dispatchEvent(new WheelEvent('wheel', { bubbles: true })); document.querySelector('.d-page:not([aria-hidden])').scrollTo(0, 0)`)
  await s.evaluate(`window.__release()`)
  await ready('/transactions'); await s.sleep(800)
  s.check('a wheel in the meantime wins', await top() === 0, `${await top()}`)

  // 6. Settings: a new pane starts at the top; the column stays.
  await s.send('Page.navigate', { url: BASE + '/settings/preferences' })
  await ready('/settings/preferences'); await s.sleep(500)
  await s.evaluate(`document.querySelector('.d-page').scrollTo(0, 400)`); await s.sleep(300)
  const leftPrefs = await top()
  await click('.d-twopane-side a[href="/settings/changelog"]')
  await ready('/settings/changelog'); await s.sleep(400)
  s.check('a new settings pane starts at the top', await top() === 0, `${await top()}`)
  await s.evaluate(`history.back()`)
  await ready('/settings/preferences'); await s.sleep(700)
  s.check('Back to Preferences where it was left', leftPrefs > 0 && Math.abs(await top() - leftPrefs) <= 2, `left ${leftPrefs}, back at ${await top()}`)

  const errs = s.consoleLog.filter(l => l.type === 'exception' || l.type === 'error')
  s.check('no console errors', errs.length === 0, errs.map(e => e.text.slice(0, 200)).join(' | '))
} finally { await s.close() }
