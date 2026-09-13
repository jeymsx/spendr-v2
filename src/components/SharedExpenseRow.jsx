import { useMemo } from 'react'
import SectionLabel from './ui/SectionLabel'
import FadeScroller from './FadeScroller'
import { RAIL_TOUCH } from './ui/Rail'
import { fieldInputClass } from './ui/Field'
import { chipClass } from '../pages/accounts/shared'
import { moneyChangeHandler, parseMoney } from '../utils/moneyInput'
import { fmt } from '../lib/money'

/**
 * "Someone owes me part of this."
 *
 * ── Why the expense stays at its full amount ──
 *
 * You paid 3,000 for dinner and 2,250 of it was never yours. The temptation is
 * to record 750, and it is wrong: 3,000 left your account, your balance says
 * so, and a ledger that disagrees with your bank is worth nothing.
 *
 * So the expense is the full 3,000 and a receivable opens for their share.
 * When they pay you back, that settlement is a REFUND against this purchase -
 * which is what finally lands the category on 750, at the moment the money
 * actually comes back rather than at the moment you hoped it would.
 *
 * That last step is also a fix. A debt collection used to be written as an
 * inflow categorised "Debt Collection", so the category stayed overstated for
 * ever and the repayment counted as income.
 *
 * ── Why it is not a people table ──
 *
 * Splitwise needs groups, members, multi-currency settlement and a
 * simplify-debts pass. This needs a name and a number, because the receivable
 * side already exists: Debts has "owed to me" and knows how to settle. The
 * only thing missing was the link back to the purchase.
 *
 * The split chips are the common cases rather than a calculator. Half is two
 * people; a third and a quarter are three and four. Anything else is typed.
 */
export default function SharedExpenseRow({
  total, owedStr, onOwedChange, contact, onContactChange,
}) {
  const owed = parseMoney(owedStr)
  const mine = Math.max(0, Math.round((total - owed) * 100) / 100)

  const presets = useMemo(() => {
    if (!(total > 0)) return []
    const out = []
    const add = (label, v) => {
      const r = Math.round(v * 100) / 100
      if (r > 0 && !out.some(p => Math.abs(p.value - r) < 0.005)) out.push({ label, value: r })
    }
    add('Half', total / 2)
    add('Two thirds', (total * 2) / 3)
    add('Three quarters', (total * 3) / 4)
    return out
  }, [total])

  return (
    <div>
      <SectionLabel>Someone owes me part of this</SectionLabel>

      <input
        value={contact}
        onChange={e => onContactChange(e.target.value)}
        placeholder="Who owes you"
        className={fieldInputClass()}
      />

      <input
        value={owedStr}
        onChange={moneyChangeHandler(onOwedChange)}
        inputMode="decimal"
        placeholder="0.00"
        aria-label="Amount owed back"
        className={`${fieldInputClass()} mt-2`}
      />

      {presets.length > 0 && (
        <FadeScroller
          axis="x"
          style={RAIL_TOUCH}
          className="flex items-center gap-1.5 mt-2 -mx-4 px-4 pb-0.5"
        >
          {presets.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => onOwedChange(String(p.value))}
              className={chipClass(Math.abs(owed - p.value) < 0.005)}
            >
              {p.label} · {fmt(p.value)}
            </button>
          ))}
        </FadeScroller>
      )}

      {owed > 0 && (
        <p className="mt-2 px-1 text-11 leading-snug text-slate-400 dark:text-slate-500">
          {owed >= total
            ? 'The whole thing comes back to you, so none of it is yours.'
            : `The full ${fmt(total)} leaves your account now. ${fmt(mine)} of it is`
              + ' yours once they settle up.'}
        </p>
      )}
    </div>
  )
}
