import { useState } from 'react'
import { useScrollLock } from '../hooks/useScrollLock'
import { useCreditAvailMap } from '../hooks/useCreditAvailMap'
import { accountBrand } from '../lib/accountBrands'
import { normalizeDesign } from '../lib/cardDesigns'
import BrandMark from './BrandMark'
import FadeScroller from './FadeScroller'

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

const TYPE_LABEL = { cash: 'Cash', savings: 'Savings', credit: 'Credit', ewallet: 'E-Wallet', bank: 'Bank' }

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
function AccountChip({ acct, size = 'md' }) {
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
  const [closing, setClosing] = useState(false)
  useScrollLock(open)

  const creditAvailMap = useCreditAvailMap(accounts)

  const close = () => {
    setClosing(true)
    setTimeout(() => { setClosing(false); onClose() }, 240)
  }

  const pick = (acct) => { onSelect(acct); close() }

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

  if (!open && !closing) return null

  return (
    <div className="fixed inset-0 z-[130]" style={{ touchAction: 'none' }}>
      <div className="sheet-overlay absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div
        className={[
          closing ? 'sheet-panel-exit' : 'sheet-panel',
          'absolute bottom-0 inset-x-0 rounded-t-[28px]',
          'bg-white dark:bg-[#111820]',
          'border-t border-slate-100 dark:border-white/[0.07]',
          'flex flex-col overflow-hidden',
        ].join(' ')}
        /* 52dvh, down from 78.

           78 was chosen to fit a whole seven-account list without scrolling.
           That turned out to be the wrong goal: at nine accounts it fills
           the screen with near-identical rows, and a wall of them is harder
           to read than a short list you flick - you are picking one account,
           not auditing them.

           Measured at 390x844: rows are 60px on a 70px pitch with 42px of
           handle above, so 52dvh (439px) shows five whole rows and half of
           the sixth. The half row is the point - it says "more below"
           without a scrollbar, and the sheet opens at the top either way,
           since nothing here scrolls to the current selection. Still five
           rows on an SE and six on a Pro Max, because dvh scales with the
           screen where a pixel height would not. */
        style={{ maxHeight: '52dvh' }}
      >
        {/* handle + header */}
        <div className="pt-5 px-5 shrink-0">
          {/* No title. The sheet opens from a row that already says Account,
              From or To, and every line in it is an account - a header
              repeating the word spent a line of a 78dvh sheet saying nothing
              the tap had not already established. */}
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/10 mx-auto mb-4" />
        </div>

        {/* scrollable list */}
        <FadeScroller
          className="flex-1 px-5"
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          <div className="flex flex-col gap-2">
            {topLevelItems.map(item => {
              const isParent = parentNames.has(item.name)
              if (isParent) {
                const children = sortByOrder(selectable.filter(a => a.parentName === item.name))
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl overflow-hidden
                      bg-slate-50 dark:bg-white/[0.04]
                      border border-slate-200/60 dark:border-white/[0.08]"
                  >
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
                  </div>
                )
              }
              return (
                <div
                  key={item.id}
                  className="rounded-2xl overflow-hidden
                    bg-slate-50 dark:bg-white/[0.04]
                    border border-slate-200/60 dark:border-white/[0.08]"
                >
                  <AccountRow
                    acct={item}
                    selected={selected}
                    creditAvailMap={creditAvailMap}
                    onPick={pick}
                    roundedTop
                    roundedBottom
                  />
                </div>
              )
            })}
          </div>
          <div className="h-8 shrink-0" />
        </FadeScroller>
      </div>
    </div>
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
        <p className="text-[10px] text-slate-400 dark:text-slate-500">{balLabel}</p>
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
        <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200 truncate">{acct.name}</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">{TYPE_LABEL[acct.type] ?? acct.type}</p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{displayBal}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">{balLabel}</p>
      </div>

      {isSelected && (
        <svg className="text-primary shrink-0 ml-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  )
}
