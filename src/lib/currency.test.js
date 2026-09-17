import { describe, it, expect, afterEach } from 'vitest'
import {
  CURRENCIES, CURRENCY_CODES, DEFAULT_CURRENCY, SINGLE_MARKS,
  compactAmount, currencyOf, formatAmount, maskedAmount, symbolOf,
} from './currency'
import { baseSymbol, fmt, fmtCompact, fmtHidden, getBaseCurrency, setBaseCurrency } from './money'

/**
 * The registry, and what happens to `fmt` when the ledger is not in pesos.
 *
 * These matter more than they look. `fmt` is called in 55 files and every one
 * of them passes one argument, so whether a dollar account shows a dollar sign
 * comes down entirely to the base currency and the fallbacks below.
 */

const MINUS = '\u2212'

afterEach(() => setBaseCurrency(DEFAULT_CURRENCY))

describe('the registry', () => {
  it('has a symbol, a name and a decimal count for every code', () => {
    for (const code of CURRENCY_CODES) {
      const c = CURRENCIES[code]
      expect(c.symbol.length).toBeGreaterThan(0)
      expect(c.name.length).toBeGreaterThan(0)
      expect([0, 2]).toContain(c.decimals)
    }
  })

  it('starts at the peso, which is what every existing row says', () => {
    expect(CURRENCY_CODES[0]).toBe(DEFAULT_CURRENCY)
    expect(symbolOf('PHP')).toBe('\u20b1')
  })

  it('falls back to the code itself when even Intl has never heard of it', () => {
    // A crypto ticker, most likely: the provider sends eleven of them.
    expect(currencyOf('ZZZ').name).toBe('ZZZ')
    expect(formatAmount(500, 'ZZZ')).toContain('ZZZ')
  })

  it('reads a code in any case, and falls back rather than blanking', () => {
    expect(symbolOf('usd')).toBe('$')
    expect(symbolOf(null)).toBe('\u20b1')
    /* Not a blank, and not just the code either. The registry curates
       twenty-two; the provider sends a hundred and eighty, and Intl knows the
       rest - including how many places each is quoted to, which is what stops
       a yen figure printing centavos. */
    expect(currencyOf('NOK').name).toBe('Norwegian Krone')
    expect(currencyOf('JOD').decimals).toBe(3)
    expect(formatAmount(500, 'NOK')).toMatch(/500/)
  })
})

describe('formatAmount', () => {
  it('puts the mark after the minus, and uses U+2212', () => {
    expect(formatAmount(1200, 'PHP')).toBe('\u20b11,200.00')
    expect(formatAmount(-340.5, 'USD')).toBe(MINUS + '$340.50')
    expect(formatAmount(-340.5, 'USD').includes('-')).toBe(false)
  })

  it('quotes yen, won and dong whole', () => {
    expect(formatAmount(1200, 'JPY')).toBe('\u00a51,200')
    expect(formatAmount(1200, 'KRW')).toBe('\u20a91,200')
    expect(formatAmount(1200.4, 'VND')).toBe('\u20ab1,200')
  })

  it('treats a missing or unusable amount as zero', () => {
    expect(formatAmount(undefined, 'USD')).toBe('$0.00')
    expect(formatAmount(NaN, 'USD')).toBe('$0.00')
  })
})

describe('compactAmount and maskedAmount', () => {
  it('abbreviates above a thousand and keeps the right mark', () => {
    expect(compactAmount(1234, 'USD')).toBe('$1.2K')
    expect(compactAmount(-3_400_000, 'USD')).toBe(MINUS + '$3.4M')
    expect(compactAmount(999, 'USD')).toBe('$999.00')
  })

  it('keeps the mark while the figure is hidden', () => {
    expect(maskedAmount('USD')).toBe('$ \u2022\u2022\u2022\u2022')
    expect(maskedAmount('PHP', 6)).toBe('\u20b1 \u2022\u2022\u2022\u2022\u2022\u2022')
  })
})

describe('SINGLE_MARKS', () => {
  it('holds the one-character marks and none of the lettered ones', () => {
    expect(SINGLE_MARKS).toContain('\u20b1')
    expect(SINGLE_MARKS).toContain('$')
    expect(SINGLE_MARKS).toContain('\u20ac')
    // 'A$', 'CHF' and 'RM' are prose as much as notation.
    expect(SINGLE_MARKS).not.toContain('C')
    expect(SINGLE_MARKS).not.toContain('R')
  })

  it('has no duplicates, so the character class cannot grow one', () => {
    expect(new Set(SINGLE_MARKS).size).toBe(SINGLE_MARKS.length)
  })
})

describe('the base currency', () => {
  it('is the peso until something says otherwise', () => {
    expect(getBaseCurrency()).toBe('PHP')
    expect(fmt(1200)).toBe('\u20b11,200.00')
  })

  it('changes what every one-argument call site prints', () => {
    setBaseCurrency('USD')
    expect(fmt(1200)).toBe('$1,200.00')
    expect(fmtCompact(1234)).toBe('$1.2K')
    expect(fmtHidden()).toBe('$ \u2022\u2022\u2022\u2022')
    expect(baseSymbol()).toBe('$')
  })

  it('lets a call site name a particular currency regardless', () => {
    setBaseCurrency('USD')
    expect(fmt(500, 'PHP')).toBe('\u20b1500.00')
    expect(baseSymbol('JPY')).toBe('\u00a5')
  })

  it('refuses a code it does not know rather than storing it', () => {
    setBaseCurrency('USD')
    setBaseCurrency('NOTACURRENCY')
    expect(getBaseCurrency()).toBe('PHP')
    setBaseCurrency('')
    expect(getBaseCurrency()).toBe('PHP')
  })

  it('reads a lowercase code, which is what a hand-edited preference is', () => {
    setBaseCurrency('sgd')
    expect(getBaseCurrency()).toBe('SGD')
    expect(fmt(10)).toBe('S$10.00')
  })
})
