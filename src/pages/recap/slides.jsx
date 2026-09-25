import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { formatAmount } from '../../lib/currency'
import {
  budgetsCopy, dayLabel, daysCopy, heroAmount, heroFormatFor, keptCopy, netWorthCopy, percent,
  spentCopy,
} from '../../lib/recapCopy'
import { monthName } from '../../lib/recap'
import AnimatedNumber from './AnimatedNumber'
import { CATEGORY_GAP_PX, CATEGORY_ROW_PX, CategoryBars, DailyBars, KeptBar, NetWorthLine } from './charts'
import { Eyebrow, Line, Piece, Stack, heroClass, useRowsThatFit, useSlide } from './parts'
import { SPRING } from './theme'

/**
 * One component per slide. Each is handed the whole recap and draws only its
 * own part of it; which slides a month gets is decided in lib/recapCopy.js,
 * and what the numbers are, in lib/recap.js. Nothing here does arithmetic
 * beyond choosing which of the recap's figures to show.
 */

/** @typedef {import('../../lib/recap').Recap} Recap */

/** How many badges the badges slide names before it counts the rest. */
const BADGES_SHOWN = 5
/** The most rows a list slide shows, on a phone tall enough for them all. */
const CATEGORY_ROWS_MAX = 6
const BUDGET_ROWS_MAX = 4
/** One budget row - name, bar, figures - and the space between rows. */
const BUDGET_ROW_PX = 56
const BUDGET_GAP_PX = 12
/** Roughly what one 32px headline line holds on a phone. */
const ONE_LINE_CHARS = 16

/**
 * The categories that fit `room` rows: all of them if they do, otherwise the
 * biggest, and everything after them added up as one last row. Never a lone
 * "Everything else" - with room for one row, that row is the top category.
 *
 * @param {Recap['categories']} categories
 * @param {number} room
 * @returns {Array<{name: string, amount: number, share: number}>}
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
    },
  ]
}

/** Money formatters bound to the ledger's currency, stable across renders. */
function useMoney() {
  const { currency } = useSlide()
  const hero = useCallback((/** @type {number} */ v) => heroAmount(v, currency), [currency])
  const exact = useCallback((/** @type {number} */ v) => formatAmount(v, currency), [currency])
  return { hero, exact }
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
    <Piece className="mt-1">
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
    <div className={`relative mt-1 overflow-hidden ${wrap ? 'h-18' : 'h-11'}`}>
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

/** @param {{recap: Recap, name?: string}} props */
export function IntroSlide({ recap, name }) {
  const { pal } = useSlide()
  return (
    <Stack className="h-full flex flex-col items-center justify-center text-center px-6">
      <Piece><p className="text-15 font-medium" style={{ color: pal.bg, opacity: 0.75 }}>{name ? `${name}'s` : 'Your'} month</p></Piece>
      {/* The month alone - "December 2025" would not fit the circle, and the
          header above already says which year. */}
      <Piece className="mt-1"><p className="text-44 font-semibold tracking-tight leading-none" style={{ color: pal.bg }}>{monthName(recap.month)}</p></Piece>
      <Piece className="mt-3"><p className="text-15" style={{ color: pal.bg, opacity: 0.75 }}>Let&apos;s look back</p></Piece>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function SpentSlide({ recap }) {
  const { pal, currency } = useSlide()
  const { exact } = useMoney()
  const copy = spentCopy(recap, currency)
  /* A month that refunds carried has its whole story in the headline and
     the line under it - figures below would only say them again. */
  return (
    <Stack className={`h-full flex flex-col p-7 ${copy.refunds ? 'justify-center' : 'justify-between'}`}>
      <div>
        <Eyebrow>{copy.label}</Eyebrow>
        <HeroFigure value={copy.value} color={copy.tone === 'good' ? pal.good : pal.ink} />
        {copy.line && <Line>{copy.line}</Line>}
      </div>
      {!copy.refunds && (
        <div className="flex gap-6">
          <Piece className="flex-1">
            <Stat label="Purchases" value={recap.purchaseCount.toLocaleString('en-US')} />
          </Piece>
          <Piece className="flex-1">
            <Stat label="A day, on average" value={exact(recap.avgPerDay)} />
          </Piece>
        </div>
      )}
    </Stack>
  )
}

/** A small labelled figure, for the bottom of a slide. */
function Stat({ label, value }) {
  const { pal } = useSlide()
  return (
    <>
      <p className="text-13" style={{ color: pal.muted }}>{label}</p>
      <p className="mt-1 text-20 font-semibold tabular-nums tracking-tight truncate" style={{ color: pal.ink }}>{value}</p>
    </>
  )
}

/** @param {{recap: Recap}} props */
export function KeptSlide({ recap }) {
  const { pal, currency } = useSlide()
  const { hero } = useMoney()
  const copy = keptCopy(recap, currency)
  return (
    <Stack className="h-full flex flex-col justify-between p-7">
      <div>
        <Eyebrow>{copy.label}</Eyebrow>
        <HeroFigure value={copy.value} color={copy.tone === 'good' ? pal.good : pal.soft} />
        {copy.line && <Line>{copy.line}</Line>}
      </div>
      <Piece>
        <KeptBar income={recap.income} spent={recap.spent} />
        <div className="mt-3 flex justify-between gap-3 text-13" style={{ color: pal.muted }}>
          {/* Nothing to label when refunds took spending below nothing. */}
          <span className="truncate">{recap.spent > 0 ? `Spent ${hero(recap.spent)}` : ''}</span>
          <span className="truncate">Came in {hero(recap.income)}</span>
        </div>
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
    <Stack className="h-full flex flex-col p-7">
      <Eyebrow>{selected === 0 ? 'Most went to' : 'Then'}</Eyebrow>
      <Piece><SwapTitle id={pick.name} wrap={wrap}>{pick.name}</SwapTitle></Piece>
      <Piece>
        <p className="text-15 tabular-nums" style={{ color: pal.muted }}>
          {exact(pick.amount)} · {percent(pick.share)} of your spending
        </p>
      </Piece>
      <Piece className="mt-6 flex-1 min-h-0 overflow-hidden">
        <div ref={listRef} className="h-full">
          <CategoryBars rows={rows} selected={selected} onSelect={setSelected} format={exact} />
        </div>
      </Piece>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function DaysSlide({ recap }) {
  const { pal } = useSlide()
  const { exact } = useMoney()
  const busiest = recap.busiestDay ? recap.busiestDay.day - 1 : 0
  const [selected, setSelected] = useState(busiest)
  const day = recap.daily[selected] ?? recap.daily[0]
  return (
    <Stack className="h-full flex flex-col p-7">
      <Eyebrow>{selected === busiest ? 'Your busiest day' : 'On'}</Eyebrow>
      <Piece><SwapTitle id={String(day.day)}>{dayLabel(recap.month, day.day)}</SwapTitle></Piece>
      <Piece>
        <p className="text-15 tabular-nums" style={{ color: pal.muted }}>
          {day.amount > 0 ? `${exact(day.amount)} spent` : 'Nothing spent'}
        </p>
      </Piece>
      <Piece className="mt-auto">
        <DailyBars days={recap.daily} selected={selected} onSelect={setSelected} />
        <div className="mt-2 flex justify-between text-12 tabular-nums" style={{ color: pal.muted }}>
          <span>1</span><span>{recap.days}</span>
        </div>
        <p className="mt-4 text-15 font-medium" style={{ color: pal.ink }}>{daysCopy(recap).noSpend}</p>
      </Piece>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function BiggestSlide({ recap }) {
  const b = recap.biggest
  return (
    <Stack className="h-full flex flex-col justify-center p-8">
      <Eyebrow>Biggest purchase</Eyebrow>
      <HeroFigure value={b.amount} />
      <Line clamp>{b.description} · {dayLabel(recap.month, b.day)}</Line>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function GoToSlide({ recap }) {
  const { pal } = useSlide()
  const { exact } = useMoney()
  const g = recap.goTo
  return (
    <Stack className="h-full flex flex-col justify-center p-8">
      <Eyebrow>Your go-to</Eyebrow>
      <Piece className="mt-1">
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
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function BudgetsSlide({ recap }) {
  const { pal } = useSlide()
  const { exact } = useMoney()
  const copy = budgetsCopy(recap)
  // The ones that went over come first (lib/recap.js), so they are the ones kept.
  const [listRef, room] = useRowsThatFit(BUDGET_ROW_PX, BUDGET_GAP_PX, BUDGET_ROWS_MAX)
  const rows = recap.budgets.rows.slice(0, room)
  return (
    <Stack className="h-full flex flex-col p-7">
      <Eyebrow>Budgets</Eyebrow>
      <Piece className="mt-1"><p className="text-44 font-semibold tracking-tight leading-tight" style={{ color: pal.ink }}>{copy.value}</p></Piece>
      <Line>{copy.line}</Line>
      <Piece className="mt-5 flex-1 min-h-0 overflow-hidden">
        <ul ref={listRef} className="h-full flex flex-col justify-end" style={{ gap: BUDGET_GAP_PX }}>
          {rows.map((r, i) => {
            const fill = r.limit > 0 ? Math.min(1, r.spent / r.limit) : 1
            /* The name gets the whole line and the figures sit under the
               bar, so neither has to be cut to make room for the other. */
            return (
              <li key={r.name} className="shrink-0" style={{ height: BUDGET_ROW_PX }}>
                <p className="text-14 leading-5 font-medium truncate" style={{ color: pal.ink }}>{r.name}</p>
                <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: pal.track }}>
                  <motion.div
                    className="h-full rounded-full origin-left"
                    style={{ width: `${fill * 100}%`, backgroundColor: r.over ? pal.soft : pal.good }}
                    initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ ...SPRING, delay: 0.15 + i * 0.05 }}
                  />
                </div>
                <p className="mt-1 text-13 leading-5 tabular-nums truncate" style={{ color: r.over ? pal.soft : pal.muted }}>
                  {exact(r.spent)} of {exact(r.limit)}
                </p>
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
  const nw = recap.netWorth
  const copy = netWorthCopy(recap, currency)
  const [selected, setSelected] = useState(nw.series.length - 1)
  const point = nw.series[selected] ?? nw.series[nw.series.length - 1]
  return (
    <Stack className="h-full flex flex-col p-7">
      <Eyebrow>{copy.label}</Eyebrow>
      <HeroFigure value={nw.end} />
      <Line tone={copy.tone}>{copy.line}</Line>
      <Piece className="mt-auto">
        <NetWorthLine series={nw.series} selected={selected} onSelect={setSelected} rising={nw.change > 0} />
        <div className="mt-3 flex justify-between text-13 tabular-nums" style={{ color: pal.muted }}>
          <span>{dayLabel(recap.month, point.day)}</span>
          <span style={{ color: pal.ink }}>{exact(point.value)}</span>
        </div>
      </Piece>
    </Stack>
  )
}

/** @param {{recap: Recap}} props */
export function BadgesSlide({ recap }) {
  const { pal } = useSlide()
  const n = recap.badges.length
  /* A first month can earn a handful at once. Five chips fit the card on the
     smallest phone; past that, the rest are counted rather than crowded in. */
  const shown = n > BADGES_SHOWN ? recap.badges.slice(0, BADGES_SHOWN - 1) : recap.badges
  const more = n - shown.length
  const chip = 'px-3.5 py-2 rounded-full text-15 font-medium max-w-full truncate'
  return (
    <Stack className="h-full flex flex-col justify-center p-8">
      <Eyebrow>{n === 1 ? 'A new badge' : `${n} new badges`}</Eyebrow>
      <Piece className="mt-2">
        <ul className="flex flex-wrap gap-2">
          {shown.map(b => (
            <li key={b.key} className={chip} style={{ backgroundColor: pal.track, color: pal.ink }}>{b.name}</li>
          ))}
          {more > 0 && (
            <li className={chip} style={{ backgroundColor: pal.track, color: pal.muted }}>{more} more</li>
          )}
        </ul>
      </Piece>
    </Stack>
  )
}
