// Every form asks before typed input is thrown away, and none asks when
// nothing would be lost.
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`) }
const s = await session({ extraArgs: ['--overscroll-history-navigation=0', '--disable-features=OverscrollHistoryNavigation,TouchpadOverscrollHistoryNavigation'] })
const open = async (url, settle = 3000) => {
  await s.send('Page.navigate', { url })
  await s.until(`document.readyState === 'complete' && !!document.querySelector('#root')?.childElementCount`, 60000)
  await s.sleep(settle)
}
const path = () => s.evaluate('location.pathname')
const asking = () => s.evaluate(`[...document.querySelectorAll('[role=dialog]')].some(d => /Discard changes/.test(d.getAttribute('aria-label') || d.innerText))`)
const click = (js) => s.evaluate(`(() => { const e = ${js}; if (!e) return false; e.click(); return true })()`)
const typeIn = async (sel, text) => {
  const ok = await s.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.focus(); e.select?.(); return true })()`)
  for (const ch of text) {
    await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch })
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
  }
  await s.sleep(400)
  return ok
}
const headerBack = () => click(`document.querySelector('#app-main header button')`)
const keep = async () => { await click(`[...document.querySelectorAll('[role=dialog] button')].find(b => /^Keep editing$/.test(b.innerText.trim()))`); await s.sleep(700) }
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  for (let i = 0; i < 3; i++) {
    await open(APP + '/', 3500)
    try { await s.evaluate(seedIdb()) } catch { /* retry */ }
    await open(APP + '/transactions', 2500)
    if ((await path()) === '/transactions') break
  }

  const pages = [
    ['/recurring/new', 'main input'],
    ['/accounts/new', 'main input'],
    ['/accounts/1/edit', 'main input'],
    ['/settings/profile', 'main input'],
    ['/settings/budgets', 'main input[inputmode="decimal"], main input'],
    ['/inflow', 'main input[aria-label="Amount"]'],
    ['/transfer', 'main input[aria-label="Amount"]'],
  ]
  for (const [p, sel] of pages) {
    // Untouched: Back just goes.
    await open(APP + '/transactions', 1500)
    await s.evaluate(`history.pushState(history.state, '', location.pathname)`)
    await open(APP + p)
    await headerBack()
    await s.sleep(1200)
    const clean = { asked: await asking(), at: await path() }
    // Typed into: Back asks, Keep editing stays.
    await open(APP + p)
    const typed = await typeIn(sel, '42')
    await headerBack()
    await s.sleep(900)
    const dirty = { asked: await asking(), at: await path() }
    await keep()
    const kept = await path()
    check(`${p}: untouched leaves, typed asks`, !clean.asked && clean.at !== p && typed && dirty.asked && dirty.at === p && kept === p, JSON.stringify({ clean, typed, dirty, kept }))
  }

  // A sheet form: typed, the scrim asks; Keep leaves it open; system Back asks too.
  await open(APP + '/goals')
  await click(`[...document.querySelectorAll('#app-main button')].find(b => /New goal|Add goal|^\\+$/i.test(b.getAttribute('aria-label') || b.innerText))`)
  await s.sleep(900)
  await typeIn('[role=dialog] input', 'Trip')
  await click(`document.querySelector('.sheet-overlay')`)
  await s.sleep(900)
  const scrimAsk = await asking()
  await keep()
  const stillOpen = await s.evaluate(`[...document.querySelectorAll('[role=dialog]')].length`)
  await s.evaluate('history.back()')
  await s.sleep(900)
  const backAsk = await asking()
  await click(`[...document.querySelectorAll('[role=dialog] button')].find(b => /^Discard$/.test(b.innerText.trim()))`)
  await s.sleep(900)
  const gone = await s.evaluate(`[...document.querySelectorAll('[role=dialog]')].length`)
  check('a typed sheet form asks on the scrim and on Back', scrimAsk && stillOpen >= 1 && backAsk && gone === 0 && (await path()) === '/goals', JSON.stringify({ scrimAsk, stillOpen, backAsk, gone, at: await path() }))

  // An untouched sheet form just closes.
  await click(`[...document.querySelectorAll('#app-main button')].find(b => /New goal|Add goal|^\\+$/i.test(b.getAttribute('aria-label') || b.innerText))`)
  await s.sleep(900)
  await click(`document.querySelector('.sheet-overlay')`)
  await s.sleep(900)
  check('an untouched sheet form closes on the scrim', !(await asking()) && (await s.evaluate(`document.querySelectorAll('[role=dialog]').length`)) === 0)

  // New account: system Back on a later step is a step back.
  await open(APP + '/accounts/new')
  await typeIn('main input', 'QA Wallet')
  await click(`[...document.querySelectorAll('#app-main button, main button')].find(b => /^Continue/.test(b.innerText.trim()))`)
  await s.sleep(1000)
  const stepTwo = await s.evaluate(`document.querySelector('main')?.innerText.match(/\\d\\/\\d/)?.[0]`)
  await s.evaluate('history.back()')
  await s.sleep(900)
  const stepBack = await s.evaluate(`document.querySelector('main')?.innerText.match(/\\d\\/\\d/)?.[0]`)
  check('New account: system Back steps back', stepTwo && stepTwo.startsWith('2') && stepBack?.startsWith('1') && (await path()) === '/accounts/new' && !(await asking()), `${stepTwo} -> ${stepBack}`)
  await s.evaluate('history.back()')
  await s.sleep(900)
  check('New account: then Back on the first step asks', await asking(), String(await asking()))
} finally {
  await s.close()
  console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}`)
}
