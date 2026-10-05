import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../../context/ThemeContext'
import { ACCENT_COLORS } from '../../pages/settings/shared'
import { AccentScreen } from '../../pages/SettingsAccent'
import Btn from '../ui/Button'
import Feather from '../ui/Feather'
import { ICheck, IChevronLeft, IChevronRight } from '../ui/icons'

/**
 * Accent colour on a computer: the accents in one line, each a miniature of
 * the app in it - the phone's selector (pages/SettingsAccent), laid flat.
 * Click one and the whole app takes it; the one in use is ringed in its own
 * colour.
 *
 * The phone's is a deck you swipe, chosen by whichever card is centred, and
 * driven by the scroll position. A mouse has no swipe, and in a pane
 * narrower than the window the deck sat off its own centre. So here the
 * line scrolls only to show more: by the arrows, a trackpad, or the wheel
 * over it (until its end, when the wheel goes back to the page). Its edges
 * fade where there is more (Feather).
 *
 * A radio group to the keyboard: Tab reaches the chosen one, the arrows move
 * and choose, and the line follows.
 */
export default function WebSettingsAccent() {
  const { accentColor, setAccentColor, theme } = useTheme()
  const rail = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [ends, setEnds] = useState({ start: true, end: false })
  const current = String(accentColor).toLowerCase()
  const at = ACCENT_COLORS.findIndex(c => c.hex.toLowerCase() === current)

  // Which ends the line is at, for the arrows.
  useEffect(() => {
    const el = rail.current
    if (!el) return
    const read = () => {
      const start = el.scrollLeft <= 1
      const end = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1
      setEnds(e => (e.start === start && e.end === end ? e : { start, end }))
    }
    read()
    el.addEventListener('scroll', read, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    ro?.observe(el)
    /* The wheel scrolls the line while it can go further that way, then the
       page again - so it never traps the page's scroll. Not React's onWheel,
       which is passive and cannot stop the page moving too. */
    const wheel = (/** @type {WheelEvent} */ e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const max = el.scrollWidth - el.clientWidth
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => { el.removeEventListener('scroll', read); el.removeEventListener('wheel', wheel); ro?.disconnect() }
  }, [])

  /* The chosen one in view: at once on opening, smoothly after - and only
     when it is not already, so a click never slides the line from under
     the pointer. */
  const first = useRef(true)
  useEffect(() => {
    const el = rail.current
    const card = /** @type {HTMLElement|undefined} */ (el?.children[at])
    if (!el || !card) return
    const room = 64
    const left = card.offsetLeft, right = left + card.offsetWidth
    let to = null
    if (left < el.scrollLeft + room) to = left - room
    else if (right > el.scrollLeft + el.clientWidth - room) to = right - el.clientWidth + room
    if (to != null) el.scrollTo({ left: Math.max(0, to), behavior: first.current ? 'instant' : 'smooth' })
    first.current = false
  }, [at])

  const page = (/** @type {number} */ dir) => {
    const el = rail.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const onKeyDown = (/** @type {import('react').KeyboardEvent} */ e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = ((at < 0 ? 0 : at) + step + ACCENT_COLORS.length) % ACCENT_COLORS.length
    setAccentColor(ACCENT_COLORS[next].hex)
    const card = /** @type {HTMLElement|undefined} */ (rail.current?.children[next])
    card?.focus({ preventScroll: true })
  }

  return (
    <div className="pb-2">
      <header className="d-pane-head flex items-end justify-between gap-4">
        <div className="min-w-0">
          <Link to="/settings/preferences" className="d-eyebrow inline-flex items-center gap-1 hover:underline underline-offset-2"><IChevronLeft size={13} />Preferences</Link>
          <h2 className="d-pane-title">Accent colour</h2>
          <p className="d-pane-sub">The net worth card, buttons, links and charts take it, on every page.</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Btn size="sm" icon={<IChevronLeft size={15} />} label="Earlier colours" onClick={() => page(-1)} disabled={ends.start} />
          <Btn size="sm" icon={<IChevronRight size={15} />} label="More colours" onClick={() => page(1)} disabled={ends.end} />
        </div>
      </header>
      <div className="mx-5 d-panel overflow-hidden">
        <Feather>
          <div
            ref={rail}
            className="d-accent-line overflow-x-auto no-scrollbar"
            role="radiogroup"
            aria-label="Accent colour"
            onKeyDown={onKeyDown}
          >
            {ACCENT_COLORS.map((c, i) => {
              const on = i === at
              return (
                <button
                  key={c.hex}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on || (at < 0 && i === 0) ? 0 : -1}
                  onClick={() => setAccentColor(c.hex)}
                  className={`d-accent${on ? ' is-on' : ''}`}
                  style={/** @type {any} */ ({ '--swatch': c.hex })}
                >
                  <AccentScreen hex={c.hex} theme={theme} />
                  <span className="d-accent-name">
                    {c.name}
                    {on && <ICheck size={15} />}
                  </span>
                  <span className="d-accent-hint">{c.hint}</span>
                </button>
              )
            })}
          </div>
        </Feather>
      </div>
    </div>
  )
}
