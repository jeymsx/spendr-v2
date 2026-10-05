import { Suspense, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ErrorBoundary from '../../components/ErrorBoundary'

/**
 * The two ways a desktop page is laid out. Every page inside them is the
 * phone's own page component, so a feature added there is here too.
 *
 * ── The scroll area is #app-main ──
 *
 * The phone's pages find their scroll container by that id - Insights puts
 * its scroll back after a page it opened, Debts scrolls to a person, an
 * infinite list watches it - so the desktop's scroller carries the same id.
 * In a split view that is the LIST pane, the one those pages live in.
 */

/**
 * Every split view's two widths: the list, and the most the page beside it
 * stretches to. One pair for Accounts, Insights, Budget, Goals, Recurring,
 * Debts, Notes and Settings, so moving between them the line between the
 * halves stays where it was. The single-column pages start at the same left
 * edge and run to the same width as a list and its page together.
 */
export const LIST_WIDTH = 400
export const DETAIL_WIDTH = 800

function PaneSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[50dvh]">
      <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

/**
 * One column, centred, scrolling: Home, Transactions, and the single-task
 * pages. `width` is the column's cap - a form reads worst stretched.
 *
 * `top` is for a page the sidebar opens (Notifications, Achievements): on
 * the phone it hangs off Home, so it has a back button, and here it is a
 * place of its own with nothing to go back to.
 *
 * `start`: the column sits at the left, where a split view's list does,
 * rather than in the middle of the window - a page the sidebar opens, read
 * beside the others, kept its own place.
 *
 * @param {{width?: number, children: import('react').ReactNode, className?: string, pad?: boolean, top?: boolean, start?: boolean}} props
 */
export function WebScroll({ width = 1200, children, className = '', pad = true, top = false, start = false }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  const location = useLocation()
  // A new page starts at its top, as the phone's do.
  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = 0 }, [location.pathname])
  return (
    <div id="app-main" ref={ref} className="web-scroll h-full overflow-y-auto overflow-x-hidden" data-top={top ? 'true' : undefined}>
      <div className={`web-column ${start ? '' : 'mx-auto'} w-full ${pad ? 'px-8 py-6' : ''} ${className}`} style={{ maxWidth: width }}>
        {children}
      </div>
    </div>
  )
}

/**
 * A list and the thing picked in it, side by side - the landscape layout
 * for everything that is a list on the phone. Both halves scroll on their
 * own. The right half is the nested route (an <Outlet/>), so the phone's
 * own links - navigate('/accounts/12') - pick what it shows, and the list
 * stays mounted as they do.
 *
 * `isRoot` says whether the page on the right is the first thing past the
 * list (an account) rather than a step further in (editing it): a first
 * thing has nothing to go back to on the right, so its back button is
 * hidden (the `subpage-back` hook, in web.css).
 *
 * `selected` is a selector for the list item open on the right, for the
 * list to ring - a `[data-web-id]` hook on the phone's rows, or Insights'
 * own `[data-zoom]`.
 *
 * Each half has its own Suspense and error boundary: the right half loading
 * or failing leaves the list where it is.
 *
 * @param {{list: import('react').ReactNode, listWidth?: number, detailWidth?: number,
 *          isRoot?: (pathname: string) => boolean, selected?: string|null,
 *          label?: string}} props
 */
export function WebSplit({ list, listWidth = LIST_WIDTH, detailWidth = DETAIL_WIDTH, isRoot = () => true, selected = null, label }) {
  const location = useLocation()
  const detailRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  useLayoutEffect(() => { if (detailRef.current) detailRef.current.scrollTop = 0 }, [location.pathname])
  return (
    <div className="web-split h-full flex">
      {selected && (
        /* A ring drawn inside the row, rounded like the card it sits in. An
           outline was square, and the card's rounded corners clipped it -
           a lone note's ring lost its corners. */
        <style>{`.web-pane-list ${selected}{border-radius:16px;box-shadow:inset 0 0 0 2px color-mix(in srgb, var(--color-primary) 70%, transparent);background-color:rgba(var(--color-primary-rgb),0.08)}`}</style>
      )}
      <div
        id="app-main"
        className="web-pane web-pane-list h-full overflow-y-auto overflow-x-hidden shrink-0"
        style={{ width: listWidth }}
        aria-label={label}
      >
        <Suspense fallback={<PaneSpinner />}>{list}</Suspense>
      </div>
      <div
        ref={detailRef}
        className="web-pane web-pane-detail flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden"
        data-root={isRoot(location.pathname) ? 'true' : 'false'}
      >
        <div className="mx-auto w-full" style={{ maxWidth: detailWidth }}>
          <ErrorBoundary compact resetKeys={[location.pathname]}>
            <Suspense fallback={<PaneSpinner />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
