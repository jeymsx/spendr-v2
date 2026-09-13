import { accountBrand } from '../lib/accountBrands'
import BrandMark from './BrandMark'

/**
 * An account, as the card you already recognise.
 *
 * It was a name and an 8px colour dot on a row labelled "Account" - the
 * account reduced to the one thing about it you never learned. Everywhere
 * else in the app an account is its card: GCash is the blue one, SPayLater
 * the burnt orange one, and you pick it out without reading. accountBrand
 * gives the same gradient and mark the full-size faces use, so the thumbnail
 * here is the same object seen smaller.
 *
 * Lifted out of TxConfirmSheet because the detail sheet needs exactly this.
 * Those two sheets show the same transaction either side of the moment it is
 * written, and they were drawing the account two different ways - a card on
 * the way in, a coloured dot on the way back. Same object, same picture.
 */

/**
 * The card itself, at the real card ratio - 46x29 and 38x24 are both 1.586:1,
 * the same proportion the full-size faces use, so this is that object seen
 * smaller rather than a differently shaped swatch.
 *
 * `sm` is for the transfer pair, where two of these share one row: it buys
 * the names 8px each, which is the difference between "Maya Savings" fitting
 * and being truncated.
 */
export function CardThumb({ account, sm = false }) {
  const brand = accountBrand(account)
  return (
    <span
      className={`shrink-0 rounded-lg overflow-hidden text-white
        flex items-center justify-center ${sm ? 'w-[38px] h-[24px]' : 'w-[46px] h-[29px]'}`}
      style={{ background: `linear-gradient(135deg, ${brand.from} 0%, ${brand.to} 100%)` }}
    >
      <BrandMark mark={brand.mark} size={sm ? 13 : 15} />
    </span>
  )
}

/** The card, then what it is here and what it is called. */
export default function AccountLine({ role, account }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <CardThumb account={account} />
      <span className="flex-1 min-w-0">
        <span className="block text-11 leading-tight text-slate-400 dark:text-slate-500">
          {role}
        </span>
        <span className="block text-14 font-semibold leading-tight truncate
          text-slate-800 dark:text-slate-100">
          {account.name}
        </span>
      </span>
    </div>
  )
}

/**
 * One side of a transfer.
 *
 * No figure. Each leg used to carry what that account was out or up by, so a
 * fee showed as -5,025 leaving and +5,000 arriving. Without a fee those were
 * the headline amount twice more with signs on it, and with one the fee row
 * above already states the difference - three numbers to say what two say.
 * The leg's job is to name the account, not to restate the arithmetic.
 */
export function TransferLeg({ role, account }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <CardThumb account={account} sm />
      <span className="min-w-0">
        <span className="block text-11 leading-tight text-slate-400 dark:text-slate-500">
          {role}
        </span>
        <span className="block text-14 font-semibold leading-tight truncate
          text-slate-800 dark:text-slate-100">
          {account.name}
        </span>
      </span>
    </div>
  )
}

/**
 * The two legs with the arrow between them.
 *
 * Stacked, they were two rows that happened to be about the same event, and
 * the arrow had to sit out in the left margin pointing down a column to say
 * so. Laid out across, the movement IS the layout: source, direction,
 * destination, read in the order it happens.
 *
 * A grid, not flex: 1fr a side gives the two legs equal room whatever the
 * names are, so the arrow stays on the centre line of the sheet instead of
 * drifting toward the longer name.
 */
export function TransferLegs({ from, to }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5">
      {from ? <TransferLeg role="From" account={from} /> : <span />}
      <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      </span>
      {to ? <TransferLeg role="To" account={to} /> : <span />}
    </div>
  )
}
