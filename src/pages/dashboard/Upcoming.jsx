import { Link, useNavigate } from 'react-router-dom'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import RollingNumber from '../../components/ui/RollingNumber'
import CategoryGlyph from '../../components/CategoryGlyph'
import BillMark from '../../components/BillMark'
import { IconCardUI, IconReceipt } from '../../components/icons'
import { fmt, fmtCompact } from '../../lib/money'
import SectionHeading from '../../components/ui/SectionHeading'
import { GlassArt } from '../../components/glass/GlassArt'
import { useTheme } from '../../context/ThemeContext'

/**
 * A forecast event, as the row below draws it - one mapping for Home and the
 * Forecast page, so an item looks the same in both.
 *
 * @param {import('../../lib/forecast').ForecastEvent} e
 * @param {Record<string, any>} catMap       categories by name
 * @param {Record<string, any>} acctByName   accounts by name
 */
export function toUpcomingItem(e, catMap, acctByName) {
  const common = {
    key: e.key, date: e.date, name: e.name, amount: e.amount, sign: e.sign,
    to: e.to, kind: e.repeats ? 'recurring' : 'statement', counted: e.counted,
  }
  if (e.kind === 'bill' || e.kind === 'income') {
    const cat = e.category ? catMap[e.category] : null
    return {
      ...common,
      meta: e.account ?? '',
      icon: <CategoryGlyph cat={cat} size={17} emoji="🔁" />,
      /* The brand's own logo where there is one - the same mark the
         Recurring list and the item's page draw. BillMark falls back to the
         tile above for a name it has no art for. */
      mark: <BillMark name={e.name} cat={cat} size={20} boxClass="w-10 h-10 rounded-2xl" />,
      color: cat?.color ?? null,
      ...(e.overdue
        ? (e.kind === 'income' ? { status: 'Not marked yet', late: false } : { status: 'Overdue', late: true })
        : {}),
    }
  }
  if (e.kind === 'card') {
    return {
      ...common, meta: 'Already counted', icon: <IconCardUI size={17} />,
      color: acctByName[e.name]?.color ?? null,
      ...(e.overdue ? { status: 'Overdue', late: true } : {}),
    }
  }
  if (e.kind === 'loan') {
    return {
      ...common, meta: 'Loan payment', icon: <IconReceipt size={17} />,
      color: acctByName[e.name]?.color ?? null,
      ...(e.overdue ? { status: 'Overdue', late: true } : {}),
    }
  }
  return {
    ...common, meta: 'You owe', icon: <IconReceipt size={17} />, color: null,
    ...(e.overdue ? { status: 'Overdue', late: true } : {}),
  }
}

// ── Next 30 days ───────────────────────────────────────────────────────────────

/**
 * "Tomorrow", "Today", or a date. Relative wording only where it is genuinely
 * more useful than the date itself - past three days out, "in 5 days" is more
 * arithmetic than "Sep 15".
 */
export function fmtUpcoming(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const days = Math.round((d - today) / 864e5)
  if (days < 0)  return 'Overdue'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 6)  return d.toLocaleDateString('en-PH', { weekday: 'long' })
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

/** Circular arrows: this charge comes back every month. */
export function IconRepeatBadge() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11a9 9 0 0 1 15-5l3 3M21 13a9 9 0 0 1-15 5l-3-3" />
      <path d="M21 3v6h-6M3 21v-6h6" />
    </svg>
  )
}

/** A calendar leaf: this one falls due on a date rather than repeating. */
export function IconDueBadge() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

/**
 * One committed-but-not-yet-real movement.
 *
 * Same metrics as TxRow - 40px icon, same paddings, same type scale - so it
 * reads as the same kind of object. What differs is the weight: the name is
 * slate-600 where a real transaction is slate-800, and the amount is neutral
 * rather than red or green, because nothing has moved yet. Colouring an
 * unspent peso red would be the same lie as counting it.
 *
 * The fade is done with muted COLOURS rather than a container opacity on
 * purpose. `opacity-60` over white drops slate-800 to about 4.3:1, under the
 * 4.5:1 floor; slate-600 and slate-500 are 7.6:1 and 4.8:1 and look just as
 * recessive next to full-strength rows.
 *
 * `sign` is +1 for money coming in (a payday) and -1 otherwise. `status`
 * replaces the date word when the item has one of its own - "Overdue" for a
 * bill that should have posted, "Not marked yet" for pay that has not.
 */
export function UpcomingRow({ item, isLast }) {
  const navigate = useNavigate()
  const status = item.status ?? fmtUpcoming(item.date)
  const late = item.status ? item.late : status === 'Overdue'
  return (
    <>
    <button
      onClick={() => item.to && navigate(item.to)}
      className={`w-full text-left flex items-center gap-3 px-4 py-3.5${isLast ? ' rounded-b-2xl' : ''}
        active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors`}
    >
      <span className="relative shrink-0">
        {/* The brand's mark where the item carries one, the tinted tile
            otherwise - both 40px, so the row does not reflow between a
            Spotify and a "Gym". The fade lives out here rather than on
            either one, because BillMark sets its own inline opacity and a
            utility class underneath it would never apply. */}
        {item.mark ? (
          <span className="block opacity-70" aria-hidden="true">{item.mark}</span>
        ) : (
          <span
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-base opacity-70"
            style={{ backgroundColor: (item.color ?? '#2D9DFF') + '18' }}
            aria-hidden="true"
          >
            {item.icon}
          </span>
        )}
        {/* Bottom-right, overlapping the corner, ringed in the row's own
            background so it reads as punched out rather than stuck on. The
            ring colour lives in index.css next to the .card rules it is
            derived from - see .upcoming-badge. */}
        <span className="upcoming-badge absolute -bottom-0.5 -right-0.5 w-[15px] h-[15px]
          rounded-full flex items-center justify-center">
          {item.kind === 'recurring' ? <IconRepeatBadge /> : <IconDueBadge />}
        </span>
      </span>

      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
          {item.name}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
          <span className={late ? 'text-red-500 dark:text-red-400 font-semibold' : ''}>
            {status}
          </span>
          {item.meta ? ` · ${item.meta}` : ''}
        </span>
      </span>

      <span className="text-sm font-semibold tabular-nums shrink-0 text-slate-500 dark:text-slate-400">
        {item.sign > 0 ? '+' : '−'}{fmt(item.amount)}
      </span>
    </button>
    {!isLast && <Divider inset="glyph" />}
    </>
  )
}

/**
 * What the next month holds: the one figure that answers "can I spend
 * today?", and the next few things that land.
 *
 * It replaces a list capped at two upcoming bills, which said what was due
 * but not whether you could cover it. The figure is Latr's "safe to spend":
 * the lowest your money gets before the next payday, less the floor you set
 * on the forecast - so a salary on the 15th and rent on the 12th are read in
 * the right order. The whole walk is a tap away on the Forecast page.
 *
 * Without a payday on the Recurring list the forecast is guessing, so it
 * says so and offers the one thing that fixes it.
 */
/* The Safe to spend wallet. Big enough that the band's bottom edge cuts
   through its rounded base, and its frame starts a quarter of its size above
   the card so the top stands clear of it. A little smaller on a narrow phone,
   where at full size it ran into the figure. */
const WALLET_SIZE = 'min(200px, 52vw)'
const WALLET_RISE = 'calc(min(200px, 52vw) * -0.25)'

export default function UpcomingSection({ forecast, items }) {
  const navigate = useNavigate()
  const { accentColor } = useTheme()
  if (!forecast) return null
  const noIncome = !forecast.hasIncome
  const short = forecast.firstNegative
  const until = forecast.safeUntil
    ? `Until payday, ${forecast.safeUntil.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
    : 'For the next 2 weeks'

  return (
    <section className="px-5 mt-8">
      <SectionHeading
        inset="none"
        gap="none"
        actionLabel="Forecast"
        actionTo="/insights/forecast"
      >Next 30 days</SectionHeading>
      {/* Not `clip`: the wallet below stands up out of the card's top edge.
          The band and the last row round their own corners instead, so a
          pressed tint still keeps to the card's shape. */}
      <Card className="mt-3">
        <Link
          to="/insights/forecast"
          className="relative block rounded-t-2xl px-4 pt-4 pb-3.5 active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
        >
          {/* A glass wallet, large, standing up out of the card and cut off
              only by the band's bottom edge - so the figure is not a lone
              number on an empty band. In the accent, or red when the money
              runs out. The frame is what clips it: it starts above the card
              and ends where the band does. Decoration: no taps, nothing read. */}
          <span
            className="pointer-events-none absolute right-5 bottom-0 overflow-hidden"
            style={{ top: WALLET_RISE, width: WALLET_SIZE }}
            aria-hidden="true"
          >
            <GlassArt
              name="wallet"
              hue={short ? '#ef4444' : accentColor}
              size={200}
              style={{ width: WALLET_SIZE, height: WALLET_SIZE }}
              className="absolute left-0 top-0"
            />
          </span>
          <span className="relative block pr-28 text-11 font-semibold text-slate-500 dark:text-slate-400">Safe to spend</span>
          <span className="relative block pr-28 mt-1 text-22 leading-none font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
            <RollingNumber id="home:safe" value={forecast.safeToSpend} format={v => fmt(v)} />
          </span>
          <span className={`relative block pr-28 mt-1.5 text-12 ${short ? 'text-red-500 dark:text-red-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
            {short
              ? `Runs short on ${short.date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
              : forecast.floor > 0 ? `${until}, above your ${fmtCompact(forecast.floor)} floor` : until}
          </span>
        </Link>
        {noIncome && (
          <>
            <Divider inset="row" />
            <button
              type="button"
              onClick={() => navigate('/recurring/new?type=income')}
              className={`w-full text-left px-4 py-3 text-xs font-semibold text-primary
                active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors${items.length ? '' : ' rounded-b-2xl'}`}
            >
              Add your payday to see what&apos;s ahead
            </button>
          </>
        )}
        {items.length > 0 && <Divider />}
        {items.map((item, i) => (
          <UpcomingRow key={item.key} item={item} isLast={i === items.length - 1} />
        ))}
      </Card>
    </section>
  )
}
