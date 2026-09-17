import { useMemo } from 'react'
import SubPage from '../../components/SubPage'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'
import useRates from '../../hooks/useRates'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { CURRENCIES, currencyOf, symbolOf } from '../../lib/currency'
import { convert, rateAge } from '../../lib/fx'

/**
 * What the rates actually are.
 *
 * ── Why the figure is quoted the way round it is ──
 *
 * The provider hands over "0.015906 USD per PHP", which is arithmetically the
 * same fact as "62.87 PHP per USD" and useless to read. Nobody holding a
 * dollar account thinks in thousandths of a dollar; they think in what a
 * dollar is worth. So the big figure is ONE FOREIGN UNIT in the ledger's
 * currency, and the inverse is the small print underneath for anyone checking
 * the app against their bank.
 *
 * ── What is listed ──
 *
 * The currencies this ledger actually holds, first and prominently, because
 * those are the only ones any figure in the app depends on. Everything else
 * the registry knows follows underneath, which is what makes this a page
 * worth opening rather than a row that says "rates: fine" - somebody deciding
 * whether to open a Singapore account can look before they do.
 */

/** Enough places to be useful, few enough to read. */
function quote(n) {
  if (!Number.isFinite(n)) return null
  const places = n >= 1000 ? 2 : n >= 1 ? 4 : 6
  return n.toLocaleString('en-PH', { minimumFractionDigits: places, maximumFractionDigits: places })
}

function RateRow({ code, base, table, held = false }) {
  // One unit of `code`, in the ledger's currency. See the note above.
  const perUnit = convert(1, code, base, table)
  const inverse = convert(1, base, code, table)
  const { name } = currencyOf(code)

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${held ? 'bg-primary/[0.06] dark:bg-primary/[0.12]' : ''}`}>
      <span
        className="w-10 shrink-0 text-center text-15 font-semibold text-slate-700 dark:text-white"
        aria-hidden="true"
      >
        {symbolOf(code)}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-13 font-semibold text-slate-800 dark:text-white truncate">{name}</p>
        {/* The code alone. It used to carry "· in your accounts", which is
            what the section heading above already says and what the tint on
            the row already shows - and at 320px it wrapped, making the one
            row anybody cares about taller than its neighbours. */}
        <p className="text-11 text-slate-400 dark:text-slate-500 truncate">{code}</p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-13 font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
          {perUnit == null ? 'no rate' : `${symbolOf(base)}${quote(perUnit)}`}
        </p>
        <p className="text-10 text-slate-400 dark:text-slate-500 tabular-nums">
          {inverse == null ? '' : `${symbolOf(base)}1 = ${symbolOf(code)}${quote(inverse)}`}
        </p>
      </div>
    </div>
  )
}

export default function RatesPage() {
  const base = useBaseCurrency()
  const { table, foreign, stale, busy, error, refresh } = useRates()

  const others = useMemo(
    () => Object.keys(CURRENCIES).filter(c => c !== base && !foreign.includes(c)),
    [base, foreign],
  )


  return (
    <SubPage title="Exchange rates">
      <div className="px-5 pt-1 flex flex-col gap-5">
        {/* One row, the same shape as the rates card in Settings that opens
            this page - a name, a status line, and the button.

            It was three paragraphs of prose above a button: what the figures
            mean, when the provider set them, and a caveat about banks. The
            first is answered by the rows themselves the moment you look at
            one, and the third is a footnote rather than a preamble. What is
            left is the only thing you came to the top of this page to do. */}
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-13 font-semibold text-slate-900 dark:text-white truncate">
                Worth in {currencyOf(base).name}
              </p>
              <p className="text-11 text-slate-400 dark:text-slate-500 truncate">
                {error
                  ? 'Could not reach the rate service'
                  : table
                    ? `Mid-market · updated ${rateAge(table)}`
                    : 'Not downloaded yet'}
              </p>
            </div>
            {stale && !busy && (
              <span className="shrink-0 text-11 font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                stale
              </span>
            )}
            <Button onClick={() => refresh()} disabled={busy} size="sm" className="px-4 shrink-0">
              {busy ? 'Updating…' : 'Update'}
            </Button>
          </div>
        </Card>

        {!table ? (
          <EmptyState
            title="No rates yet"
            body="Connect to the internet and tap Update now."
          />
        ) : (
          <>
            {foreign.length > 0 && (
              <div>
                <SectionLabel>In your accounts</SectionLabel>
                <Card surface="recessed" clip padding="none">
                  {foreign.map(code => (
                    <RateRow key={code} code={code} base={base} table={table} held />
                  ))}
                </Card>
              </div>
            )}

            <div>
              <SectionLabel>Everything else</SectionLabel>
              <Card surface="recessed" clip padding="none">
                {others.map(code => (
                  <RateRow key={code} code={code} base={base} table={table} />
                ))}
              </Card>
            </div>

            {/* A household ledger does not need the interbank rate to the
                fifth place, but somebody holding this up against a remittance
                app should know which number they are looking at. At the
                bottom, because it qualifies the figures rather than
                introducing them. */}
            <p className="text-10 text-slate-400 dark:text-slate-500 leading-snug px-1">
              Your bank will give you slightly less than the mid-market rate
              when you actually convert.
            </p>
          </>
        )}
      </div>
    </SubPage>
  )
}
