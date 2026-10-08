import { useMemo, useState } from 'react'
import SubPage from '../../components/SubPage'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import SectionLabel from '../../components/ui/SectionLabel'
import EmptyState from '../../components/ui/EmptyState'
import Sheet from '../../components/ui/Sheet'
import CurrencyFlag from '../../components/CurrencyFlag'
import useRates from '../../hooks/useRates'
import { useBaseCurrency } from '../../context/CurrencyContext'
import { CURRENCY_CODES, currencyName, currencyOf, symbolOf } from '../../lib/currency'
import { convert, rateAge } from '../../lib/fx'
import { moneyChangeHandler, parseMoney } from '../../utils/moneyInput'
import { fmt, baseDecimals } from '../../lib/money'
import SearchField from '../../components/ui/SearchField'

/**
 * What the rates are, and what a given amount comes to.
 *
 * ── The figure is quoted the way round people read it ──
 *
 * The provider hands over "0.015906 USD per PHP", which is the same fact as
 * "one dollar is P62.87" and useless to look at. Nobody holding a dollar
 * account thinks in thousandths of a dollar. So the number on the right is
 * ONE FOREIGN UNIT in the ledger's currency, and the inverse is small print
 * underneath for anyone checking the app against their bank.
 *
 * ── Eight, then the rest behind a tap ──
 *
 * Twenty-two rows is a scroll, and the answer somebody came for is almost
 * always in the first few. The eight are the ones a Philippine ledger
 * actually meets - where people are paid from, fly to, and hold cards in -
 * with this ledger's OWN foreign accounts pushed to the front, since those
 * are the only rates any figure in the app depends on.
 */

/** The shortlist, before this ledger's own accounts are folded in. */
const TOP = ['USD', 'JPY', 'HKD', 'KRW', 'SGD', 'THB', 'TWD', 'AUD']

/** Enough places to be useful, few enough to read. */
function quote(n) {
  if (!Number.isFinite(n)) return null
  const places = n >= 1000 ? 2 : n >= 1 ? 4 : 6
  return n.toLocaleString('en-PH', { minimumFractionDigits: places, maximumFractionDigits: places })
}

function RateRow({ code, base, table, held = false, last = false }) {
  const perUnit = convert(1, code, base, table)
  const inverse = convert(1, base, code, table)
  const name = currencyName(code)

  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-3',
        last ? '' : 'border-b border-slate-100 dark:border-white/[0.06]',
        held ? 'bg-primary/[0.05] dark:bg-primary/[0.10]' : '',
      ].filter(Boolean).join(' ')}
    >
      <CurrencyFlag code={code} size={28} />

      <div className="flex-1 min-w-0">
        <p className="text-13 font-bold text-slate-800 dark:text-white truncate">
          {code}
          <span className="ml-2 font-medium text-slate-400 dark:text-slate-500">{name}</span>
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className="text-13 font-semibold text-slate-800 dark:text-white tabular-nums">
          {perUnit == null ? 'no rate' : quote(perUnit)}
        </p>
        {inverse != null && (
          <p className="text-10 text-slate-400 dark:text-slate-500 tabular-nums">
            {symbolOf(base)}1 = {symbolOf(code)}{quote(inverse)}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * The converter.
 *
 * One direction, foreign into the ledger's currency, because that is the
 * question this page exists to answer: somebody looking at a price abroad
 * wants to know what it costs them. The other direction is the reciprocal and
 * is already printed under every row above.
 */
function Converter({ base, table, onPick, code, amount, onAmount }) {
  const rate = convert(1, code, base, table)
  const out = convert(parseMoney(amount) || 0, code, base, table)

  return (
    <Card padding="md">
      <SectionLabel>When you spend</SectionLabel>

      <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04]">
        <button
          type="button"
          onClick={onPick}
          className="flex items-center gap-2 shrink-0 active:opacity-60"
        >
          <CurrencyFlag code={code} size={24} />
          <span className="text-15 font-semibold text-slate-800 dark:text-white">{code}</span>
          <svg className="text-slate-400 dark:text-slate-500" width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="5,2 9,7 5,12" />
          </svg>
        </button>

        <input
          value={amount}
          onChange={onAmount}
          inputMode="decimal"
          placeholder="1.00"
          aria-label={`Amount in ${code}`}
          className="flex-1 min-w-0 bg-transparent outline-none border-0 p-0
            text-right text-xl font-bold tabular-nums
            text-slate-900 dark:text-white
            placeholder:text-slate-300 dark:placeholder:text-slate-600"
        />
      </div>

      <div className="flex items-baseline justify-between gap-3 mt-4">
        <span className="text-13 text-slate-500 dark:text-slate-400">Exchange rate</span>
        <span className="text-13 font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
          {rate == null
            ? 'unavailable'
            : `${symbolOf(code)}1 = ${symbolOf(base)}${quote(rate)}`}
        </span>
      </div>

      <SectionLabel className="mt-4">Estimated {base} amount</SectionLabel>
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl
        border border-slate-100 dark:border-white/[0.07]">
        <CurrencyFlag code={base} size={24} />
        <span className="text-15 font-semibold text-slate-800 dark:text-white">{base}</span>
        <span className="flex-1 text-right text-xl font-bold tabular-nums text-slate-900 dark:text-white">
          {out == null ? '—' : fmt(out, base)}
        </span>
      </div>
    </Card>
  )
}

export default function RatesPage() {
  const base = useBaseCurrency()
  const { table, foreign, stale, busy, error, refresh } = useRates()
  const canRetry = stale || !!error || busy

  const [allOpen, setAllOpen] = useState(false)
  const [pickOpen, setPickOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [amount, setAmount] = useState('1')

  /* The shortlist, with anything this ledger actually holds pushed in front,
     minus its own currency - a row saying a peso is worth a peso is not a
     rate. */
  const shortlist = useMemo(
    () => [...new Set([...foreign, ...TOP])].filter(c => c !== base).slice(0, 8),
    [foreign, base],
  )

  /* Every code the PROVIDER sent, not the twenty-two the registry curates.
     The registry is the list with a hand-written name and a flag; this is the
     list of rates that actually exist, and somebody looking up what a
     Norwegian krone is worth is not about to open a krone account.

     Falls back to the registry when no table has been fetched, so the sheet
     is never empty on a ledger that has never needed a rate. */
  const everything = useMemo(() => {
    const all = Object.keys(table?.rates ?? {})
    return (all.length ? all : CURRENCY_CODES).filter(c => c !== base).sort()
  }, [table, base])

  const [query, setQuery] = useState('')
  const found = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return everything
    return everything.filter(c => c.includes(q) || currencyName(c).toUpperCase().includes(q))
  }, [everything, query])

  /* The converter opens on whatever is most likely to be wanted: a currency
     this ledger holds, else the top of the list. */
  const fromCode = from || shortlist[0] || 'USD'

  return (
    <SubPage title="Exchange rates">
      <div className="px-5 pt-1 flex flex-col gap-5">
        {/* One row, the same shape as the card in Settings that opens this
            page: a name, a status line, and the button. */}
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
            {/* See the note on the same row in Settings: the app keeps these
                current by itself, so a button is for the case where that
                failed rather than a thing to press. */}
            {canRetry && (
              <Button onClick={() => refresh()} disabled={busy} size="sm" className="px-4 shrink-0">
                {busy ? 'Updating…' : 'Retry'}
              </Button>
            )}
          </div>
        </Card>

        {!table ? (
          /* The button is only there when rates are stale, failed or loading, so
             the instruction is only given when there is a button to tap. A
             ledger with no foreign account has nothing to download. */
          <EmptyState
            art="globe"
            title="No rates yet"
            body={canRetry
              ? 'Connect to the internet, then tap Retry.'
              : 'Rates download once an account holds another currency.'}
          />
        ) : (
          <>
            <Card padding="none" clip>
              {/* The column headings. They are what make a bare number on the
                  right readable without a label on every row. */}
              <div className="flex items-center justify-between gap-3 px-4 py-3
                border-b border-slate-100 dark:border-white/[0.06]">
                <p className="text-13 font-bold text-slate-800 dark:text-white">Per 1 unit</p>
                <p className="text-13 font-bold text-slate-800 dark:text-white">{base}</p>
              </div>

              {shortlist.map(code => (
                <RateRow
                  key={code}
                  code={code}
                  base={base}
                  table={table}
                  held={foreign.includes(code)}
                />
              ))}

              <button
                type="button"
                onClick={() => setAllOpen(true)}
                className="w-full flex items-center justify-center gap-1 px-4 py-3.5
                  text-13 font-semibold text-slate-500 dark:text-slate-400
                  active:bg-slate-50 dark:active:bg-white/[0.04]"
              >
                Explore more currencies
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="5,2 9,7 5,12" />
                </svg>
              </button>
            </Card>

            <Converter
              base={base}
              table={table}
              code={fromCode}
              amount={amount}
              onAmount={moneyChangeHandler(setAmount, baseDecimals(fromCode))}
              onPick={() => setPickOpen(true)}
            />

            {/* A household ledger does not need the interbank rate to the
                fifth place, but somebody holding this up against a remittance
                app should know which number they are looking at. */}
            <p className="text-10 text-slate-400 dark:text-slate-500 leading-snug px-1">
              Your bank will give you slightly less than the mid-market rate
              when you actually convert.
            </p>
          </>
        )}
      </div>

      {/* Every currency, for reading. */}
      <Sheet
        open={allOpen}
        onClose={() => { setAllOpen(false); setQuery('') }}
        maxHeight="82dvh"
        title={`All currencies (${everything.length})`}
      >
        {/* A search box, because a hundred and eighty rows is a list you
            query rather than one you scroll. */}
        <SearchField
          value={query}
          onChange={e => setQuery(e.target.value)}
          onClear={() => setQuery('')}
          placeholder="Search a currency or code"
          className="mb-3"
        />

        {found.length === 0 ? (
          <p className="text-13 text-slate-400 dark:text-slate-500 py-6 text-center">
            Nothing matches that.
          </p>
        ) : (
          <Card padding="none" clip surface="recessed">
            {found.map((code, i) => (
              <RateRow
                key={code}
                code={code}
                base={base}
                table={table}
                held={foreign.includes(code)}
                last={i === found.length - 1}
              />
            ))}
          </Card>
        )}
      </Sheet>

      {/* And for choosing, which is a different job: this one closes on a pick
          and feeds the converter. */}
      <Sheet
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        maxHeight="60dvh"
        title="Convert from"
        z={140}
      >
        <div className="flex flex-col gap-2">
          {everything.map(code => (
            <Card key={code} surface="recessed" clip>
              <button
                type="button"
                onClick={() => { setFrom(code); setPickOpen(false) }}
                className={[
                  'flex items-center gap-3 w-full px-4 py-3 text-left rounded-2xl',
                  'active:opacity-70 transition-opacity duration-75',
                  code === fromCode
                    ? 'bg-primary/[0.08] dark:bg-primary/[0.15]'
                    : 'bg-slate-50 dark:bg-white/[0.04]',
                ].join(' ')}
              >
                <CurrencyFlag code={code} size={26} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-white truncate">
                    {currencyName(code)}
                  </span>
                  <span className="block text-xs text-slate-400 dark:text-slate-500">{code}</span>
                </span>
                {code === fromCode && (
                  <svg className="text-primary shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            </Card>
          ))}
        </div>
      </Sheet>
    </SubPage>
  )
}
