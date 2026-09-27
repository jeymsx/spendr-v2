import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useSyncManager } from '../../components/SyncManager'
import SubPage from '../../components/SubPage'
import Button from '../../components/ui/Button'
import { syncToSheets } from '../../lib/sheetsSync'
import { SheetsConfigSheet } from './Profile'
import {
  IconCloud, IconSheets, IconSyncing, RowIcon, SectionCard, SectionHeader, SettingsRow, syncedLabel,
} from './shared'

/* The Sheets bridge is the owner's own Apps Script: nobody else has one to
   point it at, so it is offered to that account only - as it always was,
   when it sat in Settings' Sync section. */
const SHEETS_OWNER = 'sablayjames@gmail.com'

/**
 * Cloud sync: whether this device is signed in, when it last synced, and the
 * one button that syncs now. It was a section on Settings holding three
 * unrelated rows - sync, push reminders and Google Sheets - and moved here
 * with the one that belongs to it; reminders went to the App group.
 *
 * Signed out, the page is the case for signing in, and the way to - the app
 * works fully offline either way, and says so.
 */
export default function SyncPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const { status, runSync } = useSyncManager()
  const meta = useLiveQuery(() => db.meta.toArray(), [], [])
  const read = (/** @type {string} */ key) => (meta ?? []).find(m => m.key === key)?.value ?? null
  const lastSync = read('lastSync')
  const sheetsUrl = read('sheetsUrl')
  const sheetsLast = read('sheetsLastSynced')
  const [sheetsOpen, setSheetsOpen] = useState(false)
  const [sheetsBusy, setSheetsBusy] = useState(false)

  const state = useMemo(() => {
    if (status === 'syncing') return { text: 'Syncing…', dot: 'bg-primary animate-pulse' }
    if (status === 'error') return { text: 'The last sync failed', dot: 'bg-red-400' }
    if (lastSync) return { text: syncedLabel(lastSync), dot: 'bg-emerald-400' }
    return { text: 'Not synced yet', dot: 'bg-slate-300 dark:bg-slate-600' }
  }, [status, lastSync])

  async function syncSheets(/** @type {string} */ url) {
    if (sheetsBusy) return
    setSheetsBusy(true)
    try {
      const { txCount, accountCount } = await syncToSheets(url)
      await db.meta.put({ key: 'sheetsLastSynced', value: new Date().toISOString() })
      showToast(`Synced ${txCount} transactions & ${accountCount} accounts to Google Sheets`, 'success')
    } catch (e) {
      showToast('Sync failed: ' + (/** @type {any} */ (e)?.message ?? e), 'error')
    } finally {
      setSheetsBusy(false)
    }
  }

  return (
    <SubPage title="Cloud sync">
      <div className="mx-5 mt-2 mb-8 card rounded-2xl px-5 py-6 flex flex-col items-center text-center">
        <span className="scale-[1.35] my-2"><RowIcon color="blue"><IconCloud /></RowIcon></span>
        {user ? (
          <>
            <p className="mt-4 text-17 font-semibold text-slate-900 dark:text-white">Sync is on</p>
            <p className="mt-1 flex items-center justify-center gap-2 text-13 text-slate-500 dark:text-slate-400">
              <span className={`w-2 h-2 rounded-full shrink-0 ${state.dot}`} aria-hidden="true" />
              {state.text}
            </p>
            <p className="mt-0.5 max-w-full truncate text-12 text-slate-400 dark:text-slate-500">{user.email}</p>
            <Button className="mt-5 px-6" onClick={() => runSync()} disabled={status === 'syncing'}>
              <span className="inline-flex items-center gap-2">
                <span className={status === 'syncing' ? 'animate-spin inline-flex' : 'inline-flex'}><IconSyncing size={16} /></span>
                {status === 'syncing' ? 'Syncing…' : 'Sync now'}
              </span>
            </Button>
          </>
        ) : (
          <>
            <p className="mt-4 text-17 font-semibold text-slate-900 dark:text-white">Your money, on every device</p>
            <p className="mt-1.5 text-13 leading-relaxed text-slate-500 dark:text-slate-400 text-balance">
              Sign in with Google to back up your data and sync it between devices. Spendr works fully offline either way.
            </p>
            <Button className="mt-5 px-6" onClick={() => navigate('/login')}>Sign in with Google</Button>
          </>
        )}
      </div>

      {user?.email === SHEETS_OWNER && (
        <div className="mb-8">
          <SectionHeader>Integrations</SectionHeader>
          <SectionCard>
            <SettingsRow
              iconEl={<RowIcon color="green"><span className={sheetsBusy ? 'animate-spin inline-flex' : 'inline-flex'}><IconSheets /></span></RowIcon>}
              label="Google Sheets"
              sublabel={sheetsBusy ? 'Syncing…' : sheetsLast ? syncedLabel(sheetsLast) : sheetsUrl ? 'Ready to sync' : 'Not set up'}
              right={
                <Button size="sm" variant="tint" className="px-4" onClick={() => (sheetsUrl ? syncSheets(sheetsUrl) : setSheetsOpen(true))} disabled={sheetsBusy}>
                  {sheetsUrl ? 'Sync' : 'Set up'}
                </Button>
              }
            />
          </SectionCard>
        </div>
      )}

      <SheetsConfigSheet open={sheetsOpen} onClose={() => setSheetsOpen(false)} onSync={syncSheets} syncing={sheetsBusy} />
    </SubPage>
  )
}
