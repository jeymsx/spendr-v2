import { useFinanceSummary } from '../../hooks/useFinanceSummary'
import { WebPageHeader, WebPanel, WebStat, WebEmpty, WebBar, money, moneyCompact } from '../components/WebPanel'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function relDay(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const tmrw = new Date(now); tmrw.setDate(now.getDate() + 1)
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (d >= now && d < tmrw) return 'Today'
  if (d >= yest && d < now) return 'Yesterday'
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-PH',
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysAway(nextDate) {
  const [y, m, d] = String(nextDate ?? '').slice(0, 10).split('-').map(Number)
  if (!y) return null
  const start = new Date(); start.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, d) - start) / 864e5)
}

export default function WebDashboard() {
  const s = useFinanceSummary()

  if (s.loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60dvh' }}>
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const creditAccounts = s.accounts.filter(a => a.type === 'credit')
  const assetAccounts  = s.accounts.filter(a => a.type !== 'credit')

  return (
    <>
      <WebPageHeader
        title={`${greeting()}, ${s.userName}`}
        subtitle={new Date().toLocaleDateString('en-PH', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      />

      {/* Top line: the four numbers worth seeing at a glance */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <WebStat label="Net worth"   value={money(s.netWorth)} tone={s.netWorth < 0 ? 'bad' : 'default'}
                 hint="Assets minus credit owed" />
        <WebStat label="Spending"    value={money(s.balances.spending)} hint="Cash & e-wallets" />
        <WebStat label="Savings"     value={money(s.balances.savings)}  hint="Banks & deposits" />
        <WebStat label="Credit owed" value={money(s.creditOutstanding)} tone={s.creditOutstanding > 0 ? 'bad' : 'good'}
                 hint={`${creditAccounts.length} card${creditAccounts.length === 1 ? '' : 's'}`} />
      </div>

      {/* Landscape's actual payoff: things that were separate screens on a
          phone are all visible at once here. */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        <div className="xl:col-span-2 flex flex-col gap-6 min-w-0">
          <WebPanel title="Accounts" to="/accounts">
            {assetAccounts.length === 0 ? <WebEmpty>No accounts yet</WebEmpty> : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {assetAccounts.map(a => (
                  <div key={a.id} className="rounded-xl px-3.5 py-3
                    bg-slate-50 dark:bg-white/[0.04] min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: a.color || 'var(--color-primary)' }} />
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{a.name}</p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-slate-800 dark:text-white truncate">
                      {money(a.balance)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </WebPanel>

          {creditAccounts.length > 0 && (
            <WebPanel title="Credit cards" to="/accounts">
              <div className="flex flex-col gap-4">
                {creditAccounts.map(a => {
                  const st = s.creditStatus[a.name] ?? {}
                  const limit = a.creditLimit ?? 0
                  const used = st.currentBalance ?? 0
                  const pct = limit > 0 ? (used / limit) * 100 : 0
                  return (
                    <div key={a.id} className="min-w-0">
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{a.name}</p>
                        <p className="text-sm font-bold tabular-nums text-red-500 dark:text-red-400 shrink-0">
                          {money(used)}
                        </p>
                      </div>
                      <WebBar pct={pct} tone={pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'accent'} />
                      <div className="flex items-center justify-between mt-1.5">
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          {money(limit - used)} available of {moneyCompact(limit)}
                        </p>
                        {st.stmtPaid
                          ? <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Statement paid</p>
                          : <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                              {money(st.thisTotal ?? 0)} due
                            </p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </WebPanel>
          )}

          <WebPanel title="Recent activity" to="/transactions" flush>
            {s.recent.length === 0 ? <WebEmpty>Nothing logged yet</WebEmpty> : (
              <table className="w-full text-sm">
                <tbody>
                  {s.recent.slice(0, 12).map(t => {
                    const cat = s.catMap[t.category]
                    const isIn = t.type === 'inflow'
                    const acct = t.type === 'transfer'
                      ? `${t.fromAccount ?? '—'} → ${t.toAccount ?? '—'}`
                      : (t.account ?? '—')
                    return (
                      <tr key={t.id} className="border-t border-slate-100 dark:border-white/[0.05]">
                        <td className="px-5 py-2.5 w-8 text-base">{cat?.icon ?? (t.type === 'transfer' ? '🔄' : '📦')}</td>
                        <td className="px-2 py-2.5 min-w-0">
                          <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                            {t.description || t.category || '—'}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{acct}</p>
                        </td>
                        <td className="px-2 py-2.5 text-right whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">
                          {relDay(t.date)}
                        </td>
                        <td className={`px-5 py-2.5 text-right font-bold tabular-nums whitespace-nowrap
                          ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>
                          {isIn ? '+' : t.type === 'expense' ? '−' : ''}{money(t.amount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </WebPanel>
        </div>

        <div className="flex flex-col gap-6 min-w-0">
          <WebPanel title="Budgets" to="/insights"
            action={<span className="text-xs text-slate-400 dark:text-slate-500">
              {money(s.monthSpent)} this month</span>}>
            {s.budgets.length === 0 ? <WebEmpty>No budgets set</WebEmpty> : (
              <div className="flex flex-col gap-3.5">
                {s.budgets.map(c => {
                  const pct = c.budget > 0 ? (c.spent / c.budget) * 100 : 0
                  const over = c.spent > c.budget
                  return (
                    <div key={`${c.name}-${c.type}`} className="min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                          {c.icon} {c.name}
                        </p>
                        <p className={`text-xs font-bold tabular-nums shrink-0
                          ${over ? 'text-red-500 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>
                          {moneyCompact(c.spent)}<span className="text-slate-400 dark:text-slate-500 font-medium">
                            {' / '}{moneyCompact(c.budget)}</span>
                        </p>
                      </div>
                      <WebBar pct={pct} tone={over ? 'bad' : pct >= 75 ? 'warn' : 'good'} />
                    </div>
                  )
                })}
              </div>
            )}
          </WebPanel>

          <WebPanel title="Upcoming bills" to="/recurring">
            {s.upcoming.length === 0 ? <WebEmpty>Nothing scheduled</WebEmpty> : (
              <div className="flex flex-col gap-3">
                {s.upcoming.slice(0, 6).map(r => {
                  const d = daysAway(r.nextDate)
                  const late = d != null && d < 0
                  return (
                    <div key={r.id} className="flex items-center justify-between gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{r.name}</p>
                        <p className={`text-[11px] truncate ${late
                          ? 'text-red-500 dark:text-red-400 font-semibold'
                          : 'text-slate-400 dark:text-slate-500'}`}>
                          {late ? 'Overdue' : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `in ${d}d`}
                          {' · '}{r.account}
                        </p>
                      </div>
                      <p className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
                        {money(r.amount)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </WebPanel>

          <WebPanel title="Debts" to="/debts">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl px-3.5 py-3 bg-slate-50 dark:bg-white/[0.04]">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">I owe</p>
                <p className="text-sm font-bold tabular-nums text-red-500 dark:text-red-400 mt-1">
                  {money(s.debtTotals.iOwe)}
                </p>
              </div>
              <div className="rounded-xl px-3.5 py-3 bg-slate-50 dark:bg-white/[0.04]">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Owed to me</p>
                <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                  {money(s.debtTotals.owedToMe)}
                </p>
              </div>
            </div>
          </WebPanel>
        </div>
      </div>
    </>
  )
}
