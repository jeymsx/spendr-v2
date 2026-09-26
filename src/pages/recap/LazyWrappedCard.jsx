import { lazy, Suspense } from 'react'

/** Fetched on first use - see below. */
const load = () => import('./WrappedCard')
const WrappedCard = lazy(load)

/**
 * The Wrapped card, loaded only when it is shown.
 *
 * Home is the landing route and is in the first bundle; the card brings the
 * story's animation library and its picture-drawing with it, which nobody
 * needs on the other twenty-eight days of the month. `preloadWrappedCard`
 * lets a page start the fetch as soon as it knows the card is coming, while
 * its own data is still being read, so the card is usually there by the time
 * the page is.
 *
 * The placeholder holds the card's usual height, so the page under it does
 * not jump when it arrives.
 *
 * @param {{month: string, className?: string}} props
 */
export default function LazyWrappedCard(props) {
  return (
    <Suspense fallback={<div className={props.className} aria-hidden="true"><div className="h-[304px]" /></div>}>
      <WrappedCard {...props} />
    </Suspense>
  )
}

/** Start fetching the card's code now. Safe to call as often as you like. */
export function preloadWrappedCard() {
  load().catch(() => {})
}
