/**
 * The pieces AccountDetail builds its page out of.
 *
 * Lifted out of Accounts.jsx unchanged. They were only ever there because the
 * detail sheet used to live in that file too; it has been its own page for a
 * while, and these stayed behind.
 */
import CategoryGlyph from '../../components/CategoryGlyph'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import EmptyState from '../../components/ui/EmptyState'
import { fmt } from '../../lib/money'
import { fmtTxDate, fmtTxTime } from './shared'

// ── Account detail sheet ───────────────────────────────────────────────────────

// ── Stat card ──────────────────────────────────────────────────────────────────

export function StatCard({ label, value }) {
  return (
    <Card surface="recessed" padding="sm">
      <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-0.5">
        {label}
      </p>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">{value}</p>
    </Card>
  )
}

// ── Credit statement transaction section ────────────────────────────────────────

export function CreditTxSection({ title, dateRange, txs, total, accountName, emptyLabel, totalColor, totalSign = '', onSelect, catMap = {} }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">
            {title}
          </p>
          {dateRange && (
            <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">{dateRange}</p>
          )}
        </div>
        <p className={`text-sm font-bold tabular-nums ${totalColor}`}>
          {totalSign}{fmt(total)}
        </p>
      </div>

      {txs.length === 0 && emptyLabel ? (
        <Card surface="recessed">
          <EmptyState size="sm" title={emptyLabel} />
        </Card>
      ) : (
        <Card clip>
          {txs.map((tx, i) => (
            <div key={tx.id ?? i}>
              <DetailTxRow tx={tx} accountName={accountName} onSelect={onSelect} catMap={catMap} />
              {i < txs.length - 1 && (
                <Divider inset="glyph" />
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

// ── Detail transaction row ─────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {Record<string, any>} props.tx
 * @param {string} [props.accountName]  whose side of the row you are on
 * @param {(tx: any) => void} [props.onSelect]
 * @param {Record<string, any>} [props.catMap]
 * @param {string} [props.label]  overrides the headline, for a page whose
 *   subject is not an account - see CategoryDetail
 * @param {string} [props.meta]   overrides the second line's tail
 */
export function DetailTxRow({
  tx, accountName, onSelect, catMap = {},
  label: labelOverride = null,
  meta: metaOverride = null,
}) {
  const cat = catMap[tx.category]
  const isTransfer = tx.type === 'transfer'

  // Sign and colour are relative to THIS ACCOUNT, not to the transaction's
  // own type, and that is the one thing not copied from the Transactions
  // page. There, a transfer is a neutral blue with no sign, because it is a
  // single event between two accounts. Here you are looking at one side of
  // it, so what matters is whether the money left or arrived: a transfer out
  // reads red and negative, a transfer in green and positive.
  let sign = ''
  let color = 'text-slate-600 dark:text-slate-300'
  if (tx.type === 'expense' && tx.account === accountName) {
    sign = '−'; color = 'text-red-500 dark:text-red-400'
  } else if (tx.type === 'inflow' && tx.account === accountName) {
    sign = '+'; color = 'text-emerald-600 dark:text-emerald-400'
  } else if (isTransfer) {
    if (tx.fromAccount === accountName) { sign = '−'; color = 'text-red-500 dark:text-red-400' }
    if (tx.toAccount   === accountName) { sign = '+'; color = 'text-emerald-600 dark:text-emerald-400' }
  }

  const isTransferFee = tx.type === 'expense' && tx.category === 'Transfer Fee'

  const label = labelOverride ?? (tx.description || (isTransfer
    ? (tx.fromAccount === accountName ? `To ${tx.toAccount ?? ''}` : `From ${tx.fromAccount ?? ''}`)
    : (tx.category ?? '—')))

  // The second line does not repeat the account - you are on its page - so it
  // carries the DATE, which the Transactions page can leave out because its
  // rows sit under date headers and these do not. Then the counterparty for a
  // transfer, or the category otherwise.
  const meta = metaOverride ?? (isTransfer
    ? (tx.fromAccount === accountName ? `→ ${tx.toAccount ?? ''}` : `← ${tx.fromAccount ?? ''}`)
    : (cat?.name ?? tx.category ?? ''))

  // Tappable so charges reachable only from here can still be edited or
  // deleted — scheduled installments are filtered out of the Transactions
  // list, so this ledger is their only route to TxDetailSheet.
  return (
    <button
      type="button"
      onClick={() => onSelect?.(tx)}
      disabled={!onSelect}
      className="w-full text-left flex items-center gap-3 px-4 py-3
        enabled:active:bg-slate-50 dark:enabled:active:bg-white/[0.04] transition-colors"
    >
      {/* The category's own emoji on its own colour at 13% - the same avatar
          the Transactions page uses, so a row means the same thing on both
          screens. */}
      <span
        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-[18px]"
        style={{ backgroundColor: (cat?.color ?? '#2D9DFF') + '22' }}
        aria-hidden="true"
      >
        <CategoryGlyph cat={cat} size={18} emoji="💸" />
      </span>

      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate leading-snug">
            {label}
          </span>
          {isTransferFee && (
            <span className="shrink-0 text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">
              Fee
            </span>
          )}
        </span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
          {fmtTxDate(tx.date)}
          {meta && <span className="ml-1.5 text-slate-400 dark:text-slate-500">· {meta}</span>}
        </span>
      </span>

      <span className="text-right shrink-0">
        <span className={`block text-[13px] font-bold tabular-nums ${color}`}>
          {sign}{fmt(tx.amount)}
        </span>
        <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
          {fmtTxTime(tx.date)}
        </span>
      </span>
    </button>
  )
}
