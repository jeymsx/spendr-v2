import CategoryGlyph from '../../components/CategoryGlyph'
import BrandMark from '../../components/BrandMark'
import { accountBrand } from '../../lib/accountBrands'
import { fmt } from '../../lib/money'

/**
 * Small display pieces every desktop page shares: a figure, an amount, an
 * empty state, a progress bar, an account's and a category's tile.
 */

/**
 * A key figure: its label, the number, a line under it.
 *
 * @param {{label: import('react').ReactNode, value: import('react').ReactNode, note?: import('react').ReactNode,
 *          tone?: 'pos'|'neg'|'warn'|null, icon?: import('react').ReactNode, className?: string, children?: import('react').ReactNode}} props
 */
export function Stat({ label, value, note, tone = null, icon, className = '', children }) {
  return (
    <div className={`d-panel px-4 py-3.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="d-stat-label">{label}</span>
        {icon && <span className="text-[var(--d-text-3)]">{icon}</span>}
      </div>
      <div className={`d-stat-value truncate ${tone ? `d-${tone}` : ''}`}>{value}</div>
      {note && <div className="d-stat-note truncate">{note}</div>}
      {children}
    </div>
  )
}

/**
 * An amount with its sign and colour: money out red with a minus, in green
 * with a plus, a transfer neutral. `kind` is what the money did.
 *
 * @param {{value: number, currency?: string, kind?: 'out'|'in'|'refund'|'transfer'|'neutral', sign?: boolean, className?: string}} props
 */
export function Amount({ value, currency, kind = 'neutral', sign = true, className = '' }) {
  const mag = Math.abs(value ?? 0)
  const s = !sign ? '' : kind === 'out' ? '−' : kind === 'in' || kind === 'refund' ? '+' : ''
  const tone = kind === 'out' ? 'd-neg' : kind === 'in' || kind === 'refund' ? 'd-pos' : ''
  return <span className={`d-num whitespace-nowrap ${tone} ${className}`}>{s}{fmt(mag, currency)}</span>
}

/**
 * A plain figure, signed only when it is negative - a balance, a total.
 *
 * @param {{value: number, currency?: string, className?: string, colour?: boolean}} props
 */
export function Money({ value, currency, className = '', colour = false }) {
  const v = value ?? 0
  return (
    <span className={`d-num whitespace-nowrap ${colour && v < 0 ? 'd-neg' : ''} ${className}`}>
      {v < 0 ? '−' : ''}{fmt(Math.abs(v), currency)}
    </span>
  )
}

/**
 * Nothing here yet: an icon in a soft square, a line saying so, a way on.
 *
 * @param {{icon?: import('react').ReactNode, title: import('react').ReactNode, body?: import('react').ReactNode,
 *          action?: import('react').ReactNode, className?: string}} props
 */
export function Empty({ icon, title, body, action, className = '' }) {
  return (
    <div className={`d-empty ${className}`}>
      {icon && <div className="d-empty-icon">{icon}</div>}
      <div className="d-empty-title">{title}</div>
      {body && <div className="d-empty-body">{body}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/**
 * A thin bar. `value` 0-100; over 100 fills it. `color` defaults to the accent.
 *
 * @param {{value: number, color?: string, className?: string, label?: string}} props
 */
export function Progress({ value, color, className = '', label }) {
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <div className={`d-progress ${className}`} role={label ? 'progressbar' : undefined} aria-label={label}
      aria-valuenow={label ? Math.round(value || 0) : undefined} aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? 100 : undefined}>
      <span style={{ width: `${v}%`, background: color }} />
    </div>
  )
}

/**
 * An account's tile: its brand gradient with its mark - the card face,
 * shrunk to a chip that sits beside its name in a row.
 *
 * @param {{account: Record<string, any>|null|undefined, size?: 'sm'|'md'|'lg', className?: string}} props
 */
export function AccountTile({ account, size = 'md', className = '' }) {
  const brand = account ? accountBrand(account) : null
  const px = size === 'sm' ? 12 : size === 'lg' ? 20 : 15
  return (
    <span
      className={`d-tile ${size === 'sm' ? 'd-tile-sm' : size === 'lg' ? 'd-tile-lg' : ''} ${className}`}
      style={{ background: brand ? `linear-gradient(135deg, ${brand.from}, ${brand.to})` : '#64748b' }}
      aria-hidden="true"
    >
      <BrandMark mark={brand?.mark ?? 'bank'} size={px} />
    </span>
  )
}

/**
 * A category's tile: its glyph in its colour on a wash of it.
 *
 * @param {{cat: Record<string, any>|null|undefined, size?: 'sm'|'md'|'lg', className?: string}} props
 */
export function CategoryTile({ cat, size = 'md', className = '' }) {
  const px = size === 'sm' ? 12 : size === 'lg' ? 20 : 15
  return (
    <span
      className={`d-tile cat-tile ${size === 'sm' ? 'd-tile-sm' : size === 'lg' ? 'd-tile-lg' : ''} ${className}`}
      style={{ '--cat-color': cat?.color ?? '#64748b' }}
      aria-hidden="true"
    >
      <CategoryGlyph cat={cat} size={px} emoji="💸" />
    </span>
  )
}

/** A grey block standing in for something loading. @param {{className?: string}} props */
export function Skeleton({ className = '' }) {
  return <span className={`d-skel block ${className}`} aria-hidden="true" />
}
