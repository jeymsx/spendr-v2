import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { APP_VERSION } from '../../lib/release'
import Page from '../ui/Page'
import {
  ISettings, IUser, ISliders, IPalette, ILock, IRefresh, ITag, IGauge, IZap, IGlobe, IDownload, IShield, ISparkle, ITrash,
} from '../ui/icons'

/**
 * Settings on a computer: the sections in a column of their own at the left,
 * the one open beside it - System Settings' shape, the way a desktop app's
 * preferences are laid out.
 *
 * The section pages are the phone's own (pages/settings/*), so a setting
 * added there is here; their headers become the right half's title (pro.css,
 * `.d-twopane-main`). "Overview" is the phone's Settings page itself, which
 * keeps what has no page of its own - your profile, Install, reminders,
 * duplicates, Report a problem, Privacy and terms, signing out.
 */
const GROUPS = [
  {
    label: 'You',
    items: [
      { to: '/settings', end: true, label: 'Overview', Icon: ISettings },
      { to: '/settings/profile', label: 'Profile', Icon: IUser },
    ],
  },
  {
    label: 'App',
    items: [
      { to: '/settings/preferences', label: 'Preferences', Icon: ISliders },
      { to: '/settings/accent', label: 'Accent colour', Icon: IPalette },
      { to: '/settings/app-lock', label: 'App lock', Icon: ILock },
      { to: '/settings/sync', label: 'Cloud sync', Icon: IRefresh },
    ],
  },
  {
    label: 'Money',
    items: [
      { to: '/settings/categories', label: 'Categories', Icon: ITag },
      { to: '/settings/budgets', label: 'Budget limits', Icon: IGauge },
      { to: '/settings/templates', label: 'Quick templates', Icon: IZap },
      { to: '/settings/rates', label: 'Exchange rates', Icon: IGlobe },
    ],
  },
  {
    label: 'Data',
    items: [
      { to: '/settings/reports', label: 'Reports & exports', Icon: IDownload },
      { to: '/settings/backup', label: 'Backup & restore', Icon: IShield },
      { to: '/transactions/deleted', label: 'Recently deleted', Icon: ITrash },
      { to: '/settings/changelog', label: 'What’s new', Icon: ISparkle },
    ],
  },
]

export default function WebSettings() {
  const { pathname } = useLocation()
  const index = pathname === '/settings' || pathname === '/settings/'
  return (
    <Page title="Settings" subtitle={`Spendr ${APP_VERSION}`} scrollKey={pathname}>
      <div className="d-twopane" style={{ '--side': '264px' }}>
        <nav className="d-twopane-side d-panel p-2" aria-label="Settings">
          {GROUPS.map(g => (
            <div key={g.label} className="pb-1">
              <div className="d-menu-label">{g.label}</div>
              {g.items.map(i => (
                <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `d-nav-item${isActive ? ' is-active' : ''}`}>
                  <span className="d-nav-icon" aria-hidden="true"><i.Icon size={17} /></span>
                  <span className="truncate">{i.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className={`d-twopane-main min-w-0${index ? ' is-index' : ''}`}>
          <Suspense fallback={<div className="h-40" />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </Page>
  )
}
