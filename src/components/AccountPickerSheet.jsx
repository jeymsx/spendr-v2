import { useCreditAvailMap } from '../hooks/useCreditAvailMap'
import { accountBrand } from '../lib/accountBrands'
import { normalizeDesign } from '../lib/cardDesigns'
import { TYPE_LABEL } from '../lib/accountMeta'
import BrandMark from './BrandMark'
import Card from './ui/Card'
import Sheet from './ui/Sheet'
import { fmt } from '../lib/money'


/**
 * The account's own card face, at chip size.
 *
 * This replaced a coloured dot inside a tinted square - a generic swatch that
 * said "this account is blue" and nothing else. Everywhere else in the app an
 * account already HAS a face: the home carousel, the Accounts tab, the
 * transaction filter. Picking one from a list of dots meant recognising a
 * colour you had only ever seen as a card.
 *
 * Same class and the same custom properties as the real thing, `data-design`
 * included, so a card you restyled is the card you see here. The brand mark
 * survives a custom colour by design - accountBrand only overrides the
 * gradient - so a repainted Metrobank card still carries the Metrobank mark.
 *
 * The row keeps the name, the type and the balance. A grid of full card faces
 * was the other option and it is the wrong one for THIS sheet: choosing which
 * account to pay from is a question about balances, and a face big enough to
 * carry one legibly is a face too big to fit eight of on a screen.
 */
/* Exported: the sort sheet draws the same rows as this picker, and used to
   draw them with a coloured dot in a tinted square - the pattern
   AccountSelectRow replaced on the forms. Sorting the accounts and choosing
   one should show you the same list. */
export function AccountChip({ acct, size = 'md' }) {
  const brand = accountBrand(acct)
  const big = size === 'md'
  return (
    <span
      className={`acct-card shrink-0 flex items-center justify-center text-white ${
        big ? 'w-[46px] h-[32px] rounded-[9px]' : 'w-[40px] h-[28px] rounded-[8px]'
      }`}
      style={{ '--card-from': brand.from, '--card-to': brand.to }}
      data-design={normalizeDesign(acct.design)}
      aria-hidden="true"
    >
      <BrandMark mark={brand.mark} size={big ? 15 : 13} className="opacity-95" />
    </span>
  )
}

export default function AccountPickerSheet({ open, onClose, accounts, selected, onSelect, exclude = [] }) {
  const creditAvailMap = useCreditAvailMap(accounts)

  /* Sheet owns the overlay, the panel, the handle, the scroll lock, Escape,
     the focus trap and the exit animation. Picking closes it the ordinary
     way - the parent sets open to false and Sheet animates out. */
  const pick = (acct) => { onSelect(acct); onClose() }

  // Derive parent/child structure from all accounts (not filtered)
  const parentNames = new Set((accounts || []).filter(a => a.parentName).map(a => a.parentName))
  const selectable = (accounts || []).filter(a => !exclude.includes(a.id))

  const sortByOrder = (arr) => [...arr].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))

  // Visible parent accounts (selectable parents whose children exist)
  const visibleParents    = selectable.filter(a => parentNames.has(a.name))
  const visibleParentSet  = new Set(visibleParents.map(a => a.name))
  // Flat: not a parent, and either no parentName or parent is excluded (orphaned child)
  const flatAccts         = selectable.filter(a =>
    !parentNames.has(a.name) && (!a.parentName || !visibleParentSet.has(a.parentName))
  )
  // Single globally-ordered top-level list — respects sort_order across parents + flat
  const topLevelItems = sortByOrder([...visibleParents, ...flatAccts])

  return (
    /* 52dvh, down from 78.

       78 was chosen to fit a whole seven-account list without scrolling.
       That turned out to be the wrong goal: at nine accounts it fills the
       screen with near-identical rows, and a wall of them is harder to read
       than a short list you flick - you are picking one account, not auditing
       them.

       Measured at 390x844: rows are 60px on a 70px pitch with 42px of handle
       above, so 52dvh (439px) shows five whole rows and half of the sixth.
       The half row is the point - it says "more below" without a scrollbar,
       and the sheet opens at the top either way, since nothing here scrolls
       to the current selection. Still five rows on an SE and six on a Pro
       Max, because dvh scales with the screen where a pixel height would not.

       No title: the sheet opens from a row that already says Account, From or
       To, and every line in it is an account. ariaLabel names it for a screen
       reader without spending a line of the panel on it. */
    <Sheet
      open={open}
      onClose={onClose}
      z={130}
      scrim={40}
      maxHeight="52dvh"
      ariaLabel="Select account"
    >
      <div>
        <div className="flex flex-col gap-2">
            {topLevelItems.map(item => {
              const isParent = parentNames.has(item.name)
              if (isParent) {
                const children = sortByOrder(selectable.filter(a => a.parentName === item.name))
                return (
                  <Card key={item.id} surface="recessed" clip>
                    <AccountRow
                      acct={item}
                      selected={selected}
                      creditAvailMap={creditAvailMap}
                      onPick={pick}
                      roundedTop
                      roundedBottom={children.length === 0}
                    />
                    {children.map((acct, i) => (
                      <ChildRow
                        key={acct.id}
                        acct={acct}
                        selected={selected}
                        creditAvailMap={creditAvailMap}
                        onPick={pick}
                        isLast={i === children.length - 1}
                      />
                    ))}
                  </Card>
                )
              }
              return (
                <Card key={item.id} surface="recessed" clip>
                  <AccountRow
                    acct={item}
                    selected={selected}
                    creditAvailMap={creditAvailMap}
                    onPick={pick}
                    roundedTop
                    roundedBottom
                  />
                </Card>
              )
            })}
        </div>
      </div>
    </Sheet>
  )
}

// ── Full account row (parent or flat) ─────────────────────────────────────────

function AccountRow({ acct, selected, creditAvailMap, onPick, roundedTop = false, roundedBottom = false }) {
  const isCredit   = acct.type === 'credit'
  const isSelected = selected?.id === acct.id
  const displayBal = isCredit ? fmt(creditAvailMap?.[acct.name] ?? 0) : fmt(acct.balance)
  const balLabel   = isCredit ? 'available' : 'balance'

  return (
    <button
      onClick={() => onPick(acct)}
      className={[
        'flex items-center gap-3 w-full px-4 py-3 text-left',
        'active:opacity-70 transition-opacity duration-75',
        roundedTop    ? 'rounded-t-2xl' : '',
        roundedBottom ? 'rounded-b-2xl' : '',
        isSelected
          ? 'bg-primary/[0.08] dark:bg-primary/[0.15]'
          : 'bg-slate-50 dark:bg-white/[0.04] active:bg-slate-100 dark:active:bg-white/[0.07]',
      ].join(' ')}
    >
      <AccountChip acct={acct} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{acct.name}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{TYPE_LABEL[acct.type] ?? acct.type}</p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{displayBal}</p>
        <p className="text-10 text-slate-400 dark:text-slate-500">{balLabel}</p>
      </div>

      {isSelected && (
        <svg className="text-primary shrink-0 ml-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  )
}

// ── Child row (indented, inside group card) ───────────────────────────────────

function ChildRow({ acct, selected, creditAvailMap, onPick, isLast }) {
  const isCredit   = acct.type === 'credit'
  const isSelected = selected?.id === acct.id
  const displayBal = isCredit ? fmt(creditAvailMap?.[acct.name] ?? 0) : fmt(acct.balance)
  const balLabel   = isCredit ? 'available' : 'balance'

  return (
    <button
      onClick={() => onPick(acct)}
      className={[
        'flex items-center gap-3 w-full pl-4 pr-4 py-3 text-left',
        'active:opacity-70 transition-opacity duration-75',
        isLast ? 'rounded-b-2xl' : '',
        isSelected
          ? 'bg-primary/[0.06] dark:bg-primary/[0.12]'
          : 'bg-white/60 dark:bg-white/[0.02] active:bg-slate-50 dark:active:bg-white/[0.05]',
      ].join(' ')}
    >
      {/* A hairline connector, then the child's own face at the smaller size.
          The indent and the shorter chip carry the hierarchy that the old
          hollow dot carried - and the child gets to look like a card too,
          which matters most here: a sub-account of "Maya" is exactly the case
          where a name alone is ambiguous. */}
      <span className="w-3 shrink-0 flex items-center justify-center" aria-hidden="true">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-white/20" />
      </span>
      <AccountChip acct={acct} size="sm" />

      <div className="flex-1 min-w-0">
        <p className="text-13 font-medium text-slate-700 dark:text-slate-200 truncate">{acct.name}</p>
        <p className="text-11 text-slate-400 dark:text-slate-500">{TYPE_LABEL[acct.type] ?? acct.type}</p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-13 font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{displayBal}</p>
        <p className="text-10 text-slate-400 dark:text-slate-500">{balLabel}</p>
      </div>

      {isSelected && (
        <svg className="text-primary shrink-0 ml-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  )
}
