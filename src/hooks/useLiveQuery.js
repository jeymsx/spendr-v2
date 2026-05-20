import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'

/**
 * Reactive wrapper around Dexie's liveQuery.
 * Re-runs the querier whenever any IndexedDB table it reads changes.
 *
 * @param {() => Promise<T>} querier  Async function that reads from db
 * @param {any[]}            deps     Re-subscribe when these change (like useEffect deps)
 * @param {T}                defaultResult  Value returned before the first result arrives
 * @returns {T | undefined}
 */
export function useLiveQuery(querier, deps = [], defaultResult = undefined) {
  const [result, setResult]  = useState(defaultResult)
  const [error,  setError]   = useState(null)

  useEffect(() => {
    setError(null)

    const subscription = liveQuery(querier).subscribe({
      next:  value => setResult(value),
      error: err   => setError(err),
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  if (error) throw error
  return result
}
