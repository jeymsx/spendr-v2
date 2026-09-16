import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import db from '../db/db'
import { useLiveQuery } from './useLiveQuery'
import { useBaseCurrency } from '../context/CurrencyContext'
import { RATES_META_KEY, fetchRates, foreignCurrencies, isStale } from '../lib/fx'

/**
 * The exchange-rate table, fetched only if this ledger actually needs one.
 *
 * ── The condition is the feature ──
 *
 * Nearly every ledger here holds one currency, and for those this hook does
 * nothing at all: no request, no stale warning, no row in Settings. That is
 * not an optimisation, it is the correct behaviour - a peso-only ledger has
 * no exchange rate, and telling somebody their rates are eight days old when
 * no figure in their app depends on one is noise dressed as diligence.
 *
 * So the trigger is `foreignCurrencies`: an account whose currency differs
 * from the ledger's. Until one exists, `table` is whatever is cached (usually
 * nothing) and nothing goes to the network.
 *
 * ── Fetching, and not fetching ──
 *
 * The provider updates daily; the cache is used whatever its age. A refresh
 * is attempted when the table is missing or stale AND the browser believes it
 * is online, once per mount, guarded by a ref so React's double-invoked
 * effects in development do not send it twice.
 *
 * A failure is kept and surfaced rather than retried in a loop. An app whose
 * whole premise is that it works on a dead connection must not spend that
 * connection on rates.
 */
export function useRates() {
  const base = useBaseCurrency()
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], undefined)
  /* `?? null` is load-bearing. Dexie's get() resolves to UNDEFINED when the
     row does not exist, which is the same value useLiveQuery returns before
     it has answered at all - so without this, "no rate table has ever been
     downloaded" is indistinguishable from "still loading", and the guard
     below waits forever for a row that is never coming. Which is exactly what
     it did: the first ledger with a dollar account in it sat there saying it
     had no rate rather than going and getting one. */
  const stored = useLiveQuery(async () => (await db.meta.get(RATES_META_KEY)) ?? null, [], undefined)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(/** @type {string|null} */ (null))
  const tried = useRef(false)

  const table = stored?.value ?? null
  const foreign = useMemo(() => foreignCurrencies(accounts ?? [], base), [accounts, base])
  const needed = foreign.length > 0

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await fetchRates(base)
      /* Not in the synced meta set - see lib/backup.js. A rate table is a
         device-local cache of somebody else's data, and pushing it through
         sync would have two phones overwriting each other's copy of a figure
         neither of them owns. */
      await db.meta.put({ key: RATES_META_KEY, value: next, updatedAt: next.fetchedAt })
      return next
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setBusy(false)
    }
  }, [base])

  useEffect(() => {
    if (!needed) return
    // undefined is "Dexie has not answered yet", and fetching before it has
    // would discard a perfectly good cached table.
    if (stored === undefined || accounts === undefined) return
    if (tried.current) return
    if (!isStale(table)) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    tried.current = true
    /* refresh() flips `busy`, which is a state write from an effect. The rule
       is right in general and wrong here: this is a network request being
       started, not a value that could have been derived during render, and
       the ref above makes it happen at most once per mount. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [needed, stored, accounts, table, refresh])

  /* A table quoted against a different currency than the ledger is not wrong,
     it is just indirect - convert() goes through the base either way. It is
     still worth refetching, so it counts as stale. */
  const rebased = !!table && table.base !== base

  return {
    /** @type {import('../lib/fx').RateTable|null} */
    table,
    /** Whether any figure in this ledger depends on a rate at all. */
    needed,
    /** The non-base currencies actually in use. */
    foreign,
    stale: needed && (isStale(table) || rebased),
    busy,
    error,
    refresh,
  }
}

export default useRates
