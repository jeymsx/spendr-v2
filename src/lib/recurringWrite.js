import db from '../db/db'
import { parseMoney } from '../utils/moneyInput'

/**
 * Validating and writing a bill, in one place, for two very different screens.
 *
 * The mobile app edits a bill on a full page - a big amount at the top, a
 * category rail, a frequency row you scroll - and the desktop layer edits it
 * in a sheet with a stacked column of fields. Those are two layouts of the
 * same record, and the layout is the only part that should differ. When the
 * writer lived inside the sheet, giving mobile its own page meant either
 * importing a sheet to call one function out of it, or writing the second
 * copy of "is this valid, and what row does it become" - and two copies of a
 * validator is how one screen starts accepting a bill the other rejects.
 *
 * So both screens own their fields and their chrome, and neither owns this.
 */

/**
 * What is wrong with this draft, keyed by field.
 *
 * An empty object means it is fine. The keys match the form's own field
 * names so a caller can drop the result straight into its error state.
 *
 * @param {Record<string, any>} input
 */
export function validateRecurring({ name, amountStr, category, account, nextDate }) {
  const errs = {}
  if (!name?.trim()) errs.name = 'Required'
  const amount = parseMoney(amountStr)
  if (!amountStr || amount <= 0) errs.amount = 'Enter a valid amount'
  if (!category) errs.category = 'Select a category'
  if (!account) errs.account = 'Select an account'
  if (!nextDate) errs.nextDate = 'Required'
  return errs
}

/** The row a valid draft becomes. Names, not ids - see the db schema.
 *
 * @param {Record<string, any>} input
 */
export function toRecurringRow({ name, amountStr, category, account, frequency, nextDate, active }) {
  return {
    name: name.trim(),
    amount: parseMoney(amountStr),
    category: category.name,
    account: account.name,
    frequency,
    nextDate,
    active,
  }
}

/**
 * Write it, and say which of the two things happened.
 *
 * Returns 'created' or 'updated' rather than a toast string: the page and the
 * sheet word their confirmations differently, and a writer that picks the
 * wording is a writer that has to know which screen called it.
 *
 * @param {Record<string, any>} draft
 * @param {Recurring|null} [editRec]
 */
export async function saveRecurring(draft, editRec = null) {
  const row = toRecurringRow(draft)
  if (editRec) {
    await db.recurring.update(editRec.id, row)
    return 'updated'
  }
  await db.recurring.add(row)
  return 'created'
}
