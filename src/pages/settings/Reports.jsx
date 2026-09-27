import { useState } from 'react'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useTheme } from '../../context/ThemeContext'
import { useToast } from '../../context/ToastContext'
import SubPage from '../../components/SubPage'
import Button from '../../components/ui/Button'
import IconButton from '../../components/ui/IconButton'
import Sheet from '../../components/ui/Sheet'
import {
  IconDownload, IconReport, RowChevron, RowIcon, SectionCard, SectionHeader, SettingsRow, buildAndDownloadCSV,
} from './shared'

/** The twelve months ending with this one, newest first. */
function lastTwelveMonths() {
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
  })
}

/**
 * Reports & exports: the monthly PDF, and every transaction as a CSV.
 *
 * Both were on Settings' first screen - the report as the only row with a
 * month picker and a button in it - for things done a few times a year. Here
 * they have room to say what they are, one tap in.
 */
export default function ReportsPage() {
  const { accentColor, theme } = useTheme()
  const { showToast } = useToast()
  const txCount = useLiveQuery(() => db.transactions.count(), [], 0)
  const [months] = useState(lastTwelveMonths)
  const [pick, setPick] = useState(() => `${months[0].year}-${months[0].month}`)
  const [making, setMaking] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function makeReport() {
    if (making) return
    setMaking(true)
    try {
      const [year, month] = pick.split('-').map(Number)
      const { downloadMonthlyReport } = await import('../../utils/reportData.js')
      const { how, again } = await downloadMonthlyReport(year, month, accentColor)
      /* On an iPhone the file goes to the share sheet, and dismissing it is a
         decision rather than a failure; 'blocked' is the iPhone refusing a
         share sheet the render made late, and the toast's button is the
         fresh tap it needs. */
      if (how === 'shared') showToast('Report ready to save')
      else if (how === 'downloaded') showToast('Report downloaded')
      else if (how === 'blocked') showToast('Your report is ready', 'success', { actionLabel: 'Save', onAction: () => { again() } })
    } catch (e) {
      console.error(e)
      const why = /** @type {any} */ (e)?.message
      showToast(why ? `Report failed: ${why}` : 'Failed to generate report', 'error')
    } finally {
      setMaking(false)
    }
  }

  async function exportCsv() {
    if (exporting) return
    setExporting(true)
    try {
      const txs = await db.transactions.toArray()
      buildAndDownloadCSV(txs)
      showToast(`${txs.length} transaction${txs.length !== 1 ? 's' : ''} exported`)
    } catch (e) {
      console.error('[Reports] export failed:', e)
      showToast('Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <SubPage title="Reports & exports">
      <div className="mt-2 mb-8">
        <SectionHeader>Monthly report</SectionHeader>
        <SectionCard>
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-4">
              <RowIcon color="blue"><IconReport /></RowIcon>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">A month as a PDF</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Spending, income and every transaction</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 pl-[52px]">
              <select
                value={pick}
                onChange={e => setPick(e.target.value)}
                aria-label="Month"
                className="flex-1 min-w-0 text-sm bg-white dark:bg-primary/[0.07] border border-slate-200/80 dark:border-primary/[0.14] rounded-xl px-3 h-10 outline-none"
                style={{ colorScheme: theme === 'dark' ? 'dark' : 'light' }}
              >
                {months.map(m => <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>)}
              </select>
              <IconButton label="Download monthly report" variant="primary" size="lg" onClick={makeReport} disabled={making}>
                {making
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <IconDownload />}
              </IconButton>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="mb-8">
        <SectionHeader>Export</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="green"><IconDownload /></RowIcon>}
            label="Transactions as CSV"
            sublabel={exporting ? 'Preparing download…' : `${txCount ?? 0} transactions · opens in any spreadsheet`}
            right={exporting ? <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <RowChevron />}
            onTap={() => setConfirm(true)}
            disabled={exporting}
          />
        </SectionCard>
      </div>

      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        z={300}
        scrim={60}
        handle={false}
        ariaLabel="Export transactions"
        footer={(
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button size="sm" className="flex-1" onClick={() => { setConfirm(false); exportCsv() }}>Download</Button>
          </div>
        )}
      >
        <div className="pt-6 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto text-emerald-600 dark:text-white">
            <IconDownload />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Export transactions?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This downloads all {txCount ?? 0} transactions as a CSV file.
            </p>
          </div>
        </div>
      </Sheet>
    </SubPage>
  )
}
