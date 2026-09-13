import { useState, useMemo } from 'react'

import { useNavigate } from 'react-router-dom'

import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useSyncManager } from '../components/SyncManager'

import db, {} from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'

import { syncToSheets } from '../lib/sheetsSync'
import {
  IconChevronRight, IconUpload, IconTemplate, 
  IconInfo, IconAward,
} from '../components/icons'

import { BADGES as BADGE_LIST } from '../lib/badges'

import { setViewMode, getViewPreference } from '../web/useViewMode'
import Button from '../components/ui/Button'
import Sheet from '../components/ui/Sheet'

import SectionLabel from '../components/ui/SectionLabel'

import IconButton from '../components/ui/IconButton'

/* Everything below used to live in this file. It moved to ./settings/shared so
   the feature modules extracted alongside it could share one SettingsRow
   rather than each growing its own. Re-exported at the bottom, because
   web/pages/WebSettings.jsx imports ACCENT_COLORS and buildAndDownloadCSV from
   here and there is no reason to make it care where they went. */
import {
  APP_VERSION, ACCENT_COLORS,
  fmtRelTime, buildAndDownloadCSV,
  IconSun, IconMoon, IconPalette, IconTag, IconDownload, IconTrash,
  IconSheets, IconCloud, IconFileText, IconTarget,
  SectionHeader, RowDivider, SectionCard, RowIcon, SettingsRow, 
} from './settings/shared'
import { TemplateManagerSheet, TemplatesPage } from './settings/Templates'
import { CategoryManagerSheet, CategoriesPage } from './settings/Categories'
import { BudgetManagerSheet, BudgetsPage } from './settings/Budgets'
import { RestoreBackupSheet, ResetConfirmModal } from './settings/Backup'
import { SheetsConfigSheet, ProfileSheet } from './settings/Profile'
import { PolicySheet } from './settings/Policy'

// ── Toggle switch ──────────────────────────────────────────────────────────────

function ToggleSwitch({ on }) {
  return (
    <span className={`inline-flex items-center shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors duration-200 ${on ? 'bg-primary' : 'bg-slate-200 dark:bg-white/25'}`}>
      <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </span>
  )
}

// ── Main Settings page ─────────────────────────────────────────────────────────

export default function Settings() {
  const navigate               = useNavigate()
  const { theme, toggleTheme, accentColor } = useTheme()
  const { showToast }          = useToast()
  const [restoreOpen, setRestoreOpen] = useState(false)
  const { user, signOut }      = useAuth()
  const { status: syncStatus, runSync } = useSyncManager()

  const [profileOpen,  setProfileOpen]  = useState(false)
  const [resetOpen,    setResetOpen]    = useState(false)
  const [policyOpen,   setPolicyOpen]   = useState(null)
  const [legalOpen,    setLegalOpen]    = useState(false)
  const [exporting,          setExporting]          = useState(false)
  const [backingUp,          setBackingUp]          = useState(false)
  const [showExportConfirm,  setShowExportConfirm]  = useState(false)
  const [showBackupConfirm,  setShowBackupConfirm]  = useState(false)
  const [sheetsOpen,   setSheetsOpen]   = useState(false)
  const [syncing,      setSyncing]      = useState(false)
  const [loggingOut,        setLoggingOut]        = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  const meta        = useLiveQuery(() => db.meta.toArray(), [], [])
  const displayName = useMemo(() => (meta ?? []).find(m => m.key === 'displayName')?.value ?? '', [meta])
  const currency    = useMemo(() => (meta ?? []).find(m => m.key === 'currency')?.value ?? 'PHP',  [meta])
  const lastSync       = useMemo(() => (meta ?? []).find(m => m.key === 'lastSync')?.value       ?? null,  [meta])
  const skipConfirm    = useMemo(() => (meta ?? []).find(m => m.key === 'skipConfirm')?.value    ?? false, [meta])
  const sheetsUrl      = useMemo(() => (meta ?? []).find(m => m.key === 'sheetsUrl')?.value      ?? null,  [meta])
  const sheetsLastSync = useMemo(() => (meta ?? []).find(m => m.key === 'sheetsLastSynced')?.value ?? null, [meta])

  const txCount     = useLiveQuery(() => db.transactions.count(), [], 0)

  /* Counted from the stored rows rather than by running the full evaluation
     here. useBadges reads seven tables and awards as a side effect of doing
     so; Settings needs one number for a sublabel and has no business paying
     for that. The dashboard mounts BadgeChip on every launch, so the table is
     current by the time anyone reaches this row. */
  const badgeCount = useLiveQuery(() => db.badges.count(), [], null)
  const badgeSub = badgeCount === null ? undefined : `${badgeCount} of ${BADGE_LIST.length} earned`

  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
  const [generatingReport, setGeneratingReport] = useState(false)

  function getLast12Months() {
    const result = []
    const now = new Date()
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      result.push({
        year:  d.getFullYear(),
        month: d.getMonth() + 1,
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      })
    }
    return result
  }

  async function handleGenerateReport() {
    setGeneratingReport(true)
    try {
      const { downloadMonthlyReport } = await import('../utils/reportData.js')
      await downloadMonthlyReport(reportMonth.year, reportMonth.month, accentColor)
      showToast('Report downloaded')
    } catch (e) {
      console.error(e)
      showToast('Failed to generate report', 'error')
    } finally {
      setGeneratingReport(false)
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await signOut()
      // Stay in the app — it works offline without auth
      setLoggingOut(false)
    } catch (e) {
      console.error('[Settings] logout failed:', e)
      showToast('Sign-out failed', 'error')
      setLoggingOut(false)
    }
  }

  async function handleSheetsSync(url) {
    if (syncing) return
    setSyncing(true)
    try {
      const { txCount, accountCount } = await syncToSheets(url)
      await db.meta.put({ key: 'sheetsLastSynced', value: new Date().toISOString() })
      showToast(`Synced ${txCount} transactions & ${accountCount} accounts to Google Sheets`, 'success')
    } catch (e) {
      showToast('Sync failed: ' + e.message, 'error')
    } finally {
      setSyncing(false)
    }
  }

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const txs = await db.transactions.toArray()
      buildAndDownloadCSV(txs)
      showToast(`${txs.length} transaction${txs.length !== 1 ? 's' : ''} exported`)
    } catch (e) {
      console.error('[Settings] export failed:', e)
      showToast('Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  async function handleFullBackup() {
    if (backingUp) return
    setBackingUp(true)
    try {
      const [transactions, accounts, categories, templates, recurring, debts] = await Promise.all([
        db.transactions.toArray(),
        db.accounts.toArray(),
        db.categories.toArray(),
        db.templates.toArray(),
        db.recurring.toArray(),
        db.debts.toArray(),
      ])
      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        transactions, accounts, categories, templates, recurring, debts,
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `spendr-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('Full backup downloaded')
    } catch (e) {
      console.error('[Settings] backup failed:', e)
      showToast('Backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  // Avatar letter
  const avatarLetter = (displayName || 'S').charAt(0).toUpperCase()

  return (
    <div className="pb-10">

      {/* ── Header ── */}
      <div className="px-5 pt-safe-header pb-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Settings</h1>
      </div>

      {/* ── Profile card ── */}
      <div className="px-5 pt-4 pb-6">
        <button
          onClick={() => setProfileOpen(true)}
          className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left
            bg-white dark:bg-primary/[0.10]
            border border-slate-100 dark:border-primary/[0.22]
            shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.15),0_0_0_1px_rgba(var(--color-primary-rgb),0.06)]
            active:scale-[0.99] transition-transform duration-100"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-2xl font-semibold text-primary">{avatarLetter}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-slate-900 dark:text-white truncate">
              {displayName || user?.email?.split('@')[0] || 'Your Name'}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-11 font-semibold px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 accent-ink">
                {currency}
              </span>
              {user?.email && (
                <span className="text-11 text-slate-400 dark:text-slate-500 truncate max-w-[160px]">
                  {user.email}
                </span>
              )}
            </div>
          </div>
          <span className="text-slate-300 dark:text-slate-600 shrink-0">
            <IconChevronRight size={14} strokeWidth="2" />
          </span>
        </button>
      </div>

      {/* ══ 1. APPEARANCE ══ */}
      <div className="mb-8">
        <SectionHeader>Appearance</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="slate">{theme === 'dark' ? <IconSun /> : <IconMoon />}</RowIcon>}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            sublabel={`Currently ${theme}`}
            right={<ToggleSwitch on={theme === 'dark'} />}
            onTap={toggleTheme}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="violet"><IconPalette /></RowIcon>}
            label="Accent colour"
            sublabel={ACCENT_COLORS.find(c => c.hex === accentColor)?.name ?? 'Custom'}
            right={
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
                <IconChevronRight size={14} strokeWidth="2" />
              </div>
            }
            onTap={() => navigate('/settings/accent')}
          />
        </SectionCard>
      </div>

      {/* ══ 3. PREFERENCES ══ */}
      <div className="mb-8">
        <SectionHeader>Preferences</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={
              <RowIcon color="green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </RowIcon>
            }
            label="Skip confirmation"
            sublabel="Save instantly, no review step"
            right={<ToggleSwitch on={skipConfirm} />}
            onTap={() => db.meta.put({
              key: 'skipConfirm', value: !skipConfirm, updatedAt: new Date().toISOString(),
            })}
          />
          <RowDivider />
          {/* Without this, choosing "switch to mobile" in the desktop sidebar
              was a one-way door: the preference is stored per-device in
              localStorage, and nothing in this UI could clear it. */}
          <SettingsRow
            iconEl={
              <RowIcon color="blue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="13" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </RowIcon>
            }
            label="Desktop layout"
            sublabel={
              getViewPreference() === 'mobile'
                ? 'Forced to mobile on this device — tap to allow desktop'
                : 'Wide screens use the desktop layout automatically'
            }
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setViewMode(getViewPreference() === 'mobile' ? 'auto' : 'desktop')}
          />
        </SectionCard>
      </div>

      {/* ══ 4. MANAGE ══ */}
      <div className="mb-8">
        <SectionHeader>Manage</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="amber"><IconTag /></RowIcon>}
            label="Categories"
            /* No sublabel: "Categories" is the whole of it. */
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => navigate('/settings/categories')}
          />
          <RowDivider />
          {/* Straight to the Budget page, which is where the month's budget
              lives. This row used to open a SECOND screen about budgets - the
              limit editor - so the app had two budget destinations that did
              not know about each other: one with the gauge, reached from the
              dashboard card, and one with the limits, reached from here.

              Now there is one destination and the editor hangs off it, behind
              "Edit limits". /settings/budgets is still a route - that is where
              the button goes, and the desktop settings still opens the same
              manager as a modal. */}
          <SettingsRow
            iconEl={<RowIcon color="green"><IconTarget /></RowIcon>}
            label="Budget"
            sublabel="This month, and the limits behind it"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => navigate('/budget')}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="amber"><IconTemplate size={16} /></RowIcon>}
            label="Quick templates"
            sublabel="One-tap repeat transactions"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => navigate('/settings/templates')}
          />
          <RowDivider />
          {/* Also reachable from the dashboard header, which is where anyone
              actually looking for it will go. This row is for the person who
              opened Settings to see what the app has in it. */}
          <SettingsRow
            iconEl={<RowIcon color="violet"><IconAward /></RowIcon>}
            label="Badges"
            sublabel={badgeSub}
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => navigate('/badges')}
          />
        </SectionCard>
      </div>

      {/* ══ 5. DATA & REPORTS ══ */}
      <div className="mb-8">
        <SectionHeader>Data & Reports</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="green"><IconDownload /></RowIcon>}
            label="Export transactions (CSV)"
            sublabel={exporting ? 'Preparing download…' : `${txCount ?? 0} transactions`}
            right={
              exporting
                ? <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                : <IconChevronRight size={14} strokeWidth="2" />
            }
            onTap={() => setShowExportConfirm(true)}
            disabled={exporting}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="teal"><IconDownload /></RowIcon>}
            label="Full backup (JSON)"
            sublabel={backingUp ? 'Preparing download…' : 'Accounts, categories, transactions & more'}
            right={
              backingUp
                ? <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                : <IconChevronRight size={14} strokeWidth="2" />
            }
            onTap={() => setShowBackupConfirm(true)}
            disabled={backingUp}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="amber"><IconUpload /></RowIcon>}
            label="Restore backup (JSON)"
            sublabel="Replace this device's data with a backup file"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setRestoreOpen(true)}
          />
          <RowDivider />
          {/* PDF Report inline */}
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-4 mb-2.5">
              <RowIcon color="blue"><IconFileText /></RowIcon>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Monthly PDF Report</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Full summary: spending, income, transactions</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-[52px]">
              <select
                value={`${reportMonth.year}-${reportMonth.month}`}
                onChange={e => {
                  const [y, m] = e.target.value.split('-').map(Number)
                  setReportMonth({ year: y, month: m })
                }}
                className="flex-1 text-sm bg-white dark:bg-primary/[0.07] border border-slate-200/80 dark:border-primary/[0.14] rounded-xl px-3 h-10 outline-none"
                style={{ colorScheme: theme === 'dark' ? 'dark' : 'light' }}
              >
                {getLast12Months().map(({ year, month, label }) => (
                  <option key={`${year}-${month}`} value={`${year}-${month}`}>{label}</option>
                ))}
              </select>
              <IconButton
                label="Download monthly report"
                variant="primary"
                size="lg"
                onClick={handleGenerateReport} disabled={generatingReport}
              >
                {generatingReport
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <IconDownload />}
              </IconButton>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ══ 6. SYNC ══ */}
      <div className="mb-8">
        <SectionHeader>Sync</SectionHeader>
        <SectionCard>
          {user ? (
            <div className="flex items-center gap-4 px-4 py-3.5">
              <RowIcon color="violet">
                <span className={syncStatus === 'syncing' ? 'animate-spin inline-block' : ''}>
                  <IconCloud />
                </span>
              </RowIcon>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Cloud sync</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                  {syncStatus === 'syncing' ? 'Syncing…'
                    : syncStatus === 'error' ? 'Last sync failed'
                    : `Last synced: ${fmtRelTime(lastSync)}`}
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className={`w-2 h-2 rounded-full ${
                  syncStatus === 'syncing' ? 'bg-primary animate-pulse'
                  : syncStatus === 'error' ? 'bg-red-400'
                  : lastSync               ? 'bg-emerald-400'
                  :                          'bg-slate-300 dark:bg-slate-600'
                }`} />
                <button
                  onClick={runSync}
                  disabled={syncStatus === 'syncing'}
                  className="text-xs font-semibold text-primary px-3 py-1.5 rounded-xl
                    bg-primary/[0.08] dark:bg-primary/[0.12]
                    disabled:opacity-40 active:bg-primary/[0.15] transition-colors"
                >
                  Sync
                </button>
              </div>
            </div>
          ) : (
            <SettingsRow
              iconEl={<RowIcon color="violet"><IconCloud /></RowIcon>}
              label="Enable cloud sync"
              sublabel="Sign in with Google to sync across devices"
              right={<IconChevronRight size={14} strokeWidth="2" />}
              onTap={() => navigate('/login')}
            />
          )}
          {user?.email === 'sablayjames@gmail.com' && (<>
            <RowDivider />
            <div className="flex items-center gap-4 px-4 py-3.5">
              <RowIcon color="green">
                <span className={syncing ? 'animate-spin inline-block' : ''}><IconSheets /></span>
              </RowIcon>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Google Sheets</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                  {syncing        ? 'Syncing…'
                  : sheetsLastSync ? `Last synced: ${fmtRelTime(sheetsLastSync)}`
                  : sheetsUrl      ? 'Ready to sync'
                  :                  'Tap Set up to configure'}
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className={`w-2 h-2 rounded-full ${
                  syncing          ? 'bg-primary animate-pulse'
                  : sheetsLastSync ? 'bg-emerald-400'
                  :                  'bg-slate-300 dark:bg-slate-600'
                }`} />
                <button
                  onClick={() => sheetsUrl ? handleSheetsSync(sheetsUrl) : setSheetsOpen(true)}
                  disabled={syncing}
                  className="text-xs font-semibold text-primary px-3 py-1.5 rounded-xl
                    bg-primary/[0.08] dark:bg-primary/[0.12]
                    disabled:opacity-40 active:bg-primary/[0.15] transition-colors"
                >
                  {sheetsUrl ? 'Sync' : 'Set up'}
                </button>
              </div>
            </div>
          </>)}
        </SectionCard>
      </div>

      {/* ══ 7. ACCOUNT (sign-out) ══ */}
      {user && (
        <div className="mb-8">
          <SectionHeader>Account</SectionHeader>
          <SectionCard>
            <SettingsRow
              iconEl={<RowIcon color="red"><IconTrash /></RowIcon>}
              label={loggingOut ? 'Signing out…' : 'Sign Out'}
              sublabel={user.email ?? ''}
              right={loggingOut
                ? <span className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                : <IconChevronRight size={14} strokeWidth="2" />
              }
              onTap={() => setShowSignOutConfirm(true)}
              destructive
              disabled={loggingOut}
            />
          </SectionCard>
        </div>
      )}

      {/* Sign-out confirmation dialog */}
      {/* Was a hand-rolled centred card. It stays centred on desktop - that is
          what `html.web .sheet-panel` does to every sheet - so the geometry is
          the primitive's now, and only the z-index, the scrim depth and the
          not-while-signing-out guard carry across by hand.

          Rendered unconditionally rather than behind `showSignOutConfirm &&`:
          the flag going false is what starts the exit, and a parent that
          unmounts on that same render never lets the animation play. */}
      <Sheet
        open={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        z={300}
        scrim={60}
        /* It had no grab handle as a centred card, and gains none here. */
        handle={false}
        /* The scrim already refused taps while the sign-out was in flight, the
           same way both buttons are disabled; Escape now refuses too. */
        dismissible={!loggingOut}
        /* The heading stays in the body, centred under the icon, so the dialog
           is named here rather than through Sheet's title slot. */
        ariaLabel="Sign out"
        footer={(
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setShowSignOutConfirm(false)} disabled={loggingOut}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={async () => { await handleLogout(); setShowSignOutConfirm(false) }} disabled={loggingOut}
            >
              {loggingOut ? 'Signing out…' : 'Continue'}
            </Button>
          </div>
        )}
      >
        {/* pt-6 for the old card's p-6 top edge: with no handle and no title
            there is nothing above the icon to hold it off the panel edge. */}
        <div className="pt-6 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-500/15
            flex items-center justify-center mx-auto text-red-500 dark:text-red-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Sign out?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your data stays on this device. You can sign back in anytime to sync again.
            </p>
          </div>
        </div>
      </Sheet>

      {/* Export CSV confirm

          Rendered unconditionally, like the sign-out confirm above: the flag
          going false is what starts the exit, and a parent that unmounts on
          that same render never lets the animation play. */}
      <Sheet
        open={showExportConfirm}
        onClose={() => setShowExportConfirm(false)}
        z={300}
        scrim={60}
        /* It had no grab handle as a centred card, and gains none here. */
        handle={false}
        /* The heading stays in the body, centred under the icon, so the
           dialog is named here rather than through Sheet's title slot. */
        ariaLabel="Export transactions"
        footer={(
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setShowExportConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => { setShowExportConfirm(false); handleExport() }}
            >
              Download
            </Button>
          </div>
        )}
      >
        {/* pt-6 for the old card's p-6 top edge: with no handle and no title
            there is nothing above the icon to hold it off the panel edge. */}
        <div className="pt-6 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-500/15
            flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
            <IconDownload />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Export transactions?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This will download all {txCount ?? 0} transactions as a CSV file.
            </p>
          </div>
        </div>
      </Sheet>

      {/* Full Backup confirm

          Rendered unconditionally, like the sign-out confirm above: the flag
          going false is what starts the exit, and a parent that unmounts on
          that same render never lets the animation play. */}
      <Sheet
        open={showBackupConfirm}
        onClose={() => setShowBackupConfirm(false)}
        z={300}
        scrim={60}
        /* It had no grab handle as a centred card, and gains none here. */
        handle={false}
        /* The heading stays in the body, centred under the icon, so the
           dialog is named here rather than through Sheet's title slot. */
        ariaLabel="Download full backup"
        footer={(
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setShowBackupConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => { setShowBackupConfirm(false); handleFullBackup() }}
            >
              Download
            </Button>
          </div>
        )}
      >
        {/* pt-6 for the old card's p-6 top edge: with no handle and no title
            there is nothing above the icon to hold it off the panel edge. */}
        <div className="pt-6 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-100 dark:bg-teal-500/15
            flex items-center justify-center mx-auto text-teal-600 dark:text-teal-400">
            <IconDownload />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Download full backup?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Exports all accounts, categories, transactions, templates, recurring, and debts as a JSON file.
            </p>
          </div>
        </div>
      </Sheet>

      {/* ══ 8. DANGER ZONE ══ */}
      <div className="mb-8">
        <SectionHeader>Danger zone</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="red"><IconTrash /></RowIcon>}
            label="Reset app"
            sublabel="Permanently delete all local data"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setResetOpen(true)}
            destructive
          />
        </SectionCard>
      </div>

      {/* ══ 9. LEGAL ══ */}
      <div className="mb-10">
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="slate"><IconFileText /></RowIcon>}
            label="Legal"
            sublabel="Privacy policy & terms of use"
            right={<IconChevronRight size={14} strokeWidth="2" />}
            onTap={() => setLegalOpen(true)}
          />
        </SectionCard>
      </div>

      {/* Legal picker sheet.

          ariaLabel rather than title: this panel's heading is a small caption,
          not Sheet's 17px title, and promoting it would make the quietest
          sheet in the app shout. */}
      <Sheet
        open={legalOpen}
        onClose={() => setLegalOpen(false)}
        z={100}
        scrim={45}
        ariaLabel="Legal"
      >
        <div className="pb-1">
          <SectionLabel inset="none" gap="loose">Legal</SectionLabel>
          <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setLegalOpen(false); setTimeout(() => setPolicyOpen('privacy'), 60) }}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left
                    bg-slate-50 dark:bg-white/[0.04]
                    active:bg-slate-100 dark:active:bg-white/[0.08] transition-colors"
                >
                  <RowIcon color="slate"><IconFileText /></RowIcon>
                  <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-white">Privacy policy</span>
                  <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
                </button>
                <button
                  onClick={() => { setLegalOpen(false); setTimeout(() => setPolicyOpen('terms'), 60) }}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left
                    bg-slate-50 dark:bg-white/[0.04]
                    active:bg-slate-100 dark:active:bg-white/[0.08] transition-colors"
                >
                  <RowIcon color="slate"><IconInfo /></RowIcon>
            <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-white">Terms of use</span>
            <span className="text-slate-300 dark:text-slate-600"><IconChevronRight size={14} strokeWidth="2" /></span>
          </button>
          </div>
        </div>
      </Sheet>

      {/* ══ Spendr footer (no card) ══ */}
      <div className="px-5 pb-8 flex flex-col items-center gap-3 text-center">
        <img
          src="/icons/icon-512.png"
          alt="Spendr"
          className="w-14 h-14 rounded-[20px] shadow-[0_4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)]"
        />
        <p className="text-base font-bold text-slate-800 dark:text-white tracking-tight">Spendr</p>
        <p className="text-11 text-slate-400 dark:text-slate-500 leading-relaxed max-w-[260px]">
          Spendr is an independent tool and is not affiliated with any financial institutions mentioned within the app.
        </p>
        <p className="text-11 text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} James Sablay · v{APP_VERSION}
        </p>
      </div>

      {/* ── Sheets & modals ── */}
      <SheetsConfigSheet
        open={sheetsOpen}
        onClose={() => setSheetsOpen(false)}
        onSync={handleSheetsSync}
        syncing={syncing}
      />
      <ProfileSheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        displayName={displayName}
        currency={currency}
      />
      <RestoreBackupSheet open={restoreOpen} onClose={() => setRestoreOpen(false)} />
      <ResetConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
      />
      <PolicySheet
        open={!!policyOpen}
        type={policyOpen}
        onClose={() => setPolicyOpen(null)}
      />

    </div>
  )
}

/* The public surface, unchanged. WebSettings imports these two from
   './pages/Settings' and must keep working. */
/* ── The public surface ──────────────────────────────────────────────────────
   Unchanged by the split, on purpose. Two files import from './pages/Settings'
   - web/pages/WebSettings.jsx for the six managers it reuses, and App.jsx for
   the three route pages - and neither has any business knowing that this file
   stopped being where the code lives.

   Re-exported rather than re-pointed: moving an import is a change to a file
   that did not need one, and the routes are lazy() calls where a wrong path
   fails at runtime rather than at build. */
export { ACCENT_COLORS, buildAndDownloadCSV }
export { CategoriesPage, CategoryManagerSheet }
export { BudgetsPage, BudgetManagerSheet }
export { TemplatesPage, TemplateManagerSheet }
export { ProfileSheet, SheetsConfigSheet }
export { RestoreBackupSheet, ResetConfirmModal }
export { PolicySheet }
