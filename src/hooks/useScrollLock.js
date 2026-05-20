import { useEffect } from 'react'

/**
 * Locks the main scroll container while a sheet is open.
 * CSS overflow:hidden prevents wheel/programmatic scroll.
 * Touch-scroll prevention is handled in the sheet components themselves
 * via `touch-action: none` on the fixed wrapper and `touch-action: pan-y`
 * on designated scroll containers — no JS touchmove listener needed.
 */
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return
    const el = document.getElementById('app-main')
    if (el) el.classList.add('scroll-locked')
    return () => {
      if (el) el.classList.remove('scroll-locked')
    }
  }, [active])
}
