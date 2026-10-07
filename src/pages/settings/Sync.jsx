import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useAuth } from '../../context/AuthContext'
import { useSyncManager } from '../../components/SyncManager'
import SubPage from '../../components/SubPage'
import Button from '../../components/ui/Button'
import EmptyState, { EmptyArt } from '../../components/ui/EmptyState'
import { IconSyncing, syncedLabel } from './shared'

/**
 * Cloud sync: whether this device is signed in, when it last synced, and the
 * one button that syncs now. It was a section on Settings holding unrelated
 * rows, and moved here with the one that belongs to it; reminders went to
 * the App group.
 *
 * Signed out, the page is the case for signing in, and the way to - the app
 * works fully offline either way, and says so. It is drawn as the app's
 * other empty pages are, a glass picture over a line and a button: nothing is
 * synced yet, and this is the way out of that. Signed in, the same cloud
 * heads the card that says how sync is going.
 */
export default function SyncPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { status, runSync } = useSyncManager()
  const meta = useLiveQuery(() => db.meta.toArray(), [], [])
  const read = (/** @type {string} */ key) => (meta ?? []).find(m => m.key === key)?.value ?? null
  const lastSync = read('lastSync')

  const state = useMemo(() => {
    if (status === 'syncing') return { text: 'Syncing…', dot: 'bg-primary animate-pulse' }
    if (status === 'error') return { text: 'The last sync failed', dot: 'bg-red-400' }
    if (lastSync) return { text: syncedLabel(lastSync), dot: 'bg-emerald-400' }
    return { text: 'Not synced yet', dot: 'bg-slate-300 dark:bg-slate-600' }
  }, [status, lastSync])

  return (
    <SubPage title="Cloud sync">
      {user ? (
        <div className="mx-5 mt-2 mb-8 card rounded-2xl px-5 py-6 flex flex-col items-center text-center">
          <EmptyArt name="cloud" size={80} />
          <p className="mt-2 text-17 font-semibold text-slate-900 dark:text-white">Sync is on</p>
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
        </div>
      ) : (
        <EmptyState
          className="mt-6"
          art="cloud"
          title="Your money, on every device"
          body="Sign in with Google to back up and sync between devices. Spendr works offline either way."
          action={<Button className="px-6" onClick={() => navigate('/login')}>Sign in with Google</Button>}
        />
      )}
    </SubPage>
  )
}
