import { receivedAmount } from './transferLegs'

/**
 * A device's first sync with an account, and what it has to decide.
 *
 * ── The night this was written ──
 *
 * 2026-09-28. Spendr was set up fresh on a laptop, signed out, and then
 * signed in to the account a phone had been filling since May. The sync
 * merges by "newer wins", and every row that setup had just made was, by its
 * timestamp, the newest thing either side had ever seen: the seeded Cash at
 * zero, the accounts picked during setup, the starter categories with no
 * limits. So the laptop's copy won. Three balances went to zero on the server
 * and then on the phone, and every budget limit went with them. Nobody had
 * edited anything. A fresh install had been mistaken for a recent change.
 *
 * Newer-wins is right between devices that have both been syncing with the
 * account, because each one's last edit is real. It is wrong the first time a
 * device meets an account that already has data of its own: the device's
 * timestamps say nothing about that account. So the first sync does not
 * merge by time. The person is asked, and the account's copy is the default.
 *
 * Pure, so the decisions can be pinned without a database or a network. The
 * reads and writes live in sync.js.
 */

/** meta: the user this device last finished a sync with. */
export const SYNCED_WITH_KEY = 'syncedWith'

/**
 * Where this device stands with the account it is about to sync.
 *
 *   known     it has synced with this account before - merge as always
 *   backfill  it synced before this key existed; record that and merge
 *   unknown   first contact, or it last synced with someone else
 *
 * `backfill` trusts the lastSync stamp as the trace of an earlier sync. That
 * covers every device already signed in on the day this shipped, which must
 * not be asked a question about data it has been syncing for months.
 *
 * @param {{userId: string, mark: string|null|undefined, syncedBefore: boolean}} p
 * @returns {'known'|'backfill'|'unknown'}
 */
export function deviceStanding({ userId, mark, syncedBefore }) {
  if (mark === userId) return 'known'
  if (!mark && syncedBefore) return 'backfill'
  return 'unknown'
}

/**
 * Whether an account has anything a device could overwrite.
 *
 * Categories alone do not count. An account whose very first push stopped
 * part-way holds a few, and asking about those would ask about this device's
 * own data.
 *
 * @param {{transactions: number, accounts: number}} remote
 */
export function accountHasData(remote) {
  return (remote?.transactions ?? 0) > 0 || (remote?.accounts ?? 0) > 0
}

/**
 * What "Keep both" adds back onto the account's balances.
 *
 * The pull after that choice takes the ACCOUNT's copy of every account the
 * two sides share, balance included. That balance knows nothing about the
 * entries made on this device, which are about to be uploaded, so each one's
 * effect goes back on top. Only on accounts the server has, though: an
 * account that exists only here keeps its own balance, and that balance
 * already counts them.
 *
 * The same legs as applyBalanceEffect in db/balances.js, so a transfer that
 * arrived in another currency adds what arrived.
 *
 * @param {Array<Record<string, any>>} txs  every transaction on this device
 * @param {Set<string>} remoteTxIds  tx_ids the server already has
 * @param {Set<string>} remoteAccounts  names of the accounts the server has
 * @returns {Map<string, number>}  account name to the amount to add
 */
export function localOnlyDeltas(txs, remoteTxIds, remoteAccounts) {
  /** @type {Map<string, number>} */
  const out = new Map()
  /** @param {string|null|undefined} name @param {number} v */
  const add = (name, v) => {
    if (!name || !v || !remoteAccounts.has(name)) return
    out.set(name, (out.get(name) ?? 0) + v)
  }
  for (const tx of txs) {
    if (tx.txId && remoteTxIds.has(tx.txId)) continue
    const a = tx.amount ?? 0
    if (tx.type === 'expense') add(tx.account, -a)
    else if (tx.type === 'inflow') add(tx.account, a)
    else if (tx.type === 'transfer') {
      add(tx.fromAccount, -a)
      add(tx.toAccount, receivedAmount(tx))
    }
  }
  return out
}

/** @param {number} n @param {string} one @param {string} many */
function count(n, one, many) {
  return `${n.toLocaleString('en-PH')} ${n === 1 ? one : many}`
}

/**
 * What the first-sync sheet says: what the account holds, and what each
 * answer does to this device.
 *
 * @param {{remote: {transactions: number, accounts: number}, local: {transactions: number}}} info
 */
export function firstSyncCopy(info) {
  const { transactions, accounts } = info.remote
  const own = info.local.transactions
  const held = transactions > 0
    ? `It has ${count(transactions, 'entry', 'entries')} across ${count(accounts, 'account', 'accounts')}.`
    : `It has ${count(accounts, 'account', 'accounts')} and no entries yet.`
  return {
    body: own > 0 ? `${held} This device has ${count(own, 'entry', 'entries')} of its own.` : held,
    account: own > 0
      ? `Removes this device's ${count(own, 'entry', 'entries')}.`
      : 'Replaces what you set up on this device.',
    both: own > 0 ? `Adds this device's ${count(own, 'entry', 'entries')} to your account.` : null,
  }
}
