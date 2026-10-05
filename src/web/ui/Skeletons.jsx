import { Skeleton } from './display'

/**
 * Grey shapes where a desktop page's content is about to be - the same
 * figures, rows and panels it will have, so the page arrives into its own
 * outline instead of flashing empty. The phone has had these all along
 * (components/ui/Skeleton); these are the desktop's, drawn with its tokens
 * (pro.css `.d-skel`), and still under Reduce motion.
 */

/** One figure card: its label, its figure, the line under it. */
export function StatCardSkeleton() {
  return (
    <div className="d-panel px-6 py-5" aria-hidden="true">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-4 h-7 w-36" />
      <Skeleton className="mt-3 h-3 w-28" />
    </div>
  )
}

/** A row of figure cards, four (or three, as Net worth has). @param {{count?: 3|4}} props */
export function StatsSkeleton({ count = 4 }) {
  return (
    <div className={`${count === 3 ? 'grid-cols-3' : 'd-stats grid-cols-4'} grid gap-5 mb-8`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <StatCardSkeleton key={i} />)}
    </div>
  )
}

/**
 * Table rows, for a table's empty slot while it loads: a tile, a name and a
 * line under it, a figure at the right - a ledger row's shape.
 *
 * @param {{rows?: number}} props
 */
export function RowsSkeleton({ rows = 6 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 h-[52px] px-6 border-b border-[var(--d-border)] last:border-b-0">
          <Skeleton className="h-8 w-8 rounded-[10px] shrink-0" />
          <Skeleton className="h-3.5" style={{ width: `${28 + ((i * 37) % 30)}%` }} />
          <span className="flex-1" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      ))}
    </div>
  )
}

/** One account card, at the real ones' shape (pages/dashboard/Tiles AccountCard). */
export function CardSkeleton() {
  return <Skeleton className="rounded-[18px]" style={{ aspectRatio: '1.45' }} />
}

/**
 * Accounts' cards view: a pile's heading and total, then its cards.
 *
 * @param {{cards?: number}} props
 */
export function CardsSkeleton({ cards = 4 }) {
  return (
    <section className="mb-8" aria-hidden="true">
      <div className="d-section-head"><Skeleton className="h-5 w-28" /><Skeleton className="h-4 w-20" /></div>
      <div className="d-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {Array.from({ length: cards }, (_, i) => <CardSkeleton key={i} />)}
      </div>
    </section>
  )
}

/** A panel: its title, then rows. @param {{rows?: number, className?: string}} props */
export function PanelSkeleton({ rows = 5, className = '' }) {
  return (
    <div className={`d-panel ${className}`} aria-hidden="true">
      <div className="d-panel-head"><Skeleton className="h-4 w-32" /></div>
      <RowsSkeleton rows={rows} />
    </div>
  )
}

/** A panel with a chart in it: its title, then the chart's area. @param {{height?: number, className?: string}} props */
export function ChartPanelSkeleton({ height = 260, className = '' }) {
  return (
    <div className={`d-panel ${className}`} aria-hidden="true">
      <div className="d-panel-head"><Skeleton className="h-4 w-40" /></div>
      <div className="d-panel-body"><Skeleton className="rounded-[14px]" style={{ height }} /></div>
    </div>
  )
}

const SPLITS = {
  '8/4': ['col-span-8 d-main', 'col-span-4 d-side'],
  '7/5': ['col-span-7', 'col-span-5'],
}

/**
 * A page's body: a row of figures, then two panels side by side, the wide
 * one first.
 *
 * @param {{split?: keyof typeof SPLITS}} props
 */
export function BoardSkeleton({ split = '8/4' }) {
  const [wide, narrow] = SPLITS[split]
  return (
    <div aria-hidden="true">
      <StatsSkeleton />
      <div className="grid grid-cols-12 gap-5">
        <PanelSkeleton rows={7} className={wide} />
        <PanelSkeleton rows={4} className={narrow} />
      </div>
    </div>
  )
}

/**
 * A one-thing page (an account, a goal, a bill, a person): its picture and
 * name at the top with its chips, a row of figures, and two panels.
 */
export function DetailSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex items-center gap-4 mb-7">
        <Skeleton className="h-16 w-16 rounded-[20px] shrink-0" />
        <div className="flex-1 min-w-0">
          <Skeleton className="h-8 w-56" />
          <div className="mt-3 flex gap-2"><Skeleton className="h-7 w-24 rounded-full" /><Skeleton className="h-7 w-32 rounded-full" /></div>
        </div>
      </div>
      <StatsSkeleton />
      <div className="grid grid-cols-12 gap-5">
        <PanelSkeleton rows={4} className="col-span-5 d-side" />
        <PanelSkeleton rows={6} className="col-span-7 d-main" />
      </div>
    </div>
  )
}

/** A page while its code arrives: a title, a row of figures, two panels. */
export function PageSkeleton() {
  return (
    <div className="d-page" aria-hidden="true">
      <div className="d-page-inner" style={{ maxWidth: 1400 }}>
        <div className="d-page-head"><div><Skeleton className="h-8 w-48" /><Skeleton className="mt-3 h-4 w-32" /></div></div>
        <BoardSkeleton />
      </div>
    </div>
  )
}

/** The right half of Settings or Notes while it loads: a title and a panel of rows. */
export function PaneSkeleton() {
  return (
    <div className="px-5" aria-hidden="true">
      <Skeleton className="h-7 w-44 mb-5" />
      <PanelSkeleton rows={5} />
    </div>
  )
}
