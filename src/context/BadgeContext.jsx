import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import db, { UNSYNCED } from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { BADGES, evaluateBadges } from '../lib/badges'

const BadgeContext = createContext(null)

/**
 * Who owns badge evaluation, and the queue of ones to celebrate.
 *
 * ── Why this is a provider and not just the hook ──
 *
 * The hook version ran wherever it was called, and it was called twice - the
 * dashboard chip and the badges page. Two copies of seven live queries is
 * merely wasteful; two copies of the AWARDING is a bug, because both would
 * race to write the same row and both would want to throw a celebration for
 * it. One owner, mounted once, and everything else reads from it.
 *
 * ── Awarding is a side effect of reading ──
 *
 * There is no "check badges" call for a save handler to forget. Every table
 * here is a live query, so the hundredth transaction re-runs the evaluation on
 * its own and the badge lands in the same tick the number changes - including
 * for rows that arrive by CSV import or by sync, which no save handler would
 * ever have seen.
 *
 * ── It only ever adds ──
 *
 * `evaluateBadges` answers "is this true now". Stored rows answer "was it ever
 * true", and that is the question a badge asks. So the union is one-way: a
 * goal edited upward after funding, a debt re-opened, a month that stops being
 * last month - none of them take anything back.
 */
export function BadgeProvider({ children }) {
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const accounts     = useLiveQuery(() => db.accounts.toArray(),     [], undefined)
  const categories   = useLiveQuery(() => db.categories.toArray(),   [], undefined)
  const debts        = useLiveQuery(() => db.debts.toArray(),        [], undefined)
  const recurring    = useLiveQuery(() => db.recurring.toArray(),    [], undefined)
  const goals        = useLiveQuery(() => db.goals.toArray(),        [], undefined)
  const stored       = useLiveQuery(() => db.badges.toArray(),       [], undefined)

  const loading = [transactions, accounts, categories, debts, recurring, goals, stored]
    .some(v => v === undefined)

  /* A date the memo can depend on without changing every render. The two
     month-based badges need to know which month is the current one, and that
     answer is stable for a day. */
  const todayKey = new Date().toDateString()

  const satisfied = useMemo(() => {
    if (loading) return new Set()
    return evaluateBadges({
      transactions, accounts, categories, debts, recurring, goals,
      today: new Date(todayKey),
    })
  }, [loading, transactions, accounts, categories, debts, recurring, goals, todayKey])

  /* Keys this provider has already written. The write re-runs the very live
     query that triggered it, so without a record of what went out the effect
     would put the same row again on the next tick, forever. */
  const written = useRef(new Set())

  /**
   * Whether the first settled evaluation has been through.
   *
   * It decides celebrate-or-not, and getting it wrong is the difference
   * between a nice moment and six modals stacked up on launch. Opening the app
   * on a ledger that already qualifies - a fresh install after a sync pull, or
   * the very first run of this feature against months of history - satisfies
   * several badges at once, and none of them were just earned. Those get
   * written silently. Only a badge that becomes true on a LATER pass is one
   * you did something for.
   */
  const primed = useRef(false)

  const [queue, setQueue] = useState([])

  useEffect(() => {
    if (loading) return
    const have = new Set((stored ?? []).map(r => r.key))
    const fresh = [...satisfied].filter(k => !have.has(k) && !written.current.has(k))

    if (!fresh.length) { primed.current = true; return }

    const earnedAt = new Date().toISOString()
    fresh.forEach(k => written.current.add(k))
    /* bulkPut, not bulkAdd: `key` is the primary key, so a row that raced in
       from another tab makes add() throw and put() a no-op. */
    db.badges
      .bulkPut(fresh.map(key => ({ key, earnedAt, synced: UNSYNCED })))
      .catch(e => console.warn('[badges] could not record', fresh, e))

    if (primed.current) setQueue(q => [...q, ...fresh])
    primed.current = true
  }, [loading, satisfied, stored])

  /**
   * The full set, in definition order, each carrying whether it is earned.
   *
   * Locked badges are returned too rather than filtered out - a page that
   * shows only what you have is a page that never tells you what is next,
   * which is the whole reason to open it twice.
   */
  const badges = useMemo(() => {
    const at = Object.fromEntries((stored ?? []).map(r => [r.key, r.earnedAt]))
    return BADGES.map(b => ({
      ...b,
      earned: !!at[b.key] || satisfied.has(b.key),
      earnedAt: at[b.key] ?? null,
    }))
  }, [stored, satisfied])

  const dismissCelebration = useCallback(() => setQueue(q => q.slice(1)), [])

  const value = useMemo(() => ({
    badges,
    earnedCount: badges.filter(b => b.earned).length,
    total: BADGES.length,
    loading,
    /* One at a time. Three at once would stack, and the second would be
       dismissed by the tap meant for the first. */
    celebrating: queue.length ? badges.find(b => b.key === queue[0]) ?? null : null,
    dismissCelebration,
  }), [badges, loading, queue, dismissCelebration])

  return <BadgeContext.Provider value={value}>{children}</BadgeContext.Provider>
}

/**
 * Read the badge state.
 *
 * Returns a safe empty shape outside the provider rather than throwing: the
 * desktop shell and the tests mount pieces of the app on their own, and a
 * badge count is never worth taking a screen down for.
 */
export function useBadges() {
  return useContext(BadgeContext) ?? {
    badges: [], earnedCount: 0, total: BADGES.length,
    loading: true, celebrating: null, dismissCelebration: () => {},
  }
}
