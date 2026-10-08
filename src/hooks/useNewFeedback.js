import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useIsDeveloper } from './useIsDeveloper'
import { countNewFeedback } from '../lib/feedback'
import { isSupabaseConfigured } from '../lib/supabase'

/**
 * How many reports are waiting to be read, for the developer's Settings row -
 * looked up when Settings opens and when the app comes back to the front.
 * Null for everyone else, and while it is not known.
 *
 * @returns {number|null}
 */
export function useNewFeedback() {
  const developer = useIsDeveloper()
  const { user } = useAuth()
  const [count, setCount] = useState(/** @type {number|null} */ (null))
  const able = developer && !!user && isSupabaseConfigured

  useEffect(() => {
    if (!able) return
    let live = true
    const look = () => countNewFeedback().then(n => { if (live) setCount(n) }, () => {})
    look()
    const onVisible = () => { if (document.visibilityState === 'visible') look() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { live = false; document.removeEventListener('visibilitychange', onVisible) }
  }, [able])

  return able ? count : null
}
