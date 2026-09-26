import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { formatAmount } from '../../lib/currency'
import {
  budgetsCopy, dayLabel, daysCopy, heroAmount, heroFormatFor, keptCopy, netWorthCopy, percent,
  personalityOf, spentCopy, weeksOf,
} from '../../lib/recapCopy'
import { monthName, parseMonth } from '../../lib/recap'
import { BADGES } from '../../lib/badges'
import BadgeMark from '../../components/BadgeMark'
import { ConfettiBurst } from '../../components/Confetti'
import AnimatedNumber from './AnimatedNumber'
import { ART, CONFETTI } from './assets'
import { Art, Glow, Rays } from './art'
import { CATEGORY_GAP_PX, CATEGORY_ROW_PX, CalendarHeat, CategoryRows, NetWorthArea } from './charts'
import { PriceTag, Receipt, SavingsRing, StampCard } from './objects'
import { Eyebrow, FitBox, Line, Piece, Pill, Stack, Sticker, Tile, heroClass, useRowsThatFit, useSlide } from './parts'
import { SPRING } from './theme'

/**
 * One component per slide. Each is handed the whole recap and draws only its
 * own part of it; which slides a month gets is decided in lib/recapCopy.js,
 * and what the numbers are, in lib/recap.js. Nothing here does arithmetic
 * beyond choosing which of the recap's figures to show.
 *
 * ── Words at the top, pictures below ──
 *
 * Every slide keeps its chip, figure and line in the top of the card, the
 * full width of it, and puts its picture - a receipt, a ring, a calendar - in
 * whatever height is left. So a long figure never runs into an illustration,
 * and a short phone gives up picture, never words. Sizes in `cqw`/`cqh` are
 * shares of the card: it is a size container (Deck).
 */

/** @typedef {import('../../lib/recap').Recap} Recap */

/** How many badges the badges slide shows before it counts the rest. */
const BADGES_SHOWN = 6
/** The most rows a list slide shows, on a phone tall enough for them all. */
const CATEGORY_ROWS_MAX = 6
const BUDGET_ROWS_MAX = 4
/** One budget row - name, bar, figures - and the space between rows. */
const BUDGET_ROW_PX = 56
const BUDGET_GAP_PX = 12
/** Roughly what one 32px headline line holds on a phone. */
const ONE_LINE_CHARS = 16
/** Stickers for a month whose categories have no emoji of their own. */
const FALLBACK_ICONS = ['💸', '🛍️', '🧾']

/**
 * The categories that fit `room` rows: all of them if they do, otherwise the
 * biggest, and everything after them added up as one last row. Never a lone
 * "Everything else" - with room for one row, that row is the top category.
 *
 * @param {Recap['categories']} categories
 * @param {number} room
 * @returns {Array<{name: string, amount: number, share: number, icon?: string|null}>}
 */
function foldCategories(categories, room) {
  if (categories.length <= room) return categories
  if (room < 2) return categories.slice(0, 1)
  const rest = categories.slice(room - 1)
  return [
    ...categories.slice(0, room - 1),
    {
      name: 'Everything else',
      amount: rest.reduce((s, c) => s + c.amount, 0),
      share: rest.reduce((s, c) => s + c.share, 0),
      icon: '🧺',
    },
  ]
}

/** The month's three biggest categories' emoji, for stickers. @param {Recap} r */
function topIcons(r) {
  const own = r.categories.map(c => c.icon).filter(Boolean)
  return [...own, ...FALLBACK_ICONS].slice(0, 3)
}

/** Money formatters bound to the ledger's currency, stable across renders. */
function useMoney() {
  const { currency } = useSlide()
  const hero = useCallback((/** @type {number} */ v) => heroAmount(v, currency), [currency])
  const exact = useCallback((/** @type {number} */ v) => formatAmount(v, currency), [currency])
  return { hero, exact }
}

/** A flag that turns true `ms` after mounting - for a burst that waits for its moment. @param {number} ms */
function useAfter(ms) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOn(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return on
}

/**
 * A headline figure that counts up, sized to fit its line. Every step of the
 * count is written the way the final figure is, so it never changes width -
 * or loses its centavos - halfway up.
 *
 * @param {{value: number, color?: string}} props
 */
function HeroFigure({ value, color }) {
  const { pal, currency } = useSlide()
  const format = useMemo(() => heroFormatFor(value, currency), [value, currency])
  return (
    <Piece className="mt-3">
      <p className={`${heroClass(format(value))} font-semibold tracking-tight leading-tight`} style={{ color: color ?? pal.ink }}>
        <AnimatedNumber value={value} format={format} />
      </p>
    </Piece>
  )
}

/**
 * A headline in words, swapped through a blur when it changes.
 *
 * Its height is fixed for the slide, so the rows under it never jump as the
 * words change. `wrap` reserves two lines at a slightly smaller size, for a
 * slide where any of the names it might show would not fit on one. Both
 * words are absolutely placed, so the outgoing one fades where it stood
 * while the new one arrives over it.
 */
function SwapTitle({ id, wrap = false, children }) {
  const { pal } = useSlide()
  return (
    <div className={`relative mt-2 overflow-hidden ${wrap ? 'h-18' : 'h-11'}`}>
      <AnimatePresence initial={false}>
        <motion.p
          key={id}
          className={`absolute inset-x-0 font-semibold tracking-tight leading-tight ${wrap ? 'text-28 line-clamp-2 break-words' : 'text-32 truncate'}`}
          style={{ color: pal.ink }}
          initial={{ opacity: 0, filter: 'blur(6px)', y: 8 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          exit={{ opacity: 0, filter: 'blur(6px)', y: -8, transition: { duration: 0.12 } }}
          transition={SPRING}
        >
          {children}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

/**
 * "Wrapped", on a paper label slapped on at an angle - the recap's title
 * mark, on the first card and the last.
 *
 * @param {{delay?: number, small?: boolean}} props
 */
export function WrappedMark({ delay = 0.45, small = false }) {
  const { pal } = useSlide()
  return (
    <motion.span
      className={`inline-block font-semibold tracking-tight shadow-[0_8px_20px_rgba(0,0,0,0.22)] ${small ? 'px-2.5 pt-0.5 pb-1 rounded-lg text-20' : 'px-3.5 pt-1 pb-1.5 rounded-xl text-28'}`}
      style={{ backgroundColor: pal.paper, color: pal.deepInk }}
      initial={{ opacity: 0, scale: 1.6, rotate: -16 }}
      animate={{ opacity: 1, scale: 1, rotate: -4 }}
      transition={{ ...SPRING, delay }}
    >
      Wrapped
    </motion.span>
  )
}

/**
 * The size a month's name can be and still fit the card on one line.
 * @param {string} name
 */
const titleClass = (name) => (name.length <= 6 ? 'text-64' : name.length <= 7 ? 'text-56' : 'text-44')

/** @param {{recap: Recap, name?: string}} props */
export function IntroSlide({ recap, name }) {
  const { pal } = useSlide()
  const month = monthName(recap.month)
  const icons = topIcons(recap)
  const burst = useAfter(520)
  return (
    <Stack className="relative h-full flex flex-col p-6">
      <Eyebrow emoji="✨">{name ? `${name}'s month in money` : 'Your month in money'}</Eyebrow>

      <div className="relative flex-1 min-h-0 flex items-center justify-center my-2">
        <div className="relative h-full max-h-[80cqw] aspect-square">
          <Rays size="150%" className="-left-1/4 -top-1/4" />
          <Glow color={pal.glow} size="96%" className="left-[2%] top-[2%]" />
          <Art name="wrapped-gift" size="64%" className="left-[18%] top-[16%]" rotate={-6} delay={0.15} shadow />
          <Art name="sparkles" size="24%" className="right-[4%] top-[2%]" delay={0.5} float={false} />
          <Sticker emoji={icons[0]} size={46} rotate={-12} delay={0.6} className="left-[0%] top-[18%]" />
          <Sticker emoji={icons[1]} size={40} rotate={10} delay={0.72} className="right-[0%] top-[52%]" />
          <Sticker emoji={icons[2]} size={36} rotate={-6} delay={0.84} className="left-[8%] bottom-[4%]" />
          {burst && <ConfettiBurst count={40} colors={CONFETTI} />}
        </div>
      </div>

      {/* The month alone - the header above already says which year. */}
      <Piece>
        <h2 className={`${titleClass(month)} font-semibold tracking-tight leading-none whitespace-nowrap`} style={{ color: pal.ink }}>{month}</h2>
      </Piece>
      {/* Slapped on over the foot of the month's name, as the saved picture has it. */}
      <Piece className="-mt-3 ml-4"><WrappedMark /></Piece>
      <Piece className="mt-4">
        <p className="flex items-center gap-1 text-15 font-medium" style={{ color: pal.muted }}>
          Let&apos;s look back
          <svg className="recap-nudge" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </p>
      </Piece>
    </Stack>
  )
}

/**
 * The arrow and tone of a comparison with last month.
 *
 * @param {Recap} r
 * @returns {{arrow: string, tone: 'ink'|'good'|'soft'}}
 */
function comparisonMark(r) {
  const c = r.spentChange
  if (r.firstMonth || r.prev.partial || !c) return { arrow: '✨', tone: 'ink' }
  if (c.direction === 'less') return { arrow: '↓', tone: 'good' }
  if (c.direction === 'more') return { arrow: '↑', tone: 'soft' }
  return { arrow: '≈', tone: 'ink' }
}

/** @param {{recap: Recap}} props */
export function SpentSlide({ recap }) {
  const { pal, currency } = useSlide()
  const { exact } = useMoney()
  const copy = spentCopy(recap, currency)
  const mark = comparisonMark(recap)
  const { year } = parseMonth(recap.month)
  const title = `${monthName(recap.month)} ${year}`

  /* The receipt restates the headline as a receipt would: the month a week
     at a time, adding up to the total at the foot - refunds inside the weeks
     they came back in. With no room for five lines it prints two. A month
     that refunds carried is itemised as bought and returned, and stamped. */
  const count = `${recap.purchaseCount.toLocaleString('en-US')} ${recap.purchaseCount === 1 ? 'purchase' : 'purchases'}`
  const sub = `${count} · ${exact(recap.avgPerDay)} a day`
  const items = copy.refunds
    ? [{ label: 'Bought', value: exact(recap.purchases) }, { label: 'Refunds', value: `−${exact(recap.refunded)}` }]
    : weeksOf(recap).map(w => ({ label: w.label, value: w.amount < 0 ? `−${exact(-w.amount)}` : exact(w.amount) }))
  const fallback = copy.refunds
    ? items
    : [{ label: 'Purchases', value: `×${recap.purchaseCount.toLocaleString('en-US')}` }, { label: 'A day, on average', value: exact(recap.avgPerDay) }]
  const total = { label: 'Total', value: recap.spent < 0 ? `−${exact(-recap.spent)}` : exact(recap.spent) }

  return (
    <Stack className="relative h-full flex flex-col p-6">
      <Eyebrow emoji={copy.refunds ? '🎉' : '💸'}>{copy.label}</Eyebrow>
      <HeroFigure value={copy.value} color={copy.tone === 'good' ? pal.good : pal.ink} />
      {copy.line && (
        <Piece className="mt-1">
          <Pill tone={copy.refunds ? 'good' : mark.tone}>
            <span aria-hidden="true">{copy.refunds ? '🎉' : mark.arrow}</span>
            <span className="min-w-0">{copy.line}</span>
          </Pill>
        </Piece>
      )}
      <Piece className="relative flex-1 min-h-0 mt-6 flex flex-col">
        <Receipt items={items} fallback={fallback} total={total} title={title} sub={sub} seed={`receipt-${recap.month}`} stamp={copy.refunds ? 'Refunded' : null}>
          <Art
            name={copy.refunds ? 'coin' : 'money-with-wings'}
            size="min(24cqw, 16cqh)"
            className="-right-2 -top-10"
            rotate={14}
            delay={1.1}
          />
        </Receipt>
      </Piece>
    </Stack>
  )
}

/** One row of paper tiles under a slide's picture. */
const TILE_PX = 58

/** @param {{recap: Recap}} props */
export function KeptSlide({ recap }) {
  const { pal, currency } = useSlide()
  const { hero } = useMoney()
  const copy = keptCopy(recap, currency)
  const kept = recap.net > 0
  /* The gauge is what came in. Kept something: filled to that share, the
     piggy bank in the middle with coins dropping in. Kept nothing: full, in
     the warm tone - all of it went out - with a long breath out in the
     middle instead. */
  const share = kept ? (recap.savingsRate ?? 0) : 1
  const label = kept ? `${percent(share)} kept` : recap.net < 0 ? 'Spent it all' : 'Broke even'
  return (
    <Stack className="relative h-full flex flex-col p-6">
      <Eyebrow emoji={kept ? '🐷' : recap.net < 0 ? '🌱' : '⚖️'}>{copy.label}</Eyebrow>
      <HeroFigure value={copy.value} color={copy.tone === 'good' ? pal.good : pal.soft} />
      {copy.line && <Line>{copy.line}</Line>}

      <Piece className="relative flex-1 min-h-0 flex items-center justify-center py-4">
        <div className="relative h-full max-h-[66cqw] aspect-square">
          <Glow color={pal.glow} size="76%" className="left-[12%] top-[12%] opacity-50" />
          <SavingsRing share={share} tone={kept ? 'good' : 'soft'} label={label}>
            {kept ? (
              <>
                {[0, 1, 2].map(i => (
                  <img
                    key={i}
                    src={ART.coin}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="recap-drop absolute w-[28%] left-[36%] top-[2%]"
                    style={{ animationDelay: `${1.2 + i * 0.8}s` }}
                  />
                ))}
                <Art name="pig-face" size="78%" className="left-[11%] bottom-[4%]" delay={0.3} shadow />
              </>
            ) : (
              <Art name={recap.net < 0 ? 'face-exhaling' : 'coin'} size="80%" className="left-[10%] top-[10%]" delay={0.3} shadow />
            )}
          </SavingsRing>
        </div>
      </Piece>

      <Piece>
        <ul className="grid grid-cols-2 gap-2">
          {/* Nothing spent to show when refunds took spending below nothing. */}
          {recap.spent > 0
            ? <Tile emoji="💸" label="Spent" value={hero(recap.spent)} tone={recap.net < 0 ? 'soft' : undefined} height={TILE_PX} delay={0.9} tilt={-3} />
            : <Tile emoji="💰" label="Came in" value={hero(recap.income)} height={TILE_PX} delay={0.9} tilt={-3} />}
          {kept
            ? <Tile emoji="🐷" label="Kept" value={hero(recap.net)} tone="good" height={TILE_PX} delay={0.98} tilt={3} />
            : <Tile emoji="💰" label="Came in" value={hero(recap.income)} height={TILE_PX} delay={0.98} tilt={3} />}
        </ul>
      </Piece>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function CategoriesSlide({ recap }) {
  const { pal } = useSlide()
  const { exact } = useMoney()
  const [listRef, room] = useRowsThatFit(CATEGORY_ROW_PX, CATEGORY_GAP_PX, CATEGORY_ROWS_MAX)
  const rows = foldCategories(recap.categories, room)
  const [selected, setSelected] = useState(0)
  const pick = rows[selected] ?? rows[0]
  /* From the data, never from `rows`: the rows depend on the room, and the
     room on the title's height, so a title sized by the rows could resize
     itself every frame. */
  const wrap = recap.categories.slice(0, CATEGORY_ROWS_MAX).some(c => c.name.length > ONE_LINE_CHARS)
  return (
    <Stack className="relative h-full flex flex-col p-6">
      <AnimatePresence initial={false}>
        <Sticker key={pick.name} emoji={pick.icon || '🏷️'} size={56} rotate={8} delay={0.2} className="right-5 top-5 z-10" />
      </AnimatePresence>
      <Eyebrow emoji={selected === 0 ? '🏆' : '👉'}>{selected === 0 ? 'Most went to' : 'Then'}</Eyebrow>
      <Piece className="pr-16"><SwapTitle id={pick.name} wrap={wrap}>{pick.name}</SwapTitle></Piece>
      <Piece>
        <p className="text-15 tabular-nums truncate" style={{ color: pal.muted }}>
          {exact(pick.amount)} · {percent(pick.share)} of your spending
        </p>
      </Piece>
      <Piece className="mt-5 flex-1 min-h-0 overflow-hidden">
        <div ref={listRef} className="h-full">
          <CategoryRows rows={rows} selected={selected} onSelect={setSelected} format={exact} />
        </div>
      </Piece>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function DaysSlide({ recap }) {
  const { pal } = useSlide()
  const { exact } = useMoney()
  const busiest = recap.busiestDay ? recap.busiestDay.day - 1 : -1
  const [selected, setSelected] = useState(Math.max(0, busiest))
  const day = recap.daily[selected] ?? recap.daily[0]
  return (
    <Stack className="relative h-full flex flex-col p-6">
      <Art name="spiral-calendar" size="min(19cqw, 13cqh)" className="right-5 top-5" rotate={8} delay={0.25} />
      <Eyebrow emoji={selected === busiest ? '🔥' : '📅'}>{selected === busiest ? 'Your busiest day' : 'On'}</Eyebrow>
      <Piece className="pr-16"><SwapTitle id={String(day.day)}>{dayLabel(recap.month, day.day)}</SwapTitle></Piece>
      <Piece>
        <p className="text-15 tabular-nums" style={{ color: pal.muted }}>
          {day.amount > 0 ? `${exact(day.amount)} spent` : 'Nothing spent'}
        </p>
      </Piece>
      <Piece className="relative flex-1 min-h-0 mt-4">
        <CalendarHeat month={recap.month} days={recap.daily} selected={selected} busiest={busiest} onSelect={setSelected} />
      </Piece>
      <Piece className="mt-3">
        <Pill><span aria-hidden="true">🌿</span>{daysCopy(recap).noSpend}</Pill>
      </Piece>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function BiggestSlide({ recap }) {
  const { pal } = useSlide()
  const b = /** @type {NonNullable<Recap['biggest']>} */ (recap.biggest)
  const date = dayLabel(recap.month, b.day)
  return (
    <Stack className="relative h-full flex flex-col p-6">
      <Eyebrow emoji="🛍️">Biggest purchase</Eyebrow>
      <HeroFigure value={b.amount} />
      <Line clamp>{b.description} · {date}</Line>
      <div className="relative flex-1 min-h-0 mt-3 flex items-center justify-center">
        <div className="relative aspect-square h-full max-h-[76cqw]">
          <Glow color={pal.glow} size="90%" className="left-[0%] top-[8%] opacity-50" />
          <Art name="shopping-bags" size="66%" className="left-[2%] top-[22%]" rotate={-4} delay={0.3} shadow />
          {/* Tied on at the handle: the string starts where the bag's handle is. */}
          <div className="absolute left-[56%] top-[12%] w-[36%]">
            <PriceTag emoji={b.icon || '🏷️'} label={b.category} sub={date} />
          </div>
        </div>
      </div>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function GoToSlide({ recap }) {
  const { pal } = useSlide()
  const { exact } = useMoney()
  const g = /** @type {NonNullable<Recap['goTo']>} */ (recap.goTo)
  return (
    <Stack className="relative h-full flex flex-col p-6">
      <Eyebrow emoji="📍">Your go-to</Eyebrow>
      <Piece className="mt-3">
        {/* A place people typed: a long one steps down a size and gets a
            third line, rather than being cut to its first word. */}
        <p
          className={`font-semibold tracking-tight leading-tight break-words ${g.label.length > ONE_LINE_CHARS ? 'text-28 line-clamp-3' : 'text-32 line-clamp-2'}`}
          style={{ color: pal.ink }}
        >
          {g.label}
        </p>
      </Piece>
      <Line>{g.count} times · {exact(g.amount)}</Line>
      <FitBox className="flex-1 min-h-0 mt-4">
        <div className="relative px-2 pt-4 pb-2">
          <div className="-rotate-3">
            <StampCard count={g.count} emoji={g.icon || '⭐'} seed={`${recap.month}-${g.label}`} />
          </div>
          <Art name="round-pushpin" size={48} className="left-0 top-0" rotate={-18} delay={0.35} float={false} />
        </div>
      </FitBox>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function BudgetsSlide({ recap }) {
  const { pal } = useSlide()
  const { exact } = useMoney()
  const copy = /** @type {NonNullable<ReturnType<typeof budgetsCopy>>} */ (budgetsCopy(recap))
  const b = /** @type {NonNullable<Recap['budgets']>} */ (recap.budgets)
  // The ones that went over come first (lib/recap.js), so they are the ones kept.
  const [listRef, room] = useRowsThatFit(BUDGET_ROW_PX, BUDGET_GAP_PX, BUDGET_ROWS_MAX)
  const rows = b.rows.slice(0, room)
  return (
    <Stack className="relative h-full flex flex-col p-6">
      <Art name={b.under === 0 ? 'face-exhaling' : 'bullseye'} size="min(24cqw, 16cqh)" className="right-4 top-4" rotate={6} delay={0.25} />
      <Eyebrow emoji="🎯">Budgets</Eyebrow>
      <Piece className="mt-3 pr-20"><p className="text-44 font-semibold tracking-tight leading-tight" style={{ color: pal.ink }}>{copy.value}</p></Piece>
      <Line>{copy.line}</Line>
      <Piece className="mt-5 flex-1 min-h-0 overflow-hidden">
        <ul ref={listRef} className="h-full flex flex-col justify-center" style={{ gap: BUDGET_GAP_PX }}>
          {rows.map((r, i) => {
            const fill = r.limit > 0 ? Math.min(1, r.spent / r.limit) : 1
            /* The name gets the whole line and the figures sit under the
               bar, so neither has to be cut to make room for the other. */
            return (
              <li key={r.name} className="shrink-0 flex items-center gap-3" style={{ height: BUDGET_ROW_PX }}>
                <span className="w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center text-20 leading-none" style={{ backgroundColor: pal.track }} aria-hidden="true">
                  {r.icon || '🏷️'}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-14 leading-5 font-medium truncate" style={{ color: pal.ink }}>{r.name}</span>
                    {r.over && <span className="text-11 font-semibold uppercase tracking-wider shrink-0" style={{ color: pal.soft }}>Over</span>}
                  </span>
                  <span className="mt-1.5 block h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: pal.track }}>
                    <motion.span
                      className="block h-full rounded-full origin-left"
                      style={{ width: `${fill * 100}%`, backgroundColor: r.over ? pal.soft : pal.good }}
                      initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...SPRING, delay: 0.2 + i * 0.06 }}
                    />
                  </span>
                  <span className="block mt-1 text-13 leading-5 tabular-nums truncate" style={{ color: r.over ? pal.soft : pal.muted }}>
                    {exact(r.spent)} of {exact(r.limit)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </Piece>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function NetWorthSlide({ recap }) {
  const { pal, currency } = useSlide()
  const { exact } = useMoney()
  const nw = /** @type {NonNullable<Recap['netWorth']>} */ (recap.netWorth)
  const copy = /** @type {NonNullable<ReturnType<typeof netWorthCopy>>} */ (netWorthCopy(recap, currency))
  const up = nw.change > 0
  const [selected, setSelected] = useState(nw.series.length - 1)
  const point = nw.series[selected] ?? nw.series[nw.series.length - 1]
  return (
    <Stack className="relative h-full flex flex-col p-6">
      <Eyebrow emoji={up ? '📈' : '📉'}>{copy.label}</Eyebrow>
      <HeroFigure value={nw.end} />
      <Piece className="mt-1">
        <Pill tone={copy.tone}><span aria-hidden="true">{up ? '↑' : '↓'}</span>{copy.line}</Pill>
      </Piece>
      <Piece className="relative flex-1 min-h-0 mt-6 flex flex-col justify-end">
        <div className="relative flex-1 min-h-0 max-h-[44cqh]">
          <NetWorthArea series={nw.series} selected={selected} onSelect={setSelected} rising={up} />
          <Art
            name={up ? 'rocket' : 'chart-decreasing'}
            size="min(20cqw, 14cqh)"
            className={up ? '-right-1 -top-9' : '-right-1 -top-7'}
            rotate={up ? 0 : -6}
            delay={1.2}
          />
        </div>
        <div className="mt-3 flex justify-between gap-3 text-13 tabular-nums" style={{ color: pal.muted }}>
          <span>{dayLabel(recap.month, point.day)}</span>
          <span className="font-semibold truncate" style={{ color: pal.ink }}>{exact(point.value)}</span>
        </div>
      </Piece>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function BadgesSlide({ recap }) {
  const { pal } = useSlide()
  const n = recap.badges.length
  const defs = recap.badges.map(b => BADGES.find(d => d.key === b.key) ?? { ...b, tone: 'slate', glyph: 'check' })
  /* A first month can earn a handful at once. Six fit two rows on the
     smallest phone; past that, the rest are counted rather than crowded in. */
  const shown = n > BADGES_SHOWN ? defs.slice(0, BADGES_SHOWN - 1) : defs
  const more = n - shown.length
  const one = n === 1 ? defs[0] : null
  const burst = useAfter(700)
  const cols = Math.min(3, shown.length + (more > 0 ? 1 : 0))
  return (
    <Stack className="relative h-full flex flex-col p-6">
      <Eyebrow emoji="🏅">{one ? 'A new badge' : `${n} new badges`}</Eyebrow>
      <Piece className="mt-3">
        <p className="text-32 font-semibold tracking-tight leading-tight line-clamp-2 break-words" style={{ color: pal.ink }}>
          {one ? one.name : 'Look at you go'}
        </p>
      </Piece>
      <Line>{one ? /** @type {any} */ (one).blurb ?? `Earned in ${recap.label}` : `Earned in ${recap.label}`}</Line>

      <div className="relative flex-1 min-h-0 mt-4 flex items-center justify-center">
        <Rays size="min(110cqw, 90cqh)" className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
        <Art name="glowing-star" size="min(14cqw, 10cqh)" className="left-[2%] top-[4%]" delay={0.9} float={false} />
        <Art name="sparkles" size="min(12cqw, 9cqh)" className="right-[4%] bottom-[6%]" delay={1.1} float={false} />
        <FitBox className="relative w-full h-full">
          <ul className="grid gap-x-3 gap-y-4 mx-auto" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: cols === 1 ? '60%' : cols === 2 ? '80%' : '100%' }}>
            {shown.map((b, i) => (
              <li key={b.key} className="flex flex-col items-center text-center min-w-0">
                <span className="badge-flip block w-full aspect-square" style={{ animationDelay: `${0.25 + i * 0.14}s` }}>
                  <BadgeMark badge={b} earned size={160} className="w-full h-full" />
                </span>
                {n > 1 && <span className="mt-1.5 max-w-full text-12 font-semibold line-clamp-2" style={{ color: pal.ink }}>{b.name}</span>}
              </li>
            ))}
            {more > 0 && (
              <li className="flex flex-col items-center justify-center text-center">
                <span className="w-full aspect-square rounded-full flex items-center justify-center text-20 font-semibold" style={{ backgroundColor: pal.track, color: pal.ink }}>
                  +{more}
                </span>
                <span className="mt-1.5 text-12 font-semibold" style={{ color: pal.muted }}>more</span>
              </li>
            )}
          </ul>
        </FitBox>
        {burst && <ConfettiBurst count={44} colors={CONFETTI} />}
      </div>
    </Stack>
  )
}

/**
 * The reveal before the summary: the month's money personality - a name, the
 * figure behind it, and three facts to back it (lib/recapCopy.js). Centred,
 * unlike the rest: this one is announced, not read.
 *
 * @param {{recap: Recap}} props
 */
export function PersonalitySlide({ recap }) {
  const { pal } = useSlide()
  const p = useMemo(() => personalityOf(recap), [recap])
  const burst = useAfter(900)
  return (
    <Stack className="relative h-full flex flex-col p-6">
      <Eyebrow emoji="✨">Your money personality</Eyebrow>

      <div className="relative flex-1 min-h-0 flex items-center justify-center my-2">
        <div className="relative h-full max-h-[66cqw] aspect-square">
          <Rays size="140%" className="-left-[20%] -top-[20%]" />
          <Glow color={pal.glow} size="90%" className="left-[5%] top-[5%]" />
          <Art name={p.art} size="62%" className="left-[19%] top-[16%]" rotate={-4} delay={0.25} shadow />
          <Sticker emoji={p.emoji} size={52} rotate={10} delay={0.7} className="right-[4%] top-[8%]" />
          {burst && <ConfettiBurst count={40} colors={CONFETTI} />}
        </div>
      </div>

      <div className="flex flex-col items-center text-center">
        <Piece>
          <h2 className="text-44 font-semibold tracking-tight leading-tight text-balance" style={{ color: pal.ink }}>{p.name}</h2>
        </Piece>
        <Piece className="mt-1.5">
          <p className="text-15 leading-snug line-clamp-2 break-words" style={{ color: pal.muted }}>{p.line}</p>
        </Piece>
        <Piece className="mt-4 w-full">
          <ul className="flex flex-wrap justify-center gap-2">
            {p.traits.map((t, i) => (
              <motion.li
                key={t.text}
                className="inline-flex max-w-full items-center gap-1.5 h-9 px-3 rounded-full text-13 font-semibold shadow-[0_4px_12px_rgba(0,0,0,0.14)]"
                style={{ backgroundColor: pal.paper, color: pal.deepInk }}
                initial={{ opacity: 0, scale: 0.7, rotate: i % 2 ? 4 : -4 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ ...SPRING, delay: 0.9 + i * 0.1 }}
              >
                <span className="text-15 leading-none shrink-0" aria-hidden="true">{t.emoji}</span>
                <span className="truncate">{t.text}</span>
              </motion.li>
            ))}
          </ul>
        </Piece>
      </div>
    </Stack>
  )
}
