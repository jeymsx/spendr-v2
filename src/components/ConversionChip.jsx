import { useNavigate } from 'react-router-dom'
import { useBaseCurrency } from '../context/CurrencyContext'
import useRates from '../hooks/useRates'
import { convert } from '../lib/fx'
import { fmt } from '../lib/money'
import { symbolOf } from '../lib/currency'

/**
 * What this figure is worth in the ledger's currency, under the figure.
 *
 * ── Why it is here and not in Settings ──
 *
 * Somebody typing $40 into a peso ledger is doing arithmetic in their head to
 * decide whether $40 is a lot. The rate is a fact they need AT THAT MOMENT,
 * and a number they have to leave the form to go and find is a number they
 * will guess instead.
 *
 * So it sits under the amount, it shows the conversion and the rate it used,
 * and tapping it opens the rates page for the full table.
 *
 * ── It says nothing at all most of the time ──
 *
 * No foreign account, no chip. A peso expense on a peso ledger has no
 * conversion to report and a row saying "P40 = P40" is worse than silence.
 * That is the common case and it renders null.
 *
 * ── Two modes, and the difference is the whole point of storing baseAmount ──
 *
 * `at` unset means LIVE: convert at today's rate, which is right for a figure
 * being entered now.
 *
 * `at` given is a figure already priced - a transaction's stored baseAmount,
 * from the day it happened. It is shown as it was recorded and never
 * re-derived, because re-deriving a past amount at today's rate would move a
 * month you had already closed. See lib/fx.js.
 */

function IconConvert() {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <polyline points="4 8 17 8" />
      <polyline points="13 4 17 8 13 12" />
      <polyline points="20 16 7 16" />
      <polyline points="11 12 7 16 11 20" />
    </svg>
  )
}

function IconChevron() {
  return (
    <svg
      width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <polyline points="5,2 9,7 5,12" />
    </svg>
  )
}

/**
 * @param {object} props
 * @param {number} [props.amount]   in `currency`
 * @param {string|null} [props.currency]  what `amount` is in
 * @param {number|null} [props.at]  an already-priced figure, in the base
 *   currency. Given, the chip reports it rather than converting anything.
 * @param {string} [props.className]  layout only
 */
export default function ConversionChip({ amount = 0, currency, at = null, className = '' }) {
  const navigate = useNavigate()
  const base = useBaseCurrency()
  const { table: rates } = useRates()

  const code = currency ? String(currency).toUpperCase() : base
  // Nothing to convert, so nothing to say.
  if (code === base) return null

  const unit = convert(1, code, base, rates)
  const priced = at != null ? at : convert(amount ?? 0, code, base, rates)

  /* No rate, and the chip says so rather than disappearing: somebody holding
     a foreign account whose figures are not being converted is entitled to
     know that, and the tap takes them to the button that fixes it. */
  const label = priced == null && unit == null
    ? `No ${code} rate yet`
    /* Before anything is typed the conversion is zero and useless, so the
       rate itself is the useful half. It is also the thing somebody opens
       this form wanting to know. */
    : (amount && priced != null) || at != null
      ? `${fmt(priced ?? 0, base)}${unit == null ? '' : `  (${symbolOf(code)}1 = ${fmt(unit, base)})`}`
      : `${symbolOf(code)}1 = ${fmt(unit ?? 0, base)}`

  return (
    <button
      type="button"
      onClick={() => navigate('/settings/rates')}
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
        'text-11 font-medium tabular-nums',
        'bg-slate-900/[0.06] text-slate-600',
        'dark:bg-white/[0.08] dark:text-slate-300',
        'active:opacity-60 transition-opacity duration-75',
        className,
      ].filter(Boolean).join(' ')}
    >
      <IconConvert />
      <span>{label}</span>
      <IconChevron />
    </button>
  )
}
