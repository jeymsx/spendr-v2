import { useCallback, useEffect, useMemo, useState } from 'react'
import db from '../db/db'
import { useLiveQuery } from './useLiveQuery'
import { useBaseCurrency } from '../context/CurrencyContext'
import {
  RATES_META_KEY, fetchRates, foreignCurrencies, isStale, needsRefresh, singleFlight,
} from '../lib/fx'

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
 * ── The request budget, which is a real constraint ──
 *
 * The provider's free tier is a thousand requests a month. This hook is
 * called by eleven components and several of them mount together, so the
 * guards that matter are the ones that are SHARED rather than per-instance:
 *
 *   singleFlight   one request at a time however many callers ask. Two
 *                  instances mounting together used to send two identical
 *                  requests - measured on /accounts, where the list and the
 *                  currency picker inside its own form both call this.
 *   autoTriedFor   one automatic attempt per page load. A module variable,
 *                  because a ref is per-instance and that is exactly the bug.
 *   needsRefresh   and only when the cached table is over a day old.
 *
 * Which leaves the arithmetic somewhere sane: about one request a day from
 * ordinary use, against an allowance of thirty-three a day.
 *
 * ── And one that is not about age at all ──
 *
 * Adding a dollar account to a peso ledger has to fetch immediately, however
 * fresh the table is, because the table it has does not price the thing that
 * just appeared. `missing` is that case: a currency in use with no rate for
 * it. It is the only path that can fire twice in a session, and only ever
 * once per new currency.
 *
 * ── It uses the cache whatever its age ──
 *
 * A failure is kept and surfaced rather than retried in a loop. An app whose
 * whole premise is that it works on a dead connection must not spend that
 * connection on rates.
 */

/**
 * The fetch itself, shared by every instance of this hook.
 *
 * Module scope is the point: the instances cannot see each other, so the
 * de-duplication has to live somewhere they all reach.
 */
const fetchOnce = singleFlight(async (/** @type {string} */ base) => {
  const next = await fetchRates(base)
  /* Not in the synced meta set - see lib/backup.js. A rate table is a
     device-local cache of somebody else's data, and pushing it through sync
     would have two phones overwriting each other's copy of a figure neither
     of them owns. */
  await db.meta.put({ key: RATES_META_KEY, value: next, updatedAt: next.fetchedAt })
  return next
})

/**
 * What an automatic fetch has already been attempted for, this page load.
 *
 * Keyed on the base currency AND the currencies in use, so adding an account
 * in a new one is a new key and gets its own single attempt. Reset by a
 * reload, which is when trying again is reasonable.
 */
let autoTriedFor = ''

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

  const table = stored?.value ?? null
  const foreign = useMemo(() => foreignCurrencies(accounts ?? [], base), [accounts, base])
  const needed = foreign.length > 0

  /** Currencies this ledger holds that the cached table cannot price. */
  const missing = useMemo(
    () => foreign.filter(c => !(table?.rates ?? {})[c]),
    [foreign, table],
  )

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      return await fetchOnce(base)
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
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return

    const key = `${base}|${foreign.join(',')}`
    if (autoTriedFor === key) return
    // Old enough to replace, or holding a currency it cannot price at all.
    if (!needsRefresh(table) && missing.length === 0) return

    autoTriedFor = key
    /* refresh() flips `busy`, which is a state write from an effect. The rule
       is right in general and wrong here: this is a network request being
       started, not a value that could have been derived during render, and
       the module flag above makes it happen at most once per load. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [needed, stored, accounts, table, base, foreign, missing, refresh])

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
    /** Those of them the cached table cannot price. */
    missing,
    stale: needed && (isStale(table) || rebased),
    busy,
    error,
    refresh,
  }
}

export default useRates
