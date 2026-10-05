import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * A desktop page: the area under the top bar that scrolls, with the same
 * gutters and the same header on every page.
 *
 * The header is the page's name, an optional line under it, and its actions
 * at the right - one primary button at most, the rest secondary or ghost.
 * `media` is a picture beside the name and the line together (an account's
 * tile). Below it, the page's panels.
 *
 * The scroller is #app-main, as every desktop page's is: the phone pages
 * still shown in the desktop find their scroll container by that id.
 *
 * @param {{title?: import('react').ReactNode, subtitle?: import('react').ReactNode,
 *          eyebrow?: import('react').ReactNode, actions?: import('react').ReactNode, media?: import('react').ReactNode,
 *          width?: number, children: import('react').ReactNode, className?: string,
 *          scrollKey?: string}} props
 */
export default function Page({ title, subtitle, eyebrow, actions, media, width = 1400, children, className = '', scrollKey }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  const location = useLocation()
  const top = scrollKey ?? location.pathname
  // A new page starts at its top.
  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = 0 }, [top])
  return (
    <div id="app-main" ref={ref} className="d-page">
      <div className={`d-page-inner ${className}`} style={{ maxWidth: width }}>
        {(title || actions) && (
          <header className="d-page-head">
            <div className="min-w-0">
              {eyebrow && <div className="d-eyebrow">{eyebrow}</div>}
              <div className="flex items-center gap-4 min-w-0">
                {media && <div className="shrink-0">{media}</div>}
                <div className="min-w-0">
                  {title && <h1 className="d-title truncate">{title}</h1>}
                  {subtitle && <div className="d-subtitle">{subtitle}</div>}
                </div>
              </div>
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </header>
        )}
        {children}
      </div>
    </div>
  )
}
