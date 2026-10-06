import { isInstallmentRow, planFactor } from '../../utils/installments'
import { scheduledCutoff } from '../../utils/scheduled'
import { unfoldLoanPayment, interestCarried } from '../../lib/loans'
import { amountDisplay, isRefund } from '../../lib/txMoney'
import { txGlyphCat, txRowWords, planWords } from '../../lib/txRow'
import { isSpend, isIncome } from '../../lib/flows'
import { txBase, currencyOfTx } from '../../lib/fxContext'
import { fmt } from '../../lib/money'
import { Amount, AccountTile, CategoryTile } from '../ui/display'
import { ITransfer } from '../ui/icons'

/**
 * A transaction row's cells, shared by every desktop table that lists
 * transactions - Transactions, Home's recent rows, an account's and a
 * category's - so a row reads the same wherever it is.
 */

/** "Oct 5", with the year when it is not this one. @param {string} iso */
export function shortDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) })
}

/**
 * What a row's money did, for its colour and sign. `account` is the side
 * an account's own page is looking from: a transfer out of it reads as money
 * out, into it as money in.
 *
 * @param {Record<string, any>} row
 * @param {string|null} [account]
 */
export function moneyOf(row, account = null) {
  const tx = unfoldLoanPayment(row)
  const { magnitude, tone, currency } = amountDisplay(tx, { account })
  const kind = /** @type {'out'|'in'|'refund'|'transfer'} */ (tone)
  // An installment plan's purchase: its whole price, not its first payment (utils/installments).
  return { value: magnitude * planFactor(row) + interestCarried(row), currency, kind }
}

/** Spent and came in, in the ledger's currency. @param {Array<Record<string, any>>} rows */
export function totalsOf(rows) {
  let spent = 0
  let earned = 0
  for (const t of rows) {
    if (isSpend(t)) spent += txBase(t) * planFactor(t)
    else if (isIncome(t)) earned += txBase(t)
  }
  return { spent, earned, net: earned - spent }
}

/**
 * The description cell: the category's tile (or a transfer's arrows), what
 * the row says, and a badge for what is special about it.
 *
 * @param {{tx: Record<string, any>, catMap: Record<string, any>}} props
 */
export function TxDescription({ tx, catMap }) {
  const cat = catMap[tx.category]
  const glyph = txGlyphCat(tx, catMap)
  const plan = planWords(tx)
  const title = plan?.title ?? txRowWords(tx, cat).title
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      {tx.type === 'transfer'
        ? <span className="d-tile d-tile-sm" style={{ background: 'var(--d-sunken)', color: 'var(--d-text-2)' }}><ITransfer size={13} /></span>
        : <CategoryTile cat={glyph} size="sm" />}
      <span className="truncate font-medium">{title}</span>
      {isRefund(tx) && <span className="d-badge d-badge-pos">Refund</span>}
      {plan
        ? <span className="d-badge d-num">{fmt(plan.each, currencyOfTx(tx))} × {plan.count}</span>
        : isInstallmentRow(tx) && <span className="d-badge">Plan</span>}
      {tx.splitId && <span className="d-badge">Split</span>}
      {(tx.date ?? '') > scheduledCutoff() && <span className="d-badge d-badge-accent">Upcoming</span>}
    </span>
  )
}

/**
 * The account cell: the account's tile and name, or a transfer's two sides.
 *
 * @param {{tx: Record<string, any>, acctMap: Record<string, any>}} props
 */
export function TxAccount({ tx, acctMap }) {
  const row = unfoldLoanPayment(tx)
  if (row.type === 'transfer') {
    return (
      <span className="flex items-center gap-1.5 min-w-0 d-cell-muted">
        <span className="truncate">{row.fromAccount}</span>
        <span className="d-cell-faint">→</span>
        <span className="truncate">{row.toAccount}</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-2 min-w-0">
      <AccountTile account={acctMap[row.account] ?? { name: row.account }} size="sm" />
      <span className="truncate d-cell-muted">{row.account}</span>
    </span>
  )
}

/** The amount cell. @param {{tx: Record<string, any>, account?: string|null}} props */
export function TxAmount({ tx, account = null }) {
  const m = moneyOf(tx, account)
  return <Amount value={m.value} currency={m.currency} kind={m.kind} className="font-semibold" />
}

/** A category's dot and name, for a row that cannot be refiled. @param {{tx: Record<string, any>, catMap: Record<string, any>}} props */
export function TxCategoryText({ tx, catMap }) {
  if (tx.type === 'transfer') return <span className="d-cell-faint">Transfer</span>
  const cat = txGlyphCat(tx, catMap)
  return (
    <span className="inline-flex items-center gap-1.5 d-cell-muted min-w-0">
      <span className="d-swatch rounded-full" style={{ background: cat?.color ?? '#94a3b8' }} />
      <span className="truncate">{cat?.name ?? tx.category ?? '—'}</span>
    </span>
  )
}
