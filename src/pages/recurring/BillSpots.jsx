import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Divider from '../../components/ui/Divider'
import SectionLabel from '../../components/ui/SectionLabel'
import CategoryGlyph from '../../components/CategoryGlyph'
import { fmt } from '../../lib/money'
import { billFormQuery, spotBills } from '../../lib/billSpots'
import { toDateInput } from '../../utils/txDate'

/** meta: the spotted bills you said are not bills, by key. */
export const DISMISSED_BILLS_KEY = 'dismissedBills'

/**
 * "Spotted in your history": bills the ledger already shows that Recurring
 * does not have (lib/billSpots.js), each one tap from being added - the form
 * opens filled in with the name, a typical amount, the day and the account -
 * or from being told it is not a bill, which it then never suggests again.
 *
 * Renders nothing when there is nothing to suggest, so the page is exactly
 * as it was for anyone whose bills are all set up.
 *
 * @param {{transactions: Array<Record<string, any>>, recurring: Array<Record<string, any>>,
 *          categories: Array<Record<string, any>>, className?: string}} props
 */
export default function BillSpots({ transactions, recurring, categories, className = '' }) {
  const navigate = useNavigate()
  const dismissed = useLiveQuery(async () => (await db.meta.get(DISMISSED_BILLS_KEY))?.value ?? [], [], null)
  const spots = useMemo(
    () => (dismissed ? spotBills({ transactions, recurring, dismissed }) : []),
    [transactions, recurring, dismissed],
  )
  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  if (!spots.length) return null

  const notABill = (/** @type {string} */ key) => db.meta.put({
    key: DISMISSED_BILLS_KEY,
    value: [...new Set([...(dismissed ?? []), key])].slice(-200),
    updatedAt: new Date().toISOString(),
  })

  return (
    <section className={className}>
      <SectionLabel inset="gutter" gap="tight">Spotted in your history</SectionLabel>
      <div className="px-5">
        <Card clip>
          {spots.map((s, i) => {
            const cat = s.category ? catMap[s.category] : null
            return (
              <div key={s.key}>
                {i > 0 && <Divider inset="glyph" />}
                <div className="flex gap-3 px-4 py-3.5">
                  <span
                    className="w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: (cat?.color ?? '#64748b') + '1f' }}
                    aria-hidden="true"
                  >
                    <CategoryGlyph cat={cat} size={17} emoji="🧾" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-white">{s.name}</p>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{fmt(s.amount)}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {s.label}{s.account ? ` · ${s.account}` : ''}
                    </p>
                    <div className="mt-2.5 flex gap-2">
                      <Button size="xs" variant="tint" className="px-3.5"
                        onClick={() => navigate(`/recurring/new?${billFormQuery(s, toDateInput)}`)}>
                        Add to Recurring
                      </Button>
                      <Button size="xs" variant="quiet" className="px-3" onClick={() => notABill(s.key)}>
                        Not a bill
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </Card>
      </div>
    </section>
  )
}
