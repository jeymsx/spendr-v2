import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useAchievements } from '../../context/AchievementContext'
import { useSyncManager } from '../../components/SyncManager'
import { useAppLock } from '../../components/lock/LockGate'
import useRates from '../../hooks/useRates'
import { lockSummary } from '../../lib/appLock'
import { rateAge } from '../../lib/fx'
import { fmtCompact } from '../../lib/money'
import { planDedupe } from '../../lib/dedupe'
import { LAST_BACKUP_KEY } from '../../lib/backup'
import { clearCrashes, crashReport, readCrashes } from '../../lib/crashLog'
import { useIsDeveloper } from '../../hooks/useIsDeveloper'
import { shareOrCopy } from '../../lib/share'
import { isSupabaseConfigured } from '../../lib/supabase'
import { APP_VERSION } from '../../lib/release'
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from '../../lib/policy'
import { TRASH_DAYS } from '../../db/trash'
import { ACCENT_COLORS, ProfileAvatar, RowIcon, syncedLabel } from '../../pages/settings/shared'
import { DedupeSheet } from '../../pages/settings/Dedupe'
import { RemindersSheet, sublabelFor, useReminderSettings } from '../../pages/settings/Reminders'
import { InstallSheet, useInstallSettings } from '../../pages/settings/Install'
import Btn from '../ui/Button'
import Dialog from '../ui/Dialog'
import { Progress } from '../ui/display'
import {
  IBell, IChevronRight, ICopy, IDownload, IEdit, IFileText, IGauge, IGlobe, IInfo, ILock, ILogOut, IMessage, IMonitor,
  IPalette, IRefresh, IShield, ISliders, ISparkle, ITag, ITrash, ITrophy, IZap,
} from '../ui/icons'

/**
 * Settings' first page on a computer: who you are, and every setting's
 * current value at a glance - the way a desktop app's account page is laid
 * out, not a phone's list of rows.
 *
 * Under your profile, one list: the sections the column at the left names -
 * App, Money, Data - each setting on a line with where it stands now at the
 * right (Light · Vivid, Locks after 5 min, 8 set · ₱15.4K a month, Last one
 * Oct 2), opening its page; then what has no page of its own, each with its
 * button - what this device can do, and help and the fine print. One panel
 * read down, as a form is, rather than a card per setting.
 *
 * The phone's Settings page (pages/Settings) holds the same things as rows;
 * the hooks and sheets are its own (settings/Install, settings/Reminders,
 * settings/Dedupe, settings/Policy), so the two cannot drift on what a
 * setting does - only on how it is shown. Report a problem and Sign out are
 * the desktop's dialogs over the same logic.
 */
export default function WebSettingsOverview() {
  const navigate = useNavigate()
  const { theme, style, accentColor } = useTheme()
  const { user, signOut } = useAuth()
  const { showToast } = useToast()
  const { status: syncStatus } = useSyncManager()
  const reminders = useReminderSettings(user)
  const install = useInstallSettings()
  const appLock = useAppLock()
  const fx = useRates()
  const achievements = useAchievements()
  // The error log and the way to send it are for the developer (lib/developer.js).
  const developer = useIsDeveloper()

  const meta = useLiveQuery(() => db.meta.toArray(), [], [])
  const read = (/** @type {string} */ key) => (meta ?? []).find(m => m.key === key)?.value ?? null
  const categories = useLiveQuery(() => db.categories.toArray(), [], undefined)
  const templateCount = useLiveQuery(() => db.templates.count(), [], undefined)
  const trashCount = useLiveQuery(() => db.trash.count(), [], 0)
  const dupPlan = useLiveQuery(async () => {
    const [debts, recurring, templates] = await Promise.all([db.debts.toArray(), db.recurring.toArray(), db.templates.toArray()])
    return planDedupe({ debts, recurring, templates })
  }, [], null)
  const dupCount = dupPlan?.total ?? 0

  const [dedupeOpen, setDedupeOpen] = useState(false)
  const [crashes, setCrashes] = useState(() => readCrashes())
  const [crashesOpen, setCrashesOpen] = useState(false)
  const [crashNote, setCrashNote] = useState('')
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const closeCrashes = useCallback(() => { setCrashesOpen(false); setCrashNote('') }, [])
  const closeSignOut = useCallback(() => setSignOutOpen(false), [])

  const name = read('displayName') || user?.email?.split('@')[0] || 'Your Name'
  const currency = read('currency') ?? 'PHP'
  const letter = (name || 'S').trim().charAt(0).toUpperCase() || 'S'

  const accent = ACCENT_COLORS.find(c => c.hex.toLowerCase() === String(accentColor).toLowerCase())
  const lastSync = read('lastSync')
  const sync = !user ? { text: 'Off', dot: 'bg-slate-300 dark:bg-slate-600', tone: '' }
    : syncStatus === 'syncing' ? { text: 'Syncing…', dot: 'bg-primary animate-pulse', tone: '' }
      : syncStatus === 'error' ? { text: 'The last sync failed', dot: 'bg-red-400', tone: 'd-neg' }
        : { text: syncedLabel(lastSync), dot: lastSync ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600', tone: '' }

  const money = useMemo(() => {
    const list = categories ?? []
    const spending = list.filter(c => c.type === 'expense')
    const limited = spending.filter(c => (c.budget ?? 0) > 0)
    return {
      spending: spending.length,
      income: list.length - spending.length,
      limits: limited.length,
      limitTotal: limited.reduce((n, c) => n + (c.budget ?? 0), 0),
    }
  }, [categories])

  const backupAt = read(LAST_BACKUP_KEY) ? new Date(read(LAST_BACKUP_KEY)) : null
  const backupLine = backupAt && Number.isFinite(backupAt.getTime())
    ? `Last one ${backupAt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
    : 'None saved yet'

  const rates = !fx.needed ? { text: `All in ${currency}`, tone: '' }
    : fx.error ? { text: 'Could not update', tone: 'd-warn' }
      : fx.table ? { text: `Updated ${rateAge(fx.table)}`, tone: fx.stale ? 'd-warn' : '' }
        : { text: 'Not downloaded yet', tone: 'd-warn' }

  const counted = achievements && !achievements.loading
  const earnedPct = counted && achievements.total ? (achievements.earnedCount / achievements.total) * 100 : 0

  const device = [
    install.shown && (
      <ActionRow key="install" icon={<IMonitor size={17} />} label="Install Spendr"
        sub={install.context === 'in-app' ? 'Open it in your browser first' : 'Open it in a window of its own'}>
        <Btn size="sm" onClick={install.tap}>Install</Btn>
      </ActionRow>
    ),
    isSupabaseConfigured && (
      <ActionRow key="reminders" icon={<IBell size={17} />} label="Reminders" sub={sublabelFor(reminders)}>
        <Btn size="sm" onClick={() => reminders.setOpen(true)}>{reminders.on ? 'Manage' : 'Set up'}</Btn>
      </ActionRow>
    ),
    dupCount > 0 && (
      <ActionRow key="dupes" icon={<ICopy size={17} />} label="Merge duplicates"
        sub={`${dupCount} row${dupCount === 1 ? '' : 's'} stored more than once`}>
        <Btn size="sm" onClick={() => setDedupeOpen(true)}>Review</Btn>
      </ActionRow>
    ),
  ].filter(Boolean)

  async function sendReport() {
    const body = crashes.length
      ? crashReport(crashes)
      : `Spendr problem report · v${APP_VERSION}\n\nWhat happened:\n\n\nWhat you expected:\n\n\n${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`
    const outcome = await shareOrCopy('Spendr problem report', body)
    setCrashNote(outcome === 'copied' ? 'Copied - paste it into a message.' : outcome === 'failed' ? 'Could not copy it on this browser.' : '')
  }

  async function doSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      setSignOutOpen(false)
    } catch (e) {
      console.error('[Settings] sign-out failed:', e)
      showToast('Sign-out failed', 'error')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="pb-2">
      {/* ── You ── */}
      <section className="mx-5 d-panel d-set-profile overflow-hidden" aria-label="Profile">
        <div className="d-set-profile-row">
          <ProfileAvatar letter={letter} size={64} />
          <div className="min-w-0">
            <div className="d-set-name truncate">{name}</div>
            <div className="mt-1.5 flex items-center gap-2 min-w-0 text-14 text-[var(--d-text-2)]">
              <span className="d-badge d-badge-accent shrink-0">{currency}</span>
              <span className="truncate">{user?.email ?? 'Not signed in · kept on this device'}</span>
            </div>
          </div>
          <div className="d-set-profile-actions">
            <Btn icon={<IEdit size={15} />} onClick={() => navigate('/settings/profile')}>Edit profile</Btn>
            {user
              ? <Btn variant="danger" icon={<ILogOut size={15} />} onClick={() => setSignOutOpen(true)}>Sign out</Btn>
              : <Btn variant="primary" onClick={() => navigate('/login')}>Sign in</Btn>}
          </div>
        </div>
        <button type="button" className="d-set-ach" onClick={() => navigate('/achievements')}>
          <RowIcon color="violet"><ITrophy size={18} /></RowIcon>
          <span className="min-w-0 shrink-0">
            <span className="block text-14 font-semibold text-[var(--d-text)]">Achievements</span>
            <span className="block text-13 text-[var(--d-text-3)] d-num">
              {counted ? `${achievements.earnedCount} of ${achievements.total} earned` : 'Challenges, milestones and badges'}
            </span>
          </span>
          <Progress className="flex-1 min-w-[48px] max-w-[280px] ml-auto" value={earnedPct} />
          <IChevronRight size={16} className="text-[var(--d-text-3)]" />
        </button>
      </section>

      {/* ── Every section and where it stands, in one list ── */}
      <div className="mx-5 mt-6 d-panel d-set-list">
        <Section title="App" note="How Spendr looks, locks and syncs.">
          <LinkRow icon={<ISliders size={17} />} label="Appearance" to="/settings/preferences"
            value={`${theme === 'dark' ? 'Dark' : 'Light'} · ${style === 'flat' ? (theme === 'dark' ? 'Lights out' : 'Clean') : 'Vivid'}`} />
          <LinkRow icon={<IPalette size={17} />} label="Accent colour" to="/settings/accent"
            value={<><span className="d-set-swatch" style={{ background: accentColor }} aria-hidden="true" /><span className="truncate">{accent?.name ?? 'Custom'}</span></>} />
          <LinkRow icon={<ILock size={17} />} label="App lock" to="/settings/preferences#app-lock" value={lockSummary(appLock.config)} />
          <LinkRow icon={<IRefresh size={17} />} label="Cloud sync" to="/settings/sync" valueTone={sync.tone}
            value={<><span className={`w-2 h-2 rounded-full shrink-0 ${sync.dot}`} aria-hidden="true" /><span className="truncate">{sync.text}</span></>} />
        </Section>

        <Section title="Money" note="How your money is sorted and capped.">
          <LinkRow icon={<ITag size={17} />} label="Categories" to="/settings/categories"
            value={categories === undefined ? '' : `${money.spending} spending · ${money.income} income`} />
          <LinkRow icon={<IGauge size={17} />} label="Budget limits" to="/settings/budgets"
            value={categories === undefined ? '' : money.limits ? `${money.limits} set · ${fmtCompact(money.limitTotal)} a month` : 'None set'} />
          <LinkRow icon={<IZap size={17} />} label="Quick templates" to="/settings/templates"
            value={templateCount === undefined ? '' : templateCount ? `${templateCount} saved` : 'None yet'} />
          <LinkRow icon={<IGlobe size={17} />} label="Exchange rates" to="/settings/rates" value={rates.text} valueTone={rates.tone} />
        </Section>

        <Section title="Data" note="Reports, backups and what you deleted.">
          <LinkRow icon={<IDownload size={17} />} label="Reports & exports" to="/settings/reports" value="Monthly report, spreadsheet, CSV" />
          <LinkRow icon={<IShield size={17} />} label="Backup & restore" to="/settings/backup" value={backupLine} />
          <LinkRow icon={<ITrash size={17} />} label="Recently deleted" to="/settings/deleted"
            value={trashCount ? `${trashCount} kept ${TRASH_DAYS} days` : 'Empty'} />
          <LinkRow icon={<ISparkle size={17} />} label="What’s new" to="/settings/changelog" value={`Version ${APP_VERSION}`} />
        </Section>

        {device.length > 0 && <Section title="This device" note="What this browser can do.">{device}</Section>}

        <Section title="Help & about" note={developer ? 'Problems, and the fine print.' : 'The fine print.'}>
          {developer && (
            <ActionRow icon={<IMessage size={17} />} label="Report a problem"
              sub={crashes.length ? `${crashes.length} error${crashes.length === 1 ? '' : 's'} recorded on this device` : 'Write one with the details filled in'}>
              <Btn size="sm" onClick={() => setCrashesOpen(true)}>Report</Btn>
            </ActionRow>
          )}
          <LinkRow icon={<IFileText size={17} />} label="Privacy policy" to="/settings/privacy" value={updatedLine(PRIVACY_SECTIONS)} />
          <LinkRow icon={<IInfo size={17} />} label="Terms of use" to="/settings/terms" value={updatedLine(TERMS_SECTIONS)} />
        </Section>
      </div>

      <footer className="mx-5 mt-10 mb-4 flex flex-col items-center gap-2 text-center">
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="w-10 h-10" />
        <p className="text-13 text-[var(--d-text-2)]">
          <span className="font-semibold text-[var(--d-text)]">Spendr {APP_VERSION}</span> · © {new Date().getFullYear()} James Sablay
        </p>
        <p className="max-w-[420px] text-12 leading-relaxed text-[var(--d-text-3)]">
          Spendr is an independent tool and is not affiliated with any financial institutions mentioned within the app.
        </p>
      </footer>

      <Dialog
        open={developer && crashesOpen}
        onClose={closeCrashes}
        title="Report a problem"
        width={480}
        actions={(
          <>
            {crashes.length > 0 && <Btn onClick={() => { clearCrashes(); setCrashes([]); closeCrashes() }}>Clear</Btn>}
            <Btn variant="primary" data-autofocus onClick={sendReport}>{crashes.length ? 'Send the log' : 'Write a report'}</Btn>
          </>
        )}
      >
        <p>
          {crashes.length
            ? 'Errors Spendr noticed, kept on this device only. Sending them is up to you, and helps whoever fixes the app see what went wrong.'
            : 'Nothing has gone wrong that Spendr noticed. If something still is not right, write a quick report: it opens with the details filled in.'}
        </p>
        {crashNote && <p className="mt-3 font-medium d-pos">{crashNote}</p>}
        {crashes.length > 0 && (
          <div className="mt-3 max-h-[300px] overflow-y-auto flex flex-col gap-2">
            {crashes.map((c, i) => (
              <div key={i} className="px-3.5 py-3 rounded-2xl bg-[var(--d-subtle)] border border-[var(--d-border)]">
                <p className="text-13 font-semibold text-[var(--d-text)] break-words">{c.message}</p>
                <p className="text-12 text-[var(--d-text-3)] mt-0.5">
                  {new Date(c.last).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {' · '}{c.route || '/'}
                  {c.count > 1 ? ` · ${c.count} times` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </Dialog>

      <Dialog
        open={signOutOpen}
        onClose={closeSignOut}
        title="Sign out?"
        actions={(
          <>
            <Btn onClick={closeSignOut} disabled={signingOut}>Cancel</Btn>
            <Btn variant="danger-solid" data-autofocus onClick={doSignOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</Btn>
          </>
        )}
      >
        Your data stays on this device. You can sign back in anytime to sync again.
      </Dialog>

      <DedupeSheet open={dedupeOpen} onClose={() => setDedupeOpen(false)} />
      {isSupabaseConfigured && <RemindersSheet r={reminders} />}
      <InstallSheet s={install} />
    </div>
  )
}

/** "Updated September 2026", from a policy's untitled first entry. @param {Array<{h: string|null, b: string}>} sections */
function updatedLine(sections) {
  const m = /Last updated: ([^.]+)/.exec(sections.find(x => x.h === null)?.b ?? '')
  return m ? `Updated ${m[1]}` : ''
}

/**
 * A section of the list: its name and a line on what it holds at the left,
 * its rows at the right - or, in a narrow pane, the name over the rows.
 *
 * @param {{title: string, note?: string, children: import('react').ReactNode}} props
 */
function Section({ title, note, children }) {
  return (
    <section className="d-set-section" aria-label={title}>
      <div className="d-set-section-head">
        <h3 className="d-set-section-title">{title}</h3>
        {note && <p className="d-set-section-note">{note}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

/**
 * A setting with a page: its name, where it stands now at the right, and the
 * whole row opens it.
 *
 * @param {{icon: import('react').ReactNode, label: string, value: import('react').ReactNode, valueTone?: string, to: string}} props
 */
function LinkRow({ icon, label, value, valueTone = '', to }) {
  const navigate = useNavigate()
  return (
    <button type="button" className="d-set-line" onClick={() => navigate(to)}>
      <span className="d-set-line-icon">{icon}</span>
      <span className="d-set-line-label">{label}</span>
      <span className={`d-set-line-value ${valueTone}`}>{typeof value === 'string' ? <span className="truncate">{value}</span> : value}</span>
      <IChevronRight size={15} className="d-set-line-go" />
    </button>
  )
}

/**
 * Something done from here rather than a page: its name, a line under it,
 * and the button that does it.
 *
 * @param {{icon: import('react').ReactNode, label: string, sub?: string, children?: import('react').ReactNode}} props
 */
function ActionRow({ icon, label, sub, children }) {
  return (
    <div className="d-set-line">
      <span className="d-set-line-icon">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block truncate d-set-line-label">{label}</span>
        {sub && <span className="block truncate d-set-line-sub">{sub}</span>}
      </span>
      <span className="flex items-center gap-2 shrink-0">{children}</span>
    </div>
  )
}
