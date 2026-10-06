import { useEffect, useMemo, useRef, useState } from 'react'
import { IChevronLeft, IChevronRight } from './icons'

/**
 * A month of days to pick one from: the desktop's calendar, in place of the
 * browser's grey one (components/ui/DateInput opens it from a date field).
 *
 * Monday first, as the Transactions calendar is (components/CalendarView).
 * Always six weeks tall, so stepping between months never resizes it under
 * the pointer. Today is ringed, the chosen day filled in the accent, days
 * outside `min`/`max` greyed and not pickable, days of the months either
 * side faint but pickable - picking one takes you there.
 *
 * Keys, as a date grid's are: the arrows move a day or a week, Home and End
 * to the week's ends, Page Up and Page Down a month, Enter picks, Escape
 * closes (the popover it is in).
 *
 * Dates are 'YYYY-MM-DD' strings in local time throughout, as an
 * <input type="date"> gives them: they compare as strings, and no time zone
 * can move a day.
 *
 * @param {{value: string, onPick: (iso: string) => void, min?: string, max?: string, clearable?: boolean, label?: string}} props
 */
export default function DatePanel({ value, onPick, min, max, clearable = false, label = 'Date' }) {
  const today = isoOf(new Date())
  const start = value || (max && today > max ? max : min && today < min ? min : today)
  const [view, setView] = useState(() => monthOf(start))
  const [focus, setFocus] = useState(start)
  const grid = useRef(/** @type {HTMLDivElement|null} */ (null))
  const keyed = useRef(false)

  const days = useMemo(() => sixWeeks(view.y, view.m), [view])
  const allowed = (/** @type {string} */ d) => (!min || d >= min) && (!max || d <= max)
  const title = new Date(view.y, view.m, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  const prevOk = !min || isoOf(new Date(view.y, view.m, 0)) >= min
  const nextOk = !max || isoOf(new Date(view.y, view.m + 1, 1)) <= max

  /* The chosen day (or today) has the focus when the calendar opens, and
     keeps it as keys move it. A frame later: the popover is drawn hidden
     for its first frame, to be measured, and nothing hidden takes focus. */
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = /** @type {HTMLButtonElement|null} */ (grid.current?.querySelector(`[data-iso="${focus}"]`) ?? null)
      if (el && (keyed.current || !grid.current?.contains(document.activeElement))) el.focus({ preventScroll: true })
      keyed.current = false
    })
    return () => cancelAnimationFrame(raf)
  }, [focus, view])

  const moveTo = (/** @type {string} */ d) => {
    keyed.current = true
    setFocus(d)
    const m = monthOf(d)
    if (m.y !== view.y || m.m !== view.m) setView(m)
  }
  const step = (/** @type {number} */ months) => {
    const d = new Date(view.y, view.m + months, 1)
    setView({ y: d.getFullYear(), m: d.getMonth() })
    const [, , fd] = focus.split('-').map(Number)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    setFocus(isoOf(new Date(d.getFullYear(), d.getMonth(), Math.min(fd, last))))
  }

  const onKey = (/** @type {import('react').KeyboardEvent} */ e) => {
    const at = new Date(`${focus}T00:00:00`)
    const by = (/** @type {number} */ n) => { e.preventDefault(); moveTo(isoOf(new Date(at.getFullYear(), at.getMonth(), at.getDate() + n))) }
    const dow = (at.getDay() + 6) % 7
    if (e.key === 'ArrowLeft') by(-1)
    else if (e.key === 'ArrowRight') by(1)
    else if (e.key === 'ArrowUp') by(-7)
    else if (e.key === 'ArrowDown') by(7)
    else if (e.key === 'Home') by(-dow)
    else if (e.key === 'End') by(6 - dow)
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const d = new Date(at.getFullYear(), at.getMonth() + (e.key === 'PageUp' ? -1 : 1), 1)
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      moveTo(isoOf(new Date(d.getFullYear(), d.getMonth(), Math.min(at.getDate(), last))))
    }
  }

  return (
    <div className="d-cal">
      <div className="d-cal-head">
        <button type="button" className="d-cal-step" aria-label="Previous month" disabled={!prevOk} onClick={() => step(-1)}><IChevronLeft size={16} /></button>
        <span className="d-cal-title" aria-live="polite">{title}</span>
        <button type="button" className="d-cal-step" aria-label="Next month" disabled={!nextOk} onClick={() => step(1)}><IChevronRight size={16} /></button>
      </div>
      <div ref={grid} role="grid" aria-label={`${label}, ${title}`} className="d-cal-grid" onKeyDown={onKey}>
        <div role="row" className="contents">
          {WEEKDAYS.map(([short, long]) => <span key={long} role="columnheader" aria-label={long} className="d-cal-dow">{short}</span>)}
        </div>
        {Array.from({ length: 6 }, (_, w) => (
          <div key={w} role="row" className="contents">
            {days.slice(w * 7, w * 7 + 7).map(d => {
              const inMonth = monthOf(d).m === view.m
              const on = d === value
              return (
                <span key={d} role="gridcell" aria-selected={on} className="contents">
                  <button
                    type="button"
                    data-iso={d}
                    tabIndex={d === focus ? 0 : -1}
                    disabled={!allowed(d)}
                    aria-current={d === today ? 'date' : undefined}
                    aria-label={new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    className={`d-cal-day${inMonth ? '' : ' is-out'}${d === today ? ' is-today' : ''}${on ? ' is-on' : ''}`}
                    onClick={() => onPick(d)}
                  >
                    {Number(d.slice(8))}
                  </button>
                </span>
              )
            })}
          </div>
        ))}
      </div>
      <div className="d-cal-foot">
        <button type="button" className="d-btn d-btn-ghost d-btn-sm" disabled={!allowed(today)} onClick={() => onPick(today)}>Today</button>
        {clearable && value && <button type="button" className="d-btn d-btn-ghost d-btn-sm" onClick={() => onPick('')}>Clear</button>}
      </div>
    </div>
  )
}

const WEEKDAYS = [['Mo', 'Monday'], ['Tu', 'Tuesday'], ['We', 'Wednesday'], ['Th', 'Thursday'], ['Fr', 'Friday'], ['Sa', 'Saturday'], ['Su', 'Sunday']]

/** A local date as 'YYYY-MM-DD'. @param {Date} d */
export function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** @param {string} iso */
function monthOf(iso) {
  const [y, m] = iso.split('-').map(Number)
  return { y, m: m - 1 }
}

/** The 42 days shown for a month: from the Monday on or before its 1st. @param {number} y @param {number} m */
function sixWeeks(y, m) {
  const first = new Date(y, m, 1)
  const back = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => isoOf(new Date(y, m, 1 - back + i)))
}
