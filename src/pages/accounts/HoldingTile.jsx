import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Card from '../../components/ui/Card'
import ProgressBar from '../../components/ui/ProgressBar'
import BrandWatermark from '../../components/BrandWatermark'
import { useSwap } from '../../components/ui/useSwap'
import { accountBrand } from '../../lib/accountBrands'
import { INVESTMENT_KIND_LABEL } from '../../lib/accountMeta'
import { fmt, fmtCompact, fmtHidden } from '../../lib/money'
import { ordinal } from '../../utils/recurring'
import { parseMoney } from '../../utils/moneyInput'

/**
 * An investment or a loan, as a tile - two to a row on Accounts.
 *
 * ── Why not a card face ──
 *
 * Every other account is drawn as a payment card because it behaves like
 * one: you spend from it, and there is usually a real debit or credit card
 * behind it. An MP2 or a car loan is neither, and the app already keeps both
 * out of everything spendable - safe to spend, goals, the everyday piles. A
 * card face said the opposite. So these are the page's own tiles instead,
 * the surface Insights' Explore grid uses, and the brand survives as the
 * logo square in the corner: BDO still looks like BDO.
 *
 * What a tile says is the one thing worth knowing about each: an
 * investment's value and how it has done against what went in, a loan's
 * balance and how far along it is. The chip in the corner is the thing to
 * act on - an old value, a missed payment.
 *
 * @typedef {ReturnType<typeof import('../../lib/investments').investmentStatus>
 *   | ReturnType<typeof import('../../lib/loans').loanStatus>} HoldingStatus
 */

/**
 * The institution's mark on its colour, square - the same art the new-account
 * picker tiles use (NewFields BrandTile), at the size a row's icon is.
 *
 * @param {{acct: Record<string, any>, size?: number, className?: string}} props
 */
export function BrandSquare({ acct, size = 36, className = '' }) {
  const brand = accountBrand(acct)
  return (
    <span
      className={`relative shrink-0 rounded-xl overflow-hidden flex items-center justify-center ${className}`}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${brand.from}, ${brand.to})` }}
      aria-hidden="true"
    >
      <BrandWatermark brand={brand} className="brand-glyph" />
    </span>
  )
}

const CHIP = {
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  red: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
}

/**
 * @param {object} props
 * @param {Record<string, any>} props.acct
 * @param {any} [props.status]    investmentStatus or loanStatus; without it the
 *                                tile shows what the account row alone can say
 * @param {boolean} [props.hidden] the page's eye button
 * @param {() => void} [props.onTap]
 * @param {boolean} [props.preview] a picture of the tile, not a control - the
 *                                new-account flow and the edit page
 * @param {Record<string, any>} [props.dragProps] dnd-kit's attributes and listeners,
 *                                on the button itself so nothing nests a control
 */
export function HoldingTile({ acct, status = null, hidden = false, onTap, preview = false, dragProps = undefined }) {
  const loan = acct.type === 'loan'
  const cur = acct.currency
  const figure = loan ? Math.max(0, -(acct.balance ?? 0)) : (acct.balance ?? 0)
  const sub = loan
    ? (acct.dueDate ? `Due on the ${ordinal(acct.dueDate)}` : 'Loan')
    : (INVESTMENT_KIND_LABEL[acct.kind] ?? 'Investment')

  const flag = loan
    ? (status?.overdue ? { text: 'Overdue', tone: 'red' }
      : status && status.owed <= 0.005 ? { text: 'Paid off', tone: 'green' } : null)
    : (status?.stale ? { text: 'Old value', tone: 'amber' } : null)

  const swap = useSwap(hidden)
  const k = hidden ? 'h' : 's'
  const money = (/** @type {number} */ v, compact = false) =>
    (hidden ? fmtHidden(cur) : compact ? fmtCompact(v, cur) : fmt(v, cur))

  /* The line under the figure. An investment: the gain, signed and coloured,
     or what went in when there is nothing to compare yet. A loan: how far
     along, as a bar, or the monthly payment when the ledger has seen none. */
  let footer = null
  if (loan) {
    footer = status && status.paidIn > 0.005
      ? <ProgressBar value={status.progress * 100} fillClass="bg-primary" className="mt-2" />
      : acct.minimumPayment > 0
        ? <span key={`pay-${k}`} className={`${swap} block mt-0.5 text-11 text-slate-500 dark:text-slate-400 truncate`}>{money(acct.minimumPayment, true)} a month</span>
        : null
  } else if (status && status.valued && status.paidIn > 0.005) {
    const up = status.gain >= 0
    footer = (
      <span key={`gain-${k}`} className={`${swap} block mt-0.5 text-11 font-semibold tabular-nums truncate ${
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
      }`}>
        {hidden ? '••••' : `${up ? '+' : '−'}${fmtCompact(Math.abs(status.gain), cur)}`}
        {status.gainPct != null ? ` · ${(Math.abs(status.gainPct) * 100).toFixed(1)}%` : ''}
      </span>
    )
  } else if (Number(acct.investedStart) > 0) {
    footer = <span key={`in-${k}`} className={`${swap} block mt-0.5 text-11 text-slate-500 dark:text-slate-400 truncate`}>{money(Number(acct.investedStart), true)} paid in</span>
  }

  return (
    <Card
      as={preview ? 'div' : 'button'}
      type={preview ? undefined : 'button'}
      interactive={!preview}
      onClick={preview ? undefined : onTap}
      aria-label={preview ? undefined : `${acct.name}, ${loan ? 'owed' : 'value'} ${hidden ? 'hidden' : fmt(figure, cur)}`}
      className="h-[140px] flex flex-col p-3 min-w-0"
      {...(preview ? {} : dragProps)}
    >
      <span className="flex items-start justify-between gap-2">
        <BrandSquare acct={acct} />
        {flag && (
          <span className={`px-2 py-0.5 rounded-full text-10 font-semibold whitespace-nowrap ${CHIP[flag.tone]}`}>
            {flag.text}
          </span>
        )}
      </span>
      <span className="mt-2 block text-13 font-semibold leading-tight text-slate-800 dark:text-white truncate">
        {acct.name || (loan ? 'New loan' : 'New investment')}
      </span>
      <span className="block text-11 text-slate-500 dark:text-slate-400 truncate">{sub}</span>
      <span className="mt-auto block">
        <span key={`fig-${k}`} className={`${swap} block text-16 font-bold leading-tight tabular-nums truncate ${
          loan ? 'text-red-500 dark:text-red-400' : 'text-slate-900 dark:text-white'
        }`}>
          {money(figure)}
        </span>
        {footer}
      </span>
    </Card>
  )
}

/**
 * A tile you can pick up and reorder, within its section.
 *
 * The same rule SortableAccountCard uses to tell a drag from a tap (the
 * page's sensors: 8px of travel, or 180ms held). A wrapper holds the ref and
 * the listeners, because Card is a plain function component and dnd-kit needs
 * the DOM node.
 *
 * @param {Parameters<typeof HoldingTile>[0]} props
 */
export function SortableHoldingTile(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.acct.id })
  return (
    <div
      ref={setNodeRef}
      className={`min-w-0${isDragging ? ' relative z-10 rounded-2xl shadow-xl' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <HoldingTile {...props} dragProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

/**
 * Keep a dragged tile inside its grid.
 *
 * A grid needs sideways movement, which the stacks pin away
 * (lockToVerticalAxis) - but <main> scrolls on both axes, so a tile dragged
 * past the edge widened the page and it could be panned. Held to the grid's
 * box instead: the parent of the node being dragged.
 *
 * @param {{transform: {x: number, y: number, scaleX: number, scaleY: number},
 *          containerNodeRect: DOMRect|null, draggingNodeRect: DOMRect|null}} args
 */
export function withinGrid({ transform, containerNodeRect, draggingNodeRect }) {
  if (!containerNodeRect || !draggingNodeRect) return transform
  const minX = containerNodeRect.left - draggingNodeRect.left
  const maxX = containerNodeRect.right - draggingNodeRect.right
  return { ...transform, x: Math.min(maxX, Math.max(minX, transform.x)) }
}

/**
 * A new-account draft as the account row its tile will draw - the create
 * flow's running preview and its last screen.
 *
 * @param {Record<string, any>} draft  AccountNew's draft
 */
export function holdingFromDraft(draft) {
  const amount = parseMoney(draft.startingBal) || 0
  return {
    name: String(draft.name ?? '').trim(),
    type: draft.type,
    kind: draft.kind,
    color: draft.color,
    customColor: draft.customColor,
    presetColor: draft.presetColor,
    currency: draft.currency,
    balance: draft.type === 'loan' ? -amount : amount,
    investedStart: parseMoney(draft.investedStart) || 0,
    minimumPayment: parseMoney(draft.minPayment) || 0,
    dueDate: parseInt(draft.dueDay) || null,
  }
}
