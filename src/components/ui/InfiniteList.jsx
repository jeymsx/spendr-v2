import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * A long list that grows as you scroll, instead of a "Load more" button.
 *
 * ── Why a hook and a marker, not a list component ──
 *
 * The lists that need it draw themselves very differently - Transactions in
 * day groups with rows that animate in and out, Top expenses as one card, an
 * account's history with a running balance - so what they share is not the
 * markup but the rule: show a page, and show the next one before you reach
 * the end. The hook decides how many; <ListEnd> is the marker at the bottom
 * that asks for more when it comes near.
 *
 *   const list = useInfiniteList(rows, { resetKey: filters })
 *   list.visible.map(...)
 *   <ListEnd list={list} done={`All ${rows.length} transactions`} />
 *
 * ── Before you get there ──
 *
 * The next page is added while the end is still some way below the screen
 * (LOOKAHEAD), so a steady scroll never meets it - the rows are already
 * there. The data is local, so there is nothing to wait for and no spinner
 * to show.
 *
 * ── Back to the top of the list ──
 *
 * `resetKey` is whatever makes it a different list - the filters, the
 * period, the account. When it changes the count goes back to one page, in
 * the same render rather than an effect after it, so a new filter never
 * draws once with the old list's hundreds of rows.
 */

/** Rows per page. */
export const PAGE = 50
/** How far below the screen the end can be when the next page is added, in px. */
const LOOKAHEAD = 900

/**
 * @template T
 * @param {T[]} items  the whole list, in order
 * @param {{page?: number, resetKey?: string|number|object|null}} [opts]
 * @returns {{visible: T[], hasMore: boolean, total: number, more: () => void, pageSize: number}}
 */
export function useInfiniteList(items, { page = PAGE, resetKey = null } = {}) {
  // Compared as a string, so a filter array rebuilt each render is still the same list.
  const key = resetKey == null ? '' : typeof resetKey === 'object' ? JSON.stringify(resetKey) : String(resetKey)
  const [shown, setShown] = useState({ key, n: page })
  const same = shown.key === key
  if (!same) setShown({ key, n: page })
  const n = same ? shown.n : page
  const visible = useMemo(() => items.slice(0, n), [items, n])
  const hasMore = items.length > n
  return {
    visible,
    hasMore,
    total: items.length,
    pageSize: page,
    more: () => setShown(s => ({ key, n: (s.key === key ? s.n : page) + page })),
  }
}

/** The nearest ancestor that scrolls - <main> in this app, a sheet's body in a sheet. @param {HTMLElement} el */
function scroller(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if (oy === 'auto' || oy === 'scroll') return p
  }
  return null
}

/**
 * The bottom of a growing list: asks for the next page as it comes within
 * LOOKAHEAD of the screen, and says the list is complete once it is - when
 * it was ever longer than a page, so a short list does not end on a caption.
 *
 * @param {{list: ReturnType<typeof useInfiniteList>, done?: string, className?: string}} props
 */
export function ListEnd({ list, done, className = '' }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  const { hasMore, more, visible } = list
  const count = visible.length

  useEffect(() => {
    const el = ref.current
    if (!hasMore || !el || typeof IntersectionObserver === 'undefined') return
    /* Re-made after every page: an observer only calls back when the marker
       crosses the edge, and after a short page it may still be inside it -
       a fresh one reports that straight away, and the next page follows. */
    const io = new IntersectionObserver(
      (entries) => { if (entries.some(e => e.isIntersecting)) more() },
      { root: scroller(el), rootMargin: `0px 0px ${LOOKAHEAD}px 0px` },
    )
    io.observe(el)
    return () => io.disconnect()
    // `more` is a new function each render; the page it adds is the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, count])

  if (hasMore) return <div ref={ref} aria-hidden="true" className="h-px" />
  if (!done || list.total <= list.pageSize) return null
  return (
    <p className={`py-4 text-center text-11 text-slate-400 dark:text-slate-500 ${className}`}>{done}</p>
  )
}
