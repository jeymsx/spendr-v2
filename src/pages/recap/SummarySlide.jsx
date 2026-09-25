import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { summaryHero, summaryRows } from '../../lib/recapCopy'
import { saveFile } from '../../lib/share'
import { Eyebrow, Piece, Stack, heroClass, useRowsThatFit, useSlide } from './parts'
import { renderSummaryImage } from './summaryImage'
import { SPRING } from './theme'

/** Long enough for the slide's entrance to have settled before drawing starts. */
const DRAW_AFTER_MS = 1000
/** One summary row. */
const ROW_PX = 48

/**
 * The last slide: the month on one card, and a way to keep it.
 *
 * The rows are summaryRows, and the headline summaryHero - the same ones the
 * saved picture draws, in the same colours, so the picture is this card. A
 * phone too short for every row shows the first few; the picture always has
 * them all.
 *
 * ── The picture is ready before the tap ──
 *
 * It is drawn while the slide is being read, not when Save is pressed. An
 * iPhone opens the share sheet only from inside the tap itself, and drawing
 * and encoding a 1080x1350 PNG first could use that tap up. Drawn ahead, the
 * share sheet is the first thing the tap does - and the button answers at
 * once instead of after a pause.
 *
 * @param {{recap: import('../../lib/recap').Recap, name?: string, onDone: () => void}} props
 */
export default function SummarySlide({ recap, name, onDone }) {
  const { pal, currency } = useSlide()
  const rows = summaryRows(recap, currency)
  const hero = summaryHero(recap, currency)
  const [listRef, room] = useRowsThatFit(ROW_PX, 0, rows.length)
  const [state, setState] = useState(/** @type {'idle'|'busy'|'saved'|'retry'|'failed'} */ ('idle'))

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

  async function save() {
    if (state === 'busy') return
    setState('busy')
    try {
      const blob = picture.current
        ?? await (drawing.current ?? renderSummaryImage({ recap, currency, pal, name }))
      const how = await saveFile(blob, `spendr-recap-${recap.month}.png`)
      /* The share sheet is its own confirmation; a download gets one here.
         'blocked' is an iPhone that let the tap lapse before the sheet
         opened - only if Save was pressed before the picture was ready - and
         the picture is ready now, so one more tap opens it. */
      setState(how === 'downloaded' ? 'saved' : how === 'blocked' ? 'retry' : 'idle')
    } catch {
      setState('failed')
    }
  }

  const note = {
    saved: 'Saved to your downloads',
    retry: 'Ready. Tap Save image again.',
    failed: 'Could not save it. Try again.',
  }[state] ?? null

  return (
    <Stack className="h-full flex flex-col p-7">
      <Eyebrow>That was {recap.label}</Eyebrow>
      <Piece className="mt-4">
        <p className="text-13" style={{ color: pal.muted }}>{hero.label}</p>
        <p className={`${heroClass(hero.value)} font-semibold tracking-tight leading-tight tabular-nums`} style={{ color: pal.ink }}>{hero.value}</p>
        {hero.line && <p className="text-15 mt-1" style={{ color: pal.muted }}>{hero.line}</p>}
      </Piece>

      {/* Takes whatever height is left, so the buttons below always fit. */}
      <Piece className="mt-6 flex-1 min-h-0 overflow-hidden">
        <div ref={listRef} className="h-full">
          {rows.length > 0 && (
            <dl className="rounded-3xl px-5" style={{ backgroundColor: pal.bg }}>
              {rows.slice(0, room).map((r, i) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between gap-4"
                  style={{ height: ROW_PX, ...(i ? { borderTop: `1px solid ${pal.track}` } : {}) }}
                >
                  <dt className="text-15 shrink-0 whitespace-nowrap" style={{ color: pal.muted }}>{r.label}</dt>
                  <dd className="min-w-0 text-15 font-semibold tabular-nums truncate text-right" style={{ color: r.tone === 'good' ? pal.good : r.tone === 'soft' ? pal.soft : pal.ink }}>
                    {r.value}
                  </dd>
                </div>
              ))}
            </dl>
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
          <div className="flex gap-3" data-interactive>
            <button
              type="button"
              onClick={onDone}
              className="flex-1 h-12 rounded-full text-15 font-semibold active:scale-[0.98] transition-transform"
              style={{ backgroundColor: pal.track, color: pal.ink }}
            >
              Done
            </button>
            <button
              type="button"
              onClick={save}
              disabled={state === 'busy'}
              aria-busy={state === 'busy' || undefined}
              className="flex-[1.4] h-12 rounded-full text-15 font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
              style={{ backgroundColor: pal.ink, color: pal.surface }}
            >
              {state === 'busy' ? 'Saving…' : 'Save image'}
            </button>
          </div>
        </div>
      </Piece>
    </Stack>
  )
}
