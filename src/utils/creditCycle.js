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
