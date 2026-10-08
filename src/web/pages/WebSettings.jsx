import { Suspense } from 'react'
import { PaneSkeleton } from '../ui/Skeletons'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { APP_VERSION } from '../../lib/release'
import Page from '../ui/Page'
import {
  ISettings, IUser, ISliders, IRefresh, ITag, IGauge, IZap, IGlobe, IDownload, IShield, ISparkle, ITrash, IFileText, IHelp,
} from '../ui/icons'

/**
 * Settings on a computer: the sections in a column of their own at the left,
 * the one open beside it - System Settings' shape, the way a desktop app's
 * preferences are laid out.
 *
 * The section pages are the phone's own (pages/settings/*), so a setting
 * added there is here; their headers become the right half's title (pro.css,
 * `.d-twopane-main`). Two are the desktop's: "Overview" (WebSettingsOverview),
 * every section's state at a glance and what has no page of its own, and
 * Accent colour (WebSettingsAccent), a grid where the phone has a deck to
 * swipe, and Preferences (WebSettingsPreferences), the phone's with App lock
 * inside it. Recently deleted opens here too, in the right half, as the rest
 * do, and so do the privacy policy and the terms (WebSettingsPolicy), which
 * the phone shows in a sheet.
 */
/* `also`: the pages a row stands for besides its own - Accent colour opens
   from Preferences and App lock is part of it, and Privacy & terms is two
   pages. The row stays lit on them. */
const GROUPS = [
  {
    label: 'General',
    items: [
      { to: '/settings', end: true, label: 'Overview', Icon: ISettings },
      { to: '/settings/profile', label: 'Profile', Icon: IUser },
      { to: '/settings/preferences', label: 'Preferences', Icon: ISliders, also: ['/settings/accent', '/settings/app-lock'] },
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
      { to: '/settings/deleted', label: 'Recently deleted', Icon: ITrash },
    ],
  },
  {
    label: 'About',
    items: [
      // Its own page, wide, rather than a pane in here (pages/WebHelp).
      { to: '/help', label: 'Help centre', Icon: IHelp },
      { to: '/settings/changelog', label: 'What’s new', Icon: ISparkle },
      { to: '/settings/privacy', label: 'Privacy & terms', Icon: IFileText, also: ['/settings/terms'] },
    ],
  },
]

export default function WebSettings() {
  const { pathname } = useLocation()
  return (
    <Page title="Settings" subtitle={`Spendr ${APP_VERSION}`} scrollKey={pathname}>
      <div className="d-twopane" style={{ '--side': '264px' }}>
        <nav className="d-twopane-side d-panel p-2" aria-label="Settings">
          {GROUPS.map(g => (
            <div key={g.label} className="pb-1">
              <div className="d-menu-label">{g.label}</div>
              {g.items.map(i => (
                <NavLink key={i.to} to={i.to} end={i.end}
                  className={({ isActive }) => `d-nav-item${isActive || i.also?.some(p => pathname.startsWith(p)) ? ' is-active' : ''}`}>
                  <span className="d-nav-icon" aria-hidden="true"><i.Icon size={17} /></span>
                  <span className="truncate">{i.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="d-twopane-main min-w-0">
          <Suspense fallback={<PaneSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </Page>
  )
}
