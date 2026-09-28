import { useEffect, useMemo, useRef, useState } from 'react'
import Rail from '../../components/ui/Rail'
import SectionHeading from '../../components/ui/SectionHeading'
import { GlassArt } from '../../components/glass/GlassArt'
import { useTheme } from '../../context/ThemeContext'
import { recapPalette } from '../recap/theme'

/**
 * Small true things about the period - a quiet-day count, the heaviest day
 * of the week, what the top two categories came to - side by side, to swipe
 * through.
 *
 * They were one card at the top of the page that showed one of them at
 * random and swapped on a tap, so most of them were never seen and the one
 * that was sat between the headline and the chart. Now every one is here,
 * in order, after the breakdown they add to.
 *
 * Two are left out because the page already says them: the savings rate is
 * on the Net card, and the biggest purchase is on the Top expenses card.
 *
 * ── What they are made of ──
 *
 * The app's own material: the accent's gradients and grain, the surface the
 * Wrapped card and its story are made of, which is the wallet on Home's
 * recipe. They were a pale accent haze with a line icon watermarked in the
 * corner - the only surface of its kind. Each card takes the next of the
 * story's tones, so a row of them reads as one family rather than one
 * colour repeated, and carries a glass picture for its kind of fact, large
 * and cut off by the corner. The Clean style keeps its flat white cards,
 * with the picture in the accent.
 *
 * ── How the pictures move ──
 *
 * Each one assembles the first time its card comes into view - the solid
 * piece slides in, the glass settles over it, the mark lands last - so
 * swiping along the row, every card arrives as you reach it. A tap does it
 * again, with the picture lifting and tilting as it comes together, and the
 * card gives under the finger. Nothing loops: a row of eight pictures
 * bobbing forever would be noise, and each is a live filter graph. All of
 * it stops for reduced motion.
 */

const SAID_ELSEWHERE = new Set(['savings', 'biggest'])

/** The glass picture for each kind of fact (Trivia's icon keys). */
const GLASS = {
  calendar: 'calendar',
  receipt: 'receipt',
  trophy: 'trophy',
  check: 'shield',
  alert: 'flame',
  target: 'target',
  coins: 'piggy',
  trend: 'chartUp',
  chart: 'gauge',
  calc: 'bag',
}

/**
 * The facts worth a card here: all but the ones the page already says.
 *
 * @param {Array<{key: string, icon: string, text: string}>} items
 */
export function shownHighlights(items) {
  return items.filter(i => !SAID_ELSEWHERE.has(i.key))
}

/** @param {{items: Array<{key: string, icon: string, text: string}>}} props */
export default function Highlights({ items }) {
  const { accentColor, theme, style } = useTheme()
  const dark = theme === 'dark'
  const flat = style === 'flat'
  const pal = useMemo(() => recapPalette(accentColor, dark ? 'dark' : 'light'), [accentColor, dark])
  const shown = shownHighlights(items)
  if (!shown.length) return null
  const shadow = dark
    ? '0 12px 28px -16px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.16)'
    : '0 12px 26px -16px rgba(15, 23, 42, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
  return (
    <section>
      <SectionHeading>Highlights</SectionHeading>
      <Rail className="gap-3 px-5 snap-x snap-mandatory scroll-px-5 pb-2 -mb-2" role="list" aria-label="Highlights">
        {shown.map((item, i) => (
          <HighlightCard
            key={item.key}
            item={item}
            tone={pal.tones[i % pal.tones.length]}
            ink={pal.ink}
            flat={flat}
            accentColor={accentColor}
            shadow={shadow}
          />
        ))}
      </Rail>
    </section>
  )
}

/**
 * One highlight: the sentence, and its picture - assembled when the card
 * first comes into view, and again on every tap.
 *
 * @param {{item: {key: string, icon: string, text: string}, tone: {light: string, background: string},
 *          ink: string, flat: boolean, accentColor: string, shadow: string}} props
 */
function HighlightCard({ item, tone, ink, flat, accentColor, shadow }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null))
  // Without an observer to say when it is in view (jsdom, old WebViews), it is simply there.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  const [taps, setTaps] = useState(0)

  // Half in view along the row, the first time: the picture arrives.
  useEffect(() => {
    const el = ref.current
    if (seen || !el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])

  return (
    <div
      ref={ref}
      role="listitem"
      onClick={() => { setSeen(true); setTaps(t => t + 1) }}
      className={`press relative isolate shrink-0 snap-start w-[264px] h-[104px] rounded-[22px] overflow-hidden flex items-center pl-4 cursor-pointer select-none [--press-scale:0.97]${flat ? ' card' : ''}`}
      style={flat ? undefined : { background: tone.background, boxShadow: shadow }}
    >
      {!flat && <span className="recap-texture" aria-hidden="true" />}
      {/* Large and cut off by the corner - it is the card's picture, not an
          icon to read; the sentence says it all. Keyed by the tap count, so
          each tap mounts it afresh and it comes together again. */}
      <span
        key={taps}
        aria-hidden="true"
        className={`pointer-events-none absolute -right-4 -bottom-5 block w-[116px] h-[116px]${taps ? ' highlight-lift' : ''}`}
      >
        {seen && (
          <GlassArt
            name={GLASS[item.icon] ?? 'chartUp'}
            hue={flat ? accentColor : tone.light}
            size={116}
            animate
          />
        )}
      </span>
      <p
        className={`relative max-w-[60%] text-13 font-medium leading-snug line-clamp-4${flat ? ' text-slate-700 dark:text-slate-200' : ''}`}
        style={flat ? undefined : { color: ink }}
      >
        {item.text}
      </p>
    </div>
  )
}
