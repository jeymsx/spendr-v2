import { cloneElement, createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** What a menu item needs from the menu it is in: a way to close it - and,
 *  for a popover opened from inside this one, whose it is (`owner`). */
const PopoverCtx = createContext(/** @type {{close: () => void, owner: string|null}} */ ({ close: () => {}, owner: null }))
export const usePopover = () => useContext(PopoverCtx)

/**
 * Something that opens from a trigger and floats over the page: a menu, a
 * filter, a picker, a small form.
 *
 * Portalled to the body and placed from the trigger's rect - below it, or
 * above when there is no room - so no panel's overflow or stacking clips it.
 * Closes on Escape (focus goes back to the trigger), on a press outside, and
 * on Tab out of a menu. A popover opened from inside another (a date field in
 * a filter) is portalled too, so is not inside the outer one's box: a press
 * in it is still not "outside" the outer, which stays open under it. A menu's items move with the arrow keys, Home and End.
 *
 * `trigger` is an element (a Btn, usually); it gets the ref, the click and
 * the aria attributes. `children` is the content, or a function of `close`.
 * Or, for a picker its caller opens itself (a phone sheet's `open`, shown as
 * a menu on a computer): no trigger, an `anchor` element to drop from, and
 * `open` and `onOpenChange` from the caller.
 *
 * A menu's checked item (or else its first) has the focus as it opens - a
 * frame later, since the popover is drawn hidden for its first frame, to be
 * measured, and nothing hidden takes focus.
 *
 * @param {{trigger?: import('react').ReactElement, anchor?: HTMLElement|null, children: import('react').ReactNode | ((close: () => void) => import('react').ReactNode),
 *          align?: 'start'|'end', width?: number, role?: 'menu'|'dialog'|'listbox', label?: string,
 *          className?: string, open?: boolean, onOpenChange?: (open: boolean) => void, offset?: number,
 *          focusFirst?: boolean}} props
 */
export default function Popover({
  trigger, anchor = null, children, align = 'start', width, role = 'dialog', label, className = '',
  open: openProp, onOpenChange, offset = 6, focusFirst = role === 'menu',
}) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = useCallback((/** @type {boolean} */ v) => { setOpenState(v); onOpenChange?.(v) }, [onOpenChange])
  const close = useCallback(() => setOpen(false), [setOpen])
  const triggerRef = useRef(/** @type {HTMLElement|null} */ (null))
  const setTrigger = useCallback((/** @type {HTMLElement|null} */ node) => { triggerRef.current = node }, [])
  // An anchor stands where a trigger would: it is what the popover drops from and returns focus to.
  useLayoutEffect(() => { if (anchor) triggerRef.current = anchor }, [anchor])
  const popRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const popId = `d-pop-${useId().replace(/[^a-z0-9]/gi, '')}`
  const { owner } = useContext(PopoverCtx)
  const [pos, setPos] = useState(/** @type {{top: number, left: number}|null} */ (null))

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    const pop = popRef.current
    if (!r || !pop) return
    const w = pop.offsetWidth
    const h = pop.offsetHeight
    let left = align === 'end' ? r.right - w : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    let top = r.bottom + offset
    if (top + h > window.innerHeight - 8 && r.top - offset - h > 8) top = r.top - offset - h
    setPos({ top: Math.round(top), left: Math.round(left) })
  }, [align, offset])

  // Placed before the first paint; until then it is drawn hidden at 0,0 to be measured.
  useLayoutEffect(() => { if (open) place() }, [open, place])

  useEffect(() => {
    if (!open) return
    let raf = 0
    if (focusFirst) {
      raf = requestAnimationFrame(() => {
        const pop = popRef.current
        const first = /** @type {HTMLElement|null} */ (pop?.querySelector('[role^="menuitem"][aria-checked="true"]:not([disabled])')
          ?? pop?.querySelector('[role^="menuitem"]:not([disabled]), [role="option"]') ?? null)
        first?.focus({ preventScroll: true })
        first?.scrollIntoView?.({ block: 'nearest' })
      })
    }
    const onDown = (/** @type {MouseEvent} */ e) => {
      const t = /** @type {Node} */ (e.target)
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      // In a popover opened from this one, or from one opened from it: still inside.
      let pop = /** @type {HTMLElement|null} */ (/** @type {any} */ (t).closest?.('.d-pop') ?? null)
      while (pop && pop !== popRef.current) {
        const up = /** @type {HTMLElement} */ (pop).dataset.owner
        pop = up ? document.getElementById(up) : null
      }
      if (pop) return
      close()
    }
    const onReflow = () => place()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, close, place, focusFirst])

  const onKey = (/** @type {import('react').KeyboardEvent} */ e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      triggerRef.current?.focus()
      return
    }
    if (role !== 'menu') return
    const items = /** @type {HTMLElement[]} */ ([...(popRef.current?.querySelectorAll('[role^="menuitem"]:not([disabled])') ?? [])])
    const at = items.indexOf(/** @type {HTMLElement} */ (document.activeElement))
    const go = (/** @type {number} */ i) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus() }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at < 0 ? items.length - 1 : at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
    else if (e.key === 'Tab') close()
  }

  const t = trigger?.props ?? {}
  // The callbacks handed to the trigger read refs when they run, not now.
  // eslint-disable-next-line react-hooks/refs
  const triggerEl = trigger && cloneElement(trigger, {
    // The trigger's own ref, if it had one, is not kept: none of the callers set one.
    ref: setTrigger,
    onClick: (/** @type {import('react').MouseEvent} */ e) => { t.onClick?.(e); setOpen(!open) },
    'aria-expanded': open,
    'aria-haspopup': role === 'menu' ? 'menu' : role === 'listbox' ? 'listbox' : 'dialog',
  })

  return (
    <>
      {triggerEl}
      {open && createPortal(
        <PopoverCtx.Provider value={{ close, owner: popId }}>
          <div
            ref={popRef}
            id={popId}
            data-owner={owner ?? undefined}
            role={role}
            aria-label={label}
            onKeyDown={onKey}
            className={`d-pop fixed z-[260] ${role === 'menu' ? 'd-menu' : ''} ${className}`}
            style={{ width, ...(pos ?? { top: 0, left: 0, visibility: /** @type {const} */ ('hidden') }) }}
          >
            {typeof children === 'function' ? children(close) : children}
          </div>
        </PopoverCtx.Provider>,
        document.body,
      )}
    </>
  )
}

/**
 * A row in a menu. Picking it closes the menu first, then acts.
 *
 * @param {{icon?: import('react').ReactNode, onSelect?: () => void, danger?: boolean, kbd?: string,
 *          checked?: boolean, keepOpen?: boolean, disabled?: boolean, children: import('react').ReactNode,
 *          hint?: import('react').ReactNode}} props
 */
export function MenuItem({ icon, onSelect, danger = false, kbd, checked, keepOpen = false, disabled = false, hint, children }) {
  const { close } = usePopover()
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked === undefined ? undefined : checked}
      disabled={disabled}
      onClick={() => { if (!keepOpen) close(); onSelect?.() }}
      className={`d-menu-item${danger ? ' is-danger' : ''}`}
    >
      {icon}
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {hint && <span className="text-12 d-cell-faint shrink-0">{hint}</span>}
      {checked && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--d-accent)]"><path d="M20 6 9 17l-5-5" /></svg>}
      {kbd && <span className="d-kbd">{kbd}</span>}
    </button>
  )
}

export const MenuSep = () => <div className="d-menu-sep" role="separator" />
/** @param {{children: import('react').ReactNode}} props */
export const MenuLabel = ({ children }) => <div className="d-menu-label">{children}</div>
