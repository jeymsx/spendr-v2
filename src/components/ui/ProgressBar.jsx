import { cx } from './cx'

/**
 * One bar, for every proportion this app draws.
 *
 * ── What it settles ──
 *
 * There were eight recipes. Three track greys - white/[0.07] on insights,
 * white/[0.08] on debts, white/[0.10] on budget and goals - and four heights,
 * h-1 through h-2.5, for the same object. Two of them sat on ONE screen: the
 * budget page's category rows at h-1.5 and its "Where the budget goes" rows
 * at h-2.5, in different greys, which is what makes that page look assembled
 * rather than designed.
 *
 * slate-200 / white-10% wins because it is the most common and the most
 * legible of the three; anything fainter disappears under a coloured fill.
 *
 * ── `scale` is not decoration, which is why it survived ──
 *
 * Those two budget charts are not the same chart drawn badly. The category
 * rows show each category against ITS OWN limit, so every track is full width
 * and the fill is a percentage of it. "Where the budget goes" shows the
 * categories against EACH OTHER, so the track's own length carries the size
 * of the budget and the fill sits on that shared scale - which is the only
 * reason you can see at a glance that Food's limit dwarfs Transpo's.
 *
 * Forcing the two to look identical would have thrown that away. So the
 * geometry is shared and the encoding is a prop: `scale` shortens the track,
 * and everything else - grey, height, radius, easing - comes from here.
 */
export default function ProgressBar({
  /** 0-100. Values over 100 fill the bar; use `marker` to show the overshoot. */
  value = 0,
  /** The fill's colour, as a value. A category's own colour, usually. */
  color,
  /**
   * The fill's colour as a class, for the fills that are the accent or a
   * semantic tone rather than data - `bg-primary`, `bg-emerald-500`. Two
   * callers resolved this by hand because the first version only took a
   * value, and `bg-primary` cannot be one: it is a CSS variable the theme
   * rewrites.
   */
  fillClass = '',
  /**
   * Track width as a percentage, for bars meant to be compared with each
   * other. Leave it at 100 for a bar that stands alone.
   */
  scale = 100,
  /**
   * Draw a line at the track's end. For a comparative bar that has run past
   * its own limit, where the overshoot is otherwise invisible.
   */
  marker = false,
  className = '',
}) {
  /* One thickness, and no prop to choose another.
     
     The first version offered `sm` and `md`, which sounds harmless and is not:
     the budget page immediately ended up with 6px category rows above 8px
     comparative rows, and goals with an 8px card bar above 6px row bars. Two
     bars of different weights on one screen read as a mistake whatever the
     reason, and the reason here was only that a prop existed to make them
     differ. 6px is what four of the six call sites already were. */
  const h = 'h-1.5'

  /* A sliver rather than nothing, once there is anything at all to show.
     Goals and Debts both did this by hand - `Math.max(pct > 0 ? 2 : 0, pct)`
     - because a goal with 40 pesos in it against a 100,000 target rounds to a
     bar you cannot see, which reads as "nothing saved" rather than "barely
     started". */
  const raw = Math.max(0, Math.min(value, 100))
  const pct = raw > 0 ? Math.max(raw, 2) : 0

  /* A full-width track is one element with a fill inside it and can clip its
     own corners. A scaled one cannot: the fill has to sit on the SAME origin
     as the track rather than inside it, or a bar at 100% of a half-width
     track would stop halfway across the chart. */
  if (scale >= 100) {
    return (
      <div className={cx(h, 'rounded-full overflow-hidden bg-slate-200 dark:bg-white/[0.10]', className)}>
        <div
          className={cx('h-full rounded-full transition-all duration-700', fillClass)}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    )
  }

  return (
    <div className={cx('relative', h, className)}>
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-slate-200 dark:bg-white/[0.10]"
        style={{ width: `${Math.max(0, Math.min(scale, 100))}%` }}
      />
      <div
        className={cx('absolute inset-y-0 left-0 rounded-full transition-all duration-700', fillClass)}
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
      {marker && (
        <span
          className="absolute -top-1 -bottom-1 w-[2px] rounded-full bg-slate-900/45 dark:bg-white/70"
          style={{ left: `calc(${Math.min(scale, 100)}% - 1px)` }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
