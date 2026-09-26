import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { monthName, parseMonth } from '../../lib/recap'
import { SUMMARY_TILES, summaryHero, summaryTiles } from '../../lib/recapCopy'
import { canSendFiles, saveFile, sendFile } from '../../lib/share'
import { isIos } from '../../utils/platform'
import { ConfettiBurst } from '../../components/Confetti'
import { CONFETTI } from './assets'
import { Art, LogoChip } from './art'
import { Piece, Pill, Stack, Tile, useRowsThatFit, useSlide } from './parts'
import { WrappedMark } from './slides'
import { pictureName, renderSummaryImage } from './summaryImage'
import { SPRING } from './theme'

/** Long enough for the slide's entrance to have settled before drawing starts. */
const DRAW_AFTER_MS = 1000
/** One row of tiles, and the space between rows. */
const TILE_PX = 62
const TILE_GAP_PX = 8

/**
 * The last slide: the month on one card, and a way to keep it or send it.
 *
 * The tiles are summaryTiles, and the headline summaryHero - the same ones
 * the saved picture draws, so the picture is this card, poster-sized. A
 * phone too short for every tile shows the first rows; the picture always
 * has them all.
 *
 * ── Keep it, or send it ──
 *
 * On an iPhone, one button: the share sheet has Save Image in it as well as
 * Instagram and every chat. On Android the sheet sends but cannot keep, so
 * there is a Save beside Share. Anywhere without a share sheet for files -
 * a desktop browser - the button saves.
 *
 * ── The picture is ready before the tap ──
 *
 * It is drawn while the slide is being read, not when the button is pressed.
 * An iPhone opens the share sheet only from inside the tap itself, and
 * drawing and encoding a 1080x1920 PNG first could use that tap up. Drawn
 * ahead, the share sheet is the first thing the tap does.
 *
 * @param {{recap: import('../../lib/recap').Recap, name?: string, onDone: () => void}} props
 */
export default function SummarySlide({ recap, name, onDone }) {
  const { pal, currency } = useSlide()
  const tiles = summaryTiles(recap, currency)
  const hero = summaryHero(recap, currency)
  const { year } = parseMonth(recap.month)
  const [listRef, rows] = useRowsThatFit(TILE_PX, TILE_GAP_PX, Math.ceil(SUMMARY_TILES / 2))
  const [state, setState] = useState(/** @type {'idle'|'busy'|'saved'|'retry'|'failed'} */ ('idle'))
  const [sends] = useState(canSendFiles)
  const [burst, setBurst] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setBurst(true), 380)
    return () => clearTimeout(t)
  }, [])

  /* The drawing in progress, and the finished picture once there is one. Both
     start over if what the picture shows changes underneath it. */
  const drawing = useRef(/** @type {Promise<Blob>|null} */ (null))
  const picture = useRef(/** @type {Blob|null} */ (null))
  useEffect(() => {
    let live = true
    drawing.current = null
    picture.current = null
    const draw = () => {
      if (!live) return
      const p = renderSummaryImage({ recap, currency, pal, name })
      drawing.current = p
      // A failure here is left for the tap, which draws again and says so.
      p.then(b => { if (live) picture.current = b }, () => { if (live) drawing.current = null })
    }
    const t = setTimeout(() => {
      // In a quiet moment where there is one; Safari has no idle callback.
      if (typeof requestIdleCallback === 'function') requestIdleCallback(draw, { timeout: 1000 })
      else draw()
    }, DRAW_AFTER_MS)
    return () => { live = false; clearTimeout(t) }
  }, [recap, currency, pal, name])

  /** @param {'send'|'save'} how */
  async function hand(how) {
    if (state === 'busy') return
    setState('busy')
    try {
      const blob = picture.current
        ?? await (drawing.current ?? renderSummaryImage({ recap, currency, pal, name }))
      const file = pictureName(recap.month)
      const done = how === 'send' ? await sendFile(blob, file) : await saveFile(blob, file)
      /* The share sheet is its own confirmation; a download gets one here.
         'blocked' is an iPhone that let the tap lapse before the sheet
         opened - only if the button was pressed before the picture was ready
         - and the picture is ready now, so one more tap opens it. */
      setState(done === 'downloaded' ? 'saved' : done === 'blocked' ? 'retry' : 'idle')
    } catch {
      setState('failed')
    }
  }

  const note = {
    saved: 'Saved to your downloads',
    retry: 'Ready. Tap it again.',
    failed: 'Could not make the picture. Try again.',
  }[state] ?? null
  const busy = state === 'busy'

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
      {name && <Piece><p className="text-13 truncate" style={{ color: pal.muted }}>{name}&apos;s month in money</p></Piece>}

      <Piece className="mt-4">
        <p className="text-13" style={{ color: pal.muted }}>{hero.label}</p>
        <p className="text-38 font-semibold tracking-tight leading-tight tabular-nums truncate" style={{ color: pal.ink }}>{hero.value}</p>
        {hero.line && <Pill className="mt-1">{hero.line}</Pill>}
      </Piece>

      {/* Takes whatever height is left, so the buttons below always fit. */}
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

      <Piece className="pt-8">
        <div className="relative">
          {/* Above the buttons, in the gap they already leave - it takes no
              height of its own, so a short phone loses nothing to it. */}
          <div className="absolute inset-x-0 bottom-full mb-2 h-5 text-center" aria-live="polite">
            <AnimatePresence initial={false}>
              {note && (
                <motion.p
                  key={note}
                  className="absolute inset-x-0 text-13 font-medium"
                  style={{ color: state === 'failed' ? pal.soft : pal.muted }}
                  initial={{ opacity: 0, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(4px)' }}
                  transition={SPRING}
                >
                  {note}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          <div className="flex gap-2.5" data-interactive>
            <button
              type="button"
              onClick={onDone}
              className="flex-1 h-12 rounded-full text-15 font-semibold active:scale-[0.98] transition-transform"
              style={{ backgroundColor: pal.track, color: pal.ink }}
            >
              Done
            </button>
            {sends && !isIos() && (
              <button
                type="button"
                onClick={() => hand('save')}
                disabled={busy}
                aria-label="Save image"
                className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center active:scale-[0.96] transition-transform disabled:opacity-60"
                style={{ backgroundColor: pal.track, color: pal.ink }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => hand(sends ? 'send' : 'save')}
              disabled={busy}
              aria-busy={busy || undefined}
              className="flex-[1.4] h-12 rounded-full flex items-center justify-center gap-2 text-15 font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
              style={{ backgroundColor: pal.paper, color: pal.deepInk }}
            >
              {sends && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 15V4M8 8l4-4 4 4M6 12H5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-1" />
                </svg>
              )}
              {busy ? 'One moment…' : sends ? 'Share' : 'Save image'}
            </button>
          </div>
        </div>
      </Piece>
    </Stack>
  )
}
