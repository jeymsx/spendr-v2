import Skeleton, { SkeletonHero } from '../../components/ui/Skeleton'

/**
 * Insights, before the month has been read.
 *
 * The page used to draw a ₱0 month straight away - "Total spent ₱0", a
 * "No expenses this month" where the donut goes, an empty trend - and then
 * redraw it with the real figures, so every visit opened by saying you had
 * spent nothing.
 *
 * Each piece stands in for one section at that section's height, and
 * Insights.jsx swaps them one slot at a time rather than swapping the whole
 * column. That keeps NetWorthTrend mounted from the first frame, so its own
 * queries start with the page's instead of after them, and it shows its own
 * skeleton (below) while they run.
 */

/** The hero is SkeletonHero's shape exactly - 90px against HeroStats' 89.5. */
export function HeroSkeleton() {
  return (
    <div className="px-5">
      {/* The page's one loading line for a screen reader - the shapes
          below are hidden from it. sr-only moves nothing. */}
      <p className="sr-only" role="status">Loading insights</p>
      <SkeletonHero />
    </div>
  )
}

/** The h-4 spacer above the trivia card, then the card's fixed 84px. */
export function TriviaSkeleton() {
  return (
    <div className="px-5 pt-4">
      <Skeleton className="h-[84px] rounded-2xl" />
    </div>
  )
}

/* The Pie in Charts.jsx is 116 out and 90 in, centred in a 270px box. A
   radial mask cuts the hole, so the sweep crosses the ring rather than a
   disc, and the ring the chart draws lands on the one that was shimmering. */
const RING = 'radial-gradient(circle, transparent 89.5px, #000 90px)'
const LEGEND_ITEMS = 6

export function CategorySkeleton() {
  return (
    <div>
      <div className="relative mx-auto flex items-center justify-center" style={{ maxWidth: 280, height: 270 }}>
        <Skeleton
          className="rounded-full"
          style={{ width: 232, height: 232, WebkitMaskImage: RING, maskImage: RING }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
          <Skeleton className="h-[11px] w-16 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-lg" />
        </div>
      </div>
      {/* The legend's grid, with a dot, a name and a figure in each 16px cell. */}
      <div className="px-5 pt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {Array.from({ length: LEGEND_ITEMS }, (_, i) => (
          <div key={i} className="flex items-center gap-2 h-4">
            <Skeleton className="w-2.5 h-2.5 rounded-full shrink-0" />
            <Skeleton className="h-[10px] w-14 rounded-md" />
            <Skeleton className="h-[10px] w-10 rounded-md ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** SectionHeading's 24px row and its 12px under it, with the action on the right. */
function HeadingSkeleton({ action }) {
  return (
    <div className="px-5 mb-3 h-6 flex items-center justify-between gap-3">
      <Skeleton className="h-4 w-24 rounded-md" />
      {action}
    </div>
  )
}

/** Every chart on the page is a 160px ResponsiveContainer inside px-5. */
function ChartSkeleton() {
  return (
    <div className="px-5">
      <Skeleton className="h-[160px] rounded-2xl" />
    </div>
  )
}

/**
 * The trend, as it first opens: on 1M, so the area chart's 160px and not the
 * bars' 180. The action is the Expenses / Income / Net flow switch, three
 * 60px segments.
 */
export function TrendSkeleton() {
  return (
    <div>
      <HeadingSkeleton action={<Skeleton className="h-[23px] w-[180px] rounded-full" />} />
      <ChartSkeleton />
    </div>
  )
}

/**
 * Net worth: heading and delta, the chart, and its range chips under it -
 * 38px a chip, so the bar is as wide as the row it stands in for.
 */
export function NetWorthSkeleton({ chips }) {
  return (
    <div aria-hidden="true">
      <HeadingSkeleton action={<Skeleton className="h-3 w-16 rounded-md" />} />
      <ChartSkeleton />
      <div className="mt-2.5 px-5 flex justify-center">
        <Skeleton className="h-[27px] rounded-xl" style={{ width: chips * 38 }} />
      </div>
    </div>
  )
}
