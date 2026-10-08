import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import 'react-image-crop/dist/ReactCrop.css'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getCreditStatus, nextDueDate } from '../utils/creditCycle'
import { useToast } from '../context/ToastContext'
import { IconPlus } from '../components/icons'
/* Aliased: this file already has an AccountChip, and it is a different
   thing - a tappable name-and-dot chip in the quick-add sheet. This one
   is the account's card face at row size. */
import {
  PALETTE, TYPE_OPTIONS, TYPE_LABEL, ROLE_OPTIONS, defaultRole, bucketOf,
} from '../lib/accountMeta'
import { netWorthBreakdown } from '../lib/netWorth'
import useNetWorthDebts from '../hooks/useNetWorthDebts'
import { fmt, fmtHidden } from '../lib/money'
import IconButton from '../components/ui/IconButton'
import Divider from '../components/ui/Divider'
import EmptyState from '../components/ui/EmptyState'
import { AccountFormSheet, buildAccountRow, createAccount } from './accounts/AccountForm'
import { QrViewerModal } from './accounts/QrSheets'
import { AccountSortSheet } from './accounts/SortSheet'
import { CreditTxSection, DetailTxRow } from './accounts/DetailParts'
import { SummaryBar, AccountCard } from './accounts/ListCard'
import { SortableHoldingTile, withinGrid } from './accounts/HoldingTile'
import { investmentStatus } from '../lib/investments'
import { loanStatus } from '../lib/loans'
import AccountsSkeleton, { rememberStacks } from './accounts/ListSkeleton'
import {
  QuickAddSheet, SortableAccountCard, lockToVerticalAxis, stackSortingStrategy,
} from './accounts/QuickAddSheet'
import { sumInBase } from '../lib/fx'
import { useBaseCurrency } from '../context/CurrencyContext'
import useRates from '../hooks/useRates'

/* Re-exported, not redefined. They moved to lib/accountMeta.js so that
   components/CardStyle.jsx can have them without importing a page - see the
   note there. Every `from './Accounts'` import in the app still resolves. */
export { fmt, PALETTE, TYPE_OPTIONS, TYPE_LABEL, ROLE_OPTIONS, defaultRole }

/* ── The rest of the public surface ──────────────────────────────────────────
   The form, the QR viewer and the three detail pieces moved to ./accounts/,
   and four files import them from here: AccountDetail, AccountEdit,
   AccountNew and web/pages/WebAccounts. Re-exported rather than re-pointed -
   moving an import is a change to a file that did not need one. */
export { AccountFormSheet, QrViewerModal, buildAccountRow, createAccount }
export { CreditTxSection, DetailTxRow }

// ── Formatters ─────────────────────────────────────────────────────────────────


// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Grouped by what an account COUNTS AS, not by what kind of institution runs
 * it. The app already had two taxonomies fighting each other: this page
 * grouped by `type` into Cash / E-Wallets / Bank Accounts / Credit Cards,
 * while the Dashboard tiles and useFinanceSummary bucket by `role` into
 * Spending / Savings / Credit. Following role means the subtotals here tie
 * back to the numbers on the home screen, a one-account "Cash" group stops
 * costing a whole header, and the split honours the form's own "Counts as"
 * field - so moving GCash to Savings actually moves it.
 */
/* Investments and Loans are groups of their own, filled by lib/accountMeta's
   bucketOf - which is what decides the piles on Home too, so the subtotals
   here still tie back to the wallet. A group with nothing in it is not drawn,
   so a ledger with no loan never sees a Loans header. */
const ACCOUNT_GROUPS = [
  { label: 'Spending',    roles: ['spending'] },
  { label: 'Savings',     roles: ['savings']  },
  // Tiles, two to a row, not card faces - see accounts/HoldingTile.
  { label: 'Investments', roles: ['invested'], tiles: true },
  { label: 'Credit',      roles: ['credit']   },
  { label: 'Loans',       roles: ['loan'],     tiles: true },
]

/**
 * What an account contributes to a group total. A credit card's `balance`
 * column stays 0 - what it owes is derived from its statement - so summing
 * `balance` across a mixed group quietly undercounts. A loan's is stored
 * negative, and its group reads what is owed, as the credit group does.
 */
function acctTotal(a, creditStmtMap) {
  if (a.type === 'credit') return creditStmtMap[a.name]?.currentBalance ?? 0
  if (a.type === 'loan') return -(a.balance ?? 0)
  return a.balance ?? 0
}

/**
 * The same figure, in the ledger's currency, for a group header.
 *
 * A parent account and its children need not share a currency - a dollar
 * sub-account under a peso bank is the ordinary case this exists for - and
 * adding $500 to P1,000 to get 1,500 is the bug that made all of this
 * necessary. Each CARD still shows its own account in its own currency;
 * only the roll-up converts.
 *
 * @param {any[]} accounts
 * @param {Record<string, any>} creditStmtMap
 * @param {string} base
 * @param {any} rates
 */
function groupTotalInBase(accounts, creditStmtMap, base, rates) {
  return sumInBase(accounts, base, rates, a => acctTotal(a, creditStmtMap)).total
}

// ── Date helpers ───────────────────────────────────────────────────────────────

export { nextOccurrence } from './accounts/shared'

// Kept as a named export because AccountDetail imports it; the rule itself
// now lives in utils/creditCycle.js so the Dashboard can use it without
// importing this module.
export const nextOccurrenceDate = nextDueDate

// In accounts/shared.jsx now, where a card's statement pages can reach it
// without loading this page's modules.
export { fmtCycleDate } from './accounts/shared'

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconEye() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Accounts() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [balanceHidden,   setBalanceHidden]   = useState(false)
  const [editingAccount,  setEditingAccount]  = useState(null)
  const [formOpen,        setFormOpen]        = useState(false)
  const [formPrefill,     setFormPrefill]     = useState(null)
  const [quickAddOpen,    setQuickAddOpen]    = useState(false)
  const [sortOpen,        setSortOpen]        = useState(false)

  /* undefined until read, not [], and the page waits for both: a card's
     balance owed comes from the transactions, so drawing the accounts first
     showed every credit card at nothing owed for a moment. See
     accounts/ListSkeleton.jsx. */
  const accounts     = useLiveQuery(() => db.accounts.toArray(),     [], undefined)
  const baseCurrency = useBaseCurrency()
  const { table: rates } = useRates()
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const nwDebts      = useNetWorthDebts()
  const loading      = accounts === undefined || transactions === undefined || !nwDebts.ready

  const creditStmtMap = useMemo(() => {
    const map = {}
    ;(accounts ?? []).filter(a => a.type === 'credit').forEach(acct => {
      map[acct.name] = getCreditStatus(acct, transactions ?? [])
    })
    return map
  }, [accounts, transactions])

  /* What each investment and loan tile says beyond its balance - the gain,
     the old-value mark, how far along, a missed payment. */
  const holdingStatus = useMemo(() => {
    /** @type {Record<string, any>} */
    const map = {}
    for (const a of accounts ?? []) {
      if (a.type === 'investment') map[a.name] = investmentStatus(a, transactions ?? [])
      else if (a.type === 'loan') map[a.name] = loanStatus(a, transactions ?? [])
    }
    return map
  }, [accounts, transactions])

  const parentNames = useMemo(() =>
    new Set((accounts ?? []).filter(a => a.parentName).map(a => a.parentName)),
    [accounts],
  )

  const parentAccts = useMemo(() =>
    (accounts ?? [])
      .filter(a => parentNames.has(a.name))
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [accounts, parentNames],
  )

  const flatAccts = useMemo(() =>
    (accounts ?? [])
      .filter(a => !a.parentName && !parentNames.has(a.name))
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [accounts, parentNames],
  )

  /* The same net worth Home shows - lib/netWorth.js - converted into the
     ledger's currency. It used to add every balance at face value, so a
     dollar account counted its dollars as pesos here and nowhere else. */
  const summary = useMemo(() => {
    const b = netWorthBreakdown({
      accounts: accounts ?? [], transactions: transactions ?? [], view: baseCurrency, rates,
      creditStatus: creditStmtMap, debts: nwDebts.debts, includeDebts: nwDebts.include,
    })
    return {
      net: b.total,
      assets: b.spending + b.savings + b.invested + b.owedToYou,
      creditUsed: b.credit,
      owed: b.credit + b.loans + b.youOwe,
    }
  }, [accounts, transactions, baseCurrency, rates, creditStmtMap, nwDebts.debts, nwDebts.include])

  const groups = useMemo(() =>
    ACCOUNT_GROUPS
      .map(g => ({
        ...g,
        // `role` is user-editable and may be unset on older rows - bucketOf
        // falls back to what the type implies, and fixes the three kinds whose
        // meaning never changes.
        accounts: flatAccts.filter(a => g.roles.includes(bucketOf(a))),
      }))
      .filter(g => g.accounts.length > 0),
    [flatAccts],
  )

  // Merge parent sections and type groups into one list sorted by sort_order
  const sections = useMemo(() => {
    const list = []
    for (const parent of parentAccts) {
      list.push({ kind: 'parent', parent, order: parent.sort_order ?? 9999 })
    }
    for (const group of groups) {
      const minOrder = Math.min(...group.accounts.map(a => a.sort_order ?? 9999))
      list.push({ kind: 'group', group, order: minOrder })
    }
    return list.sort((a, b) => a.order - b.order)
  }, [parentAccts, groups])

  // How many cards each stack held, so the next visit's skeleton is this shape.
  useEffect(() => {
    if (loading) return
    // A grid section is remembered as a negative count - ListSkeleton draws tiles for it.
    rememberStacks(sections.map(s => (s.kind === 'parent'
      ? 1 + accounts.filter(a => a.parentName === s.parent.name).length
      : s.group.tiles ? -s.group.accounts.length : s.group.accounts.length)))
  }, [loading, sections, accounts])

  // ?open=<accountName> used to pop the detail sheet. The detail view is a
  // route now, so this forwards instead - the desktop shell still links this
  // way, and so might a bookmark. `replace` keeps it out of the back stack,
  // so back from the detail page lands on the list rather than bouncing.
  useEffect(() => {
    const name = searchParams.get('open')
    if (!name || !accounts?.length) return
    const acct = accounts.find(a => a.name === decodeURIComponent(name))
    if (acct) navigate(`/accounts/${acct.id}`, { replace: true })
    else setSearchParams({}, { replace: true })
  }, [accounts, searchParams, navigate, setSearchParams])

  // Adding an account is its own page now - it shows the card you are making
  // as you make it, and skips the credit fields for accounts that cannot have
  // a statement. See pages/AccountNew.jsx.
  function openAdd() {
    navigate('/accounts/new')
  }

  function openFormWithPrefill(prefill) {
    setEditingAccount(null)
    setFormPrefill(prefill)
    setFormOpen(true)
  }

  function openFormCustom() {
    setEditingAccount(null)
    setFormPrefill(null)
    setFormOpen(true)
  }

  // A route, not a sheet: the detail view is its own page, so the hardware
  // back button and a direct link both work. See pages/AccountDetail.jsx.
  /* MouseSensor, NOT PointerSensor - and that is the whole fix for touch.
     PointerSensor handles mouse, touch and pen alike, so on a phone it took
     the gesture first and activated after 8px of finger travel, which is
     indistinguishable from the start of a scroll. The TouchSensor beneath it
     never ran at all, delay and everything - it was dead code. The result was
     a stack that fought the page for every swipe and reordered by accident.

     Split by input type and each gets the constraint that suits it. A mouse
     drags after 8px of travel, as before. A finger has to REST on the card
     first, and if it moves more than `tolerance` before the delay elapses the
     activation is cancelled and the browser scrolls normally - so a swipe
     scrolls, a tap opens the account, and only a deliberate hold picks a card
     up.

     500ms is the platform norm for press-and-hold (iOS and Android both);
     longer reads as the app having missed the gesture. It is one number here
     if it wants changing.

     The sort sheet below keeps PointerSensor deliberately: its container sets
     touch-action:none, so nothing there scrolls and there is no gesture to be
     ambiguous with. That is also why reordering already worked there and not
     here. */
  const cardSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
  )

  /* A press-and-hold has no visible threshold, so the moment it takes needs
     announcing. Android Chrome vibrates; iOS Safari has no Vibration API and
     ignores this, which is why it is a bonus signal and not the only one -
     the card also tilts and lifts as it is picked up. */
  const buzz = useCallback(() => {
    try { navigator.vibrate?.(12) } catch { /* unsupported, or denied */ }
  }, [])

  /* A long-press that is released without moving is still a tap as far as the
     browser is concerned: it fires a click on the card, which would navigate
     to the account page the instant you decided not to reorder after all.
     dnd-kit does not suppress that, so the tap handler checks whether a drag
     has only just finished. Only the touch path can hit this - a mouse drag
     needs 8px of travel, which already cancels the click. */
  const dragEndedAt = useRef(0)
  /* purity fires on the performance.now() here. It is inside a closure that
     only ever runs from a pointer handler - dnd-kit calls it to decide
     whether a tap was the tail of a drag - so it never executes during
     render, which is the thing the rule is protecting. */
  // eslint-disable-next-line react-hooks/purity
  const tapAfterDrag = () => performance.now() - dragEndedAt.current < 300

  /**
   * Persist a reorder made inside one group.
   *
   * sort_order is a single global sequence while the stacks are per-role, so
   * renumbering just the moved group would interleave its indices with the
   * other groups' and scramble them. This walks the whole displayed list and
   * substitutes the moved group's new sequence at the positions that group
   * already occupied, then renumbers everything 0..n - which leaves every
   * other group exactly where it was and keeps the number meaning the same
   * thing it does in the sort sheet.
   */
  async function reorderWithinGroup(groupAccounts, activeId, overId) {
    const from = groupAccounts.findIndex(a => a.id === activeId)
    const to   = groupAccounts.findIndex(a => a.id === overId)
    if (from === -1 || to === -1 || from === to) return

    const moved = arrayMove(groupAccounts, from, to)
    const inGroup = new Set(moved.map(a => a.id))
    let cursor = 0
    const full = flatAccts.map(a => (inGroup.has(a.id) ? moved[cursor++] : a))

    const now = new Date().toISOString()
    try {
      await Promise.all(full.map((a, i) =>
        db.accounts.update(a.id, { sort_order: i, updatedAt: now })
      ))
    } catch (e) {
      console.error('[Accounts] reorder failed:', e)
      showToast('Could not save the new order', 'error')
    }
  }

  function openDetail(acct) {
    navigate(`/accounts/${acct.id}`)
  }

  return (
    <div className="pb-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-safe-header pb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Accounts</h1>
        <div className="flex items-center gap-2">
          {/* The eye came off the gradient panel with the panel. It belongs
              with the page's other controls rather than floating in a corner
              of one figure - it hides every balance on the screen, not just
              that one. */}
          <IconButton
            label={balanceHidden ? 'Show balances' : 'Hide balances'}
            onClick={() => setBalanceHidden(h => !h)}
          >
            {balanceHidden ? <IconEyeOff /> : <IconEye />}
          </IconButton>
          {(accounts ?? []).length > 1 && (
            <IconButton
              label="Sort accounts"
              onClick={() => setSortOpen(true)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 18V6M8 6L5 9M8 6l3 3" />
                <path d="M16 6v12M16 18l-3-3M16 18l3-3" />
              </svg>
            </IconButton>
          )}
          <IconButton label="Add account" variant="primary" onClick={openAdd}>
            <IconPlus size={19} strokeWidth="2.5" />
          </IconButton>
        </div>
      </div>

      {/* ── Summary ── */}
      {loading
        ? <AccountsSkeleton />
        : <SummaryBar summary={summary} hidden={balanceHidden} />}

      {/* ── Empty state ── */}
      {!loading && (accounts ?? []).length === 0 && (
        <EmptyState
          art="wallet"
          title="No accounts yet"
          body="Tap + to get started"
        />
      )}

      {/* ── Account sections (parents + type groups, ordered by sort_order) ── */}
      {!loading && sections.map(section => {
        if (section.kind === 'parent') {
          const { parent } = section
          const children = (accounts ?? []).filter(a => a.parentName === parent.name)
          const groupTotal = groupTotalInBase(
            [parent, ...children], creditStmtMap, baseCurrency, rates)
          return (
            <section key={parent.id} className="mb-3">
              <div className="flex items-center gap-3 px-5 py-2">
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap">
                  {parent.name}
                </span>
                <Divider className="flex-1" />
                {/* Masked with the cards under it: the eye hides every balance
                    on the page, and a subtotal is a balance. */}
                <span className="text-11 tabular-nums text-slate-400 dark:text-slate-500">
                  {balanceHidden ? fmtHidden() : fmt(groupTotal)}
                </span>
              </div>
              {/* Stacked, wallet-style: each card overlaps the one above it
                  so a whole group is visible at once, and the strip that stays
                  showing carries the name and balance. */}
              <div className="mx-5 flex flex-col">
                <AccountCard
                  acct={parent}
                  hidden={balanceHidden}
                  onTap={() => openDetail(parent)}
                  stmt={creditStmtMap[parent.name]}
                  depth={0}
                />
                {children.map((acct, i) => (
                  <AccountCard
                    key={acct.id}
                    acct={acct}
                    hidden={balanceHidden}
                    onTap={() => openDetail(acct)}
                    stmt={creditStmtMap[acct.name]}
                    indent
                    depth={i + 1}
                  />
                ))}
              </div>
            </section>
          )
        }

        const { group } = section
        return (
          <section key={group.label} className="mb-3">
            <div className="flex items-center gap-3 px-5 py-2">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {group.label}
              </span>
              <Divider className="flex-1" />
              <span className="text-11 tabular-nums text-slate-400 dark:text-slate-500">
                {balanceHidden ? fmtHidden() : fmt(groupTotalInBase(group.accounts, creditStmtMap, baseCurrency, rates))}
              </span>
            </div>
            {/* One DndContext per group: reordering is within a group, since
                which group a card lands in is decided by its role, not by
                where you drop it. */}
            <DndContext
              sensors={cardSensors}
              collisionDetection={closestCenter}
              // A grid moves both ways; a stack only up and down.
              modifiers={group.tiles ? [withinGrid] : [lockToVerticalAxis]}
              autoScroll={{ threshold: { x: 0, y: 0.2 } }}
              onDragStart={buzz}
              onDragEnd={({ active, over }) => {
                dragEndedAt.current = performance.now()
                if (over && active.id !== over.id) {
                  reorderWithinGroup(group.accounts, active.id, over.id)
                }
              }}
              // Held, then released without moving - or scrolled away from.
              // Still has to block the click the browser is about to send.
              onDragCancel={() => { dragEndedAt.current = performance.now() }}
            >
              <SortableContext
                items={group.accounts.map(a => a.id)}
                strategy={group.tiles ? rectSortingStrategy : stackSortingStrategy}
              >
                {group.tiles ? (
                  <div className="mx-5 grid grid-cols-2 gap-3">
                    {group.accounts.map(acct => (
                      <SortableHoldingTile
                        key={acct.id}
                        acct={acct}
                        status={holdingStatus[acct.name]}
                        hidden={balanceHidden}
                        onTap={() => { if (!tapAfterDrag()) openDetail(acct) }}
                      />
                    ))}
                  </div>
                ) : (
                <div className="mx-5 flex flex-col">
                  {group.accounts.map((acct, i) => (
                    <SortableAccountCard
                      key={acct.id}
                      acct={acct}
                      hidden={balanceHidden}
                      onTap={() => { if (!tapAfterDrag()) openDetail(acct) }}
                      stmt={creditStmtMap[acct.name]}
                      depth={i}
                    />
                  ))}
                </div>
                )}
              </SortableContext>
            </DndContext>
          </section>
        )
      })}

      {/* ── Sheets ── */}
      <AccountSortSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        accounts={accounts ?? []}
      />
      <QuickAddSheet
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onPickPreset={openFormWithPrefill}
        onCustom={openFormCustom}
      />
      <AccountFormSheet
        open={formOpen}
        onClose={() => { setFormOpen(false); setFormPrefill(null) }}
        account={editingAccount}
        prefill={formPrefill}
      />
    </div>
  )
}

