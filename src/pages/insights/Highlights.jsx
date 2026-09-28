import { useMemo } from 'react'
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
        {shown.map((item, i) => {
          const tone = pal.tones[i % pal.tones.length]
          return (
            <div
              key={item.key}
              role="listitem"
              className={`relative isolate shrink-0 snap-start w-[264px] h-[104px] rounded-[22px] overflow-hidden flex items-center pl-4${flat ? ' card' : ''}`}
              style={flat ? undefined : { background: tone.background, boxShadow: shadow }}
            >
              {!flat && <span className="recap-texture" aria-hidden="true" />}
              {/* Large and cut off by the corner - it is the card's picture,
                  not an icon to read; the sentence says it all. */}
              <GlassArt
                name={GLASS[item.icon] ?? 'chartUp'}
                hue={flat ? accentColor : tone.light}
                size={116}
                className="pointer-events-none absolute -right-4 -bottom-5"
              />
              <p
                className={`relative max-w-[60%] text-13 font-medium leading-snug line-clamp-4${flat ? ' text-slate-700 dark:text-slate-200' : ''}`}
                style={flat ? undefined : { color: pal.ink }}
              >
                {item.text}
              </p>
            </div>
          )
        })}
      </Rail>
    </section>
  )
}
