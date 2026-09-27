import Rail from '../../components/ui/Rail'
import SectionHeading from '../../components/ui/SectionHeading'
import { INSIGHT_GLYPH } from './Trivia'

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
 */

const SAID_ELSEWHERE = new Set(['savings', 'biggest'])

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
  const shown = shownHighlights(items)
  if (!shown.length) return null
  return (
    <section>
      <SectionHeading>Highlights</SectionHeading>
      <Rail className="gap-3 px-5 snap-x snap-mandatory scroll-px-5" role="list" aria-label="Highlights">
        {shown.map(item => {
          const Glyph = INSIGHT_GLYPH[item.icon] ?? INSIGHT_GLYPH.chart
          return (
            <div
              key={item.key}
              role="listitem"
              className="insight-aurora relative shrink-0 snap-start w-[264px] h-[96px] rounded-2xl px-4 flex items-center overflow-hidden"
            >
              {/* The watermark, big and low and clipped by the card's corner -
                  texture, not a glyph to read; the sentence says it all. */}
              <span className="pointer-events-none absolute -bottom-5 -right-4 text-white/[0.16] dark:text-white/[0.13]" aria-hidden="true">
                <Glyph size={96} strokeWidth={1.4} />
              </span>
              <p className="relative max-w-[calc(100%-36px)] text-13 font-medium text-slate-700 dark:text-slate-200 leading-relaxed line-clamp-3">
                {item.text}
              </p>
            </div>
          )
        })}
      </Rail>
    </section>
  )
}
