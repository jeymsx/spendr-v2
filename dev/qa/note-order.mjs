// Opening a note and leaving it, without typing, must not move it in the
// list (editedAt). And a new note stays at the top until you write in it.
import { session, APP } from './harness.mjs'
import { seedIdb } from './seed.mjs'
let failures = 0
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`) }
const s = await session()
const clickNote = async (title) => {
  const b = JSON.parse(await s.evaluate(`(() => { const el = [...document.querySelectorAll('.d-twopane-side [data-web-id^="note-"]')].find(e => e.textContent.includes(${JSON.stringify(title)})); const r = el.getBoundingClientRect(); return JSON.stringify({ x: r.x + 40, y: r.y + r.height / 2 }) })()`))
  for (const type of ['mousePressed', 'mouseReleased']) await s.send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 })
  await s.sleep(1200)
}
const order = () => s.evaluate(`JSON.stringify([...document.querySelectorAll('.d-twopane-side [data-web-id^="note-"]')].map(e => e.querySelector('p, span, div')?.textContent?.trim().slice(0, 18)))`)
const stamps = () => s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); return JSON.stringify((await db.notes.toArray()).map(n => [n.title ?? n.text?.slice(0, 12), n.editedAt])) })()`)
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await s.send('Page.navigate', { url: APP + '/' }); await s.sleep(3000)
  const version = await s.evaluate(`(async () => (await import('/src/lib/release.js')).APP_VERSION)()`).catch(() => '0.0.0')
  await s.evaluate(seedIdb({ version }))
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open')`)
  const ids = JSON.parse(await s.evaluate(`(async () => {
    const { createNote } = await import('/src/lib/notes.js')
    const doc = (t, b) => ({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: t }] }, { type: 'paragraph', content: [{ type: 'text', text: b }] }] })
    const a = await createNote(doc('Alpha note', 'first body'))
    await new Promise(r => setTimeout(r, 30))
    const b = await createNote(doc('Bravo note', 'second body'))
    return JSON.stringify([a, b])
  })()`))
  await s.send('Page.navigate', { url: APP + `/notes/${ids[1]}` })
  await s.until(`!!document.querySelector('.ProseMirror')`, 60000); await s.sleep(1500)
  const before = await stamps()
  await clickNote('Alpha note')
  await clickNote('Bravo note')
  await clickNote('Alpha note')
  const after = await stamps()
  check('opening and leaving notes changes no editedAt', before === after, `${before} -> ${after}`)
  // A new note: at the top, and still there after opening another.
  await s.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'New note').click()`)
  await s.sleep(1500)
  const o1 = await order()
  await s.send('Input.insertText', { text: 'Charlie' })
  await s.sleep(900)
  const o2 = await order()
  await clickNote('Alpha note')
  const o3 = await order()
  console.log('orders', o1, o2, o3)
  check('the new note is at the top as soon as it is made', /New note|Title|Untitled/i.test(JSON.parse(o1)[0] ?? '') || JSON.parse(o1)[0] === '', o1)
  check('and stays at the top after another note is opened', /Charlie/.test(JSON.parse(o3)[0] ?? ''), o3)
  const errs = s.consoleLog.filter(l => l.type === 'error' || l.type === 'exception')
  check('no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 3)))
} finally {
  await s.close()
  console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}`)
}
