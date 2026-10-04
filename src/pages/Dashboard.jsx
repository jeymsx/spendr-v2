import { useMemo, useState, useCallback, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { PresenceItem, useRowMotion } from '../components/ui/Presence'
import { useTheme } from '../context/ThemeContext'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getCreditStatus } from '../utils/creditCycle'
import TemplateConfirmSheet from '../components/TemplateConfirmSheet'
import {
  IconTransferUI,
} from '../components/icons'
import CategoryGlyph from '../components/CategoryGlyph'
import { scheduledCutoff } from '../utils/scheduled'
import { txMonthKey } from '../utils/txDate'
import { cardGradient } from '../lib/accentTheme'
import IconButton from '../components/ui/IconButton'
import BellButton from '../components/BellButton'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import { fmt, fmtCompact, baseSymbol, fmtHidden } from '../lib/money'
import {
  ContextHint, getContextHint, getGreeting, monthPrefix,
  quickActionCounts,
} from './dashboard/shared'
import RollingNumber from '../components/ui/RollingNumber'
import { useSwap } from '../components/ui/useSwap'
import { useWalletClip } from './dashboard/wallet'
import DashboardSkeleton from './dashboard/Skeleton'
import {
  AccountCard, BudgetSummaryTile, EmptyPill, IconEye, IconEyeOff, IconFlipSides, IconSettings, TxRow,
} from './dashboard/Tiles'
import QuickActions from './dashboard/QuickActions'
import UpcomingSection, { toUpcomingItem } from './dashboard/Upcoming'
import Rail from '../components/ui/Rail'
import SectionHeading from '../components/ui/SectionHeading'
import useRates from '../hooks/useRates'
import useNetWorthDebts from '../hooks/useNetWorthDebts'
import useForecast from '../hooks/useForecast'
import { convert } from '../lib/fx'
import { netWorthBreakdown } from '../lib/netWorth'
import { isSpend } from '../lib/flows'
import { txGlyphCat } from '../lib/txRow'
import { foldLoanPayments } from '../lib/loans'
import { useBaseCurrency } from '../context/CurrencyContext'
import { txBase } from '../lib/fxContext'
import { addMonths, monthKeyOf, wrappedOnHome } from '../lib/recap'
import { useRecapMonth } from './recap/useRecapMonth'
import LazyWrappedCard, { preloadWrappedCard } from './recap/LazyWrappedCard'
import { isEverydayAccount } from '../lib/accountMeta'

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * @param {{layout?: 'phone'|'desktop'}} props  where the sections go: one
 *   column on the phone, two on the desktop (src/web/pages/WebHome.jsx)
 */
export default function Dashboard({ layout = 'phone' } = {}) {
  const navigate = useNavigate()
  const { accentColor, theme } = useTheme()
  const [balanceHidden,    setBalanceHidden]    = useState(true)
  const [accountsHidden,   setAccountsHidden]   = useState(false)
  const [peek,             setPeek]             = useState(false)
  /* The wallet's figures swap through a short blur when the eye or a
     press-and-hold reveals or hides them - see ui/useSwap. The account rail
     below has its own eye, and its cards answer it themselves. */
  const swap = useSwap(!balanceHidden || peek)
  // The wallet's tab folds the breakdown away. Remembered, because it is a
  // preference about how much of your own finances you want on screen.
  const [breakdownOpen,    setBreakdownOpen]    = useState(() => {
    try { return localStorage.getItem('netWorthBreakdown') !== 'closed' }
    catch { return true }
  })
  /* Which half of the breakdown the wallet shows: what you have, or what you
     owe - three tiles either way. Remembered, like the fold. */
  const [walletSide, setWalletSide] = useState(() => {
    try { return localStorage.getItem('netWorthSide') === 'owe' ? 'owe' : 'have' }
    catch { return 'have' }
  })
  const sideSwap = useSwap(walletSide)
  const [walletRef, walletClip] = useWalletClip()
  const [quickTemplate,    setQuickTemplate]    = useState(null)
  const [quickConfirmOpen, setQuickConfirmOpen] = useState(false)

  // ── Live queries ─────────────────────────────────────────────────────────────
  const accounts   = useLiveQuery(() => db.accounts.toArray())
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const debts      = useLiveQuery(() => db.debts.toArray(),      [], [])
  const recurring  = useLiveQuery(() => db.recurring.toArray(),  [], [])
  const txAll      = useLiveQuery(() => db.transactions.toArray())
  /* `?? null`: a person who never set a name has no row, and get() resolves
     to undefined for it - the same value as "still loading", so the greeting
     waited, invisible, for ever. null is "loaded, and there is none". */
  const userMeta   = useLiveQuery(async () => (await db.meta.get('displayName')) ?? null)
  const templates  = useLiveQuery(() => db.templates.toArray(),  [], [])
  // Only the quick-action badge needs these. A goal's progress is derived from
  // real account balances, so "is it funded?" cannot be read off the row - it
  // has to go through the allocator, the same one the Goals page uses.
  const goalRows   = useLiveQuery(() => db.goals.toArray(),      [], [])
  /* 'converted' or 'separated' - set in Settings, and only offered to a
     ledger that holds more than one currency. See the block below. */
  const netWorthMode = useLiveQuery(
    async () => (await db.meta.get('netWorthMode'))?.value ?? 'converted', [], 'converted')

  /* The month just gone, as "August Wrapped", for the first days of the next
     one - above the budget, while it is news. After that it lives on
     Insights. Only last month, and only if it had something in it. */
  const [wrappedDays] = useState(() => wrappedOnHome())
  const lastMonth = useMemo(() => addMonths(monthKeyOf(new Date()), -1), [])
  const recapMonth = useRecapMonth(wrappedDays ? lastMonth : null)
  const wrappedMonth = wrappedDays && recapMonth === lastMonth ? recapMonth : null
  // Its code is fetched while the ledger is still being read, not after.
  useEffect(() => { if (wrappedDays) preloadWrappedCard() }, [wrappedDays])

  // ── Derived values ────────────────────────────────────────────────────────────
  /* Every total on the wallet is in ONE currency, not in each account's own.
     A dollar account's balance reads $500 on its own card, and contributes
     whatever $500 is worth today to the figure at the top of this page -
     which is the one number on the screen that has to be comparable with
     itself month to month.

     WHICH one is `viewCurrency`, and it is a tap on the card rather than a
     setting. Somebody holding a dollar account wants both readings: what the
     ledger is worth in the currency they live in, and what it is worth in
     the one they are saving in. Neither is "the" answer, so the card offers
     both and remembers which you were last looking at.

     sumInBase reports what it could not convert rather than dropping it, so
     a missing rate becomes a line of text under the figure instead of an
     account quietly worth nothing. See lib/fx.js. */
  const baseCurrency = useBaseCurrency()
  const { table: rates, foreign } = useRates()

  /* The ledger's own currency first, then each foreign one actually held -
     but only the ones there is a rate for, since offering a reading the app
     cannot compute is worse than not offering it. */
  const viewOptions = useMemo(() => {
    /* Converted mode can only offer a currency it can price; separated mode
       converts nothing, so every currency actually held is on the list even
       with no rates downloaded at all. */
    const usable = netWorthMode === 'separated'
      ? foreign
      : foreign.filter(c => convert(1, c, baseCurrency, rates) != null)
    return [baseCurrency, ...usable]
  }, [baseCurrency, foreign, rates, netWorthMode])

  const [viewCurrency, setViewCurrency] = useState(() => {
    try { return localStorage.getItem('netWorthCurrency') || '' } catch { return '' }
  })
  /* Falls back rather than sticking: the remembered choice can name a
     currency whose last account has since been deleted, or one whose rate has
     gone missing, and a card stuck on a currency it can no longer price would
     read as broken. */
  const shownCurrency = viewOptions.includes(viewCurrency) ? viewCurrency : baseCurrency

  const cycleCurrency = () => {
    if (viewOptions.length < 2) return
    const next = viewOptions[(viewOptions.indexOf(shownCurrency) + 1) % viewOptions.length]
    setViewCurrency(next)
    try { localStorage.setItem('netWorthCurrency', next) } catch { /* private mode */ }
  }

  /* ── The two modes ──

     CONVERTED is the default and the one that answers "how am I doing": every
     account, at today's rate, as one figure. The chip says which currency it
     is being read in.

     SEPARATED converts nothing. The card shows the currency the chip names,
     counting only the accounts actually held in it, with the other
     currencies' totals listed underneath at face value. It is the right
     answer for somebody who does not think of their dollar savings as pesos
     they have not spent yet - and it is the only mode that keeps working
     with no rates at all.

     Both go through the same filter+sum, which is what keeps them from
     drifting: separated is converted with the foreign accounts left out. */
  const separated = netWorthMode === 'separated'

  const inScope = useCallback(
    (/** @type {any[]} */ accts, /** @type {string} */ code) => (separated
      ? accts.filter(a => (a.currency || baseCurrency) === code)
      : accts),
    [separated, baseCurrency],
  )

  const parentCombinedBal = useMemo(() => {
    const allAccts = accounts || []
    const map = {}
    allAccts.filter(a => a.parentName).forEach(child => {
      map[child.parentName] = (map[child.parentName] ?? 0) + (child.balance ?? 0)
    })
    // Add the parent's own balance to the children sum
    allAccts.forEach(a => {
      if (map[a.name] !== undefined) map[a.name] += (a.balance ?? 0)
    })
    return map
  }, [accounts])

  // Scheduled installments are deliberately excluded here but NOT from
  // creditStmtMap below — what you owe includes them, what you've spent doesn't.
  // Without this they'd sort to the top of Recent and sit there for months.
  const recentTx = useMemo(() => {
    const cutoff = scheduledCutoff()
    // A loan payment is one of the five, not two (lib/loans.js).
    return foldLoanPayments((txAll || [])
      .filter(t => (t.date ?? '') <= cutoff)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')))
      // Five. Ten was half a screen of scrolling for a list whose whole job
      // is "does anything here look wrong", and "See all" is right there. A
      // desktop column has the height for eight.
      .slice(0, layout === 'desktop' ? 8 : 5)
  }, [txAll, layout])

  /* Rows that arrive and leave - see components/ui/Presence.jsx. The scope is
     shared with Transactions: a row seen arriving here has been seen, and
     does not arrive again there. Above the skeleton's early return, as hooks
     have to be. */
  const allTxIds  = useMemo(() => (txAll ?? []).map(t => t.id), [txAll])
  const recentIds = useMemo(() => recentTx.map(t => t.id), [recentTx])
  const recentRows = useRowMotion({
    scope: 'ledger', ready: txAll !== undefined, allIds: allTxIds, visibleIds: recentIds, viewKey: '',
  })

  const monthExpenses = useMemo(() => {
    const pfx = monthPrefix()
    const cutoff = scheduledCutoff()
    return (txAll || []).filter(t =>
      isSpend(t) && txMonthKey(t.date) === pfx && (t.date ?? '') <= cutoff)
  }, [txAll])

  const budgetCategories = useMemo(() => {
    const spentMap = {}
    monthExpenses.forEach(t => {
      spentMap[t.category] = (spentMap[t.category] ?? 0) + txBase(t)
    })
    return (categories || [])
      .filter(c => c.budget > 0)
      .map(c => ({ ...c, spent: spentMap[c.name] ?? 0 }))
  }, [categories, monthExpenses])

  // One figure for the whole month, for the home card. The per-category
  // detail lives on /budget now rather than as eight chips here.
  const budgetTotals = useMemo(() => {
    const budget = budgetCategories.reduce((sum, c) => sum + (c.budget ?? 0), 0)
    const spent  = budgetCategories.reduce((sum, c) => sum + (c.spent ?? 0), 0)
    return { budget, spent, pct: budget > 0 ? (spent / budget) * 100 : 0 }
  }, [budgetCategories])

  const upcomingRecurring = useMemo(() =>
    (recurring || [])
      .filter(r => r.active && r.nextDate && r.type !== 'inflow')
      .sort((a, b) => (a.nextDate ?? '').localeCompare(b.nextDate ?? ''))
      .slice(0, 3),
    [recurring],
  )

  const catMap = useMemo(() =>
    Object.fromEntries((categories || []).map(c => [c.name, c])),
    [categories],
  )

  const creditStmtMap = useMemo(() => {
    const map = {}
    ;(accounts || []).filter(a => a.type === 'credit').forEach(acct => {
      map[acct.name] = getCreditStatus(acct, txAll || [])
    })
    return map
  }, [accounts, txAll])

  /**
   * What lands next, soonest first - from the forecast, so this list and the
   * "Safe to spend" above it are one reading of the same walk.
   *
   * Everything the forecast lays out: bills and paydays from Recurring, card
   * statements (already counted, and listed as the reminder they are), loan
   * payments, and debts you owe with a date. It replaced a list built here
   * that used its own rule for a card's due date - not the one the bills page,
   * the reminders and the PDF use.
   *
   * Three. This sits above Recent, and Recent is what the home screen is for;
   * the whole list is a tap away on the Forecast page.
   */
  const { forecast } = useForecast(30)
  const acctByName = useMemo(
    () => Object.fromEntries((accounts || []).map(a => [a.name, a])), [accounts])
  const upcomingItems = useMemo(
    () => (forecast ? forecast.events.slice(0, 3).map(e => toUpcomingItem(e, catMap, acctByName)) : []),
    [forecast, catMap, acctByName],
  )

  /**
   * What is waiting for you behind Goals, Debts and Bills.
   *
   * One rule decides every one of these: a badge may only count things you
   * can DO something about, and doing it has to make the badge go away. A
   * count that cannot be cleared is not a notification, it is decoration -
   * and after a week of being ignored it trains you to ignore the real ones.
   *
   * So each is a definition that closes:
   *
   *   Bills  - a charge whose date has arrived and has not been posted.
   *            "Post now" clears it. Due TOMORROW is deliberately not
   *            counted: there is nothing to do about it yet, and a badge that
   *            lights up for something you cannot action is noise.
   *   Debts  - a settlement date that has passed with money still outstanding.
   *            Recording the payment clears it. Both directions count; being
   *            owed money past its date is equally something to chase.
   *   Goals  - a goal whose target the real balance has already reached.
   *            Archiving or spending it clears it, and until you do, money is
   *            sitting there having quietly finished its job.
   */
  const actionCounts = useMemo(
    () => quickActionCounts({
      recurring: recurring ?? [], debts: debts ?? [],
      goals: goalRows ?? [], accounts: accounts ?? [],
      base: baseCurrency, rates,
    }),
    [recurring, debts, goalRows, accounts, baseCurrency, rates],
  )

  /* Net worth and its piles, from the one definition every screen uses -
     lib/netWorth.js. Investments, loans and (when Preferences says so) money
     between you and other people are in it; separated mode narrows it to the
     accounts held in the currency on display. */
  const nwDebts = useNetWorthDebts()
  const breakdown = useMemo(() => netWorthBreakdown({
    accounts: accounts || [], transactions: txAll || [],
    view: shownCurrency, ledger: baseCurrency, rates,
    creditStatus: creditStmtMap,
    debts: nwDebts.debts, includeDebts: nwDebts.include,
    scope: separated ? (accts) => inScope(accts, shownCurrency) : undefined,
  }), [accounts, txAll, shownCurrency, baseCurrency, rates, creditStmtMap, nwDebts.debts, nwDebts.include, separated, inScope])

  const netWorth = breakdown.total
  const unconverted = breakdown.missing

  /* The OTHER currencies' net worth, at face value, for the lines under the
     headline. Only in separated mode, and only the ones not currently on
     display - the big figure is already saying that one. */
  const otherTotals = useMemo(() => {
    if (!separated) return []
    return viewOptions
      .filter(code => code !== shownCurrency)
      .map(code => ({
        code,
        total: netWorthBreakdown({
          accounts: accounts || [], transactions: txAll || [],
          view: code, ledger: baseCurrency, rates,
          creditStatus: creditStmtMap,
          debts: nwDebts.debts, includeDebts: nwDebts.include,
          scope: (accts) => accts.filter(a => (a.currency || baseCurrency) === code),
        }).total,
      }))
  }, [separated, accounts, txAll, viewOptions, shownCurrency, baseCurrency, rates, creditStmtMap, nwDebts.debts, nwDebts.include])

  /* The wallet's piles, in two halves of three: what you have, and what you
     owe. Six tiles at once made a two-row table of the one card that is meant
     to be read at a glance, so the wallet shows one half and a switch flips
     it. Spending, Savings and Credit always - they are what everybody has -
     and the rest only once there is something in them, so a ledger with no
     investment never grows a tile reading ₱0.00 for one. Debts - money
     between you and other people - sits with what you owe even when the net
     is in your favour; its note says which way it runs. */
  const haveTiles = [
    { key: 'spending', label: 'Spending', value: breakdown.spending, note: 'Cash, wallets' },
    { key: 'savings', label: 'Savings', value: breakdown.savings, note: 'Banks, deposits' },
    breakdown.has.invested && { key: 'invested', label: 'Investments', value: breakdown.invested, note: 'At last value' },
  ].filter(Boolean)
  const oweTiles = [
    { key: 'credit', label: 'Credit', value: breakdown.credit, note: breakdown.credit > 0 ? 'Outstanding' : 'Paid off' },
    breakdown.has.loans && { key: 'loans', label: 'Loans', value: breakdown.loans, note: breakdown.loans > 0.005 ? 'Left to pay' : 'Paid off' },
    breakdown.has.people && {
      key: 'people', label: 'Debts', value: Math.abs(breakdown.people),
      note: breakdown.people >= 0 ? 'Owed to you' : 'You owe',
    },
  ].filter(Boolean)
  const pileTiles = walletSide === 'owe' ? oweTiles : haveTiles
  const pickSide = (/** @type {'have'|'owe'} */ side) => {
    setWalletSide(side)
    try { localStorage.setItem('netWorthSide', side) } catch { /* private mode */ }
  }

  const userMetaLoaded = userMeta !== undefined
  const userName = userMeta?.value || 'there'

  /* The figures roll from what you last saw - see ui/RollingNumber. This used
     to count up from zero with a hook that set state every frame, which
     re-rendered the whole home screen sixty times a second for a second. It
     also never ran: it fired while the page was still loading, counted 0 to
     0, and jumped when the real figure arrived. */

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  /* The Wrapped card waits with the rest on the days it shows: arriving
     after the page had drawn, it pushed the budget and everything under it
     down under a reader's thumb. */
  /* The forecast and the counted debts wait with the rest: arriving a frame
     later they moved the net worth and pushed Recent down under a thumb. */
  if (accounts === undefined || txAll === undefined || !nwDebts.ready || !forecast
    || (wrappedDays && recapMonth === undefined)) {
    return <DashboardSkeleton />
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  /* Each section on its own, so the desktop can place them in two columns
     (src/web/pages/WebHome.jsx). The phone draws them in this order, one
     under the other, exactly as it always has. */
  const header = (
    <>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      {/* items-start, not items-center: this is the one header whose left
          side is two lines, and centring the Settings chip against both of
          them dropped it ~8px below where the same chip sits on every other
          page. Aligned to the top, it lands on the same line as the back
          button on Budget, Goals and the rest. */}
      <header className="flex items-start justify-between px-5 pt-safe-header pb-2">
        <div>
          <h1 className="text-xl tracking-tight text-slate-500 dark:text-slate-400">
            {getGreeting()},{' '}
            <span className={`font-semibold text-slate-900 dark:text-white transition-opacity duration-150 ${userMetaLoaded ? 'opacity-100' : 'opacity-0'}`}>
              {userName}
            </span>!
          </h1>
          <ContextHint hint={getContextHint(txAll, budgetCategories, upcomingRecurring)} />
        </div>
        {/* Two discs of the same paint and size, so the pair reads as one
            row. The bell took the badges trophy's place - see BellButton. */}
        {/* No way into Notes here, on purpose: for now it is found by a swipe
            in from the right edge, in the installed iPhone app
            (layouts/useNotesEdge.js). */}
        <div className="flex items-center gap-1.5 shrink-0">
          <BellButton />
          <IconButton label="Settings" onClick={() => navigate('/settings')}>
            <IconSettings />
          </IconButton>
        </div>
      </header>
    </>
  )
  const walletSection = (
    <>
      {/* ── Net worth Card ───────────────────────────────────────────────────── */}
      <section className="px-5 mt-4">
        {(() => {
          const revealed = !balanceHidden || peek
          return (
            <div className="wallet">
            <div
              ref={walletRef}
              className="wallet-card px-6 pt-6 select-none"
              style={{ background: cardGradient(accentColor, theme), clipPath: walletClip }}
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              onPointerCancel={() => setPeek(false)}
            >
              {/* Perimeter stitching. Decorative, and drawn by CSS so it
                  follows the wallet's asymmetric radius for free. */}
              <span className="wallet-stitch" aria-hidden="true" />

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-white/60">Net worth</span>

                    {/* Only when there is a second reading to switch to. One
                        currency means one answer, and a control that cycles
                        through a list of one is furniture.

                        stopPropagation for the same reason the eye button
                        does it: the wallet card is draggable, and a tap that
                        starts a drag is a tap that never becomes a click. */}
                    {viewOptions.length > 1 && (
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={cycleCurrency}
                        className="flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full
                          bg-white/[0.12] text-white/75 text-10 font-bold tracking-wide
                          active:scale-95 transition-transform duration-100"
                        aria-label={`Showing in ${shownCurrency}. Tap to switch currency.`}
                      >
                        {shownCurrency}
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="4 8 17 8" />
                          <polyline points="13 4 17 8 13 12" />
                          <polyline points="20 16 7 16" />
                          <polyline points="11 12 7 16 11 20" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3.5">
                    {/* What you have, or what you owe - the breakdown shows
                        one half. Only while the breakdown is out: folded away,
                        there is nothing for it to flip. The arrows turn over
                        with the side, so the button shows it has two states. */}
                    {breakdownOpen && (
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => pickSide(walletSide === 'have' ? 'owe' : 'have')}
                        className="relative hit-slop [--hit-x:-7px] text-white/60 hover:text-white/90 transition-colors active:scale-95"
                        aria-label={walletSide === 'have'
                          ? 'Showing what you have. Show what you owe.'
                          : 'Showing what you owe. Show what you have.'}
                      >
                        <span
                          className="block transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.3,1)]"
                          style={{ transform: walletSide === 'owe' ? 'scaleY(-1)' : 'none' }}
                        >
                          <IconFlipSides />
                        </span>
                      </button>
                    )}
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => setBalanceHidden(h => !h)}
                      className="relative hit-slop [--hit-x:-7px] text-white/60 hover:text-white/90 transition-colors active:scale-95"
                      aria-label={balanceHidden ? 'Show balance' : 'Hide balance'}
                    >
                      {balanceHidden ? <IconEyeOff /> : <IconEye />}
                    </button>
                  </div>
                </div>

                <div className="mt-2">
                  {revealed ? (
                    <span key="shown" className={`${swap} text-4xl font-semibold tracking-tight text-white tabular-nums`}>
                      <RollingNumber
                        id={`home:net:${shownCurrency}`}
                        value={netWorth}
                        format={v => fmt(v, shownCurrency)}
                      />
                    </span>
                  ) : (
                    <span key="hidden" className={`${swap} text-4xl font-semibold tracking-tight text-white/80`}>{fmtHidden(shownCurrency, 6)}</span>
                  )}
                </div>

                {/* The rest of the ledger, unconverted, when that is what was
                    asked for. Small and under the figure rather than beside
                    it: these are separate totals, not parts of one. */}
                {separated && otherTotals.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    {otherTotals.map(({ code, total }) => (
                      <span key={code} className="text-sm font-semibold text-white/55 tabular-nums">
                        {revealed ? fmt(total, code) : fmtHidden(code)}
                      </span>
                    ))}
                  </div>
                )}

                {/* A net worth missing an account is not a net worth. It says
                    which currency it could not price rather than quietly
                    valuing that account at nothing, which is what dropping it
                    would amount to. Only ever shown to somebody who holds a
                    foreign account AND has no rate for it - and never in
                    separated mode, which does not need one. */}
                {unconverted.length > 0 && (
                  <p className="mt-1.5 text-11 text-amber-200/90 leading-snug">
                    {unconverted.join(', ')} not included: no exchange rate yet.
                  </p>
                )}

                <div className="wallet-fold -mx-6" data-open={breakdownOpen}>
                  <div className="pt-5">
                    {/* pb-1.5, which looks wrong on its own and is not: the
                        card's own padding-bottom already reserves 18px below
                        the body's content, on top of the 22px the tab hangs
                        below it. At pb-6 the two stacked to 42px of empty
                        face under "Cash, wallets" - a band deeper than the
                        row of figures itself. 6px + 18px puts the content
                        14px clear of the stitching, which is exactly the
                        clearance px-6 gives it on the left and right. */}
                    <div id="net-worth-breakdown" className="wallet-pocket px-6 pt-5 pb-1.5">
                      {/* One half at a time - see haveTiles. The flip button
                          beside the eye chooses which; the tiles say which it
                          is by what they are called. */}
                      <div key={walletSide} className={`${sideSwap} grid grid-cols-3 gap-x-3`}>
                        {pileTiles.map(tile => (
                          <div key={tile.key} className="min-w-0">
                            <p className="text-white/50 text-11 mb-1 truncate">{tile.label}</p>
                            <p key={revealed ? 's' : 'h'} className={`${swap} text-white font-semibold text-sm tabular-nums`}>
                              {/* Compact from ₱100K: a loan's ₱420,000.00 ran into
                                  the next column on a 360px phone, and three
                                  columns have no room for seven digits. The
                                  exact figure is one tap away, on Accounts. */}
                              {revealed
                                ? <RollingNumber id={`home:${tile.key}:${shownCurrency}`} value={tile.value} format={v => (Math.abs(v) >= 1e5 ? fmtCompact(v, shownCurrency) : fmt(v, shownCurrency))} />
                                : '••••'}
                            </p>
                            <p className="text-white/35 text-10 mt-0.5 truncate">{tile.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* The tab. A chevron in a pull-tab reads as "there is more
                  here", so it does that rather than being decoration. */}
              <button
                type="button"
                className="wallet-tab"
                aria-expanded={breakdownOpen}
                aria-controls="net-worth-breakdown"
                aria-label={breakdownOpen ? 'Hide the breakdown' : 'Show the breakdown'}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => setBreakdownOpen(v => {
                  const next = !v
                  try { localStorage.setItem('netWorthBreakdown', next ? 'open' : 'closed') } catch { /* private mode */ }
                  return next
                })}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            </div>
          )
        })()}
      </section>
    </>
  )
  const accountsSection = (
    <>
      {/* ── Account Cards ────────────────────────────────────────────────────── */}
      <section className="mt-6">
        <div className="flex items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">Accounts</h2>
            <button
              onClick={() => setAccountsHidden(h => !h)}
              className="relative hit-slop text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors active:scale-95"
              aria-label={accountsHidden ? 'Show account balances' : 'Hide account balances'}
            >
              {accountsHidden ? <IconEyeOff size={15} /> : <IconEye size={15} />}
            </button>
          </div>
          <Link to="/accounts" className="relative hit-slop [--hit-x:-8px] text-xs font-medium text-primary dark:text-primary active:opacity-70">
            See all
          </Link>
        </div>
        <Rail className="home-accounts-rail gap-3 mt-3 px-5 pt-1 -mt-1 pb-4 -mb-4">
          {(accounts || []).length === 0 && (
            <EmptyPill label="No accounts yet" />
          )}
          {(() => {
            const allAccts    = accounts || []
            const parentNames = new Set(allAccts.filter(a => a.parentName).map(a => a.parentName))
            // Show parent accounts (combined balance) + flat accounts; exclude child accounts.
            // Money you spend from only: investments and loans are not cards
            // (accounts/HoldingTile), and the wallet above already has their tiles.
            const cardAccts   = allAccts
              .filter(a => (parentNames.has(a.name) || !a.parentName) && isEverydayAccount(a))
              .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
            /* The desktop's grid shows five, and its sixth place says how many
               more there are, opening Accounts: a grid of every card pushed
               Recent below the fold. The phone's rail scrolls to them all. */
            const shown = layout === 'desktop' && cardAccts.length > 5 ? cardAccts.slice(0, 5) : cardAccts
            const more = cardAccts.length - shown.length
            return [...shown.map(acct => {
              const isParent = parentNames.has(acct.name)
              const displayAcct = isParent
                ? { ...acct, balance: parentCombinedBal[acct.name] ?? acct.balance }
                : acct
              return (
                <AccountCard
                  key={acct.id}
                  acct={displayAcct}
                  hidden={accountsHidden}
                  onClick={() => navigate(`/accounts/${acct.id}`)}
                  stmt={creditStmtMap[acct.name]}
                />
              )
            }), more > 0 && (
              <Link key="more" to="/accounts" className="home-accounts-more">
                <span className="text-13 font-semibold">View all accounts</span>
                <span className="text-11">{more} more</span>
              </Link>
            )]
          })()}
          {/* spacer so last card doesn't clip under scroll fade */}
          <div className="shrink-0 w-1" />
        </Rail>
      </section>
    </>
  )
  const quickActions = (
    <>
      <QuickActions counts={actionCounts} />
    </>
  )
  const wrappedSection = (
    <>
      {wrappedMonth && <LazyWrappedCard month={wrappedMonth} className="px-5 mt-8" />}
    </>
  )
  const budgetSection = (
    <>
      {/* ── Budget ────────────────────────────────────────────────────────────
          One line and one meter, tapping through to the full breakdown. It
          was a grid of eight per-category chips, which is a lot of screen
          for a question you usually only want a yes-or-no answer to. ── */}
      <section className="px-5 mt-8">
        <SectionHeading inset="none" gap="none" subtitle="This month">Budget</SectionHeading>
        <div className="mt-3">
          <BudgetSummaryTile totals={budgetTotals} />
        </div>
      </section>
    </>
  )
  const templatesSection = (
    <>
      {/* ── Quick templates ─────────────────────────────────────────────────── */}
      {(templates ?? []).length > 0 && (
        <section className="mt-3">
          {/* Room inside the rail for the chips' shadow, handed back by the
              negative margins so nothing moves. A scroller clips everything
              it paints at its padding edge - overflow-x forces overflow-y too
              - and with no room above and 4px below, the dark theme's 16px
              shadow was cut off in a hard line under every chip. */}
          <Rail className="gap-2 px-5 pt-3 -mt-3 pb-5 -mb-4">
            {(templates ?? [])
              .slice()
              .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
              .map(tpl => {
                const cat = (categories ?? []).find(c => c.name === tpl.category)
                const icon = tpl.type === 'transfer'
            ? <IconTransferUI size={15} />
            : <CategoryGlyph cat={cat} size={15} emoji="⚡" />
                const compact = (tpl.amount ?? 0) >= 1000
                  ? baseSymbol() + ((tpl.amount) / 1000).toFixed(1) + 'K'
                  : baseSymbol() + (tpl.amount ?? 0).toFixed(0)
                return (
                  <button
                    key={tpl.id}
                    onClick={() => { setQuickTemplate(tpl); setTimeout(() => setQuickConfirmOpen(true), 0) }}
                    className="card shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl
                      active:scale-[0.96] transition-transform duration-75"
                  >
                    <span className="leading-none">{icon}</span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{tpl.name}</span>
                    <span className="text-11 text-slate-400 dark:text-slate-500 tabular-nums">{compact}</span>
                  </button>
                )
              })
            }
            <div className="shrink-0 w-1" />
          </Rail>
        </section>
      )}
    </>
  )
  const upcomingSection = (
    <>
      <UpcomingSection forecast={forecast} items={upcomingItems} />
    </>
  )
  const recentSection = (
    <>
      {/* ── Recent Transactions ──────────────────────────────────────────────── */}
      <section className="px-5 mt-8 pb-page">
        <SectionHeading inset="none" gap="none" actionLabel="See all" actionTo="/transactions">Recent</SectionHeading>
        <Card radius="3xl" clip className="mt-3">
          {recentTx.length === 0 ? (
            <EmptyState
              size="sm"
              art="ledger"
              title="No transactions yet"
              body={layout === 'desktop'
                // No + to tap on the desktop: its add button, or a key.
                ? <>Use <span className="font-semibold">Add transaction</span>, or press E</>
                : <>Tap <span className="font-semibold">+</span> to add your first entry</>}
            />
          ) : (
            <AnimatePresence key={recentRows.epoch} initial={false}>
              {recentTx.map((tx, i) => (
                <PresenceItem key={tx.id} appear={recentRows.arrival(tx.id)}>
                  <TxRow
                    tx={tx}
                    cat={catMap[tx.category]}
                    glyph={txGlyphCat(tx, catMap)}
                    isLast={i === recentTx.length - 1}
                  />
                </PresenceItem>
              ))}
            </AnimatePresence>
          )}
        </Card>
      </section>
    </>
  )
  const templateSheet = (
    <>
      {/*
        The sheet the template chips open.

        It was imported at the top of this file and never rendered: the chip
        set quickTemplate and quickConfirmOpen, nothing read either, and
        tapping a template did nothing at all. ESLint had been saying so the
        whole time - 'TemplateConfirmSheet' is defined but never used, and
        'quickTemplate' is assigned a value but never used - in a warning
        stream long enough that nobody reads it.

        Left mounted rather than conditionally rendered so the sheet keeps
        its own exit animation; it returns null when closed.
      */}
      <TemplateConfirmSheet
        open={quickConfirmOpen}
        onClose={() => setQuickConfirmOpen(false)}
        template={quickTemplate}
      />
    </>
  )

  if (layout === 'desktop') {
    return (
      <div className="home-desktop">
        {header}
        <div className="home-columns">
          <div className="home-column">{walletSection}{accountsSection}{recentSection}</div>
          <div className="home-column">{wrappedSection}{upcomingSection}{budgetSection}{templatesSection}</div>
        </div>
        {templateSheet}
      </div>
    )
  }

  return (
    <div className="min-h-full pb-4">
      {header}
      {walletSection}
      {accountsSection}
      {quickActions}
      {wrappedSection}
      {budgetSection}
      {templatesSection}
      {upcomingSection}
      {recentSection}
      {templateSheet}
    </div>
  )
}

