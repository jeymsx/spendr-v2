import { createElement } from 'react'
import db from '../db/db'
import { getCreditStatus, getNextCycleRange } from './creditCycle'
import { scheduledCutoff } from './scheduled'

// ── Formatter ──────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Sign before the symbol. Intl puts the minus before the digits, so prefixing
// the peso sign rendered "PHP-5,000.00". Net savings is negative in any month
// you outspend your income, and net worth is negative when credit owed exceeds
// assets - both are printed on the report.
export const fmt = (v) => {
  const n = v ?? 0
  return (n < 0 ? '−₱' : '₱') + _phpFmt.format(Math.abs(n))
}

// ── fetchReportData ────────────────────────────────────────────────────────────

/**
 * Returns structured data for the PDF from Dexie.
 * @param {number} year
 * @param {number} month  1-indexed (1 = January)
 */
export async function fetchReportData(year, month) {
  const start = new Date(year, month - 1, 1)
  const end   = new Date(year, month, 1)

  const allTxs    = await db.transactions.toArray()

  // A charge dated after today is committed, not spent - the rule in
  // utils/scheduled, which names budgets among the surfaces that must hide it.
  // This report carries a Budget column per category and a spend total, and
  // the current month is the default selection, so an installment dated later
  // this month was being reported as money already gone and could flag a
  // category over budget. allTxs stays unfiltered below: getCreditStatus has
  // to see future charges, because the issuer really has locked that credit.
  const cutoff    = scheduledCutoff()
  const monthTxs  = allTxs.filter(tx => {
    if ((tx.date ?? '') > cutoff) return false
    const d = new Date(tx.date)
    return d >= start && d < end
  })

  const accounts   = await db.accounts.toArray()
  const categories = await db.categories.toArray()
  const nameMeta   = await db.meta.get('displayName')
  const userName   = nameMeta?.value ?? 'Spendr User'

  const catMap = Object.fromEntries(categories.map(c => [c.name, c]))

  const expenses = monthTxs.filter(tx => tx.type === 'expense')
  const inflows  = monthTxs.filter(tx => tx.type === 'inflow')

  const r2 = (v) => Math.round(v * 100) / 100

  const totalIncome   = r2(inflows.reduce((s, t)  => s + (t.amount ?? 0), 0))
  const totalExpenses = r2(expenses.reduce((s, t) => s + (t.amount ?? 0), 0))
  const netSavings    = r2(totalIncome - totalExpenses)
  const savingsRate   = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

  // Category breakdown
  const catTotals = {}
  for (const tx of expenses) {
    if (!catTotals[tx.category]) {
      catTotals[tx.category] = { total: 0, count: 0 }
    }
    catTotals[tx.category].total += tx.amount ?? 0
    catTotals[tx.category].count += 1
  }

  const categoryBreakdown = Object.entries(catTotals)
    .map(([name, { total, count }]) => {
      const cat = catMap[name]
      return {
        name,
        total,
        count,
        pct:    totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
        color:  cat?.color ?? '#6366f1',
        budget: cat?.budget > 0 ? cat.budget : null,
      }
    })
    .sort((a, b) => b.total - a.total)

  // Account totals
  const creditAccounts    = accounts.filter(a => a.type === 'credit')
  const nonCreditAccounts = accounts.filter(a => a.type !== 'credit')

  // Credit detail: uses current billing cycle (same logic as Dashboard / account modal)
  const fmtDate = (d) => d
    ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  const creditDetailMap = {}
  for (const acct of creditAccounts) {
    const { cycleStart, cycleEnd, thisTotal: stmtTotal, nextTotal, currentBalance: balanceUsed }
      = getCreditStatus(acct, allTxs)
    const { cycleStart: nextStart } = getNextCycleRange(acct.cutoffDate)

    const limit = acct.creditLimit ?? 0
    const available   = Math.max(limit - balanceUsed, 0)
    const usedPct     = limit > 0 ? Math.min((balanceUsed / limit) * 100, 100) : 0

    // Due date = dueDate day of the month after cycleEnd
    const dueDay = acct.dueDate
    const dueDateObj = dueDay
      ? new Date(cycleEnd.getFullYear(), cycleEnd.getMonth() + 1, dueDay)
      : null

    creditDetailMap[acct.name] = {
      stmtTotal,
      stmtRange:    `${fmtDate(cycleStart)} – ${fmtDate(cycleEnd)}`,
      nextTotal,
      nextRange:    `From ${fmtDate(nextStart)}`,
      balanceUsed,
      available,
      usedPct,
      limit,
      dueDate:      fmtDate(dueDateObj),
      minimumPayment: acct.minimumPayment ?? 0,
    }
  }

  // Reconstruct each account's balance at month-end by reversing
  // all transactions that happened after the report period.
  const afterMonthTxs = allTxs.filter(tx => new Date(tx.date) >= end)
  const endingBalances = {}
  for (const acct of accounts) {
    let bal = acct.balance ?? 0
    for (const tx of afterMonthTxs) {
      const a = tx.amount ?? 0
      if (tx.type === 'expense') {
        if (tx.account === acct.name) bal += a      // reverse: expense reduced balance
      } else if (tx.type === 'inflow') {
        if (tx.account === acct.name) bal -= a      // reverse: inflow increased balance
      } else if (tx.type === 'transfer') {
        const from = tx.fromAccount || tx.account
        if (from === acct.name) bal += a  // reverse: transfer out reduced balance
        if (tx.toAccount === acct.name) {
          // For credit accounts, transfer-in is a payment (applied as -a), so reversal adds back
          bal += acct.type === 'credit' ? a : -a
        }
      }
    }
    endingBalances[acct.name] = bal
  }

  const totalAssets      = nonCreditAccounts.reduce((s, a) => s + (endingBalances[a.name] ?? 0), 0)
  const totalCreditUsed  = creditAccounts.reduce((s, a) => s + (creditDetailMap[a.name]?.balanceUsed ?? 0), 0)
  const totalCreditLimit = creditAccounts.reduce((s, a) => s + (a.creditLimit ?? 0), 0)
  const netWorth         = totalAssets - totalCreditUsed

  // Transactions sorted ascending by date
  const transactions = [...monthTxs].sort((a, b) => {
    if (a.date < b.date) return -1
    if (a.date > b.date) return 1
    return 0
  })

  return {
    year,
    month,
    userName,
    summary: { totalIncome, totalExpenses, netSavings, savingsRate },
    accounts,
    endingBalances,
    creditDetailMap,
    totalAssets,
    totalCreditUsed,
    totalCreditLimit,
    netWorth,
    categoryBreakdown,
    transactions,
  }
}

// ── downloadMonthlyReport ──────────────────────────────────────────────────────

/**
 * Fetches data then downloads the PDF.
 * @param {number} year
 * @param {number} month  1-indexed
 */
export async function downloadMonthlyReport(year, month, accentColor = '#2D9DFF') {
  const data = await fetchReportData(year, month)

  const { default: MonthlyReport } = await import('../components/pdf/MonthlyReport.jsx')
  const { pdf }                    = await import('@react-pdf/renderer')

  const generatedAt = new Date().toLocaleString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const blob = await pdf(createElement(MonthlyReport, { ...data, accentColor, generatedAt })).toBlob()

  const mm  = String(month).padStart(2, '0')
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = `spendr-report-${year}-${mm}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
