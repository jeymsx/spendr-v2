import { convert } from './fx'
import { currencyOfTx, currencyOfAccountName, getFxContext } from './fxContext'
import { roundMoney } from './currency'

/**
 * The two ends of a transfer, when they are not in the same currency.
 *
 * ── The bug this exists for ──
 *
 * A transfer had one number. The source lost it and the destination gained
 * it, which is right when both accounts hold pesos and wrong by a factor of
 * fifty-eight when one holds dollars: $100 sent from a dollar account to a
 * peso one put ₱100 into the peso account. Every cross-currency transfer ever
 * made moved the destination by the wrong amount.
 *
 * ── Two fields, both optional ──
 *
 * `toAmount` is what ARRIVED, in the destination's own currency, and
 * `toCurrency` is which currency that is. `amount` keeps meaning what it
 * always meant - what left the source, in the source's currency - so every
 * one of the places that reads a transfer from the source's side is right
 * without being touched.
 *
 * Both are absent on a same-currency transfer, which is nearly all of them,
 * and on every transfer written before this existed. Absent means "the
 * destination moved by `amount`", because that is exactly what happened to
 * those rows - so reversing an old transfer takes off what was put on, and
 * never a converted figure it was not given. Reading the received amount is
 * therefore always `toAmount ?? amount`, and nothing else.
 *
 * ── Why the received figure is typed, not computed ──
 *
 * A bank converts at its own rate, with its own spread, and sometimes a fee
 * folded in. The mid-market rate this app has is an estimate of that and
 * never the figure itself. So the transfer form offers the estimate and asks
 * for what actually arrived; only the writers that cannot ask - a template
 * tapped from the list, a card payment - fall back to the estimate.
 */

/**
 * What the destination's balance moved by, in the destination's currency.
 *
 * @param {Record<string, any>|null|undefined} tx
 * @returns {number}
 */
export function receivedAmount(tx) {
  return tx?.toAmount ?? tx?.amount ?? 0
}

/**
 * The currency receivedAmount is in.
 *
 * A row with no received leg arrived as its own amount, so it is in the
 * source's currency - which is what those rows have always displayed as.
 *
 * @param {Record<string, any>|null|undefined} tx
 * @param {import('./fxContext').FxContext} [context]
 * @returns {string}
 */
export function receivedCurrency(tx, context = getFxContext()) {
  if (tx?.toAmount != null && tx?.toCurrency) return String(tx.toCurrency).toUpperCase()
  return currencyOfTx(tx, context)
}

/**
 * Whether money moving between these two accounts changes currency.
 *
 * Takes names, because a transfer row holds names.
 *
 * @param {string|null|undefined} fromName
 * @param {string|null|undefined} toName
 * @param {import('./fxContext').FxContext} [context]
 */
export function crossesCurrency(fromName, toName, context = getFxContext()) {
  if (!fromName || !toName) return false
  return currencyOfAccountName(fromName, context) !== currencyOfAccountName(toName, context)
}

/**
 * What `amount` in `from` comes to in `to`, at today's mid-market rate,
 * rounded to the target currency's places. Null when there is no rate.
 *
 * @param {number} amount
 * @param {string} from
 * @param {string} to
 * @param {import('./fx').RateTable|null} [rates]
 * @returns {number|null}
 */
export function estimateConversion(amount, from, to, rates = getFxContext().rates) {
  if (!(amount > 0)) return amount === 0 ? 0 : null
  const v = convert(amount, from, to, rates)
  return v == null ? null : roundMoney(v, to)
}

/**
 * The received leg for a transfer, as fields to write.
 *
 * Same currency: both null, so an edit that moves a transfer back between
 * two peso accounts clears a leg it no longer has. Different currencies: the
 * figure given, or today's estimate when none was - and when there is no
 * rate either, `toAmount` stays null and the caller has to decide whether it
 * can write the row at all. `ok` says which.
 *
 * @param {{fromAccount?: string|null, toAccount?: string|null, amount?: number,
 *          toAmount?: number|null}} row
 * @param {import('./fxContext').FxContext} [context]
 * @returns {{toAmount: number|null, toCurrency: string|null, ok: boolean, estimated: boolean}}
 */
export function receivedLeg(row, context = getFxContext()) {
  const from = currencyOfAccountName(row?.fromAccount, context)
  const to = currencyOfAccountName(row?.toAccount, context)
  if (!row?.fromAccount || !row?.toAccount || from === to) {
    return { toAmount: null, toCurrency: null, ok: true, estimated: false }
  }
  if (row.toAmount != null && Number.isFinite(row.toAmount)) {
    return { toAmount: roundMoney(row.toAmount, to), toCurrency: to, ok: true, estimated: false }
  }
  const est = estimateConversion(row.amount ?? 0, from, to, context.rates)
  return { toAmount: est, toCurrency: est == null ? null : to, ok: est != null, estimated: true }
}

/**
 * The received leg after an edit, keeping the rate the person actually got.
 *
 * Changing only the amount of a $100 transfer that landed as ₱5,750 should
 * not throw that ₱57.50 rate away for today's mid-market one - it was a real
 * figure from a real bank. So a leg that survives the edit is SCALED by the
 * stored rate, and only a transfer whose ends changed gets a fresh estimate.
 *
 * @param {Record<string, any>} prev  the row as stored
 * @param {Record<string, any>} next  the row as it will be
 * @param {import('./fxContext').FxContext} [context]
 */
export function rederiveReceived(prev, next, context = getFxContext()) {
  const sameEnds = prev?.fromAccount === next?.fromAccount && prev?.toAccount === next?.toAccount
  if (sameEnds && prev?.toAmount != null && (prev.amount ?? 0) > 0) {
    const to = currencyOfAccountName(next.toAccount, context)
    if (crossesCurrency(next.fromAccount, next.toAccount, context)) {
      const scaled = next.amount === prev.amount
        ? prev.toAmount
        : roundMoney((next.amount ?? 0) * prev.toAmount / prev.amount, to)
      return { toAmount: scaled, toCurrency: to, ok: true, estimated: false }
    }
  }
  return receivedLeg({ ...next, toAmount: null }, context)
}

/**
 * The rate a transfer actually got, as "1 USD = 57.50 PHP". Null for a
 * transfer that did not change currency.
 *
 * @param {Record<string, any>|null|undefined} tx
 * @param {import('./fxContext').FxContext} [context]
 */
export function impliedRate(tx, context = getFxContext()) {
  if (tx?.toAmount == null || !(tx?.amount > 0)) return null
  const from = currencyOfTx(tx, context)
  const to = receivedCurrency(tx, context)
  if (from === to) return null
  return { from, to, rate: tx.toAmount / tx.amount }
}

/**
 * Which side of a transfer an account page is looking at, and what it saw.
 *
 * The source sees what left, in its currency; the destination sees what
 * arrived, in its own. Anything that is not a transfer is its own amount.
 *
 * @param {Record<string, any>} tx
 * @param {string|null|undefined} accountName
 * @param {import('./fxContext').FxContext} [context]
 * @returns {{amount: number, currency: string}}
 */
export function legFor(tx, accountName, context = getFxContext()) {
  if (tx?.type === 'transfer' && accountName && tx.toAccount === accountName && tx.fromAccount !== accountName) {
    return { amount: receivedAmount(tx), currency: receivedCurrency(tx, context) }
  }
  return { amount: tx?.amount ?? 0, currency: currencyOfTx(tx, context) }
}
