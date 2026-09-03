import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useSyncManager } from '../../components/SyncManager'
import { isSupabaseConfigured } from '../../lib/supabase'
import { downloadBackupJson } from '../../lib/backup'
import { syncToSheets } from '../../lib/sheetsSync'
import { setViewMode, getViewPreference } from '../useViewMode'
// Every heavy manager is the mobile sheet, reused — roughly 2,000 lines of
// category, budget, template, profile, restore and reset logic.
import {
  ProfileSheet, SheetsConfigSheet, ResetConfirmModal, RestoreBackupSheet,
  BudgetManagerSheet, CategoryManagerSheet, TemplateManagerSheet,
  PolicySheet, buildAndDownloadCSV, ACCENT_COLORS,
} from '../../pages/Settings'
import { WebPageHeader, WebPanel } from '../components/WebPanel'
import WebSelect from '../components/WebSelect'

/** The twelve months ending with the current one, newest first. */
function last12Months() {
  const out = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({
      value: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
    })
  }
  return out
}

const SECTIONS = [
  { key: 'general',    label: 'General' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'manage',     label: 'Manage' },
  { key: 'data',       label: 'Data & reports' },
  { key: 'sync',       label: 'Sync' },
  { key: 'about',      label: 'About' },
  { key: 'danger',     label: 'Danger zone' },
]

/** One settings line: label, description, and a control on the right. */
function Row({ label, hint, children, danger }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5
      border-b border-slate-100 dark:border-white/[0.05] last:border-0">
      <div className="min-w-0">
        <p className={`text-sm font-medium ${danger
          ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
          {label}
        </p>
        {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  )
}

/** A row whose control is too wide to sit on the right, so it goes below. */
function StackRow({ label, hint, children }) {
  return (
    <div className="py-3.5 border-b border-slate-100 dark:border-white/[0.05] last:border-0">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Btn({ children, onClick, tone = 'neutral', disabled, ariaLabel }) {
  const cls = {
    neutral: 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/[0.07]',
    primary: 'text-white bg-primary',
    danger:  'text-white bg-red-500',
  }[tone]
  return (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      className={`h-9 px-4 rounded-xl text-xs font-semibold whitespace-nowrap
        disabled:opacity-40 active:scale-95 transition-transform duration-100 ${cls}`}>
      {children}
    </button>
  )
}

function Toggle({ on, onChange, label }) {
  return (
    <button onClick={onChange} role="switch" aria-checked={on} aria-label={label}
      className={`inline-flex items-center shrink-0 w-11 h-6 rounded-full p-0.5
        transition-colors duration-200 ${on ? 'bg-primary' : 'bg-slate-200 dark:bg-white/25'}`}>
      <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200
        ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

export default function WebSettings() {
  const navigate = useNavigate()
  const [section, setSection] = useState('general')
  const { theme, toggleTheme, accentColor, setAccentColor } = useTheme()
  const { user, signOut, signInWithGoogle } = useAuth()
  const { showToast } = useToast()
  const { status, runSync } = useSyncManager()

  const [sheet, setSheet]   = useState(null)   // which reused sheet is open
  const [policy, setPolicy] = useState(null)
  const [busy, setBusy]     = useState(null)

  const nameMeta     = useLiveQuery(() => db.meta.get('displayName'),      [], null)
  const currencyMeta = useLiveQuery(() => db.meta.get('currency'),         [], null)
  const skipMeta     = useLiveQuery(() => db.meta.get('skipConfirm'),      [], null)
  const lastSyncMeta = useLiveQuery(() => db.meta.get('lastSync'),         [], null)
  const sheetsUrl    = useLiveQuery(() => db.meta.get('sheetsUrl'),        [], null)
  const sheetsSynced = useLiveQuery(() => db.meta.get('sheetsLastSynced'), [], null)
  const txCount      = useLiveQuery(() => db.transactions.count(),         [], undefined)
  const acctCount    = useLiveQuery(() => db.accounts.count(),             [], undefined)
  const catCount     = useLiveQuery(() => db.categories.count(),           [], undefined)

  const skipConfirm = skipMeta?.value ?? false
  const lastSync = lastSyncMeta?.value
    ? new Date(lastSyncMeta.value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Never'

  const viewPref = useMemo(() => getViewPreference(), [])
  const monthOpts = useMemo(last12Months, [])

  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${d.getMonth() + 1}`
  })

  const sheetsLastSync = sheetsSynced?.value
    ? new Date(sheetsSynced.value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
    : null

  // The PDF renderer and the month's aggregation are both heavy, so they load
  // on demand rather than riding in the Settings bundle.
  async function downloadReport() {
    setBusy('report')
    try {
      const [year, month] = reportMonth.split('-').map(Number)
      const { downloadMonthlyReport } = await import('../../utils/reportData.js')
      await downloadMonthlyReport(year, month, accentColor)
      showToast('Report downloaded')
    } catch (e) {
      console.error('[WebSettings] report failed:', e)
      showToast('Could not generate the report', 'error')
    } finally { setBusy(null) }
  }

  async function exportCsv() {
    setBusy('csv')
    try {
      const txs = await db.transactions.toArray()
      buildAndDownloadCSV(txs)
      showToast(`${txs.length} transactions exported`)
    } catch (e) {
      console.error('[WebSettings] csv export failed:', e)
      showToast('Export failed', 'error')
    } finally { setBusy(null) }
  }

  async function exportJson() {
    setBusy('json')
    try {
      const r = await downloadBackupJson()
      showToast(`Backup downloaded · ${r.transactions} transactions`)
    } catch (e) {
      console.error('[WebSettings] backup failed:', e)
      showToast('Backup failed', 'error')
    } finally { setBusy(null) }
  }

  async function pushSheets(url) {
    setBusy('sheets')
    try {
      const r = await syncToSheets(url)
      await db.meta.put({ key: 'sheetsLastSynced', value: new Date().toISOString() })
      showToast(`Pushed ${r.txCount} rows to Sheets`)
    } catch (e) {
      console.error('[WebSettings] sheets sync failed:', e)
      showToast('Sheets sync failed', 'error')
    } finally { setBusy(null) }
  }

  async function toggleSkip() {
    try {
      await db.meta.put({ key: 'skipConfirm', value: !skipConfirm })
    } catch (e) {
      console.error('[WebSettings] preference failed:', e)
      showToast('Could not save preference', 'error')
    }
  }

  return (
    <>
      <WebPageHeader
        title="Settings"
        subtitle={`${nameMeta?.value || 'Spendr user'} · ${currencyMeta?.value || 'PHP'}`}
      />

      <div className="flex gap-6 items-start min-w-0">
        {/* Section nav — replaces a phone's long single scroll */}
        <nav className="w-[200px] shrink-0 flex flex-col gap-0.5 sticky top-8">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={[
                'text-left px-3 h-9 rounded-xl text-sm font-medium transition-colors duration-150',
                section === s.key
                  ? 'bg-primary/[0.12] text-primary dark:bg-primary/[0.18]'
                  : s.key === 'danger'
                    ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/[0.08]'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.05]',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 max-w-[760px]">
          {section === 'general' && (
            <WebPanel title="General">
              <Row label="Profile" hint={`${nameMeta?.value || 'Not set'} · ${currencyMeta?.value || 'PHP'}`}>
                <Btn onClick={() => setSheet('profile')}>Edit profile</Btn>
              </Row>
              <Row label="Skip confirmation" hint="Save transactions instantly, without a review step">
                <Toggle on={skipConfirm} onChange={toggleSkip} label="Skip confirmation" />
              </Row>
              <Row label="Layout" hint={`Currently desktop · preference: ${viewPref}`}>
                <Btn onClick={() => setViewMode('mobile')}>Switch to mobile</Btn>
                {viewPref !== 'auto' && <Btn onClick={() => setViewMode('auto')}>Use auto</Btn>}
              </Row>
            </WebPanel>
          )}

          {section === 'appearance' && (
            <WebPanel title="Appearance">
              <Row label="Theme" hint={theme === 'dark' ? 'Dark' : 'Light'}>
                <Toggle on={theme === 'light'} onChange={toggleTheme} label="Light mode" />
              </Row>
              {/* On a phone the eight accents live behind a sheet because there
                  is nowhere else to put them. Here they all fit, so choosing
                  one is a single click and the result shows immediately in the
                  sidebar and the cards around it. */}
              <StackRow
                label="Accent colour"
                hint={ACCENT_COLORS.find(c => c.hex === accentColor)?.name ?? accentColor}
              >
                <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-2">
                  {ACCENT_COLORS.map(({ hex, name }) => {
                    const on = hex === accentColor
                    return (
                      <button
                        key={hex}
                        role="radio"
                        aria-checked={on}
                        aria-label={name}
                        onClick={() => setAccentColor(hex)}
                        className={[
                          'flex items-center gap-2 h-9 pl-2 pr-3 rounded-xl text-xs font-semibold',
                          'border transition-colors duration-150',
                          on
                            ? 'border-primary text-primary bg-primary/[0.08] dark:bg-primary/[0.14]'
                            : 'border-slate-200 dark:border-white/[0.09] text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/[0.18]',
                        ].join(' ')}
                      >
                        <span className="w-5 h-5 rounded-lg shrink-0 border border-black/10 dark:border-white/20"
                          style={{ background: hex }} />
                        {name}
                      </button>
                    )
                  })}
                </div>
              </StackRow>
            </WebPanel>
          )}

          {section === 'manage' && (
            <WebPanel title="Manage">
              <Row label="Categories" hint={`${catCount ?? '—'} categories`}>
                <Btn ariaLabel="Open the category manager"
                  onClick={() => setSheet('categories')}>Open manager</Btn>
              </Row>
              <Row label="Monthly budgets" hint="Per-category spending limits">
                <Btn ariaLabel="Open the budget manager"
                  onClick={() => setSheet('budgets')}>Open manager</Btn>
              </Row>
              <Row label="Quick templates" hint="One-tap repeat transactions">
                <Btn ariaLabel="Open the template manager"
                  onClick={() => setSheet('templates')}>Open manager</Btn>
              </Row>
              <Row label="Accounts" hint={`${acctCount ?? '—'} accounts`}>
                <Btn onClick={() => navigate('/accounts')}>Go to accounts</Btn>
              </Row>
            </WebPanel>
          )}

          {section === 'data' && (
            <WebPanel title="Data & reports">
              <Row label="Export transactions (CSV)" hint={`${txCount ?? '—'} transactions · re-importable`}>
                <Btn onClick={exportCsv} disabled={busy === 'csv'}>
                  {busy === 'csv' ? 'Preparing…' : 'Download CSV'}
                </Btn>
              </Row>
              <Row label="Full backup (JSON)" hint="Accounts, categories, transactions, debts, recurring, templates">
                <Btn onClick={exportJson} disabled={busy === 'json'}>
                  {busy === 'json' ? 'Preparing…' : 'Download backup'}
                </Btn>
              </Row>
              <Row label="Restore from backup" hint="Replaces this device's data with a backup file" danger>
                <Btn tone="neutral" onClick={() => setSheet('restore')}>Restore…</Btn>
              </Row>
              <Row label="Import CSV" hint="Spendr export or the newer column format">
                <Btn onClick={() => navigate('/import')}>Open importer</Btn>
              </Row>
              <StackRow
                label="Monthly PDF report"
                hint="Spending by category, income, account balances and the month's transactions"
              >
                <div className="flex items-center gap-2">
                  <WebSelect
                    value={reportMonth}
                    onChange={setReportMonth}
                    options={monthOpts}
                    ariaLabel="Report month"
                    minWidth={190}
                  />
                  <Btn tone="primary" onClick={downloadReport} disabled={busy === 'report'}>
                    {busy === 'report' ? 'Generating…' : 'Download PDF'}
                  </Btn>
                </div>
              </StackRow>
            </WebPanel>
          )}

          {section === 'sync' && (
            <div className="flex flex-col gap-6">
              <WebPanel title="Cloud sync">
                {!isSupabaseConfigured ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400 py-2">
                    Not configured on this device — VITE_SUPABASE_URL and
                    VITE_SUPABASE_ANON_KEY are unset, so Spendr is running offline-only
                    against local storage. Everything else works.
                  </p>
                ) : (
                  <>
                    <Row label="Account" hint={user?.email ?? 'Not signed in'}>
                      {user
                        ? <Btn onClick={() => signOut()}>Sign out</Btn>
                        : <Btn tone="primary" onClick={() => signInWithGoogle()}>Sign in with Google</Btn>}
                    </Row>
                    <Row label="Last sync" hint={lastSync}>
                      <Btn onClick={() => runSync()} disabled={status === 'syncing' || !user}>
                        {status === 'syncing' ? 'Syncing…' : 'Sync now'}
                      </Btn>
                    </Row>
                  </>
                )}
              </WebPanel>

              <WebPanel title="Google Sheets">
                <Row label="Apps Script endpoint"
                  hint={sheetsUrl?.value
                    ? (sheetsLastSync ? `Configured · last pushed ${sheetsLastSync}` : 'Configured · never pushed')
                    : 'Not configured'}>
                  <Btn onClick={() => setSheet('sheets')}>Configure</Btn>
                </Row>
              </WebPanel>
            </div>
          )}

          {section === 'about' && (
            <WebPanel title="About">
              <Row label="Spendr" hint="Offline-first personal finance, built for the Philippines" />
              <Row label="Stored locally" hint={`${txCount ?? '—'} transactions · ${acctCount ?? '—'} accounts · ${catCount ?? '—'} categories`} />
              <Row label="Privacy policy">
                <Btn ariaLabel="Read the privacy policy"
                  onClick={() => setPolicy('privacy')}>Read</Btn>
              </Row>
              <Row label="Terms of use">
                <Btn ariaLabel="Read the terms of use"
                  onClick={() => setPolicy('terms')}>Read</Btn>
              </Row>
            </WebPanel>
          )}

          {section === 'danger' && (
            <WebPanel title="Danger zone">
              <Row label="Reset app" danger
                hint="Permanently deletes every transaction, account, category, debt and recurring payment on this device">
                <Btn tone="danger" onClick={() => setSheet('reset')}>Reset…</Btn>
              </Row>
              <p className="text-xs text-slate-500 dark:text-slate-400 pt-3">
                If you're signed in, your cloud copy is separate — resetting here does not
                delete it, and signing back in re-downloads it. Export a backup first if
                you want a local copy.
              </p>
            </WebPanel>
          )}
        </div>
      </div>

      {/* Reused sheets. The web stylesheet renders these centred rather than
          as bottom sheets — see index.css, html.web overrides. */}
      <ProfileSheet open={sheet === 'profile'} onClose={() => setSheet(null)}
        displayName={nameMeta?.value ?? ''} currency={currencyMeta?.value ?? 'PHP'} />
      <CategoryManagerSheet open={sheet === 'categories'} onClose={() => setSheet(null)} />
      <BudgetManagerSheet   open={sheet === 'budgets'}    onClose={() => setSheet(null)} />
      <TemplateManagerSheet open={sheet === 'templates'}  onClose={() => setSheet(null)} />
      <RestoreBackupSheet   open={sheet === 'restore'}    onClose={() => setSheet(null)} />
      <ResetConfirmModal    open={sheet === 'reset'}      onClose={() => setSheet(null)} />
      <SheetsConfigSheet    open={sheet === 'sheets'}     onClose={() => setSheet(null)}
        onSync={pushSheets} syncing={busy === 'sheets'} />
      <PolicySheet open={!!policy} type={policy} onClose={() => setPolicy(null)} />
    </>
  )
}
