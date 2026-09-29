import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useBack } from '../../hooks/useBack'
import { creditStatements } from '../../lib/creditStatements'
import { fmt } from '../../lib/money'
import SubPage from '../../components/SubPage'
import TxDetailSheet from '../../components/TxDetailSheet'
import Collapsible, { useOpenState } from '../../components/ui/Collapsible'
import Divider from '../../components/ui/Divider'
import EmptyState from '../../components/ui/EmptyState'
import { SkeletonList } from '../../components/ui/Skeleton'
import { StatementBody, StatusPill } from './CreditSections'
import { fmtCycleDate } from './shared'

/**
 * Every statement a card has closed, newest first, each folded to its dates,
 * what it asked for and whether it was paid - and opening to its charges and
 * the payments that settled it (lib/creditStatements.js).
 *
 * Reached from the card's own page, under its current cycle. That page shows
 * the statement that matters now; this is for going back to one that does
 * not any more - "what was on August's bill?" - which used to mean scrolling
 * one long payment history and working the months out by hand.
 *
 * The newest opens on its own, and each remembers how you left it while the
 * tab is open, as the card page's do.
 */

/** Below this a figure is a rounding crumb, not money. */
const EPS = 0.005

/** "Oct 15". @param {Date|null|undefined} d */
const fmtShort = (d) => (d ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '')

export default function StatementHistory() {
  const { id } = useParams()
  const navigate = useNavigate()
  const back = useBack(`/accounts/${id}`)

  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const [selectedTx, setSelectedTx] = useState(/** @type {any} */ (null))

  const account = useMemo(() => (accounts ?? []).find(a => String(a.id) === String(id)), [accounts, id])
  const money = useCallback((/** @type {number|undefined} */ v) => fmt(v, account?.currency), [account?.currency])

  const statements = useMemo(
    () => (account && transactions ? creditStatements(account, transactions) : []),
    [account, transactions],
  )

  /* By year, under the Transactions page's heading - a date, a hairline,
     a count - once the list runs past the one it started in. */
  const years = useMemo(() => {
    /** @type {Array<{year: number, list: typeof statements}>} */
    const out = []
    for (const s of statements) {
      const year = s.cycleEnd.getFullYear()
      if (out.at(-1)?.year !== year) out.push({ year, list: [] })
      out.at(-1)?.list.push(s)
    }
    return out
  }, [statements])

  const loading = accounts === undefined || transactions === undefined
  const gone = !loading && !account

  return (
    <SubPage title="Statement history" onBack={back}>
      {loading ? (
        <div className="px-5"><SkeletonList rows={4} /></div>
      ) : gone ? (
        <div className="px-5">
          <EmptyState art="notFound" title="Card not found" body="It may have been deleted." />
        </div>
      ) : !statements.length ? (
        <div className="px-5">
          <EmptyState
            art="receipt"
            title="No statements yet"
            body={`${account?.name ?? 'This card'}'s first statement shows up here once its cycle closes.`}
          />
        </div>
      ) : (
        <>
          <p className="px-5 -mt-1 mb-3 text-center text-12 text-slate-500 dark:text-slate-400 truncate">
            {account?.name}
          </p>
          {years.map(({ year, list }) => (
            <section key={year} className="mb-2">
              {years.length > 1 && (
                <div className="flex items-center gap-3 px-5 py-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">{year}</span>
                  <Divider className="flex-1" />
                  <span className="text-11 text-slate-400 dark:text-slate-500 tabular-nums">
                    {list.length} {list.length === 1 ? 'statement' : 'statements'}
                  </span>
                </div>
              )}
              <div className="px-5 flex flex-col gap-3">
                {list.map(s => (
                  <StatementCard
                    key={s.key}
                    statement={s}
                    accountId={String(id)}
                    accountName={account?.name ?? ''}
                    openFirst={s === statements[0]}
                    money={money}
                    onSelect={setSelectedTx}
                    catMap={catMap}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <TxDetailSheet
        onEdit={(/** @type {any} */ t) => navigate(`/transactions/${t.id}/edit`)}
        open={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
        accounts={accounts ?? []}
        categories={categories ?? []}
      />
    </SubPage>
  )
}

/**
 * One statement, folded to a line.
 *
 * @param {{
 *   statement: import('../../lib/creditStatements').Statement,
 *   accountId: string,
 *   accountName: string,
 *   openFirst: boolean,
 *   money: (v: number|undefined) => string,
 *   onSelect: (tx: any) => void,
 *   catMap: Record<string, any>,
 * }} props
 */
function StatementCard({ statement: s, accountId, accountName, openFirst, money, onSelect, catMap }) {
  const [open, toggle] = useOpenState(`stmt:${accountId}:${s.key.slice(0, 10)}`, openFirst)

  /* What the line under the dates says, after the pill that already names
     the standing: "Paid" then "on Sep 27", not "Paid Paid Sep 27". */
  const line = s.status === 'paid' ? (s.paidOn ? `on ${fmtShort(s.paidOn)}` : '')
    : s.status === 'due' ? (s.due ? `by ${fmtShort(s.due)}` : 'Not paid yet')
    : s.status === 'overdue' ? `was due ${fmtShort(s.due)}`
    : s.status === 'carried' ? `${money(s.remaining)} carried over`
    : s.balance < -EPS ? 'Covered by credit on the card'
    : 'Nothing billed'
  // And the whole of it, for a screen reader, which hears the pill and the line as one.
  const standing = { paid: 'paid', due: 'due', overdue: 'overdue', carried: s.paid > EPS ? 'part paid' : 'unpaid', none: '' }[s.status]
  const spoken = [standing, line].filter(Boolean).join(' ')
  // What it asked for; for one that asked nothing, what was charged.
  const figure = s.balance > EPS ? s.balance : s.total

  return (
    <Collapsible
      open={open}
      onToggle={toggle}
      label={`${fmtCycleDate(s.cycleStart)} to ${fmtCycleDate(s.cycleEnd)} statement, ${money(figure)}, ${spoken}`}
      header={(
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-13 font-semibold text-slate-800 dark:text-slate-100 tabular-nums truncate">
              {fmtCycleDate(s.cycleStart)} – {fmtCycleDate(s.cycleEnd)}
            </span>
            <span className="mt-1 flex items-center gap-1.5 min-w-0">
              <StatusPill status={s.status} partly={s.paid > EPS} />
              <span className={`text-11 truncate ${s.status === 'overdue'
                ? 'font-semibold text-red-500 dark:text-red-400'
                : 'text-slate-500 dark:text-slate-400'}`}
              >
                {line}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-14 font-bold tabular-nums text-slate-800 dark:text-slate-100">{money(figure)}</span>
        </span>
      )}
    >
      <Divider inset="row" />
      {/* How the figure came to be, when it is more than this cycle's charges. */}
      <div className="px-4 py-3 flex flex-col gap-1.5">
        <SumRow label="Charged this cycle" value={money(s.total)} />
        {Math.abs(s.carriedIn) > EPS && (
          <SumRow
            label={s.carriedIn > 0 ? 'Carried from before' : 'Credit from before'}
            value={s.carriedIn > 0 ? money(s.carriedIn) : `−${money(-s.carriedIn)}`}
          />
        )}
        {s.paid > EPS && <SumRow label="Paid" value={`−${money(s.paid)}`} tone="text-emerald-600 dark:text-emerald-400" />}
        {s.remaining > EPS && <SumRow label="Left to pay" value={money(s.remaining)} strong />}
      </div>
      <StatementBody
        charges={s.charges}
        payments={s.payments}
        accountName={accountName}
        onSelect={onSelect}
        catMap={catMap}
        money={money}
        empty="Nothing was charged in this cycle."
      />
    </Collapsible>
  )
}

/**
 * @param {{label: string, value: string, tone?: string, strong?: boolean}} props
 *   tone: the value's colour, in place of the default one
 */
function SumRow({ label, value, tone = '', strong = false }) {
  const valueColour = tone || (strong ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200')
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-12 ${strong ? 'font-semibold text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
      <span className={`text-12 tabular-nums ${strong ? 'font-bold' : 'font-semibold'} ${valueColour}`}>{value}</span>
    </div>
  )
}
