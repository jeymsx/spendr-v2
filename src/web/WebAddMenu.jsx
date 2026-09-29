import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAddFlow } from './AddFlow'
import { WebIconPlus } from './WebIcons'
import { IconQuickLog } from '../components/icons'

/* The phone's add sheet, in its words (Expense, Inflow, Transfer), and the
   quick log it keeps behind a long press of +: a landscape menu has room to
   show it. */
const FLOWS = [
  { key: 'expense',  label: 'Expense',  hint: 'Money out',    sign: '−', tone: 'text-red-600 dark:text-red-400', kbd: 'E' },
  { key: 'inflow',   label: 'Inflow',   hint: 'Money in',     sign: '+', tone: 'text-emerald-700 dark:text-emerald-400', kbd: 'I' },
  { key: 'transfer', label: 'Transfer', hint: 'Between accounts', sign: '⇄', tone: 'text-primary', kbd: 'T' },
  { key: 'quick',    label: 'Quick log', hint: 'Type it the way you say it', sign: <IconQuickLog size={15} />, tone: 'text-primary', kbd: 'Q' },
]

/** The menu's items, in order. @param {HTMLElement|null} menu @returns {HTMLElement[]} */
const itemsOf = (menu) => [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].map(n => /** @type {HTMLElement} */ (n))

/**
 * Add button with a flyout of the three transaction types.
 *
 * The first version opened a modal just to pick a type, then a second modal
 * with the form — two clicks and two dialogs before typing anything. This
 * collapses that: hover (or focus) the button and the three types appear
 * anchored to it, so reaching a form is one hover and one click.
 *
 * Hover alone isn't enough on its own — it excludes keyboard and touch — so
 * click toggles it too, focus opens it, and it closes on Escape, outside
 * click, or the pointer leaving. The leave has a short grace period because the
 * pointer has to cross a gap between button and menu.
 *
 * The keyboard gets the menu-button pattern (WAI-ARIA APG): ArrowDown, Enter
 * or Space on the button opens the menu at its first item, ArrowUp at its
 * last; Up and Down move through it and wrap, Home and End jump; Escape
 * closes it and gives focus back to the button. Focus alone still opens it,
 * as hover does, without moving into it.
 *
 * The menu is portalled to document.body and positioned from the button's
 * rect. It can't simply be absolutely positioned inside the sidebar: the
 * sidebar carries backdrop-blur-xl, and backdrop-filter creates a stacking
 * context, so any z-index inside it is scoped to the sidebar and the page
 * content — later in DOM order — paints over the menu.
 */
export default function WebAddMenu() {
  const { openAdd, isOpen: flowOpen } = useAddFlow()
  const [open, setOpen] = useState(false)
  /* A form opened some other way - E, I, T or Q - closes the menu: it was
     left drawn over the dialog. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (flowOpen) setOpen(false)
  }, [flowOpen])
  const [rect, setRect] = useState(null)
  const wrapRef = useRef(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const closeTimer = useRef(null)
  /* How it opened. The pointer opens it on its way to the button, so a click
     that simply toggled shut the menu hovering had just opened, and the add
     button looked dead on its first press. A click on a menu that hover or
     focus opened keeps it open; a click on one a click opened closes it. */
  const openedBy = useRef(/** @type {'hover'|'focus'|'click'|null} */ (null))
  /* Which item to focus once the menu is drawn, when a key asked for one
     before it was. */
  const focusWanted = useRef(/** @type {'first'|'last'|null} */ (null))
  /* Focus handed back to the button by Escape or Tab must not reopen the
     menu, which focusing the button otherwise does. */
  const quietFocus = useRef(false)

  const measure = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setRect({ top: r.top, left: r.right, height: r.height })
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])

  // Grace period so moving the pointer from the button into the menu, across
  // the gap between them, doesn't dismiss it.
  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 160)
  }, [cancelClose])

  useEffect(() => cancelClose, [cancelClose])

  useEffect(() => {
    if (!open) return
    measure()
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e) => {
      const inWrap = wrapRef.current?.contains(e.target)
      const inMenu = menuRef.current?.contains(e.target)
      if (!inWrap && !inMenu) setOpen(false)
    }
    // The menu is portalled, so it doesn't move with the sidebar on its own.
    const onReflow = () => measure()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, measure])

  /** @param {'first'|'last'|number} which */
  const focusItem = useCallback((which) => {
    const list = itemsOf(menuRef.current)
    if (!list.length) { if (typeof which === 'string') focusWanted.current = which; return }
    focusWanted.current = null
    const at = which === 'first' ? 0 : which === 'last' ? list.length - 1 : which
    list[(at + list.length) % list.length].focus()
  }, [])

  // A key opened it: focus the item it asked for once the menu is there.
  useEffect(() => {
    if (open && rect && focusWanted.current) focusItem(focusWanted.current)
  }, [open, rect, focusItem])

  const backToButton = useCallback(() => {
    quietFocus.current = true
    btnRef.current?.focus()
    quietFocus.current = false
  }, [])

  /** @param {import('react').KeyboardEvent} e */
  function onButtonKey(e) {
    if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) return
    e.preventDefault()
    openedBy.current = 'click'
    setOpen(true)
    focusItem(e.key === 'ArrowUp' ? 'last' : 'first')
  }

  /** @param {import('react').KeyboardEvent} e */
  function onMenuKey(e) {
    const list = itemsOf(menuRef.current)
    const at = list.indexOf(/** @type {HTMLElement} */ (document.activeElement))
    if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(at + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(at < 0 ? list.length - 1 : at - 1) }
    else if (e.key === 'Home') { e.preventDefault(); focusItem('first') }
    else if (e.key === 'End') { e.preventDefault(); focusItem('last') }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); backToButton() }
    /* The menu sits at the end of the page, so Tab from it would leave the
       app. From the button instead: the browser then moves on to whatever
       follows (or, with Shift, precedes) the button. */
    else if (e.key === 'Tab') { setOpen(false); backToButton() }
  }

  function pick(key) {
    setOpen(false)
    openAdd(key)
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => { cancelClose(); if (!open) openedBy.current = 'hover'; setOpen(true) }}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={btnRef}
        onClick={() => {
          if (open && openedBy.current !== 'click') { openedBy.current = 'click'; return }
          openedBy.current = open ? null : 'click'
          setOpen(!open)
        }}
        onFocus={() => { if (quietFocus.current) return; if (!open) openedBy.current = 'focus'; setOpen(true) }}
        onKeyDown={onButtonKey}
        aria-haspopup="menu"
        aria-label="Add transaction"
        aria-expanded={open}
        className="w-full h-10 rounded-xl flex items-center justify-center gap-2
          text-sm font-semibold text-white
          active:scale-[0.98] transition-transform duration-100"
        style={{ background: 'var(--color-primary)' }}
      >
        <WebIconPlus />
        <span className="web-add-label">Add transaction</span>
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Add transaction"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onKeyDown={onMenuKey}
          className="card-solid fixed z-[240] w-[224px] p-1.5 rounded-xl"
          style={{
            top: rect.top,
            // 8px gap; the wrapper's own padded strip bridges it for the pointer.
            left: rect.left + 8,
          }}
        >
          {FLOWS.map(f => (
            <button
              key={f.key}
              role="menuitem"
              // Reached by the arrow keys, not by Tab (the APG's roving focus).
              tabIndex={-1}
              onClick={() => pick(f.key)}
              className="w-full flex items-center gap-2.5 px-2.5 h-11 rounded-lg text-left
                hover:bg-slate-100 dark:hover:bg-white/[0.07]
                focus-visible:bg-slate-100 dark:focus-visible:bg-white/[0.07]
                transition-colors duration-100"
            >
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center
                text-sm font-bold shrink-0
                bg-slate-100 dark:bg-white/[0.07] ${f.tone}`}>
                {f.sign}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-13 font-semibold text-slate-800 dark:text-white leading-tight">
                  {f.label}
                </span>
                <span className="block text-10 text-slate-500 dark:text-slate-400 truncate">
                  {f.hint}
                </span>
              </span>
              {/* The key that opens it from anywhere (AddFlow). */}
              <kbd className="shrink-0 min-w-[20px] h-5 px-1 rounded-md text-10 font-semibold leading-5 text-center
                text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.07]">{f.kbd}</kbd>
            </button>
          ))}
        </div>,
        document.body,
      )}

      {/* Keeps hover alive while the pointer crosses the gap to the menu. */}
      {open && (
        <span aria-hidden="true" className="absolute left-full top-0 w-3 h-full" />
      )}
    </div>
  )
}
