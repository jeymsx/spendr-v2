import { useCallback, useEffect, useRef, useState } from 'react'
import { createGuard, leaveThen } from '../lib/backGuard'

/**
 * Answer system Back while `active` (lib/backGuard.js). `onBack` runs when
 * Back is pressed with this on top; return 'stay' to keep answering it - a
 * sheet that cannot be dismissed while it saves.
 *
 * Arming waits a tick, so StrictMode's rehearsal mount in development, which
 * runs every effect twice, cannot push two entries for one sheet.
 *
 * @param {boolean} active
 * @param {() => ('stay'|void)} onBack
 * @param {{form?: boolean}} [opts]
 */
export function useBackGuard(active, onBack, { form = false } = {}) {
  const onBackRef = useRef(onBack)
  useEffect(() => { onBackRef.current = onBack })
  const guardRef = useRef(/** @type {ReturnType<typeof createGuard>|null} */ (null))

  useEffect(() => {
    /** @type {ReturnType<typeof createGuard>} */
    const g = createGuard({
      form,
      onBack: () => { if (onBackRef.current?.() === 'stay') g.set(true) },
    })
    guardRef.current = g
    return () => { g.drop(); guardRef.current = null }
  }, [form])

  useEffect(() => {
    const g = guardRef.current
    if (!g) return
    if (!active) { g.set(false); return }
    const t = setTimeout(() => g.set(true), 0)
    return () => clearTimeout(t)
  }, [active])
}

/**
 * Whether a form's fields have moved since it was filled in - for a form
 * that loads its values (an edit) or sets defaults a moment after it opens.
 * The first `values` seen once `ready` is true are the baseline; anything
 * different from them after is a change. `ready` going false starts over.
 *
 * @param {unknown[]} values
 * @param {boolean} ready
 */
export function useChangedSince(values, ready) {
  const key = JSON.stringify(values)
  const [base, setBase] = useState(/** @type {string|null} */ (null))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!ready) { setBase(null); return }
    setBase(b => (b === null ? key : b))
  }, [ready, key])
  return ready && base !== null && key !== base
}

/**
 * A page-sized form that asks before its input is thrown away - by its Back
 * button, the edge swipe (which presses that button) or system Back.
 *
 * `tryLeave()` goes back at once when nothing would be lost, and otherwise
 * asks (render <DiscardSheet open={asking} onKeep={keep} onDiscard={discard}>).
 * `leave(fn)` is for leaving on purpose, after a save: it takes the guard's
 * history entry off first, so the navigation that follows leaves the page
 * rather than spending that entry - or replacing it, which left the form in
 * the history for Back to reopen.
 *
 * @param {boolean} dirty      whether anything would be lost
 * @param {() => void} goBack  the form's own way back
 */
export function useLeaveGuard(dirty, goBack) {
  const [asking, setAsking] = useState(false)
  const goBackRef = useRef(goBack)
  useEffect(() => { goBackRef.current = goBack })

  // System Back, with something typed: the question, not the page behind.
  useBackGuard(dirty && !asking, () => { setAsking(true) }, { form: true })

  const leave = useCallback((/** @type {() => void} */ fn) => leaveThen(fn), [])

  const tryLeave = useCallback(() => {
    if (dirty) setAsking(true)
    else leaveThen(() => goBackRef.current?.())
  }, [dirty])

  const keep = useCallback(() => setAsking(false), [])
  const discard = useCallback(() => {
    setAsking(false)
    leaveThen(() => goBackRef.current?.())
  }, [])

  return { asking, tryLeave, leave, keep, discard }
}
