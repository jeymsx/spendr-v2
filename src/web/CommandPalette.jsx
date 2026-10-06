import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useTheme } from '../context/ThemeContext'
import { useSyncManager } from '../components/SyncManager'
import { useAuth } from '../context/AuthContext'
import { searchEverything, txMatches } from '../lib/search'
import { txRowWords } from '../lib/txRow'
import { amountDisplay } from '../lib/txMoney'
import { fmt } from '../lib/money'
import { useAddFlow } from './addFlowContext'
import { PaletteContext } from './paletteContext'
import { setViewMode } from './useViewMode'
import { AccountTile, CategoryTile } from './ui/display'
import {
  ISearch, IHome, IList, IWallet, IChart, IGauge, ITarget, IRepeat, IUsers, INote, ITrophy, IImport, ISettings,
  IArrowUpRight, IArrowDownLeft, ITransfer, IZap, IPlus, IMoon, ISun, IPhone, IRefresh, ICornerDownLeft, ITag, IBell,
  ISliders, ILock, IPalette, IFileText,
} from './ui/icons'

/**
 * Search everything, go anywhere, do anything: Ctrl+K (⌘K on a Mac), or /,
 * or the field in the top bar.
 *
 * Empty, it lists the pages and the things you can start. Typed into, it
 * finds pages and actions by name, then accounts, categories, bills, goals
 * and people (lib/search.js, the phone's own search), then the newest
 * transactions that match - by what they say, their category, account or
 * amount - and the way to all of them in Transactions.
 */


/** @param {{children: import('react').ReactNode}} props */
export function CommandProvider({ children }) {
  const [open, setOpen] = useState(false)
  const [initial, setInitial] = useState('')
  const openPalette = useCallback((/** @type {string} */ q = '') => { setInitial(q); setOpen(true) }, [])

  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.defaultPrevented) return
      const k = e.key.toLowerCase()
      const typing = (() => {
        const el = /** @type {HTMLElement|null} */ (e.target)
        return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      })()
      if ((e.ctrlKey || e.metaKey) && k === 'k') {
        e.preventDefault()
        setInitial('')
        setOpen(o => !o)
        return
      }
      if (k === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('[role="dialog"], .sheet-panel')) {
        e.preventDefault()
        setInitial('')
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <PaletteContext.Provider value={{ openPalette }}>
      {children}
      {open && <CommandPalette initial={initial} onClose={() => setOpen(false)} />}
    </PaletteContext.Provider>
  )
}

/**
 * @typedef {{id: string, group: string, label: string, meta?: string, icon: import('react').ReactNode,
 *            kbd?: string, run: () => void, keywords?: string}} Item
 */

const PAGES = [
  { to: '/', label: 'Home', Icon: IHome },
  { to: '/transactions', label: 'Transactions', Icon: IList },
  { to: '/accounts', label: 'Accounts', Icon: IWallet },
  { to: '/insights', label: 'Insights', Icon: IChart, keywords: 'reports spending trend net worth forecast' },
  { to: '/budget', label: 'Budget', Icon: IGauge, keywords: 'limits categories' },
  { to: '/goals', label: 'Goals', Icon: ITarget, keywords: 'savings' },
  { to: '/recurring', label: 'Recurring', Icon: IRepeat, keywords: 'bills subscriptions income' },
  { to: '/debts', label: 'Debts', Icon: IUsers, keywords: 'people owe lend borrow' },
  { to: '/notes', label: 'Notes', Icon: INote },
  { to: '/achievements', label: 'Achievements', Icon: ITrophy, keywords: 'badges streaks challenges' },
  { to: '/notifications', label: 'Notifications', Icon: IBell },
  { to: '/import', label: 'Import', Icon: IImport, keywords: 'csv' },
  { to: '/settings', label: 'Settings', Icon: ISettings, keywords: 'overview profile' },
  { to: '/settings/preferences', label: 'Preferences', Icon: ISliders, keywords: 'settings theme dark light style' },
  { to: '/settings/preferences#app-lock', label: 'App lock', Icon: ILock, keywords: 'settings security face id passkey pin' },
  { to: '/settings/accent', label: 'Accent colour', Icon: IPalette, keywords: 'settings color theme' },
  { to: '/settings/privacy', label: 'Privacy & terms', Icon: IFileText, keywords: 'settings policy legal' },
  { to: '/settings/categories', label: 'Categories', Icon: ITag, keywords: 'settings' },
  { to: '/settings/budgets', label: 'Budget limits', Icon: IGauge, keywords: 'settings edit budgets' },
  { to: '/settings/backup', label: 'Backup and restore', Icon: ISettings, keywords: 'export' },
  { to: '/settings/sync', label: 'Sync', Icon: IRefresh, keywords: 'sign in account cloud' },
]

/** @param {string} s @param {string} q */
const hit = (s, q) => s.toLowerCase().includes(q)

/** @param {{initial: string, onClose: () => void}} props */
function CommandPalette({ initial, onClose }) {
  const navigate = useNavigate()
  const { openAdd } = useAddFlow()
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()
  const { runSync } = useSyncManager()
  const [q, setQ] = useState(initial)
  const [active, setActive] = useState(0)
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null))
  const listRef = useRef(/** @type {HTMLDivElement|null} */ (null))

  useEffect(() => { inputRef.current?.focus() }, [])

  const data = useLiveQuery(async () => {
    const [accounts, categories, recurring, goals, debts, txs] = await Promise.all([
      db.accounts.toArray(), db.categories.toArray(), db.recurring.toArray(),
      db.goals.toArray(), db.debts.toArray(), db.transactions.orderBy('date').reverse().toArray(),
    ])
    return { accounts, categories, recurring, goals, debts, txs }
  }, [], null)

  const go = useCallback((/** @type {string} */ to) => { onClose(); navigate(to) }, [navigate, onClose])

  const actions = useMemo(() => /** @type {Item[]} */ ([
    { id: 'a-expense', group: 'Create', label: 'Add an expense', icon: <IArrowUpRight />, kbd: 'E', run: () => { onClose(); openAdd('expense') }, keywords: 'new spend' },
    { id: 'a-inflow', group: 'Create', label: 'Add an inflow', icon: <IArrowDownLeft />, kbd: 'I', run: () => { onClose(); openAdd('inflow') }, keywords: 'new income' },
    { id: 'a-transfer', group: 'Create', label: 'Add a transfer', icon: <ITransfer />, kbd: 'T', run: () => { onClose(); openAdd('transfer') }, keywords: 'new move' },
    { id: 'a-quick', group: 'Create', label: 'Quick log', icon: <IZap />, kbd: 'Q', run: () => { onClose(); openAdd('quick') }, keywords: 'type' },
    { id: 'a-account', group: 'Create', label: 'New account', icon: <IPlus />, run: () => go('/accounts/new'), keywords: 'add wallet bank card' },
    { id: 'a-recurring', group: 'Create', label: 'New recurring bill or income', icon: <IPlus />, run: () => go('/recurring/new'), keywords: 'add subscription' },
    { id: 'p-theme', group: 'Preferences', label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', icon: theme === 'dark' ? <ISun /> : <IMoon />, run: () => { setTheme(theme === 'dark' ? 'light' : 'dark'); onClose() }, keywords: 'theme appearance' },
    { id: 'p-mobile', group: 'Preferences', label: 'Switch to mobile view', icon: <IPhone />, run: () => { onClose(); setViewMode('mobile') }, keywords: 'phone layout' },
    user?.id
      ? { id: 'p-sync', group: 'Preferences', label: 'Sync now', icon: <IRefresh />, run: () => { onClose(); runSync() }, keywords: 'cloud' }
      : { id: 'p-sync', group: 'Preferences', label: 'Sign in to sync', icon: <IRefresh />, run: () => go('/settings/sync'), keywords: 'cloud account' },
  ]), [theme, setTheme, onClose, openAdd, go, user?.id, runSync])

  const items = useMemo(() => {
    const query = q.trim().toLowerCase()
    /** @type {Item[]} */
    const out = []
    const pages = PAGES.map(p => ({
      id: `page-${p.to}`, group: 'Go to', label: p.label, icon: <p.Icon />, run: () => go(p.to), keywords: p.keywords ?? '',
    }))
    if (!query) return [...pages.slice(0, 9), ...actions]

    out.push(...pages.filter(p => hit(p.label, query) || hit(p.keywords, query)))
    out.push(...actions.filter(a => hit(a.label, query) || hit(a.keywords ?? '', query)))
    if (data) {
      const acctByName = new Map(data.accounts.map(a => [a.name, a]))
      const catByName = new Map(data.categories.map(c => [c.name, c]))
      for (const g of searchEverything(query, data, 4)) {
        for (const it of g.items) {
          const icon = g.group === 'Accounts' ? <AccountTile account={acctByName.get(it.label)} size="sm" />
            : g.group === 'Categories' ? <CategoryTile cat={catByName.get(it.label)} size="sm" />
            : g.group === 'Goals' ? <ITarget />
            : g.group === 'Recurring' ? <IRepeat />
            : <IUsers />
          out.push({ id: `${g.group}-${it.id}`, group: g.group, label: it.label, meta: it.meta ?? undefined, icon, run: () => go(it.to) })
        }
      }
      if (query.length >= 2) {
        const txs = data.txs.filter(t => txMatches(t, query)).slice(0, 8)
        for (const t of txs) {
          const cat = t.category ? catByName.get(t.category) : null
          const { title, where } = txRowWords(t, cat)
          const { sign, magnitude, currency } = amountDisplay(t)
          out.push({
            id: `tx-${t.id}`,
            group: 'Transactions',
            label: title,
            meta: `${sign}${fmt(magnitude, currency)} · ${where} · ${new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
            icon: t.type === 'transfer' ? <ITransfer /> : <CategoryTile cat={cat ?? { name: t.category, color: '#64748b' }} size="sm" />,
            run: () => go(`/transactions?tx=${t.id}`),
          })
        }
        out.push({
          id: 'tx-all', group: 'Transactions', label: `Search all transactions for “${q.trim()}”`, icon: <ISearch />,
          run: () => go(`/transactions?q=${encodeURIComponent(q.trim())}`),
        })
      }
    }
    return out
  }, [q, data, actions, go])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKey = (/** @type {import('react').KeyboardEvent} */ e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
  }

  /** @type {Array<{group: string, rows: Array<{item: Item, index: number}>}>} */
  const grouped = []
  items.forEach((item, index) => {
    const last = grouped[grouped.length - 1]
    if (last && last.group === item.group) last.rows.push({ item, index })
    else grouped.push({ group: item.group, rows: [{ item, index }] })
  })

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Search and commands" onKeyDown={onKey}>
      <div className="absolute inset-0 bg-[rgba(15,23,42,0.18)] dark:bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="d-pop relative w-full max-w-[640px] overflow-hidden flex flex-col max-h-[70vh]">
        <div className="flex items-center gap-2.5 px-4 h-[52px] border-b border-[var(--d-border)] shrink-0">
          <ISearch size={18} className="text-[var(--d-text-3)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setActive(0) }}
            placeholder="Search transactions, accounts, pages, or type a command"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="d-palette-list"
            aria-activedescendant={items[active] ? `d-cmd-${active}` : undefined}
            className="d-palette-input flex-1 bg-transparent outline-none text-[15px] text-[var(--d-text)] placeholder:text-[var(--d-text-3)]"
          />
          <kbd className="d-kbd">Esc</kbd>
        </div>
        <div ref={listRef} id="d-palette-list" role="listbox" aria-label="Results" className="overflow-y-auto py-1.5">
          {items.length === 0 && (
            <div className="px-4 py-10 text-center text-13 text-[var(--d-text-2)]">Nothing matches “{q.trim()}”.</div>
          )}
          {grouped.map(g => (
            <div key={g.group} className="px-1.5 pb-1">
              <div className="d-menu-label">{g.group}</div>
              {g.rows.map(({ item, index }) => (
                <div
                  key={item.id}
                  id={`d-cmd-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  onMouseMove={() => { if (index !== active) setActive(index) }}
                  onClick={() => item.run()}
                  className="d-menu-item cursor-pointer h-9"
                  data-active={index === active}
                >
                  <span className="w-[22px] flex justify-center text-[var(--d-text-3)]">{item.icon}</span>
                  <span className="flex-1 min-w-0 truncate">{item.label}</span>
                  {item.meta && <span className="text-12 text-[var(--d-text-3)] truncate max-w-[50%] d-num">{item.meta}</span>}
                  {item.kbd && <span className="d-kbd">{item.kbd}</span>}
                  {index === active && !item.kbd && <ICornerDownLeft size={14} className="text-[var(--d-text-3)]" />}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 px-4 h-9 border-t border-[var(--d-border)] text-11 text-[var(--d-text-3)] shrink-0">
          <span className="flex items-center gap-1.5"><kbd className="d-kbd">↑</kbd><kbd className="d-kbd">↓</kbd> to move</span>
          <span className="flex items-center gap-1.5"><kbd className="d-kbd">↵</kbd> to open</span>
          <span className="ml-auto">Type to search transactions by note, category, account or amount</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
