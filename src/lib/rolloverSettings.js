import db from '../db/db'
import { monthKey, startsForGlobalOn } from './rollover'

/**
 * Turn the "Carry budgets over" switch on or off.
 *
 * The switch is only a default, and a default has nothing to carry from: a
 * category rolls from the month its `rolloverFrom` names, and with none it
 * carries nothing (lib/rollover.js). Writing the flag alone - which is all
 * this switch used to do - turned on a feature that did nothing, for every
 * category at once.
 *
 * So turning it ON stamps the current month on every category that has no
 * start, in the same transaction as the flag: either both land or neither,
 * and no screen can read "on" before the dates are there. Turning it off
 * writes the flag and leaves the dates, so turning it on again later does not
 * reach further back than it did before.
 *
 * Which categories and what to stamp is startsForGlobalOn; this is the part
 * that touches the database.
 *
 * @param {boolean} on
 * @param {Date} [now]
 */
export async function setBudgetRollover(on, now = new Date()) {
  const month = monthKey(now)
  await db.transaction('rw', [db.meta, db.categories], async () => {
    await db.meta.put({ key: 'budgetRollover', value: on, updatedAt: now.toISOString() })
    if (!on) return
    for (const { id, rolloverFrom } of startsForGlobalOn(await db.categories.toArray(), month)) {
      await db.categories.update(id, { rolloverFrom })
    }
  })
}
