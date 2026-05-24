import { useEffect } from 'react'

/**
 * Locks the main scroll container while a sheet is open.
 * Uses a module-level reference count so nested sheets don't prematurely
 * release the lock when an inner sheet closes while an outer one is still open.
 */
let _lockCount = 0

export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return
    const el = document.getElementById('app-main')
    _lockCount++
    if (el) el.classList.add('scroll-locked')
    return () => {
      _lockCount = Math.max(0, _lockCount - 1)
      if (_lockCount === 0 && el) el.classList.remove('scroll-locked')
    }
  }, [active])
}
