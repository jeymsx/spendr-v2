import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { localMonthStartIso, txMonthKey } from '../../utils/txDate'
import { monthKeyOf, parseMonth } from '../../lib/recap'
import { isFlowRow } from '../../lib/flows'

/* Its own module, and a small one, because Home asks it on every load: kept
   in with the recap's inputs (recapData.js), it brought all of them into
   Home's bundle as well. */

/* The last answer for each month asked about. A page that mounts again -
   Insights' tabs do, each time you come back to Overview - starts from it
   rather than from "not known yet", which the page would draw as the other
   thing (no recap) for the moment the lookup takes, and then swap. */
const lastAnswer = /** @type {Map<string, string|null>} */ (new Map())

/** Money that came or went - what makes a month worth a recap. @param {Record<string, any>} t */
const isFlow = (t) => isFlowRow(t)

/**
 * The month a recap can be offered for: `preferMonth` when that month is
 * over and has something in it, else the latest month that does.
 * `undefined` while it is being looked up, `null` when there is none yet.
 *
 * Two small indexed reads rather than the whole ledger - the same rule as
 * recapMonths, asked of the date index.
 *
 * @param {string|null} [preferMonth]  "2026-09"
 * @returns {string|null|undefined}
 */
export function useRecapMonth(preferMonth = null) {
  const key = preferMonth ?? ''
  return useLiveQuery(async () => {
    const answer = await lookUp(preferMonth)
    lastAnswer.set(key, answer)
    return answer
  }, [preferMonth], lastAnswer.get(key))
}

/** @param {string|null} preferMonth @returns {Promise<string|null>} */
async function lookUp(preferMonth) {
  const now = new Date()
  if (preferMonth && preferMonth < monthKeyOf(now)) {
    const { year, month } = parseMonth(preferMonth)
    const any = await db.transactions.where('date')
      .between(localMonthStartIso(year, month), localMonthStartIso(year, month + 1), true, false)
      .filter(isFlow).first()
    if (any) return preferMonth
  }
  const last = await db.transactions.where('date')
    .below(localMonthStartIso(now.getFullYear(), now.getMonth()))
    .reverse().filter(isFlow).first()
  return last ? txMonthKey(last.date) || null : null
}
