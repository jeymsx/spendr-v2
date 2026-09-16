import { CURRENCIES, CURRENCY_CODES } from '../lib/currency'
import Card from './ui/Card'
import Sheet from './ui/Sheet'

/**
 * Which currency, from the twenty-two the app knows.
 *
 * ── Why a sheet and not a <select> ──
 *
 * A native select is the cheap answer and it is the wrong one here for a
 * reason specific to this list: what somebody is looking for is the SYMBOL. A
 * select row reads "USD - US Dollar" in the platform's own font, at the
 * platform's own size, with no way to show the "$" at the size that makes it
 * recognisable. Every other picker in this app is a sheet of rows, so this is
 * one too, and each row leads with the mark it will actually draw.
 *
 * ── The same sheet does both jobs ──
 *
 * The ledger's own currency, set once in Settings, and an individual account's
 * - the dollar account somebody holds alongside four peso ones. They are the
 * same question asked about a different scope, so they get the same list and
 * the same rows, and `hint` is what says which scope you are in.
 *
 * 52dvh, like the account picker, and for the same measured reason: it shows
 * five whole rows and half of the sixth, and the half row says "more below"
 * without a scrollbar. Long lists here are expected - twenty-two rows is a
 * flick, not a wall - so unlike the account picker this one does not try to
 * fit everything.
 */
export default function CurrencyPickerSheet({ open, onClose, selected, onSelect, hint = null }) {
  const pick = (code) => { onSelect(code); onClose() }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={130}
      scrim={40}
      maxHeight="52dvh"
      title="Currency"
      ariaLabel="Select currency"
    >
      <div>
        {hint && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-snug">{hint}</p>
        )}
        <div className="flex flex-col gap-2">
          {CURRENCY_CODES.map(code => {
            const { symbol, name } = CURRENCIES[code]
            const isSelected = selected === code
            return (
              <Card key={code} surface="recessed" clip>
                <button
                  onClick={() => pick(code)}
                  className={[
                    'flex items-center gap-3 w-full px-4 py-3 text-left rounded-2xl',
                    'active:opacity-70 transition-opacity duration-75',
                    isSelected
                      ? 'bg-primary/[0.08] dark:bg-primary/[0.15]'
                      : 'bg-slate-50 dark:bg-white/[0.04] active:bg-slate-100 dark:active:bg-white/[0.07]',
                  ].join(' ')}
                >
                  {/* Fixed width, so twenty-two marks of one to three characters
                      still leave the names starting on one line. */}
                  <span
                    className="w-10 shrink-0 text-center text-17 font-semibold text-slate-700 dark:text-white tabular-nums"
                    aria-hidden="true"
                  >
                    {symbol}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{code}</p>
                  </div>

                  {isSelected && (
                    <svg className="text-primary shrink-0 ml-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              </Card>
            )
          })}
        </div>
      </div>
    </Sheet>
  )
}
