/**
 * A realistic ledger, for testing what the parser LEARNS.
 *
 * Test-only. Nothing in the app imports this, so it never reaches a bundle.
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 *
 * The parser's first 38 tests all built their input by hand: two or three rows
 * asserting one property each. Every one of them passed while the learner was
 * producing "with" -> Food from "Lunch with team" and firing it on "800 with
 * mom". They were testing the ALGORITHM - does a clear favourite win, is an
 * ambiguous word refused - and the algorithm was correct. The answers were
 * wrong.
 *
 * What no hand-built array can show is what happens when a description is
 * mostly connective tissue, which is what real descriptions are. So this is
 * 150-odd rows spread over nine months, deliberately carrying every shape that
 * has caused a bug or that the learner claims to handle:
 *
 *   - merchants used often, always from the same account   (account learning)
 *   - a merchant whose category CHANGED months ago         (recency decay)
 *   - a merchant filed two ways in equal measure           (must refuse)
 *   - descriptions that are mostly stopwords               (must not learn them)
 *   - words that appear exactly once                       (evidence bar)
 *   - a two-word merchant                                  (phrase index)
 *   - one merchant with tight, consistent amounts          (outlier detection)
 *   - a row the app wrote rather than the user             (Balance adjustment)
 *
 * Deterministic on purpose: no Math.random, no new Date(). Dates are computed
 * back from FIXTURE_NOW, so the recency tests assert a fixed answer.
 */

/** The "today" every fixture date is measured back from. */
export const FIXTURE_NOW = '2026-09-11T10:00:00'

const NOW_MS = Date.parse(FIXTURE_NOW)

/** An ISO date `n` days before FIXTURE_NOW. */
/** @param {number} n */
function daysAgo(n) {
  return new Date(NOW_MS - n * 86_400_000).toISOString().slice(0, 10)
}

/** @type {Transaction[]} */
const rows = []
let seq = 0
/**
 * @param {number} daysBack @param {string} description
 * @param {string|null} category @param {string|null} account
 * @param {number} amount @param {string} [type]
 */
function add(daysBack, description, category, account, amount, type = 'expense') {
  rows.push({
    id: ++seq,
    txId: `fx-${seq}`,
    type,
    description,
    category,
    account,
    amount,
    date: daysAgo(daysBack),
  })
}

// ── Grab: frequent, one account, tight amounts ───────────────────────────────
// The canonical good case. 12 rows, always Transpo, always GCash, always
// 140-190, so "180 grab" should fill in both fields and "9000 grab" should be
// questioned.
for (let i = 0; i < 12; i++) {
  add(3 + i * 7, 'Grab', 'Transpo', 'GCash', 140 + (i % 6) * 10)
}

// ── Jollibee: frequent, a different account ──────────────────────────────────
// Proves the account index is per-merchant rather than per-user: this user
// pays Grab with GCash and Jollibee with Cash.
for (let i = 0; i < 9; i++) {
  add(5 + i * 9, 'Jollibee', 'Food', 'Cash', 200 + (i % 4) * 60)
}

// ── SM Supermarket: a two-word merchant ──────────────────────────────────────
// Learned as the phrase "sm supermarket". Neither word can carry it alone:
// "sm" is two characters and "supermarket" appears only inside this phrase.
for (let i = 0; i < 6; i++) {
  add(9 + i * 21, 'SM Supermarket', 'Groceries', 'BPI', 1800 + i * 120)
}

// ── Load: the category moved ─────────────────────────────────────────────────
// Filed under Bills all through last year, then under Transpo since it started
// being Grab credit. RAW counts favour Bills 8 to 3; recency should not.
for (let i = 0; i < 8; i++) add(200 + i * 12, 'Load', 'Bills', 'GCash', 100)
for (let i = 0; i < 3; i++) add(4 + i * 6, 'Load', 'Transpo', 'GCash', 100)

// ── Milk tea: genuinely ambiguous ────────────────────────────────────────────
// Half Food, half Others, same period. There is no right answer and the
// learner must say so rather than pick.
for (let i = 0; i < 4; i++) add(12 + i * 15, 'Milk tea', 'Food', 'GCash', 160)
for (let i = 0; i < 4; i++) add(14 + i * 15, 'Milk tea', 'Others', 'GCash', 160)

// ── Descriptions that are mostly stopwords ───────────────────────────────────
// "with" appears in six rows, all Food. Under the old learner that made it a
// rule. It must not be one: it says nothing about what was bought.
add(6, 'Lunch with team', 'Food', 'GCash', 760)
add(20, 'Dinner with mom', 'Food', 'Cash', 900)
add(34, 'Coffee with Ana', 'Food', 'GCash', 320)
add(48, 'Merienda with the team', 'Food', 'Cash', 240)
add(62, 'Breakfast with dad', 'Food', 'Cash', 280)
add(76, 'Snacks for the office', 'Food', 'GCash', 450)

// ── Words that appear exactly once ───────────────────────────────────────────
// Each of these is a real transaction and a bad rule. "run" from "Grocery run"
// firing on "fun run registration" is the measured failure this guards.
add(11, 'Grocery run', 'Groceries', 'BPI', 2850)
add(25, 'Haircut', 'Others', 'Cash', 350)
add(39, 'Gift', 'Others', 'BPI', 880)
add(53, 'Team building', 'Others', 'BPI', 1500)
add(67, 'Registration', 'Others', 'GCash', 600)

// ── Shopee: two words, both meaningful, consistent account ───────────────────
for (let i = 0; i < 5; i++) add(8 + i * 24, 'Shopee order', 'Shopping', 'Maya', 900 + i * 200)

// ── Inflow, under a word no hardcoded list contains ──────────────────────────
// "Payroll" is not in INFLOW_WORDS and never will be, because the list cannot
// know what any given person calls their pay. Nine rows of it should be
// enough for the parser to stop booking it as money going out.
for (let i = 0; i < 9; i++) add(2 + i * 30, 'Payroll', 'Salary', 'BPI', 40000, 'inflow')

// ── An inflow word that is, for this user, an expense ────────────────────────
// "interest" IS in INFLOW_WORDS - it is in there for a savings account. This
// user only ever pays it, on a credit card. The ledger has to win, or the
// direction is wrong every single time in the one place it matters most.
for (let i = 0; i < 5; i++) add(15 + i * 30, 'Interest', 'Bills', 'Maya Black', 340)

// ── A merchant paid from whichever account had money ─────────────────────────
// Six rows, three Cash and three GCash. The category is obvious; the account
// is a fact about that week's cash position, not about Alfamart. It must be
// refused - this is the shape that made account inference wrong more often
// than right on the real ledger.
for (let i = 0; i < 3; i++) add(7 + i * 26, 'Alfamart', 'Food', 'Cash', 120)
for (let i = 0; i < 3; i++) add(19 + i * 26, 'Alfamart', 'Food', 'GCash', 120)

// ── Consistent, but not yet often enough ─────────────────────────────────────
// Two rows, both Maya. Consistent is not the same as established: below
// ACCOUNT_MIN_ROWS the account is withheld even though it has never varied.
for (let i = 0; i < 2; i++) add(13 + i * 40, 'Bookstore', 'Shopping', 'Maya', 340)

// ── A row the app wrote, not the user ────────────────────────────────────────
// Accounts.jsx writes this when you reconcile a balance. It is not a merchant
// and "balance" must not become a rule off the back of it.
add(30, 'Balance adjustment', 'Others', 'Cash', 500)

// ── Rows the learner must survive rather than learn from ─────────────────────
rows.push({ id: ++seq, txId: `fx-${seq}`, type: 'expense', description: '', category: 'Food', account: 'Cash', amount: 100, date: daysAgo(10) })
rows.push({ id: ++seq, txId: `fx-${seq}`, type: 'expense', description: 'No category', category: null, account: 'Cash', amount: 100, date: daysAgo(10) })
rows.push({ id: ++seq, txId: `fx-${seq}`, type: 'expense', description: 'No date', category: 'Food', account: 'Cash', amount: 100, date: null })
rows.push({ id: ++seq, txId: `fx-${seq}`, type: 'expense', description: 'Bad date', category: 'Food', account: 'Cash', amount: 100, date: 'not-a-date' })

export const LEDGER = rows

/** The accounts and categories this ledger refers to. */
export const ACCOUNTS = ['Cash', 'GCash', 'BPI', 'Maya', 'Maya Savings', 'Maya Black']
  .map(name => ({ name }))

export const CATEGORIES = ['Food', 'Groceries', 'Transpo', 'Bills', 'Shopping', 'Salary', 'Others']
  .map(name => ({ name }))

/** Two live bills and one paused one, for the "you already have this" path. */
export const RECURRING = [
  { id: 1, name: 'Netflix', amount: 549, category: 'Bills', account: 'GCash', nextDate: '2026-09-28', active: true },
  { id: 2, name: 'Spotify', amount: 194, category: 'Bills', account: 'GCash', nextDate: '2026-09-19', active: true },
  { id: 3, name: 'Gym', amount: 1500, category: 'Others', account: 'BPI', nextDate: '2026-09-22', active: false },
]

export const TEMPLATES = [
  { id: 1, name: 'Rent', type: 'expense', amount: 12000, category: 'Bills', account: 'BPI', description: 'Rent' },
]

/** How many rows in the ledger name `description`, for count-based assertions. */
/** @param {string} description @param {string|null} [category] */
export function countOf(description, category = null) {
  return LEDGER.filter(r =>
    r.description === description && (category == null || r.category === category),
  ).length
}
