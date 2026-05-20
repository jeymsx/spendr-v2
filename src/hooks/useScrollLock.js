import { useEffect } from 'react'

/**
 * Locks the main scroll container while a sheet is open.
 * Prevents iOS Safari from scrolling the background through the sheet overlay.
 */
export function useScrollLock(active) {
  useEffect(() => {
    const el = document.getElementById('app-main')
    if (!el) return
    if (active) {
      el.classList.add('scroll-locked')
    } else {
      el.classList.remove('scroll-locked')
    }
    return () => el.classList.remove('scroll-locked')
  }, [active])
}
