import { cx } from './cx'

/**
 * The shape of what is coming, while it is still being fetched.
 *
 * ── Why it was glitchy ──
 *
 * There were 17 of these across seven pages in three different greys
 * (slate-200/white-6%, slate-100/white-4%, slate-100/white-5%), each a block
 * sized by hand to roughly the content it stood in for. Roughly is the
 * problem: a 96px placeholder followed by a 116px card moves everything below
 * it the instant the query resolves, and that jump is what reads as a flash
 * when you switch pages.
 *
 * So the sizes here come from the real rows. A list row is 40px of tile and
 * two lines of text on a 68px pitch, because that is what BillMark plus a
 * 14px name plus a 12px sub actually measures - and a skeleton row built from
 * those numbers is replaced without anything moving.
 *
 * ── Shimmer, not pulse ──
 *
 * `animate-pulse` animates opacity on the element, so the whole block fades
 * in and out and eight of them breathe in unison - which reads as the page
 * flashing. The sweep is a gradient moving across a static block, animating
 * only `transform`, so it stays on the compositor and each block is a surface
 * catching light rather than a thing blinking. See `.skeleton` in index.css,
 * which also turns the sweep off under prefers-reduced-motion.
 */

export default function Skeleton({ className = '', style, ...rest }) {
  return (
    <div
      className={cx('skeleton rounded-xl', className)}
      aria-hidden="true"
      style={style}
      {...rest}
    />
  )
}

/**
 * One list row: glyph tile, name, sub-line, and the figure on the right.
 *
 * The shape every list in this app uses - bills, debts, goals, transactions,
 * accounts. `lines={1}` for the rows that carry no sub-line.
 */
export function SkeletonRow({ lines = 2, className = '' }) {
  return (
    <div className={cx('flex items-center gap-3 px-4 h-[68px]', className)}>
      <Skeleton className="w-10 h-10 rounded-2xl shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <Skeleton className="h-[13px] w-1/2 rounded-md" />
        {lines > 1 && <Skeleton className="h-[11px] w-1/3 rounded-md" />}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <Skeleton className="h-[13px] w-16 rounded-md" />
        {lines > 1 && <Skeleton className="h-[11px] w-10 rounded-md" />}
      </div>
    </div>
  )
}

/**
 * A card of rows, in the card the real list will arrive in.
 *
 * `.card` rather than a grey block: the container is not what is loading, so
 * it can be drawn properly from the start and only its contents shimmer.
 * That also means the card does not change colour when the data lands.
 */
export function SkeletonList({ rows = 3, lines = 2, className = '' }) {
  return (
    <div className={cx('card rounded-2xl overflow-hidden', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <SkeletonRow lines={lines} />
          {i < rows - 1 && (
            <div className="h-px bg-slate-100 dark:bg-white/[0.07] mx-4" aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * The figure a page leads with: a small label, the number, a line of context.
 *
 * Bills, Goals, Accounts and AccountDetail all open this way, so their
 * loading state is the same three blocks at the same three sizes.
 */
export function SkeletonHero({ className = '' }) {
  return (
    <div className={cx('flex flex-col items-center gap-2.5 py-1', className)}>
      <Skeleton className="h-[13px] w-24 rounded-md" />
      <Skeleton className="h-9 w-44 rounded-lg" />
      <Skeleton className="h-[13px] w-32 rounded-md" />
    </div>
  )
}

/**
 * A badge, before its data arrives.
 *
 * The hexagon comes from a CSS mask on the shimmer rather than a rounded box -
 * see .skeleton-hex in index.css. A rounded rectangle standing in for a
 * hexagon is the kind of placeholder that makes the real thing jump when it
 * lands, and the badges grid is twenty of them jumping at once.
 *
 * The caption block underneath is sized to the real label so the row pitch
 * does not change either.
 */
export function SkeletonBadge({ size = 72, className = '' }) {
  return (
    <div className={cx('flex flex-col items-center gap-2', className)}>
      <Skeleton className="skeleton-hex" style={{ width: size, height: size }} />
      <Skeleton className="h-[10px] w-12 rounded-md" />
    </div>
  )
}

/** The three-across figure row under a hero. */
export function SkeletonStatTrio({ className = '' }) {
  return (
    <div className={cx('grid grid-cols-3 gap-3', className)}>
      {[0, 1, 2].map(i => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <Skeleton className="h-[17px] w-12 rounded-md" />
          <Skeleton className="h-[11px] w-16 rounded-md" />
        </div>
      ))}
    </div>
  )
}
