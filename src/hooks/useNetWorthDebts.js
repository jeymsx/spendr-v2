import db from '../db/db'
import { useLiveQuery } from './useLiveQuery'
import { debtsCountFrom } from '../lib/netWorth'

/**
 * Whether money between you and other people counts toward net worth, and
 * the debts to count when it does.
 *
 * The switch is Preferences › "Count debts", stored in meta as
 * `netWorthDebts`; it is on unless you turned it off. Every screen that shows
 * net worth reads it through here, so turning it off changes them all at once.
 *
 * `ready` is false until both reads land. A figure drawn before then would
 * jump by whatever is owed a frame later.
 *
 * @returns {{include: boolean, debts: Array<Record<string, any>>, ready: boolean}}
 */
export default function useNetWorthDebts() {
  const pref = useLiveQuery(async () => (await db.meta.get('netWorthDebts')) ?? null, [], undefined)
  const debts = useLiveQuery(() => db.debts.toArray(), [], undefined)
  const include = debtsCountFrom(pref)
  return {
    include,
    debts: include ? (debts ?? []) : [],
    ready: pref !== undefined && debts !== undefined,
  }
}
