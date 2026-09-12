import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import SegTabs from '../components/SegTabs'
import { IconPlus, IconChevronLeft } from '../components/icons'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import IconButton from '../components/ui/IconButton'
import SectionLabel from '../components/ui/SectionLabel'
import StatTrio from '../components/ui/StatTrio'
import { SkeletonHero, SkeletonStatTrio, SkeletonList } from '../components/ui/Skeleton'
import { fmt, fmtCompact } from '../lib/money'
import {
  daysToDue,
  isSettled,
  owedOn,
  IconNoDebts,
} from './debts/shared'
import { DebtCard, SettledSection } from './debts/DebtCard'
import { DebtFormSheet } from './debts/DebtFormSheet'
import { PaymentSheet } from './debts/PaymentSheet'

// ── Pieces ─────────────────────────────────────────────────────────────────────

/* SectionLabel and Card lived here. Both are in src/components/ui now - the
   caption was one of nineteen recipes for the same words above a group, and
   the card one of twelve spellings of `card rounded-2xl overflow-hidden`.
   The local caption also carried `hint` and `right` props that no call site
   on this page ever passed. */

/** One of the three readings under the headline figure. */
/* StatTile lived here - a bordered tile with the label above the figure.
   Its callers are StatTrio now, which is the same row the Budget, Goals
   and Bills pages use. */

// ── Empty State ────────────────────────────────────────────────────────────────

/**
 * Nothing here, in the app's own voice.
 *
 * The shape - a 56px disc, a line saying what is empty, a line saying what to
 * do about it - is <EmptyState> in src/components/ui now, because Bills had
 * already converged on the same one byte for byte. What is left here is the
 * copy, which is the only part that was ever this page's own.
 *
 * Two of the three lost their second line. "You owe nothing" followed by
 * "Nothing recorded against you." is the same sentence twice, and a body that
 * only restates the title is how a screen with nothing on it still manages to
 * look busy. The All copy keeps its line, because that one says what the page
 * is for rather than repeating what it just said.
 */
const EMPTY_COPY = {
  all:        { title: 'No debts yet',    body: 'Track what you owe and what you are owed.' },
  i_owe:      { title: 'You owe nothing', body: null },
  owed_to_me: { title: 'Nobody owes you', body: null },
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const VIEWS = [
  { value: 'all',        label: 'All'        },
  { value: 'i_owe',      label: 'I owe'      },
  { value: 'owed_to_me', label: 'Owed to me' },
]

export default function Debts() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  /**
   * All, by default.
   *
   * Two mutually exclusive tabs meant the page could never answer the
   * question people actually have, which is not "what do I owe" or "what am I
   * owed" but the difference between them - and getting to it meant reading
   * one number, switching tabs, and doing the subtraction yourself. All shows
   * the net position and both sides at once.
   *
   * ?tab= still wins, because the home screen's Upcoming rows deep-link to
   * /debts?tab=i_owe and land you on the side the row was about.
   */
  const [view, setView] = useState(() => {
    const t = searchParams.get('tab')
    return t === 'owed_to_me' || t === 'i_owe' ? t : 'all'
  })

  const [showForm,    setShowForm]    = useState(false)
  const [editDebt,    setEditDebt]    = useState(null)
  const [paymentDebt, setPaymentDebt] = useState(null)
  const [showPayment, setShowPayment] = useState(false)

  useEffect(() => {
    const el = document.getElementById('app-main')
    if (el) el.scrollTop = 0
  }, [])

  const allDebts = useLiveQuery(() => db.debts.orderBy('createdAt').reverse().toArray(), [], undefined)
  /* Memoised because `allDebts ?? []` produces a NEW array on every render
     while the query is still loading, which changed the identity of the
     useCallback below it every pass and defeated the useMemo below that. */
  const rows = useMemo(() => allDebts ?? [], [allDebts])

  const forView = useCallback(
    (v) => v === 'all' ? rows : rows.filter(d => d.type === v),
    [rows],
  )

  const visible = useMemo(() => forView(view), [forView, view])
  const open    = useMemo(() => visible.filter(d => !isSettled(d)), [visible])
  const settled = useMemo(() => visible.filter(isSettled), [visible])

  // In All, the open debts split by direction so each card is unambiguous
  // without needing a marker of its own - the heading above it says which way
  // the money goes.
  const openOwe  = useMemo(() => open.filter(d => d.type === 'i_owe'), [open])
  const openOwed = useMemo(() => open.filter(d => d.type !== 'i_owe'), [open])

  /**
   * Every figure this page shows, from one pass over what is VISIBLE.
   *
   * Visible, not all of them. The first version summed across the whole table
   * so the readings would not move when you changed tabs - which put
   * "Overdue 2" above a list containing one overdue debt, because the second
   * was on the other side. A figure that disagrees with the rows under it is
   * worse than no figure at all.
   *
   * In All, visible IS every debt, so the I owe / Owed to me tiles are still
   * the whole picture there - which is the view whose entire job is the whole
   * picture.
   */
  const totals = useMemo(() => {
    let owe = 0, owed = 0, overdue = 0, dueWeek = 0
    for (const d of visible) {
      if (isSettled(d)) continue
      const left = owedOn(d)
      if (d.type === 'i_owe') owe += left
      else                    owed += left
      const n = daysToDue(d.dueDate)
      if (n == null) continue
      if (n < 0)       overdue += 1
      else if (n <= 7) dueWeek += 1
    }
    return { owe, owed, overdue, dueWeek, net: owed - owe }
  }, [visible])

  const openAdd     = () => { setEditDebt(null); setShowForm(true) }
  const openEdit    = (debt) => { setEditDebt(debt); setShowForm(true) }
  const openPayment = (debt) => { setPaymentDebt(debt); setShowPayment(true) }

  const loading   = allDebts === undefined
  const emptyCopy = EMPTY_COPY[view] ?? EMPTY_COPY.all

  /** The headline, which is a different question in each view. */
  const headline = view === 'all'
    ? {
        label: 'Net position',
        value: fmt(Math.abs(totals.net)),
        // Signed, and the sign is the whole point: are you up or down across
        // everyone. Zero gets the neutral colour rather than green, because
        // "settled all round" is not a gain.
        tone: totals.net > 0 ? 'text-emerald-600 dark:text-emerald-400'
            : totals.net < 0 ? 'text-red-500 dark:text-red-400'
            : 'text-slate-900 dark:text-white',
        sub: totals.net > 0 ? 'In your favour'
           : totals.net < 0 ? 'Against you'
           : rows.length ? 'All even' : 'Nothing recorded',
      }
    : view === 'i_owe'
      ? {
          label: 'Total I owe',
          value: fmt(totals.owe),
          tone: totals.owe > 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-900 dark:text-white',
          sub: `${openOwe.length} open ${openOwe.length === 1 ? 'debt' : 'debts'}`,
        }
      : {
          label: 'Total owed to me',
          value: fmt(totals.owed),
          tone: totals.owed > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white',
          sub: `${openOwed.length} open ${openOwed.length === 1 ? 'debt' : 'debts'}`,
        }

  return (
    <div className="pb-nav">
      {/* ── Header ──
          Back, centred title, accent +. The same header Goals, Bills and
          AccountDetail use, because all four are reached from a quick-action
          disc rather than the navbar and all four need the same way out.

          The + is an icon and nothing else. It was a "＋ Add Debt" pill, which
          is the widest possible way to say a thing every other page in the app
          says in 36px. */}
      <header className="flex items-center gap-2 px-5 pt-safe-header pb-3">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <IconChevronLeft />
        </IconButton>
        <h1 className="flex-1 text-center text-base font-semibold text-slate-800 dark:text-white truncate px-1">
          Debts
        </h1>
        <IconButton label="New debt" variant="primary" onClick={openAdd}>
          <IconPlus />
        </IconButton>
      </header>

      {/* The loading state is the page's own shape, not three grey
          rectangles: the hero, the stat row and the list, at the sizes
          they arrive at, so nothing below them moves when they do. */}
      {loading ? (
        <div className="px-5 mt-2 flex flex-col gap-7">
          <SkeletonHero />
          <SkeletonStatTrio />
          <SkeletonList rows={3} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconNoDebts />}
          title={EMPTY_COPY.all.title}
          body={EMPTY_COPY.all.body}
          action={<Button onClick={openAdd}>Add a debt</Button>}
        />
      ) : (
        <>
          {/* ── Where you stand ── */}
          <section className="px-5">
            <SectionLabel className="text-center">{headline.label}</SectionLabel>
            <p className={`mt-2 text-center text-[38px] leading-none font-semibold tracking-tight tabular-nums ${headline.tone}`}>
              {/* The minus is drawn rather than formatted in, so the figure
                  reads as a magnitude with a direction and fmt() does not have
                  to carry a sign it would also apply to the tiles. */}
              {view === 'all' && totals.net < 0 ? '−' : ''}{headline.value}
            </p>
            <p className="mt-2 text-center text-[13px] text-slate-500 dark:text-slate-400">
              {headline.sub}
            </p>

            <StatTrio
              className="mt-5"
              items={view === 'all' ? [
                { label: 'I owe', value: fmtCompact(totals.owe),
                  tone: totals.owe > 0 ? 'text-red-500 dark:text-red-400' : '' },
                { label: 'Owed to me', value: fmtCompact(totals.owed),
                  tone: totals.owed > 0 ? 'text-emerald-600 dark:text-emerald-400' : '' },
                { label: 'Overdue', value: totals.overdue,
                  tone: totals.overdue > 0 ? 'text-red-500 dark:text-red-400' : '' },
              ] : [
                { label: 'Overdue', value: totals.overdue,
                  tone: totals.overdue > 0 ? 'text-red-500 dark:text-red-400' : '' },
                { label: 'This week', value: totals.dueWeek },
                { label: 'Settled', value: settled.length },
              ]}
            />
          </section>

          {/* ── Which side ── */}
          <div className="px-5 mt-6">
            <SegTabs
              tabs={VIEWS.map(v => ({
                ...v,
                // The count is what is OPEN, not what exists. A tab reading 4
                // that opens onto one live debt and three settled ones is
                // worse than no count at all.
                count: v.value === 'all'
                  ? 0
                  : forView(v.value).filter(d => !isSettled(d)).length,
              }))}
              value={view}
              onChange={setView}
            />
          </div>

          {open.length === 0 && settled.length === 0 ? (
            <div className="mt-2">
              <EmptyState
                icon={<IconNoDebts />}
                title={emptyCopy.title}
                body={emptyCopy.body}
                action={<Button onClick={openAdd}>Add a debt</Button>}
              />
            </div>
          ) : (
            <>
              {view === 'all' ? (
                <div className="mt-5 flex flex-col gap-6">
                  {openOwe.length > 0 && (
                    <section>
                      <SectionLabel inset="gutter" gap="loose">I owe</SectionLabel>
                      <div className="px-5 flex flex-col gap-3">
                        {openOwe.map(d => (
                          <DebtCard key={d.id} debt={d} onEdit={openEdit} onPayment={openPayment} />
                        ))}
                      </div>
                    </section>
                  )}
                  {openOwed.length > 0 && (
                    <section>
                      <SectionLabel inset="gutter" gap="loose">Owed to me</SectionLabel>
                      <div className="px-5 flex flex-col gap-3">
                        {openOwed.map(d => (
                          <DebtCard key={d.id} debt={d} onEdit={openEdit} onPayment={openPayment} />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
                open.length > 0 && (
                  <section className="mt-5">
                    <SectionLabel inset="gutter" gap="loose">Open</SectionLabel>
                    <div className="px-5 flex flex-col gap-3">
                      {open.map(d => (
                        <DebtCard key={d.id} debt={d} onEdit={openEdit} onPayment={openPayment} />
                      ))}
                    </div>
                  </section>
                )
              )}

              <SettledSection debts={settled} onEdit={openEdit} />
            </>
          )}
        </>
      )}

      <DebtFormSheet
        open={showForm}
        onClose={() => setShowForm(false)}
        editDebt={editDebt}
        // A new debt lands on the side you were looking at. In All there is no
        // side to infer, so the form's own default stands.
        defaultTab={view === 'all' ? undefined : view}
      />
      <PaymentSheet
        open={showPayment}
        onClose={() => setShowPayment(false)}
        debt={paymentDebt}
      />
    </div>
  )
}
