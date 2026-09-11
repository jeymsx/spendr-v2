import { useEffect, useMemo, useRef } from 'react'
import db, { UNSYNCED } from '../db/db'
import { useLiveQuery } from './useLiveQuery'
import { BADGES, evaluateBadges } from '../lib/badges'

/**
 * Every badge, with the date it was earned on the ones that have been.
 *
 * ── Awarding is a side effect of reading ──
 *
 * There is no "check badges" button and no place in the write path that has
 * to remember to call one. Every table this reads is a live query, so adding
 * the hundredth transaction re-runs the evaluation on its own, and the badge
 * lands in the same tick the number changes. The alternative - awarding
 * inside each save handler - means eleven call sites that can each forget,
 * and a ledger imported from CSV that earns nothing because nobody typed it.
 *
 * ── It only ever adds ──
 *
 * `evaluateBadges` answers "is this true now". Stored rows answer "was it ever
 * true", and that is the question a badge asks. So the union is one-way: a
 * goal edited upward after it was funded, a debt re-opened, a month that
 * stops being last month - none of them take anything back.
 *
 * ── Why the guard ref ──
 *
 * The write below re-runs the very live query that triggered it. Without a
 * record of what has already been written, a badge earned during this session
 * would be re-put on the next tick, which re-fires the query, which puts
 * again. `written` holds the keys this hook has already persisted, so the
 * second pass has nothing to do and the loop ends after one round.
 */
export function useBadges() {
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const accounts     = useLiveQuery(() => db.accounts.toArray(),     [], undefined)
  const categories   = useLiveQuery(() => db.categories.toArray(),   [], undefined)
  const debts        = useLiveQuery(() => db.debts.toArray(),        [], undefined)
  const recurring    = useLiveQuery(() => db.recurring.toArray(),    [], undefined)
  const goals        = useLiveQuery(() => db.goals.toArray(),        [], undefined)
  const stored       = useLiveQuery(() => db.badges.toArray(),       [], undefined)

  const loading = [transactions, accounts, categories, debts, recurring, goals, stored]
    .some(v => v === undefined)

  /* A date the memo can depend on without changing on every render. Badges
     that judge a calendar month need to know which month is the current one,
     and that answer is stable for a day. */
  const todayKey = new Date().toDateString()

  const satisfied = useMemo(() => {
    if (loading) return new Set()
    return evaluateBadges({
      transactions, accounts, categories, debts, recurring, goals,
      today: new Date(todayKey),
    })
  }, [loading, transactions, accounts, categories, debts, recurring, goals, todayKey])

  const written = useRef(new Set())

  useEffect(() => {
    if (loading) return
    const have = new Set((stored ?? []).map(r => r.key))
    const fresh = [...satisfied].filter(k => !have.has(k) && !written.current.has(k))
    if (!fresh.length) return

    const earnedAt = new Date().toISOString()
    fresh.forEach(k => written.current.add(k))
    /* bulkPut, not bulkAdd: `key` is the primary key, so a row that raced in
       from another tab makes add() throw and put() a no-op. `synced` marks it
       for the next push the way every other table does. */
    db.badges
      .bulkPut(fresh.map(key => ({ key, earnedAt, synced: UNSYNCED })))
      .catch(e => console.warn('[badges] could not record', fresh, e))
  }, [loading, satisfied, stored])

  /**
   * The full set, in definition order, each carrying whether it is earned.
   *
   * Locked badges are returned too rather than filtered out - a page that
   * shows only what you have is a page that never tells you what is next,
   * which is the whole reason someone opens it twice.
   */
  const list = useMemo(() => {
    const at = Object.fromEntries((stored ?? []).map(r => [r.key, r.earnedAt]))
    return BADGES.map(b => ({
      ...b,
      earned: !!at[b.key] || satisfied.has(b.key),
      earnedAt: at[b.key] ?? null,
    }))
  }, [stored, satisfied])

  return {
    badges: list,
    earnedCount: list.filter(b => b.earned).length,
    total: BADGES.length,
    loading,
  }
}
