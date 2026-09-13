/**
 * One running number per person, instead of one row per event.
 *
 * ── The problem it solves ──
 *
 * Debts were per-item: every loan its own row, settled on its own. That is
 * fine for "I lent Gelo 5,000 in March" and it falls apart the moment the same
 * person recurs. A subscription shared with two friends makes twenty-four rows
 * a year, each chased separately - and worse, it only works in one order.
 *
 * Gelo pays you on the 10th for a bill that posts on the 15th, and there is
 * nothing for his money to go against. The event-shaped model has to be
 * patched for every order money can arrive in: early, late, partial, twice,
 * a round number that overshoots. That is a patch per order, and there are
 * more orders than anyone wants to enumerate.
 *
 * A running balance has none of those cases because there is always a number
 * to move:
 *
 *     Gelo pays 175 on the 10th        -175.00   he is ahead
 *     bill posts, his share is 174.75    -0.25   still 25c ahead
 *     next month's bill posts          +174.50   now he owes
 *
 * Nothing to open, nothing to settle, nothing to remember. This is what
 * Splitwise does, and it is the same trick the refunds in this app already
 * use: let the SIGN carry the meaning rather than adding a state.
 *
 * ── It changes no data ──
 *
 * The rows stay exactly as they are. A person's balance is derived, and the
 * sign convention is the one the table already has:
 *
 *     owed_to_me   they owe you       counts POSITIVE
 *     i_owe        you owe them       counts NEGATIVE
 *
 * An advance - money handed over before the thing it pays for - is therefore
 * not a new concept. It is an `i_owe` row, because until the bill lands you
 * are holding their money. No migration, no new table, no column.
 */

/** @param {number} n */
const round2 = (n) => Math.round(n * 100) / 100

/** What a row still has outstanding, always positive.
 *  @param {Record<string, any>} [debt] */
export function outstanding(debt) {
  return round2(Math.max(0, (debt?.amount ?? 0) - (debt?.amountPaid ?? 0)))
}

/** True when a row has nothing left on it.
 *  @param {Record<string, any>} [debt] */
export function isSettled(debt) {
  return outstanding(debt) <= 0.005
}

/**
 * The name a person is filed under.
 *
 * `contact` when there is one, else the debt's own name - which is what the
 * form puts there when somebody types only one field. Trimmed and compared
 * case-insensitively, so "gelo" and "Gelo" are one person rather than two
 * balances that never meet.
 *
 * @param {Record<string, any>} [debt]
 */
export function personKey(debt) {
  return String(debt?.contact ?? debt?.name ?? '').trim().toLowerCase()
}

/** The name to SHOW, which is whatever they last typed.
 *  @param {Record<string, any>} [debt] */
export function personLabel(debt) {
  return String(debt?.contact ?? debt?.name ?? '').trim()
}

/**
 * Everyone, with what they come to.
 *
 * `net` is positive when they owe you and negative when you owe them, which
 * is the whole point: one number, and no branch on which direction it went.
 *
 * Rows are kept on each person so a detail view can show the history without
 * grouping them a second time.
 *
 * @param {Array<Record<string, any>>} debts
 */
export function byPerson(debts) {
  /** @type {Map<string, any>} */
  const map = new Map()

  for (const d of debts ?? []) {
    const key = personKey(d)
    if (!key) continue
    const left = outstanding(d)
    const signed = d.type === 'i_owe' ? -left : left

    const at = map.get(key) ?? {
      key, label: personLabel(d), net: 0, rows: [], open: 0, settled: 0,
    }
    at.net = round2(at.net + signed)
    at.rows.push(d)
    if (left > 0.005) at.open += 1
    else at.settled += 1
    /* The most recent spelling wins, so renaming somebody once renames them
       everywhere rather than leaving the oldest row's version in the header. */
    if ((d.updatedAt ?? '') >= (at.updatedAt ?? '')) {
      at.label = personLabel(d)
      at.updatedAt = d.updatedAt
    }
    map.set(key, at)
  }

  return [...map.values()].sort((a, b) => {
    /* Anyone with something outstanding first, biggest first, then the people
       who are square - a list where a settled friend outranks an unpaid one
       is a list you have to read rather than scan. */
    const aLive = Math.abs(a.net) > 0.005
    const bLive = Math.abs(b.net) > 0.005
    if (aLive !== bLive) return aLive ? -1 : 1
    if (aLive) return Math.abs(b.net) - Math.abs(a.net)
    return a.label.localeCompare(b.label)
  })
}

/** What everyone comes to, for the two figures at the top of the page.
 *  @param {Array<Record<string, any>>} [people] */
export function totals(people) {
  let owedToYou = 0
  let youOwe = 0
  for (const p of people ?? []) {
    if (p.net > 0) owedToYou = round2(owedToYou + p.net)
    else youOwe = round2(youOwe - p.net)
  }
  return { owedToYou, youOwe, net: round2(owedToYou - youOwe) }
}

/**
 * How a payment from one person lands across their open rows.
 *
 * Oldest first, because that is what everybody means by paying somebody back
 * and because it settles rows rather than leaving a trail of part-paid ones.
 *
 * Anything left over after every row is covered comes back as `credit` - they
 * have paid more than they owed, which is not an error and is exactly what an
 * early payment looks like. The caller turns that into an `i_owe` row, and
 * the next bill nets against it.
 *
 * @param {Array<Record<string, any>>} rows  one person's debts
 * @param {number} amount
 * @param {'owed_to_me'|'i_owe'} direction  which way the money is going
 */
export function applyPayment(rows, amount, direction = 'owed_to_me') {
  let left = round2(amount)
  /** @type {Array<{id: number, amountPaid: number}>} */
  const updates = []

  const open = (rows ?? [])
    .filter(d => d.type === direction && !isSettled(d))
    .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))

  for (const d of open) {
    if (left <= 0.005) break
    const due = outstanding(d)
    const pay = Math.min(due, left)
    updates.push({ id: d.id, amountPaid: round2((d.amountPaid ?? 0) + pay) })
    left = round2(left - pay)
  }

  return { updates, credit: round2(Math.max(0, left)) }
}
