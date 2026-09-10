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
 * Applied ONCE, tracked by a ref. Without that, a re-render after the user has
 * edited a field would overwrite their correction with the parse - which is
 * the sort of thing that feels haunted.
 */
export function useQuickPrefill({ categories, accounts, apply }) {
  const location = useLocation()
  const done = useRef(false)
  const applyRef = useRef(apply)
  useEffect(() => { applyRef.current = apply }, [apply])

  const prefill = location.state?.prefill

  useEffect(() => {
    if (done.current || !prefill) return
    // Only proceed once there is something to resolve names against.
    const needsCats = prefill.category != null
    const needsAccts = prefill.account != null || prefill.fromAccount != null || prefill.toAccount != null
    if (needsCats && !(categories ?? []).length) return
    if (needsAccts && !(accounts ?? []).length) return

    done.current = true
    const byName = (list, name) =>
      name ? (list ?? []).find(x => x.name === name) ?? null : null

    applyRef.current({
      amount: prefill.amount,
      description: prefill.description || '',
      date: prefill.date || null,
      category: byName(categories, prefill.category),
      account: byName(accounts, prefill.account),
      fromAccount: byName(accounts, prefill.fromAccount),
      toAccount: byName(accounts, prefill.toAccount),
    })
  }, [prefill, categories, accounts])

  return Boolean(prefill)
}
