import { forwardRef } from 'react'
import { accountBrand } from '../../lib/accountBrands'
import { normalizeDesign } from '../../lib/cardDesigns'
import BrandMark from '../../components/BrandMark'
import BrandWatermark from '../../components/BrandWatermark'
import SchemeMark from '../../components/SchemeMark'
import { TYPE_LABEL } from '../../lib/accountMeta'
import { fmt, fmtCompact } from '../../lib/money'
import SectionLabel from '../../components/ui/SectionLabel'
import { nextOccurrence } from './shared'

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
export function SummaryBar({ summary, hidden }) {
  return (
    <section className="px-5 mb-6">
      <SectionLabel inset="none" gap="none" className="text-center">Net worth</SectionLabel>
      <p className="mt-0.5 text-center text-38 leading-none font-semibold tracking-tight
        tabular-nums text-slate-900 dark:text-white">
        {hidden ? '₱ ••••' : fmtCompact(summary.net)}
      </p>
      <p className="mt-2 text-center text-13 text-slate-500 dark:text-slate-400 tabular-nums">
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
export const CARD_RATIO = 1.586
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
export const STACK_STRIP = 50

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
export const AccountCard = forwardRef(function AccountCard({
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
            <span className="block text-14 font-semibold leading-tight truncate">
              {acct.name}
            </span>
            {subtitle && (
              <span className="block text-10 text-white/65 truncate">{subtitle}</span>
            )}
          </span>
        </span>

        <span className="text-right shrink-0">
          <span className="block text-16 font-bold tabular-nums leading-tight">
            {hidden ? '₱ ••••' : fmt(isCredit ? currentBalance : acct.balance)}
          </span>
          <span className="block text-10 text-white/65">
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
              <span className="text-10 text-white/60">
                {Math.round(stmtPct)}% of {hidden ? '••••' : fmtCompact(limit)} used
              </span>
              <SchemeMark scheme={acct.scheme} className="h-[34px]" />
            </div>
          </>
        ) : (
          <div className="flex items-end justify-between gap-2">
            <span className="text-10 text-white/50">
              {acct.currency ?? 'PHP'}
            </span>
            <SchemeMark scheme={acct.scheme} className="h-[34px]" />
          </div>
        )}
      </div>
    </button>
  )
})
