import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { storageKept } from '../../lib/keepStorage'
import { useToast } from '../../context/ToastContext'
import SubPage from '../../components/SubPage'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import { IconUpload } from '../../components/icons'
import { downloadBackupJson, LAST_BACKUP_KEY } from '../../lib/backup'
import { RestoreBackupSheet, ResetConfirmModal } from './Backup'
import {
  IconDatabase, IconDownload, IconShield, IconTrash, RowChevron, RowDivider, RowIcon, SectionCard, SectionHeader, SettingsRow,
} from './shared'

/**
 * Backup & restore: everything that moves your data in or out of this device
 * whole - a backup file, a restore from one, an import from a spreadsheet -
 * and, last and on its own, starting over.
 *
 * On Settings these were four rows and a Danger zone card among the things
 * you change every week. They are things you do rarely and want to get
 * right, so they have a page, and the one that cannot be undone is at the
 * foot of it, behind its own two confirmations.
 */
export default function BackupRestorePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  // When the last file was saved here, and whether the browser keeps the data.
  const lastBackup = useLiveQuery(async () => (await db.meta.get(LAST_BACKUP_KEY))?.value ?? null, [], null)
  const [kept, setKept] = useState(/** @type {boolean|null} */ (null))
  useEffect(() => { storageKept().then(setKept) }, [])
  // A date that does not read as one is as good as none: never "Last one Invalid Date".
  const lastAt = lastBackup ? new Date(lastBackup) : null
  const lastLine = lastAt && Number.isFinite(lastAt.getTime())
    ? `Last one ${lastAt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'None saved on this device yet'

  async function backup() {
    if (busy) return
    setBusy(true)
    try {
      await downloadBackupJson()
      showToast('Backup downloaded')
    } catch (e) {
      console.error('[Backup] failed:', e)
      showToast('Backup failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SubPage title="Backup & restore">
      <p className="mx-5 mt-1 mb-5 text-13 leading-relaxed text-slate-500 dark:text-slate-400 text-center text-balance">
        A backup is one file with everything in it. Keep it somewhere safe: restoring it puts this device back exactly as it was.
      </p>

      <div className="mb-8">
        <SectionHeader>Backup</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="teal"><IconShield /></RowIcon>}
            label="Download a backup"
            sublabel={busy ? 'Preparing download…' : lastLine}
            right={busy ? <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <RowChevron />}
            onTap={() => setConfirm(true)}
            disabled={busy}
          />
          <RowDivider />
          <SettingsRow
            iconEl={<RowIcon color="amber"><IconUpload /></RowIcon>}
            label="Restore from a backup"
            sublabel="Replaces what is on this device"
            right={<RowChevron />}
            onTap={() => setRestoreOpen(true)}
          />
        </SectionCard>
        {kept !== null && (
          <p className="mx-5 mt-2 text-12 text-slate-500 dark:text-slate-400">
            {kept
              ? 'This browser keeps your data unless you clear it.'
              : 'This browser may clear your data if the phone runs low on space, so keep a backup.'}
          </p>
        )}
      </div>

      <div className="mb-8">
        <SectionHeader>Import</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="green"><IconDatabase /></RowIcon>}
            label="Import transactions"
            sublabel="From a CSV file"
            right={<RowChevron />}
            onTap={() => navigate('/import')}
          />
        </SectionCard>
      </div>

      <div className="mb-8">
        <SectionHeader>Start over</SectionHeader>
        <SectionCard>
          <SettingsRow
            iconEl={<RowIcon color="red"><IconTrash /></RowIcon>}
            label="Reset app"
            sublabel="Erase everything on this device"
            right={<RowChevron />}
            onTap={() => setResetOpen(true)}
            destructive
          />
        </SectionCard>
      </div>

      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        z={300}
        scrim={60}
        handle={false}
        ariaLabel="Download a backup"
        footer={(
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button size="sm" className="flex-1" onClick={() => { setConfirm(false); backup() }}>Download</Button>
          </div>
        )}
      >
        <div className="pt-6 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center mx-auto text-teal-600 dark:text-white">
            <IconDownload />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Download a backup?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Saves everything you have: accounts, transactions, categories, templates, bills, debts, goals and settings, in one file.
            </p>
          </div>
        </div>
      </Sheet>
      <RestoreBackupSheet open={restoreOpen} onClose={() => setRestoreOpen(false)} />
      <ResetConfirmModal open={resetOpen} onClose={() => setResetOpen(false)} />
    </SubPage>
  )
}
