import { forwardRef } from 'react'
import { ISearch, IX } from './icons'

/**
 * The desktop's small controls: a segmented switch, underline tabs, a
 * search field, a key cap.
 */

/**
 * Two to five choices side by side, one on.
 *
 * @template {string} V
 * @param {{options: Array<{value: V, label: import('react').ReactNode}>, value: V, onChange: (v: V) => void, label?: string, className?: string}} props
 */
export function Segmented({ options, value, onChange, label, className = '' }) {
  return (
    <div className={`d-seg ${className}`} role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className="d-seg-item"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Tabs under a page's header: the sections of one thing.
 *
 * @template {string} V
 * @param {{tabs: Array<{value: V, label: import('react').ReactNode, count?: number}>, value: V, onChange: (v: V) => void, label?: string, className?: string}} props
 */
export function Tabs({ tabs, value, onChange, label, className = '' }) {
  const onKey = (/** @type {import('react').KeyboardEvent} */ e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const at = tabs.findIndex(t => t.value === value)
    const next = tabs[(at + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]
    onChange(next.value)
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.currentTarget).querySelector(`[data-tab="${next.value}"]`))
    el?.focus()
  }
  return (
    <div className={`d-tabs ${className}`} role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map(t => (
        <button
          key={t.value}
          type="button"
          role="tab"
          data-tab={t.value}
          aria-selected={t.value === value}
          tabIndex={t.value === value ? 0 : -1}
          className="d-tab"
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 d-cell-faint d-num">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * A search field with its icon and a clear button.
 */
export const SearchInput = forwardRef(/** @param {{value: string, onChange: (v: string) => void, placeholder?: string,
  className?: string, autoFocus?: boolean, onKeyDown?: (e: import('react').KeyboardEvent<HTMLInputElement>) => void, label?: string}} props */
function SearchInput({ value, onChange, placeholder = 'Search', className = '', autoFocus, onKeyDown, label }, ref) {
  return (
    <div className={`d-input-wrap ${className}`}>
      <ISearch size={15} />
      <input
        ref={ref}
        type="search"
        className="d-input"
        style={{ paddingRight: value ? 30 : undefined }}
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) { e.stopPropagation(); onChange('') }
          onKeyDown?.(e)
        }}
      />
      {value && (
        <button
          type="button"
          className="absolute right-1.5 w-6 h-6 rounded-md flex items-center justify-center text-[var(--d-text-3)] hover:bg-[var(--d-hover)] hover:text-[var(--d-text)]"
          aria-label="Clear search"
          onClick={() => onChange('')}
        >
          <IX size={13} />
        </button>
      )}
    </div>
  )
})

/** A key on the keyboard, as a hint. @param {{children: import('react').ReactNode}} props */
export const Kbd = ({ children }) => <kbd className="d-kbd">{children}</kbd>

/** Ctrl on Windows and Linux, ⌘ on a Mac. */
export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'
