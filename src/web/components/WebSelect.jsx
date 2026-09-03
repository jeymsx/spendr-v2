import {
  useState, useRef, useEffect, useLayoutEffect, useCallback, useId,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * Themed dropdown, replacing <select> in the desktop toolbars.
 *
 * A native select styles its closed box fine but its open popup is drawn by
 * the OS — white, system font, square corners — which looked pasted on next to
 * the dark toolbar. This renders the list itself so it matches, and keeps the
 * closed control at h-9 so it lines up with the search field and filter chips.
 *
 * The popup is portalled to body and positioned from the trigger's rect. Same
 * reason as WebAddMenu: ancestors with backdrop-filter create stacking
 * contexts and containing blocks, so an absolutely-positioned popup gets
 * painted over or clipped depending on where the control happens to sit.
 *
 * Keyboard support is the part a div can lose by accident, so it is explicit:
 * Enter/Space/Arrow opens, Up/Down move, Home/End jump, typing a letter jumps
 * to the next option starting with it, Enter commits, Escape closes. Escape
 * calls stopPropagation so a page-level Escape handler doesn't also fire.
 *
 * options: [{ value, label }] — value '' is a legitimate "all" choice.
 */
export default function WebSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
  minWidth = 150,
}) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const listRef = useRef(null)
  const typed = useRef({ str: '', at: 0 })
  const listId = useId()

  const selectedIdx = options.findIndex(o => o.value === value)
  const current = selectedIdx >= 0 ? options[selectedIdx] : options[0]

  const measure = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.max(r.width, minWidth)
    // Flip above when the list wouldn't fit below.
    const estimate = Math.min(options.length * 34 + 8, 280)
    const below = window.innerHeight - r.bottom - 12
    const flip = below < estimate && r.top > below
    setPos({
      top: flip ? undefined : r.bottom + 4,
      bottom: flip ? window.innerHeight - r.top + 4 : undefined,
      left: Math.min(r.left, window.innerWidth - width - 8),
      width,
      maxHeight: Math.max(140, flip ? r.top - 12 : below),
    })
  }, [minWidth, options.length])

  useLayoutEffect(() => { if (open) measure() }, [open, measure])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onReflow = () => measure()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, measure])

  // Keep the highlighted row in view when arrowing through a long month list.
  useEffect(() => {
    if (!open || activeIdx < 0) return
    listRef.current
      ?.querySelector(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIdx])

  function openWith(idx) {
    setActiveIdx(idx)
    setOpen(true)
  }

  function commit(idx) {
    const opt = options[idx]
    if (opt) onChange(opt.value)
    setOpen(false)
    btnRef.current?.focus()
  }

  function onKeyDown(e) {
    const last = options.length - 1
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openWith(selectedIdx >= 0 ? selectedIdx : 0)
      }
      return
    }
    switch (e.key) {
      case 'Escape':
        // Don't let the page's own Escape handler act on the same press.
        e.preventDefault(); e.stopPropagation()
        setOpen(false); btnRef.current?.focus()
        break
      case 'Tab':
        setOpen(false)
        break
      case 'ArrowDown':
        e.preventDefault(); setActiveIdx(i => (i >= last ? 0 : i + 1))
        break
      case 'ArrowUp':
        e.preventDefault(); setActiveIdx(i => (i <= 0 ? last : i - 1))
        break
      case 'Home':
        e.preventDefault(); setActiveIdx(0)
        break
      case 'End':
        e.preventDefault(); setActiveIdx(last)
        break
      case 'Enter':
      case ' ':
        e.preventDefault(); commit(activeIdx)
        break
      default: {
        if (e.key.length !== 1 || e.altKey || e.ctrlKey || e.metaKey) break
        // Type-ahead: consecutive keys within a second build a prefix.
        const now = e.timeStamp
        const str = (now - typed.current.at < 1000 ? typed.current.str : '') + e.key.toLowerCase()
        typed.current = { str, at: now }
        const hit = options.findIndex(o => o.label.toLowerCase().startsWith(str))
        if (hit >= 0) setActiveIdx(hit)
      }
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openWith(selectedIdx >= 0 ? selectedIdx : 0))}
        onKeyDown={onKeyDown}
        className={[
          'h-9 pl-3 pr-2 rounded-xl text-xs font-medium inline-flex items-center gap-2',
          'bg-white dark:bg-white/[0.06] text-slate-700 dark:text-slate-200',
          'border outline-none transition-colors duration-150',
          open
            ? 'border-primary'
            : 'border-slate-200 dark:border-white/[0.09] hover:border-slate-300 dark:hover:border-white/[0.16]',
          'focus-visible:border-primary',
          className,
        ].join(' ')}
      >
        <span className="truncate max-w-[150px]">{current?.label ?? ''}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-slate-500 dark:text-slate-400 transition-transform duration-150
            ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="card-solid fixed z-[250] p-1 overflow-y-auto no-scrollbar rounded-xl"
          style={{
            top: pos.top, bottom: pos.bottom, left: pos.left,
            width: pos.width, maxHeight: pos.maxHeight,
          }}
        >
          {options.map((o, i) => {
            const isSel = o.value === value
            return (
              <button
                key={`${o.value}-${i}`}
                type="button"
                role="option"
                data-idx={i}
                aria-selected={isSel}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => commit(i)}
                className={[
                  'w-full flex items-center gap-2 px-2.5 h-8 rounded-lg text-left text-xs',
                  'transition-colors duration-100',
                  i === activeIdx ? 'bg-slate-100 dark:bg-white/[0.07]' : '',
                  isSel
                    ? 'font-semibold text-primary'
                    : 'font-medium text-slate-700 dark:text-slate-200',
                ].join(' ')}
              >
                <span className="flex-1 truncate">{o.label}</span>
                {isSel && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
