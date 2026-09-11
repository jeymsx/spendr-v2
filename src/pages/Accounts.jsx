import { useState, useMemo, useEffect, useRef, useCallback, forwardRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext, closestCenter, MouseSensor, PointerSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useTheme } from '../context/ThemeContext'
import db, { UNSYNCED } from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getCreditStatus, nextDueDate } from '../utils/creditCycle'
import { PH_ACCOUNTS, PH_GROUPS, POPULAR_ACCOUNTS } from '../lib/phAccounts'
import { useScrollLock } from '../hooks/useScrollLock'
import { useToast } from '../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { IconBank, IconCard, IconPhone, IconPlus, IconWallet, IconWalletUI, IconBankUI, IconTrash} from '../components/icons'
import { deleteAccountRemote } from '../lib/sync'
import { accountBrand } from '../lib/accountBrands'
import { normalizeDesign } from '../lib/cardDesigns'
import BrandMark from '../components/BrandMark'
import BrandWatermark from '../components/BrandWatermark'
import SchemeMark from '../components/SchemeMark'
import {
  PreviewCard, CardDesignGallery, ColorRail, SchemeRail,
} from '../components/CardStyle'
import CategoryGlyph from '../components/CategoryGlyph'
import SubPage from '../components/SubPage'
import { cardGradient } from '../lib/accentTheme'
import {
  fmt, PALETTE, TYPE_OPTIONS, TYPE_LABEL, defaultRole,
} from '../lib/accountMeta'

/* Re-exported, not redefined. They moved to lib/accountMeta.js so that
   components/CardStyle.jsx can have them without importing a page - see the
   note there. Every `from './Accounts'` import in the app still resolves. */
export { fmt, PALETTE, TYPE_OPTIONS, TYPE_LABEL, defaultRole }

// ── Formatters ─────────────────────────────────────────────────────────────────

export function fmtCompact(v) {
  const abs = Math.abs(v ?? 0)
  const sign = (v ?? 0) < 0 ? '−₱' : '₱'
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return sign + (abs / 1_000).toFixed(1) + 'K'
  return fmt(v)
}

function fmtTxDate(isoStr) {
  if (!isoStr) return ''
  const d    = new Date(isoStr)
  const now  = new Date(); now.setHours(0, 0, 0, 0)
  const tmrw = new Date(now); tmrw.setDate(now.getDate() + 1)
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  // Both bounds matter. `d >= now` alone labelled every future date "Today",
  // which went unnoticed while nothing could be dated ahead — installments
  // schedule charges months out, so the whole plan read as "Today".
  if (d >= now  && d < tmrw) return 'Today'
  if (d >= yest && d < now)  return 'Yesterday'
  // Include the year once it differs: a 24- or 36-month plan runs past it.
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-PH',
    sameYear ? { month: 'short', day: 'numeric' }
             : { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTxTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Grouped by what an account COUNTS AS, not by what kind of institution runs
 * it. The app already had two taxonomies fighting each other: this page
 * grouped by `type` into Cash / E-Wallets / Bank Accounts / Credit Cards,
 * while the Dashboard tiles and useFinanceSummary bucket by `role` into
 * Spending / Savings / Credit. Following role means the subtotals here tie
 * back to the numbers on the home screen, a one-account "Cash" group stops
 * costing a whole header, and the split honours the form's own "Counts As"
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


export function typeIcon(type) {
  if (type === 'cash')    return <IconWallet />
  if (type === 'ewallet') return <IconPhone />
  if (type === 'credit')  return <IconCard />
  return <IconBank />
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Label({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5 px-1">
      {children}
    </p>
  )
}

function inputClass(error = false) {
  return [
    'w-full h-[48px] px-4 rounded-2xl text-sm font-medium',
    'text-slate-800 dark:text-white',
    'bg-white dark:bg-white/[0.06]',
    error
      ? 'border border-red-300 dark:border-red-500/40'
      : 'border border-slate-200/80 dark:border-white/[0.09]',
    'placeholder-slate-400 dark:placeholder-slate-500',
    'outline-none focus:ring-2 focus:ring-primary/30',
    'shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-none',
  ].join(' ')
}

// ── Summary bar ────────────────────────────────────────────────────────────────


function SummaryBar({ summary, hidden, onToggleHide, accentColor, theme }) {
  return (
    <div
      className="mx-5 mb-6 rounded-3xl p-5 relative overflow-hidden"
      style={{ background: cardGradient(accentColor, theme) }}
    >
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 20% 10%, rgba(255,255,255,0.5) 0%, transparent 60%)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '16px 16px' }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Overview</span>
          <button onClick={onToggleHide} className="text-white/60 hover:text-white/90 transition-colors active:scale-95">
            {hidden ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wider mb-1">Assets</p>
            <p className="text-white font-bold text-[17px] tabular-nums leading-tight">
              {hidden ? '₱ ••••' : fmtCompact(summary.assets)}
            </p>
          </div>
          <div>
            <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wider mb-1">Credit Used</p>
            <p className="text-white font-bold text-[17px] tabular-nums leading-tight">
              {hidden ? '₱ ••••' : fmtCompact(summary.creditUsed)}
            </p>
          </div>
          <div>
            <p className="text-white/55 text-[10px] font-semibold uppercase tracking-wider mb-1">Net Worth</p>
            <p className="text-white font-bold text-[17px] tabular-nums leading-tight">
              {hidden ? '₱ ••••' : fmtCompact(summary.net)}
            </p>
          </div>
        </div>
      </div>
    </div>
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
              <span className="text-[9px] uppercase tracking-wider text-white/60">
                {Math.round(stmtPct)}% of {hidden ? '••••' : fmtCompact(limit)} used
              </span>
              <SchemeMark scheme={acct.scheme} className="h-[34px]" />
            </div>
          </>
        ) : (
          <div className="flex items-end justify-between gap-2">
            <span className="text-[9px] uppercase tracking-wider text-white/50">
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

const TYPE_LABEL_SHORT = { ewallet: 'E-Wallet', bank: 'Bank', credit: 'Credit Card', cash: 'Cash', savings: 'Savings' }

function QASectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
        {children}
      </span>
      <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.06]" />
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
  const [closing,     setClosing]     = useState(false)
  const [query,       setQuery]       = useState('')
  const [recentNames, setRecentNames] = useState([])
  useScrollLock(open)

  useEffect(() => {
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) { setQuery(''); setRecentNames(getRecentPresets()) }
  }, [open])

  const close = useCallback(() => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }, [onClose])

  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close }, [close])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function pick(acct) {
    pushRecentPreset(acct.name)
    close()
    setTimeout(() => onPickPreset(acct), 260)
  }

  const q        = query.toLowerCase().trim()
  const filtered = q ? PH_ACCOUNTS.filter(a => a.name.toLowerCase().includes(q)) : null
  const recents  = recentNames.map(n => PH_ACCOUNTS.find(a => a.name === n)).filter(Boolean)

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={`${closing ? 'sheet-panel-exit' : 'sheet-panel'} absolute bottom-0 inset-x-0
          rounded-t-[28px] overflow-hidden
          bg-white dark:bg-[#111820]
          border-t border-slate-100 dark:border-white/[0.07]
          flex flex-col`}
        style={{ maxHeight: '88dvh' }}
      >
        {/* Header */}
        <div className="pt-4 px-5 pb-3 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-white">Add Account</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Select a preset or create a custom one</p>
            </div>
            <button
              onClick={close}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.08]
                flex items-center justify-center text-slate-500 dark:text-slate-400
                active:bg-slate-200 dark:active:bg-white/[0.14] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-5 pb-3 shrink-0">
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

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          {filtered ? (
            /* ── Search results ── */
            <div className="pb-4">
              {filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-400 dark:text-slate-500">No results for "{query}"</p>
                  <button
                    onClick={() => { close(); setTimeout(onCustom, 260) }}
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
        </div>

        {/* Custom account footer */}
        <div
          className="px-5 pt-3 shrink-0 border-t border-slate-100 dark:border-white/[0.06]"
          style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => { close(); setTimeout(onCustom, 260) }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-sm font-semibold
              text-slate-600 dark:text-slate-300
              bg-slate-100 dark:bg-white/[0.06]
              border border-slate-200/60 dark:border-white/[0.08]
              active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
          >
            <span className="w-5 h-5 rounded-full bg-slate-300 dark:bg-white/[0.15]
              flex items-center justify-center text-[11px] font-bold text-slate-600 dark:text-white">
              +
            </span>
            Custom Account
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Accounts() {
  const { accentColor, theme } = useTheme()
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
          {(accounts ?? []).length > 1 && (
            <button
              onClick={() => setSortOpen(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-150
                border shadow-sm
                bg-white dark:bg-primary/[0.10]
                border-slate-200/80 dark:border-primary/[0.20]
                text-slate-500 dark:text-slate-300
                dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.12)]
                active:scale-95"
              aria-label="Sort accounts"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 18V6M8 6L5 9M8 6l3 3" />
                <path d="M16 6v12M16 18l-3-3M16 18l3-3" />
              </svg>
            </button>
          )}
          <button
            onClick={openAdd}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0
              bg-primary text-white
              active:scale-90 transition-transform duration-75"
            aria-label="Add account"
          >
            <IconPlus size={19} strokeWidth="2.5" />
          </button>
        </div>
      </div>

      {/* ── Summary ── */}
      <SummaryBar
        summary={summary}
        hidden={balanceHidden}
        onToggleHide={() => setBalanceHidden(h => !h)}
        accentColor={accentColor}
        theme={theme}
      />

      {/* ── Empty state ── */}
      {(accounts ?? []).length === 0 && (
        <div className="flex flex-col items-center py-20 text-center px-8">
          <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center mb-4 text-slate-300 dark:text-slate-600">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="3" /><line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No accounts yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Tap + to get started</p>
        </div>
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
                <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">
                  {parent.name}
                </span>
                <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.07]" />
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
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {group.label}
              </span>
              <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.07]" />
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

// ── Account Sort Sheet ─────────────────────────────────────────────────────────

function SortableAccountItem({ acct, childCount }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: acct.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center',
        isDragging ? 'relative z-10 rounded-2xl bg-white dark:bg-[#1a2130] shadow-2xl ring-1 ring-primary/30 opacity-95 scale-[1.02]' : '',
      ].join(' ')}
    >
      <button
        {...attributes}
        {...listeners}
        className="pl-3 pr-1 py-4 text-slate-300 dark:text-slate-600 touch-none shrink-0 cursor-grab active:cursor-grabbing"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
        </svg>
      </button>
      <div className="flex-1 flex items-center gap-3 px-3 py-3">
        <span
          className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center"
          style={{ backgroundColor: (acct.color ?? '#2D9DFF') + '28' }}
        >
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: acct.color ?? '#2D9DFF' }} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{acct.name}</p>
          {childCount > 0 && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{childCount} sub-account{childCount !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function AccountSortSheet({ open, onClose, accounts }) {
  const [closing,   setClosing]   = useState(false)
  const [localList, setLocalList] = useState([])
  const isDraggingRef = useRef(false)
  useScrollLock(open)

  const parentNames = useMemo(() =>
    new Set(accounts.filter(a => a.parentName).map(a => a.parentName)),
    [accounts],
  )

  const topLevel = useMemo(() =>
    accounts
      .filter(a => parentNames.has(a.name) || !a.parentName)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [accounts, parentNames],
  )

  const childCountMap = useMemo(() => {
    const map = {}
    accounts.filter(a => a.parentName).forEach(a => {
      map[a.parentName] = (map[a.parentName] ?? 0) + 1
    })
    return map
  }, [accounts])

  useEffect(() => {
    if (open && !isDraggingRef.current) setLocalList(topLevel)
  }, [open, topLevel])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  function handleDragStart() {
    isDraggingRef.current = true
  }

  async function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) { isDraggingRef.current = false; return }
    const oldIdx = localList.findIndex(a => a.id === active.id)
    const newIdx = localList.findIndex(a => a.id === over.id)
    if (oldIdx === -1 || newIdx === -1) { isDraggingRef.current = false; return }
    const reordered = arrayMove(localList, oldIdx, newIdx)
    setLocalList(reordered)
    const now = new Date().toISOString()
    await Promise.all(reordered.map((acct, i) =>
      db.accounts.update(acct.id, { sort_order: i, updatedAt: now })
    ))
    isDraggingRef.current = false
  }

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[100]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-slate-50 dark:bg-[#0d1117]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[80vh] flex flex-col',
        ].join(' ')}
      >
        {/* Header */}
        <div className="pt-5 px-5 pb-3 border-b border-slate-100 dark:border-white/[0.04] shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">Sort Accounts</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Drag to reorder — affects picker order</p>
            </div>
            <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
              Done
            </button>
          </div>
        </div>

        {/* List */}
        <div
          className="overflow-y-auto flex-1 px-5 pt-4 pb-8"
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          <div className="rounded-2xl overflow-hidden
            bg-white border border-slate-100
            dark:bg-white/[0.04] dark:border-white/[0.07]
            shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={localList.map(a => a.id)} strategy={verticalListSortingStrategy}>
                {localList.map((acct, i) => (
                  <div key={acct.id}>
                    <SortableAccountItem
                      acct={acct}
                      childCount={childCountMap[acct.name] ?? 0}
                    />
                    {i < localList.length - 1 && (
                      <div className="h-px bg-slate-50 dark:bg-white/[0.04] ml-14 mr-4" />
                    )}
                  </div>
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Customise card: the create flow's third step, reachable while editing.
 *
 * Editing an account used to offer fourteen solid swatches in a wrapped grid
 * and no way to change the design at all - so a card made with the gallery
 * could never be changed again, and the two screens disagreed about what
 * choosing a colour even looked like. This is the same CardDesignGallery and
 * the same ColorRail the create flow shows, in a sheet.
 *
 * It writes through to the form's own state rather than holding a copy, so
 * Cancel on the form still discards everything and there is no second draft
 * to reconcile.
 */
function CardStyleSheet({ open, onClose, draft, set }) {
  const [closing, setClosing] = useState(false)
  useScrollLock(open)

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[150]">
      <div className="sheet-overlay absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[94vh] overflow-y-auto',
        ].join(' ')}
        style={{
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        }}
      >
        <div className="pt-5 px-5 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800 dark:text-white">Customise card</h3>
            <button
              onClick={close}
              className="text-xs font-semibold text-primary px-3 py-1.5 rounded-xl
                bg-primary/10 dark:bg-primary/15 active:bg-primary/20 transition-colors"
            >
              Done
            </button>
          </div>
        </div>

        {/* The card stands up here, exactly as it does on the create flow's
            style step - that upright card is the thing being chosen, and it
            is what makes this read as the same screen rather than a
            different one that happens to share a colour row. */}
        <div className="pt-2 pb-1">
          <CardDesignGallery draft={draft} set={set} />
        </div>

        <div className="mt-3 px-5">
          <ColorRail draft={draft} set={set} />
        </div>
      </div>
    </div>
  )
}

// ── QR Crop Sheet ─────────────────────────────────────────────────────────────

function QrCropSheet({ open, onClose, onConfirm, initialSrc = null }) {
  const [closing,       setClosing]       = useState(false)
  const [imgSrc,        setImgSrc]        = useState(null)
  const [crop,          setCrop]          = useState(null)
  const [completedCrop, setCompletedCrop] = useState(null)
  const imgRef    = useRef(null)
  const fileRef   = useRef(null)
  useScrollLock(open)

  useEffect(() => {
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // The photo arrives as a prop now, so opening means "crop this".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImgSrc(open ? (initialSrc ?? null) : null)
    setCrop(null)
    setCompletedCrop(null)
  }, [open, initialSrc])

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImgSrc(reader.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function onImageLoad(e) {
    const img = e.currentTarget
    const dw = img.width   // display (CSS) pixels
    const dh = img.height
    const aspect = 5 / 7
    let w, h
    if (dw / dh > aspect) { h = dh; w = h * aspect }
    else { w = dw; h = w / aspect }
    const x = (dw - w) / 2
    const y = (dh - h) / 2
    const initial = { unit: 'px', x, y, width: w, height: h }
    setCrop(initial)
    setCompletedCrop(initial)
  }

  function handleConfirm() {
    if (!completedCrop || !imgRef.current) return
    const img = imgRef.current
    const scaleX = img.naturalWidth  / img.width
    const scaleY = img.naturalHeight / img.height
    const canvas = document.createElement('canvas')
    canvas.width  = 500
    canvas.height = 700
    const ctx = canvas.getContext('2d')
    ctx.drawImage(
      img,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0, 500, 700,
    )
    onConfirm(canvas.toDataURL('image/jpeg', 0.82))
    close()
  }

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[150]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'max-h-[92vh] flex flex-col overflow-hidden',
        ].join(' ')}
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="pt-5 px-5 pb-4 border-b border-slate-50 dark:border-white/[0.04] shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
          {/* gap-4 and a shrink-0 Cancel, because the hint underneath is a
              full sentence: without them it ran under the button and wrapped
              a single orphaned word onto a third line. Short enough now to
              hold one line at 390px, with room to spare either side. */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">Crop QR photo</h3>
              {imgSrc && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Drag the box over the code
                </p>
              )}
            </div>
            <button
              onClick={close}
              className="shrink-0 pt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-5 py-6 gap-5"
          style={{ touchAction: imgSrc ? 'none' : 'pan-y', overflowY: imgSrc ? 'hidden' : 'auto' }}>
          {!imgSrc ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center gap-3 py-12 rounded-3xl
                border-2 border-dashed border-slate-200 dark:border-white/10
                text-slate-400 dark:text-slate-500
                active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
              </svg>
              <p className="text-sm font-medium">Choose a photo</p>
              <p className="text-xs">Select a screenshot containing your QR code</p>
            </button>
          ) : (
            <div className="w-full flex items-center justify-center" style={{ touchAction: 'none' }}>
              <ReactCrop
                crop={crop}
                onChange={c => setCrop(c)}
                onComplete={c => setCompletedCrop(c)}
                aspect={5 / 7}
                keepSelection
              >
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="QR source"
                  onLoad={onImageLoad}
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    // Cap image to available space: sheet is 92vh, header ~100px, footer ~84px, body padding 48px
                    maxHeight: 'calc(92dvh - 232px)',
                    objectFit: 'contain',
                  }}
                />
              </ReactCrop>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pt-2 shrink-0 flex gap-3">
          {!imgSrc ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex-1 py-3.5 rounded-full text-sm font-semibold text-white
                bg-primary
                active:scale-[0.98] transition-all duration-100"
            >
              Choose Photo
            </button>
          ) : (
            <>
              {/* Straight back to the picker. Clearing to the empty state
                  meant picking the wrong screenshot cost two taps to fix -
                  one to empty it, one to ask again. */}
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 py-3.5 rounded-full text-sm font-semibold
                  text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]
                  active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
              >
                Change
              </button>
              <button
                onClick={handleConfirm}
                disabled={!completedCrop}
                className="flex-[2] py-3.5 rounded-full text-sm font-semibold text-white
                  bg-primary
                  disabled:opacity-40 disabled:shadow-none
                  active:scale-[0.98] transition-all duration-100"
              >
                Use Photo
              </button>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      </div>
    </div>
  )
}

// ── QR Viewer Modal ────────────────────────────────────────────────────────────

export function QrViewerModal({ open, onClose, qrImage, accountName }) {
  useScrollLock(open)
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90"
      style={{ touchAction: 'none' }}
      onClick={onClose}
    >
      <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-5">
        {accountName}
      </p>
      <img
        src={qrImage}
        alt="Payment QR"
        className="w-full max-w-sm rounded-3xl shadow-2xl"
        style={{ aspectRatio: '5/7', objectFit: 'cover' }}
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="mt-8 px-8 py-3 rounded-full text-sm font-semibold text-white
          bg-white/10 active:bg-white/20 transition-colors"
      >
        Done
      </button>
    </div>
  )
}

// ── Account form sheet ─────────────────────────────────────────────────────────

/**
 * Form values to an accounts row.
 *
 * Exported because two screens create accounts now - this sheet and the
 * /accounts/new page - and they must not drift on the details that are easy
 * to get subtly wrong: that a credit card forces role 'credit', that every
 * non-credit account nulls all five credit fields rather than storing zeroes,
 * that currency is always PHP, and that an empty network is null and not ''.
 */
export function buildAccountRow({
  name, type, role, color, creditLimit,
  statementDay, dueDay, cutoffDay, minPayment,
  qrImage = null, parentName = null, scheme = '',
  design, customColor,
}) {
  const isCredit = type === 'credit'
  return {
    name:           String(name ?? '').trim(),
    type,
    role:           isCredit ? 'credit' : role,
    color,
    currency:       'PHP',
    creditLimit:    isCredit ? (parseMoney(creditLimit) || 0)   : null,
    statementDate:  isCredit ? (parseInt(statementDay) || null) : null,
    dueDate:        isCredit ? (parseInt(dueDay)       || null) : null,
    cutoffDate:     isCredit ? (parseInt(cutoffDay)    || null) : null,
    minimumPayment: isCredit ? (parseMoney(minPayment) || 0)    : null,
    qrImage:        qrImage ?? null,
    updatedAt:      new Date().toISOString(),
    parentName:     parentName ?? null,
    // Unindexed on purpose: nothing queries by network, so this needed no
    // db.version() bump.
    scheme:         scheme || null,
    // Same - unindexed, no version bump. Spread conditionally rather than
    // written as `design: design ?? null`, because this row is also the patch
    // for db.accounts.update() when editing: an explicit key would overwrite
    // a chosen design with null every time the edit form saved, and the
    // account form has no design field to put back.
    ...(design ? { design } : {}),
    // Same conditional spread, same reason: this row doubles as the patch for
    // db.accounts.update() when editing, and the edit form has no colour-
    // override field - an explicit key would clear the flag on every save.
    ...(customColor === undefined ? {} : { customColor: !!customColor }),
  }
}

/**
 * Inserts a new account and its balance record together. The `balances` table
 * is what the ledger reads, so writing one without the other leaves an
 * account that exists but has no balance.
 */
export async function createAccount(row, balance) {
  const opening = Number.isFinite(balance) ? balance : 0
  await db.transaction('rw', [db.accounts, db.balances], async () => {
    await db.accounts.add({ ...row, balance: opening })
    await db.balances.put({ account: row.name, balance: opening })
  })
}

/**
 * The account form, as a bottom sheet or as a whole page.
 *
 * `variant` decides the chrome and nothing else - every field, the save, the
 * delete and the balance adjustment are the same code either way, which is
 * the point. Editing is a page on mobile because it is long: name, kind,
 * network, role, five credit fields, grouping and a QR photo do not belong
 * in something you drag up from the bottom of the screen. Creating from a
 * preset stays a sheet, and so does the desktop, where a sheet is already
 * rendered as a centred modal by the .web rules in index.css.
 */
export function AccountFormSheet({ open, onClose, account, prefill = null, variant = 'sheet' }) {
  const isPage = variant === 'page'
  const [closing,    setClosing]    = useState(false)
  const { showToast } = useToast()
  const [saving,     setSaving]     = useState(false)
  const [mode,       setMode]       = useState('form') // 'form' | 'confirm-delete' | 'adjust'
  const [deleteBlocked, setDeleteBlocked] = useState(null)
  const [adjustBal,  setAdjustBal]  = useState('0')

  /* Not on a page, except while the delete sheet is over it.

     The lock is what stops the body scrolling behind a sheet. On a page the
     body IS the form, and locking it left everything below the colour row
     unreachable - but once the confirmation is up there is a sheet again,
     and the form behind it should sit still.

     Below `mode`, not above it. Reading a useState const before its
     declaration is a temporal dead zone error, and this crashed the page
     into the ErrorBoundary until it moved. */
  useScrollLock(open && (!isPage || mode === 'confirm-delete'))

  const [name,           setName]           = useState('')
  const [type,           setType]           = useState('cash')
  const [role,           setRole]           = useState('spending')
  const [color,          setColor]          = useState(PALETTE[0])
  const [startingBal,    setStartingBal]    = useState('0')
  const [creditLimit,    setCreditLimit]    = useState('0')
  const [statementDay,   setStatementDay]   = useState('')
  const [dueDay,         setDueDay]         = useState('')
  const [cutoffDay,      setCutoffDay]      = useState('')
  const [minPayment,     setMinPayment]     = useState('0')
  const [nameError,      setNameError]      = useState(false)
  const [qrImage,        setQrImage]        = useState(null)
  const [qrCropOpen,     setQrCropOpen]     = useState(false)
  const [qrSrc,          setQrSrc]          = useState(null)
  const qrFileRef = useRef(null)
  const [parentName,     setParentName]     = useState(null)
  const [scheme,         setScheme]         = useState('')
  const [design,         setDesign]         = useState('')
  const [customColor,    setCustomColor]    = useState(false)
  const [styleOpen,      setStyleOpen]      = useState(false)
  const allAccounts = useLiveQuery(() => db.accounts.toArray(), [], [])

  const isEdit = !!account?.id

  /**
   * The institution's own colour, recovered from its name.
   *
   * ColorRail's first swatch puts the house colours back, so it has to know
   * what they were - and for a brand with no hard-coded gradient the only
   * record of that is the preset grid the account was made from. Looked up
   * by name rather than stored, because the name is already the key
   * everywhere else that resolves a brand.
   */
  const presetColor = useMemo(() => {
    const n = name.trim().toLowerCase()
    return PH_ACCOUNTS.find(p => p.name.toLowerCase() === n)?.color ?? null
  }, [name])

  /**
   * The shape components/CardStyle.jsx speaks.
   *
   * The form keeps one useState per field, which is right for a form; the
   * card components came from the create flow's reducer and take a draft
   * plus a patch function. Adapting here means neither side has to change,
   * and there is exactly one copy of the truth - these fields - rather than
   * a draft that could drift from them.
   */
  const draft = { name, type, color, customColor, design, scheme, creditLimit, presetColor }
  const setDraft = useCallback((patch) => {
    if ('color'       in patch) setColor(patch.color)
    if ('customColor' in patch) setCustomColor(patch.customColor)
    if ('design'      in patch) setDesign(patch.design)
    if ('scheme'      in patch) setScheme(patch.scheme)
  }, [])

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode('form')
    setDeleteBlocked(null)
    setSaving(false)
    setNameError(false)
    if (account?.id) {
      const t = account.type ?? 'cash'
      setName(account.name ?? '')
      setType(t)
      setRole(account.role ?? defaultRole(t))
      setColor(account.color ?? PALETTE[0])
      setStartingBal(numToMoneyStr(account.balance ?? 0))
      setCreditLimit(numToMoneyStr(account.creditLimit ?? 0))
      setStatementDay(account.statementDate != null ? String(account.statementDate) : '')
      setDueDay(account.dueDate != null ? String(account.dueDate) : '')
      setCutoffDay(account.cutoffDate != null ? String(account.cutoffDate) : '')
      setMinPayment(numToMoneyStr(account.minimumPayment ?? 0))
      setQrImage(account.qrImage ?? null)
      setParentName(account.parentName ?? null)
      setScheme(account.scheme ?? '')
      setDesign(account.design ?? '')
      setCustomColor(!!account.customColor)
    } else {
      const t = prefill?.type ?? 'cash'
      setName(prefill?.name ?? '')
      setType(t)
      setRole(prefill?.role ?? defaultRole(t))
      setColor(prefill?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)])
      setStartingBal('0')
      setCreditLimit('0')
      setStatementDay('')
      setDueDay('')
      setCutoffDay('')
      setMinPayment('0')
      setQrImage(null)
      setParentName(prefill?.parentName ?? null)
      setScheme('')
      setDesign('')
      // A preset hands over its house colour, which is not an override.
      setCustomColor(false)
    }
    // Hydrates the form when the sheet opens. Listing every field would
    // re-run the effect that SETS them and clobber edits in progress;
    // `open` plus the record id is what actually means "something else is
    // being edited now".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id])

  const close = () => {
    if (saving) return
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  /* The picker opens from the form, not from inside the crop sheet.

     It used to be the sheet's job, which meant tapping "Add Payment QR"
     opened a sheet whose entire content was a second dashed box saying
     "Choose a photo" - a whole screen spent asking again. Now the sheet is
     only ever entered with an image in hand, and it is only ever about the
     crop. */
  const pickQrFile = () => qrFileRef.current?.click()

  function onQrFileChange(e) {
    const file = e.target.files?.[0]
    // Cleared before the early return, so picking the SAME file again still
    // fires a change event.
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setQrSrc(reader.result); setQrCropOpen(true) }
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!name.trim()) { setNameError(true); return }
    setSaving(true)
    try {
      const cleanName = name.trim()
      const data = buildAccountRow({
        name: cleanName, type, role, color, creditLimit,
        statementDay, dueDay, cutoffDay, minPayment,
        qrImage, parentName, scheme, design, customColor,
      })

      if (isEdit) {
        const oldName = account.name
        await db.transaction('rw', [db.accounts, db.balances, db.transactions, db.goals], async () => {
          await db.accounts.update(account.id, data)
          if (oldName !== cleanName) {
            // Migrate balance record
            const bal = await db.balances.get(oldName)
            if (bal) {
              await db.balances.delete(oldName)
              await db.balances.put({ account: cleanName, balance: bal.balance })
            }
            // Migrate transaction references
            const byAcct = await db.transactions.where('account').equals(oldName).toArray()
            for (const tx of byAcct) await db.transactions.update(tx.id, { account: cleanName })
            const byFrom = await db.transactions.where('fromAccount').equals(oldName).toArray()
            for (const tx of byFrom) await db.transactions.update(tx.id, { fromAccount: cleanName })
            const byTo = await db.transactions.where('toAccount').equals(oldName).toArray()
            for (const tx of byTo) await db.transactions.update(tx.id, { toAccount: cleanName })
            // Update children's parentName reference
            await db.accounts.where('parentName').equals(oldName).modify({ parentName: cleanName })
            // Goals name their funding accounts. `accounts` is a multi-entry
            // index, so where().equals() finds the goals holding this name
            // without scanning the table - see the v9 comment in db/db.js.
            // Missing this would leave a goal pointing at an account that no
            // longer exists, and it would silently read as ₱0 funded.
            const linked = await db.goals.where('accounts').equals(oldName).toArray()
            for (const g of linked) {
              await db.goals.update(g.id, {
                accounts: (g.accounts ?? []).map(n => (n === oldName ? cleanName : n)),
                updatedAt: new Date().toISOString(),
                synced: 0,
              })
            }
          }
        })
      } else {
        await createAccount(data, parseMoney(startingBal))
      }
      showToast(isEdit ? 'Account updated' : 'Account created')
      close()
    } catch (e) {
      console.error('[AccountForm] save failed:', e)
      showToast('Failed to save account', 'error')
      setSaving(false)
    }
  }

  async function handleDeleteCheck() {
    const byAcct = await db.transactions.where('account').equals(account.name).count()
    const byFrom = await db.transactions.where('fromAccount').equals(account.name).count()
    const byTo   = await db.transactions.where('toAccount').equals(account.name).count()
    const txTotal = byAcct + byFrom + byTo
    // Also block if this account has sub-accounts
    const childCount = await db.accounts.where('parentName').equals(account.name).count()
    setDeleteBlocked(childCount > 0 ? `sub-accounts` : txTotal > 0 ? txTotal : null)
    setMode('confirm-delete')
  }

  async function handleDelete() {
    if (deleteBlocked) return
    setSaving(true)
    try {
      await db.transaction('rw', [db.accounts, db.balances, db.goals], async () => {
        await db.accounts.delete(account.id)
        // Unhook it from any goal it was funding, so no goal is left
        // pointing at an account that is gone.
        const linked = await db.goals.where('accounts').equals(account.name).toArray()
        for (const g of linked) {
          await db.goals.update(g.id, {
            accounts: (g.accounts ?? []).filter(n => n !== account.name),
            updatedAt: new Date().toISOString(),
            synced: 0,
          })
        }
        await db.balances.delete(account.name)
      })
      // Without this the next pull re-adds the account from Supabase.
      await deleteAccountRemote(account.name)
      close()
    } catch (e) {
      console.error('[AccountForm] delete failed:', e)
      showToast('Failed to delete account', 'error')
      setSaving(false)
    }
  }

  async function handleAdjust() {
    const newBal     = parseMoney(adjustBal)
    const currentBal = account?.balance ?? 0
    const diff       = newBal - currentBal
    if (diff === 0) return
    setSaving(true)
    try {
      const now    = new Date()
      const txDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                              now.getHours(), now.getMinutes(), now.getSeconds())
      const dateISO = txDate.toISOString()
      const updISO  = now.toISOString()
      await db.transaction('rw', [db.transactions, db.accounts, db.balances], async () => {
        await db.transactions.add({
          txId:        crypto.randomUUID(),
          type:        diff > 0 ? 'inflow' : 'expense',
          date:        dateISO,
          description: 'Balance adjustment',
          category:    diff > 0 ? 'Income' : 'Others',
          account:     account.name,
          amount:      Math.abs(diff),
          synced:      UNSYNCED,
          updatedAt:   updISO,
        })
        await db.accounts.update(account.id, { balance: newBal, updatedAt: updISO })
        await db.balances.put({ account: account.name, balance: newBal })
      })
      showToast(`Balance adjusted to ${fmt(newBal)}`)
      close()
    } catch (e) {
      console.error('[AccountForm] adjust failed:', e)
      showToast('Failed to adjust balance', 'error')
      setSaving(false)
    }
  }

  const isParentItself = (allAccounts ?? []).some(a => a.parentName === account?.name)
  const potentialParents = (allAccounts ?? []).filter(a =>
    !a.parentName && a.type !== 'credit' && a.name !== name
  )

  if (!open && !closing) return null

  /* The delete confirmation's content, defined once.

     In the sheet it replaces the sheet's body, which is what a sheet is for.
     On a page it cannot do that: swapping a whole screen for three lines and
     a button left the form gone, the header describing a screen that was no
     longer there, and two thirds of the display empty. It is a modal over
     the page instead - the form stays where it was, which is also the honest
     picture of what is happening, since nothing has been deleted yet. */
  const deleteBody = (
    <>
            {deleteBlocked ? (
              <>
                <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-2">
                  Cannot delete <span className="font-semibold text-slate-800 dark:text-white">{account?.name}</span>
                </p>
                <p className="text-xs text-center text-slate-400 dark:text-slate-500 mb-6 leading-relaxed">
                  {deleteBlocked === 'sub-accounts'
                    ? 'This account has sub-accounts. Delete or re-assign them first.'
                    : `This account has ${deleteBlocked} ${deleteBlocked === 1 ? 'transaction' : 'transactions'}. Remove those transactions first.`}
                </p>
                <button
                  onClick={() => setMode('form')}
                  className="w-full py-3.5 rounded-full text-sm font-semibold
                    text-slate-600 dark:text-slate-300
                    bg-slate-100 dark:bg-white/[0.06]
                    active:bg-slate-200 transition-colors"
                >
                  Go Back
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-1">
                  Permanently delete <span className="font-semibold text-slate-800 dark:text-white">{account?.name}</span>?
                </p>
                <p className="text-xs text-center text-slate-400 dark:text-slate-500 mb-6">
                  This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setMode('form')}
                    disabled={saving}
                    className="flex-1 py-3.5 rounded-full text-sm font-semibold
                      text-slate-600 dark:text-slate-300
                      bg-slate-100 dark:bg-white/[0.06]
                      disabled:opacity-40 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="flex-[2] py-3.5 rounded-full text-sm font-semibold text-white
                      bg-red-500
                      disabled:opacity-40 disabled:shadow-none
                      active:scale-[0.98] transition-all duration-100"
                  >
                    {saving ? 'Deleting…' : 'Delete Account'}
                  </button>
                </div>
              </>
            )}
    </>
  )

  /* One body, two chromes. Everything below is identical whether this is a
     sheet or a page - only the frame around it changes, at the bottom of the
     component. */
  const inner = (
    <>
        {/* On a page, SubPage has already drawn the title and the back
            button, so this row keeps only the actions. */}
        <div className={isPage
          ? 'px-5 pb-1'
          : `sticky top-0 pt-5 px-5 pb-3 bg-white dark:bg-[#111820] z-10
             border-b border-slate-50 dark:border-white/[0.04]`}>
          {!isPage && <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />}
          {mode === 'form' ? (
            <div className={`flex items-center ${isPage ? 'justify-end' : 'justify-between'}`}>
              {!isPage && (
                <h3 className="text-base font-semibold text-slate-800 dark:text-white">
                  {isEdit ? 'Edit Account' : 'New Account'}
                </h3>
              )}
              {isEdit && (
                <div className="flex items-center gap-2">
                  {type !== 'credit' && (
                    <button
                      onClick={() => { setAdjustBal(numToMoneyStr(account?.balance ?? 0)); setMode('adjust') }}
                      className="text-xs font-semibold text-primary px-3 py-1.5 rounded-xl
                        bg-primary/10 dark:bg-primary/15 active:bg-primary/20 transition-colors"
                    >
                      Adjust Balance
                    </button>
                  )}
                  {/* Only in the sheet. On a page it is the last thing on
                      the form instead - a destructive action does not belong
                      at the top of a screen, a thumb's width from Back. */}
                  {!isPage && (
                    <button
                      onClick={handleDeleteCheck}
                      className="text-xs font-semibold text-red-500 dark:text-red-400 px-3 py-1.5 rounded-xl
                        bg-red-50 dark:bg-red-500/10 active:bg-red-100 dark:active:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : mode === 'adjust' ? (
            /* Sheet only, for the same reason as the delete header: on a page
               SubPage already carries the title, and Back already carries the
               cancel - the body has its own Cancel under the amount too, so
               this row was the third way out of one screen. */
            !isPage && (
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-800 dark:text-white">Adjust Balance</h3>
                <button onClick={() => setMode('form')} disabled={saving}
                  className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
                  Cancel
                </button>
              </div>
            )
          ) : (
            /* Sheet only - the page puts this in the modal. flex rather than
               text-center because Preflight sets `svg { display: block }`, so
               the icon was a block box inside a text-align container and sat
               against the left padding. */
            !isPage && (
              <div className="flex flex-col items-center">
                <span className="text-red-500 dark:text-red-400"><IconTrash size={24} /></span>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white mt-2">Delete account?</h3>
              </div>
            )
          )}
        </div>

        {/* ── Form mode ──
            Still rendered under the page's delete modal: the account has not
            been deleted, so the form has no business disappearing. */}
        {(mode === 'form' || (isPage && mode === 'confirm-delete')) && (
          <div className="px-5 pt-5 pb-2 flex flex-col gap-4">

            {/* The card, lying flat, at the top.

                This screen used to open on a text input, which is a strange
                way to start editing something whose whole point is that it
                looks like a card. It is the same face the create flow shows
                while you fill it in, and it updates on every keystroke and
                every tap below.

                Flat rather than upright because this is a preview, not a
                choice - the card only stands up in Customise card, where the
                thing being chosen IS how it looks. */}
            <div className="pt-1 pb-1">
              <PreviewCard draft={draft} large />

              {/* One button rather than a design row inline. The gallery is
                  six full card faces and a colour row; opening it in place
                  would push every field on this page below the fold. */}
              <button
                type="button"
                onClick={() => setStyleOpen(true)}
                className="mx-auto mt-4 flex items-center gap-2 px-4 py-2 rounded-full
                  text-xs font-semibold text-primary
                  bg-primary/[0.08] dark:bg-primary/[0.14]
                  border border-primary/20 dark:border-primary/25
                  active:scale-95 transition-transform duration-75"
              >
                <IconCard size={14} />
                Customise card
              </button>
            </div>

            {/* Name */}
            <div>
              <Label>Account Name</Label>
              <input
                value={name}
                onChange={e => { setName(e.target.value); setNameError(false) }}
                placeholder="e.g. BDO Savings"
                maxLength={40}
                className={inputClass(nameError)}
              />
              {nameError && <p className="text-xs text-red-500 mt-1.5 px-1">Name is required</p>}
            </div>

            {/* Type */}
            <div>
              <Label>Account Type</Label>
              {isEdit ? (
                <p className="h-[48px] flex items-center px-4 rounded-2xl text-sm font-medium text-slate-700 dark:text-slate-300
                  bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.09]">
                  {TYPE_LABEL[type]}
                  <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 font-normal">(cannot change)</span>
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => { setType(o.value); setRole(defaultRole(o.value)) }}
                      className={[
                        'px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-75 active:scale-95',
                        type === o.value
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                      ].join(' ')}
                    >
                      {o.shortLabel}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Card network — what the plastic actually carries. Cash has no
                network; everything else can, since PH e-wallets issue Visa and
                Mastercard debit too. Stored unindexed, so no migration.

                The marks themselves, not their names in chips: the mark IS
                the name on a real card, and it is what you look at to check
                which network yours is on. Same control as the create flow. */}
            {type !== 'cash' && (
              <div>
                <Label>Card Network</Label>
                <SchemeRail value={scheme} onChange={v => setScheme(v)} />
              </div>
            )}

            {/* Counts As — hidden for credit */}
            {type !== 'credit' && (
              <div>
                <Label>Counts As</Label>
                <div className="flex gap-2">
                  {[
                    { value: 'spending', label: 'Spending', Icon: IconWalletUI },
                    { value: 'savings',  label: 'Savings',  Icon: IconBankUI   },
                  ].map(o => (
                    <button
                      key={o.value}
                      onClick={() => setRole(o.value)}
                      className={[
                        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-75 active:scale-95',
                        role === o.value
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                      ].join(' ')}
                    >
                      <o.Icon size={15} />
                      <span>{o.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 px-1">
                  How this account is grouped on the home screen
                </p>
              </div>
            )}

            {/* No colour row here.

                It was one, briefly, and it was the same control that sits in
                Customise card two taps away - so the page asked about the
                card's appearance in two places and left the reader to work
                out whether they were the same setting. Appearance lives
                behind the one button, next to the design it belongs with;
                this page is the account's facts. */}

            {/* Group under parent */}
            {type !== 'credit' && !isParentItself && potentialParents.length > 0 && (
              <div>
                <Label>Group Under</Label>
                {/* One line that scrolls, not a wrapping block.

                    Wrapped, this grew a row for every account you own and
                    pushed the rest of the form down by however many that
                    happens to be - the one field on the page whose height
                    depended on your data. It scrolls now, like the network
                    row above it, and None stays pinned at the left margin
                    where the default belongs. */}
                {/* No snapping. snap-start on the first chip made the
                    browser align it to the scrollport's edge on load, which
                    ate the 20px of padding and left None flush against the
                    screen, 20px left of its own label. Chips are not pages;
                    there is nothing here worth snapping to. */}
                <div
                  className="flex items-center gap-2 overflow-x-auto no-scrollbar px-5 -mx-5 py-0.5"
                  style={{ touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain' }}
                >
                  <button
                    onClick={() => setParentName(null)}
                    className={[
                      'shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-75 active:scale-95',
                      parentName === null
                        ? 'bg-primary text-white'
                        : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                    ].join(' ')}
                  >
                    None
                  </button>
                  {potentialParents.map(acct => (
                    <button
                      key={acct.id}
                      onClick={() => setParentName(acct.name)}
                      className={[
                        'shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-75 active:scale-95',
                        parentName === acct.name
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                      ].join(' ')}
                    >
                      {acct.name}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 px-1">
                  Group this account under a parent
                </p>
              </div>
            )}

            {/* Starting balance — add mode only */}
            {!isEdit && (
              <div>
                <Label>Starting Balance</Label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={startingBal === '0' ? '' : startingBal}
                  onChange={moneyChangeHandler(setStartingBal)}
                  placeholder="0.00"
                  className={inputClass(false)}
                />
              </div>
            )}

            {/* Credit-only fields */}
            {type === 'credit' && (
              <div className="flex flex-col gap-4 pt-1">
                <div className="h-px bg-slate-100 dark:bg-white/[0.07]" />

                <div>
                  <Label>Credit Limit</Label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={creditLimit === '0' ? '' : creditLimit}
                    onChange={moneyChangeHandler(setCreditLimit)}
                    placeholder="0.00"
                    className={inputClass(false)}
                  />
                </div>

                <div>
                  <Label>Minimum Payment</Label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={minPayment === '0' ? '' : minPayment}
                    onChange={moneyChangeHandler(setMinPayment)}
                    placeholder="0.00"
                    className={inputClass(false)}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Statement</Label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1" max="31"
                      value={statementDay}
                      onChange={e => setStatementDay(e.target.value)}
                      placeholder="1–31"
                      className={inputClass(false)}
                    />
                  </div>
                  <div>
                    <Label>Due</Label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1" max="31"
                      value={dueDay}
                      onChange={e => setDueDay(e.target.value)}
                      placeholder="1–31"
                      className={inputClass(false)}
                    />
                  </div>
                  <div>
                    <Label>Cutoff</Label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1" max="31"
                      value={cutoffDay}
                      onChange={e => setCutoffDay(e.target.value)}
                      placeholder="1–31"
                      className={inputClass(false)}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1 -mt-2">
                  Statement day = billing closes · Due day = payment deadline · Cutoff = new cycle starts
                </p>
              </div>
            )}

            {/* Payment QR.

                Adding one used to take two taps at a dashed box that said
                the same thing twice: this one opened a sheet whose empty
                state was another dashed box, and only THAT opened the
                picker. The picker opens from here now, and the sheet appears
                with the photo already in it, cropping.

                The preview is bigger and it is a button - tapping the QR you
                are looking at to replace it is the obvious move, and the two
                pills beside it were the only way to do anything. */}
            <div>
              <Label>Payment QR <span className="font-normal text-slate-400 normal-case">(optional)</span></Label>
              {qrImage ? (
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={pickQrFile}
                    className="shrink-0 rounded-2xl overflow-hidden bg-white
                      border border-slate-200/80 dark:border-white/10
                      active:scale-95 transition-transform duration-75"
                    aria-label="Replace payment QR"
                  >
                    <img
                      src={qrImage}
                      alt="Payment QR"
                      className="block object-cover"
                      style={{ width: 96, height: 134 }}
                    />
                  </button>
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
                      Shown on this account so you can be paid without opening the bank app.
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        type="button"
                        onClick={pickQrFile}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold
                          text-primary bg-primary/[0.08] dark:bg-primary/[0.12]
                          active:bg-primary/[0.15] transition-colors"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrImage(null)}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold
                          text-red-500 dark:text-red-400
                          active:bg-red-50 dark:active:bg-red-500/10 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={pickQrFile}
                  className="w-full flex items-center justify-center gap-2.5 py-5 rounded-2xl
                    border-2 border-dashed border-slate-200 dark:border-white/10
                    text-slate-400 dark:text-slate-500
                    active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                  </svg>
                  <span className="text-sm font-medium">Choose a screenshot</span>
                </button>
              )}
              <input
                ref={qrFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onQrFileChange}
              />
            </div>

            {/* Action buttons.

                No Cancel on a page: the back button in the header is the
                cancel, and offering two of them side by side invites the
                question of whether they do different things. The sheet keeps
                its own, because a sheet's only other way out is the scrim. */}
            <div className="flex gap-3 pt-2">
              {!isPage && (
                <button
                  onClick={close}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-full text-sm font-semibold
                    text-slate-600 dark:text-slate-300
                    bg-slate-100 dark:bg-white/[0.06]
                    disabled:opacity-40 active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-[2] py-3.5 rounded-full text-sm font-semibold text-white
                  bg-primary
                  disabled:opacity-40 disabled:shadow-none
                  active:scale-[0.98] transition-all duration-100"
              >
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Account'}
              </button>
            </div>

            {/* Last, and quiet. Text on the page rather than a filled red
                button: deleting an account is rare and irreversible, and a
                solid red block competes with Save for the eye every time
                someone comes here to change a credit limit. */}
            {isPage && isEdit && (
              <button
                onClick={handleDeleteCheck}
                disabled={saving}
                className="mt-1 mx-auto px-4 py-2.5 rounded-xl text-[13px] font-semibold
                  text-red-500 dark:text-red-400 disabled:opacity-40
                  active:bg-red-50 dark:active:bg-red-500/10 transition-colors"
              >
                Delete account
              </button>
            )}
          </div>
        )}

        {/* ── Adjust balance mode ── */}
        {mode === 'adjust' && (() => {
          const newBal = parseMoney(adjustBal)
          const diff   = newBal - (account?.balance ?? 0)
          return (
            <div className="px-5 pt-5 pb-2 flex flex-col gap-4">
              {/* Current balance pill */}
              <div className="px-4 py-3.5 rounded-2xl
                bg-slate-50 dark:bg-white/[0.04]
                border border-slate-100 dark:border-white/[0.07]">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
                  Current Balance
                </p>
                <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {fmt(account?.balance ?? 0)}
                </p>
              </div>

              {/* New balance input */}
              <div>
                <Label>Correct Balance</Label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={adjustBal === '0' ? '' : adjustBal}
                  onChange={moneyChangeHandler(setAdjustBal)}
                  placeholder="0.00"
                  className={inputClass()}
                  autoFocus
                />
              </div>

              {/* Difference preview */}
              {diff !== 0 && (
                <div className={`px-4 py-3 rounded-2xl text-sm font-medium ${
                  diff > 0
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                }`}>
                  {diff > 0
                    ? `+${fmt(diff)} will be recorded as an inflow`
                    : `${fmt(Math.abs(diff))} will be recorded as an expense`}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setMode('form')}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-full text-sm font-semibold
                    text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]
                    disabled:opacity-40 active:bg-slate-200 dark:active:bg-white/[0.10] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjust}
                  disabled={saving || diff === 0}
                  className="flex-[2] py-3.5 rounded-full text-sm font-semibold text-white
                    bg-primary
                    disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition-all duration-100"
                >
                  {saving ? 'Adjusting…' : 'Apply Adjustment'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── Confirm delete mode ── */}
        {mode === 'confirm-delete' && !isPage && (
          <div className="px-5 pt-5 pb-2">{deleteBody}</div>
        )}
        <div className="h-8" />
    </>
  )

  return (
    <>
    {isPage ? (
      /* Title and Back both follow `mode`. The page swaps its whole body for
         the confirmation, so leaving it headed "Edit account" described a
         screen that was no longer there - and Back would have left the
         account entirely rather than returning to the form behind it. */
      <SubPage
        title={
          mode === 'adjust' ? 'Adjust balance'
          : isEdit          ? 'Edit account'
          : 'New account'
        }
        onBack={mode === 'form' ? close : () => setMode('form')}
      >
        {inner}
      </SubPage>
    ) : (
      <div className="fixed inset-0 z-[100]">
        <div className="sheet-overlay absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
        <div
          className={[
            closing ? 'sheet-panel-exit' : 'sheet-panel',
            'absolute bottom-0 inset-x-0 rounded-t-[28px]',
            'bg-white dark:bg-[#111820]',
            'border-t border-slate-100 dark:border-white/[0.07]',
            'max-h-[92vh] overflow-y-auto',
          ].join(' ')}
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          {inner}
        </div>
      </div>
    )}

    {/* Over the page, with the form still behind it.

        A bottom sheet rather than a centred dialog, for two reasons that
        both check out in this repo. Every other confirmation here is one -
        DupWarningSheet and OverdrawWarningSheet are the same shape, a
        warning with two ways out - and a centred box would have been the
        only dialog of its kind in the app. And `html.web .sheet-panel` in
        index.css already re-positions any sheet as a centred modal on
        desktop, so this IS centred there, for free; a hand-rolled centred
        box would have stayed a phone-sized card in the middle of a 1440px
        screen. */}
    {isPage && mode === 'confirm-delete' && (
      <div className="fixed inset-0 z-[150]">
        <div
          className="sheet-overlay absolute inset-0 bg-black/55 backdrop-blur-sm"
          onClick={() => { if (!saving) setMode('form') }}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete account"
          className="sheet-panel absolute bottom-0 inset-x-0 rounded-t-[28px]
            bg-white dark:bg-[#111820]
            border-t border-slate-100 dark:border-white/[0.07]"
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        >
          <div className="pt-5 px-5">
            <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
            <div className="flex flex-col items-center">
              <span className="text-red-500 dark:text-red-400"><IconTrash size={24} /></span>
              <h3 className="text-base font-semibold text-slate-800 dark:text-white mt-2">
                Delete account?
              </h3>
            </div>
          </div>
          <div className="px-5 pt-4">{deleteBody}</div>
        </div>
      </div>
    )}

    <CardStyleSheet
      open={styleOpen}
      onClose={() => setStyleOpen(false)}
      draft={draft}
      set={setDraft}
    />

    <QrCropSheet
      open={qrCropOpen}
      initialSrc={qrSrc}
      onClose={() => { setQrCropOpen(false); setQrSrc(null) }}
      onConfirm={base64 => setQrImage(base64)}
    />
    </>
  )
}

// ── Account detail sheet ───────────────────────────────────────────────────────

// ── Stat card ──────────────────────────────────────────────────────────────────

export function StatCard({ label, value }) {
  return (
    <div className="px-4 py-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
        {label}
      </p>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">{value}</p>
    </div>
  )
}

// ── Credit statement transaction section ────────────────────────────────────────

export function CreditTxSection({ title, dateRange, txs, total, accountName, emptyLabel, totalColor, totalSign = '', onSelect, catMap = {} }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
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
        <div className="py-6 text-center rounded-2xl bg-slate-50 dark:bg-white/[0.03]">
          <p className="text-xs text-slate-400 dark:text-slate-500">{emptyLabel}</p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden
            bg-white border border-slate-100
            dark:bg-white/[0.04] dark:border-white/[0.07]
            shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none"
        >
          {txs.map((tx, i) => (
            <div key={tx.id ?? i}>
              <DetailTxRow tx={tx} accountName={accountName} onSelect={onSelect} catMap={catMap} />
              {i < txs.length - 1 && (
                <div className="h-px bg-slate-50 dark:bg-white/[0.04] mx-4" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Detail transaction row ─────────────────────────────────────────────────────

export function DetailTxRow({ tx, accountName, onSelect, catMap = {} }) {
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

  const label = tx.description || (isTransfer
    ? (tx.fromAccount === accountName ? `To ${tx.toAccount ?? ''}` : `From ${tx.fromAccount ?? ''}`)
    : (tx.category ?? '—'))

  // The second line does not repeat the account - you are on its page - so it
  // carries the DATE, which the Transactions page can leave out because its
  // rows sit under date headers and these do not. Then the counterparty for a
  // transfer, or the category otherwise.
  const meta = isTransfer
    ? (tx.fromAccount === accountName ? `→ ${tx.toAccount ?? ''}` : `← ${tx.fromAccount ?? ''}`)
    : (cat?.name ?? tx.category ?? '')

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
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">
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
