import { useState } from 'react'

/**
 * `.swap-in` - a figure resolving out of a short blur - once `value` has
 * changed since this mounted, and nothing before.
 *
 * For the eye buttons: tap one and every figure it hides or shows swaps
 * through the blur instead of changing in a frame. But only after a tap. A
 * screen that opens with its figures masked should not open by blurring its
 * own dots in, and one that opens showing them should just show them.
 *
 * Put the class on the element that holds the figure AND key that element
 * by `value`, so each change is a fresh element and the animation plays
 * again - the dots and the number are two different things, and the new one
 * arrives where the old one was.
 *
 * State adjusted during render rather than an effect, so the first frame of
 * the change already carries the class.
 *
 * @param {unknown} value  usually whether the figures are hidden
 * @returns {'' | 'swap-in'}
 */
export function useSwap(value) {
  const [last, setLast] = useState(value)
  const [changed, setChanged] = useState(false)
  if (last !== value) {
    setLast(value)
    setChanged(true)
  }
  return changed ? 'swap-in' : ''
}
