import { createElement } from 'react'
import db from '../db/db'
import { getCreditStatus, getNextCycleRange } from './creditCycle'
import { scheduledCutoff } from './scheduled'

// ── Formatter ──────────────────────────────────────────────────────────────────

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
  // category over budget.
  const cutoff    = scheduledCutoff()
  const monthTxs  = allTxs.filter(tx => {
    if ((tx.date ?? '') > cutoff) return false
    const d = new Date(tx.date)
    return d >= start && d < end
  })

  // The instant this report describes. A report for a finished month is a
  // snapshot of that month's last moment; a report for the month in progress
  // can only be a snapshot of now, which is also where the spend figures above
  // stop. Everything time-dependent below derives from this one value, so the
  // balances, the credit cycles and the totals all describe the same moment.
  const asOf = new Date(Math.min(end.getTime() - 1, new Date(cutoff).getTime()))

  // Credit math must not see anything that had not happened yet. Passing only
  // a reference date is not enough: getCreditStatus treats every charge after
  // the closed cycle as unbilled and every payment after it as settling the
  // statement, both unbounded forward, so a July report would otherwise absorb
  // August's charges and payments.
  const txsAsOf = allTxs.filter(tx => new Date(tx.date) <= asOf)

  const accounts   = await db.accounts.toArray()
  const categories = await db.categories.toArray()
  const nameMeta   = await db.meta.get('displayName')
  const userName   = nameMeta?.value ?? 'Spendr User'

  const catMap = Object.fromEntries(categories.map(c => [c.name, c]))

  const expenses = monthTxs.filter(tx => tx.type === 'expense')
  const inflows  = monthTxs.filter(tx => tx.type === 'inflow')

  /** @param {number} v */
  const r2 = (v) => Math.round(v * 100) / 100

  const totalIncome   = r2(inflows.reduce((s, t)  => s + (t.amount ?? 0), 0))
  const totalExpenses = r2(expenses.reduce((s, t) => s + (t.amount ?? 0), 0))
  const netSavings    = r2(totalIncome - totalExpenses)
  const savingsRate   = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

  // Category breakdown
  /** @type {Record<string, {total: number, count: number}>} */
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
  /** @param {Date|null} [d] */
  const fmtDate = (d) => d
    ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  /** @type {Record<string, Record<string, any>>} */
  const creditDetailMap = {}
  for (const acct of creditAccounts) {
    const { cycleStart, cycleEnd, thisTotal: stmtTotal, nextTotal,
            nextStatementTotal, laterTotal, nextCycleEnd, currentBalance: balanceUsed,
            minimumDue }
      = getCreditStatus(acct, txsAsOf, asOf)
    const { cycleStart: nextStart } = getNextCycleRange(acct.cutoffDate, asOf)

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
      // nextTotal is every future plan month and is what balanceUsed and the
      // limit are built from; nextStatementTotal is what the next bill asks
      // for. The report shows the latter and names the remainder separately.
      nextTotal,
      nextStatementTotal,
      laterTotal,
      nextRange:    `${fmtDate(nextStart)} – ${fmtDate(nextCycleEnd)}`,
      balanceUsed,
      available,
      usedPct,
      limit,
      dueDate:      fmtDate(dueDateObj),
      // What is still owed on the closed statement, capped at the account's
      // minimum - not the stored minimum printed against any balance at all.
      minimumDue,
    }
  }

  // Reconstruct each account's balance as of the same instant, by reversing
  // everything that happened after it. For a finished month this is identical
  // to reversing everything from the next month on; for the month in progress
  // it also backs out charges dated later this month, which the stored balance
  // already includes because an installment plan writes every row up front.
  const afterMonthTxs = allTxs.filter(tx => new Date(tx.date) > asOf)
  /** @type {Record<string, number>} */
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
        /* -a for every destination, credit included. applyBalanceEffect used
           to special-case a transfer landing on a card as -a, and this line
           was written to undo that. The special case is gone: it had the sign
           backwards, so every card payment deepened the debt it was paying
           off. A card is not an exception to "a transfer adds to where it
           lands", which makes reversing one an ordinary subtraction. */
        if (tx.toAccount === acct.name) bal -= a
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
    asOf,
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
 * Fetches data, renders the PDF, and hands it over.
 * @param {number} year
 * @param {number} month  1-indexed
 * @param {string} [accentColor]
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
export async function downloadMonthlyReport(year, month, accentColor = '#2D9DFF') {
  const data = await fetchReportData(year, month)

  const { default: MonthlyReport } = await import('../components/pdf/MonthlyReport.jsx')
  const { pdf }                    = await import('@react-pdf/renderer')

  const generatedAt = new Date().toLocaleString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const pdfAny = /** @type {any} */ (pdf)
  const blob = await pdfAny(
    createElement(MonthlyReport, { ...data, accentColor, generatedAt })).toBlob()

  const mm = String(month).padStart(2, '0')
  return deliverPdf(blob, `spendr-report-${year}-${mm}.pdf`)
}

/**
 * Get the finished PDF to the person who asked for it.
 *
 * ── Why this is not just an <a download> ──
 *
 * It was, and on an iPhone that does nothing at all. iOS Safari gives the
 * `download` attribute no useful meaning, and inside an installed PWA there
 * is no browser chrome to fall back to - the anchor is clicked, no file
 * appears, and the app cheerfully reports success. Nothing throws, so the
 * caller's try/catch never fires either.
 *
 * The same code also revoked the object URL on the very next line. That is a
 * race everywhere and a reliable failure on Safari: revoking tears down the
 * blob before the navigation it was created for has begun. Desktop Chrome
 * survives it because the click is dispatched synchronously enough, which is
 * exactly the kind of accident that makes a bug look platform-specific.
 *
 * So: Web Share first. It is the native way to keep a file on iOS - the share
 * sheet offers Files, Mail, anything - and it is the only route that reliably
 * produces a saved PDF from a standalone PWA. Desktop and Android fall
 * through to the anchor, which is right for them.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
async function deliverPdf(blob, filename) {
  const file = typeof File === 'function'
    ? new File([blob], filename, { type: 'application/pdf' })
    : null

  /* canShare({files}) rather than a UA sniff: it answers the only question
     that matters, which is whether THIS browser will take THIS file. */
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      // Dismissing the share sheet is a decision, not a failure. Falling
      // through to a download here would hand them the file they just
      // declined.
      if (/** @type {any} */ (e)?.name === 'AbortError') return 'cancelled'
      // Anything else - share unsupported for this type, a transient
      // failure - is worth trying the anchor for.
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  /* Long after the click, not on the next line. The browser needs the URL to
     still resolve while it starts the download. */
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
