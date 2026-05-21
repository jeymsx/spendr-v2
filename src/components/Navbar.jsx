import { NavLink, useLocation } from 'react-router-dom'

/* ── SVG icon primitives ───────────────────────────────── */
function IconHome({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.12 : 0} />
      <polyline points="9 21 9 12 15 12 15 21" />
    </svg>
  )
}

function IconList({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="3" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.12 : 0} />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="13" x2="14" y2="13" />
      <line x1="7" y1="17" x2="11" y2="17" />
    </svg>
  )
}

function IconChart({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="14" width="4" height="7" rx="1" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.25 : 0} />
      <rect x="10" y="9" width="4" height="12" rx="1" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.25 : 0} />
      <rect x="17" y="4" width="4" height="17" rx="1" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.25 : 0} />
    </svg>
  )
}

function IconGear({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.25 : 0} />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

/* ── Navbar ────────────────────────────────────────────── */
const LEFT_TABS = [
  { path: '/',             label: 'Home',         Icon: IconHome  },
  { path: '/transactions', label: 'Transactions',  Icon: IconList  },
]
const RIGHT_TABS = [
  { path: '/insights',     label: 'Insights',     Icon: IconChart },
  { path: '/settings',     label: 'Settings',     Icon: IconGear  },
]

function Tab({ path, label, Icon }) {
  const location = useLocation()
  const HOME_SECONDARY = ['/accounts', '/debts', '/recurring', '/import']
  const active = path === '/'
    ? location.pathname === '/' || HOME_SECONDARY.some(p => location.pathname.startsWith(p))
    : location.pathname.startsWith(path)

  return (
    <NavLink
      to={path}
      className="flex flex-col items-center gap-0.5 flex-1 py-2 transition-colors duration-150"
      style={{ color: active ? 'var(--color-primary)' : undefined }}
    >
      <span className={active ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}>
        <Icon active={active} />
      </span>
      <span
        className={`text-[10px] font-medium tracking-wide ${
          active ? 'text-primary' : 'text-slate-400 dark:text-slate-500'
        }`}
      >
        {label}
      </span>
    </NavLink>
  )
}

export default function Navbar({ onAddClick }) {
  return (
    <nav
      className={[
        'fixed bottom-0 inset-x-0 z-50',
        'flex items-center justify-around',
        'px-2',
        'bg-white/90 border-t border-slate-200/70',
        'dark:bg-navy/90 dark:border-white/[0.06]',
        'backdrop-filter backdrop-blur-xl',
      ].join(' ')}
      style={{ paddingTop: '8px', paddingBottom: '8px' }}
    >
      {/* left tabs */}
      {LEFT_TABS.map(t => (
        <Tab key={t.path} {...t} />
      ))}

      {/* center add button */}
      <div className="flex flex-col items-center flex-1">
        <button
          onClick={onAddClick}
          aria-label="Add transaction"
          className={[
            'w-14 h-14 rounded-full -mt-7',
            'flex items-center justify-center',
            'active:scale-95 transition-transform duration-100',
            'border-4 border-white dark:border-navy',
          ].join(' ')}
          style={{ background: 'var(--color-primary)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-0.5">Add</span>
      </div>

      {/* right tabs */}
      {RIGHT_TABS.map(t => (
        <Tab key={t.path} {...t} />
      ))}
    </nav>
  )
}
