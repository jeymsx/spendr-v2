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
  PALETTE, TYPE_OPTIONS, TYPE_LABEL, ROLE_OPTIONS, defaultRole,
} from '../lib/accountMeta'
import { fmt } from '../lib/money'
import IconButton from '../components/ui/IconButton'
import Divider from '../components/ui/Divider'
import EmptyState from '../components/ui/EmptyState'
import { AccountFormSheet, buildAccountRow, createAccount } from './accounts/AccountForm'
import { QrViewerModal } from './accounts/QrSheets'
import { AccountSortSheet } from './accounts/SortSheet'
import { CreditTxSection, DetailTxRow } from './accounts/DetailParts'
import { SummaryBar, AccountCard } from './accounts/ListCard'
import {
  QuickAddSheet, SortableAccountCard, lockToVerticalAxis, stackSortingStrategy,
} from './accounts/QuickAddSheet'

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
const ACCOUNT_GROUPS = [
  { label: 'Spending', roles: ['spending'] },
  { label: 'Savings',  roles: ['savings']  },
  { label: 'Credit',   roles: ['credit']   },
]

/**
 * What an account contributes to a group total. A credit card's `balance`
 * column stays 0 - what it owes is derived from its statement - so summing
 * `balance` across a mixed group quietly undercounts.
 */
function acctTotal(a, creditStmtMap) {
  return a.type === 'credit'
    ? (creditStmtMap[a.name]?.currentBalance ?? 0)
    : (a.balance ?? 0)
}

// ── Date helpers ───────────────────────────────────────────────────────────────

export { nextOccurrence } from './accounts/shared'

// Kept as a named export because AccountDetail imports it; the rule itself
// now lives in utils/creditCycle.js so the Dashboard can use it without
// importing this module.
export const nextOccurrenceDate = nextDueDate

export function fmtCycleDate(date) {
  if (!date) return ''
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

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

  const accounts     = useLiveQuery(() => db.accounts.toArray(),     [], [])
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])

  const creditStmtMap = useMemo(() => {
    const map = {}
    ;(accounts ?? []).filter(a => a.type === 'credit').forEach(acct => {
      map[acct.name] = getCreditStatus(acct, transactions ?? [])
    })
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

  const summary = useMemo(() => {
    // Parents have their own real balance; sum all accounts (no double-counting)
    const allAccts   = accounts ?? []
    const assets     = allAccts.filter(a => a.type !== 'credit').reduce((s, a) => s + (a.balance ?? 0), 0)
    const creditUsed = allAccts.filter(a => a.type === 'credit').reduce((s, a) => {
      const stmt = creditStmtMap[a.name]
      return s + (stmt?.currentBalance ?? 0)
    }, 0)
    return { assets, creditUsed, net: assets - creditUsed }
  }, [accounts, creditStmtMap])

  const groups = useMemo(() =>
    ACCOUNT_GROUPS
      .map(g => ({
        ...g,
        // `role` is user-editable and may be unset on older rows, so fall back
        // to what the type implies.
        accounts: flatAccts.filter(a => g.roles.includes(a.role ?? defaultRole(a.type))),
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
      <SummaryBar summary={summary} hidden={balanceHidden} />

      {/* ── Empty state ── */}
      {(accounts ?? []).length === 0 && (
        <EmptyState
          icon={(
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="3" /><line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          )}
          title="No accounts yet"
          body="Tap + to get started"
        />
      )}

      {/* ── Account sections (parents + type groups, ordered by sort_order) ── */}
      {sections.map(section => {
        if (section.kind === 'parent') {
          const { parent } = section
          const children = (accounts ?? []).filter(a => a.parentName === parent.name)
          const groupTotal = acctTotal(parent, creditStmtMap)
            + children.reduce((s, a) => s + acctTotal(a, creditStmtMap), 0)
          return (
            <section key={parent.id} className="mb-3">
              <div className="flex items-center gap-3 px-5 py-2">
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap">
                  {parent.name}
                </span>
                <Divider className="flex-1" />
                <span className="text-11 tabular-nums text-slate-400 dark:text-slate-500">
                  {fmt(groupTotal)}
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
                {fmt(group.accounts.reduce((s, a) => s + acctTotal(a, creditStmtMap), 0))}
              </span>
            </div>
            {/* One DndContext per group: reordering is within a group, since
                which group a card lands in is decided by its role, not by
                where you drop it. */}
            <DndContext
              sensors={cardSensors}
              collisionDetection={closestCenter}
              modifiers={[lockToVerticalAxis]}
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
                strategy={stackSortingStrategy}
              >
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

