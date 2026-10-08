// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'

/**
 * A page that mounts again starts from the last answer, not from "not known
 * yet". Insights' tabs remount the figures each time you come back to
 * Overview, and a page that read "not known" as "no Wrapped" drew the
 * Biggest category card for a moment and then covered it with Wrapped.
 */

const last = { date: '2026-09-15T12:00:00.000Z', type: 'expense', amount: 100, category: 'Food', account: 'Cash' }
const chain = { reverse: () => chain, filter: () => chain, first: async () => last }

vi.mock('../../db/db', () => ({ default: { transactions: { where: () => ({ below: () => chain, between: () => chain }) } } }))
// A live query without Dexie: run it once per mount and keep the answer in state.
vi.mock('../../hooks/useLiveQuery', () => ({
  useLiveQuery: (/** @type {() => Promise<any>} */ querier, /** @type {any[]} */ deps = [], /** @type {any} */ initial = undefined) => {
    const [value, setValue] = useState(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { querier().then(setValue) }, deps)
    return value
  },
}))

const { useRecapMonth } = await import('./useRecapMonth')

describe('useRecapMonth', () => {
  it('is not known until it has been looked up, the first time', async () => {
    const first = renderHook(() => useRecapMonth('2026-09'))
    expect(first.result.current).toBeUndefined()
    await waitFor(() => expect(first.result.current).toBe('2026-09'))
  })

  it('starts from the last answer when the page mounts again, so nothing else is drawn meanwhile', async () => {
    const a = renderHook(() => useRecapMonth('2026-09'))
    await waitFor(() => expect(a.result.current).toBe('2026-09'))
    a.unmount()
    const again = renderHook(() => useRecapMonth('2026-09'))
    // The very first render, before the lookup has come back.
    expect(again.result.current).toBe('2026-09')
  })

  it('keeps the answers for different months apart', async () => {
    const a = renderHook(() => useRecapMonth('2026-09'))
    await waitFor(() => expect(a.result.current).toBe('2026-09'))
    const other = renderHook(() => useRecapMonth('2026-08'))
    expect(other.result.current).toBeUndefined()
  })
})
