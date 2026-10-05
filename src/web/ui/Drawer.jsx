import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Btn from './Button'
import { IX } from './icons'

/**
 * A detail panel docked to the right of the window, over the page: a row's
 * details beside the table it came from, without leaving it.
 *
 * Escape and the scrim close it; focus moves into it on open and back to
 * where it was on close. A phone sheet opened from inside it (a confirm, a
 * picker) sits above it, and Escape there closes only that.
 *
 * @param {{open: boolean, onClose: () => void, title?: import('react').ReactNode, actions?: import('react').ReactNode,
 *          footer?: import('react').ReactNode, children: import('react').ReactNode, width?: number, label?: string}} props
 */
export default function Drawer({ open, onClose, title, actions, footer, children, width, label }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  useEffect(() => {
    if (!open) return
    const before = /** @type {HTMLElement|null} */ (document.activeElement)
    ref.current?.focus({ preventScroll: true })
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      // A modal (a phone sheet) above the drawer owns Escape.
      if (document.querySelector('.sheet-panel')) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      before?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <>
      <div className="d-drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === 'string' ? title : undefined)}
        tabIndex={-1}
        className="d-drawer outline-none"
        style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}
      >
        <div className="d-drawer-head">
          <div className="min-w-0 text-[15px] font-semibold text-[var(--d-text)] truncate">{title}</div>
          <div className="flex items-center gap-1 shrink-0">
            {actions}
            <Btn variant="ghost" size="sm" icon={<IX size={16} />} label="Close" onClick={onClose} />
          </div>
        </div>
        <div className="d-drawer-body">{children}</div>
        {footer && <div className="d-drawer-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  )
}
