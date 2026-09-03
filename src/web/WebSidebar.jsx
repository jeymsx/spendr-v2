import { NavLink } from 'react-router-dom'
import { useLiveQuery } from '../hooks/useLiveQuery'
import db from '../db/db'
import { setViewMode } from './useViewMode'
import WebAddMenu from './WebAddMenu'
import {
  WebIconHome, WebIconList, WebIconWallet, WebIconChart,
  WebIconHandshake, WebIconRepeat, WebIconSettings, WebIconImport,
  WebIconPhone,
} from './WebIcons'

const MAIN = [
  { to: '/',             label: 'Home',         Icon: WebIconHome },
  { to: '/transactions', label: 'Transactions', Icon: WebIconList },
  { to: '/accounts',     label: 'Accounts',     Icon: WebIconWallet },
  { to: '/insights',     label: 'Insights',     Icon: WebIconChart },
  { to: '/debts',        label: 'Debts',        Icon: WebIconHandshake },
  { to: '/recurring',    label: 'Recurring',    Icon: WebIconRepeat },
]

const SECONDARY = [
  { to: '/import',   label: 'Import',   Icon: WebIconImport },
  { to: '/settings', label: 'Settings', Icon: WebIconSettings },
]

function NavItem({ to, label, Icon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => [
        'flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium',
        'transition-colors duration-150',
        isActive
          ? 'bg-primary/[0.12] text-primary dark:bg-primary/[0.18]'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-slate-200',
      ].join(' ')}
    >
      <span className="shrink-0"><Icon /></span>
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

export default function WebSidebar() {
  const nameMeta = useLiveQuery(() => db.meta.get('displayName'), [], null)
  const name = nameMeta?.value || 'there'

  return (
    <aside
      className="shrink-0 w-[248px] h-full flex flex-col
        border-r border-slate-200/70 dark:border-white/[0.06]
        bg-white/80 dark:bg-navy/60 backdrop-blur-xl"
    >
      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <span
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ background: 'var(--color-primary)' }}
          >
            S
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-white leading-tight">Spendr</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{name}</p>
          </div>
        </div>
      </div>

      {/* Primary action. Hovering reveals the three transaction types, so a
          form is one hover and one click away — no intermediate dialog. */}
      <div className="px-4 pb-4">
        <WebAddMenu />
      </div>

      {/* Nav */}
      <nav className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-3 flex flex-col gap-0.5">
        {MAIN.map(i => <NavItem key={i.to} {...i} />)}
        <div className="h-px bg-slate-200/70 dark:bg-white/[0.06] my-3 mx-3" />
        {SECONDARY.map(i => <NavItem key={i.to} {...i} />)}
      </nav>

      {/* Escape hatch back to the phone layout. Lives here rather than in the
          mobile Settings page so the existing UI needed no changes. */}
      <div className="px-3 py-4 border-t border-slate-200/70 dark:border-white/[0.06]">
        <button
          onClick={() => setViewMode('mobile')}
          className="w-full flex items-center gap-3 px-3 h-9 rounded-xl text-xs font-medium
            text-slate-500 hover:bg-slate-100 hover:text-slate-700
            dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-slate-200
            transition-colors duration-150"
        >
          <WebIconPhone />
          Switch to mobile view
        </button>
      </div>
    </aside>
  )
}
