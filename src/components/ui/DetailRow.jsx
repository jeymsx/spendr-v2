import { cx } from './cx'
import Divider from './Divider'

/**
 * Label on the left, value on the right.
 *
 * ── What it settles ──
 *
 * Four implementations of one row: TxConfirmSheet's, TxDetailSheet's,
 * RecurringDetail's and ImportWizard's `StatRow`. They disagreed about
 * everything a row can disagree about - `py-2.5` / `py-3` / `py-3.5`, a
 * value at 14px medium / 14px semibold / 15px medium, a label in slate-400
 * or slate-500, and a separator that was a border on one and an inset
 * hairline on the next.
 *
 * 14px medium wins for the value and slate-500 for the label, each being two
 * of the three; the separator is the shared <Divider>, inset to the row's
 * text the way a separator inside a card should be.
 *
 * ── `padded` ──
 *
 * These rows usually live in a card that owns no padding of its own, so the
 * row carries it. TxConfirmSheet's list is not in a card - it is a bare
 * stack under a heading - and padding there would push the labels off the
 * sheet's own gutter. That is the only reason the prop exists.
 *
 * ── `tone` ──
 *
 * A value that is a warning, a shortfall or a refund says so in colour. It
 * is a full class string rather than a named tone because the colours it
 * needs are the app's semantic ones (amber for a caveat, red for a shortfall)
 * and those are chosen at the call site where the meaning lives.
 */
export default function DetailRow({
  label,
  value,
  /** A second, smaller line under the value. */
  sub = null,
  /** A colour swatch before the value - a category, an account. */
  dot = null,
  /** Text classes for the value, when it carries a meaning. */
  tone = '',
  /** Suppresses the separator under the row. */
  isLast = false,
  /** Rows outside a card carry no horizontal padding. */
  padded = true,
  className = '',
}) {
  return (
    <>
      <div
        className={cx(
          'flex items-baseline justify-between gap-4',
          padded ? 'px-4 py-3' : 'py-2.5',
          className,
        )}
      >
        <span className="text-[13px] text-slate-500 dark:text-slate-400 shrink-0">
          {label}
        </span>

        <div className="flex items-baseline gap-2 min-w-0">
          {dot && (
            <span
              className="w-2 h-2 rounded-full shrink-0 self-center"
              style={{ backgroundColor: dot }}
            />
          )}
          <div className="text-right min-w-0">
            <p
              className={cx(
                'text-[14px] font-medium truncate',
                tone || 'text-slate-800 dark:text-white',
              )}
            >
              {value}
            </p>
            {sub && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {sub}
              </p>
            )}
          </div>
        </div>
      </div>

      {!isLast && <Divider inset={padded ? 'row' : 'none'} />}
    </>
  )
}
