import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useSyncManager } from '../components/SyncManager'
import { syncedLabel } from '../pages/settings/shared'
import { useAddFlow } from './addFlowContext'
import { usePalette } from './paletteContext'
import { setViewMode } from './useViewMode'
import Btn from './ui/Button'
import Popover, { MenuItem, MenuSep, MenuLabel } from './ui/Popover'
import { MOD } from './ui/controls'
import {
  ISearch, IPlus, IChevronDown, IBell, IArrowUpRight, IArrowDownLeft, ITransfer, IZap, IUser, ISettings,
  ISun, IMoon, IPhone, IRefresh,
} from './ui/icons'

const NotificationsPopover = lazy(() => import('./NotificationsPopover'))

/**
 * The bar across the top of every desktop page: search on the left; on the
 * right where the ledger stands with the cloud, the bell, the one way to add
 * anything, and you.
 *
 * Search opens the command palette (CommandPalette.jsx). The add menu holds
 * the three forms and quick log, each with its key (E, I, T, Q work from
 * anywhere). The bell drops the newest notifications (NotificationsPopover).
 * Your menu holds the theme, the phone layout and the way to Settings.
 */
export default function WebTopBar() {
  const { openPalette } = usePalette()
  return (
    <header className="d-topbar">
      <button type="button" className="d-search-trigger" onClick={() => openPalette()} aria-label="Search and commands">
        <ISearch size={17} />
        <span className="flex-1 text-left truncate">Search transactions, accounts, pages…</span>
        <kbd className="d-kbd">{MOD} K</kbd>
      </button>
      <div className="flex-1" />
      <SyncIndicator />
      <Bell />
      <AddMenu />
      <AccountMenu />
    </header>
  )
}

/** Where the ledger stands with the cloud: a dot and a word; a click syncs, or goes to sign in. */
function SyncIndicator() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { status, runSync } = useSyncManager()
  const lastSync = useLiveQuery(async () => (await db.meta.get('lastSync'))?.value ?? null, [], null)
  const signedIn = !!user?.id
  const syncing = status === 'syncing'
  const text = !signedIn ? 'Not syncing'
    : syncing ? 'Syncing…'
    : status === 'error' ? "Couldn't sync"
    : lastSync ? syncedLabel(lastSync) : 'Sync now'
  const dot = !signedIn ? 'bg-slate-400' : syncing ? 'bg-[var(--d-accent)] animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-emerald-500'
  return (
    <button
      type="button"
      disabled={syncing}
      onClick={() => (signedIn ? runSync() : navigate('/settings/sync'))}
      className="d-btn d-btn-ghost d-btn-sm gap-2 text-12 font-medium"
      title={signedIn ? 'Sync now' : 'Sign in to sync between devices'}
      aria-label={text}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span className="d-sync-label">{text}</span>
    </button>
  )
}

/** The bell: the unread count, and the newest notifications in a panel under it. */
function Bell() {
  const unread = useLiveQuery(() => db.notifications.where('read').equals(0).count(), [], 0)
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex" data-bell>
      <Btn
        variant="ghost"
        icon={<IBell size={17} />}
        label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => { import('./NotificationsPopover') }}
      />
      {unread > 0 && (
        <span aria-hidden="true" className="pointer-events-none absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-10 font-semibold leading-4 text-center tabular-nums ring-2 ring-[var(--d-panel)]">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
      {open && (
        <Suspense fallback={null}>
          <NotificationsPopover onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </span>
  )
}

/** The one way to add anything. */
function AddMenu() {
  const { openAdd } = useAddFlow()
  return (
    <Popover
      role="menu"
      label="Add"
      align="end"
      width={232}
      trigger={<Btn variant="primary" icon={<IPlus size={15} />} iconRight={<IChevronDown size={14} className="-mr-1 opacity-80" />}>Add</Btn>}
    >
      <MenuItem icon={<IArrowUpRight />} kbd="E" onSelect={() => openAdd('expense')}>Expense</MenuItem>
      <MenuItem icon={<IArrowDownLeft />} kbd="I" onSelect={() => openAdd('inflow')}>Inflow</MenuItem>
      <MenuItem icon={<ITransfer />} kbd="T" onSelect={() => openAdd('transfer')}>Transfer</MenuItem>
      <MenuSep />
      <MenuItem icon={<IZap />} kbd="Q" onSelect={() => openAdd('quick')}>Quick log</MenuItem>
    </Popover>
  )
}

/** You: your name, the theme, the phone layout, Settings. */
function AccountMenu() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()
  const nameMeta = useLiveQuery(() => db.meta.get('displayName'), [], null)
  const name = nameMeta?.value?.trim() || ''
  const initial = (name || user?.email || 'S').trim().charAt(0).toUpperCase()
  return (
    <Popover
      role="menu"
      label="Your account"
      align="end"
      width={248}
      trigger={
        <button type="button" className="ml-1 w-9 h-9 rounded-full flex items-center justify-center text-14 font-bold text-on-primary focus-visible:outline-none focus-visible:shadow-[var(--d-ring)]" style={{ background: 'var(--d-accent)' }} aria-label="Your account">
          {initial}
        </button>
      }
    >
      <div className="px-2.5 py-2">
        <div className="text-13 font-semibold text-[var(--d-text)] truncate">{name || 'You'}</div>
        <div className="text-12 text-[var(--d-text-3)] truncate">{user?.email ?? 'Not signed in'}</div>
      </div>
      <MenuSep />
      <MenuItem icon={<IUser />} onSelect={() => navigate('/settings/profile')}>Profile</MenuItem>
      <MenuItem icon={<ISettings />} onSelect={() => navigate('/settings/preferences')}>Settings</MenuItem>
      <MenuItem icon={<IRefresh />} onSelect={() => navigate('/settings/sync')}>{user?.id ? 'Sync' : 'Sign in to sync'}</MenuItem>
      <MenuSep />
      <MenuLabel>Theme</MenuLabel>
      <MenuItem icon={<ISun />} checked={theme !== 'dark'} onSelect={() => setTheme('light')}>Light</MenuItem>
      <MenuItem icon={<IMoon />} checked={theme === 'dark'} onSelect={() => setTheme('dark')}>Dark</MenuItem>
      <MenuSep />
      <MenuItem icon={<IPhone />} onSelect={() => setViewMode('mobile')}>Switch to mobile view</MenuItem>
    </Popover>
  )
}
