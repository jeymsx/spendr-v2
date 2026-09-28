import { fmtCompact } from '../../lib/money'
import { txBase } from '../../lib/fxContext'

// ── Trivia ─────────────────────────────────────────────────────────────────────

export function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}

/**
 * Small true things about a period, for the Highlights row on Insights.
 *
 * Each has a `key` as well as its words, so the page can leave out one it
 * already says elsewhere - the savings rate is on the Net card, the biggest
 * purchase on the Top expenses tile.
 *
 * `dailyData` is the days that have happened - a running month's last days
 * are not quiet days yet - each with its `label`, "Sep 8".
 *
 * @returns {Array<{key: string, icon: string, text: string}>}
 */
export function generateTrivia({ expenses, inflows, totalSpent, totalEarned, categorySegments, topCategory, dailyData, topExpenses, budgetData, monthName }) {
  /** @type {Array<{key: string, icon: string, text: string}>} */
  const items = []
  const push = (key, icon, text, valid = true) => { if (valid && text) items.push({ key, icon, text }) }
  const numExpenses = expenses.length
  const hasExpenses = numExpenses > 0

  const zeroDays = dailyData.filter(d => d.value === 0).length
  push('quiet-days', 'calendar', `No spending on ${zeroDays} of ${dailyData.length} days in ${monthName}.`, zeroDays > 0 && hasExpenses && dailyData.length > 0)

  if (topExpenses.length > 0) {
    const top = topExpenses[0]
    push('biggest', 'receipt', `Your biggest single expense: ${fmtCompact(txBase(top))} on "${top.description || top.category}".`)
  }

  push('count', 'calc', `${numExpenses} expense${numExpenses !== 1 ? 's' : ''} in ${monthName}, averaging ${fmtCompact(totalSpent / numExpenses)} each.`, hasExpenses)

  if (topCategory && totalSpent > 0) {
    const pct = (topCategory.value / totalSpent * 100).toFixed(0)
    /* Names only. The category's emoji led the sentence, a colour
       illustration in a line of text on a card whose picture is glass. */
    push('top-category', 'trophy', `${topCategory.name} took up ${pct}% of your spending.`)
  }

  if (categorySegments.length >= 2 && totalSpent > 0) {
    const top2 = categorySegments[0].value + categorySegments[1].value
    push('top-two', 'target', `${categorySegments[0].name} and ${categorySegments[1].name} together make up ${(top2 / totalSpent * 100).toFixed(0)}% of expenses.`)
  }

  if (totalEarned > 0) {
    const net = totalEarned - totalSpent
    const rate = Math.abs((net / totalEarned) * 100).toFixed(0)
    if (net >= 0) push('savings', 'coins', `You saved ${fmtCompact(net)} in ${monthName}, a ${rate}% savings rate.`)
    else push('savings', 'alert', `You overspent income by ${fmtCompact(Math.abs(net))}, a ${rate}% deficit.`)
  }

  if (hasExpenses) {
    const byDow = [0, 0, 0, 0, 0, 0, 0]
    for (const tx of expenses) byDow[new Date(tx.date).getDay()] += txBase(tx)
    const maxDow = byDow.indexOf(Math.max(...byDow))
    const days = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
    push('weekday', 'calendar', `${days[maxDow]} are your heaviest spending day in ${monthName}.`, byDow[maxDow] > 0)
  }

  const peak = dailyData.reduce((b, d) => d.value > b.value ? d : b, { day: 0, value: 0, label: '' })
  push('peak-day', 'trend', `Your biggest day was ${peak.label || `the ${ordinal(peak.day)}`}, at ${fmtCompact(peak.value)}.`, peak.value > 0)

  const activeDays = dailyData.filter(d => d.value > 0).length
  push('active-average', 'chart', `On days you actually spent, you averaged ${fmtCompact(totalSpent / activeDays)} per day.`, activeDays > 0)

  const overBudget = budgetData.filter(d => d.spent > d.budget)
  if (overBudget.length > 0) push('over-budget', 'alert', `Over budget in ${overBudget.length} categor${overBudget.length !== 1 ? 'ies' : 'y'}: ${overBudget.map(d => d.name).join(', ')}.`)

  const underBudget = budgetData.filter(d => d.budget > 0 && d.spent < d.budget)
  if (underBudget.length > 0) {
    const saved = underBudget.reduce((s, d) => s + (d.budget - d.spent), 0)
    push('under-budget', 'check', `Stayed under budget in ${underBudget.length} categor${underBudget.length !== 1 ? 'ies' : 'y'}, ${fmtCompact(saved)} left against your limits.`)
  }

  return items
}
