/**
 * Getting started: the first things that make Spendr useful, as a list that
 * ticks itself off.
 *
 * Shown to someone who has just set Spendr up, pinned at the top of their
 * notifications (components/gettingStarted/GettingStartedPin; on a computer
 * a panel on the Notifications page and a row in the bell) until every step
 * is done or they hide it. Only there: Home is for their money.
 *
 * ── Ticked by what is there, not by what was pressed ──
 *
 * A step is done when the ledger shows it: an account besides Cash, a
 * transaction of each kind, a category with a limit, a bill. Nothing records
 * that a button was pressed, so a step done another way - on another device,
 * from an import, before the list was ever shown - is done here too, and the
 * list can never disagree with what the person can see.
 *
 * What does not count, and why:
 *
 *   Cash                  every ledger starts with it; "your accounts" means
 *                         the ones you added
 *   a balance correction  setup writes one for a card that is owed on, and
 *                         a value update is the same kind of row: neither is
 *                         money you spent or earned (lib/flows.js)
 *   an income bill        a recurring row of type 'inflow' is payday, not a
 *                         bill (the same test Home and the notifications use)
 *
 * ── Whose list it is ──
 *
 * Only a device that went through setup gets one: `meta.gettingStarted` is
 * written by the last step of onboarding, and not by signing in to an account
 * that already has data or by restoring a backup - those people are past the
 * first week. It is this device's, not synced: hiding it on the phone leaves
 * it on a laptop that was set up on its own. Anyone can bring it back from the
 * help centre (`/notifications?checklist=show`).
 */

export const GETTING_STARTED_KEY = 'gettingStarted'

/**
 * @typedef {'account'|'expense'|'income'|'transfer'|'budget'|'bill'} StepId
 * @typedef {{id: StepId, title: string, hint: string, to: string, help: string, glyph: string}} StepSpec
 * @typedef {StepSpec & {done: boolean, blocked: string|null}} Step
 * @typedef {{accounts: number, spent: boolean, earned: boolean, moved: boolean, budgeted: boolean, bills: boolean}} Facts
 * @typedef {{since: string, hidden?: boolean, updatedAt?: string}} GettingStartedState
 */

/** @type {StepSpec[]} */
export const STEPS = [
  { id: 'account',  title: 'Add your accounts',          hint: 'Your bank, e-wallet or card, beside Cash.', to: '/accounts/new',      help: 'add-account',    glyph: 'wallet' },
  { id: 'expense',  title: 'Log an expense',             hint: 'Something you paid for today.',             to: '/expense',           help: 'add-expense',    glyph: 'expense' },
  { id: 'income',   title: 'Log income',                 hint: 'Your pay, or any money that came in.',      to: '/inflow',            help: 'add-income',     glyph: 'income' },
  { id: 'transfer', title: 'Move money between accounts', hint: 'Like cashing out from GCash to your bank.', to: '/transfer',          help: 'transfer-money', glyph: 'transfer' },
  { id: 'budget',   title: 'Set a budget',               hint: 'A monthly limit for a category.',           to: '/settings/budgets',  help: 'set-budget',     glyph: 'budget' },
  { id: 'bill',     title: 'Add a recurring bill',       hint: 'Rent, a subscription, anything that repeats.', to: '/recurring/new',   help: 'add-bill',       glyph: 'bill' },
]

/**
 * Each step, done or not, from what the ledger holds.
 *
 * A transfer needs two accounts to move between. With only Cash it is not
 * done and cannot be yet, so it says what comes first and goes there.
 *
 * @param {Facts} facts
 * @returns {Step[]}
 */
export function stepsFrom(facts) {
  const done = {
    account: facts.accounts > 1,
    expense: facts.spent,
    income: facts.earned,
    transfer: facts.moved,
    budget: facts.budgeted,
    bill: facts.bills,
  }
  return STEPS.map(s => {
    const blocked = s.id === 'transfer' && !done.transfer && facts.accounts < 2
      ? 'Add a second account first.'
      : null
    return { ...s, done: done[s.id], blocked, to: blocked ? '/accounts/new' : s.to }
  })
}

/**
 * Where the list stands.
 *
 * @param {GettingStartedState|null|undefined} state
 * @param {Step[]|null} steps
 */
export function progressOf(state, steps) {
  const list = steps ?? []
  const doneCount = list.filter(s => s.done).length
  const total = STEPS.length
  return {
    /** This device has a list, and it has not been hidden. */
    on: !!state?.since && !state.hidden,
    doneCount,
    total,
    complete: list.length === total && doneCount === total,
    /** The first step not done yet: what the list offers next. */
    next: list.find(s => !s.done) ?? null,
  }
}
