import { useEffect, useMemo, useState } from 'react'
import { monthName, parseMonth } from '../../lib/recap'
import { SUMMARY_TILES, personalityOf, summaryHero, summaryTiles } from '../../lib/recapCopy'
import { ConfettiBurst } from '../../components/Confetti'
import { CONFETTI } from './assets'
import { Art, LogoChip } from './art'
import { Piece, Pill, Stack, Tile, useRowsThatFit, useSlide } from './parts'
import { WrappedMark } from './slides'

/** One row of tiles, and the space between rows. */
const TILE_PX = 62
const TILE_GAP_PX = 8

/**
 * The last slide: the month on one card.
 *
 * The tiles are summaryTiles, and the headline summaryHero - the same ones
 * the saved picture draws (pictures.js), so the picture is this slide,
 * poster-sized. A phone too short for every tile shows the first rows; the
 * picture always has them all. Keeping it and sending it are the story's
 * own Done and Share, at the foot of the screen.
 *
 * @param {{recap: import('../../lib/recap').Recap, name?: string}} props
 */
export default function SummarySlide({ recap, name }) {
  const { pal, currency } = useSlide()
  const tiles = summaryTiles(recap, currency)
  const hero = summaryHero(recap, currency)
  const persona = useMemo(() => personalityOf(recap), [recap])
  const { year } = parseMonth(recap.month)
  const [listRef, rows] = useRowsThatFit(TILE_PX, TILE_GAP_PX, Math.ceil(SUMMARY_TILES / 2))
  const [burst, setBurst] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setBurst(true), 380)
    return () => clearTimeout(t)
  }, [])

  return (
    <Stack className="relative h-full flex flex-col p-6">
      {burst && <span className="absolute inset-x-0 top-[34%] h-0"><ConfettiBurst count={42} colors={CONFETTI} /></span>}
      <Art name="party-popper" size="min(17cqw, 11cqh)" className="right-4 top-4" rotate={-8} delay={0.3} />

      <Piece className="flex items-center gap-2 min-w-0 pr-16">
        <LogoChip size={30} />
        <span className="text-15 font-semibold" style={{ color: pal.ink }}>Spendr</span>
        <span className="text-15" style={{ color: pal.muted }}>· {year}</span>
      </Piece>

      <Piece className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 className="text-34 font-semibold tracking-tight leading-tight" style={{ color: pal.ink }}>{monthName(recap.month)}</h2>
        <WrappedMark delay={0.3} small />
      </Piece>
      <Piece className="mt-2 flex">
        <span
          className="inline-flex max-w-full items-center gap-1.5 h-8 px-3 rounded-full text-13 font-semibold shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
          style={{ backgroundColor: pal.paper, color: pal.deepInk }}
        >
          <span className="text-15 leading-none shrink-0" aria-hidden="true">{persona.emoji}</span>
          {/* A long name gives way, not the personality: that is the news. */}
          {name && <span className="truncate">{name}:{' '}</span>}
          <span className="shrink-0">{persona.name}</span>
        </span>
      </Piece>

      <Piece className="mt-4">
        <p className="text-13" style={{ color: pal.muted }}>{hero.label}</p>
        <p className="text-38 font-semibold tracking-tight leading-tight tabular-nums truncate" style={{ color: pal.ink }}>{hero.value}</p>
        {hero.line && <Pill className="mt-1">{hero.line}</Pill>}
      </Piece>

      {/* Takes whatever height is left. */}
      <Piece className="mt-5 flex-1 min-h-0 overflow-hidden">
        <div ref={listRef} className="h-full">
          {tiles.length > 0 && (
            <ul className="grid grid-cols-2" style={{ gap: TILE_GAP_PX }}>
              {tiles.slice(0, rows * 2).map((t, i) => (
                <Tile key={t.label} {...t} height={TILE_PX} delay={0.35 + i * 0.07} tilt={i % 2 ? 3 : -3} />
              ))}
            </ul>
          )}
        </div>
      </Piece>
    </Stack>
  )
}
