function clampDay(year, month, day) {
  return Math.min(day, new Date(year, month + 1, 0).getDate())
}

// End-of-day helper so any transaction time on that date is included
function eod(year, month, day) {
  return new Date(year, month, day, 23, 59, 59, 999)
}

/**
 * Returns { cycleStart, cycleEnd } for the most recently closed billing cycle.
 * cutoffDay = the first day of a new billing cycle (e.g. 15 → billing runs 15th–14th).
 *
 * cutoff=15, today=May 21  → Apr 15 00:00 – May 14 23:59  (open: May 15–Jun 14)
 * cutoff=15, today=May 10  → Mar 15 00:00 – Apr 14 23:59  (open: Apr 15–May 14)
 */
export function getCycleRange(cutoffDay, referenceDate = new Date()) {
  const d = cutoffDay ? Math.max(1, Math.min(31, cutoffDay)) : null
  if (!d) {
    const y = referenceDate.getFullYear(), m = referenceDate.getMonth()
    return { cycleStart: new Date(y, m, 1), cycleEnd: eod(y, m, new Date(y, m + 1, 0).getDate()) }
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
 */
export function getNextCycleRange(cutoffDay, referenceDate = new Date()) {
  const d = cutoffDay ? Math.max(1, Math.min(31, cutoffDay)) : null
  if (!d) {
    const y = referenceDate.getFullYear(), m = referenceDate.getMonth()
    return { cycleStart: new Date(y, m + 1, 1), cycleEnd: eod(y, m + 2, new Date(y, m + 2, 0).getDate()) }
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
      }
      // Charges older than the closed cycle are already settled — ignored.
    } else if (d > cycleEnd) {
      payments.push(tx)
    }
  }

  const sum                = (arr) => arr.reduce((s, tx) => s + (tx.amount ?? 0), 0)
  const thisTotal          = sum(thisCharges)
  const nextTotal          = sum(nextCharges)
  const nextStatementTotal = sum(nextStatementCharges)
  const laterTotal         = sum(laterCharges)
  const totalPayments      = sum(payments)

  const stmtPaid = totalPayments >= thisTotal
  // Statement settled → only the unbilled charges remain outstanding.
  // Partially paid → statement remainder plus the unbilled charges.
  const currentBalance = stmtPaid
    ? nextTotal
    : Math.max(0, thisTotal + nextTotal - totalPayments)

  return {
    cycleStart, cycleEnd, nextCycleEnd,
    thisCharges, nextCharges, nextStatementCharges, laterCharges, payments,
    // nextTotal === nextStatementTotal + laterTotal, by construction.
    thisTotal, nextTotal, nextStatementTotal, laterTotal, totalPayments,
    stmtPaid, currentBalance,
    availableCredit: (account?.creditLimit ?? 0) - currentBalance,
  }
}
