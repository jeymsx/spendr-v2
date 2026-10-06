import { useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { usePageScroll } from './pageScroll'

/**
 * A phone page shown in the desktop's frame: a settings page, a form, a
 * detail the desktop has no page of its own for.
 *
 * Same scroller and gutters as a desktop Page, and the phone page's own
 * header (components/PageHeader) restyled into a desktop one - its title at
 * the left at 22px, its back button a small bordered square (pro.css,
 * `.d-phone`). Its cards are already on the desktop's ground.
 *
 * `top`: a page the sidebar or the top bar opens (Notifications, a recap) -
 * there is nothing behind it to go back to, so its back button goes.
 *
 * @param {{children: import('react').ReactNode, width?: number, top?: boolean}} props
 */
export default function PhonePage({ children, width = 760, top = false }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  const { pathname } = useLocation()
  usePageScroll(ref, pathname)
  return (
    <div id="app-main" ref={ref} className="d-page">
      <div className={`d-page-inner d-phone${top ? ' is-top' : ''}`} style={{ maxWidth: width }}>{children}</div>
    </div>
  )
}
