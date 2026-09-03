import { useState, useRef, useEffect, useCallback } from 'react'
import { useAddFlow } from './AddFlow'
import { WebIconPlus } from './WebIcons'

const FLOWS = [
  { key: 'expense',  label: 'Expense',  hint: 'Money out',    sign: '−', tone: 'text-red-500 dark:text-red-400' },
  { key: 'inflow',   label: 'Income',   hint: 'Money in',     sign: '+', tone: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'transfer', label: 'Transfer', hint: 'Between accounts', sign: '⇄', tone: 'text-primary' },
]

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
 */
export default function WebAddMenu() {
  const { openAdd } = useAddFlow()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const closeTimer = useRef(null)

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
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  function pick(key) {
    setOpen(false)
    openAdd(key)
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => { cancelClose(); setOpen(true) }}
      onMouseLeave={scheduleClose}
    >
      <button
        onClick={() => setOpen(o => !o)}
        onFocus={() => setOpen(true)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-full h-10 rounded-xl flex items-center justify-center gap-2
          text-sm font-semibold text-white
          active:scale-[0.98] transition-transform duration-100"
        style={{ background: 'var(--color-primary)' }}
      >
        <WebIconPlus />
        Add transaction
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Add transaction"
          className="absolute left-0 right-0 top-full mt-1.5 z-50 p-1.5
            rounded-xl border border-slate-200/80 dark:border-white/[0.08]
            bg-white dark:bg-[#111820]"
          style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.32)' }}
        >
          {FLOWS.map(f => (
            <button
              key={f.key}
              role="menuitem"
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
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-slate-800 dark:text-white leading-tight">
                  {f.label}
                </span>
                <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">
                  {f.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
