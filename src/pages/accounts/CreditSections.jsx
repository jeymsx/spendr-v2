import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Collapsible, { useOpenState } from '../../components/ui/Collapsible'
import Divider from '../../components/ui/Divider'
import ProgressBar from '../../components/ui/ProgressBar'
import SectionLabel from '../../components/ui/SectionLabel'
import { IconChevronRight, IconReceipt } from '../../components/icons'
import { statementDueDate } from '../../lib/creditBills'
import { receivedAmount } from '../../lib/transferLegs'
import { DetailTxRow } from './DetailParts'
import { fmtCycleDate } from './shared'

/**
 * A credit card's page below its figure: the cycle that matters now, the
 * others folded away, and the way into every statement before.
 *
 * ── Which cycle leads ──
 *
 * The one that wants something from you. While the last statement still owes
 * anything, that statement leads - what is left, by when, and the button that
 * pays it. Once it is settled it has nothing more to ask, so it steps down to
 * a folded card marked Paid, and the cycle now running leads instead: what
 * has gone on the card so far, and when that becomes a bill. A paid statement
 * on top of the page, with a full green bar and nothing to do, was the page
 * answering a question nobody was asking any more.
 *
 * ── Folded, not gone ──
 *
 * Each cycle is one card: its dates and total on a row you tap, its charges
 * under it. The leading card opens on its own list; the rest start shut, and
 * each remembers how you left it for as long as the tab is open
 * (ui/Collapsible useOpenState), so opening a charge to edit it and coming
 * back does not fold the list you were reading.
 *
 * Payments are listed with the statement they paid, which is also how the
 * statement history page shows them (StatementHistory.jsx).
 */

/** Below this a figure is a rounding crumb, not money. */
const EPS = 0.005

/** "Oct 15, 2026": a due date can be months back, so it carries its year. @param {Date|null|undefined} d */
function fmtLong(d) {
  return d ? d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

/** "Oct 15". @param {Date|null|undefined} d */
function fmtShort(d) {
  return d ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''
}

/** @param {number} n @param {string} one @param {string} many */
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * @param {{
 *   account: Record<string, any>,
 *   credit: Record<string, any>,
 *   statements: import('../../lib/creditStatements').Statement[],
 *   money: (v: number|undefined) => string,
 *   onPay: () => void,
 *   onSelect: (tx: any) => void,
 *   catMap: Record<string, any>,
 * }} props
 *   credit: AccountDetail's creditData - getCreditStatus and the dates round it
 */
export default function CreditSections({ account, credit, statements, money, onPay, onSelect, catMap }) {
  const navigate = useNavigate()
  const owing = credit.stmtOutstanding > EPS
  const newest = statements[0]?.latest ? statements[0] : null

  /* Keyed on the statement, and on whether it is owed: a new statement, or
     this one being paid, starts each card from its default again. */
  const base = `acct:${account.id}:${credit.cycleEnd.toISOString().slice(0, 10)}:${owing ? 'owing' : 'settled'}`
  const [lastOpen, toggleLast] = useOpenState(`${base}:last`, owing)
  const [currentOpen, toggleCurrent] = useOpenState(`${base}:current`, !owing)
  const [laterOpen, toggleLater] = useOpenState(`${base}:later`, false)

  const lastRange = `${fmtCycleDate(credit.cycleStart)} – ${fmtCycleDate(credit.cycleEnd)}`
  const currentRange = `${fmtCycleDate(credit.nextStart)} – ${fmtCycleDate(credit.nextCycleEnd)}`
  const currentDue = statementDueDate(credit.nextCycleEnd, Number(account.dueDate) || undefined)

  const lastBody = (
    <StatementBody
      charges={credit.thisCharges}
      payments={credit.payments}
      accountName={account.name}
      onSelect={onSelect}
      catMap={catMap}
      money={money}
      empty="Nothing was charged in this cycle."
    />
  )
  const currentBody = (
    <StatementBody
      charges={credit.nextStatementCharges}
      accountName={account.name}
      onSelect={onSelect}
      catMap={catMap}
      money={money}
      empty="Nothing charged yet."
    />
  )

  /* The count the list row names, and the figure opposite it. */
  const listRow = (/** @type {number} */ n, /** @type {number} */ total) => (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-13 font-medium text-slate-600 dark:text-slate-300">
        {n ? count(n, 'charge', 'charges') : 'No charges'}
      </span>
      <span className="text-13 font-semibold tabular-nums text-slate-600 dark:text-slate-300">{money(total)}</span>
    </span>
  )

  // ── The leading card ──

  const lastTop = (
    <div className="px-4 pt-4 pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel inset="none" gap="none">Last statement</SectionLabel>
        <span className="text-11 tabular-nums text-slate-400 dark:text-slate-500">{lastRange}</span>
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <span className="text-13 text-slate-500 dark:text-slate-400">Remaining due</span>
        <span className="text-22 font-bold tabular-nums text-slate-900 dark:text-white">
          {money(credit.stmtOutstanding)}
        </span>
      </div>
      {/* What the statement asked for is what was owed when it closed -
          this cycle's charges and anything carried from before - and
          "paid" is what has gone in since. */}
      {(() => {
        const asked = credit.stmtOutstanding + credit.totalPayments
        return (
          <>
            <ProgressBar
              className="mt-3"
              value={asked > 0 ? (credit.totalPayments / asked) * 100 : 100}
              fillClass="bg-primary"
            />
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="text-11 text-slate-400 dark:text-slate-500">{money(credit.totalPayments)} paid</span>
              <span className="text-11 text-slate-400 dark:text-slate-500">{money(asked)} total</span>
            </div>
          </>
        )
      })()}
      <p className="mt-3 text-center text-12 text-slate-500 dark:text-slate-400">
        {credit.stmtDays == null ? (
          <>No due day set for this card</>
        ) : credit.stmtDays < 0 ? (
          <span className="font-semibold text-red-500 dark:text-red-400">
            {count(Math.abs(credit.stmtDays), 'day', 'days')} overdue{' · '}was due {fmtLong(credit.stmtDue)}
          </span>
        ) : (
          <>
            Payment due{' '}
            <span className={`font-semibold ${credit.stmtDays <= 7
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-700 dark:text-slate-200'}`}
            >
              {credit.stmtDays === 0 ? 'today' : `in ${count(credit.stmtDays, 'day', 'days')}`}
            </span>
            , by {fmtLong(credit.stmtDue)}
          </>
        )}
      </p>
      <Button block className="mt-3" onClick={onPay}>Make a payment</Button>
    </div>
  )
  /* With nothing in it to list, the card is only its figure: a row to open
     onto "Nothing charged yet" would be a door to an empty room. */
  const lastLeading = credit.thisCharges.length || credit.payments.length ? (
    <Collapsible
      open={lastOpen}
      onToggle={toggleLast}
      label={`${lastOpen ? 'Hide' : 'Show'} the last statement's charges`}
      top={lastTop}
      header={listRow(credit.thisCharges.length, credit.thisTotal)}
    >
      {lastBody}
    </Collapsible>
  ) : <Card clip>{lastTop}</Card>

  const currentTop = (
    <div className="px-4 pt-4 pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel inset="none" gap="none">Current cycle</SectionLabel>
        <span className="text-11 tabular-nums text-slate-400 dark:text-slate-500">{currentRange}</span>
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <span className="text-13 text-slate-500 dark:text-slate-400">Spent so far</span>
        <span className="text-22 font-bold tabular-nums text-slate-900 dark:text-white">
          {money(credit.nextStatementTotal)}
        </span>
      </div>
      <p className="mt-1.5 text-12 text-slate-500 dark:text-slate-400">
        Closes {fmtShort(credit.nextCycleEnd)}
        {currentDue ? `, due ${fmtLong(currentDue)}` : ''}
      </p>
      {credit.stmtPaid && (
        <p className="mt-3 flex items-center gap-1.5 text-12 font-semibold text-emerald-600 dark:text-emerald-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          Last statement paid{newest?.paidOn ? ` on ${fmtShort(newest.paidOn)}` : ''}
        </p>
      )}
    </div>
  )
  const currentLeading = credit.nextStatementCharges.length ? (
    <Collapsible
      open={currentOpen}
      onToggle={toggleCurrent}
      label={`${currentOpen ? 'Hide' : 'Show'} this cycle's charges`}
      top={currentTop}
      header={listRow(credit.nextStatementCharges.length, credit.nextStatementTotal)}
    >
      {currentBody}
    </Collapsible>
  ) : <Card clip>{currentTop}</Card>

  // ── The folded cards ──

  /** @param {{title: string, sub: string, aside: import('react').ReactNode}} p */
  const heading = ({ title, sub, aside }) => (
    <span className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-13 font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</span>
        <span className="block mt-0.5 text-11 tabular-nums text-slate-500 dark:text-slate-400 truncate">{sub}</span>
      </span>
      <span className="shrink-0 flex items-center gap-2">{aside}</span>
    </span>
  )

  const lastFolded = credit.hasStatement ? (
    <Collapsible
      open={lastOpen}
      onToggle={toggleLast}
      header={heading({
        title: 'Last statement',
        sub: lastRange,
        aside: (
          <>
            {credit.stmtPaid && <StatusPill status="paid" />}
            <span className="text-13 font-bold tabular-nums text-slate-700 dark:text-slate-200">{money(credit.thisTotal)}</span>
          </>
        ),
      })}
    >
      {lastBody}
    </Collapsible>
  ) : null

  const currentFolded = (
    <Collapsible
      open={currentOpen}
      onToggle={toggleCurrent}
      header={heading({
        title: 'Current cycle',
        sub: currentRange,
        aside: <span className="text-13 font-bold tabular-nums text-slate-700 dark:text-slate-200">{money(credit.nextStatementTotal)}</span>,
      })}
    >
      {currentBody}
    </Collapsible>
  )

  /* Installment plans write every month up front, so these are already
     against the limit while being nowhere near due. */
  const later = credit.laterCharges.length > 0 ? (
    <Collapsible
      open={laterOpen}
      onToggle={toggleLater}
      header={heading({
        title: 'Scheduled later',
        sub: `After ${fmtCycleDate(credit.nextCycleEnd)}`,
        aside: <span className="text-13 font-bold tabular-nums text-slate-500 dark:text-slate-400">{money(credit.laterTotal)}</span>,
      })}
    >
      <StatementBody
        charges={credit.laterCharges}
        accountName={account.name}
        onSelect={onSelect}
        catMap={catMap}
        money={money}
        empty=""
      />
    </Collapsible>
  ) : null

  return (
    <div className="flex flex-col gap-3">
      {owing ? lastLeading : currentLeading}
      {owing ? currentFolded : null}
      {later}
      {owing ? null : lastFolded}

      {statements.length > 0 && (
        <Card clip>
          <button
            type="button"
            onClick={() => navigate(`/accounts/${account.id}/statements`)}
            className="press press-fade w-full flex items-center gap-3 px-4 py-3.5 text-left
              active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
          >
            <span className="cat-tile w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ '--cat-color': '#64748b' }} aria-hidden="true">
              <IconReceipt size={18} className="cat-glyph" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-13 font-semibold text-slate-800 dark:text-slate-100">Statement history</span>
              <span className="block mt-0.5 text-11 text-slate-500 dark:text-slate-400 truncate">
                {count(statements.length, 'statement', 'statements')}, and what paid each
              </span>
            </span>
            <span className="text-slate-300 dark:text-slate-600 shrink-0"><IconChevronRight /></span>
          </button>
        </Card>
      )}
    </div>
  )
}

/**
 * Paid, due, overdue: a statement's standing in a word.
 *
 * @param {{status: 'none'|'paid'|'due'|'overdue'|'carried', partly?: boolean}} props
 *   partly: something was paid on a statement that was not paid off - "Part
 *   paid", where nothing paid at all is "Unpaid"
 */
export function StatusPill({ status, partly = false }) {
  const amber = 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  const red = 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
  const look = {
    paid:    ['Paid', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'],
    due:     ['Due', amber],
    overdue: ['Overdue', red],
    carried: partly ? ['Part paid', amber] : ['Unpaid', red],
  }[status]
  if (!look) return null
  return (
    <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-10 font-semibold tracking-wide ${look[1]}`}>
      {look[0]}
    </span>
  )
}

/**
 * A statement's charges, and under them what paid it.
 *
 * @param {{
 *   charges: Array<Record<string, any>>,
 *   payments?: Array<Record<string, any>>,
 *   accountName: string,
 *   onSelect: (tx: any) => void,
 *   catMap: Record<string, any>,
 *   money: (v: number|undefined) => string,
 *   empty: string,
 * }} props
 */
export function StatementBody({ charges, payments = [], accountName, onSelect, catMap, money, empty }) {
  // What reached the card: a transfer's received leg (lib/transferLegs.js).
  const paid = payments.reduce((s, tx) => s + (tx.type === 'transfer' ? receivedAmount(tx) : (tx.amount ?? 0)), 0)
  return (
    <>
      <Divider inset="row" />
      {charges.length === 0 ? (
        empty ? <p className="px-4 py-3.5 text-13 text-slate-500 dark:text-slate-400">{empty}</p> : null
      ) : charges.map((tx, i) => (
        <div key={tx.id ?? `${tx.date}-${i}`}>
          {i > 0 && <Divider inset="glyph" />}
          <DetailTxRow tx={tx} accountName={accountName} onSelect={onSelect} catMap={catMap} />
        </div>
      ))}
      {payments.length > 0 && (
        <>
          <Divider inset="row" />
          <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-1">
            <span className="text-11 font-semibold text-slate-500 dark:text-slate-400">
              {count(payments.length, 'payment', 'payments')}
            </span>
            <span className="text-11 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">+{money(paid)}</span>
          </div>
          {payments.map((tx, i) => (
            <div key={tx.id ?? `${tx.date}-p${i}`}>
              {i > 0 && <Divider inset="glyph" />}
              <DetailTxRow tx={tx} accountName={accountName} onSelect={onSelect} catMap={catMap} />
            </div>
          ))}
        </>
      )}
    </>
  )
}
