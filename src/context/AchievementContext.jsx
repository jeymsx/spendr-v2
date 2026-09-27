import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import db, { UNSYNCED } from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useSyncState } from '../hooks/useSyncState'
import { useAuth } from './AuthContext'
import {
  ACHIEVEMENTS, BUDGET_FROM_META, PRIMED_META, TRACKS, achievementDef, dayKey, evaluateAchievements, toneHue,
  trackProgress, trackView,
} from '../lib/achievements'
import { CHALLENGES, MAX_ACTIVE, challengeDef, judgeChallenge } from '../lib/challenges'

const AchievementContext = createContext(null)

/** Days kept in the record of when the app was open. A little over two years. */
const ACTIVE_DAYS_KEPT = 800

/**
 * @typedef {object} Celebration
 * @property {string} id
 * @property {'badge'|'milestone'|'challenge'} kind
 * @property {string} key
 * @property {string} name
 * @property {string} blurb
 * @property {string} glyph
 * @property {string} hue
 * @property {'hex'|'circle'|'shield'} shape
 * @property {string} [level]
 * @property {string|null} [earnedAt]
 */

/** An achievement definition, as the celebration and the picture want it. @param {import('../lib/achievements').AchievementDef} def @param {string|null} [earnedAt] @returns {Celebration} */
export function celebrationOf(def, earnedAt = null) {
  return {
    id: def.key, kind: def.kind, key: def.key, name: def.name, blurb: def.blurb, glyph: def.glyph,
    hue: toneHue(def.tone), shape: def.kind === 'milestone' ? 'circle' : 'hex', level: def.level, earnedAt,
  }
}

/**
 * The moments a set of newly earned keys makes: in the order the collection
 * lists them, and one per track. Reaching three levels of a track at once - a
 * month of history arriving, limits set on a ledger that was already inside
 * them - is one moment, at the highest of the three, not three screens in a
 * row saying nearly the same thing.
 *
 * @param {string[]} keys @param {string} earnedAt
 * @returns {Celebration[]}
 */
export function momentsFor(keys, earnedAt) {
  /** @type {Map<string, import('../lib/achievements').AchievementDef>} */
  const top = new Map()
  const rest = []
  for (const def of keys.map(achievementDef)) {
    if (!def) continue
    if (def.kind !== 'milestone' || !def.track) { rest.push(def); continue }
    const held = top.get(def.track)
    if (!held || (def.n ?? 0) > (held.n ?? 0)) top.set(def.track, def)
  }
  const order = new Map(ACHIEVEMENTS.map((a, i) => [a.key, i]))
  return [...top.values(), ...rest]
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
    .map(def => celebrationOf(def, earnedAt))
}

/** A won challenge, as a celebration. @param {ChallengeRow} row @returns {Celebration | null} */
export function challengeCelebration(row) {
  const def = challengeDef(row.key)
  if (!def) return null
  return {
    id: `challenge:${row.syncId ?? row.id}`, kind: 'challenge', key: def.key, name: def.name, blurb: def.win,
    glyph: def.glyph, hue: toneHue(def.tone), shape: 'shield', earnedAt: row.finishedAt ?? null,
  }
}

/**
 * Who owns achievements: working out what is earned, writing it down, judging
 * challenges, and the queue of moments to celebrate.
 *
 * ── One owner ──
 *
 * Awarding is a side effect of reading the ledger, and two copies of the
 * reading would race to write the same row and both throw a celebration for
 * it. Mounted once, at the layout - AppLayout on a phone, WebLayout on a
 * desktop.
 *
 * ── Awarding is still a side effect of reading ──
 *
 * Every table is a live query, so the fiftieth entry, the last quiet day of a
 * weekend challenge and a sync that brings in a month of history all re-run
 * the evaluation by themselves. There is no "check achievements" call for a
 * save handler to forget.
 *
 * ── Quiet when history arrives, not every launch ──
 *
 * The first run of this version against months of history, a sign-in that
 * pulls an account down, a restore, an import: each satisfies many levels at
 * once, and none were just earned. Those passes write silently (PRIMED_META
 * in lib/achievements.js says which they are). Every other pass celebrates -
 * including the first one after a launch, because the levels that move on
 * their own move while the app is closed: seven quiet days become a no-spend
 * week at midnight, a month turns green on the 2nd. A challenge that finished
 * while the app was closed is worth its moment for the same reason.
 *
 * ── The write decides ──
 *
 * Two open tabs each run this, and each would write the same new level and
 * throw its own celebration. So a key is added only if it is still missing,
 * a verdict only if the challenge is still running, each inside a
 * transaction - and only what this tab actually wrote is celebrated here.
 *
 * ── Not on a ledger that has not caught up ──
 *
 * Signed in, nothing is written while a sync runs, and no challenge is
 * judged until one has finished this session - see hooks/useSyncState.js for
 * what goes wrong otherwise. Signed out, nothing waits.
 */
export function AchievementProvider({ children }) {
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const accounts     = useLiveQuery(() => db.accounts.toArray(),     [], undefined)
  const categories   = useLiveQuery(() => db.categories.toArray(),   [], undefined)
  const debts        = useLiveQuery(() => db.debts.toArray(),        [], undefined)
  const recurring    = useLiveQuery(() => db.recurring.toArray(),    [], undefined)
  const goals        = useLiveQuery(() => db.goals.toArray(),        [], undefined)
  const stored       = useLiveQuery(() => db.badges.toArray(),       [], undefined)
  const challenges   = useLiveQuery(() => db.challenges.toArray(),   [], undefined)
  const activeDays   = useLiveQuery(async () => {
    const row = await db.meta.get('activeDays')
    return Array.isArray(row?.value) ? row.value : []
  }, [], undefined)
  const rollover     = useLiveQuery(async () => !!(await db.meta.get('budgetRollover'))?.value, [], undefined)
  const primedFor    = useLiveQuery(async () => (await db.meta.get(PRIMED_META))?.value ?? null, [], undefined)
  const budgetFrom   = useLiveQuery(async () => (await db.meta.get(BUDGET_FROM_META))?.value ?? null, [], undefined)

  const loading = [transactions, accounts, categories, debts, recurring, goals, stored, challenges, activeDays, rollover, primedFor, budgetFrom]
    .some(v => v === undefined)
  const { syncing, caughtUp } = useSyncState()
  const { user } = useAuth()
  const identity = user?.id ?? 'local'

  /* The record of days the app was open, which is what vouches for a quiet
     day in the no-spend streak (lib/achievements.js). Today, now and whenever
     the app comes back to the front - a phone left open overnight is a new
     day by morning. */
  useEffect(() => {
    const mark = () => {
      const today = dayKey(new Date())
      db.meta.get('activeDays').then(row => {
        const list = Array.isArray(row?.value) ? row.value : []
        if (list.includes(today)) return
        return db.meta.put({ key: 'activeDays', value: [...list, today].sort().slice(-ACTIVE_DAYS_KEPT) })
      }).catch(() => { /* private mode: the streak just has less to go on */ })
    }
    mark()
    const onShow = () => { if (document.visibilityState === 'visible') mark() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  /* Stable for a day, so the memo re-runs when the date changes rather than
     on every render. */
  const todayKey = new Date().toDateString()

  const input = useMemo(() => (loading ? null : {
    transactions, accounts, categories, debts, recurring, goals, challenges, activeDays, budgetFrom,
    today: new Date(todayKey),
  }), [loading, transactions, accounts, categories, debts, recurring, goals, challenges, activeDays, budgetFrom, todayKey])

  const progress = useMemo(() => (input ? trackProgress(input) : {}), [input])
  const satisfied = useMemo(() => (input ? evaluateAchievements(input, progress) : new Set()), [input, progress])

  /** Keys and challenge verdicts this provider has written, so a write that
   *  re-runs its own query does not go out twice. */
  const written = useRef(new Set())
  const [queue, setQueue] = useState(/** @type {Celebration[]} */ ([]))

  // ── Award ──
  useEffect(() => {
    if (loading || syncing) return
    const celebrate = primedFor === identity
    const have = new Set((stored ?? []).map(r => r.key))
    const fresh = [...satisfied].filter(k => !have.has(k) && !written.current.has(k))
    if (!fresh.length) {
      if (!celebrate) db.meta.put({ key: PRIMED_META, value: identity }).catch(() => { /* next pass tries again */ })
      return
    }

    const earnedAt = new Date().toISOString()
    fresh.forEach(k => written.current.add(k))
    /* Celebrated once it is written, not before: a moment for something the
       database never took would be one the collection then does not show. */
    db.transaction('rw', db.badges, db.meta, async () => {
      const there = await db.badges.bulkGet(fresh)
      const mine = fresh.filter((_, i) => !there[i])
      if (mine.length) {
        await db.badges.bulkAdd(mine.map(key => ({ key, earnedAt, synced: UNSYNCED, ...(celebrate ? {} : { silent: true }) })))
      }
      if (!celebrate) await db.meta.put({ key: PRIMED_META, value: identity })
      return mine
    })
      .then(mine => {
        if (celebrate && mine.length) setQueue(q => [...q, ...momentsFor(mine, earnedAt)])
      })
      .catch(e => console.warn('[achievements] could not record', fresh, e))
  }, [loading, satisfied, stored, syncing, primedFor, identity])

  /* The month there were first two limits to be inside - see the budget
     track in lib/achievements.js. Recorded once. On the pass that takes
     stock of a device for the first time the limits were already there, so
     the history counts; set later, only the months from then on do. */
  useEffect(() => {
    if (loading || budgetFrom) return
    const limits = (categories ?? []).filter(c => c?.type !== 'inflow' && (c?.budget ?? 0) > 0)
    if (limits.length < 2) return
    const from = primedFor == null ? '0000-00' : dayKey(new Date()).slice(0, 7)
    db.meta.put({ key: BUDGET_FROM_META, value: from }).catch(() => { /* next pass tries again */ })
  }, [loading, budgetFrom, categories, primedFor])

  // ── Judge the challenges running ──
  const ctx = useMemo(() => (input ? {
    transactions: input.transactions, categories: input.categories, globalRollover: !!rollover,
    activeDays: input.activeDays, today: input.today,
  } : null), [input, rollover])

  const judged = useMemo(() => {
    if (!ctx) return []
    return (challenges ?? []).map(row => ({ row, judged: judgeChallenge(row, ctx) }))
  }, [challenges, ctx])

  useEffect(() => {
    if (!caughtUp || syncing) return
    for (const { row, judged: j } of judged) {
      if (row.status !== 'active' || !j || j.status === 'active' || row.id == null) continue
      const mark = `${row.id}:${j.status}`
      if (written.current.has(mark)) continue
      written.current.add(mark)
      const finishedAt = new Date().toISOString()
      const won = j.status === 'won'
      const id = row.id
      db.transaction('rw', db.challenges, async () => {
        // Only while it is still running: another tab, or a sync, may have settled it first.
        const latest = await db.challenges.get(id)
        if (latest?.status !== 'active') return false
        await db.challenges.update(id, { status: j.status, finishedAt, synced: UNSYNCED })
        return true
      })
        .then(changed => {
          const moment = changed && won ? challengeCelebration({ ...row, finishedAt }) : null
          if (moment) setQueue(q => [...q, moment])
        })
        .catch(e => console.warn('[challenges] could not record', row.key, e))
    }
  }, [judged, caughtUp, syncing])

  // ── Actions ──
  const startChallenge = useCallback(async (/** @type {string} */ key, /** @type {Record<string, any>} */ params = {}) => {
    const def = challengeDef(key)
    if (!def || !ctx) throw new Error('That challenge is not available.')
    /* Only the ones this version knows. One started on a newer version
       elsewhere is not shown and never settles here, and must not quietly
       use up a place. */
    const running = (challenges ?? []).filter(c => c.status === 'active' && challengeDef(c.key))
    if (running.some(c => c.key === key)) throw new Error('That one is already running.')
    if (running.length >= MAX_ACTIVE) throw new Error(`You can run ${MAX_ACTIVE} challenges at a time.`)
    const avail = def.available(ctx)
    if (!avail.ok) throw new Error(avail.why ?? 'That challenge is not available yet.')
    const plan = def.plan(ctx, { ...def.defaults(ctx), ...params })
    return db.challenges.add({
      key, params: plan.params, startDay: plan.startDay, endDay: plan.endDay, status: 'active',
      startedAt: new Date().toISOString(), finishedAt: null, synced: UNSYNCED,
    })
  }, [challenges, ctx])

  const quitChallenge = useCallback(async (/** @type {number} */ id) => {
    await db.challenges.update(id, { status: 'quit', finishedAt: new Date().toISOString(), synced: UNSYNCED })
  }, [])

  const dismissCelebration = useCallback(() => setQueue(q => q.slice(1)), [])

  // ── For the pages ──
  const value = useMemo(() => {
    const at = Object.fromEntries((stored ?? []).map(r => [r.key, r.earnedAt]))
    const have = new Set([...Object.keys(at), ...satisfied])
    const all = ACHIEVEMENTS.map(def => ({
      ...def, hue: toneHue(def.tone), earned: have.has(def.key), earnedAt: at[def.key] ?? null,
    }))
    const tracks = TRACKS.map(t => ({
      ...t, hue: toneHue(t.tone),
      progress: progress[t.key] ?? { value: 0 },
      view: trackView(t, progress[t.key] ?? { value: 0 }, have),
    }))
    const rows = judged
      .filter(j => j.judged && challengeDef(j.row.key))
      .map(j => ({ ...j.row, judged: /** @type {import('../lib/challenges').Judged} */ (j.judged), def: /** @type {import('../lib/challenges').ChallengeDef} */ (challengeDef(j.row.key)) }))
    const active = rows.filter(r => r.status === 'active').sort((a, b) => a.endDay.localeCompare(b.endDay))
    const finished = rows.filter(r => r.status !== 'active')
      .sort((a, b) => String(b.finishedAt ?? b.endDay).localeCompare(String(a.finishedAt ?? a.endDay)))
    const catalogue = CHALLENGES.map(def => ({
      def,
      running: active.some(r => r.key === def.key),
      availability: ctx ? def.available(ctx) : { ok: false },
      defaults: ctx ? def.defaults(ctx) : {},
    }))
    return {
      loading,
      achievements: all,
      badges: all.filter(a => a.kind === 'badge'),
      tracks,
      earnedCount: all.filter(a => a.earned).length,
      total: all.length,
      challenges: { active, finished, catalogue, won: rows.filter(r => r.status === 'won').length, max: MAX_ACTIVE },
      ctx,
      startChallenge,
      quitChallenge,
      /* One at a time: two at once would stack, and the tap meant for the
         first would dismiss the second. */
      celebrating: queue[0] ?? null,
      queued: queue.length,
      dismissCelebration,
    }
  }, [stored, satisfied, progress, judged, ctx, loading, queue, startChallenge, quitChallenge, dismissCelebration])

  return <AchievementContext.Provider value={value}>{children}</AchievementContext.Provider>
}

const EMPTY = {
  loading: true, achievements: [], badges: [], tracks: [], earnedCount: 0, total: ACHIEVEMENTS.length,
  challenges: { active: [], finished: [], catalogue: [], won: 0, max: MAX_ACTIVE },
  ctx: null,
  startChallenge: async () => { throw new Error('Achievements are not loaded.') },
  quitChallenge: async () => {},
  celebrating: null, queued: 0, dismissCelebration: () => {},
}

/**
 * Read the achievement state. A safe empty shape outside the provider: the
 * tests mount pieces on their own, and a count is never worth taking a
 * screen down for.
 *
 * @returns {any}
 */
export function useAchievements() {
  return useContext(AchievementContext) ?? EMPTY
}
