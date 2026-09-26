import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { useTheme } from '../../context/ThemeContext'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { useToast } from '../../context/ToastContext'
import { monthName } from '../../lib/recap'
import { wrappedTitle } from '../../lib/recapCopy'
import { canSendFiles } from '../../lib/share'
import { CONFETTI, seeded, seedOf } from './assets'
import { Art, Glow, Rays } from './art'
import { SlideContext, Sticker } from './parts'
import { readRecapInputs, recapFrom, useMonthIcons } from './recapData'
import ShareSheet from './ShareSheet'
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
 * The button beside View opens the story's own share sheet on its summary
 * picture - the same figures as the story (recapData.js), the same switch to
 * leave the amounts out - read when it is tapped, not before.
 */

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
  const own = useMonthIcons(month)
  const bits = useConfetti(month)
  const title = wrappedTitle(month)
  const name = monthName(month)
  const [sends] = useState(canSendFiles)
  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState(/** @type {{recap: import('../../lib/recap').Recap, name?: string}|null} */ (null))

  const icons = useMemo(() => [...new Set([...(own ?? []), '💸', '🛍️', '🧾'])].slice(0, 3), [own])
  const open = () => navigate(`/recap/${month}`)

  /* The month is read on the tap: the sheet opens at once on its spinner,
     and the preview follows as soon as the figures are in. */
  function share() {
    setSharing(true)
    readRecapInputs().then(
      inputs => setShared({ recap: recapFrom(inputs, { month, currency }), name: inputs.name || undefined }),
      () => {
        setSharing(false)
        showToast('Could not read this month. Try again.', 'error')
      },
    )
  }

  const cardShadow = mode === 'dark'
    ? '0 14px 34px -18px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.16)'
    : '0 14px 30px -18px rgba(15, 23, 42, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.2)'

  return (
    <MotionConfig reducedMotion="user">
      <SlideContext.Provider value={context}>
        <section className={className}>
          <div className="relative isolate overflow-hidden rounded-[28px]" style={{ background: pal.tones[0].background, boxShadow: cardShadow }}>
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
                  aria-label={sends ? `Share ${title}` : `Save ${title} picture`}
                  className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                  style={{ backgroundColor: pal.track, color: pal.ink }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {sends
                      ? <path d="M12 15V4M8 8l4-4 4 4M6 12H5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-1" />
                      : <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />}
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>
      </SlideContext.Provider>
      <ShareSheet
        open={sharing}
        onClose={() => setSharing(false)}
        id="summary"
        recap={shared?.recap ?? null}
        currency={currency}
        pal={pal}
        name={shared?.name}
      />
    </MotionConfig>
  )
}
