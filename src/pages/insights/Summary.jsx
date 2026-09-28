import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Scales02 } from '@untitledui/icons'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import { fmt, fmtCompact } from '../../lib/money'
import { DonutChart } from './Charts'
import { openFrom } from './zoom'

/**
 * The top of Insights: the month in three figures, and where it went.
 *
 * ── The donut is the headline ──
 *
 * It was the second "Total spent" on the page: a headline above said the
 * same figure the donut's centre said, 340px lower. Now the donut leads and
 * its centre is the only place the total is written - with, under it, how it
 * compares with the stretch before, which nothing on the page said at all.
 *
 * ── Income and net beside it, as cards ──
 *
 * The other two figures that decide whether a month went well. Each opens
 * the Trend page on its own series, so "why is income up" is one tap.
 *
 * ── The legend is a way in ──
 *
 * Each category opens its own page (CategoryDetail), which already has the
 * purchases and a line of how the category moved. Tapping the donut still
 * singles out a slice; the legend dims the others to match.
 */

/**
 * @param {{segments: Array<{name: string, value: number, color: string, icon: string}>, total: number,
 *          animKey: string, selected: number|null, onSelect: (i: number|null) => void,
 *          change: {pct: number, up: boolean, same: boolean}|null, compareLabel: string|null, emptyPhrase: string}} props
 */
export function DonutHero({ segments, total, animKey, selected, onSelect, change, compareLabel, emptyPhrase }) {
  if (!segments.length) {
    return <EmptyState art="receipt" title={`No expenses ${emptyPhrase}`} className="py-16" />
  }
  /* Spending less is the good direction, so down is green and up is amber:
     the app's warm "worth a look", never alarming red. */
  const caption = change && compareLabel ? (
    <span className={`mt-1.5 text-12 font-semibold tabular-nums ${
      change.same ? 'text-slate-400 dark:text-slate-500'
        : change.up ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
    }`}>
      {change.same ? `Same as ${compareLabel}` : `${change.up ? '↑' : '↓'} ${change.pct}% vs ${compareLabel}`}
    </span>
  ) : null
  return <DonutChart segments={segments} total={total} animKey={animKey} selected={selected} onSelect={onSelect} caption={caption} />
}

const TILE = {
  good: 'bg-emerald-500/[0.12] text-emerald-600 dark:bg-emerald-400/[0.14] dark:text-emerald-400',
  soft: 'bg-amber-500/[0.14] text-amber-600 dark:bg-amber-400/[0.14] dark:text-amber-400',
}

/**
 * One figure on a card: a tinted square with its mark, what it is, how much.
 *
 * @param {{to: string, zoom: string, tone: 'good'|'soft', icon: import('react').ReactNode,
 *          label: string, value: string, valueClass?: string}} props
 */
function Stat({ to, zoom, tone, icon, label, value, valueClass = 'text-slate-900 dark:text-white' }) {
  const navigate = useNavigate()
  return (
    <Card
      as={Link}
      to={to}
      interactive
      data-zoom={zoom}
      onClick={(/** @type {React.MouseEvent<HTMLAnchorElement>} */ e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        openFrom(e.currentTarget, () => navigate(to), zoom)
      }}
      className="flex items-center gap-3 min-w-0 px-3.5 py-3"
    >
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${TILE[tone]}`} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex flex-col">
        <span className="text-12 text-slate-500 dark:text-slate-400 truncate">{label}</span>
        <span className={`text-17 font-semibold tabular-nums leading-snug truncate ${valueClass}`}>{value}</span>
      </span>
    </Card>
  )
}

/**
 * Income and net, side by side.
 *
 * Net says how much of what came in was kept - or how far past it the month
 * went - beside its label, so the one number that says whether a month went
 * well carries its reading with it.
 *
 * @param {{income: number, spent: number}} props
 */
export function StatPair({ income, spent }) {
  const net = income - spent
  const kept = net >= 0
  const rate = income > 0 ? Math.round((Math.abs(net) / income) * 100) : null
  const reading = rate == null ? '' : kept ? ` · ${rate}% kept` : ` · ${rate}% over`
  return (
    <div className="px-5 grid grid-cols-2 gap-3">
      <Stat
        to="/insights/trend?type=income"
        zoom="income"
        tone="good"
        icon={<ArrowUpRight size={18} strokeWidth={2} />}
        label="Income"
        value={fmtCompact(income)}
      />
      <Stat
        to="/insights/trend?type=netflow"
        zoom="net"
        tone={kept ? 'good' : 'soft'}
        icon={<Scales02 size={18} strokeWidth={1.8} />}
        label={`Net${reading}`}
        value={`${kept ? '+' : '−'}${fmtCompact(Math.abs(net))}`}
        valueClass={kept ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}
      />
    </div>
  )
}

/**
 * The donut's key, as links: each category opens its own page.
 *
 * @param {{segments: Array<{name: string, value: number, color: string}>, selected: number|null}} props
 */
export function CategoryLegend({ segments, selected }) {
  if (!segments.length) return null
  return (
    /* One column on the narrowest phones: at 320px two columns left a
       category four letters before the ellipsis. */
    <div className={`px-5 grid gap-x-4 ${segments.length === 1 ? 'grid-cols-1' : 'grid-cols-2 max-[359px]:grid-cols-1'}`}>
      {segments.map((seg, i) => (
        <Link
          key={seg.name}
          to={`/categories/${encodeURIComponent(seg.name)}`}
          className={`press press-fade flex items-center gap-2 min-w-0 py-1.5 transition-opacity duration-150 ${
            selected != null && selected !== i ? 'opacity-30' : ''
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} aria-hidden="true" />
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">{seg.name}</span>
          <span className="text-xs font-semibold text-slate-800 dark:text-white tabular-nums shrink-0 ml-auto">{fmt(seg.value)}</span>
        </Link>
      ))}
    </div>
  )
}
