import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { localMonthStartIso } from '../../utils/txDate'
import { buildRecap, parseMonth } from '../../lib/recap'
import { netWorthNow } from '../../lib/netWorth'
import { txBase } from '../../lib/fxContext'
import { RATES_META_KEY } from '../../lib/fx'

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
 */

/** Every table a recap reads, in one go. @returns {Promise<RecapInputs>} */
export async function readRecapInputs() {
  const [transactions, categories, accounts, badges, rollover, name, rates] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.accounts.toArray(),
    db.badges.toArray(),
    db.meta.get('budgetRollover'),
    db.meta.get('displayName'),
    db.meta.get(RATES_META_KEY),
  ])
  return {
    transactions, categories, accounts, badges,
    rollover: !!rollover?.value,
    name: String(name?.value ?? '').trim(),
    rates: rates?.value ?? null,
  }
}

/**
 * The recap for `month`, from what readRecapInputs read.
 *
 * @param {RecapInputs} inputs
 * @param {{month: string, currency: string, now?: Date}} options
 */
export function recapFrom(inputs, { month, currency, now = new Date() }) {
  return buildRecap({
    month,
    transactions: inputs.transactions,
    categories: inputs.categories,
    badges: inputs.badges,
    netWorthNow: netWorthNow(inputs.accounts, inputs.transactions, currency, inputs.rates),
    currency,
    globalRollover: inputs.rollover,
    now,
  })
}

/** Money that came or went - what makes a month worth a recap. @param {Record<string, any>} t */
const isFlow = (t) => t.type === 'expense' || t.type === 'inflow'

/**
 * A glance at a month, for the Wrapped card: the emoji of its biggest
 * categories, most spent first, to decorate itself with - no amounts, since
 * the card sits on Home, where balances may be hidden - and a `stamp` that
 * changes whenever anything its picture shows could have, so a picture drawn
 * ahead of time is thrown away rather than shared out of date.
 *
 * `undefined` while it is being read.
 *
 * @param {string|null|undefined} month
 * @param {number} [count]
 * @returns {{icons: string[], stamp: string}|undefined}
 */
export function useMonthGlance(month, count = 3) {
  return useLiveQuery(async () => {
    if (!month) return { icons: [], stamp: '' }
    const { year, month: m } = parseMonth(month)
    const [rows, categories, badges, name] = await Promise.all([
      db.transactions.where('date')
        .between(localMonthStartIso(year, m), localMonthStartIso(year, m + 1), true, false)
        .filter(isFlow).toArray(),
      db.categories.toArray(),
      db.badges.count(),
      db.meta.get('displayName'),
    ])
    const icon = new Map(categories.map(c => [c.name, c.icon]))
    /** @type {Map<string, number>} */
    const spent = new Map()
    let total = 0
    for (const t of rows) {
      const v = txBase(t)
      total += t.type === 'expense' ? v : -v
      if (t.type === 'expense') spent.set(t.category, (spent.get(t.category) ?? 0) + v)
    }
    const ranked = [...spent].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([n]) => n)
    const icons = ranked.map(n => icon.get(n)).filter(Boolean).slice(0, count)
    return {
      icons,
      stamp: [rows.length, Math.round(total * 100), ranked[0] ?? '', icons.join(''), badges, String(name?.value ?? '').trim()].join('|'),
    }
  }, [month, count], undefined)
}
