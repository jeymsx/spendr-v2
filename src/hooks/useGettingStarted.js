import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from './useLiveQuery'
import { isIncome, isSpend } from '../lib/flows'
import { GETTING_STARTED_KEY, progressOf, stepsFrom } from '../lib/gettingStarted'

/**
 * What the ledger shows, for the Getting started list (lib/gettingStarted.js).
 *
 * Six questions, each answered by the first row that fits rather than by
 * reading a table: six booleans do not need the whole ledger read, and the
 * notifications open quickly because nothing there reads it.
 *
 * @returns {Promise<import('../lib/gettingStarted').Facts>}
 */
export async function readFacts() {
  const [accounts, spent, earned, moved, budgeted, bills] = await Promise.all([
    db.accounts.count(),
    db.transactions.where('type').equals('expense').filter(isSpend).first(),
    db.transactions.where('type').equals('inflow').filter(isIncome).first(),
    db.transactions.where('type').equals('transfer').first(),
    db.categories.where('budget').above(0).filter(c => c.type !== 'inflow' && c.type !== 'transfer').first(),
    db.recurring.filter(r => r.type !== 'inflow').first(),
  ])
  return { accounts, spent: !!spent, earned: !!earned, moved: !!moved, budgeted: !!budgeted, bills: !!bills }
}

/** @param {Partial<import('../lib/gettingStarted').GettingStartedState>} patch */
async function patchState(patch) {
  const prev = (await db.meta.get(GETTING_STARTED_KEY))?.value ?? {}
  const now = new Date().toISOString()
  await db.meta.put({ key: GETTING_STARTED_KEY, value: { since: prev.since ?? now, ...prev, ...patch, updatedAt: now } })
}

/** Start the list on this device: the last step of setup calls this (pages/Onboarding.jsx). */
export const startGettingStarted = () => patchState({ since: new Date().toISOString(), hidden: false })

/** Bring it back - from the help centre, or for someone who never had one. */
export const showGettingStarted = () => patchState({ hidden: false })

/** Off Home and out of the notifications, until it is brought back. */
export const hideGettingStarted = () => patchState({ hidden: true })

/**
 * The Getting started list, as it stands.
 *
 * `ready` is false until both where the list stands and what the ledger shows
 * are known, so a page that waits for it never draws the list and then moves
 * everything under it, or draws "0 of 6" for a frame before the real count.
 */
export default function useGettingStarted() {
  const state = useLiveQuery(async () => (await db.meta.get(GETTING_STARTED_KEY))?.value ?? null, [], undefined)
  const on = !!state?.since && !state.hidden
  // Nothing is asked of the ledger for a list that is not there.
  const facts = useLiveQuery(() => (on ? readFacts() : Promise.resolve(null)), [on], undefined)
  const steps = on && facts ? stepsFrom(facts) : null
  return {
    ready: state !== undefined && (!on || !!facts),
    ...progressOf(state, steps),
    steps: steps ?? [],
    hide: hideGettingStarted,
  }
}

/**
 * `?checklist=show` on the Notifications page: bring the list back, and take
 * the word off the address so a reload does not do it again. The help
 * centre's "Show the Getting started list" links here, on the phone and on a
 * computer alike.
 */
export function useShowChecklistParam() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const q = new URLSearchParams(search)
    if (q.get('checklist') !== 'show') return
    showGettingStarted()
    q.delete('checklist')
    const rest = q.toString()
    navigate({ pathname, search: rest ? `?${rest}` : '' }, { replace: true })
  }, [pathname, search, navigate])
}
