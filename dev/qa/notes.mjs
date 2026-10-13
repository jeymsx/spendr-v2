// Notes on the phone: folders as chips with counts, a folder narrows the list,
// tags narrow it further, search finds across folders, and a new folder.
import { session, APP } from './harness.mjs'
const s = await session({ port: 9984 })
const click = (sel, text) => s.evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => ${text ? `b.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(text)})` : 'true'}); if (!e) return false; e.click(); return true })()`)
const chips = () => s.evaluate(`[...document.querySelectorAll('.note-filing [aria-label="Folders"] button')].map(b => b.textContent.replace(/\\s+/g, ' ').trim())`)
const titles = () => s.evaluate(`[...document.querySelectorAll('.d-twopane-list [data-web-id]')].map(b => b.querySelector('span').textContent.trim())`)
const type = async (sel, text) => {
  await s.evaluate(`document.querySelector(${JSON.stringify(sel)}).focus()`)
  await s.send('Input.insertText', { text })
}
const key = async (k, code = k, vk = 13, text) => {
  await s.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) })
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk })
}
try {
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await s.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await s.send('Page.navigate', { url: APP + '/dev/local/seed-sample-data.html' })
  await s.until(`/Sample data loaded|Not loaded|Could not/.test(document.getElementById('status').textContent)`, 90000)
  await s.evaluate(`localStorage.setItem('spendr-view-mode', 'desktop'); localStorage.setItem('spendr-sidebar', 'open'); localStorage.setItem('spendr-theme', 'light'); sessionStorage.removeItem('spendr-notes-view')`)
  await s.send('Page.navigate', { url: APP + '/notes' })
  await s.until(`document.querySelector('.note-filing') && !document.querySelector('.d-skel')`, 60000); await s.sleep(1200)

  let c = await chips()
  s.check('folders as chips, with counts, and a way to make one', c[0] === 'All notes 9' && c.some(x => x.startsWith('Money 3')) && c.some(x => x.startsWith('Ideas 2')) && c.at(-1) === 'New', c.join(' | '))
  s.check('the folder chips are one line that scrolls, softened at the end', await s.evaluate(`(() => { const r = document.querySelector('.note-filing [aria-label="Folders"]'); const cs = getComputedStyle(r); return cs.flexWrap === 'nowrap' && cs.overflowX === 'auto' && r.scrollWidth > r.clientWidth && (cs.maskImage || cs.webkitMaskImage || '').includes('gradient') })()`))

  // A folder narrows the list.
  await click('.note-filing [aria-label="Folders"] button', 'Money'); await s.sleep(500)
  let t = await titles()
  s.check('a folder shows only its notes', t.length === 3 && t.includes('Payday plan') && !t.includes('Groceries'), t.join(' | '))
  const strip = await s.evaluate(`document.querySelector('.d-twopane-list').textContent`)
  s.check('and says so, with an options button instead of two words', /3 notes in Money/.test(strip) && !/Rename/.test(strip) && !/Delete/.test(strip) && await s.evaluate(`!!document.querySelector('.d-twopane-list button[aria-label="Folder options"]')`))
  const tagChips = await s.evaluate(`[...document.querySelectorAll('.note-filing [aria-label="Tags"] button')].map(b => b.textContent.replace(/\\s+/g, ' ').trim())`)
  s.check('and the tags in it, not the others\'', tagChips.some(x => x.startsWith('#payday')) && !tagChips.some(x => x.startsWith('#groceries')), tagChips.join(' | '))
  await click('.note-filing [aria-label="Tags"] button', '#payday'); await s.sleep(400)
  t = await titles()
  s.check('a tag narrows it further', t.length === 1 && t[0] === 'Payday plan', t.join(' | '))
  await click('.note-filing [aria-label="Tags"] button', '#payday'); await s.sleep(400)
  t = await titles()
  s.check('and again takes it off', t.length === 3, String(t.length))

  // Search is everywhere.
  await type('.d-twopane-list input[type="search"], .d-twopane-list input', '#gifts'); await s.sleep(500)
  t = await titles()
  s.check('searching #gifts finds the note tagged so, in any folder', t.length === 1 && t[0] === 'Gift ideas', t.join(' | '))
  s.check('and puts the folders away while it does', await s.evaluate(`!document.querySelector('.note-filing')`))
  await s.evaluate(`(() => { const i = document.querySelector('.d-twopane-list input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })) })()`); await s.sleep(500)

  // A new folder, from the chip.
  await click('.note-filing [aria-label="Folders"] button', 'New'); await s.sleep(700)
  s.check('New opens the name sheet', await s.evaluate(`!!document.querySelector('.sheet-panel input')`))
  await type('.sheet-panel input', 'Work stuff'); await key('Enter', 'Enter', 13, '\r'); await s.sleep(900)
  c = await chips()
  s.check('the new folder is made and open, empty', c.some(x => x.startsWith('Work stuff 0')) && /This folder is empty/.test(await s.evaluate(`document.querySelector('.d-twopane-list').textContent`)), c.join(' | '))

  // A note started with it open begins in it.
  await click('.d-page-head button', 'New note'); await s.sleep(1200)
  const born = await s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); const f = (await db.note_folders.toArray()).find(x => x.name === 'Work stuff'); const n = (await db.notes.toArray()).sort((a, b) => b.id - a.id)[0]; return { inFolder: n.folder === f.syncId, path: location.pathname } })()`)
  s.check('New note starts in the open folder', born.inFolder && /^\/notes\/\d+$/.test(born.path), JSON.stringify(born))
  // Left blank it goes (as before); open another note to move.
  await click('.note-filing [aria-label="Folders"] button', 'All notes'); await s.sleep(700)
  await click('.d-twopane-list [data-web-id]', 'A thought'); await s.sleep(1200)

  // Move it from its menu.
  await click('button[aria-label="Note options"]'); await s.sleep(400)
  await click('[role="menuitem"]', 'Move to folder'); await s.sleep(800)
  const rows = await s.evaluate(`[...document.querySelectorAll('.sheet-panel button')].map(b => b.textContent.trim())`)
  s.check('Move to folder lists No folder, the folders and New folder', rows.includes('No folder') && rows.includes('Work stuff') && rows.includes('New folder…'), rows.join(' | '))
  await click('.sheet-panel button', 'Work stuff'); await s.sleep(900)
  const pill = await s.evaluate(`document.querySelector('.d-note-card')?.textContent ?? ''`)
  s.check('the note then says where it is', /Work stuff/.test(pill))
  await s.shot('notes-qa-moved.png')

  // Tags from its menu.
  await click('button[aria-label="Note options"]'); await s.sleep(400)
  await click('[role="menuitem"]', 'Tags'); await s.sleep(800)
  await type('.sheet-panel input', 'reflect, Quick Idea'); await key('Enter', 'Enter', 13, '\r'); await s.sleep(800)
  let tg = await s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); return (await db.notes.filter(n => n.title === 'A thought').first()).tags })()`)
  s.check('tags are tidied and saved: reflect, quick-idea', JSON.stringify(tg) === JSON.stringify(['reflect', 'quick-idea']), JSON.stringify(tg))
  s.check('with the tags already in use offered, to add with a tap', await s.evaluate(`/Your tags/.test(document.querySelector('.sheet-panel').textContent)`))
  await s.shot('notes-qa-tags.png')
  await click('.sheet-panel button', 'Remove reflect').catch(() => {}); await click('.sheet-panel [aria-label="Remove reflect"]'); await s.sleep(600)
  tg = await s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); return (await db.notes.filter(n => n.title === 'A thought').first()).tags })()`)
  s.check('and one can be taken off', JSON.stringify(tg) === JSON.stringify(['quick-idea']), JSON.stringify(tg))
  await click('.sheet-panel button', 'Done'); await s.sleep(600)

  // Dragging a row onto a folder.
  const drag = await s.evaluate(`(async () => {
    const row = [...document.querySelectorAll('.d-twopane-list [data-web-id]')].find(b => b.textContent.includes('Wishlist'))
    const chip = [...document.querySelectorAll('.note-filing [aria-label="Folders"] button')].find(b => b.textContent.trim().startsWith('Ideas'))
    const dt = new DataTransfer()
    row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    chip.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    await new Promise(r => setTimeout(r, 150))
    const lit = chip.getAttribute('data-drop')
    chip.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    await new Promise(r => setTimeout(r, 600))
    const { default: db } = await import('/src/db/db.js')
    const f = (await db.note_folders.toArray()).find(x => x.name === 'Ideas')
    const n = await db.notes.filter(x => x.title === 'Wishlist').first()
    return { lit, moved: n.folder === f.syncId, draggable: row.getAttribute('draggable') }
  })()`)
  s.check('a row dragged onto a folder is filed there, lighting the chip', drag.lit === 'true' && drag.moved && drag.draggable === 'true', JSON.stringify(drag))
  s.check('with an Undo in the toast', /Moved to Ideas/.test(await s.evaluate(`document.body.innerText`)))

  // Rename, then delete: the notes stay.
  await click('.note-filing [aria-label="Folders"] button', 'Work stuff'); await s.sleep(500)
  await click('.d-twopane-list button[aria-label="Folder options"]'); await s.sleep(500)
  await click('[role="menuitem"]', 'Rename folder'); await s.sleep(700)
  const prefilled = await s.evaluate(`document.querySelector('.sheet-panel input').value`)
  s.check('Rename opens with the name in it', prefilled === 'Work stuff', prefilled)
  await s.evaluate(`document.querySelector('.sheet-panel input').select()`)
  await s.send('Input.insertText', { text: 'Ideas' }); await key('Enter', 'Enter', 13, '\r'); await s.sleep(700)
  s.check('a name another folder has is refused', /already there/.test(await s.evaluate(`document.querySelector('.sheet-panel')?.textContent ?? ''`)))
  await s.evaluate(`document.querySelector('.sheet-panel input').select()`)
  await s.send('Input.insertText', { text: 'Work' }); await key('Enter', 'Enter', 13, '\r'); await s.sleep(900)
  c = await chips()
  s.check('renamed', c.some(x => x.startsWith('Work 1')), c.join(' | '))
  await click('.d-twopane-list button[aria-label="Folder options"]'); await s.sleep(500)
  await click('[role="menuitem"]', 'Delete folder'); await s.sleep(800)
  s.check('Delete says the notes stay', /will stay|stay, in All notes/.test(await s.evaluate(`document.querySelector('.sheet-panel')?.textContent ?? ''`)))
  await click('.sheet-panel button', 'Delete folder'); await s.sleep(1000)
  c = await chips()
  const left = await s.evaluate(`(async () => { const { default: db } = await import('/src/db/db.js'); const n = await db.notes.filter(n => n.title === 'A thought').first(); return { folder: n.folder, notes: await db.notes.count() } })()`)
  s.check('the folder is gone, All notes is showing, the note is kept unfiled', !c.some(x => x.startsWith('Work ')) && c[0].startsWith('All notes') && left.folder === null, JSON.stringify({ c, left }))

  const errs = s.consoleLog.filter(l => l.type === 'exception' || l.type === 'error')
  s.check('no console errors', errs.length === 0, errs.map(e => e.text.slice(0, 300)).join(' | '))
} finally { await s.close() }
