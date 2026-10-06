import { Link } from 'react-router-dom'
import { accountBrand } from '../../lib/accountBrands'
import { normalizeDesign } from '../../lib/cardDesigns'
import BrandMark from '../../components/BrandMark'
import BrandWatermark from '../../components/BrandWatermark'
import BudgetMeter, { budgetTone } from '../../components/BudgetMeter'
import CategoryGlyph from '../../components/CategoryGlyph'
import Card from '../../components/ui/Card'
import { EmptyArt } from '../../components/ui/EmptyState'
import { RowDivider } from '../../components/ui/Presence'
import RollingNumber from '../../components/ui/RollingNumber'
import { useSwap } from '../../components/ui/useSwap'
import { fmt, fmtHidden } from '../../lib/money'
import { ACCOUNT_ICON, fmtDate } from './shared'
import { currencyOfTx } from '../../lib/fxContext'
import { txRowWords, planWords } from '../../lib/txRow'
import { interestCarried } from '../../lib/loans'
import { isRefund } from '../../lib/txMoney'
import { INVESTMENT_KIND_LABEL } from '../../lib/accountMeta'
import { planFactor } from '../../utils/installments'

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
  /* A loan reads what is owed (its balance is stored negative); an
     investment reads its value, labelled with what kind it is. */
  const isLoan = acct.type === 'loan'
  const isInvestment = acct.type === 'investment'
  const figure = isCredit ? available : isLoan ? -(acct.balance ?? 0) : (acct.balance ?? 0)
  const figureLabel = isCredit ? 'Available' : isLoan ? 'Owed' : isInvestment ? 'Value' : 'Balance'

  const meta  = ACCOUNT_ICON[acct.type] ?? ACCOUNT_ICON.bank
  const kindLabel = isInvestment ? (INVESTMENT_KIND_LABEL[acct.kind] ?? meta.label) : meta.label
  const brand = accountBrand(acct)
  // The rail's eye button: the figure swaps through a blur - ui/useSwap.
  const swap  = useSwap(hidden)

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
        <p className="text-10 font-medium text-white/65 truncate">{kindLabel}</p>
      </div>

      <p className="text-13 font-semibold truncate mt-2">{acct.name}</p>

      <div className="mt-auto pt-1">
        <p className="text-10 font-semibold text-white/60 mb-0.5">
          {figureLabel}
        </p>
        <p key={hidden ? 'h' : 's'} className={`${swap} text-17 font-bold tabular-nums leading-none`}>
          {/* Its own id: this face shows what is AVAILABLE on a card, the
              Accounts face what is owed, so the two are different figures. */}
          {hidden ? fmtHidden(acct.currency) : (
            <RollingNumber
              id={`home-card:${acct.id}:${acct.currency}`}
              value={figure}
              format={v => fmt(v, acct.currency)}
            />
          )}
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
export function BudgetSummaryTile({ totals }) {
  const hasBudget = totals.budget > 0
  const pct = Math.round(totals.pct)
  const { textClass } = budgetTone(totals.pct)

  if (!hasBudget) {
    return (
      <Card as={Link} to="/settings" padding="md" interactive className="block">
        <p className="text-15 text-slate-800 dark:text-white">
          No <span className="font-bold">spending budget</span> set
        </p>
        <p className="text-12 text-slate-500 dark:text-slate-400 mt-0.5">
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
          <p className="text-15 text-slate-800 dark:text-white">
            Using <span className={`font-bold ${textClass}`}>{pct}%</span> of spending budget
          </p>
          <p className="text-12 text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {fmt(totals.spent)} of {fmt(totals.budget)}
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

/** @param {{tx: Record<string, any>, cat?: Record<string, any>, glyph?: Record<string, any>|null, isLast?: boolean}} props */
export function TxRow({ tx, cat, glyph = cat, isLast }) {
  const words = txRowWords(tx, cat)
  // An installment plan's purchase: its name, its term, its whole price (utils/installments).
  const plan = planWords(tx)
  const title = plan?.title ?? words.title
  const { where } = words
  const kind = plan ? `${fmt(plan.each, currencyOfTx(tx))} × ${plan.count}` : words.kind
  /* A refund is a negative expense (lib/txMoney.js): money back, so it reads
     as the Transactions list reads it - green, with a plus - not as "-−". */
  const refund     = isRefund(tx)
  const isExpense  = tx.type === 'expense' && !refund
  const isInflow   = tx.type === 'inflow' || refund
  const amountCls  = isExpense  ? 'text-red-500 dark:text-red-400'
    : isInflow  ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-primary'
  // U+2212, the minus the Transactions list and Next 30 days use, not a hyphen.
  const amountSign = isExpense ? '−' : isInflow ? '+' : ''

  return (
    <>
    <div className="flex items-center gap-3 px-4 py-3.5">
      {/* category icon */}
      <div
        className="cat-tile w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{ '--cat-color': glyph?.color ?? '#64748b' }}
      >
        <CategoryGlyph cat={glyph} size={18} emoji="💸" />
      </div>

      {/* description + account */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {title}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
          {where}{kind ? ` · ${kind}` : ''}
        </p>
      </div>

      {/* amount + date */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold tabular-nums ${amountCls}`}>
          {amountSign}{fmt(Math.abs((tx.amount ?? 0) * planFactor(tx) + interestCarried(tx)), currencyOfTx(tx))}
        </p>
        <p className="text-11 text-slate-400 dark:text-slate-500 mt-0.5">
          {fmtDate(tx.date)}
        </p>
      </div>
    </div>
    {/* A slot rather than a condition: when the last row leaves, the one
        above it loses its line with the same motion - ui/Presence.jsx. */}
    <RowDivider hidden={isLast} />
    </>
  )
}

// ── Empty states ───────────────────────────────────────────────────────────────

/* Where the first account card would be, the size of one, with the wallet
   every other "no accounts" moment draws. */
export function EmptyPill({ label }) {
  return (
    <div className="card shrink-0 h-24 w-36 rounded-2xl flex flex-col items-center justify-center gap-0.5 border-dashed">
      <EmptyArt name="wallet" size={48} />
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
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

/** Two arrows passing: the wallet's switch between what you have and what you owe. */
export function IconFlipSides({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 20V4" />
      <path d="M3 8l4-4 4 4" />
      <path d="M17 4v16" />
      <path d="M13 16l4 4 4-4" />
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
