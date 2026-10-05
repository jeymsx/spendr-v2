import { useMemo, useState } from 'react'
import { BoardSkeleton, ChartPanelSkeleton, PanelSkeleton, StatsSkeleton } from '../ui/Skeletons'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import useForecast from '../../hooks/useForecast'
import { useInsightsData, dailySeries } from '../../pages/insights/useInsightsData'
import {
  RANGES, AHEAD_RANGES, MONTHS, changeOf, monthOfPeriod, periodName, periodPhrase, usePeriod, useInsightsState, setInsights,
} from '../../pages/insights/period'
import { useNetWorthSeries, monthEnds, NET_RANGES, NET_RANGE_WORDS } from '../../pages/insights/netWorth'
import { ForecastChart } from '../../pages/insights/Charts'
import Highlights from '../../pages/insights/Highlights'
import { FORECAST_SETTINGS_PATH } from '../../lib/forecast'
import { editTransaction } from '../../lib/editTransaction'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { fmt, fmtCompact } from '../../lib/money'
import TxDetailSheet from '../../components/TxDetailSheet'
import { useRecapMonth } from '../../pages/recap/useRecapMonth'
import { artUrl } from '../../pages/recap/assets'
import { cardGradient } from '../../lib/accentTheme'
import { useTheme } from '../../context/ThemeContext'
import Page from '../ui/Page'
import Feather from '../ui/Feather'
import Sankey from '../ui/Sankey'
import { txBase } from '../../lib/fxContext'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import DataTable from '../ui/DataTable'
import { Segmented, Tabs } from '../ui/controls'
import { Stat, CategoryTile, AccountTile, Progress, Empty, Money } from '../ui/display'
import { AreaTrend, Bars, InOutBars, Ring } from '../ui/charts'
import { shortDate, TxDescription, TxAmount, TxAccount } from './txParts'
import { IChevronLeft, IChevronRight, ISliders, IPie, ICalendar } from '../ui/icons'

/**
 * Insights on a computer: the phone's Insights, read across a wide screen.
 *
 * One period for the whole page - the phone's own (pages/insights/period,
 * kept in the same session store, so the phone and the desktop show the
 * same month) - and five views of it: an overview, where the money went,
 * how it moved day by day or month by month, net worth over time, and the
 * forecast ahead. Every figure is useInsightsData, useNetWorthSeries and
 * useForecast, so nothing here can disagree with the phone.
 *
 * The phone's addresses still land: /insights/trend, /expenses, /accounts,
 * /net-worth and /forecast open the matching view.
 */

const VIEWS = [
  { value: 'overview', label: 'Overview' },
  { value: 'spending', label: 'Spending' },
  { value: 'trend', label: 'Trend' },
  { value: 'net-worth', label: 'Net worth' },
  { value: 'forecast', label: 'Forecast' },
]
/** The phone's page addresses, onto the desktop's views. */
const FROM_PHONE = /** @type {Record<string, string>} */ ({ expenses: 'spending', accounts: 'spending' })

export default function WebInsights() {
  const page = useLocation().pathname.split('/')[2]
  const navigate = useNavigate()
  const view = FROM_PHONE[page ?? ''] ?? (VIEWS.some(v => v.value === page) ? /** @type {string} */ (page) : 'overview')
  const { period, setRange, setMonth } = usePeriod()
  const data = useInsightsData(period)
  const periodBound = view === 'overview' || view === 'spending' || view === 'trend'

  const month = monthOfPeriod(period)
  const step = (/** @type {number} */ n) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + n, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const atNow = !period.month

  return (
    <Page
      eyebrow={periodBound ? periodName(period) : view === 'forecast' ? 'Ahead' : 'Over time'}
      title="Insights"
      actions={periodBound && (
        <>
          {period.range === '1m' && (
            <div className="flex items-center gap-1">
              <Btn variant="ghost" icon={<IChevronLeft size={16} />} label="Previous month" onClick={() => step(-1)} />
              <Btn variant="ghost" icon={<IChevronRight size={16} />} label="Next month" disabled={atNow} onClick={() => step(1)} />
            </div>
          )}
          <Segmented label="Period" value={period.range} onChange={setRange} options={RANGES.map(r => ({ value: r.key, label: r.label }))} />
        </>
      )}
    >
      <Tabs
        className="mb-7"
        label="Insights"
        tabs={VIEWS}
        value={view}
        onChange={(v) => navigate(v === 'overview' ? '/insights' : `/insights/${v}`)}
      />
      {/* Nothing here says "nothing spent" before the month has been read. */}
      {periodBound && data.loading ? <BoardSkeleton split="7/5" /> : (
        <>
          {view === 'overview' && <Overview data={data} period={period} />}
          {view === 'spending' && <Spending data={data} period={period} />}
          {view === 'trend' && <Trend data={data} period={period} />}
        </>
      )}
      {view === 'net-worth' && <NetWorth />}
      {view === 'forecast' && <Forecast />}
    </Page>
  )
}

/** @typedef {ReturnType<typeof useInsightsData>} Data */

/** @param {{data: Data, period: any}} props */
function Figures({ data, period }) {
  const spentChange = data.previous ? changeOf(data.totalSpent, data.previous.spent) : null
  const earnedChange = data.previous ? changeOf(data.totalEarned, data.previous.earned) : null
  const net = data.totalEarned - data.totalSpent
  const top = data.categorySegments[0]
  const recapMonth = useRecapMonth(period.range === '1m' ? monthOfPeriod(period) : null)
  /** @param {any} c */
  const vs = (c) => (!c || !data.previous ? ' ' : c.same ? `Same as ${data.previous.label}` : `${c.up ? '↑' : '↓'} ${c.pct}% vs ${data.previous.label}`)
  return (
    <div className="d-stats grid grid-cols-4 gap-5 mb-8">
      <Stat label="Spent" value={fmt(data.totalSpent)} note={vs(spentChange)} />
      <Stat label="Came in" value={fmt(data.totalEarned)} note={vs(earnedChange)} />
      <Stat label="Net" value={`${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}`} tone={net < 0 ? 'neg' : net > 0 ? 'pos' : null} note={net < 0 ? 'More went out than came in' : 'Kept from what came in'} />
      {/* Wrapped where there is a finished month to watch - the one shown,
          or the last one - and the biggest category until there is. */}
      {recapMonth
        ? <WrappedTile month={recapMonth} />
        : <Stat label="Biggest category" value={top ? fmt(top.value) : '—'} note={top ? `${top.name}, ${Math.round((top.value / (data.totalSpent || 1)) * 100)}% of spending` : `Nothing spent ${periodPhrase(period)}`} />}
    </div>
  )
}

/**
 * The month's Wrapped, as the fourth figure: a card in the accent - the
 * wallet's own gradient (lib/accentTheme) - with Wrapped's gift on it,
 * opening the story. The phone has it as a row under its Insights figures
 * (pages/insights/WrappedLink); this is the desktop's way in, beside the
 * bell's monthly notification.
 *
 * @param {{month: string}} props
 */
function WrappedTile({ month }) {
  const { accentColor, theme } = useTheme()
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const name = d.toLocaleDateString('en-US', d.getFullYear() === new Date().getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' })
  return (
    <Link to={`/recap/${month}`} className="d-wrapped-tile" style={{ background: cardGradient(accentColor, theme) }} aria-label={`${name} Wrapped: watch your month as a story`}>
      <span className="d-wrapped-label">Wrapped</span>
      <span className="d-wrapped-value">{name}</span>
      <span className="d-wrapped-note">Watch the story <IChevronRight size={13} /></span>
      <img src={artUrl('wrapped-gift', accentColor)} alt="" width={84} height={84} className="d-wrapped-art" draggable={false} />
    </Link>
  )
}

const INCOME_COLOURS = ['#0f9f7a', '#14b8a6', '#0891b2', '#22c55e', '#65a30d', '#0d9488']

/**
 * The period's money as a flow: what came in (by what it was, the biggest
 * six and the rest together) - and, when more went out than came in, the
 * difference drawn from what you already had - into one total, out to the
 * categories it was spent on, and what was kept when less went out.
 *
 * Both sides are useInsightsData's own figures (income and spending by
 * lib/flows, in the ledger's currency), so they add up to the Spent and
 * Came in above.
 *
 * @param {{data: Data, period: any}} props
 */
function CashFlow({ data, period }) {
  const flow = useMemo(() => {
    /** @type {Map<string, {value: number, color: string}>} */
    const byName = new Map()
    for (const t of data.inflows) {
      const name = String(t.description || t.category || 'Income').trim() || 'Income'
      const at = byName.get(name) ?? { value: 0, color: data.catMap[t.category]?.color ?? '' }
      at.value += txBase(t)
      byName.set(name, at)
    }
    const ins = [...byName.entries()].map(([name, v]) => ({ name, value: v.value })).filter(n => n.value > 0.005).sort((a, b) => b.value - a.value)
    /** @type {Array<{name: string, value: number, color: string}>} */
    const sources = ins.slice(0, 6).map((n, i) => ({ ...n, color: INCOME_COLOURS[i % INCOME_COLOURS.length] }))
    const restIn = ins.slice(6).reduce((s, n) => s + n.value, 0)
    if (restIn > 0.005) sources.push({ name: 'Other income', value: restIn, color: '#94a3b8' })
    const outs = data.categorySegments.filter(c => c.value > 0.005)
    const targets = outs.slice(0, 8).map(c => ({ name: c.name, value: c.value, color: c.color }))
    const restOut = outs.slice(8).reduce((s, c) => s + c.value, 0)
    if (restOut > 0.005) targets.push({ name: 'Everything else', value: restOut, color: '#94a3b8' })
    const inTotal = sources.reduce((s, n) => s + n.value, 0)
    const outTotal = targets.reduce((s, n) => s + n.value, 0)
    if (outTotal - inTotal > 0.005) sources.push({ name: 'From savings', value: outTotal - inTotal, color: '#c27803' })
    if (inTotal - outTotal > 0.005) targets.push({ name: 'Kept', value: inTotal - outTotal, color: '#059669' })
    return { sources, targets, inTotal, outTotal }
  }, [data.inflows, data.categorySegments, data.catMap])

  if (!flow.sources.length && !flow.targets.length) return null
  const rows = Math.max(flow.sources.length, flow.targets.length)
  return (
    <Panel className="mb-8" title="Cash flow" meta={`${periodName(period)}: where the money came from, and where it went`}>
      <Sankey sources={flow.sources} targets={flow.targets} middle="Money in" height={Math.max(300, Math.min(480, rows * 46 + 60))} />
    </Panel>
  )
}

/** Where the money went: a ring, and the categories beside it. @param {{data: Data, limit?: number}} props */
function CategoryBreakdown({ data, limit = 8 }) {
  const navigate = useNavigate()
  const [active, setActive] = useState(/** @type {string|null} */ (null))
  const segs = data.categorySegments
  const shown = segs.slice(0, limit)
  const rest = segs.slice(limit).reduce((s, c) => s + c.value, 0)
  const activeSeg = segs.find(s => s.name === active)
  const size = limit > 5 ? 208 : 176
  /* The figure fits the hole: the ring's inside is 70% of it across, and a
     bold tabular figure is about 0.6em a character - so it is sized to the
     hole and its own length, 22px at most. A long one goes compact first. */
  const value = activeSeg ? activeSeg.value : data.totalSpent
  const full = fmt(value)
  const figure = full.length > 11 ? fmtCompact(value) : full
  const room = size * 0.7 * 0.8
  const fs = Math.max(13, Math.min(22, Math.floor(room / (figure.length * 0.6))))
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5">
      <Ring
        data={segs.map(s => ({ name: s.name, value: s.value, color: s.color }))}
        size={size}
        active={active}
        onActive={setActive}
        center={
          <>
            <span className="text-12 font-medium text-[var(--d-text-3)] truncate" style={{ maxWidth: room }}>{activeSeg ? activeSeg.name : 'Spent'}</span>
            <span className="font-bold tracking-tight d-num text-[var(--d-text)] whitespace-nowrap" style={{ fontSize: fs, lineHeight: 1.25 }}>{figure}</span>
          </>
        }
      />
      <div className="flex-1 min-w-[240px] flex flex-col gap-1">
        {shown.length === 0 && <Empty icon={<IPie size={20} />} title="Nothing spent" body="Spending shows here by category." />}
        {shown.map(s => (
          <button
            key={s.name}
            type="button"
            onMouseEnter={() => setActive(s.name)}
            onMouseLeave={() => setActive(null)}
            onClick={() => navigate(`/categories/${encodeURIComponent(s.name)}`)}
            className={`flex items-center gap-3 h-10 px-3 -mx-3 rounded-xl text-left transition-colors ${active === s.name ? 'bg-[var(--d-hover)]' : ''}`}
          >
            <span className="d-swatch rounded-full" style={{ background: s.color }} />
            <span className="flex-1 min-w-0 truncate text-14 text-[var(--d-text)]">{s.name}</span>
            <span className="text-13 d-num text-[var(--d-text-3)] w-12 text-right">{Math.round((s.value / (data.totalSpent || 1)) * 100)}%</span>
            <span className="text-14 font-semibold d-num text-[var(--d-text)] text-right whitespace-nowrap">{fmt(s.value)}</span>
          </button>
        ))}
        {rest > 0 && <div className="flex items-center gap-3 h-10 text-13 text-[var(--d-text-3)]"><span className="flex-1">Everything else</span><span className="d-num">{fmt(rest)}</span></div>}
      </div>
    </div>
  )
}

/** The period's movement: day by day for a week or a month, month by month for longer. @param {{data: Data, period: any, height?: number}} props */
function MovementChart({ data, period, height = /** @type {number|string} */ (240) }) {
  if (period.range === '1m' || period.range === '7d') {
    return <Bars data={data.daily.map(d => ({ label: String(d.day), value: d.expense }))} height={height} valueLabel="Spent" />
  }
  return <InOutBars data={data.multiBarData.map(d => ({ label: d.label, income: d.income, expense: d.expense }))} height={height} />
}

/** @param {{data: Data, period: any}} props */
function Overview({ data, period }) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(/** @type {Record<string, any>|null} */ (null))
  const daily = period.range === '1m' || period.range === '7d'
  return (
    <>
      <Figures data={data} period={period} />
      <CashFlow data={data} period={period} />
      <div className="grid grid-cols-12 gap-5 mb-8">
        <Panel className="col-span-7" title="Where it went" meta={data.categorySegments.length ? `${data.categorySegments.length} categories` : null}
          actions={<Btn size="sm" variant="ghost" iconRight={<IChevronRight size={14} />} onClick={() => navigate('/insights/spending')}>Spending</Btn>}>
          <CategoryBreakdown data={data} />
        </Panel>
        {/* As tall as Where it went beside it, however many categories that
            lists: the chart fills its panel (drawn in a box laid over the
            body, so its own height never decides the row's), 232px at least. */}
        <Panel className="col-span-5 flex flex-col" bodyClassName="relative flex-1 min-h-[260px]" title={daily ? 'Day by day' : 'Month by month'}
          actions={<Btn size="sm" variant="ghost" iconRight={<IChevronRight size={14} />} onClick={() => navigate('/insights/trend')}>Trend</Btn>}>
          <div className="absolute left-6 right-6 top-1 bottom-6">
            <MovementChart data={data} period={period} height="100%" />
          </div>
        </Panel>
      </div>
      {data.trivia.length > 0 && <Feather className="-mx-5 mb-8 web-highlights"><Highlights items={data.trivia} /></Feather>}
      <div className="grid grid-cols-12 gap-5">
        {/* A table cannot stretch, so it keeps its own height (self-start)
            rather than standing in a stretched, half-empty card; the panel
            beside it fills to the taller of the two. */}
        <Panel className="col-span-7 self-start" title="Top expenses" flush
          actions={<Btn size="sm" variant="ghost" iconRight={<IChevronRight size={14} />} onClick={() => navigate('/insights/spending')}>All</Btn>}>
          <DataTable
            label="Top expenses"
            rows={data.rankedExpenses.slice(0, 8)}
            rowKey={(t) => t.id}
            onRowClick={(t) => setSelected(t)}
            empty={<Empty title="No expenses" body={`Nothing spent ${periodPhrase(period)}.`} />}
            columns={[
              { key: 'date', header: 'Date', width: 90, render: (t) => <span className="d-cell-muted d-num">{shortDate(t.date)}</span> },
              { key: 'desc', header: 'Description', render: (t) => <TxDescription tx={t} catMap={data.catMap} /> },
              { key: 'amt', header: 'Amount', width: 140, align: 'right', render: (t) => <TxAmount tx={t} /> },
            ]}
          />
        </Panel>
        {/* As tall as Top expenses beside it: its rows spread to fill (d-fill-rows). */}
        <Panel className="col-span-5 flex flex-col" bodyClassName="flex-1" title="By account">
          <AccountBreakdown data={data} />
        </Panel>
      </div>
      <TxDetailSheet open={!!selected} onClose={() => setSelected(null)} transaction={selected} accounts={data.accounts} categories={data.categories}
        onEdit={(t) => editTransaction(navigate, t, () => setSelected(null))} />
    </>
  )
}

/** @param {{data: Data}} props */
function AccountBreakdown({ data }) {
  const rows = data.accountBreakdown
  const max = Math.max(1, ...rows.map(r => r.value))
  if (!rows.length) return <div className="text-14 text-[var(--d-text-2)]">Nothing spent from any account.</div>
  return (
    <div className="d-fill-rows">
      {rows.slice(0, 7).map(r => (
        <div key={r.name}>
          <div className="flex items-center gap-3 mb-1.5">
            <AccountTile account={r.acct ?? { name: r.name }} size="sm" />
            <span className="flex-1 truncate text-14 text-[var(--d-text)]">{r.name}</span>
            <span className="text-14 font-semibold d-num">{fmt(r.value)}</span>
          </div>
          <Progress value={(r.value / max) * 100} color={r.color} />
        </div>
      ))}
    </div>
  )
}

/** @param {{data: Data, period: any}} props */
function Spending({ data, period }) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(/** @type {Record<string, any>|null} */ (null))
  const counts = useMemo(() => {
    /** @type {Record<string, number>} */
    const n = {}
    for (const t of data.expenses) n[t.category] = (n[t.category] ?? 0) + 1
    return n
  }, [data.expenses])
  return (
    <>
      <Figures data={data} period={period} />
      <div className="grid grid-cols-12 gap-5 mb-8">
        <Panel className="col-span-7 self-start" title="By category" flush>
          <DataTable
            label="Spending by category"
            rows={data.categorySegments}
            rowKey={(c) => c.name}
            onRowClick={(c) => navigate(`/categories/${encodeURIComponent(c.name)}`)}
            empty={<Empty icon={<IPie size={20} />} title="Nothing spent" body={`Nothing spent ${periodPhrase(period)}.`} />}
            columns={[
              { key: 'name', header: 'Category', render: (c) => <span className="flex items-center gap-3 min-w-0"><CategoryTile cat={data.catMap[c.name] ?? c} size="sm" /><span className="truncate font-medium">{c.name}</span></span> },
              {
                key: 'share', header: 'Share', width: 200,
                render: (c) => {
                  const pct = (c.value / (data.totalSpent || 1)) * 100
                  return <span className="flex items-center gap-3"><Progress className="flex-1" value={pct} color={c.color} /><span className="w-10 text-right text-13 d-num d-cell-muted">{Math.round(pct)}%</span></span>
                },
              },
              { key: 'count', header: 'Rows', width: 80, align: 'right', render: (c) => <span className="d-num d-cell-muted">{counts[c.name] ?? 0}</span> },
              { key: 'amt', header: 'Spent', width: 140, align: 'right', render: (c) => <span className="d-num font-semibold">{fmt(c.value)}</span> },
            ]}
          />
        </Panel>
        {/* The column as tall as By category beside it: By account takes the rest. */}
        <div className="col-span-5 flex flex-col gap-5">
          <Panel title="Where it went"><CategoryBreakdown data={data} limit={5} /></Panel>
          <Panel className="flex-1 flex flex-col" bodyClassName="flex-1" title="By account"><AccountBreakdown data={data} /></Panel>
        </div>
      </div>
      <Panel title="Every expense" meta={`${data.rankedExpenses.length.toLocaleString()} rows, biggest first`} flush>
        <DataTable
          label="Every expense"
          rows={data.rankedExpenses}
          rowKey={(t) => t.id}
          onRowClick={(t) => setSelected(t)}
          empty={<Empty title="No expenses" body={`Nothing spent ${periodPhrase(period)}.`} />}
          columns={[
            { key: 'date', header: 'Date', width: 100, render: (t) => <span className="d-cell-muted d-num">{shortDate(t.date)}</span> },
            { key: 'desc', header: 'Description', render: (t) => <TxDescription tx={t} catMap={data.catMap} /> },
            { key: 'acct', header: 'Account', width: 200, render: (t) => <TxAccount tx={t} acctMap={data.acctMap} /> },
            { key: 'amt', header: 'Amount', width: 140, align: 'right', render: (t) => <TxAmount tx={t} /> },
          ]}
        />
      </Panel>
      <TxDetailSheet open={!!selected} onClose={() => setSelected(null)} transaction={selected} accounts={data.accounts} categories={data.categories}
        onEdit={(t) => editTransaction(navigate, t, () => setSelected(null))} />
    </>
  )
}

/** @param {{data: Data, period: any}} props */
function Trend({ data, period }) {
  const daily = period.range === '1m' || period.range === '7d'
  const [series, setSeries] = useState('expenses')
  const s = useMemo(() => dailySeries(data.daily), [data.daily])
  const points = (series === 'income' ? s.income : series === 'netflow' ? s.netflow : s.expenses).map(p => ({ label: String(p.day), value: p.value }))
  const lived = data.lived
  const avg = lived.length ? lived.reduce((t, d) => t + d.expense, 0) / lived.length : 0
  const peak = lived.reduce((p, d) => (d.expense > (p?.expense ?? 0) ? d : p), /** @type {any} */ (null))
  const quiet = lived.filter(d => d.expense === 0).length
  return (
    <>
      <Figures data={data} period={period} />
      {daily ? (
        <>
          <div className="grid grid-cols-3 gap-5 mb-8">
            <Stat label="Average a day" value={fmt(avg)} note={`Over ${lived.length} ${lived.length === 1 ? 'day' : 'days'} so far`} />
            <Stat label="Biggest day" value={peak ? fmt(peak.expense) : '—'} note={peak ? peak.label : ' '} />
            <Stat label="Days with no spending" value={String(quiet)} note={`Of ${lived.length}`} />
          </div>
          <Panel title="Day by day" actions={<Segmented label="Show" value={series} onChange={setSeries} options={[{ value: 'expenses', label: 'Spent' }, { value: 'income', label: 'Came in' }, { value: 'netflow', label: 'Net' }]} />}>
            {series === 'netflow'
              ? <AreaTrend data={points} height={300} valueLabel="Net" />
              : <Bars data={points} height={300} color={series === 'income' ? 'var(--d-pos)' : 'var(--d-accent)'} valueLabel={series === 'income' ? 'Came in' : 'Spent'} />}
          </Panel>
        </>
      ) : (
        <>
          <Panel className="mb-5" title="Month by month"><InOutBars data={data.multiBarData} height={300} /></Panel>
          <Panel title="Each month" flush>
            <DataTable
              label="Each month"
              rows={[...data.multiBarData].reverse()}
              rowKey={(r) => r.label}
              columns={[
                { key: 'm', header: 'Month', render: (r) => <span className="font-medium">{r.label}</span> },
                { key: 'in', header: 'Came in', width: 160, align: 'right', render: (r) => <span className="d-num d-pos">{fmt(r.income)}</span> },
                { key: 'out', header: 'Spent', width: 160, align: 'right', render: (r) => <span className="d-num">{fmt(r.expense)}</span> },
                { key: 'net', header: 'Net', width: 160, align: 'right', render: (r) => { const n = r.income - r.expense; return <span className={`d-num font-semibold ${n < 0 ? 'd-neg' : 'd-pos'}`}>{n < 0 ? '−' : '+'}{fmt(Math.abs(n))}</span> } },
              ]}
            />
          </Panel>
        </>
      )}
    </>
  )
}

function NetWorth() {
  const kept = useInsightsState()
  const range = kept.net ?? '6m'
  const series = useNetWorthSeries(range)
  const { current, txs, debts, includeDebts } = series
  const ends = useMemo(() => (current == null || !txs.length ? [] : monthEnds({ txs, current, months: 12, debts, includeDebts })), [current, txs, debts, includeDebts])
  const chart = series.data.map(d => ({ label: d.day, value: d.value }))
  const change = chart.length > 1 ? chart[chart.length - 1].value - chart[0].value : 0
  const best = ends.reduce((b, m) => (m.change != null && (b == null || m.change > b.change) ? m : b), /** @type {any} */ (null))
  if (series.loading) return <><StatsSkeleton count={3} /><ChartPanelSkeleton height={300} className="mb-5" /><PanelSkeleton rows={6} /></>
  return (
    <>
      <div className="grid grid-cols-3 gap-5 mb-8">
        <Stat label="Net worth now" value={current == null ? '—' : <Money value={current} />} note="Every account at today’s rate" />
        <Stat label={`Change ${NET_RANGE_WORDS[/** @type {keyof typeof NET_RANGE_WORDS} */ (range)] ?? ''}`} value={`${change >= 0 ? '+' : '−'}${fmt(Math.abs(change))}`} tone={change < 0 ? 'neg' : change > 0 ? 'pos' : null} note={chart[0] ? `From ${fmt(chart[0].value)}` : ' '} />
        <Stat label="Best month" value={best ? `+${fmt(Math.max(0, best.change))}` : '—'} note={best ? monthName(best.key) : ' '} />
      </div>
      <Panel className="mb-5" title="Net worth over time"
        actions={<Segmented label="Range" value={range} onChange={(v) => setInsights({ net: v })} options={NET_RANGES.map(r => ({ value: r.key, label: r.key === 'all' ? 'All' : r.key.toUpperCase() }))} />}>
        {chart.length > 1 ? <AreaTrend data={chart} height={300} valueLabel="Net worth" /> : <div className="h-[300px]" />}
      </Panel>
      <Panel title="Month by month" meta="At each month’s end, and how it moved" flush>
        <DataTable
          label="Net worth by month"
          rows={ends}
          rowKey={(m) => m.key}
          empty={<Empty title="Not enough history yet" />}
          columns={[
            { key: 'm', header: 'Month', render: (m) => <span className="font-medium">{monthName(m.key)}</span> },
            { key: 'v', header: 'Net worth', width: 180, align: 'right', render: (m) => <Money value={m.value} className="font-medium" /> },
            { key: 'c', header: 'Change', width: 180, align: 'right', render: (m) => m.change == null ? <span className="d-cell-faint">—</span> : <span className={`d-num font-semibold ${m.change < 0 ? 'd-neg' : 'd-pos'}`}>{m.change < 0 ? '−' : '+'}{fmt(Math.abs(m.change))}</span> },
          ]}
        />
      </Panel>
    </>
  )
}

/** "2026-08" as "August 2026". @param {string} key */
function monthName(key) {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

function Forecast() {
  const navigate = useNavigate()
  const base = useBaseCurrency()
  const kept = useInsightsState()
  const range = AHEAD_RANGES.find(r => r.key === kept.ahead) ?? AHEAD_RANGES[0]
  const { forecast, settings } = useForecast(range.days, Math.min(60, Math.max(14, Math.round(range.days / 3))))
  const showBand = settings.band && settings.spend !== 'custom'
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], [])
  const catMap = useMemo(() => Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])
  const acctMap = useMemo(() => Object.fromEntries((accounts ?? []).map(a => [a.name, a])), [accounts])
  const short = (/** @type {Date} */ d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  const data = useMemo(() => {
    if (!forecast) return []
    const past = (forecast.past ?? []).slice(0, -1).map(d => ({ day: short(d.date), iso: d.iso, past: d.balance }))
    const ahead = forecast.days.map((d, i) => ({
      day: i === 0 ? 'Today' : short(d.date), iso: d.iso, value: d.balance,
      ...(showBand ? { band: /** @type {[number, number]} */ ([d.low, d.high]) } : {}),
      ...(i === 0 ? { past: forecast.start } : {}),
    }))
    return [...past, ...ahead]
  }, [forecast, showBand])

  if (!forecast) return <><StatsSkeleton /><ChartPanelSkeleton height={300} className="mb-5" /><PanelSkeleton rows={5} /></>
  const neg = forecast.firstNegative
  const low = forecast.lowest
  const color = neg ? '#ef4444' : forecast.firstBelowFloor ? '#f59e0b' : '#10b981'
  return (
    <>
      <div className="d-stats grid grid-cols-4 gap-5 mb-8">
        <Stat label="Safe to spend" value={fmt(Math.max(0, forecast.safeToSpend ?? 0))} tone={neg ? 'neg' : null}
          note={forecast.safeUntil ? `Until payday, ${short(new Date(forecast.safeUntil))}` : 'For the next 2 weeks'} />
        <Stat label="Lowest point" value={low ? <Money value={low.balance} colour /> : '—'} note={low ? `On ${short(low.date)}` : ' '} />
        <Stat label="Everyday spending" value={fmt(forecast.dailySpend ?? 0)} note="A day, from your history" />
        <Stat label="Coming in" value={fmt(forecast.events.filter(e => e.sign > 0).reduce((t, e) => t + Math.abs(e.amount), 0))} note={forecast.hasIncome ? `Pay and income in the next ${range.days} days` : 'No pay found yet'} />
      </div>
      <Panel className="mb-5" title="Your money ahead" meta={neg ? `Runs short on ${short(neg.date)}` : 'Stays above zero'}
        actions={
          <>
            <Segmented label="Ahead" value={range.key} onChange={(v) => setInsights({ ahead: v })} options={AHEAD_RANGES.map(r => ({ value: r.key, label: r.label }))} />
            <Btn variant="ghost" icon={<ISliders size={16} />} label="Forecast settings" onClick={() => navigate(FORECAST_SETTINGS_PATH)} />
          </>
        }>
        <div className="-mx-5">
          <ForecastChart data={data} todayIndex={Math.max(0, (forecast.past?.length ?? 1) - 1)} color={color} currency={base} rangeKey={range.key}
            floor={forecast.floor} lowest={low} band={showBand} />
        </div>
      </Panel>
      <Panel title="Coming up" meta={`${forecast.events.length} in the next ${range.days} days`} flush>
        <DataTable
          label="Coming up"
          rows={forecast.events}
          rowKey={(e) => e.key}
          empty={<Empty icon={<ICalendar size={20} />} title="Nothing due" body="Bills, pay and card statements show here." />}
          columns={[
            { key: 'd', header: 'Date', width: 110, render: (e) => <span className="d-num d-cell-muted">{short(e.date)}</span> },
            {
              key: 'n', header: 'What',
              render: (e) => (
                <span className="flex items-center gap-3 min-w-0">
                  {e.kind === 'card' || e.kind === 'loan'
                    ? <AccountTile account={acctMap[e.name] ?? { name: e.name }} size="sm" />
                    : <CategoryTile cat={(e.category && catMap[e.category]) || { name: e.name, color: '#94a3b8' }} size="sm" />}
                  <span className="truncate font-medium">{e.name}</span>
                  {e.overdue && <span className="d-badge d-badge-neg">Overdue</span>}
                  {e.learned && <span className="d-badge d-badge-accent">Usual pay</span>}
                </span>
              ),
            },
            { key: 'k', header: 'Kind', width: 150, render: (e) => <span className="d-cell-muted">{e.kind === 'card' ? 'Card statement' : e.kind === 'loan' ? 'Loan payment' : e.kind === 'income' ? 'Income' : e.kind === 'debt' ? 'Debt' : 'Bill'}</span> },
            { key: 'a', header: 'Amount', width: 150, align: 'right', render: (e) => <span className={`d-num font-semibold ${e.sign > 0 ? 'd-pos' : ''}`}>{e.sign > 0 ? '+' : '−'}{fmt(Math.abs(e.amount))}</span> },
          ]}
        />
      </Panel>
      <p className="mt-4 text-13 text-[var(--d-text-3)]">From Recurring, your loans, cards and debts, and the pay your history shows. <Link to={FORECAST_SETTINGS_PATH} className="d-link">How it is worked out</Link></p>
    </>
  )
}
