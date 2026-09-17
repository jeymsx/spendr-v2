/**
 * Exchange rates: fetching them, keeping them, and converting with them.
 *
 * ── What this is for ──
 *
 * A ledger holds one currency's worth of accounts and, sometimes, one account
 * in another - a dollar account beside four peso ones. The dollar account's
 * balance is $500 and it is right that it says so. But net worth is a single
 * figure, and adding 500 to 1,000 because both are numbers is how an app
 * quietly tells somebody they have ₱1,500 when they have nearer ₱32,000.
 *
 * ── Stocks and flows convert differently, and that is not a detail ──
 *
 * A BALANCE is a present-tense fact: what is in the account right now. It
 * converts at today's rate, and it changes when the rate changes, which is
 * what actually happens to the peso value of a dollar account.
 *
 * A TRANSACTION is a past fact: $40 spent in March was a particular number of
 * pesos in March, and re-deriving it at today's rate would rewrite last
 * quarter's spending every morning. So a flow converts once, on the day it
 * happens, and the figure is stored - see `baseAmount` on transactions.
 *
 * This module only provides the arithmetic and the table. Which of the two
 * rules applies is the caller's to know.
 *
 * ── The provider ──
 *
 * open.er-api.com, because it needs no API key. That matters more than it
 * sounds: a key would have to ship in the bundle of a client-only app, where
 * it is not a secret at all, and every keyed provider's free tier forbids
 * exactly that. It updates daily, which is the right resolution for a
 * household ledger and the wrong one for anything this app should ever be
 * used for instead.
 *
 * ── Offline is the normal case, not the error case ──
 *
 * Spendr's premise is that the whole database is local and the network is
 * optional. So the table is cached in Dexie and used whatever its age, and
 * staleness is something the UI SAYS rather than something that stops it
 * working. A missing rate returns null and never a 1 or a 0 - a silent 1
 * would say a dollar is a peso, and a silent 0 would delete the account from
 * the total. Both are worse than a figure the screen admits it cannot give.
 */

/** Where the cached table lives. Device-local: it is not in the synced set. */
export const RATES_META_KEY = 'fxRates'

/**
 * Where the rates come from, in the order they are tried.
 *
 * ── Two, and the order is the point ──
 *
 * fxratesapi first. It needs no key, sends `Access-Control-Allow-Origin: *`
 * so a browser can call it, takes `?base=PHP` natively, carries 180
 * currencies against the other's 166, and republishes by the MINUTE rather
 * than once a day. Measured, not assumed: 61 requests a minute on the keyless
 * tier, and this app asks for at most one per mount.
 *
 * open.er-api second, which is what shipped first and is the reason any of
 * this works. Keeping it is not sentiment: a rate table is the one thing here
 * that comes from outside, and a free keyless tier is exactly the kind of
 * thing that starts wanting a key. If the first is down, or begins refusing,
 * the rates keep working and nobody has to ship a release to make that true.
 *
 * Neither needs an API key, and that is the constraint rather than a
 * convenience: this is a client-only app, so a key would sit in the bundle
 * where it is not a secret, and every keyed provider's free tier forbids
 * precisely that.
 */
export const PROVIDERS = [
  {
    name: 'fxratesapi',
    url: (/** @type {string} */ code) => `https://api.fxratesapi.com/latest?base=${code}`,
  },
  {
    name: 'open.er-api',
    url: (/** @type {string} */ code) => `https://open.er-api.com/v6/latest/${code}`,
  },
]

/** The first provider's URL builder, kept as a named export for tests. */
export const PROVIDER_URL = 'https://api.fxratesapi.com/latest?base='

/**
 * Past this, the UI says the rates are old. It does not stop using them.
 *
 * A week, not a day, because this is the "something is wrong" line rather
 * than the refresh schedule - and the thing it usually means is that you have
 * been offline, which the app is designed for. See REFRESH_AFTER_MS.
 */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

/**
 * How old the table has to be before a page load goes and gets a new one.
 *
 * A day. The provider republishes by the minute and the free tier allows a
 * thousand requests a month, so the honest question is how fresh a household
 * ledger's rates need to be - and the answer is "yesterday's are fine, last
 * week's are not". Daily works out at about thirty requests a month, three
 * per cent of the allowance, which leaves the rest for the Update button.
 *
 * Deliberately NOT the same number as STALE_AFTER_MS. Refreshing and
 * complaining are different decisions: one is a background nicety, the other
 * is telling somebody a figure on their screen may be wrong.
 */
export const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

/**
 * @typedef {object} RateTable
 * @property {string} base   the currency every rate below is quoted against
 * @property {Record<string, number>} rates   units of X per 1 unit of `base`
 * @property {string} fetchedAt   ISO, when we received it
 * @property {string|null} providerUpdatedAt   ISO, when the provider last set it
 */

/**
 * The provider's JSON, checked and narrowed to what we store.
 *
 * Every field is verified rather than trusted. This is the one place in the
 * app where a third party's response becomes arithmetic on somebody's money,
 * and a rate of 0, NaN or a string would propagate into a balance without
 * anything downstream noticing.
 *
 * ── It reads either provider's shape ──
 *
 * They disagree on three field names and nothing else that matters: the base
 * is `base` or `base_code`, success is `success: true` or
 * `result: 'success'`, and the timestamp is `timestamp` or
 * `time_last_update_unix` - both seconds. Accepting both here rather than
 * writing a parser per provider keeps ONE piece of code doing the validation,
 * which is the part that must not be duplicated: it is the only thing
 * standing between a third party's JSON and arithmetic on somebody's balance.
 *
 * @param {any} json
 * @param {string} [receivedAt]  ISO; injectable so tests are not time-dependent
 * @returns {RateTable|null}
 */
export function parseRates(json, receivedAt = new Date().toISOString()) {
  if (!json || typeof json !== 'object') return null
  // Either provider's way of saying it failed.
  if (json.result && json.result !== 'success') return null
  if (json.success === false) return null

  const raw = json.base_code ?? json.base
  const base = typeof raw === 'string' ? raw.toUpperCase() : null
  if (!base) return null

  const src = json.rates
  if (!src || typeof src !== 'object') return null

  /** @type {Record<string, number>} */
  const rates = {}
  for (const [code, value] of Object.entries(src)) {
    // Finite and positive. A zero rate is not a cheap currency, it is a bad
    // row, and dividing by it produces Infinity in a balance.
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue
    rates[code.toUpperCase()] = value
  }
  if (!Object.keys(rates).length) return null

  // The base is always 1 of itself. Present in the provider's payload, but
  // written here so the invariant does not depend on it being.
  rates[base] = 1

  const stamp = Number(json.time_last_update_unix ?? json.timestamp)
  return {
    base,
    rates,
    fetchedAt: receivedAt,
    providerUpdatedAt: Number.isFinite(stamp) && stamp > 0
      ? new Date(stamp * 1000).toISOString()
      : null,
  }
}

/**
 * Ask the provider for a fresh table.
 *
 * Each provider in PROVIDERS is tried in turn and the first usable answer
 * wins. A provider that is down, rate-limited, or has started demanding a key
 * is skipped rather than fatal - that is the whole reason there is more than
 * one - and only when every one of them has failed does this throw, carrying
 * the last reason so the UI can say something truer than "error".
 *
 * It throws rather than returning null, because the caller has to be able to
 * tell "the request failed, keep the cache" from "the response was garbage"
 * and both from "here are the rates".
 *
 * `fetchImpl` and `now` are injected so this is testable without a network or
 * a clock.
 *
 * @param {string} base
 * @param {typeof fetch} [fetchImpl]
 * @param {() => string} [now]
 * @returns {Promise<RateTable>}
 */
export async function fetchRates(base, fetchImpl = fetch, now = () => new Date().toISOString()) {
  const code = String(base || '').toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`fx: not a currency code: ${base}`)

  let last = null
  for (const provider of PROVIDERS) {
    try {
      const res = await fetchImpl(provider.url(code))
      if (!res.ok) throw new Error(`returned ${res.status}`)

      const table = parseRates(await res.json(), now())
      if (!table) throw new Error('response was not a usable rate table')
      /* A table quoted against a currency we did not ask about is not the one
         we asked for, and quietly rebasing every figure in the app to it
         would be far worse than failing. */
      if (table.base !== code) throw new Error(`asked for ${code}, got ${table.base}`)
      return table
    } catch (e) {
      last = `${provider.name}: ${e instanceof Error ? e.message : String(e)}`
    }
  }
  throw new Error(`fx: no provider could supply ${code} rates (${last})`)
}

/**
 * Convert, or say you cannot.
 *
 * Same currency in and out returns the amount ITSELF, untouched by any
 * arithmetic. That is the property everything else rests on: a ledger where
 * every account matches the base currency - which is every ledger that exists
 * today - gets its figures back bit for bit, so introducing this cannot move
 * a number that was already right.
 *
 * @param {number} amount
 * @param {string} from
 * @param {string} to
 * @param {RateTable|null|undefined} table
 * @returns {number|null}  null when the rate is not available
 */
export function convert(amount, from, to, table) {
  const a = String(from || '').toUpperCase()
  const b = String(to || '').toUpperCase()
  if (a && a === b) return amount
  if (!Number.isFinite(amount)) return null
  if (!table?.rates || !a || !b) return null

  const rFrom = table.rates[a]
  const rTo = table.rates[b]
  if (!rFrom || !rTo) return null

  return amount / rFrom * rTo
}

/**
 * The same, with the destination fixed - which is what nearly every caller
 * wants, since the destination is nearly always the ledger's own currency.
 *
 * @param {number} amount
 * @param {string} from
 * @param {string} base
 * @param {RateTable|null|undefined} table
 */
export const toBase = (amount, from, base, table) => convert(amount, from, base, table)

/**
 * Whether the table is old enough to be worth replacing.
 *
 * @param {RateTable|null|undefined} table
 * @param {number} [nowMs]
 */
export function needsRefresh(table, nowMs = Date.now()) {
  return olderThan(table, REFRESH_AFTER_MS, nowMs)
}

/** @param {RateTable|null|undefined} table @param {number} ms @param {number} nowMs */
function olderThan(table, ms, nowMs) {
  if (!table) return true
  const at = Date.parse(table.providerUpdatedAt ?? table.fetchedAt ?? '')
  if (!Number.isFinite(at)) return true
  return nowMs - at > ms
}

/**
 * One request at a time, however many callers ask.
 *
 * `useRates` is called by eleven components and several of them mount
 * together - the accounts list and the currency picker inside its own form,
 * for one. Each kept its own "already tried" ref, so a cold start on that
 * page sent TWO identical requests, measured. On a free tier of a thousand a
 * month that is half the budget going to a race.
 *
 * Module scope rather than a ref, because the whole point is that the
 * instances cannot see each other. A second caller while one is in flight
 * gets the SAME promise, so it waits for the answer instead of asking again.
 *
 * Keyed on the argument: a request for a different base currency is a
 * different request and is allowed to overtake.
 *
 * @template T
 * @param {(arg: string) => Promise<T>} fn
 * @returns {(arg: string) => Promise<T>}
 */
export function singleFlight(fn) {
  /** @type {string|null} */
  let key = null
  /** @type {Promise<any>|null} */
  let pending = null
  return (arg) => {
    if (pending && key === arg) return pending
    key = arg
    const p = Promise.resolve(fn(arg)).finally(() => {
      // Only clear if nothing newer has taken over.
      if (pending === p) { pending = null; key = null }
    })
    pending = p
    return p
  }
}

/**
 * Whether the table is old enough to say so.
 *
 * Measured from what the PROVIDER last updated rather than from when we
 * happened to fetch it: refetching an unchanged table does not make it newer,
 * and a device that has been polling a stale endpoint all week should say so.
 *
 * @param {RateTable|null|undefined} table
 * @param {number} [nowMs]
 */
export function isStale(table, nowMs = Date.now()) {
  return olderThan(table, STALE_AFTER_MS, nowMs)
}

/**
 * How old the table is, in words.
 *
 * "today" and "yesterday" rather than a date, because that is the only thing
 * anybody is asking of a rate published once a day: it is either current or
 * it is not. Past that it counts days, which is what makes the word "stale"
 * beside it mean something.
 *
 * Measured from the PROVIDER's own timestamp for the same reason isStale is -
 * refetching an unchanged table does not make it newer.
 *
 * @param {RateTable|null|undefined} table
 * @param {number} [nowMs]
 */
export function rateAge(table, nowMs = Date.now()) {
  const at = Date.parse(table?.providerUpdatedAt ?? table?.fetchedAt ?? '')
  if (!Number.isFinite(at)) return 'at an unknown time'
  const days = Math.floor((nowMs - at) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/**
 * Every currency in a set of accounts that is not the base one.
 *
 * What the rest of the app asks before it does anything at all: a ledger with
 * no foreign account needs no rates, must not be told its rates are stale,
 * and must not go to the network on somebody's mobile data to find out.
 *
 * @param {Array<{currency?: string|null}>} accounts
 * @param {string} base
 * @returns {string[]}
 */
export function foreignCurrencies(accounts, base) {
  const b = String(base || '').toUpperCase()
  const out = new Set()
  for (const a of accounts ?? []) {
    const c = String(a?.currency || b).toUpperCase()
    if (c && c !== b) out.add(c)
  }
  return [...out].sort()
}

/**
 * Sum balances that are not all in the same currency.
 *
 * Returns the total AND what it had to leave out, because a net worth missing
 * an account is not a net worth and the screen has to be able to say so. The
 * alternative - dropping the unconvertible account silently - is the bug this
 * signature exists to make impossible to write.
 *
 * NO BASE means no conversion was asked for, and the values are summed as
 * they stand. That is not the same as converting to the empty string, which
 * would fail for every account and return zero - the shape this had for about
 * ten minutes, and the reason a report of a card owing 3,200 said it owed
 * nothing. Every caller that predates currencies passes no base, and has to
 * keep getting the answer it always got.
 *
 * @param {Array<{currency?: string|null, balance?: number|null}>} accounts
 * @param {string} base
 * @param {RateTable|null|undefined} table
 * @param {(a: any) => number} [valueOf]  for callers summing something other
 *   than `balance` - available credit, a goal's share
 * @returns {{total: number, missing: string[]}}
 */
export function sumInBase(accounts, base, table, valueOf = (a) => a?.balance ?? 0) {
  let total = 0
  const missing = new Set()
  if (!base) {
    for (const a of accounts ?? []) total += valueOf(a) ?? 0
    return { total, missing: [] }
  }
  for (const a of accounts ?? []) {
    const code = String(a?.currency || base).toUpperCase()
    const v = valueOf(a) ?? 0
    const converted = convert(v, code, base, table)
    if (converted == null) { missing.add(code); continue }
    total += converted
  }
  return { total, missing: [...missing].sort() }
}
