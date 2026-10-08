import db from '../db/db'
import { parseMoney } from '../utils/moneyInput'
import { snapToCutoff, dueDayOf, stepsByMonth } from '../utils/recurring'

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

/**
 * The day of the month a bill is really due on: the `dueDay` a row keeps so a
 * bill due on the 31st does not settle on the 28th after its first February
 * (utils/recurring.js, advanceNextDate). Null for a frequency that does not
 * step by months - a weekly bill has no day of the month to protect.
 *
 * Set from the date when a bill is made or its date is changed. Saving a bill
 * WITHOUT changing the date keeps the day already on it: the date a Jan 31
 * bill shows in February is the 28th, and reading the day off that would
 * overwrite the 31st with the thing it exists to remember.
 *
 * @param {string} frequency
 * @param {string} nextDate  YYYY-MM-DD
 * @param {Record<string, any>|null} [prev]  the row as it was, when editing
 * @returns {number|null}
 */
export function resolveDueDay(frequency, nextDate, prev = null) {
  if (!stepsByMonth(frequency)) return null
  const unchanged = !!prev && String(prev.nextDate ?? '').slice(0, 10) === String(nextDate ?? '').slice(0, 10)
  return dueDayOf(nextDate, unchanged ? prev?.dueDay : null)
}

/** The row a valid draft becomes. Names, not ids - see the db schema.
 *
 * @param {Record<string, any>} input
 * @param {Record<string, any>|null} [prev]  the row as it was, when editing
 */
export function toRecurringRow({ name, amountStr, category, account, frequency, nextDate, active, split, type }, prev = null) {
  const income = type === 'inflow'
  // Twice a month lands on the cut-offs, whatever day was picked.
  const date = frequency === 'semimonthly' ? snapToCutoff(nextDate) : nextDate
  return {
    name: name.trim(),
    amount: parseMoney(amountStr),
    category: category.name,
    account: account.name,
    frequency,
    nextDate: date,
    /* The intended day of the month, which advanceNextDate clamps from each
       time. Only the Dexie field: sync.js carries it to the cloud. */
    dueDay: resolveDueDay(frequency, date, prev),
    active,
    /* A standing division, stored as TYPED rather than resolved, so it
       re-divides whatever the bill charges this month. null rather than an
       empty object for a bill nobody shares - the write path checks
       `people.length` and an empty shape would be a lie about intent. Income
       is never divided. */
    split: !income && split?.people?.length ? split : null,
    /* 'inflow' for income that arrives on a schedule, 'expense' for a bill.
       Left out when the caller does not say - the desktop sheet predates
       income - so editing a salary there cannot turn it into a bill. */
    ...(type ? { type: income ? 'inflow' : 'expense' } : {}),
  }
}

/** Income that arrives on a schedule, rather than a bill. @param {Record<string, any>|null|undefined} rec */
export const isIncomeRecurring = (rec) => rec?.type === 'inflow'

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
  const row = toRecurringRow(draft, editRec)
  if (editRec) {
    await db.recurring.update(editRec.id, row)
    return 'updated'
  }
  await db.recurring.add(row)
  return 'created'
}
