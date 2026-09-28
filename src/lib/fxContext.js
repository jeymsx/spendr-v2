import { DEFAULT_CURRENCY } from './currency'
import { convert } from './fx'

/**
 * What the currency situation is, readable synchronously.
 *
 * ── Why this exists at all ──
 *
 * A transaction has to be stamped with the currency it is in and what it was
 * worth, at the moment it is written. There are seventeen places in this app
 * that insert a transaction, and a convention that seventeen writers have to
 * remember is not a convention - it is the bug that shipped when 18 of 31
 * write sites forgot to move `updatedAt`, and the reason db.js stamps that in
 * a Dexie hook instead.
 *
 * So the stamping is a hook too. But a Dexie `creating` hook is SYNCHRONOUS,
 * and the three things it needs - the ledger's currency, each account's
 * currency, and the rate table - all live in Dexie. It cannot go and read
 * them.
 *
 * Hence a snapshot. FxContextSync keeps it current from the same live queries
 * everything else uses, and the hook reads it without awaiting anything. It
 * is the same shape as the base currency in lib/money.js, for the same
 * reason, and with the same rule: exactly one writer.
 *
 * ── What happens when it is stale or empty ──
 *
 * Nothing wrong. An empty snapshot means every account is in the ledger's
 * currency, which is the truth for every ledger that has not added a foreign
 * account - and for one that has, the row simply goes unstamped and the
 * reader falls back to converting at today's rate. Degraded, never incorrect:
 * the one thing this must not do is record a confident wrong number.
 */

/**
 * @typedef {object} FxContext
 * @property {string} base   the ledger's currency
 * @property {import('./fx').RateTable|null} rates
 * @property {Map<string, string>} byAccount   account name -> its currency
 */

/** @type {FxContext} */
let ctx = { base: DEFAULT_CURRENCY, rates: null, byAccount: new Map() }

/**
 * Only FxContextSync calls this.
 *
 * @param {{base?: string, rates?: any, accounts?: Array<{name?: string, currency?: string|null}>}} next
 */
export function setFxContext(next) {
  const base = next.base || DEFAULT_CURRENCY
  const byAccount = new Map()
  for (const a of next.accounts ?? []) {
    if (a?.name) byAccount.set(a.name, String(a.currency || base).toUpperCase())
  }
  ctx = { base, rates: next.rates ?? null, byAccount }
  return ctx
}

/** @returns {FxContext} */
export function getFxContext() {
  return ctx
}

/** Test seam. Resets to the state a fresh module has. */
export function resetFxContext() {
  ctx = { base: DEFAULT_CURRENCY, rates: null, byAccount: new Map() }
}

/**
 * Which account a transaction's amount belongs to.
 *
 * `account` for an expense or an inflow. For a TRANSFER it is the source,
 * because that is the account the amount is denominated in - a transfer
 * between two currencies is a conversion, and what left the source is the
 * number the user typed.
 *
 * @param {any} tx
 */
export function accountOf(tx) {
  return tx?.account ?? tx?.fromAccount ?? tx?.toAccount ?? null
}

/**
 * The currency a transaction's `amount` is in, from what we know right now.
 *
 * @param {any} tx
 * @param {FxContext} [context]
 */
export function currencyOfTx(tx, context = ctx) {
  if (tx?.currency) return String(tx.currency).toUpperCase()
  const name = accountOf(tx)
  return (name && context.byAccount.get(name)) || context.base
}

/**
 * The currency of an account, by NAME.
 *
 * Accounts are keyed by name throughout this app - transactions reference
 * one, goals fund from a list of them - so plenty of callers have a name and
 * no record. Falls back to the ledger's own currency, which is right both for
 * an account that has not said otherwise and for a name that no longer
 * resolves to anything.
 *
 * @param {string|null|undefined} name
 * @param {FxContext} [context]
 */
export function currencyOfAccountName(name, context = ctx) {
  return (name && context.byAccount.get(name)) || context.base
}

/**
 * Stamp a transaction being written, in place.
 *
 * ── What it sets, and when it declines ──
 *
 * All three, always, when it can. `baseAmount` is assigned from `amount`
 * ITSELF when the currencies match - no multiply by one - so a peso row in a
 * peso ledger stores the identical number it always did.
 *
 * When the row is foreign and there is no rate, it stamps `currency` and
 * stops. A null baseAmount reads as "not priced", and the reader converts at
 * today's rate rather than trusting a figure nobody computed.
 *
 * An explicit value always wins: a restore carries its own, and so does a row
 * arriving from sync. Neither is being created here in any meaningful sense,
 * and overwriting them would rewrite history on the way in.
 *
 * ── The rate is today's, and for a back-dated row that is an approximation ──
 *
 * The free endpoint publishes the latest rates only. A row written now is
 * being priced on its own date, which is exact; a row the user back-dates by
 * a month is priced at today's rate, which is not. That is the standard
 * trade, it is off by however much the pair moved in a month, and it is
 * still enormously better than counting a dollar as a peso.
 *
 * @param {any} row  mutated in place, the way a Dexie creating hook expects
 * @param {FxContext} [context]
 */
export function stampTxCurrency(row, context = ctx) {
  if (!row || typeof row !== 'object') return row
  if (row.currency || row.baseAmount != null || row.baseCurrency) return row

  const base = context.base
  const code = currencyOfTx(row, context)
  row.currency = code

  if (code === base) {
    // The same number, not a converted one.
    row.baseAmount = row.amount ?? 0
    row.baseCurrency = base
    return row
  }

  const priced = convert(row.amount ?? 0, code, base, context.rates)
  if (priced == null) return row
  row.baseAmount = priced
  row.baseCurrency = base
  return row
}

/**
 * The pricing fields an EDIT has to write alongside its patch.
 *
 * stampTxCurrency only runs when a row is created, so an edit that changed
 * the amount left `baseAmount` at the old figure - and every total reads
 * `baseAmount` first. A lunch corrected from 1,500 to 150 went on counting
 * as 1,500 in the budget, the recap and Insights.
 *
 *   Same account, new amount  scale the stored figure by the same ratio, so
 *                             the rate on the day is kept rather than
 *                             swapped for today's.
 *   Account changed           price it afresh, as a new row would be - the
 *                             currency may be different now.
 *   Nothing money-related     no fields at all.
 *
 * @param {any} tx     the row as stored
 * @param {any} patch  the fields being changed
 * @param {FxContext} [context]
 * @returns {{currency?: string|null, baseAmount?: number|null, baseCurrency?: string|null}}
 */
export function repriceForEdit(tx, patch, context = ctx) {
  if (!tx || !patch) return {}
  const moved = ['account', 'fromAccount'].some(k => k in patch && patch[k] !== tx[k])
  const amountChanged = 'amount' in patch && patch.amount !== tx.amount
  if (!moved && !amountChanged) return {}

  if (!moved && tx.baseAmount != null && tx.baseCurrency && (tx.amount ?? 0) !== 0) {
    const ratio = (patch.amount ?? 0) / tx.amount
    return { baseAmount: Math.round(tx.baseAmount * ratio * 100) / 100 }
  }

  const fresh = { ...tx, ...patch }
  delete fresh.currency
  delete fresh.baseAmount
  delete fresh.baseCurrency
  stampTxCurrency(fresh, context)
  return {
    currency: fresh.currency ?? null,
    baseAmount: fresh.baseAmount ?? null,
    baseCurrency: fresh.baseCurrency ?? null,
  }
}

/**
 * What a transaction is worth in `target`, best available.
 *
 * Three cases, in the order they should be preferred:
 *
 *   1. Priced on the day, in the currency asked for. Exact and historical -
 *      the figure does not move when the rate does.
 *   2. Priced on the day in some OTHER currency. The historical conversion is
 *      kept and only the last hop uses today's rate, which is the best
 *      available answer for "what is my dollar-quoted March worth in euros".
 *   3. Never priced - every row written before 018, and any row whose rate
 *      was unavailable. Converted from its own currency at today's rate.
 *
 * Case 3 with a matching currency returns `tx.amount` ITSELF, through no
 * arithmetic, which is what makes this safe to drop into every existing
 * aggregate: a single-currency ledger gets back exactly the numbers it had.
 *
 * Returns null when it genuinely cannot say, so a caller can report the gap
 * rather than add a zero.
 *
 * @param {any} tx
 * @param {string} target
 * @param {import('./fx').RateTable|null} [rates]
 * @param {FxContext} [context]
 * @returns {number|null}
 */
export function txAmountIn(tx, target, rates = ctx.rates, context = ctx) {
  if (!tx) return null
  const to = String(target || '').toUpperCase()

  if (tx.baseAmount != null && tx.baseCurrency) {
    const stored = String(tx.baseCurrency).toUpperCase()
    if (stored === to) return tx.baseAmount
    return convert(tx.baseAmount, stored, to, rates)
  }

  return convert(tx.amount ?? 0, currencyOfTx(tx, context), to, rates)
}

/**
 * What a transaction is worth in the LEDGER's currency, for an aggregate.
 *
 * ── Why this takes no arguments ──
 *
 * It replaces `(t.amount ?? 0)` at about a dozen aggregation sites - monthly
 * spending, each budget's spend, the trend series, the rollover carry, the
 * category totals. Threading a currency and a rate table through all of them
 * would mean changing the signature of four pure functions and every caller
 * of each, to pass the same two values every time. That is the shape that
 * went wrong with `updatedAt`, and the snapshot exists precisely so it does
 * not have to be.
 *
 * ── It never returns zero for a row it cannot price ──
 *
 * A transaction the app cannot convert falls back to its FACE VALUE, which is
 * exactly what every one of these sites did before this existed. Degrading to
 * the old behaviour is honest; degrading to nought would delete somebody's
 * spending from their own totals, which is the one outcome worse than an
 * unconverted figure.
 *
 * That is the opposite of the choice sumInBase makes for balances, and the
 * difference is deliberate: a net worth is ONE figure and can say "USD not
 * included", where a spending total is a row in a chart with nowhere to put
 * a caveat.
 *
 * @param {any} tx
 * @returns {number}
 */
export function txBase(tx) {
  const v = txAmountIn(tx, ctx.base, ctx.rates, ctx)
  return v == null ? (tx?.amount ?? 0) : v
}

/**
 * Sum transactions in one currency, reporting what could not be priced.
 *
 * Same contract as sumInBase in lib/fx.js and for the same reason: a total
 * that silently omits a row is a wrong total that looks right.
 *
 * @param {any[]} txs
 * @param {string} target
 * @param {import('./fx').RateTable|null} [rates]
 * @param {FxContext} [context]
 * @returns {{total: number, missing: string[]}}
 */
export function sumTxIn(txs, target, rates = ctx.rates, context = ctx) {
  let total = 0
  const missing = new Set()
  for (const tx of txs ?? []) {
    const v = txAmountIn(tx, target, rates, context)
    if (v == null) { missing.add(currencyOfTx(tx, context)); continue }
    total += v
  }
  return { total, missing: [...missing].sort() }
}
