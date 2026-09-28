import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useSyncManager } from '../components/SyncManager'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { IconTemplate, IconInfo, IconWarning, IconRates, IconTrash } from '../components/icons'
import { TRASH_DAYS } from '../db/trash'
import { useAchievements } from '../context/AchievementContext'
import Button from '../components/ui/Button'
import Sheet from '../components/ui/Sheet'
import SectionLabel from '../components/ui/SectionLabel'

/* Everything below used to live in this file. It moved to ./settings/shared so
   the feature modules extracted alongside it could share one SettingsRow
   rather than each growing its own. Re-exported at the bottom, because
   web/pages/WebSettings.jsx imports ACCENT_COLORS and buildAndDownloadCSV from
   here and there is no reason to make it care where they went. */
import {
  APP_VERSION, ACCENT_COLORS, buildAndDownloadCSV, syncedLabel,
  IconTag, IconCloud, IconFileText, IconTarget, IconFeedback, IconLogOut, IconReport, IconShield, IconSliders,
  IconFaceId, SectionHeader, RowDivider, SectionCard, RowIcon, RowChevron, SettingsRow,
} from './settings/shared'
import { ProfileHero, AchievementsCard } from './settings/Top'
import { TemplateManagerSheet, TemplatesPage } from './settings/Templates'
import { CategoryManagerSheet, CategoriesPage } from './settings/Categories'
import { BudgetManagerSheet, BudgetsPage } from './settings/Budgets'
import { RestoreBackupSheet, ResetConfirmModal } from './settings/Backup'
import { DedupeSheet } from './settings/Dedupe'
import { planDedupe } from '../lib/dedupe'
import { SheetsConfigSheet, ProfileSheet } from './settings/Profile'
import { PolicySheet } from './settings/Policy'
import useRates from '../hooks/useRates'
import { rateAge } from '../lib/fx'
import { clearCrashes, crashReport, readCrashes } from '../lib/crashLog'
import { shareOrCopy } from '../lib/share'
import { isSupabaseConfigured } from '../lib/supabase'
import { RemindersRow, RemindersSheet, useReminderSettings } from './settings/Reminders'
import { InstallRow, InstallSheet, useInstallSettings } from './settings/Install'
import { useAppLock } from '../components/lock/LockGate'
import { lockSummary } from '../lib/appLock'

// ── Main Settings page ─────────────────────────────────────────────────────────

/**
 * Settings, as four groups under who you are.
 *
 * ── Why it was reorganised ──
 *
 * It had grown to eight cards and up to seventeen rows, and the groups had
 * stopped meaning anything: Manage held two settings and two places to go,
 * Sync held cloud sync, push reminders and a Sheets bridge, and restoring a
 * backup, resetting the app and signing out each had a card of their own
 * among the things you change every week.
 *
 * So, top to bottom, in the order you come here for them:
 *
 *   you          the profile, centred, and Achievements as the one featured
 *                card - somewhere to go, not a setting
 *   Manage       the shape of your money: categories, limits, templates, and
 *                exchange rates when you hold another currency
 *   App          how Spendr looks and behaves, reminders, and sync
 *   Data & Reports  reports and exports, and backup and restore - each a page,
 *                with the things you rarely do and want to get right inside
 *   Help & About reporting a problem, and the fine print
 *
 * and signing out, quietly, at the foot. Rows say what they are; a second
 * line appears only when it has something live to say.
 */
export default function Settings() {
  const navigate = useNavigate()
  const { theme, style, accentColor } = useTheme()
  const { showToast } = useToast()
  const { user, signOut } = useAuth()
  const { status: syncStatus } = useSyncManager()
  const reminders = useReminderSettings(user)
  const install = useInstallSettings()
  const appLock = useAppLock()

  const [dedupeOpen, setDedupeOpen] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(/** @type {string|null} */ (null))
  /* Read once on mount rather than subscribed to: it is localStorage, not
     Dexie, and a crash while you are sitting on Settings would take this page
     with it anyway. */
  const [crashes, setCrashes] = useState(() => readCrashes())
  const [crashesOpen, setCrashesOpen] = useState(false)
  const [crashNote, setCrashNote] = useState('')
  const [legalOpen, setLegalOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  const meta = useLiveQuery(() => db.meta.toArray(), [], [])
  const displayName = useMemo(() => (meta ?? []).find(m => m.key === 'displayName')?.value ?? '', [meta])
  const currency = useMemo(() => (meta ?? []).find(m => m.key === 'currency')?.value ?? 'PHP', [meta])
  const lastSync = useMemo(() => (meta ?? []).find(m => m.key === 'lastSync')?.value ?? null, [meta])

  /* Rates, and whether this ledger needs any. See hooks/useRates.js. */
  const fx = useRates()

  /* The count the Achievements page shows, from the one evaluation the
     layout already runs - so the two can never disagree. */
  const achievements = useAchievements()

  /* How many rows are stored more than once. Live, because merging them
     should make the row that offers it disappear rather than sit there
     claiming work that is done. planDedupe is pure and runs over three small
     tables, so this costs a pass over a few dozen rows. */
  const dupPlan = useLiveQuery(async () => {
    const [debts, recurring, templates] = await Promise.all([
      db.debts.toArray(), db.recurring.toArray(), db.templates.toArray(),
    ])
    return planDedupe({ debts, recurring, templates })
  }, [], null)
  const dupCount = dupPlan?.total ?? 0
  const trashCount = useLiveQuery(() => db.trash.count(), [], 0)

  const accentName = ACCENT_COLORS.find(c => c.hex === accentColor)?.name ?? 'Custom'
  const syncSub = !user ? 'Off · sign in to sync'
    : syncStatus === 'syncing' ? 'Syncing…'
      : syncStatus === 'error' ? 'The last sync failed'
        : syncedLabel(lastSync)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await signOut()
      // Stay in the app - it works offline without an account.
      setLoggingOut(false)
    } catch (e) {
      console.error('[Settings] logout failed:', e)
      showToast('Sign-out failed', 'error')
      setLoggingOut(false)
    }
  }

  return (
    <div className="pb-10">
      <div className="px-5 pt-safe-header pb-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Settings</h1>
      </div>

      <ProfileHero
        name={displayName || user?.email?.split('@')[0] || 'Your Name'}
        email={user?.email ?? null}
        currency={currency}
        onOpen={() => navigate('/settings/profile')}
      />

      <AchievementsCard state={achievements} onOpen={() => navigate('/achievements')} />

      {/* ══ MANAGE ══ the shape of your money */}
      <div className="mb-8">
        <SectionHeader>Manage</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="amber"><IconTag /></RowIcon>}
            label="Categories"
            right={<RowChevron />}
            onTap={() => navigate('/settings/categories')}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="green"><IconTarget /></RowIcon>}
            label="Budget limits"
            right={<RowChevron />}
            onTap={() => navigate('/settings/budgets')}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="violet"><IconTemplate /></RowIcon>}
            label="Quick templates"
            right={<RowChevron />}
            onTap={() => navigate('/settings/templates')}
          />
          {/* Only for a ledger that holds a foreign account: a peso-only
              ledger has no rate, and telling someone their rates are eight
              days old when nothing on their screen depends on one is noise.
              useRates decides; this only draws it. */}
          {fx.needed && (
            <>
              <RowDivider />
              <SettingsRow
                iconEl={<RowIcon color="teal"><IconRates /></RowIcon>}
                label="Exchange rates"
                sublabel={fx.error
                  ? 'Could not reach the rate service'
                  : fx.table ? `${fx.foreign.join(', ')} · updated ${rateAge(fx.table)}` : `${fx.foreign.join(', ')} · not downloaded yet`}
                right={
                  <span className="flex items-center gap-2">
                    {(fx.stale || fx.error) && (
                      <span className="text-11 font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        {fx.error ? 'retry' : 'stale'}
                      </span>
                    )}
                    <RowChevron />
                  </span>
                }
                onTap={() => navigate('/settings/rates')}
              />
            </>
          )}
        </SectionCard>
      </div>

      {/* ══ APP ══ how Spendr looks and behaves, and keeps in step */}
      <div className="mb-8">
        <SectionHeader>App</SectionHeader>
        <SectionCard>
          {/* Only while there is something to do: gone once Spendr is
              opened from the Home Screen. */}
          {install.shown && (
            <>
              <InstallRow s={install} />
              <RowDivider />
            </>
          )}
          <SettingsRow
            iconEl={<RowIcon color="violet"><IconSliders /></RowIcon>}
            label="Preferences"
            sublabel={[
              theme === 'dark' ? 'Dark' : 'Light',
              style === 'flat' ? (theme === 'dark' ? 'Lights out' : 'Clean') : 'Vivid',
              accentName,
            ].join(' · ')}
            right={<RowChevron />}
            onTap={() => navigate('/settings/preferences')}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="green"><IconFaceId /></RowIcon>}
            label="App lock"
            sublabel={lockSummary(appLock.config)}
            right={<RowChevron />}
            onTap={() => navigate('/settings/app-lock')}
          />
          {/* Push reminders need the server that sends them. */}
          {isSupabaseConfigured && (
            <>
              <RowDivider />
              <RemindersRow r={reminders} />
            </>
          )}
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="blue"><IconCloud /></RowIcon>}
            label="Cloud sync"
            sublabel={syncSub}
            right={<RowChevron />}
            onTap={() => navigate('/settings/sync')}
          />
        </SectionCard>
      </div>

      {/* ══ DATA & REPORTS ══ */}
      <div className="mb-8">
        <SectionHeader>Data & Reports</SectionHeader>
        <SectionCard>
          {/* Only when there is something to do. A permanent "Merge
              duplicates" row on a database with none is a standing
              accusation that something is wrong. */}
          {dupCount > 0 && (
            <>
              <SettingsRow
                iconEl={<RowIcon color="amber"><IconWarning size={16} /></RowIcon>}
                label="Merge duplicates"
                sublabel={`${dupCount} row${dupCount === 1 ? '' : 's'} stored more than once`}
                right={<RowChevron />}
                onTap={() => setDedupeOpen(true)}
              />
              <RowDivider />
            </>
          )}
          <SettingsRow
            iconEl={<RowIcon color="blue"><IconReport /></RowIcon>}
            label="Reports & exports"
            right={<RowChevron />}
            onTap={() => navigate('/settings/reports')}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="teal"><IconShield /></RowIcon>}
            label="Backup & restore"
            right={<RowChevron />}
            onTap={() => navigate('/settings/backup')}
          />
          <RowDivider />
          {/* Deleted transactions, kept thirty days to put back - synced, and
              in backups. Also at the foot of Transactions while it holds
              anything. */}
          <SettingsRow
            iconEl={<RowIcon color="slate"><IconTrash size={16} /></RowIcon>}
            label="Recently deleted"
            sublabel={trashCount ? `${trashCount} deleted, kept ${TRASH_DAYS} days` : 'Empty'}
            right={<RowChevron />}
            onTap={() => navigate('/transactions/deleted')}
          />
        </SectionCard>
      </div>

      {/* ══ HELP & ABOUT ══ */}
      <div className="mb-8">
        <SectionHeader>Help & About</SectionHeader>
        <SectionCard>
          {/* Always here now, not only once something has broken: when you
              want it is when you are telling someone that it did. With a log,
              it says how much is in it. */}
          <SettingsRow
            iconEl={<RowIcon color={crashes.length ? 'red' : 'amber'}><IconFeedback /></RowIcon>}
            label="Report a problem"
            sublabel={crashes.length ? `${crashes.length} error${crashes.length === 1 ? '' : 's'} recorded on this device` : undefined}
            right={<RowChevron />}
            onTap={() => setCrashesOpen(true)}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="slate"><IconFileText /></RowIcon>}
            label="Privacy & terms"
            right={<RowChevron />}
            onTap={() => setLegalOpen(true)}
          />
        </SectionCard>
      </div>

      {user && (
        <div className="px-5 mb-10 flex justify-center">
          <Button variant="dangerTint" className="px-6" onClick={() => setShowSignOutConfirm(true)} disabled={loggingOut}>
            <span className="inline-flex items-center gap-2">
              <IconLogOut size={17} />
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </span>
          </Button>
        </div>
      )}

      {/* ══ Spendr footer (no card) ══ */}
      <div className="px-5 pb-8 flex flex-col items-center gap-3 text-center">
        {/* The mark is transparent: a radius rounds nothing, and a drop shadow
            falls from its bounding box rather than from the shape. */}
        <img src="/icons/icon-192.png" alt="Spendr" width={56} height={56} className="w-14 h-14" />
        <p className="text-base font-bold text-slate-800 dark:text-white tracking-tight">Spendr</p>
        <p className="text-11 text-slate-400 dark:text-slate-500 leading-relaxed max-w-[260px]">
          Spendr is an independent tool and is not affiliated with any financial institutions mentioned within the app.
        </p>
        <p className="text-11 text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} James Sablay · v{APP_VERSION}
          {' · '}
          <button
            type="button"
            onClick={() => navigate('/settings/changelog')}
            className="font-semibold accent-ink underline-offset-2 active:underline"
          >
            Changelog
          </button>
        </p>
      </div>

      {/* ── Sheets ── */}

      {/* Sign out. Rendered unconditionally: the flag going false is what
          starts the exit, and a parent that unmounts on that same render never
          lets the animation play. */}
      <Sheet
        open={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        z={300}
        scrim={60}
        handle={false}
        dismissible={!loggingOut}
        ariaLabel="Sign out"
        footer={(
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => setShowSignOutConfirm(false)} disabled={loggingOut}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={async () => { await handleLogout(); setShowSignOutConfirm(false) }}
              disabled={loggingOut}
            >
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        )}
      >
        <div className="pt-6 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center mx-auto text-red-500 dark:text-white">
            <IconLogOut size={22} />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Sign out?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your data stays on this device. You can sign back in anytime to sync again.
            </p>
          </div>
        </div>
      </Sheet>

      {/* Report a problem: the log if there is one, and the way to send it.
          Everything in it stays on this phone; Send is the only way any of it
          leaves. */}
      <Sheet
        open={crashesOpen}
        onClose={() => { setCrashesOpen(false); setCrashNote('') }}
        /* A height of its own only with a log to scroll: that docks it. With
           nothing in it, it is a short card, and floats like one. */
        maxHeight={crashes.length ? '78dvh' : null}
        title="Report a problem"
        footer={(
          <div className="flex gap-3">
            {crashes.length > 0 && (
              <Button variant="secondary" className="flex-1" onClick={() => { clearCrashes(); setCrashes([]); setCrashesOpen(false) }}>
                Clear
              </Button>
            )}
            <Button
              className="flex-[2]"
              onClick={async () => {
                const body = crashes.length
                  ? crashReport(crashes)
                  : `Spendr problem report · v${APP_VERSION}\n\nWhat happened:\n\n\nWhat you expected:\n\n\n${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`
                const outcome = await shareOrCopy('Spendr problem report', body)
                setCrashNote(outcome === 'copied' ? 'Copied - paste it into a message.'
                  : outcome === 'failed' ? 'Could not copy it on this browser.' : '')
              }}
            >
              {crashes.length ? 'Send the log' : 'Write a report'}
            </Button>
          </div>
        )}
      >
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mb-3">
          {crashes.length
            ? 'Errors Spendr noticed, kept on this device only. Sending them is up to you, and helps whoever fixes the app see what went wrong.'
            : 'Nothing has gone wrong that Spendr noticed. If something still is not right, write a quick report: it opens in a message with the details filled in.'}
        </p>
        {crashNote && (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-3">{crashNote}</p>
        )}
        <div className="flex flex-col gap-2">
          {crashes.map((c, i) => (
            <div key={i} className="px-3.5 py-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04]">
              <p className="text-13 font-semibold text-slate-800 dark:text-white break-words">{c.message}</p>
              <p className="text-11 text-slate-400 dark:text-slate-500 mt-0.5">
                {new Date(c.last).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {' · '}{c.route || '/'}
                {c.count > 1 ? ` · ${c.count} times` : ''}
              </p>
            </div>
          ))}
        </div>
      </Sheet>

      {/* Privacy & terms. ariaLabel rather than title: this panel's heading is
          a small caption, not Sheet's 17px title. */}
      <Sheet open={legalOpen} onClose={() => setLegalOpen(false)} z={100} scrim={45} ariaLabel="Privacy and terms">
        <div className="pb-1">
          <SectionLabel inset="none" gap="loose">Privacy & terms</SectionLabel>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setLegalOpen(false); setTimeout(() => setPolicyOpen('privacy'), 60) }}
              className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left bg-slate-50 dark:bg-white/[0.04] active:bg-slate-100 dark:active:bg-white/[0.08] transition-colors"
            >
              <RowIcon color="slate"><IconFileText /></RowIcon>
              <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-white">Privacy policy</span>
              <RowChevron />
            </button>
            <button
              onClick={() => { setLegalOpen(false); setTimeout(() => setPolicyOpen('terms'), 60) }}
              className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left bg-slate-50 dark:bg-white/[0.04] active:bg-slate-100 dark:active:bg-white/[0.08] transition-colors"
            >
              <RowIcon color="slate"><IconInfo /></RowIcon>
              <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-white">Terms of use</span>
              <RowChevron />
            </button>
          </div>
        </div>
      </Sheet>

      <DedupeSheet open={dedupeOpen} onClose={() => setDedupeOpen(false)} />
      <PolicySheet open={!!policyOpen} type={policyOpen} onClose={() => setPolicyOpen(null)} />
      {isSupabaseConfigured && <RemindersSheet r={reminders} />}
      <InstallSheet s={install} />
    </div>
  )
}

/* ── The public surface ──────────────────────────────────────────────────────
   Unchanged by the reorganisation, on purpose. Two files import from
   './pages/Settings' - web/pages/WebSettings.jsx for the managers it reuses,
   and App.jsx for the route pages - and neither has any business knowing that
   this file stopped being where the code lives. */
export { ACCENT_COLORS, buildAndDownloadCSV }
export { CategoriesPage, CategoryManagerSheet }
export { BudgetsPage, BudgetManagerSheet }
export { TemplatesPage, TemplateManagerSheet }
export { ProfileSheet, SheetsConfigSheet }
export { RestoreBackupSheet, ResetConfirmModal }
export { PolicySheet }
