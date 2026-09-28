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
/** @param {string} [fallback]  where Back goes with nothing behind it; the parent page by default */
export function useBack(fallback) {
  const navigate = useNavigate()
  const location = useLocation()
  const to = fallback ?? parentPath(location.pathname)

  return useCallback(() => {
    if (location.key === 'default') navigate(to, { replace: true })
    else navigate(-1)
  }, [navigate, location.key, to])
}

/* Where a page's parent is when the URL alone does not say: the one level up
   is not a page of its own for these. */
/** @type {Array<[RegExp, string]>} */
const PARENT = [
  [/^\/transactions\/[^/]+\/edit$/, '/transactions'],
  [/^\/debts\/person\/[^/]+$/, '/debts'],
  [/^\/categories\/[^/]+$/, '/budget'],
  [/^\/badges$/, '/achievements'],
]

/**
 * The page one level up - what Back means with nothing behind it.
 *
 * Most pages sit under their parent in the URL (/settings/profile under
 * /settings, /accounts/4/edit under /accounts/4), so the parent is the path
 * less its last part. The few whose parent is not in their URL are listed.
 *
 * @param {string} pathname
 */
export function parentPath(pathname) {
  for (const [re, to] of PARENT) if (re.test(pathname)) return to
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  return parts.length > 1 ? `/${parts.slice(0, -1).join('/')}` : '/'
}

export default useBack
