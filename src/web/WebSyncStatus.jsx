import { useNavigate } from 'react-router-dom'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useAuth } from '../context/AuthContext'
import { useSyncManager } from '../components/SyncManager'
import { syncedLabel } from '../pages/settings/shared'

/**
 * Where the ledger stands with the cloud, at the foot of the sidebar - the
 * desktop's pull-to-refresh. The phone syncs when you pull its page down;
 * a desktop has no pull, so it says when it last synced and a click syncs
 * now. Signed out, it goes to where you sign in.
 */
export default function WebSyncStatus() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { status, runSync } = useSyncManager()
  const lastSync = useLiveQuery(async () => (await db.meta.get('lastSync'))?.value ?? null, [], null)

  const signedIn = !!user?.id
  const syncing = status === 'syncing'
  const text = !signedIn ? 'Sign in to sync'
    : syncing ? 'Syncing…'
    : status === 'error' ? "Couldn't sync, try again"
    : lastSync ? syncedLabel(lastSync) : 'Sync now'
  const dot = !signedIn ? 'bg-slate-400' : syncing ? 'bg-primary animate-pulse' : status === 'error' ? 'bg-red-500' : 'bg-emerald-500'

  return (
    <button
      type="button"
      disabled={syncing}
      onClick={() => (signedIn ? runSync() : navigate('/settings/sync'))}
      className="web-nav-item web-nav-item-quiet"
      title={signedIn ? 'Sync now' : 'Sign in to sync'}
    >
      <span className="web-nav-icon flex items-center justify-center" aria-hidden="true">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
      </span>
      <span className="flex-1 truncate text-left">{text}</span>
    </button>
  )
}
