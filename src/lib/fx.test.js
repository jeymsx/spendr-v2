import { describe, it, expect, vi } from 'vitest'
import {
  PROVIDER_URL, STALE_AFTER_MS,
  PROVIDERS,
  convert, fetchRates, foreignCurrencies, isStale, parseRates, sumInBase, toBase,
} from './fx'

/**
 * The arithmetic that decides what somebody's net worth says.
 *
 * Weighted towards refusal rather than towards the happy path, deliberately.
 * Every failure mode here has the same shape - a number appears that looks
 * like money and is not - and the only defence is that the functions return
 * null instead of guessing.
 */

const RESPONSE = {
  result: 'success',
  base_code: 'PHP',
  time_last_update_unix: 1789000000,
  rates: { PHP: 1, USD: 0.016, EUR: 0.015, JPY: 2.5 },
}

const TABLE = parseRates(RESPONSE, '2026-09-16T00:00:00.000Z')

describe('parseRates', () => {
  it('keeps the base, the rates and both timestamps', () => {
    expect(TABLE?.base).toBe('PHP')
    expect(TABLE?.rates.USD).toBe(0.016)
    expect(TABLE?.fetchedAt).toBe('2026-09-16T00:00:00.000Z')
    expect(TABLE?.providerUpdatedAt).toBe(new Date(1789000000 * 1000).toISOString())
  })

  it('pins the base at 1 whatever the payload said', () => {
    const t = parseRates({ ...RESPONSE, rates: { USD: 0.016 } })
    expect(t?.rates.PHP).toBe(1)
  })

  it('drops a rate that is not a usable number', () => {
    const t = parseRates({
      ...RESPONSE,
      rates: { USD: 0.016, EUR: 0, GBP: -1, JPY: NaN, SGD: '0.02', AUD: null },
    })
    expect(Object.keys(t?.rates ?? {}).sort()).toEqual(['PHP', 'USD'])
  })

  it('refuses a response that is not one', () => {
    expect(parseRates(null)).toBeNull()
    expect(parseRates({ result: 'error', 'error-type': 'unsupported-code' })).toBeNull()
    expect(parseRates({ base_code: 'PHP' })).toBeNull()
    expect(parseRates({ rates: { USD: 1 } })).toBeNull()
    // Every rate unusable is the same as no rates at all.
    expect(parseRates({ base_code: 'PHP', rates: { USD: 0 } })).toBeNull()
  })
})

describe('fetchRates', () => {
  const ok = (/** @type {any} */ body) => ({ ok: true, status: 200, json: async () => body })

  it('asks the provider for the currency it was given', async () => {
    const f = vi.fn(async () => ok(RESPONSE))
    await fetchRates('php', /** @type {any} */ (f), () => '2026-09-16T00:00:00.000Z')
    expect(f).toHaveBeenCalledWith(PROVIDER_URL + 'PHP')
  })

  it('throws rather than returning null, so a failure is not a rate table', async () => {
    await expect(fetchRates('PHP', /** @type {any} */ (async () => ({ ok: false, status: 503 }))))
      .rejects.toThrow(/503/)
    await expect(fetchRates('PHP', /** @type {any} */ (async () => ok({ nonsense: true }))))
      .rejects.toThrow(/usable rate table/)
    await expect(fetchRates('nope', /** @type {any} */ (vi.fn())))
      .rejects.toThrow(/not a currency code/)
  })

  it('refuses a table quoted against a currency it did not ask for', async () => {
    // Silently rebasing everything to USD would misprice every account in the
    // ledger by a factor of sixty.
    const wrong = { ...RESPONSE, base_code: 'USD' }
    await expect(fetchRates('PHP', /** @type {any} */ (async () => ok(wrong))))
      .rejects.toThrow(/asked for PHP, got USD/)
  })
})

describe('reading either provider', () => {
  /* Two providers, three field names apart. One validator reads both, because
     the validation is the part that must not be duplicated. */
  const FXRATES = {
    success: true,
    base: 'PHP',
    timestamp: 1789000000,
    rates: { PHP: 1, USD: 0.016 },
  }

  it('reads fxratesapi shape as readily as the other', () => {
    const t = parseRates(FXRATES, '2026-09-17T00:00:00.000Z')
    expect(t?.base).toBe('PHP')
    expect(t?.rates.USD).toBe(0.016)
    expect(t?.providerUpdatedAt).toBe(new Date(1789000000 * 1000).toISOString())
  })

  it('honours either way of saying the request failed', () => {
    expect(parseRates({ ...FXRATES, success: false })).toBeNull()
    expect(parseRates({ result: 'error', base_code: 'PHP', rates: { USD: 1 } })).toBeNull()
  })

  it('falls through to the next provider rather than giving up', async () => {
    const ok = { ok: true, status: 200, json: async () => FXRATES }
    /** @type {string[]} */
    const calls = []
    const f = async (/** @type {string} */ url) => {
      calls.push(url)
      // The first is down; the second answers.
      if (calls.length === 1) return { ok: false, status: 503 }
      return ok
    }
    const t = await fetchRates('PHP', /** @type {any} */ (f), () => '2026-09-17T00:00:00.000Z')
    expect(t.base).toBe('PHP')
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain(PROVIDERS[0].name === 'fxratesapi' ? 'fxratesapi' : '')
  })

  it('names the last failure when every provider is down', async () => {
    const f = async () => ({ ok: false, status: 500 })
    await expect(fetchRates('PHP', /** @type {any} */ (f)))
      .rejects.toThrow(/no provider could supply PHP rates/)
  })

  it('tries every provider exactly once', async () => {
    let n = 0
    const f = async () => { n++; return { ok: false, status: 500 } }
    await expect(fetchRates('PHP', /** @type {any} */ (f))).rejects.toThrow()
    expect(n).toBe(PROVIDERS.length)
  })
})

describe('convert', () => {
  it('returns the amount itself when nothing has to change', () => {
    // Bit for bit, through no arithmetic at all. Every ledger in existence
    // today is single-currency, and this is what guarantees none of them move.
    const odd = 0.1 + 0.2
    expect(convert(odd, 'PHP', 'PHP', TABLE)).toBe(odd)
    expect(convert(1234.56, 'usd', 'USD', null)).toBe(1234.56)
  })

  it('converts through the base in both directions', () => {
    expect(convert(1000, 'PHP', 'USD', TABLE)).toBeCloseTo(16, 10)
    expect(convert(16, 'USD', 'PHP', TABLE)).toBeCloseTo(1000, 10)
    // Neither side is the base: 100 EUR -> PHP -> USD
    expect(convert(100, 'EUR', 'USD', TABLE)).toBeCloseTo(100 / 0.015 * 0.016, 10)
  })

  it('says null rather than guessing', () => {
    expect(convert(100, 'PHP', 'NOK', TABLE)).toBeNull()
    expect(convert(100, 'NOK', 'PHP', TABLE)).toBeNull()
    expect(convert(100, 'PHP', 'USD', null)).toBeNull()
    expect(convert(NaN, 'PHP', 'USD', TABLE)).toBeNull()
    expect(convert(100, '', 'USD', TABLE)).toBeNull()
  })

  it('toBase is convert with the destination named', () => {
    expect(toBase(16, 'USD', 'PHP', TABLE)).toBe(convert(16, 'USD', 'PHP', TABLE))
  })
})

describe('isStale', () => {
  const at = Date.parse(/** @type {string} */ (TABLE?.providerUpdatedAt))

  it('measures from what the provider updated, not from when we fetched', () => {
    expect(isStale(TABLE, at + 1000)).toBe(false)
    expect(isStale(TABLE, at + STALE_AFTER_MS + 1)).toBe(true)
    // A refetch of an unchanged table does not make it fresh.
    const refetched = { ...(/** @type {any} */ (TABLE)), fetchedAt: new Date(at + STALE_AFTER_MS * 2).toISOString() }
    expect(isStale(refetched, at + STALE_AFTER_MS * 2)).toBe(true)
  })

  it('treats no table and an unreadable one as stale', () => {
    expect(isStale(null)).toBe(true)
    expect(isStale(/** @type {any} */ ({ base: 'PHP', rates: {}, fetchedAt: 'not a date', providerUpdatedAt: null }))).toBe(true)
  })
})

describe('foreignCurrencies', () => {
  it('is empty for the ledger everybody currently has', () => {
    const accts = [{ currency: 'PHP' }, { currency: 'PHP' }, {}, { currency: null }]
    expect(foreignCurrencies(accts, 'PHP')).toEqual([])
  })

  it('lists each foreign currency once, sorted', () => {
    const accts = [{ currency: 'USD' }, { currency: 'php' }, { currency: 'usd' }, { currency: 'EUR' }]
    expect(foreignCurrencies(accts, 'PHP')).toEqual(['EUR', 'USD'])
  })
})

describe('sumInBase', () => {
  it('adds a dollar account to peso ones at the rate', () => {
    const accts = [
      { currency: 'PHP', balance: 1000 },
      { currency: 'USD', balance: 500 },
      { balance: 250 },            // no currency: the ledger's own
    ]
    const { total, missing } = sumInBase(accts, 'PHP', TABLE)
    expect(total).toBeCloseTo(1000 + 500 / 0.016 + 250, 6)
    expect(missing).toEqual([])
  })

  it('reports what it could not convert instead of dropping it silently', () => {
    const accts = [{ currency: 'PHP', balance: 1000 }, { currency: 'NOK', balance: 500 }]
    const { total, missing } = sumInBase(accts, 'PHP', TABLE)
    expect(total).toBe(1000)
    expect(missing).toEqual(['NOK'])
  })

  it('sums whatever the caller names, not only the balance', () => {
    const accts = [{ currency: 'PHP', creditLimit: 50_000 }, { currency: 'USD', creditLimit: 1000 }]
    const { total } = sumInBase(accts, 'PHP', TABLE, a => a.creditLimit)
    expect(total).toBeCloseTo(50_000 + 1000 / 0.016, 6)
  })

  it('sums as-is when no base is named at all', () => {
    // What every caller that predates currencies passes. Converting to the
    // empty string fails for every row and returns zero, which is how a
    // report of a card owing 3,200 briefly said it owed nothing.
    const accts = [{ currency: 'PHP', balance: 1000 }, { currency: 'PHP', balance: 3200 }]
    expect(sumInBase(accts, '', null).total).toBe(4200)
    expect(sumInBase(accts, '', null).missing).toEqual([])
  })

  it('is exact, not approximate, when every account already matches', () => {
    const accts = [{ currency: 'PHP', balance: 0.1 }, { currency: 'PHP', balance: 0.2 }]
    expect(sumInBase(accts, 'PHP', TABLE).total).toBe(0.1 + 0.2)
  })
})
