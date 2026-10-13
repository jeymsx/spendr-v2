// Headless Chrome of its own (own port, throwaway profile), driven over CDP.
// Every check in this folder starts here; see README.md for how to run them.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
/** The repo, for reading package.json, vercel.json and the like. */
export const ROOT = join(HERE, '..', '..')
/* Screenshots and downloads land outside the repo: a dev server watches every
   file under it, and one crashed on a spreadsheet still being written. */
export const OUT = process.env.QA_OUT ?? join(realpathSync.native(tmpdir()), 'spendr-qa-out')
mkdirSync(OUT, { recursive: true })
export const SCRATCH = OUT
/** The dev server under test: APP=http://... in full, or APP_PORT. */
export const APP = process.env.APP ?? `http://localhost:${process.env.APP_PORT ?? 5190}`
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
export const sleep = ms => new Promise(r => setTimeout(r, ms))

/** A port nothing is listening on, from the system. */
const freePort = () => new Promise((res, rej) => {
  const srv = createServer()
  srv.once('error', rej)
  srv.listen(0, '127.0.0.1', () => { const { port } = /** @type {import('node:net').AddressInfo} */ (srv.address()); srv.close(() => res(port)) })
})

/* The port a check asks for is ignored: each Chrome gets a free one, so
   checks can run side by side, and a new session never talks to the last
   one's Chrome while it is still closing on the same port. */
export async function session({ headless = true, extraArgs = [] } = {}) {
  const port = await freePort()
  /* Not under the scratchpad: that path is ~170 characters, and Chrome's
     CacheStorage files nest deep enough below a profile to pass Windows'
     260-character limit, which fails every caches.open() and so every
     service worker install. Deleted again in close(). */
  const profile = mkdtempSync(join(realpathSync.native(tmpdir()), 'spv-'))
  const proc = spawn(CHROME, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    ...(headless ? ['--headless=new'] : []),
    '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-component-update', ...extraArgs, 'about:blank',
  ], { stdio: 'ignore' })

  let wsUrl, browserWs
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      wsUrl = list.find(t => t.type === 'page')?.webSocketDebuggerUrl
      browserWs = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl
    } catch { /* not up yet */ }
    if (!wsUrl) await sleep(250)
  }
  if (!wsUrl) { proc.kill(); throw new Error('chrome did not start') }

  const connect = async (url) => {
    const ws = new WebSocket(url)
    let nextId = 0
    const pending = new Map()
    const listeners = []
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data)
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id)
        pending.delete(m.id)
        m.error ? rej(new Error(m.error.message)) : res(m.result)
      } else if (m.method) for (const l of [...listeners]) l(m)
    }
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
      const id = ++nextId
      pending.set(id, { res, rej })
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
    return { ws, send, listeners }
  }

  const page = await connect(wsUrl)
  const browser = await connect(browserWs)
  const { send, listeners } = page

  const once = method => new Promise(r => {
    const fn = m => { if (m.method === method) { listeners.splice(listeners.indexOf(fn), 1); r(m.params) } }
    listeners.push(fn)
  })
  const timeout = (ms, what) => new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out: ${what}`)), ms))
  const evaluate = async expression => {
    const r = await Promise.race([
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }),
      timeout(25000, expression.slice(0, 80)),
    ])
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  const goto = async (url, settle = 2000) => {
    const loaded = once('Page.loadEventFired')
    await send('Page.navigate', { url })
    // Generous: a cold dev server compiles a route on its first visit.
    await Promise.race([loaded, timeout(45000, 'load ' + url)])
    if (process.env.STEPS) console.log('STEP loaded', url)
    await sleep(settle)
  }
  const shot = async name => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(SCRATCH, name), Buffer.from(data, 'base64'))
  }
  const until = async (expr, ms = 8000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      try { if (await evaluate(`!!(${expr})`)) return true } catch { /* mid-navigation */ }
      await sleep(150)
    }
    return false
  }
  /** Click the innermost element whose own text is exactly `text`. */
  const clickText = (text, scope = 'document') => evaluate(`(() => {
    const root = ${scope}
    const els = [...root.querySelectorAll('*')].filter(e => e.childElementCount === 0 && e.textContent.trim() === ${JSON.stringify(text)})
    const el = els.at(-1)
    if (!el) return false
    el.scrollIntoView({ block: 'center' })
    ;(el.closest('button,a,[role=button],label') ?? el).click()
    return true
  })()`)
  /** Type into an input the way React sees it. */
  const typeInto = (selector, value) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return false
    el.focus()
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)

  const consoleLog = []
  const network = []
  listeners.push(m => {
    if (m.method === 'Runtime.consoleAPICalled') {
      consoleLog.push({ type: m.params.type, text: m.params.args.map(a => a.value ?? a.description ?? '').join(' ') })
    } else if (m.method === 'Runtime.exceptionThrown') {
      consoleLog.push({ type: 'exception', text: m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text })
    } else if (m.method === 'Network.requestWillBeSent') {
      network.push({ url: m.params.request.url, method: m.params.request.method })
    }
  })

  const results = []
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`)
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 851, deviceScaleFactor: 1, mobile: true })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  const close = async () => {
    try { page.ws.close(); browser.ws.close() } catch { /* already */ }
    proc.kill()
    await sleep(800)
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* chrome still holding it */ }
    const failed = results.filter(r => !r.ok).length
    console.log(`\n${results.length - failed}/${results.length} passed`)
    if (failed) process.exitCode = 1
  }

  return { listeners, send, browserSend: browser.send, browserListeners: browser.listeners, evaluate, goto, shot, until, clickText, typeInto, consoleLog, network, check, close, sleep }
}
