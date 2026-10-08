/**
 * The fields a write really changes, out of the ones Dexie reports.
 *
 * Dexie hands an updating hook every field it thinks moved, and for an array
 * or an object it compares the copy, not the contents: a write of nothing but
 * a goal's syncedAt arrived as `{accounts, syncedAt}`, because the goal's
 * `accounts` list was a new array holding the same names. Read as an edit,
 * that stamped a fresh updatedAt over a bookkeeping write, the row went back
 * to unsent the moment it was marked sent, and two devices passed it back
 * and forth for good. So a field counts only when its value is different.
 *
 * @param {Record<string, any>} mods  what the hook was given
 * @param {Record<string, any>|undefined} obj  the row as it stands
 * @returns {string[]}
 */
export function changedKeys(mods, obj) {
  return Object.keys(mods).filter((k) => {
    const a = mods[k]
    const b = obj?.[k]
    if (a === b) return false
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      try { return JSON.stringify(a) !== JSON.stringify(b) } catch { return true }
    }
    return true
  })
}
