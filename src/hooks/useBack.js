import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * A back button that goes back, and knows what to do when there is no back.
 *
 * `navigate(-1)` is right almost always: the Budget page is reached from the
 * dashboard card AND from Settings, and history takes you to whichever one you
 * came from without either caller having to say so.
 *
 * It is wrong in exactly one case - when the current page IS the first entry.
 * That happens more here than in a normal web app: this ships as an installed
 * PWA, so a deep link, a notification, or a reload on /budget can put you on a
 * screen with nothing behind it. `navigate(-1)` then walks out of the app
 * entirely, or does nothing at all, depending on the browser.
 *
 * React Router stamps the first entry of a session with key 'default', which
 * is the one reliable way to know. When that is where we are, go to the
 * fallback and REPLACE, so the back button does not bounce between the two.
 */
export function useBack(fallback = '/') {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    if (location.key === 'default') navigate(fallback, { replace: true })
    else navigate(-1)
  }, [navigate, location.key, fallback])
}

export default useBack
