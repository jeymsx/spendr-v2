import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { useTheme } from '../../context/ThemeContext'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { useToast } from '../../context/ToastContext'
import { monthName } from '../../lib/recap'
import { wrappedTitle } from '../../lib/recapCopy'
import { canSendFiles, sendFile } from '../../lib/share'
import { CONFETTI, seeded, seedOf } from './assets'
import { Art, Glow, Rays } from './art'
import { SlideContext, Sticker } from './parts'
import { readRecapInputs, recapFrom, useMonthGlance } from './recapData'
import { pictureName, renderSummaryImage } from './summaryImage'
import { recapPalette } from './theme'

/**
 * "August Wrapped": the way into a month's story, and a way to share it
 * without opening it.
 *
 * It leads on Home for the first days of a month, above the budget, while
 * the month just gone is news; after that it sits on Insights, above net
 * worth, where looking back lives (wrappedOnHome). Either way it is the
 * story's first card in miniature: the accent's gradient, its grain, the
 * gift, and the month's own biggest categories as stickers around it.
 *
 * ── Share, from here ──
 *
 * The button beside View draws the same picture the story's last slide
 * saves, from the same figures (recapData.js), and hands it to the share
 * sheet. An iPhone opens that sheet only from inside the tap, and drawing
 * the picture takes longer than a tap lasts - so it is drawn ahead, once
 * the card has been on screen for a moment, and kept until anything it
 * shows changes (`stamp`). Tapped before it is ready, the button draws it
 * then, and if the tap has lapsed by the time it is done, says one more
 * tap will send it.
 */

/**
 * The picture drawn ahead, for one month as the card showed it. One slot at
 * module level, not per card: Home and Insights are never on screen at once,
 * and a trip from one to the other should not draw the same picture twice.
 *
 * @type {{key: string, drawing: Promise<Blob>|null, blob: Blob|null}}
 */
const ahead = { key: '', drawing: null, blob: null }

/**
 * The picture for `key`, drawing it if it is not drawn or being drawn.
 *
 * @param {string} key
 * @param {() => Promise<Blob>} draw
 */
function picture(key, draw) {
  if (ahead.key === key && ahead.drawing) return ahead.drawing
  const drawing = draw()
  ahead.key = key
  ahead.drawing = drawing
  ahead.blob = null
  drawing.then(
    b => { if (ahead.drawing === drawing) ahead.blob = b },
    () => { if (ahead.drawing === drawing) { ahead.key = ''; ahead.drawing = null } },
  )
  return drawing
}

/** The band's confetti: where each piece is, its shape and colour. @param {string} month */
function useConfetti(month) {
  return useMemo(() => {
    const next = seeded(seedOf(`card-${month}`))
    /* Kept to the band's edges and corners, clear of the gift in the
       middle - a scatter across the gift reads as noise on it. */
    return Array.from({ length: 16 }, (_, i) => {
      const left = i % 2 === 0
      return {
        x: left ? 3 + next() * 26 : 71 + next() * 26,
        y: 8 + next() * 80,
        r: Math.round(next() * 180),
        kind: i % 4,
        color: CONFETTI[Math.floor(next() * CONFETTI.length)],
        float: next() > 0.55,
      }
    })
  }, [month])
}

/**
 * @param {{month: string, className?: string}} props  "2026-08" - a finished month with something in it
 */
export default function WrappedCard({ month, className = '' }) {
  const navigate = useNavigate()
  const { accentColor, theme } = useTheme()
  const currency = useBaseCurrency()
  const { showToast } = useToast()
  const mode = theme === 'dark' ? 'dark' : 'light'
  const pal = useMemo(() => recapPalette(accentColor, mode), [accentColor, mode])
  const context = useMemo(() => ({ pal, tone: pal.tones[0], currency, hold: () => {} }), [pal, currency])
  const glance = useMonthGlance(month)
  const bits = useConfetti(month)
  const title = wrappedTitle(month)
  const name = monthName(month)
  const [sends] = useState(canSendFiles)
  const [busy, setBusy] = useState(false)

  const icons = useMemo(() => [...new Set([...(glance?.icons ?? []), '💸', '🛍️', '🧾'])].slice(0, 3), [glance])
  const key = glance ? [month, currency, pal.accent, pal.mode, glance.stamp].join('|') : ''

  const draw = useCallback(async () => {
    const inputs = await readRecapInputs()
    const recap = recapFrom(inputs, { month, currency })
    return renderSummaryImage({ recap, currency, pal, name: inputs.name || undefined })
  }, [month, currency, pal])

  /* Drawn ahead once the card has been properly in view for a moment, in an
     idle stretch - never on a page load that only scrolled past it. */
  const cardRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = cardRef.current
    if (!el || seen || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setSeen(true) }, { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  useEffect(() => {
    if (!seen || !key || ahead.key === key) return
    let idle = 0
    const t = setTimeout(() => {
      const go = () => { picture(key, draw).catch(() => {}) }
      if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(go, { timeout: 2000 })
      else go()
    }, 1200)
    return () => {
      clearTimeout(t)
      if (idle) window.cancelIdleCallback?.(idle)
    }
  }, [seen, key, draw])

  const open = () => navigate(`/recap/${month}`)

  async function share() {
    if (busy || !key) return
    // Ready: straight to the sheet, as the first thing the tap does.
    const ready = ahead.key === key ? ahead.blob : null
    try {
      if (ready) {
        report(await sendFile(ready, pictureName(month)))
        return
      }
      setBusy(true)
      const blob = await picture(key, draw)
      report(await sendFile(blob, pictureName(month)))
    } catch {
      showToast('Could not make the picture. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  /** @param {'shared'|'downloaded'|'cancelled'|'blocked'} done */
  function report(done) {
    if (done === 'downloaded') showToast('Saved to your downloads')
    // The picture is ready now; it was the tap that ran out.
    else if (done === 'blocked') showToast('Your picture is ready. Tap share again to send it.', 'success', { duration: 4000 })
  }

  const cardShadow = mode === 'dark'
    ? '0 14px 34px -18px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.16)'
    : '0 14px 30px -18px rgba(15, 23, 42, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.2)'

  return (
    <MotionConfig reducedMotion="user">
      <SlideContext.Provider value={context}>
        <section className={className}>
          <div ref={cardRef} className="relative isolate overflow-hidden rounded-[28px]" style={{ background: pal.tones[0].background, boxShadow: cardShadow }}>
            <span className="recap-texture" aria-hidden="true" />

            {/* The picture band. A tap on it opens the story too; the button
                below is the way in for a keyboard and a screen reader. */}
            <div className="relative h-[150px] cursor-pointer" onClick={open} aria-hidden="true">
              {bits.map((b, i) => (
                <span
                  key={i}
                  className={`absolute ${b.float ? 'recap-float' : ''}`}
                  style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: `${-i * 430}ms` }}
                >
                  <span
                    className="block"
                    style={{
                      transform: `rotate(${b.r}deg)`,
                      ...(b.kind === 0 ? { width: 12, height: 5, borderRadius: 2, backgroundColor: b.color }
                        : b.kind === 1 ? { width: 6, height: 6, borderRadius: 9, backgroundColor: b.color }
                          : b.kind === 2 ? { width: 9, height: 9, borderRadius: 9, border: `2px solid ${b.color}` }
                            : { width: 12, height: 9, borderRadius: '50%', borderTop: `2px solid ${b.color}`, borderRight: `2px solid ${b.color}` }),
                    }}
                  />
                </span>
              ))}
              <Rays size={280} className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
              <Glow color={pal.glow} size={170} className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
              <Art name="wrapped-gift" size={104} className="left-1/2 top-[22px] -ml-[52px]" rotate={-6} delay={0.1} shadow />
              <Art name="sparkles" size={34} className="left-1/2 top-[14px] ml-[40px]" delay={0.45} float={false} />
              <Sticker emoji={icons[0]} size={40} rotate={-12} delay={0.35} className="left-1/2 top-[26px] -ml-[108px]" />
              <Sticker emoji={icons[1]} size={36} rotate={10} delay={0.45} className="left-1/2 top-[84px] ml-[66px]" />
              <Sticker emoji={icons[2]} size={32} rotate={-4} delay={0.55} className="left-1/2 top-[96px] -ml-[92px]" />
            </div>

            <div className="relative px-5 pb-5">
              <h2 className="text-22 font-semibold tracking-tight leading-tight" style={{ color: pal.ink }}>{title}</h2>
              <p className="mt-1 text-14 leading-snug" style={{ color: pal.muted }}>
                Look back on and share your {name}: what you spent, where it went and what you kept.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={open}
                  className="flex-1 min-w-0 h-12 px-4 rounded-full text-15 font-semibold truncate active:scale-[0.98] transition-transform"
                  style={{ backgroundColor: pal.paper, color: pal.deepInk }}
                >
                  View {title}
                </button>
                <button
                  type="button"
                  onClick={share}
                  disabled={!key}
                  aria-busy={busy || undefined}
                  aria-label={sends ? `Share ${title}` : `Save ${title} picture`}
                  className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
                  style={{ backgroundColor: pal.track, color: pal.ink }}
                >
                  {busy ? (
                    <span className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {sends
                        ? <path d="M12 15V4M8 8l4-4 4 4M6 12H5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-1" />
                        : <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />}
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>
      </SlideContext.Provider>
    </MotionConfig>
  )
}
