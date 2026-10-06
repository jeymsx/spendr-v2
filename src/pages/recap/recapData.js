import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { localMonthStartIso } from '../../utils/txDate'
import { buildRecap, parseMonth } from '../../lib/recap'
import { debtsCountFrom, netWorthNow } from '../../lib/netWorth'
import { txBase } from '../../lib/fxContext'
import { RATES_META_KEY } from '../../lib/fx'
import { isSpend } from '../../lib/flows'
import { spendingRows } from '../../utils/installments'

/**
 * Where a recap's figures come from, once.
 *
 * The story page reads these live; the Wrapped card's share button reads
 * them once and draws the picture without opening the story. Both go through
 * the same two functions, so the picture shared from Home is the picture the
 * story would have saved.
 *
 * The rate table is read with the rest, not taken from useRates: that hook's
 * table is null until its own read answers, and a recap built in that gap -
 * and frozen, as the story freezes the month it opened on - would have
 * priced a dollar account at nothing.
 */

/**
 * @typedef {object} RecapInputs
 * @property {Array<Record<string, any>>} transactions
 * @property {Array<Record<string, any>>} categories
 * @property {Array<Record<string, any>>} accounts
 * @property {Array<{key: string, earnedAt?: string}>} badges
 * @property {boolean} rollover
 * @property {string} name       the display name, trimmed; '' when there is none
 * @property {import('../../lib/fx').RateTable|null} rates  the cached exchange rates, if any
 * @property {Array<Record<string, any>>} debts
 * @property {boolean} includeDebts  Preferences › Count debts
 */

/** Every table a recap reads, in one go. @returns {Promise<RecapInputs>} */
export async function readRecapInputs() {
  const [transactions, categories, accounts, badges, rollover, name, rates, debts, debtPref] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.accounts.toArray(),
    db.badges.toArray(),
    db.meta.get('budgetRollover'),
    db.meta.get('displayName'),
    db.meta.get(RATES_META_KEY),
    db.debts.toArray(),
    db.meta.get('netWorthDebts'),
  ])
  return {
    transactions, categories, accounts, badges,
    rollover: !!rollover?.value,
    name: String(name?.value ?? '').trim(),
    rates: rates?.value ?? null,
    debts,
    includeDebts: debtsCountFrom(debtPref),
  }
}

/**
 * The recap for `month`, from what readRecapInputs read.
 *
 * @param {RecapInputs} inputs
 * @param {{month: string, currency: string, now?: Date}} options
 */
export function recapFrom(inputs, { month, currency, now = new Date() }) {
  const debts = inputs.includeDebts ? (inputs.debts ?? []) : []
  return buildRecap({
    month,
    transactions: inputs.transactions,
    categories: inputs.categories,
    badges: inputs.badges,
    netWorthNow: netWorthNow(inputs.accounts, inputs.transactions, currency, inputs.rates,
      { debts, includeDebts: !!inputs.includeDebts }),
    currency,
    globalRollover: inputs.rollover,
    now,
    debts,
    includeDebts: !!inputs.includeDebts,
  })
}

/**
 * The emoji of a month's biggest categories, most spent first - what the
 * Wrapped card decorates itself with. No amounts: the card sits on Home,
 * where balances may be hidden. `undefined` while it is being read.
 *
 * @param {string|null|undefined} month
 * @param {number} [count]
 * @returns {string[]|undefined}
 */
export function useMonthIcons(month, count = 3) {
  return useLiveQuery(async () => {
    if (!month) return []
    const { year, month: m } = parseMonth(month)
    const [rows, categories] = await Promise.all([
      db.transactions.where('date')
        .between(localMonthStartIso(year, m), localMonthStartIso(year, m + 1), true, false)
        .filter(isSpend).toArray(),
      db.categories.toArray(),
    ])
    const icon = new Map(categories.map(c => [c.name, c.icon]))
    /** @type {Map<string, number>} */
    const spent = new Map()
    // A month's window: an installment plan read by its labels (utils/installments).
    for (const t of spendingRows(rows, { complete: false })) spent.set(t.category, (spent.get(t.category) ?? 0) + txBase(t))
    return [...spent].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
      .map(([n]) => icon.get(n)).filter(Boolean).slice(0, count)
  }, [month, count], undefined)
}
