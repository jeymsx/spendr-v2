import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import Skeleton from '../../components/ui/Skeleton'

/**
 * The ledger, before it has been read.
 *
 * The query's empty default used to be indistinguishable from an empty
 * history, so every visit opened on "No transactions found" and then filled
 * in - the page's first word was that nothing had happened.
 *
 * ── TxRow's box, not SkeletonRow's ──
 *
 * A ledger row is px-4 py-3 around a 40px tile, which is 64px. The shared
 * SkeletonRow is the 68px a BillMark list measures, and four pixels a row is
 * a 36px jump by the tenth one. So the row here is TxRow's own padding and
 * tile, with bars where its two lines of text go.
 *
 * ── The day groups are a fixed pattern ──
 *
 * How many rows each day holds is the data. All this has to do is fill the
 * screen at the right pitch, and the real list runs off the bottom of it
 * either way, so a guess at the grouping costs nothing a thumb can see.
 */
const GROUPS = [3, 4, 2]

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="w-10 h-10 rounded-2xl shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <Skeleton className="h-[13px] w-1/2 rounded-md" />
        <Skeleton className="h-[11px] w-1/3 rounded-md" />
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <Skeleton className="h-[13px] w-16 rounded-md" />
        <Skeleton className="h-[10px] w-10 rounded-md" />
      </div>
    </div>
  )
}

export default function LedgerSkeleton() {
  return (
    <div>
      {/* The shapes are hidden from a screen reader; what they mean is not.
          sr-only is absolutely placed, so it moves nothing. */}
      <p className="sr-only" role="status">Loading transactions</p>
      <div aria-hidden="true">
        {GROUPS.map((rows, g) => (
          <div key={g} className="mb-1">
            {/* The day heading's py-2 around its tallest line: the text-11
                count, which carries no line-height and so inherits the body's
                1.5 - 16.5px, half a pixel over the text-xs date beside it. */}
            <div className="flex items-center gap-3 px-5 h-[32.5px]">
              <Skeleton className="h-3 w-20 rounded-md" />
              <Divider className="flex-1" />
              <Skeleton className="h-[11px] w-10 rounded-md" />
            </div>
            <Card clip className="mx-5">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i}>
                  <RowSkeleton />
                  {i < rows - 1 && <Divider inset="glyph" />}
                </div>
              ))}
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}
