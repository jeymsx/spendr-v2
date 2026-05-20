function clampDay(year, month, day) {
  return Math.min(day, new Date(year, month + 1, 0).getDate())
}

/**
 * Returns { cycleStart, cycleEnd } for the most recently closed billing cycle.
 * "Current statement" = the closed period you're currently owing.
 *
 * cutoff=15, today=May 20  → Apr 16 – May 15  (closed 5 days ago)
 * cutoff=15, today=May 10  → Mar 16 – Apr 15  (closed 25 days ago)
 */
export function getCycleRange(cutoffDay, referenceDate = new Date()) {
  const d = cutoffDay ? Math.max(1, Math.min(31, cutoffDay)) : null
  if (!d) {
    const y = referenceDate.getFullYear(), m = referenceDate.getMonth()
    return { cycleStart: new Date(y, m, 1), cycleEnd: new Date(y, m + 1, 0) }
  }

  const y  = referenceDate.getFullYear()
  const m  = referenceDate.getMonth()
  const cd = clampDay(y, m, d)
  const cutoffThisMonth = new Date(y, m, cd)

  if (referenceDate > cutoffThisMonth) {
    const pm = m === 0 ? 11 : m - 1
    const py = m === 0 ? y - 1 : y
    return {
      cycleStart: new Date(py, pm, clampDay(py, pm, d) + 1),
      cycleEnd:   cutoffThisMonth,
    }
  } else {
    const pm  = m === 0 ? 11 : m - 1
    const py  = m === 0 ? y - 1 : y
    const p2m = pm === 0 ? 11 : pm - 1
    const p2y = pm === 0 ? py - 1 : py
    return {
      cycleStart: new Date(p2y, p2m, clampDay(p2y, p2m, d) + 1),
      cycleEnd:   new Date(py, pm, clampDay(py, pm, d)),
    }
  }
}

/**
 * Returns { cycleStart, cycleEnd } for the currently-accumulating (open) cycle —
 * i.e. the one that will become next month's statement.
 */
export function getNextCycleRange(cutoffDay, referenceDate = new Date()) {
  const d = cutoffDay ? Math.max(1, Math.min(31, cutoffDay)) : null
  if (!d) {
    const y = referenceDate.getFullYear(), m = referenceDate.getMonth()
    return { cycleStart: new Date(y, m + 1, 1), cycleEnd: new Date(y, m + 2, 0) }
  }

  const { cycleEnd } = getCycleRange(cutoffDay, referenceDate)
  const nextStart = new Date(cycleEnd.getTime() + 864e5)
  const em = cycleEnd.getMonth(), ey = cycleEnd.getFullYear()
  const nm = em === 11 ? 0 : em + 1
  const ny = em === 11 ? ey + 1 : ey
  return {
    cycleStart: nextStart,
    cycleEnd:   new Date(ny, nm, clampDay(ny, nm, d)),
  }
}
