/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 */
function clampDay(year, month, day) {
  return Math.min(day, new Date(year, month + 1, 0).getDate())
}

/** How many days are in a month. Handles month < 0 and > 11 by rolling.
 *
 * @param {number} year
 * @param {number} month
 */
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

// End-of-day helper so any transaction time on that date is included
/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 */
function eod(year, month, day) {
  return new Date(year, month, day, 23, 59, 59, 999)
}

/**
 * Returns { cycleStart, cycleEnd } for the most recently closed billing cycle.
 * cutoffDay = the first day of a new billing cycle (e.g. 15 → billing runs 15th–14th).
 *
 * cutoff=15, today=May 21  → Apr 15 00:00 – May 14 23:59  (open: May 15–Jun 14)
 * cutoff=15, today=May 10  → Mar 15 00:00 – Apr 14 23:59  (open: Apr 15–May 14)
 *
 * @param {number} cutoffDay
 * @param {Date} [referenceDate]
 */
export function getCycleRange(cutoffDay, referenceDate = new Date()) {
  const d = cutoffDay ? Math.max(1, Math.min(31, cutoffDay)) : null
  if (!d) {
    /* No cutoff day on the account, so bill by calendar month.

       This returned the CURRENT month, which is not a closed cycle - it is
       the one still running. Everything downstream treats charges before
       cycleStart as already settled, so a card with no cutoff date dropped
       every charge older than the 1st of this month out of its balance, and
       reported that much more available credit than it had. Last month is
       the most recent one that has actually closed. */
    const y = referenceDate.getFullYear(), m = referenceDate.getMonth()
    return { cycleStart: new Date(y, m - 1, 1), cycleEnd: eod(y, m - 1, daysInMonth(y, m - 1)) }
  }

  const y  = referenceDate.getFullYear()
  const m  = referenceDate.getMonth()
  const cd = clampDay(y, m, d)
  const billingStartThisMonth = new Date(y, m, cd)

  if (referenceDate >= billingStartThisMonth) {
    // We're in the billing cycle that started this month on cutoffDay
    // Closed billing: prev month's cutoffDay → this month's (cutoffDay - 1) end-of-day
    const pm = m === 0 ? 11 : m - 1
    const py = m === 0 ? y - 1 : y
    return {
      cycleStart: new Date(py, pm, clampDay(py, pm, d)),
      cycleEnd:   eod(y, m, cd - 1),
    }
  } else {
    // Still before the cutoff — in the billing that started last month
    // Closed billing: 2 months ago's cutoffDay → last month's (cutoffDay - 1) end-of-day
    const pm  = m === 0 ? 11 : m - 1
    const py  = m === 0 ? y - 1 : y
    const p2m = pm === 0 ? 11 : pm - 1
    const p2y = pm === 0 ? py - 1 : py
    return {
      cycleStart: new Date(p2y, p2m, clampDay(p2y, p2m, d)),
      cycleEnd:   eod(py, pm, clampDay(py, pm, d) - 1),
    }
  }
}

/**
 * Returns { cycleStart, cycleEnd } for the currently-accumulating (open) cycle.
 * Starts on cutoffDay of this (or next) month, ends on (cutoffDay - 1) end-of-day of the following month.
 *
 * @param {number} cutoffDay
 * @param {Date} [referenceDate]
 */
export function getNextCycleRange(cutoffDay, referenceDate = new Date()) {
  const d = cutoffDay ? Math.max(1, Math.min(31, cutoffDay)) : null
  if (!d) {
    /* The month now accumulating, to match the closed cycle above.

       This was two bugs in one line. It started the open cycle NEXT month,
       leaving this month in no cycle at all, and it ended it with
       `new Date(y, m + 2, 0).getDate()` - the last day of month m+1 - handed
       back as a day number in month m+2, which overflows. The window it
       produced ran 56 to 62 days in every month of the year, so "next
       statement" quietly covered two bills' worth of charges. */
    const y = referenceDate.getFullYear(), m = referenceDate.getMonth()
    return { cycleStart: new Date(y, m, 1), cycleEnd: eod(y, m, daysInMonth(y, m)) }
  }

  const { cycleEnd } = getCycleRange(cutoffDay, referenceDate)
  const nextStart = new Date(cycleEnd.getFullYear(), cycleEnd.getMonth(), cycleEnd.getDate() + 1)
  const sm = nextStart.getMonth(), sy = nextStart.getFullYear()
  const em = sm === 11 ? 0 : sm + 1
  const ey = sm === 11 ? sy + 1 : sy
  return {
    cycleStart: nextStart,
    cycleEnd:   eod(ey, em, clampDay(ey, em, d) - 1),
  }
}

/**
 * Single source of truth for a credit account's standing.
 *
 * Three windows matter:
 *   thisTotal          — charges inside the statement cycle that most recently
 *                        closed; this is what's actually due.
 *   nextStatementTotal — charges that fall inside the cycle now accumulating,
 *                        i.e. what the NEXT bill will actually ask for.
 *   laterTotal         — charges dated beyond that cycle. An installment plan
 *                        writes every month's charge up front, so these are
 *                        committed but will not appear on the next bill.
 *
 * `nextTotal` is the sum of the last two and is deliberately unbounded: the
 * issuer locks the whole plan against the limit at purchase, so every future
 * amortisation has to reduce available credit today even though it will not be
 * billed for months. currentBalance and availableCredit are built from it.
 *
 * That total is therefore right for "how much credit is left" and wrong for
 * anything labelled "next statement" — a six-month plan made the next bill
 * look like the entire remaining plan. Display code wants nextStatementTotal;
 * only the limit math wants nextTotal.
 *
 * Payments only count after `cycleEnd`. A payment made before the cutoff was
 * settling the *previous* statement — crediting it against this one would
 * double-count it and make the card look paid when it isn't.
 *
 * @param {object} account       A credit account row.
 * @param {object[]} txs         Any transaction list; filtered by account here.
 * @param {Date} [referenceDate] "Now", for testing or historical views.
 */
/**
 * The next time a day-of-month comes around, as a Date.
 *
 * Lives here rather than in pages/Accounts.jsx because the Dashboard needs it
 * too, and Dashboard is the one eagerly-loaded route: importing it from
 * Accounts.jsx would drag that whole module - dnd-kit, react-image-crop and
 * the account form - into the initial bundle, which is precisely what App.jsx
 * lazy-loads Accounts to avoid.
 *
 * Today counts as passed, so a due date of "the 10th" on the 10th returns next
 * month. That is deliberate for a bill you have presumably already paid, and
 * it matches what the account cards have always shown.
 *
 * @param {number} dayOfMonth
 * @param {Date} [now]
 */
export function nextDueDate(dayOfMonth, now = new Date()) {
  if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31) return null
  let d = new Date(now.getFullYear(), now.getMonth(), dayOfMonth)
  if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth)
  return d
}

/**
 * @param {Account} account
 * @param {Array<Partial<Transaction>>} txs
 * @param {Date} [referenceDate]
 */
export function getCreditStatus(account, txs, referenceDate = new Date()) {
  const { cycleStart, cycleEnd } = getCycleRange(account?.cutoffDate, referenceDate)
  // The cycle now accumulating. Its end is the boundary between "on the next
  // bill" and "committed, but for a later bill".
  const { cycleEnd: nextCycleEnd } = getNextCycleRange(account?.cutoffDate, referenceDate)
  const name = account?.name

  const thisCharges          = []
  const nextCharges          = []
  const nextStatementCharges = []
  const laterCharges         = []
  const payments             = []
  /* Everything billed on a statement before this one, and everything paid
     before this cycle opened. Both used to be discarded. */
  const priorCharges         = []
  const priorPayments        = []

  // Single pass. The previous copies of this ran three or four .filter()
  // sweeps over every transaction, per card, on every render.
  for (const tx of txs ?? []) {
    const isCharge  = tx.type === 'expense' && tx.account === name
    const isPayment = (tx.type === 'inflow'   && tx.account   === name)
                   || (tx.type === 'transfer' && tx.toAccount === name)
    if (!isCharge && !isPayment) continue

    // tx.date is a UTC ISO string. new Date() restores the exact instant, which
    // is what the local-time cycle boundaries need to compare against; slicing
    // the string to YYYY-MM-DD instead would shift any PH-morning transaction
    // back a day.
    const d = new Date(tx.date)

    if (isCharge) {
      if (d >= cycleStart && d <= cycleEnd) thisCharges.push(tx)
      else if (d > cycleEnd) {
        nextCharges.push(tx)
        // Same charge, split by which bill it will land on.
        if (d <= nextCycleEnd) nextStatementCharges.push(tx)
        else                   laterCharges.push(tx)
      } else {
        // Billed on an EARLIER statement. It used to be dropped here, on the
        // assumption that an older statement had been settled - see the note
        // over billedTotal below for what that cost.
        priorCharges.push(tx)
      }
    } else if (d > cycleEnd) {
      payments.push(tx)
    } else {
      priorPayments.push(tx)
    }
  }

  /** @param {Array<Partial<Transaction>>} arr */
  const sum                = (arr) => arr.reduce((s, tx) => s + (tx.amount ?? 0), 0)
  const thisTotal          = sum(thisCharges)
  const nextTotal          = sum(nextCharges)
  const nextStatementTotal = sum(nextStatementCharges)
  const laterTotal         = sum(laterCharges)
  const totalPayments      = sum(payments)

  /* ── The carried balance ──────────────────────────────────────────────────

     Everything ever billed, against everything ever paid. This is the whole
     of the fix for a card that forgot its own debt.

     What it replaces: `thisTotal - totalPayments`, a single cycle's charges
     against the payments made since that cycle closed. Anything outside that
     window did not exist, so an unpaid statement DISAPPEARED at the next
     cutoff - a ₱10,000 balance you never paid read as ₱10,000 owed in
     September and ₱0 owed in October, with the full credit limit available
     again. Partial payments lost their shortfall the same way, and an
     overpayment's credit was thrown away rather than carried.

     Nothing here needs a new field on a transaction or a new table. The rows
     were always right; only the window was wrong. */
  const billedTotal = sum(priorCharges) + thisTotal
  const paidTotal   = sum(priorPayments) + totalPayments

  /* Three states, where there used to be two.

     `totalPayments >= thisTotal` is also true of 0 >= 0, so a cycle that
     billed nothing came back "paid" and the account page put a green tick
     on a statement that had never asked for anything. Whether a bill EXISTS
     and whether it is SETTLED are separate questions.

     The balance math keeps using the settled test by itself, so none of
     this changes a single peso - `stmtSettled` is exactly the old flag. */
  const hasStatement    = thisTotal > 0
  /* Owed on everything billed so far, which can go NEGATIVE - that is an
     overpayment sitting on the card as a credit, and it is real money that
     has to survive into next month rather than being rounded away. */
  const carried         = billedTotal - paidTotal
  const stmtSettled     = carried <= 0
  const stmtPaid        = hasStatement && stmtSettled
  const stmtOutstanding = Math.max(0, carried)

  /* What the issuer would actually ask for by the due date. The account's
     stored minimum, but never more than is still owed on the closed
     statement - and nothing at all once that statement is settled, or when
     there was never one. A 150 peso statement cannot carry a 200 peso
     minimum either. */
  const minimumDue = Math.min(account?.minimumPayment ?? 0, stmtOutstanding)
  /* What the card is holding right now: what is still owed on everything
     billed, plus everything charged since the cutoff that has not been billed
     yet. Clamped at zero only at the very end, so an overpaid card offsets
     new charges instead of showing them at full value. */
  const currentBalance = Math.max(0, carried + nextTotal)

  return {
    cycleStart, cycleEnd, nextCycleEnd,
    thisCharges, nextCharges, nextStatementCharges, laterCharges, payments,
    priorCharges, priorPayments,
    // nextTotal === nextStatementTotal + laterTotal, by construction.
    thisTotal, nextTotal, nextStatementTotal, laterTotal, totalPayments,
    /* billedTotal/paidTotal are the running figures; `carried` is what they
       come to, signed - negative means the card owes YOU. */
    billedTotal, paidTotal, carried,
    stmtPaid, hasStatement, stmtOutstanding, minimumDue, currentBalance,
    availableCredit: (account?.creditLimit ?? 0) - currentBalance,
  }
}
