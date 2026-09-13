/**
 * One query, everything in the app.
 *
 * ── Why it lives in the Transactions page ──
 *
 * The search field was already there and already the place people go to look
 * for something. Adding a second one in the header would put two search boxes
 * in an app with five tabs, and a dedicated Search tab would spend a fifth of
 * the navigation on a thing you use for four seconds.
 *
 * So the field stays where it is and the SCOPE widens. Transactions still
 * answer below it as they always have; everything else answers in a short
 * block above, grouped and capped, because a query that matches one account
 * should not push forty transactions off the screen.
 *
 * ── Ranking, and why it is not a fuzzy match ──
 *
 * Three tiers, and they are about intent rather than string distance:
 *
 *   exact    you typed the whole name  -> you know what you want
 *   prefix   you typed the start of it -> you are part-way through typing it
 *   contains you typed a fragment      -> you are hunting
 *
 * A fuzzy matcher would put "Groceries" above "GCash" for the query "gc",
 * because it scores subsequences, and that is exactly wrong: nobody typing
 * "gc" means Groceries. Prefix-beats-contains is the rule that matches how
 * people actually type a name they already know.
 *
 * Amounts are searchable too, which sounds like a gimmick until you have
 * tried to find "that 1,850 thing from last month". `1850` and `1,850` both
 * find it; the separators are stripped from both sides.
 */

/** @param {string} [s] */
const norm = (s) => String(s ?? '').trim().toLowerCase()

/**
 * 3 for an exact hit, 2 for a prefix, 1 for a fragment, 0 for no match.
 *
 * @param {string|null|undefined} haystack
 * @param {string} q  already normalised
 */
export function scoreText(haystack, q) {
  const h = norm(haystack)
  if (!h || !q) return 0
  if (h === q) return 3
  if (h.startsWith(q)) return 2
  return h.includes(q) ? 1 : 0
}

/**
 * The best score across several fields, so a hit on a name outranks a hit on
 * a note without either having to be checked in a particular order.
 *
 * @param {Array<string|null|undefined>} fields
 * @param {string} q
 */
export function scoreAny(fields, q) {
  let best = 0
  for (const f of fields) {
    const s = scoreText(f, q)
    if (s > best) best = s
    if (best === 3) break
  }
  return best
}

/**
 * True when the query looks like a figure, and the row is that figure.
 *
 * Separators come off both sides: "1,850" typed against 1850 stored, and
 * "1850" typed against a row the user thinks of as "1,850". A partial number
 * matches as a prefix, so "18" finds 1,850 and 18.50 both - which is what
 * someone half-way through typing wants.
 *
 * @param {number|null|undefined} amount
 * @param {string} q
 */
export function scoreAmount(amount, q) {
  const digits = q.replace(/[,\s₱]/g, '')
  if (!digits || !/^[0-9]*\.?[0-9]*$/.test(digits)) return 0
  const abs = Math.abs(amount ?? 0)
  const asText = String(abs)
  const whole = String(Math.round(abs))
  if (asText === digits || whole === digits) return 3
  return asText.startsWith(digits) || whole.startsWith(digits) ? 1 : 0
}

/**
 * Everything that is not a transaction, ranked and capped.
 *
 * Transactions are deliberately NOT in here: the page already lists them
 * below, filtered by the same query plus whatever else the filter sheet is
 * asking for, and duplicating a few of them above would be confusing rather
 * than helpful.
 *
 * @param {string} rawQuery
 * @param {{accounts?: any[], categories?: any[], recurring?: any[],
 *          goals?: any[], debts?: any[]}} data
 * @param {number} [limit] per group
 */
export function searchEverything(rawQuery, data = {}, limit = 3) {
  const q = norm(rawQuery)
  /** @type {Array<{group: string, items: any[]}>} */
  const groups = []
  // Two characters, because one letter matches most of the app and the
  // results would flicker through nonsense on the way to a real query.
  if (q.length < 2) return groups

  /** @param {string} group @param {any[]} rows @param {(r: any) => number} score
   *  @param {(r: any) => Record<string, any>} shape */
  const add = (group, rows, score, shape) => {
    const hits = (rows ?? [])
      .map(r => ({ r, s: score(r) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map(x => shape(x.r))
    if (hits.length) groups.push({ group, items: hits })
  }

  add('Accounts', data.accounts,
    a => scoreAny([a.name, a.type, a.parentName], q),
    a => ({ id: a.id, label: a.name, meta: a.type, to: `/accounts/${a.id}` }))

  add('Categories', data.categories,
    c => scoreText(c.name, q),
    c => ({ id: c.id, label: c.name, meta: c.type,
            to: `/categories/${encodeURIComponent(c.name)}` }))

  add('Bills', data.recurring,
    r => Math.max(scoreAny([r.name, r.category, r.account], q), scoreAmount(r.amount, q)),
    r => ({ id: r.id, label: r.name, meta: r.category, to: `/recurring/${r.id}` }))

  add('Goals', data.goals,
    g => scoreText(g.name, q),
    g => ({ id: g.id, label: g.name, meta: g.archivedAt ? 'Archived' : null,
            to: `/goals/${g.id}` }))

  add('Debts', data.debts,
    d => Math.max(scoreAny([d.name, d.contact, d.notes], q), scoreAmount(d.amount, q)),
    d => ({ id: d.id, label: d.name,
            meta: d.type === 'owed_to_me' ? 'Owed to you' : 'You owe',
            to: '/debts' }))

  return groups
}

/**
 * Does this transaction answer the query?
 *
 * Wider than the description-and-category test it replaces: an account name
 * and the amount are both things people search by, and neither used to work.
 * Returns a boolean rather than a score because the list below is ordered by
 * date, and re-ranking a ledger by relevance would scramble the one ordering
 * a ledger has to have.
 *
 * @param {Record<string, any>} tx
 * @param {string} q  already normalised
 */
export function txMatches(tx, q) {
  if (!q) return true
  return scoreAny([
    tx.description, tx.category, tx.account, tx.fromAccount, tx.toAccount,
  ], q) > 0 || scoreAmount(tx.amount, q) > 0
}
