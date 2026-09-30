import { useEffect, useState } from 'react'
import { keyboardIsUp, tallestSeen } from '../lib/keyboard'

/**
 * The screen's numbers, live, over the app: for a screenshot on a phone
 * when the keyboard moves something it should not.
 *
 * The keyboard's behaviour cannot be seen anywhere but a real iPhone -
 * headless browsers have no keyboard, and iOS has changed how an installed
 * app sizes itself for one more than once. So when a fix for it does not
 * hold on the phone, this shows what the phone reports: the window, the
 * visible part of it, where iOS has scrolled the page, what the app makes
 * of that (the keyboard up or down), where the tab bar and the focused
 * field are, and the last few events with the numbers at each.
 *
 * Hidden: five taps on the version at the foot of Settings turn it on or
 * off (toggleProbe). Nothing of it renders otherwise.
 */

const FLAG = 'spendr-viewport-probe'
const EVENT = 'spendr-viewport-probe'

/** Whether the readout is on. */
export function probeOn() {
  try { return localStorage.getItem(FLAG) === '1' } catch { return false }
}

/** Turns the readout on or off, and says which. */
export function toggleProbe() {
  const on = !probeOn()
  try {
    if (on) localStorage.setItem(FLAG, '1')
    else localStorage.removeItem(FLAG)
  } catch { /* storage off: nothing to keep it in */ }
  window.dispatchEvent(new Event(EVENT))
  return on
}

/** The readout, while it is on. */
export function ViewportProbeGate() {
  const [on, setOn] = useState(probeOn)
  useEffect(() => {
    const onChange = () => setOn(probeOn())
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [])
  return on ? <ViewportProbe /> : null
}

const r = (/** @type {number|undefined} */ n) => (n == null ? '-' : Math.round(n))

/** @param {Element|null|undefined} el */
function label(el) {
  if (!el || el === document.body) return 'none'
  const name = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('type') || ''
  return `${el.tagName.toLowerCase()}${name ? `"${name.slice(0, 16)}"` : ''}`
}

/** Two unseen boxes: one 100dvh tall, one pinned top and bottom like the tab bar. */
function probes() {
  let dvh = /** @type {HTMLElement|null} */ (document.getElementById('probe-dvh'))
  let fixed = /** @type {HTMLElement|null} */ (document.getElementById('probe-fixed'))
  if (!dvh) {
    dvh = document.createElement('div')
    dvh.id = 'probe-dvh'
    Object.assign(dvh.style, { position: 'absolute', top: '0', left: '0', width: '0', height: '100dvh', visibility: 'hidden', pointerEvents: 'none' })
    document.body.appendChild(dvh)
  }
  if (!fixed) {
    fixed = document.createElement('div')
    fixed.id = 'probe-fixed'
    Object.assign(fixed.style, { position: 'fixed', top: '0', bottom: '0', left: '0', width: '0', visibility: 'hidden', pointerEvents: 'none' })
    document.body.appendChild(fixed)
  }
  return { dvh: dvh.offsetHeight, fixed: fixed.getBoundingClientRect() }
}

function snap() {
  const vv = window.visualViewport
  return `vv ${r(vv?.height)}@${r(vv?.offsetTop)} in ${window.innerHeight} y ${r(window.scrollY)} kb ${keyboardIsUp() ? 'UP' : 'dn'}`
}

/** @param {string[]} log */
function read(log) {
  const vv = window.visualViewport
  const main = document.getElementById('app-main')
  const nav = document.querySelector('#app-main ~ nav')
  const navBox = nav?.getBoundingClientRect()
  const shell = main?.parentElement?.getBoundingClientRect()
  const el = document.activeElement
  const box = el && el !== document.body ? el.getBoundingClientRect() : null
  const p = probes()
  return [
    `screen ${window.screen.width}x${window.screen.height} dpr ${window.devicePixelRatio}`,
    `inner ${window.innerWidth}x${window.innerHeight} client ${document.documentElement.clientHeight}`,
    `vv ${r(vv?.width)}x${r(vv?.height)} top ${r(vv?.offsetTop)} page ${r(vv?.pageTop)} x${vv?.scale ?? '-'}`,
    `scrollY ${r(window.scrollY)} tallest ${tallestSeen()} kb ${keyboardIsUp() ? 'UP' : 'down'}`,
    `100dvh ${p.dvh} fixed ${r(p.fixed.top)}+${r(p.fixed.height)} shell ${r(shell?.top)}+${r(shell?.height)}`,
    `nav ${nav ? getComputedStyle(nav).display : '-'} ${r(navBox?.top)}..${r(navBox?.bottom)} main ${r(main?.scrollTop)}`,
    `focus ${label(el)} ${box ? `${r(box.top)}..${r(box.bottom)}` : ''}${document.documentElement.classList.contains('field-typing') ? ' room' : ''}`,
    ...log,
  ]
}

function ViewportProbe() {
  const [lines, setLines] = useState(() => read([]))

  useEffect(() => {
    /** @type {string[]} */
    const log = []
    /** @param {string} what */
    const push = (what) => {
      log.unshift(`${String(Math.round(performance.now()) % 100000).padStart(5, ' ')} ${what} | ${snap()}`)
      log.length = Math.min(log.length, 8)
      setLines(read(log))
    }
    const vv = window.visualViewport
    /** @param {Event} e */
    const onViewport = (e) => push(`vv.${e.type}`)
    const onWindow = () => push('window.resize')
    /** @param {FocusEvent} e */
    const onFocus = (e) => push(`${e.type} ${label(/** @type {Element} */ (e.target))}`)
    vv?.addEventListener('resize', onViewport)
    vv?.addEventListener('scroll', onViewport)
    window.addEventListener('resize', onWindow)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onFocus)
    const tick = setInterval(() => setLines(read(log)), 300)
    return () => {
      vv?.removeEventListener('resize', onViewport)
      vv?.removeEventListener('scroll', onViewport)
      window.removeEventListener('resize', onWindow)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onFocus)
      clearInterval(tick)
      document.getElementById('probe-dvh')?.remove()
      document.getElementById('probe-fixed')?.remove()
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', left: 4, right: 4, top: 'calc(env(safe-area-inset-top, 0px) + 4px)', zIndex: 10000,
        pointerEvents: 'none', padding: '6px 8px', borderRadius: 8,
        background: 'rgba(0, 0, 0, 0.8)', color: '#fff',
        font: '10px/1.3 ui-monospace, Menlo, monospace', whiteSpace: 'pre', overflow: 'hidden',
      }}
    >
      {lines.join('\n')}
    </div>
  )
}
