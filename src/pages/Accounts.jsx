import { useState, useMemo, useEffect, useRef, useCallback, forwardRef } from 'react'
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
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import 'react-image-crop/dist/ReactCrop.css'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getCreditStatus, nextDueDate } from '../utils/creditCycle'
import { PH_ACCOUNTS, PH_GROUPS, POPULAR_ACCOUNTS } from '../lib/phAccounts'
import { useToast } from '../context/ToastContext'
import { IconPlus } from '../components/icons'
import { accountBrand } from '../lib/accountBrands'
/* Aliased: this file already has an AccountChip, and it is a different
   thing - a tappable name-and-dot chip in the quick-add sheet. This one
   is the account's card face at row size. */
import { normalizeDesign } from '../lib/cardDesigns'
import BrandMark from '../components/BrandMark'
import BrandWatermark from '../components/BrandWatermark'
import SchemeMark from '../components/SchemeMark'
import {
  fmt, PALETTE, TYPE_OPTIONS, TYPE_LABEL, defaultRole,
} from '../lib/accountMeta'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'
import Sheet from '../components/ui/Sheet'
import Divider from '../components/ui/Divider'
import EmptyState from '../components/ui/EmptyState'
import SectionLabel from '../components/ui/SectionLabel'
import { AccountFormSheet, QrViewerModal, buildAccountRow, createAccount } from './accounts/AccountForm'
import { AccountSortSheet } from './accounts/SortSheet'
import { StatCard, CreditTxSection, DetailTxRow } from './accounts/DetailParts'

/* Re-exported, not redefined. They moved to lib/accountMeta.js so that
   components/CardStyle.jsx can have them without importing a page - see the
   note there. Every `from './Accounts'` import in the app still resolves. */
export { fmt, PALETTE, TYPE_OPTIONS, TYPE_LABEL, defaultRole }

/* ── The rest of the public surface ──────────────────────────────────────────
   The form, the QR viewer and the three detail pieces moved to ./accounts/,
   and four files import them from here: AccountDetail, AccountEdit,
   AccountNew and web/pages/WebAccounts. Re-exported rather than re-pointed -
   moving an import is a change to a file that did not need one. */
export { AccountFormSheet, QrViewerModal, buildAccountRow, createAccount }
export { StatCard, CreditTxSection, DetailTxRow }

// ── Formatters ─────────────────────────────────────────────────────────────────

export function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  const sign = (v ?? 0) < 0 ? '−₱' : '₱'
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return sign + (abs / 1_000).toFixed(1) + 'K'
  return fmt(v)
}

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

export function nextOccurrence(dayOfMonth) {
  if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31) return null
  const now = new Date()
  let d = new Date(now.getFullYear(), now.getMonth(), dayOfMonth)
  if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth)
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

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

// ── Summary bar ────────────────────────────────────────────────────────────────

/**
 * What you are worth, in the shape every other page leads with.
 *
 * This was a blue gradient panel with a dot grid, a specular highlight and
 * three compact figures side by side - the only surface of its kind in the
 * app, and it sat directly above a column of real gradient cards, so the
 * page opened with a card-shaped thing that is not a card.
 *
 * Bills, Goals and AccountDetail all lead the same way instead: a small
 * label, the one figure large, and a line of context under it. Three equal
 * 17px numbers is a table; one 38px number with its parts underneath says
 * which of the three you came to read.
 *
 * Net worth is the headline because assets and credit used are its two
 * halves - the figure is the answer and the line below is the working.
 */
function SummaryBar({ summary, hidden }) {
  return (
    <section className="px-5 mb-6">
      <SectionLabel inset="none" gap="none" className="text-center">Net worth</SectionLabel>
      <p className="mt-0.5 text-center text-[38px] leading-none font-semibold tracking-tight
        tabular-nums text-slate-900 dark:text-white">
        {hidden ? '₱ ••••' : fmtCompact(summary.net)}
      </p>
      <p className="mt-2 text-center text-[13px] text-slate-500 dark:text-slate-400 tabular-nums">
        {hidden ? '•••• assets' : `${fmtCompact(summary.assets)} assets`}
        {summary.creditUsed > 0 && (
          hidden ? ' · •••• credit used' : ` · ${fmtCompact(summary.creditUsed)} credit used`
        )}
      </p>
    </section>
  )
}

// ── Account card ───────────────────────────────────────────────────────────────

/**
 * A real payment card is 85.60 x 53.98 mm - a 1.586:1 landscape ratio. Using
 * the actual ratio is most of what makes these read as cards rather than as
 * coloured tiles, so the face is sized by aspect-ratio and never by a height.
 */
const CARD_RATIO = 1.586
/**
 * How much of each card in a stack stays visible above the next one.
 *
 * Measured, not chosen: the strip's content - brand mark, name, subtitle and
 * balance - ends 47.5px below the card's top edge at 390px wide. 76px left
 * 28.5px of empty gradient under the text on every card but the last, which
 * read as the cards being spaced apart rather than stacked.
 *
 * 50 is the practical floor: 2.5px of clearance under the subtitle. The only
 * real constraint is not clipping that text - an earlier version of this
 * comment claimed the next card's drop shadow would wash over it, which was
 * simply wrong. Both card shadows (0 1px 2px and 0 6px 16px -4px) are offset
 * DOWNWARD, so they fall away from the card above, not onto it.
 */
const STACK_STRIP = 50

/**
 * One account, as a card face.
 *
 * The brand gradient and mark come from lib/accountBrands; text is white
 * throughout, which is why every gradient stop there is darkened until white
 * clears 5:1. `.acct-card` supplies the grain, sheen and moulded rim.
 *
 * Stacked, only the top STACK_STRIP pixels of each card show, so everything
 * that has to be readable at a glance - mark, name, balance - lives in that
 * strip. The lower half carries the detail that only matters once a card is
 * the last in its stack, which is also why tapping opens the full sheet.
 *
 * The overlap is pure CSS: margin-top percentages resolve against the
 * container's WIDTH, and the card's height is width / CARD_RATIO, so pulling
 * up by `calc(STRIPpx - (100/RATIO)%)` leaves exactly STRIP visible at any
 * screen size with nothing measured in JS.
 */
const AccountCard = forwardRef(function AccountCard({
  acct, hidden, onTap, stmt, indent = false, depth = 0,
  dragProps, dragStyle, isDragging = false, isSorting = false,
}, ref) {
  const isCredit       = acct.type === 'credit'
  const currentBalance = stmt?.currentBalance ?? 0
  const limit          = acct.creditLimit ?? 0
  const available      = isCredit ? limit - currentBalance : null
  const stmtPct        = isCredit && limit > 0
    ? Math.min((currentBalance / limit) * 100, 100) : 0
  const nextDue        = isCredit ? nextOccurrence(acct.dueDate) : null
  const brand          = accountBrand(acct)

  // An account named after its own type - "Cash" - would otherwise label
  // itself twice, reading "Cash" over "Cash".
  const typeLabel = TYPE_LABEL[acct.type]
  const subtitle = [
    isCredit
      ? (nextDue ? `Due ${nextDue}` : 'Credit card')
      : (typeLabel && typeLabel.toLowerCase() !== (acct.name ?? '').trim().toLowerCase() ? typeLabel : ''),
    indent ? 'sub-account' : '',
  ].filter(Boolean).join(' · ')

  const pullUp = `calc(${STACK_STRIP}px - ${(100 / CARD_RATIO).toFixed(2)}%)`

  return (
    <button
      ref={ref}
      onClick={onTap}
      className={`acct-card w-full rounded-2xl px-4 pt-3.5 pb-4 flex flex-col text-left text-white${
        isDragging ? ' acct-card-dragging' : isSorting ? ' acct-card-sorting' : ''
      }`}
      style={{
        // The gradient goes in as custom properties, not `background`: the
        // shorthand would beat the design patterns in index.css. See the
        // comment on .acct-card there.
        '--card-from': brand.from,
        '--card-to': brand.to,
        aspectRatio: String(CARD_RATIO),
        marginTop: depth > 0 ? pullUp : 0,
        // Later cards sit over earlier ones, so the strip you read belongs to
        // the card it names.
        zIndex: depth + 1,
        // Spread last: while dragging, dnd-kit's transform and a raised
        // z-index have to beat both of the above.
        ...dragStyle,
      }}
      data-brand={brand.key}
      data-design={normalizeDesign(acct.design)}
      {...dragProps}
    >
      {/* Brand watermark bottom-right, network mark bottom-left. Both are
          real institution art where it exists - see assets/ATTRIBUTION.md. */}
      <BrandWatermark brand={brand} />

      {/* ── The strip: everything legible while stacked ── */}
      <div className="flex items-start justify-between gap-3 w-full">
        <span className="flex items-center gap-2.5 min-w-0">
          <BrandMark mark={brand.mark} size={22} className="shrink-0" />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold leading-tight truncate">
              {acct.name}
            </span>
            {subtitle && (
              <span className="block text-[10px] text-white/65 truncate">{subtitle}</span>
            )}
          </span>
        </span>

        <span className="text-right shrink-0">
          <span className="block text-[16px] font-bold tabular-nums leading-tight">
            {hidden ? '₱ ••••' : fmt(isCredit ? currentBalance : acct.balance)}
          </span>
          <span className="block text-[9px] text-white/65">
            {isCredit
              ? `${hidden ? '••••' : fmtCompact(available ?? 0)} left`
              : 'Balance'}
          </span>
        </span>
      </div>

      {/* ── Below the fold: only seen on the last card of a stack ── */}
      <div className="mt-auto w-full">
        {isCredit ? (
          <>
            <div className="h-1 rounded-full bg-black/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-white/85 transition-all duration-700"
                style={{ width: `${stmtPct}%` }}
              />
            </div>
            <div className="flex items-end justify-between mt-1.5 gap-2">
              <span className="text-[9px] text-white/60">
                {Math.round(stmtPct)}% of {hidden ? '••••' : fmtCompact(limit)} used
              </span>
              <SchemeMark scheme={acct.scheme} className="h-[34px]" />
            </div>
          </>
        ) : (
          <div className="flex items-end justify-between gap-2">
            <span className="text-[9px] text-white/50">
              {acct.currency ?? 'PHP'}
            </span>
            <SchemeMark scheme={acct.scheme} className="h-[34px]" />
          </div>
        )}
      </div>
    </button>
  )
})

// ── Quick-add sheet helpers ────────────────────────────────────────────────────

/**
 * Pin a drag to the vertical axis.
 *
 * A stack is a vertical list, so sideways movement means nothing here - and
 * it caused a real bug rather than just looking odd. <main> is the scroll
 * container and its overflow-x computes to `auto`, so a card dragged
 * sideways extended the scrollable width (measured: 725px inside a 500px
 * viewport) and the whole page could be panned to the right. Pinning x
 * removes the cause instead of clipping the symptom.
 */
const lockToVerticalAxis = ({ transform }) => ({ ...transform, x: 0 })

/**
 * How far each card shifts while another is dragged past it.
 *
 * dnd-kit's built-in vertical strategy measures the gap between item rects
 * and shifts by a whole item height. These cards OVERLAP - each is pulled up
 * so only STACK_STRIP of it shows - so a whole-height shift sends them
 * flying off in both directions. The pitch of this stack is the strip, not
 * the card, and that is the only thing this changes.
 *
 * It is an approximation at the ends, because the last card in a stack is the
 * only one showing its full height: drop something into that slot and the
 * heights swap, which a translation cannot express. It settles correctly on
 * drop, which is what dnd-kit strategies are for.
 */
function stackSortingStrategy({ activeIndex, overIndex, index }) {
  if (activeIndex === -1 || overIndex === -1) return null
  if (index === activeIndex) {
    return { x: 0, y: (overIndex - activeIndex) * STACK_STRIP, scaleX: 1, scaleY: 1 }
  }
  if (activeIndex < overIndex && index > activeIndex && index <= overIndex) {
    return { x: 0, y: -STACK_STRIP, scaleX: 1, scaleY: 1 }
  }
  if (activeIndex > overIndex && index < activeIndex && index >= overIndex) {
    return { x: 0, y: STACK_STRIP, scaleX: 1, scaleY: 1 }
  }
  return null
}

/**
 * A card you can pick up and reorder in place.
 *
 * The card is still a button that opens the account, so drag has to be told
 * apart from tap: a pointer must travel 8px, and a finger must rest 180ms,
 * before a drag begins. Anything shorter stays a tap.
 */
function SortableAccountCard(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting, newIndex } =
    useSortable({ id: props.acct.id })

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    // While held, `transform` must NOT be transitioned or the card lags
    // behind the pointer - so the transition is narrowed to the tilt
    // properties, which are `rotate` and `scale` rather than `transform`
    // precisely so they can carry their own timing. Idle cards fall back to
    // dnd-kit's own transform transition for the reflow.
    transition: isDragging
      ? 'rotate 200ms cubic-bezier(0.2, 0.7, 0.3, 1), scale 200ms cubic-bezier(0.2, 0.7, 0.3, 1)'
      : transition,
  }

  // While a drag is in progress the WHOLE stack layers as it will be once
  // dropped - newIndex is the post-move index of every card, not just the
  // held one - so a card slid into the middle goes behind the card in front
  // of it, the way it would if you pushed it into a real deck. Floating the
  // held card over everything on a fixed z-index looked like it was being
  // carried above the stack rather than into it.
  //
  // Set only while sorting, and as a key that is absent otherwise: this
  // object is spread over the card's base style, and an explicit `undefined`
  // would override the base `zIndex: depth + 1` rather than defer to it -
  // which it silently did, leaving the whole stack on `z-index: auto`.
  if (isSorting) dragStyle.zIndex = newIndex + 1

  return (
    <AccountCard
      {...props}
      ref={setNodeRef}
      isDragging={isDragging}
      isSorting={isSorting}
      dragProps={{ ...attributes, ...listeners }}
      dragStyle={dragStyle}
    />
  )
}

const RECENT_PRESETS_KEY = 'recentAccountPresets'

function getRecentPresets() {
  try { return JSON.parse(localStorage.getItem(RECENT_PRESETS_KEY) ?? '[]') } catch { return [] }
}
function pushRecentPreset(name) {
  const next = [name, ...getRecentPresets().filter(n => n !== name)].slice(0, 5)
  try { localStorage.setItem(RECENT_PRESETS_KEY, JSON.stringify(next)) } catch {}
}

const TYPE_LABEL_SHORT = { ewallet: 'E-wallet', bank: 'Bank', credit: 'Credit card', cash: 'Cash', savings: 'Savings' }

function QASectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="text-xs font-bold text-slate-400 dark:text-slate-500 shrink-0">
        {children}
      </span>
      <Divider className="flex-1" />
    </div>
  )
}

function AccountChip({ acct, onPick }) {
  return (
    <button
      onClick={() => onPick(acct)}
      className="flex items-center gap-2 px-3 py-2 rounded-2xl border text-sm font-medium
        bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-200
        active:scale-[0.94] transition-all duration-75"
      style={{ borderColor: `${acct.color}40` }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color }} />
      {acct.name}
    </button>
  )
}

function PopularCard({ acct, onPick }) {
  return (
    <button
      onClick={() => onPick(acct)}
      className="shrink-0 flex flex-col gap-0.5 px-4 py-3 rounded-2xl border text-left
        bg-white dark:bg-white/[0.05] min-w-[108px]
        active:scale-[0.96] transition-all duration-75"
      style={{ borderColor: `${acct.color}45` }}
    >
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: acct.color }} />
      <span className="text-sm font-semibold text-slate-800 dark:text-white mt-2 leading-tight">{acct.name}</span>
      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{TYPE_LABEL_SHORT[acct.type]}</span>
    </button>
  )
}

// ── Quick-add sheet ────────────────────────────────────────────────────────────

export function QuickAddSheet({ open, onClose, onPickPreset, onCustom }) {
  const [query,       setQuery]       = useState('')
  const [recentNames, setRecentNames] = useState([])

  useEffect(() => {
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) { setQuery(''); setRecentNames(getRecentPresets()) }
  }, [open])

  /* Sheet owns the overlay, the panel, the handle, the scroll lock, Escape,
     the focus trap and the exit animation, so picking just closes it the
     ordinary way. The 260ms stays: the preset opens the form sheet next, and
     two sheets crossing over each other reads as a glitch. */
  function pick(acct) {
    pushRecentPreset(acct.name)
    onClose()
    setTimeout(() => onPickPreset(acct), 260)
  }

  const q        = query.toLowerCase().trim()
  const filtered = q ? PH_ACCOUNTS.filter(a => a.name.toLowerCase().includes(q)) : null
  const recents  = recentNames.map(n => PH_ACCOUNTS.find(a => a.name === n)).filter(Boolean)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add Account"
      maxHeight="88dvh"
      footer={(
        /* The hairline it used to carry is gone with the migration: at
           slate-200/60 over a slate-100 fill it was a rounding error, and
           no other secondary button in the app has one. */
        <Button
          variant="secondary"
          block
          onClick={() => { onClose(); setTimeout(onCustom, 260) }}
        >
          <span className="w-5 h-5 rounded-full bg-slate-300 dark:bg-white/[0.15]
            flex items-center justify-center text-[11px] font-bold text-slate-600 dark:text-white">
            +
          </span>
          Custom account
        </Button>
      )}
    >
      {/* Search */}
      <div className="pt-3 pb-3">
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-slate-500"
            width="14" height="14" viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M14.5 14.5L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search accounts…"
            className="w-full h-10 pl-9 pr-8 rounded-2xl text-sm
              bg-slate-100 dark:bg-white/[0.07]
              text-slate-800 dark:text-slate-200
              placeholder:text-slate-400 dark:placeholder:text-slate-600
              border border-slate-200/60 dark:border-white/[0.08]
              focus:outline-none focus:border-primary/40 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full
                bg-slate-300/80 dark:bg-white/[0.15] flex items-center justify-center
                text-slate-600 dark:text-slate-300 active:opacity-70"
            >
              <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {filtered ? (
        /* ── Search results ── */
        <div className="pb-4">
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-400 dark:text-slate-500">No results for "{query}"</p>
              <button
                onClick={() => { onClose(); setTimeout(onCustom, 260) }}
                className="mt-3 text-xs font-semibold text-primary active:opacity-70"
              >
                + Create custom account
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filtered.map(acct => <AccountChip key={acct.name} acct={acct} onPick={pick} />)}
            </div>
          )}
        </div>
      ) : (
        /* ── Browse ── */
        <div className="pb-4 space-y-5">
          {recents.length > 0 && (
            <div>
              <QASectionLabel>Recent</QASectionLabel>
              <div className="flex flex-wrap gap-2">
                {recents.map(acct => <AccountChip key={acct.name} acct={acct} onPick={pick} />)}
              </div>
            </div>
          )}

          <div>
            <QASectionLabel>Popular</QASectionLabel>
            <div
              className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5 no-scrollbar"
            >
              {POPULAR_ACCOUNTS.map(acct => <PopularCard key={acct.name} acct={acct} onPick={pick} />)}
            </div>
          </div>

          {PH_GROUPS.map(group => (
            <div key={group}>
              <QASectionLabel>{group}</QASectionLabel>
              <div className="flex flex-wrap gap-2">
                {PH_ACCOUNTS.filter(a => a.group === group).map(acct => (
                  <AccountChip key={acct.name} acct={acct} onPick={pick} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

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
                <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
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
              <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
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

