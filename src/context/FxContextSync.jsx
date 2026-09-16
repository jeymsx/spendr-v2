import { useEffect } from 'react'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useBaseCurrency } from './CurrencyContext'
import { RATES_META_KEY } from '../lib/fx'
import { setFxContext } from '../lib/fxContext'

/**
 * Keeps lib/fxContext's snapshot current. Renders nothing.
 *
 * ── Why it is a component and not a hook somewhere useful ──
 *
 * The snapshot has to be right whenever a transaction is written, and a
 * transaction can be written from the add forms, the template sheet, a bill
 * posting, a debt settlement, an account balance correction and the importer.
 * Hanging this off any one screen's hook would mean the stamp was correct
 * only if you happened to have visited that screen first - and "it works if
 * you go to the dashboard first" is the kind of conditional correctness that
 * reads as a random bug six months later.
 *
 * So it is mounted once, at the root, beside Shell.
 *
 * ── It deliberately does not fetch ──
 *
 * useRates does that, and only for a ledger that needs it. This one only
 * READS what is already in Dexie, so mounting it at the root costs two live
 * queries and never a request.
 */
export default function FxContextSync() {
  const base = useBaseCurrency()
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  const stored = useLiveQuery(
    async () => (await db.meta.get(RATES_META_KEY)) ?? null, [], undefined)

  useEffect(() => {
    /* Partial updates are fine and are the normal case on a cold start: the
       accounts arrive before the rate table, and a snapshot with accounts and
       no rates still stamps every same-currency row correctly. */
    setFxContext({
      base,
      rates: stored?.value ?? null,
      accounts: accounts ?? [],
    })
  }, [base, accounts, stored])

  return null
}
