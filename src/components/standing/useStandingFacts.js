import { useMemo, useState } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useForecast from '../../hooks/useForecast'
import useRates from '../../hooks/useRates'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { monthEnds, useNetWorthSeries } from '../../pages/insights/netWorth'
import { gatherFacts } from '../../lib/standing/gather'

/**
 * The note's facts, kept current: every table it reads, the forecast, and
 * the net worth's move since the 1st, handed to gatherFacts once they have
 * all arrived - so the note never draws once from half a ledger and again
 * from the whole.
 *
 * Only ever mounted while the note is open, so none of this is read on any
 * other day.
 *
 * Also returns the categories and accounts by name, which is how the note
 * draws a "Rent" as its own tile and a "BPI Credit" as its own card.
 */
export default function useStandingFacts() {
  const [now] = useState(() => new Date())
  const base = useBaseCurrency()
  const { table: rates } = useRates()
  const series = useNetWorthSeries('6m')
  const { forecast } = useForecast(30)
  const categories = useLiveQuery(() => db.categories.toArray(), [], undefined)
  const recurring = useLiveQuery(() => db.recurring.toArray(), [], undefined)
  const goals = useLiveQuery(() => db.goals.toArray(), [], undefined)
  const nameRow = useLiveQuery(async () => (await db.meta.get('displayName')) ?? null, [], undefined)

  const ready = !series.loading && !!forecast && categories !== undefined && recurring !== undefined
    && goals !== undefined && nameRow !== undefined

  /* Its parts, not the series object: that is a new object on every render,
     and a note rebuilt from the whole ledger on every render is a picture
     redrawn on every render too. */
  const { txs, accounts, debts, includeDebts, current } = series
  const facts = useMemo(() => {
    if (!ready) return null
    const ends = current == null || !txs.length ? [] : monthEnds({ txs, current, months: 2, debts, includeDebts })
    return gatherFacts({
      now, name: nameRow?.value ?? '', base, txs, accounts, categories: categories ?? [], recurring: recurring ?? [],
      goals: goals ?? [], debts, includeDebts, rates, forecast, worthChange: ends[0]?.change ?? null,
    })
  }, [ready, now, base, rates, txs, accounts, debts, includeDebts, current, forecast, categories, recurring, goals, nameRow])

  const lookups = useMemo(() => ({
    cats: Object.fromEntries((categories ?? []).map(c => [c.name, c])),
    accts: Object.fromEntries((accounts ?? []).map(a => [a.name, a])),
  }), [categories, accounts])

  return { facts, ready, lookups }
}
