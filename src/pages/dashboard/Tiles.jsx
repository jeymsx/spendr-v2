import { Link } from 'react-router-dom'
import { accountBrand } from '../../lib/accountBrands'
import { normalizeDesign } from '../../lib/cardDesigns'
import BrandMark from '../../components/BrandMark'
import BrandWatermark from '../../components/BrandWatermark'
import BudgetMeter, { budgetTone } from '../../components/BudgetMeter'
import CategoryGlyph from '../../components/CategoryGlyph'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import { fmt } from '../../lib/money'
import { ACCOUNT_ICON, fmtDate } from './shared'

// ── Section header ─────────────────────────────────────────────────────────────

export function SectionHeader({ title, subtitle, actionLabel, actionTo, right = null, px = false }) {
  return (
    <div className={`flex items-baseline justify-between ${px ? 'px-5' : ''}`}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold text-slate-800 dark:text-white">{title}</h2>
        {subtitle && (
          <span className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</span>
        )}
      </div>
      {/* A value rather than a link. Upcoming puts its total here, where
          every other section on this screen puts its "See all". */}
      {right}
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="text-xs font-medium text-primary dark:text-primary active:opacity-70"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

// ── Account card ───────────────────────────────────────────────────────────────

/**
 * The home carousel card. Same brand face as the Accounts tab, at carousel
 * size, so an account looks like the same object in both places - which is
 * the point of giving them card identities at all.
 */
export function AccountCard({ acct, hidden, onClick, stmt }) {
  const isCredit  = acct.type === 'credit'
  const available = isCredit
    ? (acct.creditLimit ?? 0) - (stmt?.currentBalance ?? 0)
    : null

  const meta  = ACCOUNT_ICON[acct.type] ?? ACCOUNT_ICON.bank
  const brand = accountBrand(acct)

  return (
    <button
      onClick={onClick}
      className="acct-card shrink-0 w-[188px] rounded-2xl px-4 pt-3.5 pb-4 text-left flex flex-col
        text-white"
      style={{
        '--card-from': brand.from,
        '--card-to': brand.to,
        // Slightly taller than a card's true 1.586 so the balance and its
        // label have room to breathe; the Accounts faces keep the exact ratio.
        aspectRatio: '1.45',
      }}
      data-brand={brand.key}
      data-design={normalizeDesign(acct.design)}
      data-compact=""
    >
      <BrandWatermark brand={brand} />

      <div className="flex items-center gap-2">
        <BrandMark mark={brand.mark} size={18} className="shrink-0" />
        <p className="text-[10px] font-medium text-white/65 truncate">{meta.label}</p>
      </div>

      <p className="text-[13px] font-semibold truncate mt-2">{acct.name}</p>

      <div className="mt-auto pt-1">
        <p className="text-[9px] font-semibold text-white/60 mb-0.5">
          {isCredit ? 'Available' : 'Balance'}
        </p>
        <p className="text-[17px] font-bold tabular-nums leading-none">
          {hidden ? '₱ ••••' : fmt(isCredit ? available : acct.balance)}
        </p>
      </div>
    </button>
  )
}

// ── Quick add button ───────────────────────────────────────────────────────────

// ── Budget summary tile ───────────────────────────────────────────────────────

/**
 * The month's budget in one line.
 *
 * The headline is a percentage rather than an amount on purpose: "using 65%"
 * is a judgement you can act on without doing arithmetic, where "₱13,400 of
 * ₱20,600" is two numbers you have to divide first. The amounts are still
 * there underneath for anyone who wants them.
 *
 * With no budgets set this becomes the prompt to set one, because an empty
 * meter would imply everything is fine when nothing is being tracked at all.
 */
export function BudgetSummaryTile({ totals, count }) {
  const hasBudget = totals.budget > 0
  const pct = Math.round(totals.pct)
  const { textClass } = budgetTone(totals.pct)

  if (!hasBudget) {
    return (
      <Card as={Link} to="/settings" padding="md" interactive className="block">
        <p className="text-[15px] text-slate-800 dark:text-white">
          No <span className="font-bold">spending budget</span> set
        </p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
          Set a monthly limit per category in <span className="font-semibold text-primary">Settings</span>
        </p>
        <BudgetMeter pct={0} className="mt-3.5" />
      </Card>
    )
  }

  return (
    <Card
      as={Link}
      to="/budget"
      padding="md"
      interactive
      className="block"
      aria-label={`Using ${pct}% of your spending budget. View the full breakdown.`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] text-slate-800 dark:text-white">
            Using <span className={`font-bold ${textClass}`}>{pct}%</span> of spending budget
          </p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {fmt(totals.spent)} of {fmt(totals.budget)} across {count} categor{count === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <span
          className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center
            bg-white dark:bg-white/[0.08] border border-slate-200/80 dark:border-white/[0.10]
            text-slate-500 dark:text-slate-300 shadow-sm"
          aria-hidden="true"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </span>
      </div>

      <BudgetMeter pct={totals.pct} className="mt-3.5" />
    </Card>
  )
}

// ── Budget chip (compact 2-col grid) ──────────────────────────────────────────

export function TxRow({ tx, cat, isLast }) {
  const isExpense  = tx.type === 'expense'
  const isInflow   = tx.type === 'inflow'
  const amountCls  = isExpense  ? 'text-red-500 dark:text-red-400'
    : isInflow  ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-primary'
  const amountSign = isExpense ? '-' : isInflow ? '+' : ''

  return (
    <>
    <div className="flex items-center gap-3 px-4 py-3.5">
      {/* category icon */}
      <div
        className="cat-tile w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{ '--cat-color': cat?.color ?? '#64748b' }}
      >
        <CategoryGlyph cat={cat} size={18} emoji="💸" />
      </div>

      {/* description + account */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {tx.description || (tx.type === 'transfer' ? `Transfer to ${tx.toAccount ?? ''}` : tx.category) || '—'}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
          {tx.type === 'transfer'
            ? `${tx.fromAccount ?? ''} → ${tx.toAccount ?? ''}`
            : tx.account ?? ''}
        </p>
      </div>

      {/* amount + date */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold tabular-nums ${amountCls}`}>
          {amountSign}{fmt(tx.amount)}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
          {fmtDate(tx.date)}
        </p>
      </div>
    </div>
    {!isLast && <Divider inset="glyph" />}
    </>
  )
}

// ── Empty states ───────────────────────────────────────────────────────────────

export function EmptyPill({ label }) {
  return (
    <div className="card shrink-0 h-24 w-36 rounded-2xl flex items-center justify-center border-dashed">
      <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
    </div>
  )
}

export function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

export function IconEye({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function IconEyeOff({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}
