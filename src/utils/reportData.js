import { createElement } from 'react'
import db from '../db/db'
import { getCycleRange, getNextCycleRange } from './creditCycle'

// ── Formatter ──────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmt = (v) => '₱' + _phpFmt.format(v ?? 0)

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
  const monthTxs  = allTxs.filter(tx => {
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

  const totalIncome   = inflows.reduce((s, t)  => s + (t.amount ?? 0), 0)
  const totalExpenses = expenses.reduce((s, t) => s + (t.amount ?? 0), 0)
  const netSavings    = totalIncome - totalExpenses
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
    const { cycleStart, cycleEnd }           = getCycleRange(acct.cutoffDate)
    const { cycleStart: nextStart, cycleEnd: nextEnd } = getNextCycleRange(acct.cutoffDate)

    const acctExpenses = allTxs.filter(tx => tx.account === acct.name && tx.type === 'expense')
    const localDate = (s) => { const [y, mo, dy] = String(s || '').slice(0, 10).split('-').map(Number); return new Date(y, mo - 1, dy) }

    const stmtTotal = acctExpenses
      .filter(tx => { const d = localDate(tx.date); return d >= cycleStart && d <= cycleEnd })
      .reduce((s, tx) => s + (tx.amount ?? 0), 0)

    const nextTotal = acctExpenses
      .filter(tx => { const d = localDate(tx.date); return d >= nextStart && d <= nextEnd })
      .reduce((s, tx) => s + (tx.amount ?? 0), 0)

    const limit       = acct.creditLimit ?? 0
    const balanceUsed = stmtTotal + nextTotal
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
      nextRange:    `${fmtDate(nextStart)} – ${fmtDate(nextEnd)}`,
      balanceUsed,
      available,
      usedPct,
      limit,
      dueDate:      fmtDate(dueDateObj),
      minimumPayment: acct.minimumPayment ?? 0,
    }
  }

  const totalAssets      = nonCreditAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)
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
export async function downloadMonthlyReport(year, month) {
  const data = await fetchReportData(year, month)

  const { default: MonthlyReport } = await import('../components/pdf/MonthlyReport.jsx')
  const { pdf }                    = await import('@react-pdf/renderer')

  const blob = await pdf(createElement(MonthlyReport, data)).toBlob()

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
