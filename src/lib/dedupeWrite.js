import db from '../db/db'
import { planDedupe } from './dedupe'
import { deleteDebtRemote, deleteRecurringRemote, deleteTemplateRemote } from './sync'

/**
 * Reading and repairing the duplicate rows.
 *
 * Split from lib/dedupe.js so the rule that decides what a duplicate IS stays
 * a pure function with tests, and only the part that touches Dexie lives
 * here. The screen and the repair call the same planner, so the count you
 * agree to and the rows that go are the same set by construction.
 */

/** What is in the database right now, and what a cleanup would remove. */
export async function surveyDuplicates() {
  const [debts, recurring, templates] = await Promise.all([
    db.debts.toArray(),
    db.recurring.toArray(),
    db.templates.toArray(),
  ])
  return planDedupe({ debts, recurring, templates })
}

/**
 * Delete the extra copies, locally and remotely.
 *
 * ── Why the remote delete is queued per row ──
 *
 * The copies this drops are ones the server may already hold - a stamped row
 * means it does. Removing them here and not there would leave the next pull
 * to bring them straight back, which is the loop that made the deleted iCloud
 * bill keep returning.
 *
 * Queued rather than sent, because queueRemoteDelete retries: a cleanup run
 * on a phone with no signal still lands the moment there is one. Both keys go
 * on the queue for debts - the stable id, and the local one for a server row
 * that predates stamping.
 *
 * ── What it does not touch ──
 *
 * The row it keeps, and anything the planner did not group. Unstamped copies
 * on the SERVER that have no local counterpart cannot be reached from here at
 * all - nothing local points at them - and are swept separately once every
 * survivor has pushed its syncId. See src/supabase/DUPLICATES.md.
 */
export async function applyDedupe() {
  const plan = await surveyDuplicates()
  if (!plan.total) return { ...plan, removed: 0 }

  let removed = 0

  for (const g of plan.debts.groups) {
    for (const row of g.drop) {
      await db.debts.delete(row.id)
      await deleteDebtRemote(null, row.id, row.syncId)
      removed++
    }
  }

  for (const g of plan.recurring.groups) {
    for (const row of g.drop) {
      await db.recurring.delete(row.id)
      await deleteRecurringRemote(row.id, row.name)
      removed++
    }
  }

  for (const g of plan.templates.groups) {
    for (const row of g.drop) {
      await db.templates.delete(row.id)
      await deleteTemplateRemote(row.id, row.name)
      removed++
    }
  }

  return { ...plan, removed }
}
