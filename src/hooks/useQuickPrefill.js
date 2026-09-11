import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Apply a quick-log parse to an add page's form state.
 *
 * The payload arrives as router state from QuickLogOverlay, holding names
 * rather than ids - the parser matched against `account.name` and
 * `category.name`, which is what the user typed. So this waits for the live
 * queries to arrive before resolving those names to the objects the pickers
 * expect; running before they load would silently drop both.
 *
 * Applied once per NAVIGATION, keyed on location.key.
 *
 * It has to be a re-render guard AND allow a second quick log, and a plain
 * `done` boolean cannot be both. It was one, and the bug was this: quick-log
 * from a page you are already on - /expense to /expense - does not remount
 * the component, so the ref stayed true from the first parse and every
 * later one was dropped on the floor. You would type "999 uniqlo maya",
 * confirm, and sit looking at the previous entry.
 *
 * location.key is fresh for every navigation and stable across re-renders,
 * which is exactly the distinction needed: the same parse must not be
 * reapplied over a correction you have since typed, a new one always must.
 */
export function useQuickPrefill({ categories, accounts, apply }) {
  const location = useLocation()
  const appliedKey = useRef(null)
  const applyRef = useRef(apply)
  useEffect(() => { applyRef.current = apply }, [apply])

  const prefill = location.state?.prefill

  useEffect(() => {
    if (!prefill || appliedKey.current === location.key) return
    // Only proceed once there is something to resolve names against.
    const needsCats = prefill.category != null
    const needsAccts = prefill.account != null || prefill.fromAccount != null || prefill.toAccount != null
    if (needsCats && !(categories ?? []).length) return
    if (needsAccts && !(accounts ?? []).length) return

    appliedKey.current = location.key
    const byName = (list, name) =>
      name ? (list ?? []).find(x => x.name === name) ?? null : null

    applyRef.current({
      amount: prefill.amount,
      fee: prefill.fee ?? null,
      description: prefill.description || '',
      date: prefill.date || null,
      category: byName(categories, prefill.category),
      account: byName(accounts, prefill.account),
      fromAccount: byName(accounts, prefill.fromAccount),
      toAccount: byName(accounts, prefill.toAccount),
    })
  }, [prefill, location.key, categories, accounts])

  return Boolean(prefill)
}
