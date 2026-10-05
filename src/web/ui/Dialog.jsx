import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * A small centred dialog: a question and its answers. For a confirm before
 * something destructive, or a short form.
 *
 * Escape and the scrim cancel; focus moves to the dialog's first button
 * marked `data-autofocus`, or the dialog itself, and back on close.
 *
 * @param {{open: boolean, onClose: () => void, title: import('react').ReactNode, children?: import('react').ReactNode,
 *          actions?: import('react').ReactNode, width?: number}} props
 */
export default function Dialog({ open, onClose, title, children, actions, width = 420 }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  useEffect(() => {
    if (!open) return
    const before = /** @type {HTMLElement|null} */ (document.activeElement)
    const target = /** @type {HTMLElement|null} */ (ref.current?.querySelector('[data-autofocus]') ?? ref.current)
    target?.focus({ preventScroll: true })
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      before?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[290] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[rgba(15,23,42,0.24)] dark:bg-black/55" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className="d-pop relative w-full outline-none"
        style={{ maxWidth: width }}
      >
        <div className="px-5 pt-5 pb-1">
          <h2 className="text-[15px] font-semibold text-[var(--d-text)]">{title}</h2>
          {children && <div className="mt-2 text-13 text-[var(--d-text-2)] leading-relaxed">{children}</div>}
        </div>
        {actions && <div className="flex justify-end gap-2 px-5 pt-4 pb-5">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}
