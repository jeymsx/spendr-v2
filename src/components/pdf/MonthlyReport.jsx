import { Document, Page, View, Text, StyleSheet, Svg, Rect } from '@react-pdf/renderer'

// ── Color helpers ──────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('')
}

function blendWithWhite(hex, t) {
  const [r,g,b] = hexToRgb(hex)
  return rgbToHex(r*t+255*(1-t), g*t+255*(1-t), b*t+255*(1-t))
}

function darken(hex, t) {
  const [r,g,b] = hexToRgb(hex)
  return rgbToHex(r*(1-t), g*(1-t), b*(1-t))
}

function luminance(hex) {
  return hexToRgb(hex).map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
}

function darkenForWhiteText(hex) {
  const [r, g, b] = hexToRgb(hex)
  let factor = 1
  while (factor > 0.05) {
    const lum = luminance(rgbToHex(r * factor, g * factor, b * factor))
    if (1.05 / (lum + 0.05) >= 4.5) break
    factor -= 0.05
  }
  return rgbToHex(r * factor, g * factor, b * factor)
}

function computePdfColors(accentHex) {
  const primary = darkenForWhiteText(accentHex)
  return {
    primary,
    primaryDark: darken(primary, 0.18),
    lightBg:     blendWithWhite(primary, 0.15),
    borderTint:  blendWithWhite(primary, 0.35),
    bgTint:      blendWithWhite(primary, 0.08),
  }
}

// ── Design tokens ──────────────────────────────────────────────────────────────

const BORDER         = '#e2e8f0'
const RED            = '#ef4444'
const GREEN          = '#22c55e'
const GRAY_TEXT      = '#64748b'
const MUTED          = '#94a3b8'
const WHITE          = '#ffffff'
const DARK_TEXT      = '#1e293b'
const MEDIUM_TEXT    = '#334155'

// ── Formatters ─────────────────────────────────────────────────────────────────

const _phpFmt = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (v) => 'PHP ' + _phpFmt.format(v ?? 0)

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK_TEXT,
    padding: 40,
    backgroundColor: WHITE,
  },

  // Header bar (backgroundColor overridden inline with accent)
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2D9DFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    marginBottom: 16,
  },
  headerBarTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: WHITE,
  },
  headerBarSub: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.7)',
  },

  // Page titles
  pageTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    color: DARK_TEXT,
    marginBottom: 2,
  },
  pageTitleSub: {
    fontSize: 9,
    color: GRAY_TEXT,
    marginBottom: 16,
  },

  // Summary cards row
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 6,
  },
  summaryCardLast: {
    marginRight: 0,
  },
  summaryLabel: {
    fontSize: 7,
    color: GRAY_TEXT,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },

  // Section header (backgroundColor + text color overridden inline with accent)
  sectionHeader: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    marginBottom: 6,
  },
  sectionHeaderText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#1a7fd4',
    textTransform: 'uppercase',
  },

  // Table
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableHeaderText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    color: GRAY_TEXT,
    textTransform: 'uppercase',
  },
  tableCell: {
    fontSize: 8,
    color: DARK_TEXT,
  },

  // Net worth bottom row
  netWorthRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  netWorthCard: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    marginRight: 6,
  },
  netWorthCardLast: {
    marginRight: 0,
  },
  netWorthLabel: {
    fontSize: 7,
    marginBottom: 3,
  },
  netWorthValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: MUTED,
  },

  // Category bar
  barBg: {
    height: 5,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    marginTop: 2,
  },

  // Week group header
  weekHeader: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  weekHeaderText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    color: GRAY_TEXT,
  },
})

// ── Footer component ───────────────────────────────────────────────────────────

function ReportFooter({ monthName, year }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Spendr Monthly Report — {monthName} {year}</Text>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )
}

// ── Header bar component ───────────────────────────────────────────────────────

function HeaderBar({ subtitle, colors }) {
  return (
    <View style={[styles.headerBar, { backgroundColor: colors.primary }]}>
      <Text style={styles.headerBarTitle}>Spendr</Text>
      <Text style={styles.headerBarSub}>{subtitle}</Text>
    </View>
  )
}

// ── Page 1: Cover & Summary ────────────────────────────────────────────────────

function CoverPage({ year, month, userName, summary, accounts, creditDetailMap, totalAssets, totalCreditUsed, totalCreditLimit, netWorth, colors }) {
  const monthName = MONTH_NAMES[month - 1]
  const { totalIncome, totalExpenses, netSavings, savingsRate } = summary

  const savingsPositive = netSavings >= 0

  const creditAccounts    = accounts.filter(a => a.type === 'credit')
  const nonCreditAccounts = accounts.filter(a => a.type !== 'credit')

  return (
    <Page size="A4" style={styles.page}>
      <HeaderBar subtitle="MONTHLY REPORT" colors={colors} />

      {/* Month + username */}
      <Text style={styles.pageTitle}>{monthName} {year}</Text>
      <Text style={styles.pageTitleSub}>{userName}</Text>

      {/* 4 Summary cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}>
          <Text style={styles.summaryLabel}>Total Income</Text>
          <Text style={[styles.summaryValue, { color: GREEN }]}>{fmt(totalIncome)}</Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: '#fecaca', backgroundColor: '#fef2f2' }]}>
          <Text style={styles.summaryLabel}>Total Expenses</Text>
          <Text style={[styles.summaryValue, { color: RED }]}>{fmt(totalExpenses)}</Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: savingsPositive ? '#bbf7d0' : '#fecaca', backgroundColor: savingsPositive ? '#f0fdf4' : '#fef2f2' }]}>
          <Text style={styles.summaryLabel}>Net Savings</Text>
          <Text style={[styles.summaryValue, { color: savingsPositive ? GREEN : RED }]}>{fmt(netSavings)}</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardLast, { borderColor: colors.borderTint, backgroundColor: colors.bgTint }]}>
          <Text style={styles.summaryLabel}>Savings Rate</Text>
          <Text style={[styles.summaryValue, { color: colors.primary }]}>{savingsRate.toFixed(1)}%</Text>
        </View>
      </View>

      {/* Account Balances */}
      <View style={[styles.sectionHeader, { backgroundColor: colors.lightBg }]}>
        <Text style={[styles.sectionHeaderText, { color: colors.primaryDark }]}>Account Balances</Text>
      </View>

      {/* Table header */}
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={[styles.tableHeaderText, { flex: 2 }]}>Account</Text>
        <Text style={[styles.tableHeaderText, { flex: 1 }]}>Type</Text>
        <Text style={[styles.tableHeaderText, { flex: 1.5, textAlign: 'right' }]}>Balance</Text>
      </View>

      {/* Non-credit accounts */}
      {nonCreditAccounts.map((acct, i) => (
        <View key={acct.id ?? i} style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? WHITE : '#fafafa' }]}>
          <Text style={[styles.tableCell, { flex: 2, fontFamily: 'Helvetica-Bold' }]}>{acct.name}</Text>
          <Text style={[styles.tableCell, { flex: 1, color: GRAY_TEXT, textTransform: 'capitalize' }]}>{acct.type}</Text>
          <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right', color: (acct.balance ?? 0) >= 0 ? DARK_TEXT : RED }]}>
            {fmt(acct.balance ?? 0)}
          </Text>
        </View>
      ))}

      {/* Credit accounts — detailed cards */}
      {creditAccounts.map((acct, i) => {
        const det     = creditDetailMap[acct.name] ?? {}
        const { stmtTotal = 0, stmtRange = '', nextTotal = 0, nextRange = '',
                balanceUsed = 0, available = 0, usedPct = 0, limit = 0,
                dueDate = '—', minimumPayment = 0 } = det
        const barFill = Math.max((usedPct / 100) * 450, 0)
        const usedColor = usedPct >= 90 ? RED : usedPct >= 70 ? '#f59e0b' : colors.primary

        return (
          <View key={acct.id ?? i} style={{ marginTop: 6, borderWidth: 1, borderColor: BORDER, borderRadius: 6, overflow: 'hidden' }}>
            {/* Card header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              backgroundColor: '#f8fafc', paddingHorizontal: 10, paddingVertical: 6,
              borderBottomWidth: 1, borderBottomColor: BORDER }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, color: DARK_TEXT }}>{acct.name}</Text>
              <Text style={{ fontSize: 7, color: GRAY_TEXT }}>Credit Card</Text>
            </View>

            <View style={{ padding: 10 }}>
              {/* Balance used row */}
              <Text style={{ fontSize: 7, color: GRAY_TEXT, marginBottom: 2 }}>BALANCE USED</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 12, color: usedColor }}>{fmt(balanceUsed)}</Text>
                <Text style={{ fontSize: 7, color: GRAY_TEXT }}>{usedPct.toFixed(0)}% of {fmt(limit)} limit</Text>
              </View>
              {/* Progress bar */}
              <View style={{ marginBottom: 8 }}>
                <Svg width={450} height={6}>
                  <Rect x={0} y={0} width={450} height={6} fill="#e2e8f0" rx={3} />
                  <Rect x={0} y={0} width={barFill} height={6} fill={usedColor} rx={3} />
                </Svg>
              </View>

              {/* Detail rows */}
              <View style={{ flexDirection: 'row', marginBottom: 3 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 7, color: GRAY_TEXT }}>STATEMENT BALANCE</Text>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, color: RED, marginTop: 1 }}>{fmt(stmtTotal)}</Text>
                  <Text style={{ fontSize: 7, color: GRAY_TEXT, marginTop: 1 }}>{stmtRange}</Text>
                  {dueDate !== '—' && (
                    <Text style={{ fontSize: 7, color: RED, marginTop: 1 }}>Due {dueDate}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 7, color: GRAY_TEXT }}>NEXT STATEMENT</Text>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, color: DARK_TEXT, marginTop: 1 }}>{fmt(nextTotal)}</Text>
                  <Text style={{ fontSize: 7, color: GRAY_TEXT, marginTop: 1 }}>{nextRange}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 7, color: GRAY_TEXT }}>AVAILABLE CREDIT</Text>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, color: GREEN, marginTop: 1 }}>{fmt(available)}</Text>
                </View>
                {minimumPayment > 0 && (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 7, color: GRAY_TEXT }}>MIN. DUE</Text>
                    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, color: DARK_TEXT, marginTop: 1 }}>{fmt(minimumPayment)}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )
      })}

      {accounts.length === 0 && (
        <View style={[styles.tableRow]}>
          <Text style={[styles.tableCell, { color: MUTED, flex: 1 }]}>No accounts found</Text>
        </View>
      )}

      {/* Net Worth section header */}
      <View style={[styles.sectionHeader, { marginTop: 14, backgroundColor: colors.lightBg }]}>
        <Text style={[styles.sectionHeaderText, { color: colors.primaryDark }]}>Overall Financial Position</Text>
      </View>

      {/* Net Worth row */}
      <View style={styles.netWorthRow}>
        <View style={[styles.netWorthCard, { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }]}>
          <Text style={[styles.netWorthLabel, { color: GREEN }]}>Total Assets</Text>
          <Text style={[styles.netWorthValue, { color: GREEN }]}>{fmt(totalAssets)}</Text>
        </View>
        <View style={[styles.netWorthCard, { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }]}>
          <Text style={[styles.netWorthLabel, { color: RED }]}>Credit Used</Text>
          <Text style={[styles.netWorthValue, { color: RED }]}>{fmt(totalCreditUsed)}</Text>
          {totalCreditLimit > 0 && (
            <Text style={[{ fontSize: 7, color: MUTED, marginTop: 2 }]}>of {fmt(totalCreditLimit)} limit</Text>
          )}
        </View>
        <View style={[styles.netWorthCard, styles.netWorthCardLast, { backgroundColor: colors.bgTint, borderWidth: 1, borderColor: colors.borderTint }]}>
          <Text style={[styles.netWorthLabel, { color: colors.primary }]}>Net Worth</Text>
          <Text style={[styles.netWorthValue, { color: netWorth >= 0 ? colors.primary : RED }]}>{fmt(netWorth)}</Text>
        </View>
      </View>

      <ReportFooter monthName={monthName} year={year} />
    </Page>
  )
}

// ── Page 2: Spending Breakdown ─────────────────────────────────────────────────

function SpendingPage({ year, month, summary, categoryBreakdown, colors }) {
  const monthName = MONTH_NAMES[month - 1]
  const { totalExpenses } = summary
  const BAR_MAX_WIDTH = 400

  return (
    <Page size="A4" style={styles.page}>
      <HeaderBar subtitle="SPENDING BREAKDOWN" colors={colors} />

      <View style={[styles.sectionHeader, { backgroundColor: colors.lightBg }]}>
        <Text style={[styles.sectionHeaderText, { color: colors.primaryDark }]}>Spending by Category — {monthName} {year}</Text>
      </View>

      {categoryBreakdown.length === 0 ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: MUTED, fontSize: 9 }}>No expense data for this month.</Text>
        </View>
      ) : (
        <>
          {/* Table header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Category</Text>
            <Text style={[styles.tableHeaderText, { width: 40, textAlign: 'right' }]}>Txns</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.5, textAlign: 'right' }]}>Amount</Text>
            <Text style={[styles.tableHeaderText, { width: 40, textAlign: 'right' }]}>%</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Budget</Text>
          </View>

          {categoryBreakdown.map((cat, i) => {
            const overBudget = cat.budget != null && cat.total > cat.budget
            const barWidth   = Math.max((cat.pct / 100) * BAR_MAX_WIDTH, 0)

            return (
              <View key={i} style={{ backgroundColor: i % 2 === 0 ? WHITE : '#fafafa' }}>
                <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
                  <Text style={[styles.tableCell, { flex: 2, fontFamily: 'Helvetica-Bold' }]}>
                    {cat.name.slice(0, 28)}
                  </Text>
                  <Text style={[styles.tableCell, { width: 40, textAlign: 'right', color: GRAY_TEXT }]}>
                    {cat.count}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                    {fmt(cat.total)}
                  </Text>
                  <Text style={[styles.tableCell, { width: 40, textAlign: 'right', color: GRAY_TEXT }]}>
                    {cat.pct.toFixed(1)}%
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: overBudget ? RED : GRAY_TEXT }]}>
                    {cat.budget != null ? fmt(cat.budget) : '—'}
                  </Text>
                </View>

                {/* Progress bar */}
                <View style={{ paddingHorizontal: 6, paddingBottom: 4 }}>
                  <View style={[styles.barBg, { width: BAR_MAX_WIDTH }]}>
                    <Svg width={BAR_MAX_WIDTH} height={5}>
                      <Rect x={0} y={0} width={BAR_MAX_WIDTH} height={5} fill="#e2e8f0" rx={2} />
                      <Rect x={0} y={0} width={barWidth} height={5} fill={cat.color} rx={2} />
                    </Svg>
                  </View>
                </View>

                <View style={{ height: 1, backgroundColor: BORDER, marginHorizontal: 6 }} />
              </View>
            )
          })}

          {/* Total row */}
          <View style={[styles.tableRow, { backgroundColor: '#f8fafc', borderTopWidth: 1, borderTopColor: BORDER }]}>
            <Text style={[styles.tableCell, { flex: 2, fontFamily: 'Helvetica-Bold', color: DARK_TEXT }]}>Total</Text>
            <Text style={[styles.tableCell, { width: 40, textAlign: 'right', color: GRAY_TEXT }]}>
              {categoryBreakdown.reduce((s, c) => s + c.count, 0)}
            </Text>
            <Text style={[styles.tableCell, { flex: 1.5, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: RED }]}>
              {fmt(totalExpenses)}
            </Text>
            <Text style={[styles.tableCell, { width: 40, textAlign: 'right', color: DARK_TEXT, fontFamily: 'Helvetica-Bold' }]}>100%</Text>
            <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: GRAY_TEXT }]}>—</Text>
          </View>
        </>
      )}

      <ReportFooter monthName={monthName} year={year} />
    </Page>
  )
}

// ── Page 3: Transaction List ───────────────────────────────────────────────────

function getWeekGroup(day) {
  if (day <= 7)  return 0
  if (day <= 14) return 1
  if (day <= 21) return 2
  return 3
}

function weekGroupLabel(group, year, month) {
  const monthName = MONTH_SHORT[month - 1]
  const daysInMonth = new Date(year, month, 0).getDate()
  const ranges = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, daysInMonth],
  ]
  const [s, e] = ranges[group]
  return `${monthName} ${s}–${e}`
}

function TransactionsPage({ year, month, transactions, colors }) {
  const monthName = MONTH_NAMES[month - 1]

  // Group by week
  const groups = {}
  for (const tx of transactions) {
    const d   = new Date(tx.date)
    const day = d.getDate()
    const wg  = getWeekGroup(day)
    if (!groups[wg]) groups[wg] = []
    groups[wg].push(tx)
  }

  const weekKeys = Object.keys(groups).map(Number).sort((a, b) => a - b)

  let globalRowIdx = 0

  return (
    <Page size="A4" style={styles.page}>
      <HeaderBar subtitle="TRANSACTION LIST" colors={colors} />

      <View style={[styles.sectionHeader, { backgroundColor: colors.lightBg }]}>
        <Text style={[styles.sectionHeaderText, { color: colors.primaryDark }]}>All Transactions — {monthName} {year}</Text>
      </View>

      {transactions.length === 0 ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: MUTED, fontSize: 9 }}>No transactions for this month.</Text>
        </View>
      ) : (
        <>
          {/* Table header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableHeaderText, { width: 45 }]}>Date</Text>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>Description</Text>
            <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>Category</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Account</Text>
            <Text style={[styles.tableHeaderText, { width: 70, textAlign: 'right' }]}>Amount</Text>
          </View>

          {weekKeys.map(wg => {
            const txs = groups[wg]
            return (
              <View key={wg}>
                {/* Week header */}
                <View style={styles.weekHeader}>
                  <Text style={styles.weekHeaderText}>
                    {weekGroupLabel(wg, year, month)} ({txs.length} {txs.length === 1 ? 'txn' : 'txns'})
                  </Text>
                </View>

                {txs.map((tx, i) => {
                  const rowIdx  = globalRowIdx++
                  const d       = new Date(tx.date)
                  const dateStr = MONTH_SHORT[d.getMonth()] + ' ' + d.getDate()
                  const desc    = (tx.description || tx.category || '').slice(0, 30)
                  const catName = tx.type === 'transfer' ? 'Transfer' : (tx.category || '—').slice(0, 20)
                  const acctName = (tx.account || tx.fromAccount || '—').slice(0, 18)

                  let amountColor = GRAY_TEXT
                  let amountPrefix = ''
                  if (tx.type === 'inflow')    { amountColor = GREEN; amountPrefix = '+' }
                  if (tx.type === 'expense')   { amountColor = RED;   amountPrefix = '-' }

                  const rowBg = rowIdx % 2 === 0 ? WHITE : '#fafafa'

                  return (
                    <View key={tx.id ?? i} style={[styles.tableRow, { backgroundColor: rowBg }]}>
                      <Text style={[styles.tableCell, { width: 45, color: GRAY_TEXT }]}>{dateStr}</Text>
                      <Text style={[styles.tableCell, { flex: 2 }]}>{desc || '—'}</Text>
                      <Text style={[styles.tableCell, { flex: 1.2, color: GRAY_TEXT }]}>{catName}</Text>
                      <Text style={[styles.tableCell, { flex: 1, color: GRAY_TEXT }]}>{acctName}</Text>
                      <Text style={[styles.tableCell, { width: 70, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: amountColor }]}>
                        {amountPrefix}{fmt(tx.amount ?? 0)}
                      </Text>
                    </View>
                  )
                })}
              </View>
            )
          })}
        </>
      )}

      <ReportFooter monthName={monthName} year={year} />
    </Page>
  )
}

// ── Main Document ──────────────────────────────────────────────────────────────

export default function MonthlyReport(props) {
  const {
    year,
    month,
    userName,
    summary,
    accounts,
    creditDetailMap,
    totalAssets,
    totalCreditUsed,
    totalCreditLimit,
    netWorth,
    categoryBreakdown,
    transactions,
    accentColor = '#2D9DFF',
  } = props

  const colors = computePdfColors(accentColor)

  return (
    <Document
      title={`Spendr Report — ${MONTH_NAMES[month - 1]} ${year}`}
      author="Spendr"
      subject="Monthly Financial Report"
    >
      <CoverPage
        year={year}
        month={month}
        userName={userName}
        summary={summary}
        accounts={accounts}
        creditDetailMap={creditDetailMap}
        totalAssets={totalAssets}
        totalCreditUsed={totalCreditUsed}
        totalCreditLimit={totalCreditLimit}
        netWorth={netWorth}
        colors={colors}
      />
      <SpendingPage
        year={year}
        month={month}
        summary={summary}
        categoryBreakdown={categoryBreakdown}
        colors={colors}
      />
      <TransactionsPage
        year={year}
        month={month}
        transactions={transactions}
        colors={colors}
      />
    </Document>
  )
}
