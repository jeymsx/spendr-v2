import Sheet from '../../components/ui/Sheet'
import AmountHero from '../../components/ui/AmountHero'
import DetailRow from '../../components/ui/DetailRow'
import Button from '../../components/ui/Button'
import { fmt } from '../../lib/money'
import { isReady, cleanLink } from '../../lib/wishes'
import { fmtDay } from './shared'

/**
 * A wish, as the transaction sheet shows a transaction: what it is in a pill,
 * its price over the rule, its facts in a list, and what you can do with it -
 * Edit, and Buy - at the foot.
 *
 * Tapping a wish opens this rather than the form, because most of the time
 * you want to look at it (when does it ask? where was it sold?) or buy it,
 * and only sometimes change it.
 *
 * @param {{
 *   wish: WishRow|null,
 *   open: boolean,
 *   onClose: () => void,
 *   onEdit: (w: WishRow) => void,
 *   onBuy: (w: WishRow) => void,
 * }} props
 */
export default function WishDetailSheet({ wish, open, onClose, onEdit, onBuy }) {
  if (!wish) return null
  const now = new Date()
  const status = wish.status ?? 'waiting'
  const ready = isReady(wish, now)
  const look = status === 'bought' ? LOOK.bought
    : status === 'skipped' ? LOOK.skipped
    : ready ? LOOK.ready
    : LOOK.waiting
  const link = cleanLink(wish.link)
  const decidedOn = wish.decidedAt ? fmtDay(wish.decidedAt.slice(0, 10)) : null

  const footer = (
    <div className="flex gap-3 sheet-foot-fill">
      <Button variant="secondary" className="flex-1" onClick={() => onEdit(wish)}>Edit</Button>
      {status !== 'bought' && (
        <Button className="flex-[2]" onClick={() => onBuy(wish)}>Buy</Button>
      )}
    </div>
  )

  return (
    <Sheet open={open} onClose={onClose} ariaLabel={`${wish.name}, on your wishlist`} footer={footer}>
      <div>
        <div className="flex justify-center">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-11 font-semibold ${look.badge}`}>
            {look.label}
          </span>
        </div>

        <AmountHero color={look.color} className="mt-5 mb-6">
          {fmt(wish.price, wish.currency || undefined)}
        </AmountHero>

        <div className="flex flex-col">
          <DetailRow label="Wish" value={wish.name} padded={false} isLast />
          {status === 'waiting' && (
            <DetailRow
              label="Asks on"
              value={fmtDay(wish.coolUntil) ?? 'Not set'}
              padded={false}
              isLast
            />
          )}
          {(status === 'bought' || status === 'skipped') && decidedOn && (
            <DetailRow
              label={status === 'bought' ? 'Bought' : 'Skipped'}
              value={decidedOn}
              sub={status === 'skipped' ? `${fmt(wish.price, wish.currency || undefined)} kept` : null}
              tone={status === 'skipped' ? 'text-emerald-600 dark:text-emerald-400' : ''}
              padded={false}
              isLast
            />
          )}
          {wish.createdAt && (
            <DetailRow
              label="Added"
              value={fmtDay(wish.createdAt.slice(0, 10)) ?? ''}
              padded={false}
              isLast
            />
          )}
          {link && (
            <DetailRow
              label="Link"
              value={(
                <a href={link} target="_blank" rel="noopener noreferrer" className="accent-ink font-semibold active:opacity-60">
                  {hostOf(link)}
                </a>
              )}
              padded={false}
              isLast
            />
          )}
        </div>
      </div>
    </Sheet>
  )
}

/** The pill and the figure's colour, by where the wish is. */
const LOOK = {
  waiting: { label: 'Cooling off', color: '#64748b', badge: 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300' },
  ready: { label: 'Ready to decide', color: 'var(--color-primary)', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  skipped: { label: 'Skipped', color: '#22c55e', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  bought: { label: 'Bought', color: '#64748b', badge: 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300' },
}

/** "shopee.ph", for a link's row. @param {string} url */
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'Open link' }
}
