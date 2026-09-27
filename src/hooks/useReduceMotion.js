import { useSyncExternalStore } from 'react'
import { onReducedMotionChange, prefersReducedMotion, reduceMotionChosen } from '../components/ui/motion'

/**
 * Whether motion should be reduced, live: the phone's Reduce Motion or the
 * switch in Preferences, either one. For what React draws; code that runs
 * once per gesture reads prefersReducedMotion() instead.
 *
 * In place of Motion's own useReducedMotion, which only knows the phone.
 */
export function useReduceMotion() {
  return useSyncExternalStore(onReducedMotionChange, prefersReducedMotion, () => false)
}

/** Whether the switch in Preferences is on, live - not the phone's setting. */
export function useReduceMotionChosen() {
  return useSyncExternalStore(onReducedMotionChange, reduceMotionChosen, () => false)
}
