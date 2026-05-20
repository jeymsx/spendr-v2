/**
 * Advance a date string forward by one frequency period.
 * Returns a YYYY-MM-DD string.
 */
export function advanceNextDate(dateStr, frequency) {
  const d = new Date(dateStr)
  switch (frequency) {
    case 'daily':  d.setDate(d.getDate() + 1); break
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'monthly': {
      // Save original day, reset to 1st to prevent overflow (e.g. Jan 31 → Mar 2)
      const day = d.getDate()
      d.setDate(1)
      d.setMonth(d.getMonth() + 1)
      // Clamp to last day of the target month (e.g. Jan 31 → Feb 28/29)
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
      break
    }
    case 'yearly': {
      // Save original day/month, reset to 1st to prevent Feb-29 overflow
      const day = d.getDate()
      const mon = d.getMonth()
      d.setDate(1)
      d.setFullYear(d.getFullYear() + 1)
      d.setDate(Math.min(day, new Date(d.getFullYear(), mon + 1, 0).getDate()))
      break
    }
  }
  return d.toISOString().slice(0, 10)
}

/**
 * Normalize an amount to its monthly equivalent.
 */
export function toMonthlyAmount(amount, frequency) {
  switch (frequency) {
    case 'daily':   return (amount ?? 0) * 30.44
    case 'weekly':  return (amount ?? 0) * (52 / 12)
    case 'monthly': return amount ?? 0
    case 'yearly':  return (amount ?? 0) / 12
    default:        return amount ?? 0
  }
}
