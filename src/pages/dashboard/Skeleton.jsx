import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import Skeleton from '../../components/ui/Skeleton'
import { useWalletClip, rememberedWalletHeight } from './wallet'

// ── Skeleton loader ────────────────────────────────────────────────────────────

/* Kept as a name, because this file uses it fifteen times and `Skel` reads
   better in a layout sketch than the full import. It is the shared block
   now - same grey, same sweep, no second recipe. */
export const Skel = ({ className }) => <Skeleton className={className} />

export default function DashboardSkeleton() {
  /* The placeholder is the same shape and the same height as the card that
     replaces it. It was a plain `rounded-3xl h-40` block, which meant the
     handover changed the silhouette AND moved everything below it by 74px -
     the second half of the flash this page had on every reload.

     The height is whatever the card last measured on this device rather than a
     constant, because it depends on the viewport and on whether the breakdown
     is folded away. A device that has never rendered it gets 234. */
  const [walletRef, walletClip] = useWalletClip()

  return (
    <div className="min-h-full pb-4">
      {/* header */}
      <div className="flex items-start justify-between px-5 pt-safe-header pb-2">
        <div className="flex flex-col gap-2">
          <Skel className="h-6 w-20" />
          <Skel className="h-4 w-36" />
        </div>
        <Skel className="h-9 w-9 rounded-full" />
      </div>

      {/* net worth card */}
      <div className="px-5 mt-4">
        <div
          ref={walletRef}
          className="skeleton rounded-3xl"
          style={{ height: rememberedWalletHeight(), clipPath: walletClip }}
          aria-hidden="true"
        />
      </div>

      {/* account cards */}
      <div className="mt-6 px-5 flex gap-3 overflow-hidden">
        {[1, 2, 3].map(i => (
          <Skel key={i} className="shrink-0 w-40 h-24 rounded-2xl" />
        ))}
      </div>

      {/* quick add */}
      <div className="px-5 mt-6 flex gap-2">
        {[1, 2, 3].map(i => <Skel key={i} className="flex-1 h-9 rounded-2xl" />)}
      </div>

      {/* recent list */}
      <div className="px-5 mt-8">
        <Skel className="h-5 w-24 mb-3" />
        <Card radius="3xl" clip>
          {[0, 1, 2, 3].map(i => (
            <div key={i}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Skel className="w-10 h-10 rounded-2xl shrink-0" />
                <div className="flex-1 flex flex-col gap-2">
                  <Skel className="h-3.5 w-32" />
                  <Skel className="h-3 w-20" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Skel className="h-3.5 w-16" />
                  <Skel className="h-3 w-10" />
                </div>
              </div>
              {i < 3 && <Divider inset="glyph" />}
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
