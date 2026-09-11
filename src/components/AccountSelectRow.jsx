import { accountBrand } from '../lib/accountBrands'
import { fmt } from '../lib/accountMeta'
import BrandMark from './BrandMark'
import { IconChevronRight } from './icons'

/**
 * The account field on the expense, inflow and transfer forms.
 *
 * It used to be a 24px colour square, the name, and the balance pushed to the
 * far right where the chevron normally lives - so the row had no affordance
 * saying it could be tapped, and the balance was doing that job by accident.
 *
 * Now it is the account as you already know it: the card, then its name with
 * the balance under it, then a Change chip. The chip is inside the button
 * rather than beside it - the whole row is one target, which is what you want
 * on a phone, and the chip is there to say the row does something.
 *
 * The card is a real thumbnail, not a swatch. accountBrand gives the same
 * gradient and mark the full-size card uses, so GCash is the blue one here
 * and on the accounts screen and in the wallet, and you pick it by
 * recognising it rather than by reading.
 */
export default function AccountSelectRow({
  account,
  onClick,
  error = false,
  errorText = 'Required',
  emptyText = 'Select account',
  /* What this row is FOR, when the screen no longer says it in text. The
     transfer form drops its From and To labels so the arrow between the two
     rows can sit centred, and the arrow is a graphic - so the role each row
     plays has to survive somewhere a screen reader can reach. */
  ariaLabel,
  /* Headroom on a credit account. Passed in rather than read off the row,
     because it is derived from the ledger - see useCreditAvailMap - and this
     component has no business running that. */
  creditAvailable = null,
}) {
  const brand = account ? accountBrand(account) : null

  /* Credit shows headroom, everything else shows what is in it. A card's
     "balance" is what you owe, which is the one number you are not deciding
     against when you pick it to spend from. */
  const sub = !account ? 'Tap to choose'
    : account.type === 'credit' ? `${fmt(creditAvailable ?? 0)} available`
    : `Balance: ${fmt(account.balance ?? 0)}`

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ? `${ariaLabel}: ${account?.name ?? 'none selected'}` : undefined}
      className={[
        'w-full flex items-center gap-3 pl-3 pr-2.5 py-2.5 rounded-2xl text-left',
        'active:bg-slate-50 dark:active:bg-primary/[0.12] transition-colors',
        'bg-white dark:bg-primary/[0.07]',
        error
          ? 'border border-red-300 dark:border-red-500/40'
          : 'border border-slate-200/80 dark:border-primary/[0.14]',
        'shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.08)]',
      ].join(' ')}
    >
      {/* The card. 1.586 is the real card ratio, the same one the full-size
          faces use, so the thumbnail is the same object seen smaller. */}
      <span
        className={[
          'shrink-0 w-[46px] h-[29px] rounded-lg flex items-center justify-center',
          'text-white overflow-hidden',
          brand ? '' : 'border border-dashed border-slate-300 dark:border-white/20',
        ].join(' ')}
        style={brand
          ? { background: `linear-gradient(135deg, ${brand.from} 0%, ${brand.to} 100%)` }
          : undefined}
      >
        {brand
          ? <BrandMark mark={brand.mark} size={15} />
          : <span className="text-slate-300 dark:text-white/25"><BrandMark mark="wallet" size={15} /></span>}
      </span>

      <span className="flex-1 min-w-0">
        <span className={`block text-sm truncate ${
          account
            ? 'font-semibold text-slate-800 dark:text-white'
            : 'font-medium text-slate-400 dark:text-slate-500'
        }`}>
          {account?.name ?? emptyText}
        </span>
        <span className="block text-[11px] truncate tabular-nums text-slate-400 dark:text-slate-500">
          {error && !account
            ? <span className="text-red-500 dark:text-red-400 font-medium tabular-nums">{errorText}</span>
            : sub}
        </span>
      </span>

      {/* Not a button. The row is the target; this says so. */}
      <span
        className="shrink-0 inline-flex items-center gap-0.5 pl-2.5 pr-1.5 py-1.5 rounded-full
          text-[11px] font-semibold
          text-slate-600 dark:text-slate-300
          bg-slate-100 dark:bg-white/[0.08]"
        aria-hidden="true"
      >
        {account ? 'Change' : 'Choose'}
        <IconChevronRight size={13} />
      </span>
    </button>
  )
}
