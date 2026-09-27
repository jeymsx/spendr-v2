import Skeleton from '../../components/ui/Skeleton'

/**
 * Insights, before the period has been read.
 *
 * The page used to draw a ₱0 month straight away - "Total spent ₱0", a
 * "No expenses this month" where the donut goes - and then redraw it with
 * the real figures, so every visit opened by saying you had spent nothing.
 *
 * Each piece stands in for one section at that section's height, and the
 * page swaps them one slot at a time, so nothing below moves when the
 * figures land.
 */

/* The Pie in Charts.jsx is 116 out and 90 in, centred in a 270px box. A
   radial mask cuts the hole, so the sweep crosses the ring rather than a
   disc, and the ring the chart draws lands on the one that was shimmering. */
const RING = 'radial-gradient(circle, transparent 89.5px, #000 90px)'
const LEGEND_ITEMS = 6

/** The donut, with the total in its middle - and the page's one loading line for a screen reader. */
export function DonutSkeleton() {
  return (
    <div className="relative mx-auto flex items-center justify-center" style={{ maxWidth: 280, height: 270 }}>
      <p className="sr-only" role="status">Loading insights</p>
      <Skeleton
        className="rounded-full"
        style={{ width: 232, height: 232, WebkitMaskImage: RING, maskImage: RING }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5" aria-hidden="true">
        <Skeleton className="h-[11px] w-16 rounded-md" />
        <Skeleton className="h-6 w-24 rounded-lg" />
      </div>
    </div>
  )
}

/** Income and net: two 64px cards. */
export function StatPairSkeleton() {
  return (
    <div className="px-5 grid grid-cols-2 gap-3" aria-hidden="true">
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-16 rounded-2xl" />
    </div>
  )
}

/** The legend's grid, with a dot, a name and a figure in each 31px row. */
export function LegendSkeleton() {
  return (
    <div className="px-5 grid grid-cols-2 gap-x-4" aria-hidden="true">
      {Array.from({ length: LEGEND_ITEMS }, (_, i) => (
        <div key={i} className="flex items-center gap-2 h-[31px]">
          <Skeleton className="w-2.5 h-2.5 rounded-full shrink-0" />
          <Skeleton className="h-[10px] w-14 rounded-md" />
          <Skeleton className="h-[10px] w-10 rounded-md ml-auto" />
        </div>
      ))}
    </div>
  )
}

/** Highlights: its heading, then the first card and a sliver of the next. */
export function HighlightsSkeleton() {
  return (
    <div aria-hidden="true">
      <HeadingSkeleton />
      <div className="flex gap-3 pl-5 overflow-hidden">
        <Skeleton className="shrink-0 w-[264px] h-[96px] rounded-2xl" />
        <Skeleton className="shrink-0 w-[264px] h-[96px] rounded-2xl" />
      </div>
    </div>
  )
}

/** Explore: its heading and the four 132px cards. */
export function ExploreSkeleton() {
  return (
    <div aria-hidden="true">
      <HeadingSkeleton />
      <div className="px-5 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)}
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
