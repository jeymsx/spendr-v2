// System Back with sheets and forms: a sheet closes, a form with input asks,
// a saved form does not come back, and entries left behind are stepped past.
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`) }
const s = await session({ port: 9808, extraArgs: ['--overscroll-history-navigation=0', '--disable-features=OverscrollHistoryNavigation,TouchpadOverscrollHistoryNavigation'] })
const open = async (url, settle = 2800) => {
  await s.send('Page.navigate', { url })
  await s.until(`document.readyState === 'complete' && !!document.querySelector('#root')?.childElementCount`, 60000)
  await s.sleep(settle)
}
const path = () => s.evaluate('location.pathname')
const dialogs = () => s.evaluate(`[...document.querySelectorAll('[role=dialog]')].map(d => d.getAttribute('aria-label') || d.querySelector('h3')?.innerText || '?').join(' | ')`)
const sysBack = async () => { await s.evaluate('history.back()'); await s.sleep(900) }
const click = (js) => s.evaluate(`(() => { const e = ${js}; if (!e) return false; e.click(); return true })()`)
const byText = (re) => `[...document.querySelectorAll('button, a')].find(e => ${re}.test((e.innerText || e.getAttribute('aria-label') || '').trim()))`
const typeInto = async (sel, text) => {
  await s.evaluate(`document.querySelector(${JSON.stringify(sel)})?.focus()`)
  for (const ch of text) {
    await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch })
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
  }
  await s.sleep(300)
}
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  for (let i = 0; i < 3; i++) {
    await open(APP + '/', 3500)
    try { await s.evaluate(seedIdb()) } catch (e) { console.log('seed retry', e.message) }
    await open(APP + '/transactions', 2500)
    if ((await path()) === '/transactions') break
  }

  // 1. A sheet closes on system Back, and the page stays.
  await open(APP + '/transactions')
  await click(`document.querySelector('#app-main .row-main, #app-main [data-tx-row] button, #app-main button.row-main')`)
  await s.sleep(900)
  const d1 = await dialogs()
  await sysBack()
  check('Back closes a transaction sheet and keeps the list', d1 && !(await dialogs()) && (await path()) === '/transactions', `${d1} -> ${await dialogs()} @ ${await path()}`)

  // 2. A form with input asks: from its Back button, and from system Back.
  await open(APP + '/transactions')
  await s.evaluate(`history.pushState(history.state, '', '/transactions')`) // a page behind, as if navigated
  await open(APP + '/expense', 2500)
  await typeInto('main input[aria-label="Amount"]', '250')
  await click(`document.querySelector('#app-main header button[aria-label="Back"]')`)
  await s.sleep(800)
  check("the form's Back asks before throwing input away", /Discard changes/.test(await dialogs()) && (await path()) === '/expense', await dialogs())
  await click(byText('/^Keep editing$/'))
  await s.sleep(800)
  const kept = await s.evaluate(`document.querySelector('main input[aria-label="Amount"]')?.value`)
  check('Keep editing keeps what was typed', !(await dialogs()) && /250/.test(kept ?? ''), `${kept} ${await dialogs()}`)
  await sysBack()
  check('system Back asks too, and stays on the form', /Discard changes/.test(await dialogs()) && (await path()) === '/expense', `${await dialogs()} @ ${await path()}`)
  await click(byText('/^Discard$/'))
  await s.sleep(1500)
  check('Discard leaves the form', (await path()) !== '/expense', await path())

  // 3. A clean form leaves without asking.
  await open(APP + '/expense', 2500)
  await click(`document.querySelector('#app-main header button[aria-label="Back"]')`)
  await s.sleep(1200)
  check('an untouched form just goes back', !(await dialogs()) && (await path()) !== '/expense', `${await path()} ${await dialogs()}`)

  // 4. Saving leaves for good: Back from Home does not reopen the form.
  await s.evaluate(`(async () => {
    const db = await new Promise((res, rej) => { const q = indexedDB.open('SpendrDB'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
    await new Promise((res, rej) => { const t = db.transaction(['meta'], 'readwrite'); t.objectStore('meta').put({ key: 'skipConfirm', value: true }); t.oncomplete = res; t.onerror = () => rej(t.error) })
    db.close()
  })()`)
  await open(APP + '/transactions')
  await click(`[...document.querySelectorAll('nav button, nav a')].find(e => /Add/.test(e.getAttribute('aria-label') || e.innerText))`)
  await s.sleep(900)
  await click(`[...document.querySelectorAll('[role=dialog] button, [role=dialog] a')].find(e => /^Expense/.test(e.innerText.trim()))`)
  await s.sleep(1500)
  const onForm = await path()
  await typeInto('main input[aria-label="Amount"]', '120')
  await click(`[...document.querySelectorAll('#app-main button')].find(b => /Food/.test(b.innerText))`)
  await s.evaluate(`[...document.querySelectorAll('#app-main button')].find(b => /Paying from|account/i.test(b.getAttribute('aria-label') || b.innerText))?.click()`)
  await s.sleep(900)
  await s.evaluate(`[...document.querySelectorAll('[role=dialog] button')].find(b => /^Cash/.test(b.innerText.trim()))?.click()`)
  await s.sleep(900)
  await s.sleep(300)
  await click(`[...document.querySelectorAll('#app-main button')].find(b => /^(Save|Review)/.test(b.innerText.trim()))`)
  await s.sleep(1200)
  // a confirmation sheet may ask first
  await click(`[...document.querySelectorAll('[role=dialog] button')].find(b => /^(Save|Confirm|Looks right)/.test(b.innerText.trim()))`)
  await s.sleep(1800)
  const afterSave = await path()
  await sysBack()
  const afterBack = await path()
  check('after saving, Back does not reopen the form', onForm === '/expense' && afterSave === '/' && afterBack !== '/expense', `${onForm} -> ${afterSave} -> ${afterBack}`)

  // 5. Nested: a picker over a form closes alone.
  await open(APP + '/expense', 2500)
  await click(`[...document.querySelectorAll('#app-main button')].find(b => /Paying from|account/i.test(b.getAttribute('aria-label') || b.innerText))`)
  await s.sleep(900)
  const picker = await dialogs()
  await sysBack()
  check('Back closes a picker and stays on the form', picker && !(await dialogs()) && (await path()) === '/expense', `${picker} -> ${await dialogs()} @ ${await path()}`)

  // 6. The add sheet's entry, left behind when it opened the form, is stepped past.
  await open(APP + '/', 3000)
  await click(`[...document.querySelectorAll('nav button, nav a')].find(e => /Add/.test(e.getAttribute('aria-label') || e.innerText))`)
  await s.sleep(900)
  await click(`[...document.querySelectorAll('[role=dialog] button, [role=dialog] a')].find(e => /^Expense/.test(e.innerText.trim()))`)
  await s.sleep(1500)
  await sysBack()
  check('Back from a form the add sheet opened lands on Home in one press', (await path()) === '/' && !(await dialogs()), `${await path()} ${await dialogs()}`)
} finally {
  await s.close()
  console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}`)
}
