import { Fragment, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from '../hooks/useLiveQuery'
import db from '../db/db'
import { DEFAULT_CURRENCY, CURRENCIES } from '../lib/currency'
import { setBaseCurrency } from '../lib/money'

/**
 * Which currency the ledger is kept in.
 *
 * ── Two stores, on purpose ──
 *
 * `db.meta.currency` is the truth, because it is the one that syncs - see
 * pullPreferences in lib/sync.js, which has carried this key since before
 * anything read it. But Dexie is asynchronous, and money is on screen in the
 * first frame, so a user whose ledger is in dollars would watch every figure
 * repaint from ₱ to $ on every cold start.
 *
 * So localStorage mirrors it, exactly the way ThemeContext mirrors the theme:
 * read synchronously in the initialiser, written whenever Dexie says
 * something different. The key is spelled once, here, as a named constant -
 * the theme's mirror was read under the wrong key by the backup writer for a
 * day, and a silently-wrong storage key is a bug with no symptom until it
 * is somebody's data.
 *
 * ── Why the setter is the module's and not the context's ──
 *
 * `fmt(v)` is called in 55 files and takes no context. lib/money.js keeps the
 * base as module state for it; this provider is the only thing allowed to
 * write it.
 *
 * ── And why the children are keyed ──
 *
 * Module state does not re-render anything. A context value only re-renders
 * what CONSUMES it, and the whole point of `fmt(v)` and `baseSymbol()` is
 * that their forty-odd call sites do not have to. So a currency change would
 * have left every figure on screen showing the old symbol until something
 * else happened to re-render it - which, on a dashboard of memoised cards, is
 * "never".
 *
 * Keying the children on the code remounts the tree when, and only when, the
 * currency actually changes. That is a heavy thing to do and it is doing it
 * about once in the life of an install, which is the right trade against
 * threading a currency argument through 55 files. It does not fire on the
 * first Dexie read, because that resolves to the same code the mirror already
 * gave.
 */

const STORAGE_KEY = 'spendr-currency'

const CurrencyContext = createContext(DEFAULT_CURRENCY)

/** Anything not in the registry is not a currency, whatever it says. */
function sane(code) {
  const up = code ? String(code).toUpperCase() : ''
  return CURRENCIES[up] ? up : DEFAULT_CURRENCY
}

function readMirror() {
  try {
    return sane(localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_CURRENCY
  }
}

export function CurrencyProvider({ children }) {
  /* Set during the initialiser rather than in an effect. An effect runs after
     the first paint, which is one frame of the wrong symbol on every figure
     on the screen. */
  const [code, setCode] = useState(() => setBaseCurrency(readMirror()))

  const stored = useLiveQuery(() => db.meta.get('currency'), [], undefined)

  useEffect(() => {
    // undefined is "Dexie has not answered yet"; a missing row answers null.
    if (stored === undefined) return
    const next = sane(stored?.value)
    if (next === code) return
    setBaseCurrency(next)
    /* The rule is right in general and wrong here. This is an external
       store - Dexie - being read into React, and the value cannot be
       derived during render because the synchronous mirror and the
       asynchronous truth are two different sources that have to be
       reconciled. The guard above makes it converge in one pass. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* private mode */ }
  }, [stored, code])

  /* The value is the code itself rather than an object, so the identity is
     stable for free and every consumer of it re-renders only when the
     currency actually changes. */
  return (
    <CurrencyContext.Provider value={code}>
      <Fragment key={code}>{children}</Fragment>
    </CurrencyContext.Provider>
  )
}

/**
 * The app-wide currency code, as a value that re-renders when it changes.
 * @returns {string}
 */
export function useBaseCurrency() {
  return useContext(CurrencyContext)
}

/** The base currency's registry entry, for a symbol or a name. */
export function useBaseCurrencyInfo() {
  const code = useBaseCurrency()
  return useMemo(() => ({ code, ...CURRENCIES[code] }), [code])
}

export default CurrencyContext
