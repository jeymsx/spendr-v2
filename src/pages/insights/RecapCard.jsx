import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { localMonthStartIso, txMonthKey } from '../../utils/txDate'
import { monthKeyOf, monthLabel, parseMonth } from '../../lib/recap'
import Card from '../../components/ui/Card'
import { IconBarChart, IconChevronRight } from '../../components/icons'

/** Money that came or went - what makes a month worth a recap. @param {Record<string, any>} t */
const isFlow = (t) => t.type === 'expense' || t.type === 'inflow'

/**
 * The month Insights can offer a recap for: `preferMonth` - the month its
 * arrows are on - when that month is over and has something in it, else the
 * latest month that does. `undefined` while it is being looked up, `null`
 * when there is none yet.
 *
 * Two small indexed reads rather than the whole ledger: Insights already
 * holds its own window of rows, and a second full-table read here re-ran on
 * every write for the sake of one date. The same rule as recapMonths.
 *
 * @param {string|null} preferMonth  "2026-09"
 * @returns {string|null|undefined}
 */
export function useRecapMonth(preferMonth) {
  return useLiveQuery(async () => {
    const now = new Date()
    if (preferMonth && preferMonth < monthKeyOf(now)) {
      const { year, month } = parseMonth(preferMonth)
      const any = await db.transactions.where('date')
        .between(localMonthStartIso(year, month), localMonthStartIso(year, month + 1), true, false)
        .filter(isFlow).first()
      if (any) return preferMonth
    }
    const last = await db.transactions.where('date')
      .below(localMonthStartIso(now.getFullYear(), now.getMonth()))
      .reverse().filter(isFlow).first()
    return last ? txMonthKey(last.date) || null : null
  }, [preferMonth], undefined)
}

/**
 * The way into a month's recap from Insights, where looking back lives.
 *
 * @param {{month: string}} props  "2026-09", from useRecapMonth
 */
export default function RecapCard({ month }) {
  const navigate = useNavigate()
  return (
    <div className="px-5 mb-5">
      <Card
        as="button"
        interactive
        padding="md"
        onClick={() => navigate(`/recap/${month}`)}
        className="flex items-center gap-4"
      >
        <span className="w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center bg-primary/10 dark:bg-primary/20">
          <span className="accent-ink"><IconBarChart size={20} /></span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-15 font-semibold text-slate-900 dark:text-white truncate">
            Your {monthLabel(month)} recap
          </span>
          <span className="block text-13 text-slate-500 dark:text-slate-400">See how your month went</span>
        </span>
        <span className="text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true"><IconChevronRight /></span>
      </Card>
    </div>
  )
}
