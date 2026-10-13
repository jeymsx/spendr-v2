// Report a bug, end to end: a person sends from the phone, the developer reads, files and deletes on a computer.
import { session, APP, ROOT } from './harness.mjs'
const VERSION = JSON.parse((await import('node:fs')).readFileSync(ROOT + '/package.json', 'utf8')).version
const API = 'http://localhost:54321'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const rows = async (t) => (await fetch(`${API}/__rows?table=${t}`)).json()
await fetch(`${API}/__reset`)

const A = await session({ port: 9971 })   // someone's phone
const B = await session({ port: 9972 })   // the developer's computer
const all = []
const check = (name, ok, detail = '') => { A.check(name, ok, detail); all.push(ok) }
const fake = (dev) => JSON.stringify({ access_token: 'tok' + dev, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh' + dev, user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: dev === 'D' ? 'sablayjames@gmail.com' : 'test@example.com', app_metadata: {}, user_metadata: { full_name: dev === 'D' ? 'James Sablay' : 'Test User' }, created_at: '2026-01-01T00:00:00Z' } })
const signIn = (s, mode, dev) => s.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(fake(dev))}); localStorage.setItem('spendr-view-mode', '${mode}'); localStorage.setItem('spendr-theme', '${process.env.THEME ?? 'light'}')`)
const text = (s) => s.evaluate(`document.body.innerText`)
const clickButton = (s, re, scope = 'document') => s.evaluate(`(() => { const b = [...${scope}.querySelectorAll('button, a, [role=button]')].filter(e => ${re}.test(e.textContent.trim()) && e.offsetParent !== null).at(-1); if (!b) return false; b.click(); return true })()`)
const type = (s, value) => s.evaluate(`(() => { const el = document.querySelector('textarea'); if (!el) return false; el.focus(); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const dialogText = (s) => s.evaluate(`[...document.querySelectorAll('[role=dialog]')].map(d => d.innerText).join(' | ')`)

try {
  // ── Someone's phone: signed in, an error already on the device ──
  await A.send('Page.navigate', { url: APP + '/dev/local/seed-sample-data.html' })
  await A.until(`document.getElementById('status').textContent.startsWith('Sample data loaded')`, 90000)
  await signIn(A, 'phone', 'A')
  await A.evaluate(`localStorage.setItem('spendr-crash-log', JSON.stringify([{ at: new Date().toISOString(), last: new Date().toISOString(), count: 3, where: 'render', message: 'Cannot read properties of undefined (reading "balance")', stack: 'TypeError: Cannot read properties of undefined\\n    at Budget (Budget.jsx:120:4)\\n    at render', route: '/budget', version: '0.21.0', device: navigator.userAgent }]))`)
  await A.goto(APP + '/settings', 2000)
  await A.until(`/Help & about/.test(document.body.innerText)`, 60000)
  await A.evaluate(`[...document.querySelectorAll('button')].find(b => /Back to Home/.test(b.textContent))?.click()`)
  await sleep(800)
  const settings = await text(A)
  check('Settings has Report a bug, for everyone', /Report a bug\s*\n?\s*Or suggest an idea/.test(settings))
  check('and no inbox or error log for someone who is not the developer', !/Bug reports & ideas|Error log/.test(settings))
  await A.evaluate(`[...document.querySelectorAll('button, [role=button]')].find(e => /^Report a bug/.test(e.textContent.trim()))?.scrollIntoView({ block: 'center' })`)
  await sleep(300)
  await A.shot('fb-phone-settings.png')

  await clickButton(A, /^Report a bug/)
  await sleep(700)
  let sheet = await dialogText(A)
  check('the form opens as Report a bug, on Bug', /Report a bug/.test(sheet) && await A.evaluate(`document.querySelector('[role=radio][aria-checked=true]')?.textContent.trim()`) === 'Bug', sheet.slice(0, 200))
  check('it offers the device\'s error log, switched on', /Include the error log/.test(sheet) && /1 error this device noticed/.test(sheet) && await A.evaluate(`document.querySelector('[role=switch]')?.getAttribute('aria-checked')`) === 'true')
  check('it says what goes with it, and that no money does', /None of your money is included/.test(sheet))
  check('Send waits for something to be written', await A.evaluate(`[...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Send')?.disabled`) === true)
  await type(A, 'Budget went blank after I edited Food.\nIt came back after a reload.')
  await sleep(300)
  await A.shot('fb-phone-sheet.png')
  await clickButton(A, /^Send$/, `document.querySelector('[role=dialog]')`)
  let toast = ''
  for (let i = 0; i < 30 && !toast; i++) { toast = await A.evaluate(`[...document.querySelectorAll('[role=status], [data-sonner-toast]')].map(e => e.textContent).join(' ')`); if (!/sent/.test(toast)) { toast = ''; await sleep(200) } }
  check('Send thanks them', /Thanks, it’s sent/.test(toast), toast)
  let fb = await rows('feedback')
  check('the report is in the cloud: kind, words, version, device, and the error log', fb.length === 1 && fb[0].kind === 'bug' && /Budget went blank/.test(fb[0].message) && fb[0].app_version === VERSION && fb[0].device?.layout === 'phone' && fb[0].error_log?.length === 1 && fb[0].error_log[0].route === '/budget', JSON.stringify(fb[0] ?? {}).slice(0, 400))
  check('and who sent it was filled in by the cloud, not the app', fb[0]?.sender_email === 'test@example.com')
  check('the error log that went is cleared from the device', await A.evaluate(`localStorage.getItem('spendr-crash-log')`) === null)
  await sleep(600)
  check('the sheet closes', !(await dialogText(A)))

  // An idea: the form follows the kind, and no log goes with it.
  await clickButton(A, /^Report a bug/)
  await sleep(700)
  await A.evaluate(`[...document.querySelectorAll('[role=radio]')].find(b => b.textContent.trim() === 'Idea').click()`)
  await sleep(300)
  sheet = await dialogText(A)
  check('Idea turns it into Suggest an idea, asking what they would like', /Suggest an idea/.test(sheet) && await A.evaluate(`document.querySelector('textarea').placeholder`) === 'What would you like Spendr to do?')
  await type(A, 'A widget for the Home Screen')
  await clickButton(A, /^Send$/, `document.querySelector('[role=dialog]')`)
  await sleep(1500)
  fb = await rows('feedback')
  check('the idea arrives as an idea, with no log', fb.length === 2 && fb[1].kind === 'idea' && fb[1].error_log === null)

  // Not the developer: the inbox is not theirs to open.
  await A.goto(APP + '/settings/feedback', 2500)
  check('someone else opening the inbox lands back in Settings', await A.evaluate(`location.pathname`) === '/settings')

  // The help centre: Still stuck is a message now.
  await A.goto(APP + '/help', 2000)
  await A.until(`/Still stuck/.test(document.body.innerText)`, 60000)
  check('the help centre offers a message, not an email', /Send a message to the person who makes Spendr/.test(await text(A)))
  await clickButton(A, /Still stuck/)
  await sleep(700)
  check('and it opens the same form, on Other', /Send a message/.test(await dialogText(A)) && await A.evaluate(`document.querySelector('[role=radio][aria-checked=true]')?.textContent.trim()`) === 'Other')
  await A.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(500)

  // ── The developer, on a computer ──
  await B.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false })
  await B.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await B.send('Page.navigate', { url: APP + '/dev/local/seed-sample-data.html' })
  await B.until(`document.getElementById('status').textContent.startsWith('Sample data loaded')`, 90000)
  await signIn(B, 'desktop', 'D')
  await B.goto(APP + '/settings', 2000)
  // A second device meets the account: take the account's data, as the laptop does.
  if (await B.until(`[...document.querySelectorAll('button')].some(b => /Use my account's data/.test(b.textContent))`, 15000)) {
    await B.evaluate(`[...document.querySelectorAll('button')].find(b => /Use my account's data/.test(b.textContent)).click()`)
    await sleep(5000)
  }
  await B.until(`/Help & about/.test(document.body.innerText)`, 60000)
  await B.evaluate(`[...document.querySelectorAll('button')].find(b => /Back to Home/.test(b.textContent))?.click()`)
  await sleep(1500)
  const over = await text(B)
  check('the developer\'s Settings: Report a bug, the inbox with 2 new, and the error log', /Report a bug/.test(over) && /Bug reports & ideas\s*\n?\s*2 new/.test(over) && /Error log/.test(over), over.match(/Help & about[\s\S]{0,300}/)?.[0])
  check('the sidebar lists the inbox with its count', await B.evaluate(`(() => { const a = [...document.querySelectorAll('.d-nav-item')].find(e => /Bug reports & ideas/.test(e.textContent)); return a?.querySelector('.d-nav-count')?.textContent })()`) === '2')
  await B.shot('fb-desk-overview.png')

  await B.goto(APP + '/settings/feedback', 2000)
  await B.until(`/Budget went blank/.test(document.body.innerText)`, 60000)
  let inbox = await text(B)
  check('the inbox shows both, newest first, with who sent them', /New · 2/.test(inbox) && inbox.indexOf('A widget for the Home Screen') < inbox.indexOf('Budget went blank') && /Test User/.test(inbox), inbox.slice(0, 300))
  check('each says where it came from', inbox.includes(`v${VERSION} · `) && /Chrome/.test(inbox))
  await B.evaluate(`[...document.querySelectorAll('button')].find(b => /Show 1 error/.test(b.textContent)).click()`)
  await sleep(300)
  check('the error log opens under its report', /Cannot read properties of undefined/.test(await text(B)) && /render on \/budget/.test(await text(B)))
  await B.shot('fb-desk-inbox.png')

  // File the bug as done.
  await B.evaluate(`(() => { const art = [...document.querySelectorAll('article')].find(a => /Budget went blank/.test(a.textContent)); [...art.querySelectorAll('button')].find(b => b.textContent.trim() === 'Mark done').click() })()`)
  await sleep(1200)
  fb = await rows('feedback')
  inbox = await text(B)
  check('Mark done files it in the cloud, and the counts follow', fb.find(r => r.kind === 'bug')?.status === 'done' && !!fb.find(r => r.kind === 'bug')?.done_at && /New · 1/.test(inbox) && /Done · 1/.test(inbox))
  await B.evaluate(`[...document.querySelectorAll('[role=group] button, [role=radiogroup] button, [role=radio]')].find(b => /^Done/.test(b.textContent.trim())).click()`)
  await sleep(400)
  check('it is under Done, with Move to new', /Budget went blank/.test(await text(B)) && /Move to new/.test(await text(B)))

  // Delete, Undo, then delete for good.
  await B.evaluate(`[...document.querySelectorAll('article button')].find(b => b.textContent.trim() === 'Delete').click()`)
  await sleep(500)
  check('Delete takes it off the list at once, with an Undo', !/Budget went blank/.test(await text(B)) && /Report deleted/.test(await text(B)))
  await B.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Undo').click()`)
  await sleep(500)
  check('Undo puts it back, and the cloud still has it', /Budget went blank/.test(await text(B)) && (await rows('feedback')).length === 2)
  await sleep(6500)
  check('nothing is deleted after an Undo', (await rows('feedback')).length === 2)
  await B.evaluate(`[...document.querySelectorAll('article button')].find(b => b.textContent.trim() === 'Delete').click()`)
  await sleep(7000)
  check('a delete left alone goes from the cloud after the Undo has passed', (await rows('feedback')).length === 1)

  // The computer's own form.
  await B.goto(APP + '/settings', 3000)
  await B.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Report').click()`)
  await sleep(500)
  check('on a computer, Report opens the form as a dialog', /Report a bug/.test(await dialogText(B)) && await B.evaluate(`!!document.querySelector('[role=dialog] textarea.d-textarea')`))
  await type(B, 'Testing from the computer')
  await B.shot('fb-desk-dialog.png')
  await B.evaluate(`[...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Send').click()`)
  await sleep(1500)
  fb = await rows('feedback')
  check('it arrives marked as sent from the computer layout', fb.some(r => r.message === 'Testing from the computer' && r.device?.layout === 'computer' && r.sender_name === 'James Sablay'))

  // The phone's inbox, for the developer on a phone.
  await A.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(fake('D'))})`)
  await A.goto(APP + '/settings/feedback', 2000)
  await A.until(`/Testing from the computer/.test(document.body.innerText)`, 60000)
  await A.shot('fb-phone-inbox.png')
  check('the developer can read the inbox on a phone too', /Bug reports & ideas/.test(await text(A)) && /Testing from the computer/.test(await text(A)))

  // Signed out: the same form, as an email.
  await A.evaluate(`localStorage.removeItem('sb-localhost-auth-token')`)
  await A.goto(APP + '/settings', 2000)
  await A.until(`/Help & about/.test(document.body.innerText)`, 60000)
  await clickButton(A, /^Report a bug/)
  await sleep(700)
  sheet = await dialogText(A)
  check('signed out, it says it will be an email, and the button says so', /opens as an email instead/.test(sheet) && /Email it/.test(sheet))

  for (const [n, s] of [['phone', A], ['computer', B]]) {
    const errs = s.consoleLog.filter(l => ['error', 'exception'].includes(l.type) && !/favicon|Failed to load resource|ERR_|net::/.test(l.text))
    check(`nothing logged as an error on the ${n}`, errs.length === 0, JSON.stringify(errs.slice(0, 3)).slice(0, 400))
  }
} catch (e) {
  console.log('SCRIPT ERROR', e.message)
  await A.shot('fb-error-a.png').catch(() => {})
  await B.shot('fb-error-b.png').catch(() => {})
} finally {
  console.log(`\n${all.filter(Boolean).length}/${all.length} passed`)
  await A.close(); await B.close()
}
